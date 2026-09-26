import { randomUUID } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

declare module 'express' {
  interface Request {
    /** Correlation id echoed in error bodies and the X-Request-Id header. */
    requestId?: string;
    /** High-resolution start time for latency logging. */
    startedAt?: number;
  }
}

/**
 * Attaches a request id (reusing an upstream X-Request-Id / ALB trace id when
 * present), echoes it back, and logs one line per request with the latency
 * and status so slow endpoints show up in CloudWatch Logs Insights, e.g.
 *
 *   filter durationMs > 1000 | stats avg(durationMs) by route
 */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incoming =
    (req.headers['x-request-id'] as string | undefined) ||
    (req.headers['x-amzn-trace-id'] as string | undefined);
  const id = incoming?.slice(0, 128) || randomUUID();
  req.requestId = id;
  req.startedAt = performance.now();
  res.setHeader('X-Request-Id', id);

  res.on('finish', () => {
    const durationMs = Math.round(performance.now() - (req.startedAt ?? performance.now()));
    const routePath = (req.route?.path as string | undefined) ? `${req.baseUrl}${req.route.path}` : req.originalUrl.split('?')[0];
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : durationMs > 1500 ? 'warn' : 'info';
    const line = JSON.stringify({
      level,
      requestId: id,
      method: req.method,
      route: routePath,
      url: req.originalUrl,
      status: res.statusCode,
      durationMs
    });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else if (process.env.LOG_REQUESTS !== 'false') console.log(line);
  });

  next();
}
