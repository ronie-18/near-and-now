/**
 * Recording fake for the Supabase query builder, for regression tests that need
 * to assert not just a function's result but *which* reads/writes it issued and
 * with which filters (e.g. "the status guard is on the update", "nothing was
 * written after the guard rejected").
 *
 * Install with `installFakeSupabase(client, responder)`: every `client.from(t)`
 * chain is recorded as one `Call` when it is awaited (or reaches
 * `.single()`/`.maybeSingle()`), and resolves to whatever `responder` returns
 * for it ({ data: null, error: null } by default). Like the real client, a
 * chain that is never awaited is never executed — and never recorded.
 */

export type Op = 'select' | 'update' | 'insert' | 'upsert' | 'delete';

export interface Call {
  table: string;
  op: Op;
  columns?: string;
  payload?: unknown;
  filters: Array<[string, ...unknown[]]>;
  terminal: 'single' | 'maybeSingle' | null;
}

export type Result = { data: unknown; error: unknown };
export type Responder = (call: Call) => Result | undefined;

const FILTER_METHODS = [
  'eq', 'neq', 'in', 'not', 'is', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'or',
  'match', 'contains', 'order', 'limit', 'range',
] as const;

export interface FakeOptions {
  /**
   * Opt-in simulated round trip. When set, every query/rpc resolves after this
   * many ms (real timers) instead of immediately, and `roundTrips()` reports
   * the longest chain of calls that had to wait for one another — i.e. how
   * many sequential database round trips the code under test makes. Calls
   * started together (Promise.all) share a level; a call started after
   * another one finished is one level deeper. Default: immediate, no tracking.
   */
  latencyMs?: number;
}

export function installFakeSupabase(client: unknown, responder: Responder = () => undefined, options: FakeOptions = {}) {
  const calls: Call[] = [];
  // Round-trip depth tracking (only meaningful with options.latencyMs).
  let deepestFinished = 0;
  let deepest = 0;
  const settle = (result: Result): Promise<Result> => {
    if (!options.latencyMs) return Promise.resolve(result);
    const depth = deepestFinished + 1;
    deepest = Math.max(deepest, depth);
    return new Promise((resolve) =>
      setTimeout(() => {
        deepestFinished = Math.max(deepestFinished, depth);
        resolve(result);
      }, options.latencyMs)
    );
  };

  const from = (table: string) => {
    const call: Call = { table, op: 'select', filters: [], terminal: null };
    let writeOp = false;
    const run = (): Promise<Result> => {
      calls.push(call);
      const result = responder(call) ?? { data: null, error: null };
      // Mirror PostgREST's row-count rules when the responder hands back rows
      // for a .single()/.maybeSingle() — several real bugs were exactly
      // "maybeSingle() errored on 2 rows and the error was ignored".
      if (call.terminal && Array.isArray(result.data) && !result.error) {
        const rows = result.data;
        if (rows.length === 1) return settle({ data: rows[0], error: null });
        if (rows.length === 0 && call.terminal === 'maybeSingle') return settle({ data: null, error: null });
        return settle({
          data: null,
          error: { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned (${rows.length})` },
        });
      }
      return settle(result);
    };
    const builder: Record<string, unknown> = {};
    builder.select = (columns?: string) => {
      call.columns = columns;
      if (!writeOp) call.op = 'select';
      return builder;
    };
    for (const op of ['update', 'insert', 'upsert', 'delete'] as const) {
      builder[op] = (payload?: unknown) => {
        call.op = op;
        call.payload = payload;
        writeOp = true;
        return builder;
      };
    }
    for (const m of FILTER_METHODS) {
      builder[m] = (...args: unknown[]) => {
        call.filters.push([m, ...args]);
        return builder;
      };
    }
    builder.single = () => { call.terminal = 'single'; return run(); };
    builder.maybeSingle = () => { call.terminal = 'maybeSingle'; return run(); };
    builder.then = (onFulfilled: (r: Result) => unknown, onRejected?: (e: unknown) => unknown) =>
      run().then(onFulfilled, onRejected);
    return builder;
  };

  // `.rpc(fn, args)` is recorded as table `rpc:<fn>` with the args as payload.
  const rpc = (fn: string, args?: unknown) => {
    const call: Call = { table: `rpc:${fn}`, op: 'select', payload: args, filters: [], terminal: null };
    const run = (): Promise<Result> => {
      calls.push(call);
      return settle(responder(call) ?? { data: null, error: null });
    };
    return { then: (f: (r: Result) => unknown, r?: (e: unknown) => unknown) => run().then(f, r) };
  };

  // `from`/`rpc` live on the SupabaseClient prototype; assigning on the instance shadows them.
  (client as { from: unknown }).from = from;
  (client as { rpc: unknown }).rpc = rpc;

  return {
    calls,
    /** Sequential round trips so far (needs options.latencyMs). */
    roundTrips: () => deepest,
    /** All recorded calls against `table`, optionally narrowed to one operation. */
    on(table: string, op?: Op) {
      return calls.filter((c) => c.table === table && (!op || c.op === op));
    },
  };
}

export function hasFilter(call: Call, method: string, ...args: unknown[]): boolean {
  return call.filters.some(
    ([m, ...rest]) => m === method && args.every((a, i) => JSON.stringify(rest[i]) === JSON.stringify(a))
  );
}

/** Tiny Express `res` double capturing status + JSON body. */
export function mockRes() {
  const res: { statusCode: number; body: unknown; req?: unknown; status: (n: number) => typeof res; json: (b: unknown) => typeof res } = {
    statusCode: 200,
    body: undefined,
    status(n: number) { res.statusCode = n; return res; },
    json(b: unknown) { res.body = b; return res; },
  };
  return res;
}
