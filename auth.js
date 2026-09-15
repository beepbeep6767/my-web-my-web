import { authenticate } from '../services/auth.js';
export async function requireAuth(req, res, next) {
  try { req.session = await authenticate(req.headers.cookie); req.user = req.session.user; next(); }
  catch (error) { next(error); }
}
