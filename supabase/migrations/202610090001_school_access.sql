-- Requires email confirmations ON and a working custom SMTP sender before rollout.
-- Existing users keep their accounts and data, but must verify their school mailbox.
begin;

create or replace function public.mnchat_valid_school_email(value text)
returns boolean language sql immutable set search_path = '' as $$
  select case when lower(value) ~ '^[0-9]{1,5}@mh\.ac\.th$'
    then split_part(value, '@', 1)::integer between 0 and 30000 else false end;
$$;
revoke all on function public.mnchat_valid_school_email(text) from public, anon, authenticated;

create or replace function public.mnchat_school_verified()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u where u.id = (select auth.uid())
    and u.email_confirmed_at is not null and public.mnchat_valid_school_email(u.email));
$$;
revoke all on function public.mnchat_school_verified() from public, anon;
grant execute on function public.mnchat_school_verified() to authenticated;

-- No browser role can grant itself administration access.
create table public.mnchat_admins (
  user_id uuid primary key references auth.users(id),
  granted_at timestamptz not null default now()
);
alter table public.mnchat_admins enable row level security;
revoke all on public.mnchat_admins from public, anon, authenticated;

create or replace function public.mnchat_school_status()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare person jsonb; verified boolean;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  select to_jsonb(p) into person from public.profiles p where p.id = auth.uid();
  if person is null then raise exception 'Profile unavailable'; end if;
  verified := public.mnchat_school_verified();
  return jsonb_build_object('user', person, 'verified', verified, 'admin',
    verified and exists(select 1 from public.mnchat_admins a where a.user_id = auth.uid()));
end $$;
revoke all on function public.mnchat_school_status() from public, anon;
grant execute on function public.mnchat_school_status() to authenticated;

-- Restrictive policies also protect callers who bypass the website completely.
-- An unverified user may read only their own profile to finish onboarding.
create policy school_profiles_read on public.profiles as restrictive for select to authenticated
  using(id = (select auth.uid()) or (select public.mnchat_school_verified()));
create policy school_profiles_edit on public.profiles as restrictive for update to authenticated
  using((select public.mnchat_school_verified())) with check((select public.mnchat_school_verified()));
create policy school_friends on public.friendships as restrictive for all to authenticated
  using((select public.mnchat_school_verified())) with check((select public.mnchat_school_verified()));
create policy school_messages on public.messages as restrictive for all to authenticated
  using((select public.mnchat_school_verified())) with check((select public.mnchat_school_verified()));
create policy school_posts on public.posts as restrictive for all to authenticated
  using((select public.mnchat_school_verified())) with check((select public.mnchat_school_verified()));
create policy school_comments on public.comments as restrictive for all to authenticated
  using((select public.mnchat_school_verified())) with check((select public.mnchat_school_verified()));
create policy school_media on storage.objects as restrictive for all to authenticated
  using(bucket_id <> 'mnchat-media' or (select public.mnchat_school_verified()))
  with check(bucket_id <> 'mnchat-media' or (select public.mnchat_school_verified()));

-- Security-definer RPCs need an explicit gate because table RLS does not apply to their owner.
create or replace function public.mnchat_friend_action(friend_id uuid, action text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.mnchat_school_verified() then raise exception 'School email verification required' using errcode='42501'; end if;
 if action='accept' then
  update public.friendships set status='ACCEPTED' where id=friend_id and "recipientId"=auth.uid() and status='PENDING';
 elsif action='decline' then
  update public.friendships set status='DECLINED' where id=friend_id and auth.uid() in("senderId","recipientId") and status='PENDING';
 else raise exception 'Invalid action'; end if;
 if not found then raise exception 'Request unavailable'; end if;
end $$;
create or replace function public.mnchat_send(conversation_id uuid, client_id uuid, message_text text, media_path text default null)
returns public.messages language plpgsql security definer set search_path='' as $$
declare result public.messages;
begin
 if not public.mnchat_school_verified() then raise exception 'School email verification required' using errcode='42501'; end if;
 if auth.uid() is null or not exists(select 1 from public.friendships where id=conversation_id and status='ACCEPTED' and auth.uid() in("senderId","recipientId")) then raise exception 'Conversation access denied'; end if;
 select * into result from public.messages where "senderId"=auth.uid() and "clientId"=client_id;
 if found then
  if result."conversationId"<>conversation_id then raise exception 'Invalid retry'; end if;
  return result;
 end if;
 if media_path is not null and (media_path not like auth.uid()::text || '/%' or not exists(select 1 from storage.objects where bucket_id='mnchat-media' and name=media_path and owner_id=auth.uid()::text)) then raise exception 'Attachment unavailable'; end if;
 insert into public.messages("conversationId","senderId","clientId",text,"mediaId") values(conversation_id,auth.uid(),client_id,trim(message_text),media_path) returning * into result;
 return result;
end $$;
create or replace function public.mnchat_read(conversation_id uuid, message_ids uuid[])
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.mnchat_school_verified() then raise exception 'School email verification required' using errcode='42501'; end if;
 if auth.uid() is null or not exists(select 1 from public.friendships where id=conversation_id and status='ACCEPTED' and auth.uid() in("senderId","recipientId")) then raise exception 'Conversation access denied'; end if;
 update public.messages set "readAt"=now() where "conversationId"=conversation_id and id=any(message_ids) and "senderId"<>auth.uid() and "readAt" is null;
end $$;

create or replace function public.mnchat_admin_members(after_id uuid default null)
returns table(id uuid, username text, email text, verified_at timestamptz, last_sign_in_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.mnchat_school_verified() or not exists(select 1 from public.mnchat_admins a where a.user_id=auth.uid()) then
  raise exception 'Administrator access required' using errcode='42501';
 end if;
 return query select p.id, p.username,
  case when public.mnchat_valid_school_email(u.email) and u.email_confirmed_at is not null then u.email::text end,
  case when public.mnchat_valid_school_email(u.email) then u.email_confirmed_at end,
  u.last_sign_in_at from public.profiles p join auth.users u on u.id=p.id
  where after_id is null or p.id > after_id order by p.id limit 50;
end $$;
revoke all on function public.mnchat_admin_members(uuid) from public, anon;
grant execute on function public.mnchat_admin_members(uuid) to authenticated;

create index if not exists messages_unread_by_conversation on public.messages("conversationId", "senderId") where "readAt" is null;
create index if not exists friends_sender_status on public.friendships("senderId", status);
create index if not exists friends_recipient_status on public.friendships("recipientId", status);

-- One request replaces two requests per friend. Runs as the caller; existing RLS applies.
create or replace function public.mnchat_inbox()
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'user', to_jsonb(p),
  'lastMessage', (select to_jsonb(m) from public.messages m where m."conversationId"=f.id order by m."createdAt" desc, m.id desc limit 1),
  'unreadCount', (select count(*) from public.messages m where m."conversationId"=f.id and m."senderId" <> (select auth.uid()) and m."readAt" is null)
 ) order by f."createdAt" desc), '[]'::jsonb)
 from public.friendships f join public.profiles p on p.id = case when f."senderId"=(select auth.uid()) then f."recipientId" else f."senderId" end
 where f.status='ACCEPTED' and (select auth.uid()) in(f."senderId",f."recipientId");
$$;
revoke all on function public.mnchat_inbox() from public, anon;
grant execute on function public.mnchat_inbox() to authenticated;
commit;
