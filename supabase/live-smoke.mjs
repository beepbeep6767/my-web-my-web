// Explicit opt-in: creates two QA accounts and test data; does not delete existing data.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
if (process.env.MNCHAT_RUN_LIVE !== '1') throw new Error('Set MNCHAT_RUN_LIVE=1 to create two live QA accounts.');
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(x => x.includes('=')).map(x => {
  const i = x.indexOf('='); return [x.slice(0, i), x.slice(i + 1).trim()];
}));
const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
const run = Date.now().toString(36);
const fixturePath = path.join(os.tmpdir(), 'mnchat-live-smoke-fixtures.json');
const existing = fs.existsSync(fixturePath) ? JSON.parse(fs.readFileSync(fixturePath, 'utf8')) : null;
const names = existing?.names || [`qa_${run}_a`, `qa_${run}_b`];
const passwords = existing?.passwords || [randomBytes(3).toString('hex'), randomBytes(3).toString('hex')];
const clients = names.map(() => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
async function auth(action, username, password) {
  const response = await fetch(url + '/functions/v1/mnchat-auth', {
    method: 'POST', headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, username, password }), signal: AbortSignal.timeout(30000),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${action} HTTP ${response.status}: ${data.error || 'request failed'}`);
  return data;
}
async function ok(query) { const { data, error } = await query; if (error) throw new Error(error.message); return data; }
let channel;
try {
  const ids = [];
  for (let i = 0; i < 2; i++) {
    const session = await auth(existing ? 'login' : 'signup', names[i], passwords[i]);
    const result = await ok(clients[i].auth.setSession(session));
    ids.push(result.user.id);
  }
  fs.writeFileSync(fixturePath, JSON.stringify({ names, passwords }), { mode: 0o600 });
  console.log('PASS: two username-only accounts authenticated with six-character passwords', names.join(', '));
  await auth('login', names[0].toUpperCase(), passwords[0]);
  console.log('PASS: case-insensitive username login with literal underscores');
  await assert.rejects(auth('login', names[0], 'wrong-password'), /HTTP 401/);
  await assert.rejects(auth('signup', names[0], passwords[0]), /HTTP (400|409|429)/);
  console.log('PASS: wrong password and duplicate/rate-limited signup rejected');
  const previous = await ok(clients[0].from('friendships').select('*').eq('senderId', ids[0]).eq('recipientId', ids[1]).maybeSingle());
  const friend = previous || await ok(clients[0].from('friendships').insert({ senderId: ids[0], recipientId: ids[1] }).select().single());
  if (friend.status !== 'ACCEPTED') await ok(clients[1].rpc('mnchat_friend_action', { friend_id: friend.id, action: 'accept' }));
  console.log('PASS: friend request and acceptance');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRzQAAAAASUVORK5CYII=', 'base64');
  const media = `${ids[0]}/image/${crypto.randomUUID()}`;
  await ok(clients[0].storage.from('mnchat-media').upload(media, png, { contentType: 'image/png' }));
  await ok(clients[0].from('profiles').update({ avatarId: media }).eq('id', ids[0]));
  const profile = await ok(clients[0].from('profiles').select('avatarId').eq('id', ids[0]).single());
  assert.equal(profile.avatarId, media);
  console.log('PASS: image upload and profile persistence');
  let delivered;
  const arrival = new Promise(resolve => { delivered = resolve; });
  await clients[1].realtime.setAuth((await clients[1].auth.getSession()).data.session.access_token);
  channel = clients[1].channel('qa-' + run).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, payload => { if (payload.new.conversationId === friend.id) delivered(payload.new); });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Realtime subscribe timeout')), 20000);
    channel.subscribe(status => { if (status === 'SUBSCRIBED') { clearTimeout(timer); resolve(); } if (status === 'CHANNEL_ERROR') { clearTimeout(timer); reject(new Error('Realtime channel error')); } });
  });
  const start = Date.now();
  const message = await ok(clients[0].rpc('mnchat_send', { conversation_id: friend.id, client_id: crypto.randomUUID(), message_text: 'QA connection check', media_path: media }));
  const recipientMessage = await ok(clients[1].from('messages').select('id').eq('id',message.id).single());
  assert.equal(recipientMessage.id, message.id);
  console.log('PASS: recipient can read the persisted message through RLS');
  let timer;
  const received = await Promise.race([arrival, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Realtime delivery timeout')), 20000); })]).finally(() => clearTimeout(timer));
  assert.equal(received.id, message.id);
  console.log(`PASS: second account received image message over Realtime in ${Date.now() - start} ms`);
  const signed = await ok(clients[1].storage.from('mnchat-media').createSignedUrl(media, 60));
  assert.equal((await fetch(signed.signedUrl)).status, 200);
  await ok(clients[1].rpc('mnchat_read', { conversation_id: friend.id, message_ids: [message.id] }));
  const receipt = await ok(clients[0].from('messages').select('readAt').eq('id', message.id).single());
  assert.ok(receipt.readAt);
  console.log('PASS: recipient can open image and read receipt persists');
} finally {
  if (channel) await clients[1].removeChannel(channel);
  for (const c of clients) { await c.removeAllChannels(); await c.auth.signOut(); }
}
