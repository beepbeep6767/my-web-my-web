import { Router } from 'express';
import { z } from 'zod';
import { db, publicUser } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { writeLimiter } from '../middleware/security.js';
import { moderateText } from '../middleware/moderation.js';
import { FILTER_VERSION } from '../moderation/filter.js';
import { AppError } from '../errors.js';
export const feedRouter = Router();
feedRouter.use(requireAuth);
const authorInclude = { author: { select: publicUser } };
const schema = z.object({ text: z.string().trim().min(1, 'Write something first.').max(4000) });
feedRouter.get('/', async (req, res) => {
  const cursor = req.query.cursor ? z.uuid().parse(req.query.cursor) : undefined;
  const posts = await db.post.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { ...authorInclude, _count: { select: { comments: true } }, comments: { include: authorInclude, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 3 } } });
  res.json({ posts: posts.slice(0, 20), nextCursor: posts.length > 20 ? posts[19].id : null });
});
feedRouter.post('/', writeLimiter, moderateText(schema), async (req, res) => {
  const post = await db.post.create({ data: { text: req.validated.text, authorId: req.user.id, moderationVersion: FILTER_VERSION }, include: { ...authorInclude, comments: true, _count: { select: { comments: true } } } });
  req.app.get('io')?.emit('feed:updated');
  res.status(201).json({ post });
});
feedRouter.get('/:id/comments', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  if (!await db.post.findUnique({ where: { id }, select: { id: true } })) throw new AppError(404, 'Post not found.');
  const cursor = req.query.cursor ? z.uuid().parse(req.query.cursor) : undefined;
  if (cursor && !await db.comment.findFirst({ where: { id: cursor, postId: id } })) throw new AppError(400, 'Refresh the comments to load more.');
  const comments = await db.comment.findMany({ where: { postId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 51, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: authorInclude });
  res.json({ comments: comments.slice(0, 50), nextCursor: comments.length > 50 ? comments[49].id : null });
});
feedRouter.post('/:id/comments', writeLimiter, moderateText(schema.extend({ text: z.string().trim().min(1).max(2000) })), async (req, res) => {
  const postId = z.uuid().parse(req.params.id);
  if (!await db.post.findUnique({ where: { id: postId }, select: { id: true } })) throw new AppError(404, 'Post not found.');
  const comment = await db.comment.create({ data: { postId, authorId: req.user.id, text: req.validated.text, moderationVersion: FILTER_VERSION }, include: authorInclude });
  req.app.get('io')?.emit('feed:updated');
  res.status(201).json({ comment });
});
