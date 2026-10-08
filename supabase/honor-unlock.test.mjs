import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from './functions/mnchat-honor-unlock/index.ts';
const id='10000000-0000-4000-8000-000000000001',session='90000000-0000-4000-8000-000000000001';
const token='header.'+Buffer.from(JSON.stringify({sub:id,session_id:session})).toString('base64url')+'.signature';
function setup(options={}) {
 const calls=[];
 const handler=createHandler({url:'https://test.supabase.co',serviceKey:'service-only',anonKey:'public',reviewCode:'local-test-code',fetcher:async(url,request)=>{
  calls.push({url,body:request.body?JSON.parse(request.body):null});
  const data=url.endsWith('/user')?{id,email:options.email||'internal@mnchat.invalid',email_confirmed_at:options.unverified?null:'2026-10-09'}:url.endsWith('mnchat_auth_limit')?!options.limited:'2026-10-09T00:15:00Z';
  return new Response(JSON.stringify(data),{status:options.unauthenticated&&url.endsWith('/user')?401:200});
 }});
 return{calls,request:(code='local-test-code')=>handler(new Request('https://test/functions/v1/mnchat-honor-unlock',{method:'POST',headers:{authorization:`Bearer ${token}`},body:JSON.stringify({code})}))};
}
test('correct review code grants only authenticated user and current login session',async()=>{
 const {calls,request}=setup(); const response=await request();
 assert.equal(response.status,200); assert.deepEqual(await response.json(),{expires_at:'2026-10-09T00:15:00Z'});
 assert.deepEqual(calls.at(-1).body,{member_id:id,login_session:session});
 assert.equal(calls.some(call=>JSON.stringify(call.body).includes('local-test-code')),false);
});
test('wrong code, expired authentication and rate limits never grant access',async()=>{
 for(const [options,code,status] of [[{},'wrong',403],[{unauthenticated:true},undefined,401],[{limited:true},undefined,429]]) {
  const {calls,request}=setup(options); assert.equal((await request(code)).status,status);
  assert.equal(calls.some(call=>call.url.endsWith('mnchat_honor_grant_reviewer')),false);
 }
});
test('missing secret fails closed before any network call',async()=>{
 const handler=createHandler({url:'test',serviceKey:'test',anonKey:'test',fetcher:()=>assert.fail('no network')});
 assert.equal((await handler(new Request('https://test',{method:'POST'}))).status,503);
});
