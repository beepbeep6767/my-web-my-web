begin;
create table public.profiles (
 id uuid primary key references auth.users(id), username text not null check (char_length(username) between 2 and 30),
 "avatarId" text, "createdAt" timestamptz not null default now()
);
create unique index profiles_username_unique on public.profiles(lower(username));
create table public.friendships (
 id uuid primary key default gen_random_uuid(), "senderId" uuid not null references public.profiles,
 "recipientId" uuid not null references public.profiles,
 status text not null default 'PENDING' check(status in ('PENDING','ACCEPTED','DECLINED')),
 "createdAt" timestamptz not null default now(), check("senderId" <> "recipientId")
);
create unique index friendships_pair on public.friendships(least("senderId","recipientId"),greatest("senderId","recipientId"));
create table public.messages (
 id uuid primary key default gen_random_uuid(), "conversationId" uuid not null references public.friendships,
 "senderId" uuid not null references public.profiles, "clientId" uuid not null,
 text text not null default '' check(char_length(text)<=4000), "mediaId" text,
 "createdAt" timestamptz not null default now(), "readAt" timestamptz,
 unique("senderId","clientId"), check(length(trim(text))>0 or "mediaId" is not null)
);
create index messages_conversation_time on public.messages("conversationId","createdAt",id);
create table public.posts(id uuid primary key default gen_random_uuid(), "authorId" uuid not null references public.profiles, text text not null check(char_length(trim(text)) between 1 and 4000), "createdAt" timestamptz not null default now());
create table public.comments(id uuid primary key default gen_random_uuid(), "postId" uuid not null references public.posts, "authorId" uuid not null references public.profiles, text text not null check(char_length(trim(text)) between 1 and 2000), "createdAt" timestamptz not null default now());
create index comments_post_time on public.comments("postId","createdAt");
alter table public.profiles enable row level security;
alter table public.friendships enable row level security;
alter table public.messages enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
revoke all on public.profiles,public.friendships,public.messages,public.posts,public.comments from anon,authenticated;
grant select on public.profiles,public.friendships,public.messages,public.posts,public.comments to authenticated;
grant update(username,"avatarId") on public.profiles to authenticated;
grant insert("senderId","recipientId") on public.friendships to authenticated;
grant insert("authorId",text) on public.posts to authenticated;
grant insert("authorId","postId",text) on public.comments to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(true);
create policy profiles_edit on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid() and ("avatarId" is null or "avatarId" like auth.uid()::text || '/image/%'));
create policy friends_read on public.friendships for select to authenticated using(auth.uid() in ("senderId","recipientId"));
create policy friends_request on public.friendships for insert to authenticated with check("senderId"=auth.uid());
create policy messages_read on public.messages for select to authenticated using(exists(select 1 from public.friendships f where f.id="conversationId" and f.status='ACCEPTED' and auth.uid() in(f."senderId",f."recipientId")));
create policy posts_read on public.posts for select to authenticated using(true);
create policy posts_write on public.posts for insert to authenticated with check("authorId"=auth.uid());
create policy comments_read on public.comments for select to authenticated using(true);
create policy comments_write on public.comments for insert to authenticated with check("authorId"=auth.uid());
create function public.mnchat_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,username) values(new.id,coalesce(nullif(trim(new.raw_user_meta_data->>'username'),''),'user_'||left(new.id::text,8))); return new; end $$;
revoke all on function public.mnchat_new_user() from public;
create trigger mnchat_user_created after insert on auth.users for each row execute function public.mnchat_new_user();
create function public.mnchat_friend_action(friend_id uuid, action text) returns void language plpgsql security definer set search_path='' as $$
begin
 if action='accept' then
  update public.friendships set status='ACCEPTED' where id=friend_id and "recipientId"=auth.uid() and status='PENDING';
 elsif action='decline' then
  update public.friendships set status='DECLINED' where id=friend_id and auth.uid() in("senderId","recipientId") and status='PENDING';
 else raise exception 'Invalid action'; end if;
 if not found then raise exception 'Request unavailable'; end if;
end $$;
create function public.mnchat_send(conversation_id uuid, client_id uuid, message_text text, media_path text default null) returns public.messages language plpgsql security definer set search_path='' as $$
declare result public.messages;
begin
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
create function public.mnchat_read(conversation_id uuid, message_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.friendships where id=conversation_id and status='ACCEPTED' and auth.uid() in("senderId","recipientId")) then raise exception 'Conversation access denied'; end if;
 update public.messages set "readAt"=now() where "conversationId"=conversation_id and id=any(message_ids) and "senderId"<>auth.uid() and "readAt" is null;
end $$;
revoke all on function public.mnchat_friend_action(uuid,text), public.mnchat_send(uuid,uuid,text,text),public.mnchat_read(uuid,uuid[]) from public,anon;
grant execute on function public.mnchat_friend_action(uuid,text), public.mnchat_send(uuid,uuid,text,text),public.mnchat_read(uuid,uuid[]) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('mnchat-media','mnchat-media',false,12582912,array['image/jpeg','image/png','image/webp','image/gif','audio/webm','video/webm','audio/ogg','audio/mpeg','audio/mp4','audio/wav','audio/x-m4a']);
create policy mnchat_upload on storage.objects for insert to authenticated with check(bucket_id='mnchat-media' and (storage.foldername(name))[1]=auth.uid()::text);
create policy mnchat_media_read on storage.objects for select to authenticated using(bucket_id='mnchat-media' and (
 owner_id=auth.uid()::text or exists(select 1 from public.profiles p where p."avatarId"=name) or exists(select 1 from public.messages m where m."mediaId"=name)
));
alter publication supabase_realtime add table public.messages,public.friendships,public.profiles,public.posts,public.comments;
commit;
