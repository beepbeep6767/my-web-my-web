import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { attachSocket } from './socket.js';
import { stopModeration } from './moderation/client.js';
await mkdir(config.uploadDir, { recursive: true });
await db.$connect();
const app = createApp();
const server = createServer(app);
const io = attachSocket(server);
app.set('io', io);
server.listen(config.PORT, '0.0.0.0', () => console.log(`MNChat API listening on port ${config.PORT}`));
let stopping = false;
async function shutdown() {
  if (stopping) return; stopping = true;
  const deadline = setTimeout(() => process.exit(1), 10000); deadline.unref();
  io.close(async () => { await stopModeration(); await db.$disconnect(); process.exit(0); });
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
