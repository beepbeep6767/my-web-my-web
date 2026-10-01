import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './functions/mnchat-auth/index.ts';

function setup(overrides = {}) {
  const calls = [];
  const handler = createHandler({ url: 'https://test.supabase.co', serviceKey: 'server-only', anonKey: 'public', fetcher: async (url, options) => {
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url, options, body });
    let data = true, status = 200;
    if (url.includes('/profiles?')) data = overrides.profiles ?? [{ id: 'existing-id', username: 'Classmate' }];
    if (url.endsWith('/admin/users/existing-id')) data = { email: 'existing@example.com' };
    if (url.endsWith('/admin/users')) { data = { id: 'new-id' }; status = overrides.createStatus ?? 200; }
    if (url.includes('/token?')) { data = { access_token: 'access', refresh_token: 'refresh', user: { email: 'private@example.com' } }; status = overrides.loginStatus ?? 200; }
    if (url.includes('/mnchat_auth_limit') && overrides.limited) data = false;
    return new Response(JSON.stringify(data), { status });
  }});
  const request = body => handler(new Request('https://test/functions/v1/mnchat-auth', { method: 'POST', body: JSON.stringify(body) }));
  return { calls, request, handler };
}

test('signup accepts six characters, confirms internally and returns only session tokens', async () => {
  const { calls, request } = setup();
  const response = await request({ action: 'signup', username: '  Classmate  ', password: '123456' });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { access_token: 'access', refresh_token: 'refresh' });
  const create = calls.find(c => c.url.endsWith('/admin/users'));
  assert.equal(create.body.email_confirm, true);
  assert.equal(create.body.user_metadata.username, 'Classmate');
  assert.match(create.body.email, /^[\da-f-]+@mnchat\.invalid$/);
  assert.equal(calls.at(-1).options.headers.apikey, 'public');
});
test('existing username resolves server-side without modifying existing account or exposing email', async () => {
  const { calls, request } = setup();
  const response = await request({ action: 'login', username: 'Classmate', password: 'old-password' });
  assert.equal(response.status, 200);
  assert.equal(calls.at(-1).body.email, 'existing@example.com');
  assert.equal(calls.filter(c => c.url.endsWith('/admin/users')).length, 0);
  assert.equal(JSON.stringify(await response.json()).includes('email'), false);
});
test('wrong password and unknown username give identical errors', async () => {
  const known = setup({ loginStatus: 400 });
  const unknown = setup({ profiles: [], loginStatus: 400 });
  const body = { action: 'login', username: 'Unknown', password: '123456' };
  const a = await known.request(body), b = await unknown.request(body);
  assert.equal(a.status, 401); assert.equal(b.status, 401);
  assert.deepEqual(await a.json(), await b.json());
});
test('rejects invalid and oversized signup passwords before creating an account', async () => {
  for (const password of ['12345', 'ก'.repeat(25)]) {
    const { calls, request } = setup();
    assert.equal((await request({ action: 'signup', username: 'Student', password })).status, 400);
    assert.equal(calls.length, 0);
  }
});
test('shared rate limit blocks access before account lookup', async () => {
  const { calls, request } = setup({ limited: true });
  assert.equal((await request({ action: 'login', username: 'Student', password: '123456' })).status, 429);
  assert.equal(calls.length, 1);
});
test('literal underscore and percent cannot become username wildcards', async () => {
  const { calls, request } = setup();
  await request({ action: 'login', username: 'qa_%', password: '123456' });
  assert.match(decodeURIComponent(calls.find(c => c.url.includes('/profiles?')).url), /qa\\_\\%/);
});
test('duplicate signup never attempts to log into an existing account', async () => {
  const { calls, request } = setup({ createStatus: 422 });
  assert.equal((await request({ action: 'signup', username: 'Classmate', password: '123456' })).status, 400);
  assert.equal(calls.some(c => c.url.includes('/token?')), false);
});
test('malformed JSON and unsupported HTTP methods are handled', async () => {
  const { handler } = setup();
  assert.equal((await handler(new Request('https://test', { method: 'POST', body: '{' }))).status, 400);
  assert.equal((await handler(new Request('https://test'))).status, 405);
  assert.equal((await handler(new Request('https://test', { method: 'OPTIONS' }))).status, 204);
});
