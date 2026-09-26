import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';

export function validate(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = (result.error as ZodError).errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message
      }));
      const summary = errors.map((e) => (e.field ? `${e.field}: ${e.message}` : e.message)).join('; ');
      return res.status(400).json({
        error: `The request to ${req.method} ${req.originalUrl.split('?')[0]} has invalid fields — ${summary}`,
        where: 'validate.middleware',
        requestId: req.requestId,
        details: errors
      });
    }
    req.body = result.data;
    next();
  };
}
