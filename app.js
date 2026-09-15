import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { config, root } from './config.js';
import { db } from './db.js';
import { apiLimiter, requireOrigin } from './middleware/security.js';
import { authRouter } from './routes/auth.js';
import { friendsRouter } from './routes/friends.js';
import { chatRouter } from './routes/chat.js';
import { mediaRouter } from './routes/media.js';
import { feedRouter } from './routes/feed.js';
import { errorHandler } from './errors.js';
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.TRUST_PROXY);
  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'blob:', 'data:'], mediaSrc: ["'self'", 'blob:'], connectSrc: ["'self'"], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: config.production ? [] : null } }, strictTransportSecurity: config.production ? undefined : false }));
  app.use(cors({ origin: config.CLIENT_ORIGIN, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, apiLimiter, requireOrigin);
  app.get('/api/health', async (req, res) => { await db.$queryRaw`SELECT 1`; res.json({ ok: true }); });
  app.use('/api/auth', authRouter);
  app.use('/api/friends', friendsRouter);
  app.use('/api/conversations', chatRouter);
  app.use('/api/media', mediaRouter);
  app.use('/api/posts', feedRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));
  const dist = path.join(root, 'client/dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.get('/{*path}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
