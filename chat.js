import { Router } from 'express';
import { z } from 'zod';
import { db, publicUser } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/security.js';
import { requireConversation, sendMessage, markRead, activeMessageWhere, messageInclude } from '../services/chat.js';
import { AppError } from '../errors.js';
export const chatRouter = Router();
chatRouter.use(requireAuth);
chatRouter.get('/', async (req, res) => {
  const conversations = await db.conversation.findMany({ where: { friendship: { status: 'ACCEPTED', OR: [{ userLowId: req.user.id }, { userHighId: req.user.id }] } }, include: { friendship: { include: { lowUser: { select: publicUser }, highUser: { select: publicUser } } }, messages: { where: activeMessageWhere(), orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, include: messageInclude }, _count: { select: { messages: { where: { readAt: null, senderId: { not: req.user.id }, createdAt: { gt: new Date(Date.now() - 48 * 3600000) } } } } } }, orderBy: { updatedAt: 'desc' }, take: 500 });
  res.json({ conversations: conversations.map(c => ({ id: c.id, user: c.friendship.userLowId === req.user.id ? c.friendship.highUser : c.friendship.lowUser, lastMessage: c.messages[0] || null, unreadCount: c._count.messages, updatedAt: c.updatedAt })) });
});
chatRouter.get('/:id/messages', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await requireConversation(id, req.user.id);
  const cursor = req.query.cursor ? z.uuid().parse(req.query.cursor) : undefined;
  if (cursor && !await db.message.findFirst({ where: { id: cursor, conversationId: id } })) throw new AppError(400, 'Refresh this conversation to load its history.');
  const rows = await db.message.findMany({ where: { conversationId: id, ...activeMessageWhere() }, include: messageInclude, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
  const messages = rows.slice(0, 50);
  res.json({ messages: messages.reverse(), nextCursor: rows.length > 50 ? rows[49].id : null });
});
chatRouter.post('/:id/messages', writeLimiter, async (req, res) => res.status(201).json({ message: await sendMessage(req.user.id, { ...req.body, conversationId: req.params.id }, req.app.get('io')) }));
chatRouter.post('/:id/read', writeLimiter, async (req, res) => res.json(await markRead(req.user.id, { ...req.body, conversationId: req.params.id }, req.app.get('io'))));
