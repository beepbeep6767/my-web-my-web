import { Router } from 'express';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db, publicUser } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { authLimiter } from '../middleware/security.js';
import { createSession, clearSessionCookie } from '../services/auth.js';
import { AppError } from '../errors.js';
export const authRouter = Router();
const credentials = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), password: z.string().min(10, 'Use at least 10 characters for your password.').refine(v => Buffer.byteLength(v, 'utf8') <= 72, 'Password must fit within 72 UTF-8 bytes.') });
const signup = credentials.extend({ username: z.string().trim().min(2).max(30).regex(/^[\p{L}\p{N}_ .-]+$/u, 'Use letters, numbers, spaces, dots, underscores, or hyphens.').transform(v => v.normalize('NFKC').toLowerCase()) });
const dummyHash = await bcrypt.hash('unused-comparison-password', 12);
authRouter.post('/signup', authLimiter, async (req, res) => {
  const input = signup.parse(req.body);
  const passwordHash = await bcrypt.hash(input.password, 12);
  const user = await db.$transaction(async tx => {
    const user = await tx.user.create({ data: { username: input.username, email: input.email, passwordHash }, select: publicUser });
    await createSession(user.id, res, tx);
    return user;
  });
  res.status(201).json({ user });
});
authRouter.post('/login', authLimiter, async (req, res) => {
  const input = credentials.parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid = await bcrypt.compare(input.password, user?.passwordHash || dummyHash);
  if (!user || !valid) throw new AppError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
  await createSession(user.id, res);
  res.json({ user: await db.user.findUnique({ where: { id: user.id }, select: publicUser }) });
});
authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));
authRouter.post('/logout', requireAuth, async (req, res) => {
  await db.session.deleteMany({ where: { id: req.session.id } });
  req.app.get('io')?.in(`session:${req.session.id}`).disconnectSockets(true);
  clearSessionCookie(res);
  res.json({ ok: true });
});
authRouter.patch('/profile', requireAuth, async (req, res) => {
  const { avatarId } = z.object({ avatarId: z.uuid().nullable() }).parse(req.body);
  const user = await db.$transaction(async tx => {
    if (avatarId) {
      await tx.$queryRaw`SELECT id FROM "Media" WHERE id = ${avatarId}::uuid FOR UPDATE`;
      const media = await tx.media.findFirst({ where: { id: avatarId, ownerId: req.user.id, kind: 'IMAGE' } });
      if (!media) throw new AppError(400, 'Choose an image you uploaded.');
    }
    return tx.user.update({ where: { id: req.user.id }, data: { avatarId }, select: publicUser });
  });
  res.json({ user });
});
