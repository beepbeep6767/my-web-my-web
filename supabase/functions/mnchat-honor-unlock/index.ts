// Only this server function receives the review code. Never expose it through VITE_*.
export function createHandler({ url, serviceKey, anonKey, reviewCode, fetcher = fetch }) {
 const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods':'POST, OPTIONS', 'Content-Type':'application/json', 'Cache-Control':'no-store' };
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 async function digest(value) { return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))); }
 async function rpc(name,body) {
  const response=await fetcher(url+'/rest/v1/rpc/'+name,{method:'POST',headers:{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
  return {ok:response.ok,data:await response.json()};
 }
 return async request=>{
  if(request.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(request.method!=='POST') return reply(405,{error:'Method not allowed'});
  if(!url||!serviceKey||!anonKey||!reviewCode) return reply(503,{error:'ผู้ดูแลยังไม่ได้ตั้งรหัสอนุมัติบนเซิร์ฟเวอร์'});
  try {
   const authorization=request.headers.get('authorization')||'';
   if(!authorization.startsWith('Bearer ')) return reply(401,{error:'กรุณาเข้าสู่ระบบก่อน'});
   if(Number(request.headers.get('content-length'))>1024) return reply(413,{error:'ข้อมูลยาวเกินไป'});
   const raw=await request.text(); if(raw.length>1024) return reply(413,{error:'ข้อมูลยาวเกินไป'});
   let body; try { body=JSON.parse(raw); } catch { return reply(400,{error:'ข้อมูลไม่ถูกต้อง'}); }
   if(typeof body?.code!=='string'||body.code.length<1||body.code.length>128) return reply(400,{error:'กรอกรหัสแอดมิน'});
   // Auth validates the JWT before any payload field or user ID is trusted.
   const response=await fetcher(url+'/auth/v1/user',{headers:{apikey:anonKey,Authorization:authorization},signal:AbortSignal.timeout(15000)});
   if(!response.ok) return reply(401,{error:'กรุณาเข้าสู่ระบบใหม่'});
   const user=await response.json();
   const encoded=authorization.slice(7).split('.')[1];
   const claims=JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')));
   if(!user.id||claims.sub!==user.id||! /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(claims.session_id||'')) return reply(401,{error:'กรุณาเข้าสู่ระบบใหม่'});
   const school=/^([0-9]{1,5})@mh\.ac\.th$/i.exec(user.email||'');
   if(!user.email_confirmed_at||!school||Number(school[1])>30000) return reply(403,{error:'ยืนยันอีเมลโรงเรียนก่อน'});
   const bucket=Math.floor(Date.now()/900000);
   const ip=request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()||'unknown';
   const ipHash=Array.from(await digest(serviceKey+ip),n=>n.toString(16).padStart(2,'0')).join('');
   for(const [key,max] of [[`honor:user:${user.id}:${bucket}`,5],[`honor:ip:${ipHash}:${bucket}`,20]]) {
    const limited=await rpc('mnchat_auth_limit',{bucket_key:key,maximum:max});
    if(!limited.ok) return reply(503,{error:'ระบบตรวจรหัสยังไม่พร้อม'});
    if(limited.data!==true) return reply(429,{error:'ลองรหัสหลายครั้งเกินไป กรุณารอ 15 นาที'});
   }
   const expected=await digest(reviewCode),actual=await digest(body.code);
   let difference=0; for(let i=0;i<expected.length;i++) difference|=expected[i]^actual[i];
   if(difference!==0) return reply(403,{error:'รหัสแอดมินไม่ถูกต้อง'});
   const granted=await rpc('mnchat_honor_grant_reviewer',{member_id:user.id,login_session:claims.session_id});
   if(!granted.ok) return reply(503,{error:'เปิดส่วนอนุมัติไม่สำเร็จ กรุณาลองใหม่'});
   return reply(200,{expires_at:granted.data});
  } catch { return reply(503,{error:'เชื่อมต่อระบบตรวจรหัสไม่ได้ กรุณาลองใหม่'}); }
 };
}
if(typeof Deno!=='undefined') Deno.serve(createHandler({url:Deno.env.get('SUPABASE_URL'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anonKey:Deno.env.get('SUPABASE_ANON_KEY'),reviewCode:Deno.env.get('MNCHAT_HONOR_REVIEW_CODE')}));
