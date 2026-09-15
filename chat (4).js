import { z } from 'zod';
import { db } from '../db.js';
import { AppError } from '../errors.js';
import { assertAllowed } from '../moderation/client.js';
import { FILTER_VERSION } from '../moderation/filter.js';
export const mediaSelect = { id: true, kind: true, mimeType: true, size: true };
export const messageInclude = { media: { select: mediaSelect } };
export const activeMessageWhere = () => ({ OR: [{ readAt: { not: null } }, { createdAt: { gt: new Date(Date.now() - 48 * 3600000) } }] });
export async function requireConversation(id, userId, client = db) {
  const conversation = await client.conversation.findFirst({ where: { id, friendship: { status: 'ACCEPTED', OR: [{ userLowId: userId }, { userHighId: userId }] } }, include: { friendship: true } });
  if (!conversation) throw new AppError(404, 'Conversation not found.', 'NOT_FOUND');
  return conversation;
}
export function conversationEmit(io, conversation, event, data) {
  io?.to(`user:${conversation.friendship.userLowId}`).to(`user:${conversation.friendship.userHighId}`).emit(event, data);
}
const sendSchema = z.object({ conversationId: z.uuid(), clientId: z.uuid(), text: z.string().trim().max(4000).default(''), mediaId: z.uuid().optional() }).refine(v => v.text.length || v.mediaId, 'Write a message or attach a file.');
export async function sendMessage(userId, payload, io) {
  const input = sendSchema.parse(payload);
  const conversation = await requireConversation(input.conversationId, userId);
  await assertAllowed(input.text);
  const existing = await db.message.findUnique({ where: { senderId_clientId: { senderId: userId, clientId: input.clientId } }, include: messageInclude });
  if (existing) {
    if (existing.conversationId !== input.conversationId) throw new AppError(409, 'Please retry with a new message identifier.');
    return existing;
  }
  let message;
  try {
    message = await db.$transaction(async tx => {
      if (input.mediaId) {
        // Coordinate attachments with orphan cleanup; never attach another user's upload.
        await tx.$queryRaw`SELECT id FROM "Media" WHERE id = ${input.mediaId}::uuid FOR UPDATE`;
        if (!await tx.media.findFirst({ where: { id: input.mediaId, ownerId: userId } })) throw new AppError(400, 'This attachment is not available. Upload it again.');
      }
      const created = await tx.message.create({ data: { ...input, senderId: userId, moderationVersion: FILTER_VERSION }, include: messageInclude });
      await tx.conversation.update({ where: { id: input.conversationId }, data: { updatedAt: created.createdAt } });
      return created;
    });
  } catch (error) {
    if (error.code !== 'P2002') throw error;
    message = await db.message.findUnique({ where: { senderId_clientId: { senderId: userId, clientId: input.clientId } }, include: messageInclude });
    if (!message || message.conversationId !== input.conversationId) throw new AppError(409, 'Message identifier is already in use.');
  }
  conversationEmit(io, conversation, 'message:new', message);
  return message;
}
export async function markRead(userId, payload, io) {
  const { conversationId, messageIds } = z.object({ conversationId: z.uuid(), messageIds: z.array(z.uuid()).min(1).max(100) }).parse(payload);
  const conversation = await requireConversation(conversationId, userId);
  const readAt = new Date();
  // UPDATE RETURNING prevents racing cleanup/read requests from emitting false receipts.
  const ids = await db.$queryRaw`UPDATE "Message" SET "readAt" = ${readAt} WHERE "conversationId" = ${conversationId}::uuid AND "senderId" <> ${userId}::uuid AND "readAt" IS NULL AND "createdAt" > ${new Date(Date.now() - 48 * 3600000)} AND id = ANY(${messageIds}::uuid[]) RETURNING id`;
  const result = { conversationId, messageIds: ids.map(v => v.id), readAt };
  if (ids.length) conversationEmit(io, conversation, 'messages:read', result);
  return result;
}
