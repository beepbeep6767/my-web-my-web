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
 create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('session_id',current_setting('request.jwt.claim.session_id',true))$$;
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

await db.exec(readFileSync(new URL('./migrations/202610090002_honors.sql',import.meta.url),'utf8'));
const ids = Array.from({length:55},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
for(const [i,id] of ids.entries()) await db.query('insert into auth.users values($1,$2,$3,now(),$4)',[id,`member${i+1}@mnchat.invalid`,i===2?null:new Date().toISOString(),JSON.stringify({username:`honor_qa_${i}`})]);
const session='90000000-0000-4000-8000-000000000001';
async function asUser(id) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.query("select set_config('request.jwt.claim.session_id',$1,false)",[session]); await db.exec('set role authenticated'); }
async function denied(sql,params) { await assert.rejects(db.query(sql,params),e=>e.code==='42501'); }
const path = `${ids[1]}/image/proof`;
await db.query("insert into storage.objects(bucket_id,name,owner_id) values('mnchat-media',$1,$2)",[path,ids[1]]);
await asUser('10000000-0000-4000-8000-000000009999');
await denied("select public.mnchat_honor_submit(gen_random_uuid(),'helped friend',$1)",[path]);
await denied('select public.mnchat_honor_leaderboard()');
await asUser(ids[1]);
await denied("insert into public.honor_scores values($1,1000,now())",[ids[1]]);
await denied("insert into public.honor_submissions(author_id,client_id,caption,image_path) values($1,gen_random_uuid(),'forged',$2)",[ids[1],path]);
await denied("select public.mnchat_honor_submit(gen_random_uuid(),'forged', $1)",[`${ids[0]}/image/other`]);
const requestId = '20000000-0000-4000-8000-000000000001';
const submit = async()=> (await db.query("select * from public.mnchat_honor_submit($1,'Helped a friend',$2)",[requestId,path])).rows[0];
const first = await submit(), retry = await submit();
assert.equal(first.id,retry.id);
assert.equal((await db.query('select * from public.honor_submissions')).rows.length,1);
await denied('select public.mnchat_honor_approve($1)',[first.id]);
await denied('update public.honor_submissions set approved_at=now(),approved_by=$1 where id=$2',[ids[1],first.id]);
await asUser(ids[3]);
assert.equal((await db.query('select * from public.honor_submissions')).rows.length,0);
assert.equal((await db.query('select * from storage.objects where name=$1',[path])).rows.length,0);
await asUser(ids[0]);
await denied('select public.mnchat_honor_grant_reviewer($1,$2)',[ids[0],session]);
await denied('select public.mnchat_honor_approve($1)',[first.id]);
await db.exec('reset role');
await db.query('select public.mnchat_honor_grant_reviewer($1,$2)',[ids[0],session]);
await asUser(ids[0]);
assert.equal((await db.query('select * from storage.objects where name=$1',[path])).rows.length,1);
assert.equal((await db.query('select public.mnchat_honor_approve($1) awarded',[first.id])).rows[0].awarded,true);
assert.equal((await db.query('select public.mnchat_honor_approve($1) awarded',[first.id])).rows[0].awarded,false);
assert.equal((await db.query('select points from public.honor_scores where user_id=$1',[ids[1]])).rows[0].points,1);
await db.exec('reset role');
// The next row reuses the same owner but a distinct uploaded photo.
const path2 = `${ids[1]}/image/proof-two`;
await db.query("insert into storage.objects(bucket_id,name,owner_id) values('mnchat-media',$1,$2)",[path2,ids[1]]);
await asUser(ids[1]);
const second=(await db.query("select * from public.mnchat_honor_submit(gen_random_uuid(),'Another helpful action',$1)",[path2])).rows[0];
await asUser(ids[0]);
await db.query('select public.mnchat_honor_approve($1)',[second.id]);
assert.equal((await db.query('select points from public.honor_scores where user_id=$1',[ids[1]])).rows[0].points,2);
await db.exec('reset role');
for (const [index,id] of ids.entries()) {
 if(index===1 || index===2) continue;
 await db.query('insert into public.honor_scores values($1,$2,now())',[id,index===3?2:1]);
}
await asUser(ids[1]);
const leaders=(await db.query('select * from public.mnchat_honor_leaderboard()')).rows;
assert.equal(leaders.length,50);
assert.equal(leaders[0].points,2); assert.equal(leaders[1].points,2);
assert.equal(leaders[0].position,1); assert.equal(leaders[1].position,1);
assert.deepEqual(Object.keys(leaders[0]).sort(),['points','position','user_id','username']);
assert.equal(new Set(leaders.map(r=>r.user_id)).size,50);
await db.exec('reset role');
// Review access is restricted to the unlocked login session and expires server-side.
await asUser(ids[0]);
await db.query("select set_config('request.jwt.claim.session_id','90000000-0000-4000-8000-000000000002',false)");
await denied('select public.mnchat_honor_approve($1)',[second.id]);
await asUser(ids[0]);
await db.query('select public.mnchat_honor_lock()');
await denied('select public.mnchat_honor_approve($1)',[second.id]);
await db.exec('reset role');
await db.query("update public.honor_review_access set expires_at=now()-interval '1 second' where user_id=$1",[ids[0]]);
await asUser(ids[0]);
await denied('select public.mnchat_honor_approve($1)',[second.id]);
await db.exec('reset role; set role anon');
await denied('select public.mnchat_honor_leaderboard()');
await db.close();
console.log('PASS: honor ownership, non-member/reviewer access, image privacy, idempotent submission/approval, point totals, tied top-50 and role revocation');
