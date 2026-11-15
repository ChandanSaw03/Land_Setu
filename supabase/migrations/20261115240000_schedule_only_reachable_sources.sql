alter table public.intelligence_sources add column if not exists scheduled_enabled boolean not null default false;
update public.intelligence_sources set scheduled_enabled=(url='https://bhoomirashi.gov.in/auth/revamp/search_proj.cshtml');
create or replace function private.trigger_landsetu_intelligence_scan()
returns bigint language plpgsql security definer set search_path = '' as $$
declare secret_token uuid; request_id bigint;
begin
  select token into secret_token from public.landsetu_cron_secrets where id=1;
  if secret_token is null then raise exception 'LandSetu scheduled scan token is not configured'; end if;
  select net.http_post(
    url := 'https://jpzhfmizcijxryjbhjrl.supabase.co/functions/v1/landsetu-intelligence',
    body := jsonb_build_object('action','scan_sources','scheduled_only',true),
    headers := jsonb_build_object('Content-Type','application/json','x-landsetu-cron-token',secret_token::text),
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.trigger_landsetu_intelligence_scan() from public, anon, authenticated;