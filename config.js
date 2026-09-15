import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
export const root = fileURLToPath(new URL('../..', import.meta.url));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
const env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  CLIENT_ORIGIN: z.url().default('http://localhost:5173'),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  JWT_SECRET: z.string().min(64).refine(v => !v.includes('REPLACE_WITH'), 'Run npm run setup to generate a secret'),
  SESSION_DAYS: z.coerce.number().min(1).max(30).default(7),
  TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
  UPLOAD_DIR: z.string().default('./server/uploads'),
  CLEANUP_CRON: z.string().default('*/10 * * * *'),
  MODERATION_AUDIT_CRON: z.string().default('*/5 * * * *'),
}).parse(process.env);
if (new URL(env.CLIENT_ORIGIN).origin !== env.CLIENT_ORIGIN) throw new Error('CLIENT_ORIGIN must be an origin without a trailing slash or path');
if (env.NODE_ENV === 'production' && !env.CLIENT_ORIGIN.startsWith('https://')) throw new Error('Production requires an HTTPS CLIENT_ORIGIN');
export const config = { ...env, uploadDir: path.resolve(root, env.UPLOAD_DIR), production: env.NODE_ENV === 'production' };
