/**
 * On Vercel a promise left running after res.json() can be frozen with the
 * function, so a detached `notificationService.x(...).catch(...)` might send
 * its email / push late or never. utils/background.ts's runInBackground keeps
 * the invocation alive (waitUntil). 2026-10-27: 15 controller call sites (and
 * the webhook's invoice in payment.service) had slipped through — verification
 * emails, the admin's rider broadcast, review notifications, post-payment
 * invoices. This keeps new ones from appearing in controllers.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const controllersDir = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'controllers');

/** Statements that start with `notificationService` / `invoiceService` and are detached with `.catch(`. */
function detachedCalls(source: string): string[] {
  const found: string[] = [];
  const statementStart = /^[ \t]*(notificationService|invoiceService)\b/gm;
  let m: RegExpExecArray | null;
  while ((m = statementStart.exec(source))) {
    const end = source.indexOf(';', m.index);
    const statement = source.slice(m.index, end === -1 ? undefined : end);
    if (/\.catch\(/.test(statement)) found.push(statement.trim().split('\n')[0]);
  }
  return found;
}

describe('background work in controllers', () => {
  it('goes through runInBackground, never a bare .catch()', () => {
    const offenders = readdirSync(controllersDir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
      .flatMap((f) => detachedCalls(readFileSync(join(controllersDir, f), 'utf8')).map((line) => `${f}: ${line}`));
    expect(offenders).toEqual([]);
  });

  it('the scan recognises a detached call', () => {
    expect(detachedCalls("    notificationService\n      .notifyX(a)\n      .catch((err) => console.error(err));")).toHaveLength(1);
    expect(detachedCalls("    runInBackground('x', () =>\n      notificationService.notifyX(a)\n    );")).toHaveLength(0);
    expect(detachedCalls("    await notificationService.notifyX(a).catch(() => {});")).toHaveLength(0);
  });
});
