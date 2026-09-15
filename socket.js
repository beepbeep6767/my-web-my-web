import { Server } from 'socket.io';
import { config } from './config.js';
import { authenticate } from './services/auth.js';
import { sendMessage, markRead } from './services/chat.js';
export function attachSocket(server) {
  const io = new Server(server, { cors: { origin: config.CLIENT_ORIGIN, credentials: true }, allowRequest: (req, callback) => callback(null, req.headers.origin === config.CLIENT_ORIGIN), maxHttpBufferSize: 32000 });
  io.use(async (socket, next) => {
    try { socket.data.session = await authenticate(socket.request.headers.cookie); next(); }
    catch { next(new Error('Please sign in to connect.')); }
  });
  const buckets = new Map();
  const prune = setInterval(() => { for (const [key, value] of buckets) if (value.until < Date.now()) buckets.delete(key); }, 60000);
  prune.unref();
  io.on('close', () => clearInterval(prune));
  io.on('connection', socket => {
    const initial = socket.data.session;
    socket.join(`user:${initial.userId}`);
    socket.join(`session:${initial.id}`);
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(1, initial.expiresAt.getTime() - Date.now()));
    socket.on('disconnect', () => clearTimeout(expiry));
    for (const [event, action] of [['message:send', sendMessage], ['messages:read', markRead]]) {
      socket.on(event, async (payload, callback) => {
        const reply = typeof callback === 'function' ? callback : () => {};
        try {
          const bucket = buckets.get(initial.userId) || { count: 0, until: Date.now() + 60000 };
          if (bucket.until < Date.now()) { bucket.count = 0; bucket.until = Date.now() + 60000; }
          buckets.set(initial.userId, bucket);
          if (++bucket.count > 120) return reply({ ok: false, error: 'Slow down for a moment.', code: 'RATE_LIMITED' });
          const session = await authenticate(socket.request.headers.cookie);
          const result = await action(session.userId, payload, io);
          reply({ ok: true, data: result });
        } catch (error) {
          reply({ ok: false, error: error.name === 'ZodError' ? error.issues[0]?.message : error.status && error.status < 500 ? error.message : 'Could not complete this action. Please try again.', code: error.status ? error.code : 'INVALID_REQUEST' });
          if (error.status === 401) socket.disconnect(true);
        }
      });
    }
  });
  return io;
}
