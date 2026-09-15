import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { fileTypeFromBuffer } from 'file-type';
import { randomUUID } from 'node:crypto';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { db } from '../db.js';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/security.js';
import { activeMessageWhere } from '../services/chat.js';
export const mediaRouter = Router();
mediaRouter.use(requireAuth);
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1, fields: 0 } });
mediaRouter.post('/', uploadLimiter, upload.single('file'), async (req, res) => {
  if (!req.file) throw new AppError(400, 'Choose an image or audio file.');
  const type = await fileTypeFromBuffer(req.file.buffer);
  let bytes = req.file.buffer, kind, extension, mimeType;
  if (type && ['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(type.mime)) {
    kind = 'IMAGE'; extension = 'webp'; mimeType = 'image/webp';
    try { bytes = await sharp(bytes, { limitInputPixels: 25000000, animated: false }).rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 85 }).toBuffer(); }
    catch { throw new AppError(400, 'This image cannot be processed. Choose a JPG, PNG, WebP, or GIF.'); }
  } else if (type && ['audio/mpeg', 'audio/ogg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 'video/mp4', 'audio/webm', 'video/webm'].includes(type.mime)) {
    kind = 'AUDIO'; extension = { 'video/webm': 'webm', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'video/mp4': 'm4a' }[type.mime];
    mimeType = extension === 'webm' ? 'audio/webm' : extension === 'm4a' ? 'audio/mp4' : type.mime;
  } else throw new AppError(400, 'Supported files: JPG, PNG, WebP, GIF, MP3, WAV, OGG, WebM, and M4A.');
  const filename = `${randomUUID()}.${extension}`;
  await writeFile(join(config.uploadDir, filename), bytes, { flag: 'wx', mode: 0o600 });
  try {
    const media = await db.media.create({ data: { ownerId: req.user.id, filename, kind, mimeType, size: bytes.length }, select: { id: true, kind: true, mimeType: true, size: true } });
    res.status(201).json({ media });
  } catch (error) { await unlink(join(config.uploadDir, filename)).catch(() => {}); throw error; }
});
mediaRouter.get('/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const media = await db.media.findFirst({ where: { id, OR: [{ ownerId: req.user.id }, { avatars: { some: {} } }, { messages: { some: { ...activeMessageWhere(), conversation: { friendship: { OR: [{ userLowId: req.user.id }, { userHighId: req.user.id }] } } } } }] } });
  if (!media) throw new AppError(404, 'File not found.');
  res.set({ 'Content-Type': media.mimeType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': `inline; filename="${media.filename}"` });
  res.sendFile(media.filename, { root: config.uploadDir });
});
