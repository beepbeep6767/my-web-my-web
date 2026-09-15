import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import bcrypt from 'bcrypt';
import { io as connectSocket } from 'socket.io-client';
import { createApp } from '../src/app.js';
import { attachSocket } from '../src/socket.js';
import { db } from '../src/db.js';
import { config } from '../src/config.js';
import { stopModeration } from '../src/moderation/client.js';
import { cleanupUnread, cleanupMedia } from '../src/jobs/cleanup.js';
import { auditModeration } from '../src/jobs/moderation-audit.js';

if (!new URL(config.DATABASE_URL).pathname.endsWith('_test')) throw new Error('Integration tests require a separate database whose name ends in _test.');
const origin = config.CLIENT_ORIGIN;
const unique = randomUUID().slice(0, 8);
const sockets = [], users = [], files = [];
let base, server, io;
async function request(path, { cookie, body, method = 'GET', requestOrigin = origin } = {}) {
  const response = await fetch(`${base}/api${path}`, { method, headers: { Origin: requestOrigin, ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) }, body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie'), headers: response.headers };
}
async function signup(label) {
  const result = await request('/auth/signup', { method: 'POST', body: { username: `test-${unique}-${label}`, email: `${unique}-${label}@example.test`, password: 'a-secure-password-123' } });
  assert.equal(result.status, 201); users.push(result.data.user.id);
  return { ...result.data.user, cookie: result.cookie.split(';')[0], fullCookie: result.cookie };
}
async function socket(user) {
  const client = connectSocket(base, { transports: ['websocket'], forceNew: true, reconnection: false, extraHeaders: { Origin: origin, Cookie: user.cookie } });
  sockets.push(client);
  await new Promise((resolve, reject) => { client.once('connect', resolve); client.once('connect_error', reject); });
  return client;
}
function emit(client, event, payload) { return new Promise((resolve, reject) => client.timeout(5000).emit(event, payload, (error, data) => error ? reject(error) : resolve(data))); }
function once(client, event) { return new Promise((resolve, reject) => { const timeout = setTimeout(() => { client.off(event, done); reject(new Error(`Missing ${event}`)); }, 5000); const done = data => { clearTimeout(timeout); resolve(data); }; client.once(event, done); }); }

test('MNChat database, HTTP, and Socket.io integration', { timeout: 90000 }, async t => {
  await mkdir(config.uploadDir, { recursive: true });
  const app = createApp(); server = createServer(app); io = attachSocket(server); app.set('io', io);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { sockets.forEach(s => s.disconnect()); await new Promise(resolve => io.close(resolve)); await stopModeration(); await db.user.deleteMany({ where: { id: { in: users } } }); for (const filename of files) await unlink(join(config.uploadDir, filename)).catch(() => {}); await db.$disconnect(); });
  let alice, bob, eve, conversationId, aliceSocket, bobSocket, message, photoId, post;
  await t.test('rejects unauthenticated API access and foreign-origin mutations', async () => {
    assert.equal((await request('/conversations')).status, 401);
    assert.equal((await request('/auth/signup', { method: 'POST', requestOrigin: 'https://evil.example', body: {} })).status, 403);
  });
  await t.test('hashes passwords, issues HttpOnly cookies, and restores sessions', async () => {
    alice = await signup('alice'); bob = await signup('bob'); eve = await signup('eve');
    assert.match(alice.fullCookie, /HttpOnly/i); assert.match(alice.fullCookie, /SameSite=Strict/i);
    const stored = await db.user.findUnique({ where: { id: alice.id } });
    assert.notEqual(stored.passwordHash, 'a-secure-password-123'); assert.match(stored.passwordHash, /^\$2[aby]\$12\$/);
    assert.equal(await bcrypt.compare('a-secure-password-123', stored.passwordHash), true);
    assert.equal((await request('/auth/me', { cookie: alice.cookie })).data.user.id, alice.id);
    const login = await request('/auth/login', { method: 'POST', body: { email: `${unique}-alice@example.test`, password: 'a-secure-password-123' } });
    assert.equal(login.status, 200);
    assert.equal((await request('/auth/login', { method: 'POST', body: { email: `${unique}-alice@example.test`, password: 'wrong-password-123' } })).status, 401);
  });
  await t.test('requires the recipient to accept a friend request', async () => {
    const result = await request('/friends', { cookie: alice.cookie, method: 'POST', body: { userId: bob.id } }); assert.equal(result.status, 201);
    const friendshipId = result.data.friendship.id;
    assert.equal((await request(`/friends/${friendshipId}/accept`, { cookie: alice.cookie, method: 'POST' })).status, 404);
    const accepted = await request(`/friends/${friendshipId}/accept`, { cookie: bob.cookie, method: 'POST' }); assert.equal(accepted.status, 200); conversationId = accepted.data.conversationId;
    assert.equal((await request('/conversations', { cookie: bob.cookie })).data.conversations.length, 1);
    assert.equal((await request(`/conversations/${conversationId}/messages`, { cookie: eve.cookie })).status, 404);
  });
  await t.test('delivers real-time messages and handles repeated client identifiers without duplicates', async () => {
    aliceSocket = await socket(alice); bobSocket = await socket(bob);
    const incoming = once(bobSocket, 'message:new');
    const payload = { conversationId, text: 'Can you explain quadratic equations?', clientId: randomUUID() };
    const result = await emit(aliceSocket, 'message:send', payload); assert.equal(result.ok, true); message = result.data;
    assert.equal((await incoming).id, message.id);
    const repeated = await emit(aliceSocket, 'message:send', payload); assert.equal(repeated.data.id, message.id);
    assert.equal(await db.message.count({ where: { conversationId } }), 1);
    const stranger = await socket(eve);
    assert.equal((await emit(stranger, 'message:send', { ...payload, clientId: randomUUID() })).ok, false);
  });
  await t.test('blocks inappropriate text before storage over Socket.io and HTTP', async () => {
    const before = await db.message.count({ where: { conversationId } });
    const result = await emit(aliceSocket, 'message:send', { conversationId, clientId: randomUUID(), text: 'f.u.c.k' });
    assert.equal(result.ok, false); assert.equal(result.code, 'CONTENT_BLOCKED');
    assert.equal((await request(`/conversations/${conversationId}/messages`, { cookie: alice.cookie, method: 'POST', body: { clientId: randomUUID(), text: 'ควย' } })).status, 422);
    assert.equal(await db.message.count({ where: { conversationId } }), before);
  });
  await t.test('records read receipts only for messages received by that user', async () => {
    await emit(aliceSocket, 'messages:read', { conversationId, messageIds: [message.id] });
    assert.equal((await db.message.findUnique({ where: { id: message.id } })).readAt, null);
    const receipt = once(aliceSocket, 'messages:read');
    assert.equal((await emit(bobSocket, 'messages:read', { conversationId, messageIds: [message.id] })).ok, true);
    assert.deepEqual((await receipt).messageIds, [message.id]);
    assert.ok((await db.message.findUnique({ where: { id: message.id } })).readAt);
  });
  await t.test('validates image bytes and protects uploaded media', async () => {
    const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNoWPAfAAPDAiD+pUkAAAAAAElFTkSuQmCC', 'base64');
    const body = new FormData(); body.append('file', new Blob([bytes], { type: 'image/png' }), 'pixel.png');
    const uploaded = await request('/media', { cookie: alice.cookie, method: 'POST', body }); assert.equal(uploaded.status, 201); photoId = uploaded.data.media.id;
    files.push((await db.media.findUnique({ where: { id: photoId } })).filename);
    assert.equal((await fetch(`${base}/api/media/${photoId}`, { headers: { Cookie: bob.cookie } })).status, 404);
    const attached = await emit(aliceSocket, 'message:send', { conversationId, clientId: randomUUID(), text: 'My notes', mediaId: photoId }); assert.equal(attached.ok, true);
    const downloaded = await fetch(`${base}/api/media/${photoId}`, { headers: { Cookie: bob.cookie } }); assert.equal(downloaded.status, 200); assert.match(downloaded.headers.get('content-type'), /image\/webp/);
    assert.equal((await fetch(`${base}/api/media/${photoId}`, { headers: { Cookie: eve.cookie } })).status, 404);
    assert.equal((await emit(bobSocket, 'message:send', { conversationId, clientId: randomUUID(), mediaId: photoId })).ok, false);
    const fake = new FormData(); fake.append('file', new Blob(['<script>alert(1)</script>'], { type: 'image/png' }), 'fake.png');
    assert.equal((await request('/media', { cookie: alice.cookie, method: 'POST', body: fake })).status, 400);
  });
  await t.test('uploads audio, attaches it, and supports range playback', async () => {
    const wav = Buffer.alloc(2044); wav.write('RIFF'); wav.writeUInt32LE(2036, 4); wav.write('WAVEfmt ', 8); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write('data', 36); wav.writeUInt32LE(2000, 40);
    const body = new FormData(); body.append('file', new Blob([wav], { type: 'audio/wav' }), 'voice.wav');
    const uploaded = await request('/media', { cookie: alice.cookie, method: 'POST', body }); assert.equal(uploaded.status, 201); assert.equal(uploaded.data.media.kind, 'AUDIO');
    const mediaId = uploaded.data.media.id; files.push((await db.media.findUnique({ where: { id: mediaId } })).filename);
    assert.equal((await emit(aliceSocket, 'message:send', { conversationId, clientId: randomUUID(), mediaId })).ok, true);
    const playback = await fetch(`${base}/api/media/${mediaId}`, { headers: { Cookie: bob.cookie, Range: 'bytes=0-99' } }); assert.equal(playback.status, 206); assert.equal((await playback.arrayBuffer()).byteLength, 100);
  });
  await t.test('supports avatar selection without exposing private account fields', async () => {
    const result = await request('/auth/profile', { cookie: alice.cookie, method: 'PATCH', body: { avatarId: photoId } }); assert.equal(result.status, 200);
    const search = await request(`/friends/search?q=${unique}`, { cookie: eve.cookie }); assert.ok(search.data.users.length);
    assert.equal(search.data.users[0].email, undefined); assert.equal(search.data.users[0].passwordHash, undefined);
  });
  await t.test('creates feed posts and comments, blocking unsafe text on both paths', async () => {
    const result = await request('/posts', { cookie: alice.cookie, method: 'POST', body: { text: 'Here is a useful study tip.' } }); assert.equal(result.status, 201); post = result.data.post;
    assert.equal((await request(`/posts/${post.id}/comments`, { cookie: bob.cookie, method: 'POST', body: { text: 'Thanks for sharing!' } })).status, 201);
    assert.equal((await request('/posts', { cookie: alice.cookie, method: 'POST', body: { text: 'shit' } })).status, 422);
    assert.equal((await request(`/posts/${post.id}/comments`, { cookie: alice.cookie, method: 'POST', body: { text: 'หนังโป๊' } })).status, 422);
    const feed = await request('/posts', { cookie: bob.cookie }); assert.equal(feed.data.posts.find(p => p.id === post.id)._count.comments, 1);
  });
  await t.test('keeps saved accounts/messages/sessions after reconnecting the ORM', async () => {
    await db.$disconnect(); await db.$connect();
    assert.ok(await db.message.findUnique({ where: { id: message.id } }));
    assert.equal((await request('/auth/me', { cookie: alice.cookie })).status, 200);
  });
  await t.test('restores existing accounts, messages, and sessions after an API restart', async () => {
    sockets.forEach(s => s.disconnect());
    await new Promise(resolve => io.close(resolve));
    await db.$disconnect();
    const restarted = createApp(); server = createServer(restarted); io = attachSocket(server); restarted.set('io', io);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await request('/auth/me', { cookie: alice.cookie })).data.user.id, alice.id);
    assert.ok((await request(`/conversations/${conversationId}/messages`, { cookie: bob.cookie })).data.messages.find(m => m.id === message.id));
    aliceSocket = await socket(alice); bobSocket = await socket(bob);
  });
  await t.test('deletes only unread messages at or beyond 48 hours, including exact boundary', async () => {
    const now = new Date();
    const base = { conversationId, senderId: alice.id, text: 'Retention test' };
    const oldUnread = await db.message.create({ data: { ...base, clientId: randomUUID(), createdAt: new Date(now.getTime() - 49 * 3600000) } });
    const boundary = await db.message.create({ data: { ...base, clientId: randomUUID(), createdAt: new Date(now.getTime() - 48 * 3600000) } });
    const fresh = await db.message.create({ data: { ...base, clientId: randomUUID(), createdAt: new Date(now.getTime() - 47 * 3600000) } });
    const read = await db.message.create({ data: { ...base, clientId: randomUUID(), createdAt: new Date(now.getTime() - 60 * 3600000), readAt: new Date(now.getTime() - 59 * 3600000) } });
    await cleanupUnread(now);
    assert.equal(await db.message.findUnique({ where: { id: oldUnread.id } }), null); assert.equal(await db.message.findUnique({ where: { id: boundary.id } }), null);
    assert.ok(await db.message.findUnique({ where: { id: fresh.id } })); assert.ok(await db.message.findUnique({ where: { id: read.id } }));

  });
  await t.test('audits older moderation versions and preserves referenced media', async () => {
    const legacy = await db.post.create({ data: { authorId: alice.id, text: 'fuck', moderationVersion: 0 } });
    await auditModeration(); assert.equal((await db.post.findUnique({ where: { id: legacy.id } })).text, '[Removed by moderation]');
    await db.media.update({ where: { id: photoId }, data: { createdAt: new Date(Date.now() - 48 * 3600000) } });
    await cleanupMedia(); assert.ok(await db.media.findUnique({ where: { id: photoId } }));
  });
  await t.test('logout revokes persisted session and disconnects its socket', async () => {
    const disconnected = once(aliceSocket, 'disconnect');
    assert.equal((await request('/auth/logout', { cookie: alice.cookie, method: 'POST' })).status, 200);
    await disconnected;
    assert.equal((await request('/auth/me', { cookie: alice.cookie })).status, 401);
  });
});
