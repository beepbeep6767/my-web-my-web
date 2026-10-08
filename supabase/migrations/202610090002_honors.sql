-- Additive honors feature for original MNChat. Apply after username_auth and feed_retention.
-- Uses the existing MNChat login. No school/OCHAT migration is required.
begin;
create function public.mnchat_honor_member()
returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.profiles where id=auth.uid());
$$;
revoke all on function public.mnchat_honor_member() from public,anon;
grant execute on function public.mnchat_honor_member() to authenticated;
-- A short-lived review grant is separate from the administrator member-directory role.
create table public.honor_review_access (
 user_id uuid not null references public.profiles(id), session_id uuid not null,
 expires_at timestamptz not null, primary key(user_id,session_id)
);
alter table public.honor_review_access enable row level security;
revoke all on public.honor_review_access from public,anon,authenticated;
create or replace function public.mnchat_honor_can_review()
returns boolean language sql stable security definer set search_path='' as $$
 select public.mnchat_honor_member() and exists(select 1 from public.honor_review_access
 where user_id=(select auth.uid()) and session_id::text=(select auth.jwt()->>'session_id') and expires_at>now());
$$;
revoke all on function public.mnchat_honor_can_review() from public,anon;
grant execute on function public.mnchat_honor_can_review() to authenticated;
create function public.mnchat_honor_grant_reviewer(member_id uuid, login_session uuid)
returns timestamptz language plpgsql security definer set search_path='' as $$
declare expiry timestamptz := now()+interval '15 minutes';
begin
 if login_session is null or not exists(select 1 from public.profiles where id=member_id) then
  raise exception 'MNChat member required' using errcode='42501';
 end if;
 insert into public.honor_review_access values(member_id,login_session,expiry)
 on conflict(user_id,session_id) do update set expires_at=excluded.expires_at;
 return expiry;
end $$;
revoke all on function public.mnchat_honor_grant_reviewer(uuid,uuid) from public,anon,authenticated;
grant execute on function public.mnchat_honor_grant_reviewer(uuid,uuid) to service_role;
create function public.mnchat_honor_lock()
returns void language sql security definer set search_path='' as $$
 update public.honor_review_access set expires_at=now() where user_id=(select auth.uid()) and session_id::text=(select auth.jwt()->>'session_id');
$$;
revoke all on function public.mnchat_honor_lock() from public,anon;
grant execute on function public.mnchat_honor_lock() to authenticated;

create table public.honor_submissions (
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references public.profiles(id),
 client_id uuid not null,
 caption text not null check(char_length(trim(caption)) between 3 and 2000),
 image_path text not null,
 created_at timestamptz not null default now(),
 approved_at timestamptz,
 approved_by uuid references public.profiles(id),
 unique(author_id,client_id), unique(image_path),
 check((approved_at is null) = (approved_by is null))
);
create index honor_author_time on public.honor_submissions(author_id,created_at desc);
create index honor_pending on public.honor_submissions(id) where approved_at is null;
create table public.honor_scores (
 user_id uuid primary key references public.profiles(id),
 points bigint not null check(points > 0),
 last_awarded_at timestamptz not null
);
create index honor_ranking on public.honor_scores(points desc,last_awarded_at,user_id);
alter table public.honor_submissions enable row level security;
alter table public.honor_scores enable row level security;
revoke all on public.honor_submissions,public.honor_scores from public,anon,authenticated;
grant select on public.honor_submissions,public.honor_scores to authenticated;
create policy honor_own_or_admin on public.honor_submissions for select to authenticated
 using((select public.mnchat_honor_member()) and (author_id=(select auth.uid()) or (select public.mnchat_honor_can_review())));
create policy honor_scores_read on public.honor_scores for select to authenticated using((select public.mnchat_honor_member()));
create policy honor_admin_image_read on storage.objects for select to authenticated
 using(bucket_id='mnchat-media' and (select public.mnchat_honor_can_review()) and exists(select 1 from public.honor_submissions h where h.image_path=name));

create function public.mnchat_honor_submit(request_id uuid, description text, picture_path text)
returns public.honor_submissions language plpgsql security definer set search_path='' as $$
declare submission public.honor_submissions;
begin
 if not public.mnchat_honor_member() then raise exception 'กรุณาเข้าสู่ระบบ MNChat ก่อนส่งผลงาน' using errcode='42501'; end if;
 -- Serialize submissions by one author, including retries and daily quota checks.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text,0));
 select * into submission from public.honor_submissions where author_id=auth.uid() and client_id=request_id;
 if found then return submission; end if;
 if request_id is null or description is null or char_length(trim(description)) not between 3 and 2000 then raise exception 'กรอกคำอธิบาย 3–2000 ตัวอักษร'; end if;
 if picture_path is null or picture_path not like auth.uid()::text || '/image/%'
  or not exists(select 1 from storage.objects where bucket_id='mnchat-media' and name=picture_path and owner_id=auth.uid()::text)
 then raise exception 'ไม่พบรูปภาพของคุณ' using errcode='42501'; end if;
 if (select count(*) from public.honor_submissions where author_id=auth.uid() and created_at > now()-interval '24 hours') >= 20 then raise exception 'ส่งได้ไม่เกิน 20 ผลงานใน 24 ชั่วโมง'; end if;
 insert into public.honor_submissions(author_id,client_id,caption,image_path) values(auth.uid(),request_id,trim(description),picture_path) returning * into submission;
 return submission;
end $$;
revoke all on function public.mnchat_honor_submit(uuid,text,text) from public,anon;
grant execute on function public.mnchat_honor_submit(uuid,text,text) to authenticated;

create function public.mnchat_honor_approve(submission_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare author uuid;
begin
 if not public.mnchat_honor_can_review() then raise exception 'กรอกรหัสแอดมินเพื่ออนุมัติผลงาน' using errcode='42501'; end if;
 -- The conditional update locks the row: concurrent clicks/retries award exactly once.
 update public.honor_submissions set approved_at=now(),approved_by=auth.uid()
 where id=submission_id and approved_at is null returning author_id into author;
 if not found then
  if not exists(select 1 from public.honor_submissions where id=submission_id) then raise exception 'ไม่พบผลงาน'; end if;
  return false;
 end if;
 insert into public.honor_scores(user_id,points,last_awarded_at) values(author,1,now())
 on conflict(user_id) do update set points=public.honor_scores.points+1,last_awarded_at=excluded.last_awarded_at;
 return true;
end $$;
revoke all on function public.mnchat_honor_approve(uuid) from public,anon;
grant execute on function public.mnchat_honor_approve(uuid) to authenticated;

create function public.mnchat_honor_leaderboard()
returns table("position" bigint,user_id uuid,username text,points bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.mnchat_honor_member() then raise exception 'Sign in to MNChat first' using errcode='42501'; end if;
 return query select rank() over(order by s.points desc),s.user_id,p.username,s.points
 from public.honor_scores s join public.profiles p on p.id=s.user_id
 order by s.points desc,s.last_awarded_at,s.user_id limit 50;
end $$;
revoke all on function public.mnchat_honor_leaderboard() from public,anon;
grant execute on function public.mnchat_honor_leaderboard() to authenticated;
alter publication supabase_realtime add table public.honor_submissions,public.honor_scores;
commit;
