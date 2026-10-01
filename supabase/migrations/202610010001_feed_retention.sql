-- Run as postgres in Supabase SQL Editor after the earlier migrations.
-- Existing posts older than two hours will be deleted on the next cron run.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create index if not exists posts_created_at on public.posts("createdAt");

alter policy posts_read on public.posts
  using ("createdAt" > now() - interval '2 hours');
alter policy comments_read on public.comments
  using (exists (select 1 from public.posts p where p.id = "postId"));
alter policy comments_write on public.comments
  with check ("authorId" = auth.uid() and exists (
    select 1 from public.posts p where p.id = "postId"
      and p."createdAt" > now() - interval '2 hours'
  ));

create or replace function public.mnchat_cleanup_feed()
returns integer language plpgsql security definer set search_path = '' as $$
declare expired_ids uuid[]; removed integer;
begin
  -- Lock parents before deleting replies: concurrent FK inserts must wait.
  select array_agg(p.id) into expired_ids from (
    select id from public.posts
    where "createdAt" <= now() - interval '2 hours'
    order by "createdAt" limit 5000 for update
  ) p;
  if expired_ids is null then return 0; end if;
  delete from public.comments where "postId" = any(expired_ids);
  delete from public.posts where id = any(expired_ids);
  get diagnostics removed = row_count;
  return removed;
end;
$$;
revoke all on function public.mnchat_cleanup_feed() from public, anon, authenticated;
-- A named schedule is updated, rather than duplicated, on reinstallation.
-- RLS hides expired posts immediately; physical deletion follows each minute.
select cron.schedule('mnchat-feed-retention', '* * * * *',
  'select public.mnchat_cleanup_feed();');
commit;
