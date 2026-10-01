// Public username/password entry point. Service credentials never leave this function.
export function createHandler({ url, serviceKey, anonKey, fetcher = fetch }) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  };
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: cors });
  async function call(path, body, admin = true, method = 'POST') {
    const key = admin ? serviceKey : anonKey;
    const response = await fetcher(url + path, {
      method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    return { ok: response.ok, status: response.status, data };
  }
  async function hash(value) {
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
  }
  return async function handler(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { error: 'Method not allowed' });
    if (!url || !serviceKey || !anonKey) return reply(503, { error: 'ระบบเข้าสู่ระบบยังไม่พร้อม กรุณาลองใหม่ภายหลัง' });
    try {
      if (Number(request.headers.get('content-length')) > 4096) return reply(413, { error: 'ข้อมูลยาวเกินไป' });
      const raw = await request.text();
      if (raw.length > 4096) return reply(413, { error: 'ข้อมูลยาวเกินไป' });
      let input;
      try { input = JSON.parse(raw); } catch { return reply(400, { error: 'ข้อมูลไม่ถูกต้อง' }); }
      if (!input || typeof input !== 'object') return reply(400, { error: 'ข้อมูลไม่ถูกต้อง' });
      const { action, password } = input;
      const username = typeof input.username === 'string' ? input.username.trim() : '';
      if (!['login', 'signup'].includes(action) || username.length < 2 || username.length > 30 || /[\u0000-\u001f\u007f]/u.test(username)) {
        return reply(400, { error: 'กรุณาใส่ชื่อผู้ใช้ 2–30 ตัวอักษร' });
      }
      if (typeof password !== 'string' || !password.length || new TextEncoder().encode(password).length > 72 || (action === 'signup' && password.length < 6)) {
        return reply(400, { error: 'รหัสผ่านสมัครสมาชิกต้องมีอย่างน้อย 6 ตัวอักษร และไม่เกิน 72 ไบต์' });
      }
      // Atomic shared limits apply across function instances, even before an account exists.
      const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
      const bucket = Math.floor(Date.now() / 900000);
      const limits = [
        [`${action}:ip:${await hash(serviceKey + ip)}:${bucket}`, action === 'signup' ? 5 : 60],
        [`${action}:name:${await hash(username.toLowerCase())}:${bucket}`, action === 'signup' ? 5 : 12],
      ];
      for (const [key, maximum] of limits) {
        const limit = await call('/rest/v1/rpc/mnchat_auth_limit', { bucket_key: key, maximum });
        if (!limit.ok) return reply(503, { error: 'ระบบเข้าสู่ระบบยังไม่พร้อม กรุณาลองใหม่ภายหลัง' });
        if (limit.data !== true) return reply(429, { error: 'ลองหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่' });
      }
      let email;
      if (action === 'signup') {
        // Internal routing address only: no mailbox, Gmail account or confirmation email needed.
        email = `${crypto.randomUUID()}@mnchat.invalid`;
        const created = await call('/auth/v1/admin/users', { email, password, email_confirm: true, user_metadata: { username } });
        if (!created.ok) {
          return reply(created.status === 422 || created.status === 400 ? 400 : 409, { error: 'สมัครไม่สำเร็จ ชื่อผู้ใช้อาจถูกใช้แล้ว หรือรหัสผ่านไม่ผ่านข้อกำหนด กรุณาลองชื่ออื่น' });
        }
      } else {
        const escaped = username.replace(/[\\%_]/g, '\\$&');
        const found = await call(`/rest/v1/profiles?select=id,username&username=ilike.${encodeURIComponent(escaped)}&limit=2`, null, true, 'GET');
        if (!found.ok) return reply(503, { error: 'ไม่สามารถตรวจบัญชีได้ กรุณาลองใหม่' });
        const person = Array.isArray(found.data) && found.data.length === 1 ? found.data[0] : null;
        if (person) {
          const account = await call(`/auth/v1/admin/users/${encodeURIComponent(person.id)}`, null, true, 'GET');
          if (!account.ok) return reply(503, { error: 'ไม่สามารถตรวจบัญชีได้ กรุณาลองใหม่' });
          email = account.data.email;
        }
        // Use the same password-verification path for unknown usernames.
        email ||= 'nonexistent@mnchat.invalid';
      }
      const signed = await call('/auth/v1/token?grant_type=password', { email, password }, false);
      if (!signed.ok || !signed.data.access_token || !signed.data.refresh_token) {
        if (action === 'signup') return reply(503, { error: 'สร้างบัญชีแล้ว แต่ยังเข้าไม่ได้ กรุณาลองเข้าสู่ระบบด้วยชื่อผู้ใช้และรหัสผ่านเดิม' });
        return reply(signed.status === 429 ? 429 : 401, { error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง หรือบัญชียังไม่พร้อมใช้งาน' });
      }
      return reply(200, { access_token: signed.data.access_token, refresh_token: signed.data.refresh_token });
    } catch {
      // Never log request bodies, passwords, tokens or upstream credential-bearing data.
      return reply(503, { error: 'เชื่อมต่อระบบไม่ได้ กรุณาลองใหม่อีกครั้ง' });
    }
  };
}

if (typeof Deno !== 'undefined') {
  Deno.serve(createHandler({
    url: Deno.env.get('SUPABASE_URL'),
    serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
    anonKey: Deno.env.get('SUPABASE_ANON_KEY'),
  }));
}
