import { rateLimit } from 'express-rate-limit';
import { config } from '../config.js';
import { AppError } from '../errors.js';
export function requireOrigin(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin') !== config.CLIENT_ORIGIN) return next(new AppError(403, 'Request origin is not allowed.', 'INVALID_ORIGIN'));
  next();
}
const common = { standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many requests. Please wait and try again.', code: 'RATE_LIMITED' } };
export const apiLimiter = rateLimit({ ...common, windowMs: 60000, limit: 300 });
export const authLimiter = rateLimit({ ...common, windowMs: 15 * 60000, limit: 30 });
export const writeLimiter = rateLimit({ ...common, windowMs: 60000, limit: 60, keyGenerator: req => req.user.id });
export const uploadLimiter = rateLimit({ ...common, windowMs: 60000, limit: 12, keyGenerator: req => req.user.id });
