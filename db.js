import './config.js';
import { PrismaClient } from '@prisma/client';
export const db = new PrismaClient({ log: ['error'] });
export const publicUser = { id: true, username: true, avatarId: true, createdAt: true };
