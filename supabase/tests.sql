-- Run in the SQL Editor. Every fixture is rolled back; no account remains.
begin;
insert into auth.users(id,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','{"username":"qa_sender"}'),
('10000000-0000-4000-8000-000000000002','{"username":"qa_recipient"}'),
('10000000-0000-4000-8000-000000000003','{"username":"qa_outsider"}');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
insert into public.friendships("senderId","recipientId") values('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.mnchat_friend_action(id,'accept') from public.friendships;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.mnchat_send(id,'20000000-0000-4000-8000-000000000001','QA message',null) from public.friendships;
select public.mnchat_send(id,'20000000-0000-4000-8000-000000000001','QA message',null) from public.friendships;
do $$ begin if (select count(*) from public.messages)<>1 then raise exception 'Message deduplication failed'; end if; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.mnchat_read("conversationId",array[id]) from public.messages;
do $$ begin if (select count(*) from public.messages where "readAt" is not null)<>1 then raise exception 'Read receipt failed'; end if; end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$ begin if exists(select 1 from public.messages) then raise exception 'Private messages leaked'; end if; if exists(select 1 from public.friendships) then raise exception 'Friendships leaked'; end if; end $$;
rollback;
select 'PASS: request, accept, send, deduplicate, read receipt, outsider isolation; fixtures rolled back' as result;
