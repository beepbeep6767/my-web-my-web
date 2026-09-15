import { db } from '../db.js';
import { config } from '../config.js';
import { readdir, stat, unlink } from 'node:fs/promises';
import { join } from 'node:path';
export const UNREAD_MAX_AGE_MS = 48 * 3600000;
export async function cleanupUnread(now = new Date()) {
  // Small indexed batches prevent a large backlog from monopolizing the database.
  const cutoff = new Date(now.getTime() - UNREAD_MAX_AGE_MS);
  let deleted = 0;
  for (let batch = 0; batch < 20; batch++) {
    const rows = await db.$queryRaw`DELETE FROM "Message" WHERE id IN (SELECT id FROM "Message" WHERE "readAt" IS NULL AND "createdAt" <= ${cutoff} ORDER BY "createdAt" LIMIT 500 FOR UPDATE SKIP LOCKED) AND "readAt" IS NULL RETURNING id`;
    deleted += rows.length;
    if (rows.length < 500) break;
  }
  await db.session.deleteMany({ where: { expiresAt: { lte: now } } });
  return { deleted };
}
export async function cleanupMedia(now = new Date()) {
  const cutoff = new Date(now.getTime() - 24 * 3600000);
  const filenames = await db.$transaction(async tx => {
    const locked = await tx.$queryRaw`SELECT m.id FROM "Media" m WHERE m."createdAt" < ${cutoff} AND NOT EXISTS (SELECT 1 FROM "Message" WHERE "mediaId" = m.id) AND NOT EXISTS (SELECT 1 FROM "User" WHERE "avatarId" = m.id) LIMIT 500 FOR UPDATE SKIP LOCKED`;
    const removed = [];
    for (const { id } of locked) {
      const media = await tx.media.findFirst({ where: { id, messages: { none: {} }, avatars: { none: {} } } });
      if (media) { await tx.media.delete({ where: { id } }); removed.push(media.filename); }
    }
    return removed;
  }, { timeout: 30000 });
  for (const filename of filenames) await unlink(join(config.uploadDir, filename)).catch(error => { if (error.code !== 'ENOENT') console.error('Media cleanup failed:', error.code); });
  // Recover files left on disk if a previous process stopped between file and DB writes.
  for (const filename of await readdir(config.uploadDir)) {
    if (!/^[a-f0-9-]{36}\.(webp|webm|m4a|ogg|wav|mp3)$/.test(filename)) continue;
    const file = join(config.uploadDir, filename);
    const info = await stat(file).catch(() => null);
    if (info && info.mtime < cutoff && !await db.media.findUnique({ where: { filename }, select: { id: true } })) await unlink(file).catch(() => {});
  }
  return { removedMedia: filenames.length };
}
