import jwt from 'jsonwebtoken';
import { parse } from 'cookie';
import { db, publicUser } from '../db.js';
import { config } from '../config.js';
import { AppError } from '../errors.js';
export const COOKIE = config.production ? '__Host-mnchat' : 'mnchat';
const options = { httpOnly: true, secure: config.production, sameSite: 'strict', path: '/' };
export async function createSession(userId, res, client = db) {
  const expiresAt = new Date(Date.now() + config.SESSION_DAYS * 86400000);
  const session = await client.session.create({ data: { userId, expiresAt } });
  const token = jwt.sign({ sid: session.id }, config.JWT_SECRET, { subject: userId, issuer: 'mnchat', audience: 'mnchat-web', algorithm: 'HS256', expiresIn: config.SESSION_DAYS * 86400 });
  res.cookie(COOKIE, token, { ...options, expires: expiresAt });
  return session;
}
export function clearSessionCookie(res) { res.clearCookie(COOKIE, options); }
export async function authenticate(cookieHeader = '') {
  let payload;
  try {
    const token = parse(cookieHeader)[COOKIE];
    payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer: 'mnchat', audience: 'mnchat-web' });
    if (typeof payload !== 'object' || typeof payload.sid !== 'string' || typeof payload.sub !== 'string') throw new Error();
  } catch { throw new AppError(401, 'Please sign in to continue.', 'UNAUTHENTICATED'); }
  const session = await db.session.findUnique({ where: { id: payload.sid }, include: { user: { select: publicUser } } });
  if (!session || session.userId !== payload.sub || session.expiresAt <= new Date()) throw new AppError(401, 'Your session has ended. Please sign in again.', 'UNAUTHENTICATED');
  return session;
}
