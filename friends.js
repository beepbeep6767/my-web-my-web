import { Router } from 'express';
import { z } from 'zod';
import { db, publicUser } from '../db.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/security.js';
export const friendsRouter = Router();
friendsRouter.use(requireAuth);
const membership = id => ({ OR: [{ userLowId: id }, { userHighId: id }] });
const include = { lowUser: { select: publicUser }, highUser: { select: publicUser }, conversation: { select: { id: true } } };
friendsRouter.get('/search', async (req, res) => {
  const q = z.string().trim().min(2).max(30).parse(req.query.q);
  const users = await db.user.findMany({ where: { id: { not: req.user.id }, username: { contains: q, mode: 'insensitive' } }, select: publicUser, take: 20, orderBy: { username: 'asc' } });
  res.json({ users });
});
friendsRouter.get('/', async (req, res) => {
  const friendships = await db.friendship.findMany({ where: membership(req.user.id), include, orderBy: { createdAt: 'desc' }, take: 500 });
  res.json({ friendships: friendships.map(f => ({ id: f.id, status: f.status, incoming: f.requesterId !== req.user.id, user: f.userLowId === req.user.id ? f.highUser : f.lowUser, conversationId: f.conversation?.id })) });
});
friendsRouter.post('/', writeLimiter, async (req, res) => {
  const { userId } = z.object({ userId: z.uuid() }).parse(req.body);
  if (userId === req.user.id) throw new AppError(400, 'Choose another student.');
  if (!await db.user.findUnique({ where: { id: userId }, select: { id: true } })) throw new AppError(404, 'Student not found.');
  const [userLowId, userHighId] = [userId, req.user.id].sort();
  const friendship = await db.friendship.create({ data: { userLowId, userHighId, requesterId: req.user.id } });
  req.app.get('io')?.to(`user:${userId}`).to(`user:${req.user.id}`).emit('friends:updated');
  res.status(201).json({ friendship });
});
friendsRouter.post('/:id/accept', writeLimiter, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const conversation = await db.$transaction(async tx => {
    const changed = await tx.friendship.updateMany({ where: { id, ...membership(req.user.id), requesterId: { not: req.user.id }, status: 'PENDING' }, data: { status: 'ACCEPTED' } });
    if (!changed.count) throw new AppError(404, 'Friend request not found.');
    return tx.conversation.create({ data: { friendshipId: id }, include: { friendship: true } });
  });
  for (const id of [conversation.friendship.userLowId, conversation.friendship.userHighId]) req.app.get('io')?.to(`user:${id}`).emit('friends:updated');
  res.json({ conversationId: conversation.id });
});
friendsRouter.delete('/:id', writeLimiter, async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const friendship = await db.friendship.findFirst({ where: { id, status: 'PENDING', ...membership(req.user.id) } });
  if (!friendship) throw new AppError(404, 'Friend request not found.');
  await db.friendship.deleteMany({ where: { id, status: 'PENDING' } });
  for (const userId of [friendship.userLowId, friendship.userHighId]) req.app.get('io')?.to(`user:${userId}`).emit('friends:updated');
  res.json({ ok: true });
});
