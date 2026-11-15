create extension if not exists pg_net;
create table if not exists public.landsetu_cron_secrets (
  id smallint primary key check (id=1),
  token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.landsetu_cron_secrets enable row level security;
revoke all on public.landsetu_cron_secrets from public, anon, authenticated;
grant all on public.landsetu_cron_secrets to service_role;
insert into public.landsetu_cron_secrets(id) values(1) on conflict(id) do nothing;

create or replace function private.trigger_landsetu_intelligence_scan()
returns bigint language plpgsql security definer set search_path = '' as $$
declare secret_token uuid; request_id bigint;
begin
  select token into secret_token from public.landsetu_cron_secrets where id=1;
  if secret_token is null then raise exception 'LandSetu scheduled scan token is not configured'; end if;
  select net.http_post(
    url := 'https://jpzhfmizcijxryjbhjrl.supabase.co/functions/v1/landsetu-intelligence',
    body := jsonb_build_object('action','scan_sources'),
    headers := jsonb_build_object('Content-Type','application/json','x-landsetu-cron-token',secret_token::text),
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.trigger_landsetu_intelligence_scan() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname='landsetu-government-source-monitor';
select cron.schedule('landsetu-government-source-monitor','15 3 * * *','select private.trigger_landsetu_intelligence_scan();');