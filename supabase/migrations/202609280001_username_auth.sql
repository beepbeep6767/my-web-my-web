begin;
-- Only the server-side login function may use these counters.
create table if not exists public.mnchat_auth_attempts (
  key text primary key,
  attempts integer not null default 1,
  created_at timestamptz not null default now()
);
alter table public.mnchat_auth_attempts enable row level security;
revoke all on public.mnchat_auth_attempts from public, anon, authenticated;
create or replace function public.mnchat_auth_limit(bucket_key text, maximum integer)
returns boolean language plpgsql security definer set search_path='' as $$
declare used integer;
begin
  if maximum < 1 or maximum > 100 or length(bucket_key) > 200 then
    raise exception 'Invalid limit';
  end if;
  delete from public.mnchat_auth_attempts where created_at < now() - interval '1 day';
  insert into public.mnchat_auth_attempts(key) values(bucket_key)
  on conflict(key) do update set attempts=public.mnchat_auth_attempts.attempts+1
  returning attempts into used;
  return used <= maximum;
end $$;
revoke all on function public.mnchat_auth_limit(text,integer) from public, anon, authenticated;
grant execute on function public.mnchat_auth_limit(text,integer) to service_role;
commit;
