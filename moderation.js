import { assertAllowed } from '../moderation/client.js';
export function moderateText(schema) {
  return async (req, res, next) => {
    try { req.validated = schema.parse(req.body); await assertAllowed(req.validated.text); next(); }
    catch (error) { next(error); }
  };
}
