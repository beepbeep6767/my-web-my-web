// Install @electric-sql/pglite@0.3.14 into .preview/sql-qa to run in-memory SQL tests.
import { PGlite } from '../.preview/sql-qa/node_modules/@electric-sql/pglite/dist/index.js';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz, raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage,public to authenticated;
 grant execute on function auth.uid() to authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);
 alter table storage.objects enable row level security;
 grant select,insert on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
 create publication supabase_realtime;
`);
await db.exec(readFileSync(new URL('./migrations/202609150001_mnchat.sql', import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('./migrations/202610090001_school_access.sql', import.meta.url),'utf8'));
const ids = Array.from({length:5},(_,i)=>`10000000-0000-4000-8000-00000000000${i+1}`);
for (const [i,email] of ['12345@mh.ac.th','30000@mh.ac.th','30001@mh.ac.th','22222@mh.ac.th','outside@gmail.com'].entries()) {
 await db.query('insert into auth.users values($1,$2,$3,now(),$4)',[ids[i],email,i===3?null:new Date().toISOString(),JSON.stringify({username:`school_qa_${i}`})]);
}
await db.query('insert into public.friendships(id,"senderId","recipientId",status) values($1,$2,$3,\'ACCEPTED\')',['20000000-0000-4000-8000-000000000001',ids[0],ids[1]]);
await db.query('insert into public.posts("authorId",text) values($1,\'test\')',[ids[0]]);
async function asUser(id) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); }
async function denied(sql,params) { let rejected = false; try { await db.query(sql,params); } catch(e) { rejected = true; assert.equal(e.code,'42501'); } assert.ok(rejected,'Operation must be rejected'); }
for (const id of ids.slice(2)) {
 await asUser(id);
 assert.equal((await db.query('select public.mnchat_school_verified() ok')).rows[0].ok,false);
 assert.equal((await db.query('select * from public.posts')).rows.length,0);
 assert.equal((await db.query('select * from public.profiles')).rows.length,1);
 await denied('select public.mnchat_send($1,$2,\'blocked\',null)',['20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001']);
 await denied('select public.mnchat_read($1,array[]::uuid[])',['20000000-0000-4000-8000-000000000001']);
 await denied('select public.mnchat_friend_action($1,\'accept\')',['20000000-0000-4000-8000-000000000001']);
 await denied('insert into public.posts("authorId",text) values($1,\'blocked\')',[id]);
 await denied('insert into storage.objects(bucket_id,name,owner_id) values(\'mnchat-media\',$1,$2)',[`${id}/image/test`,id]);
 await denied('select public.mnchat_admin_members()');
}
await asUser(ids[0]);
assert.equal((await db.query('select public.mnchat_school_verified() ok')).rows[0].ok,true);
assert.equal((await db.query('select * from public.posts')).rows.length,1);
await denied('insert into public.mnchat_admins(user_id) values($1)',[ids[0]]);
await denied('select public.mnchat_admin_members()');
await db.query('select public.mnchat_send($1,$2,\'hello\',null)',['20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001']);
await asUser(ids[1]);
const inbox = (await db.query('select public.mnchat_inbox() value')).rows[0].value;
assert.equal(inbox.length,1); assert.equal(inbox[0].unreadCount,1); assert.equal(inbox[0].lastMessage.text,'hello');
await db.exec('reset role'); await db.query('insert into public.mnchat_admins values($1,now())',[ids[0]]);
await asUser(ids[0]);
const members = (await db.query('select * from public.mnchat_admin_members()')).rows;
assert.equal(members.length,5); assert.equal(members.filter(m=>m.email).length,2);
assert.equal((await db.query('select public.mnchat_school_status() value')).rows[0].value.admin,true);
await db.exec('reset role');
for (const email of ['0@mh.ac.th','00000@mh.ac.th','30000@mh.ac.th']) assert.equal((await db.query('select public.mnchat_valid_school_email($1) value',[email])).rows[0].value,true);
for (const email of ['30001@mh.ac.th','1@mh.ac.th.evil.com','123456@mh.ac.th','x@mh.ac.th']) assert.equal((await db.query('select public.mnchat_valid_school_email($1) value',[email])).rows[0].value,false);
await db.close();
console.log('PASS: database migration, school bounds, unconfirmed/outsider RLS, message/read/friend/upload denial, inbox, admin isolation and private email fields');
