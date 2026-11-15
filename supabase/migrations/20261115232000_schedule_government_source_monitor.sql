create extension if not exists http with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
alter table public.intelligence_sources add column if not exists last_content_hash text;

create or replace function private.scan_landsetu_sources()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  src record;
  response extensions.http_response;
  current_hash text;
  run_status text;
  run_summary text;
begin
  for src in select * from public.intelligence_sources where enabled = true loop
    begin
      response := extensions.http_get(src.url);
      run_status := case when response.status between 200 and 299 then 'ok' else 'error' end;
      current_hash := pg_catalog.md5(coalesce(response.content, ''));
      run_summary := 'Scheduled public-source check. HTTP ' || coalesce(response.status::text, 'unknown') || '.';
      if run_status = 'ok' and current_hash is distinct from src.last_content_hash then
        if src.last_content_hash is not null then
          insert into public.intelligence_alerts(project_id,alert_type,severity,title,message,evidence_url)
          values(null,'official_source_changed','medium','Official government source updated',
            'The monitored page changed since the previous daily scan. Review the source for new land-acquisition notifications or guidance. This is a change-detection alert, not an extracted legal finding.',
            src.url);
          run_summary := run_summary || ' Content changed; review alert created.';
        else
          run_summary := run_summary || ' Initial content fingerprint recorded.';
        end if;
        update public.intelligence_sources set last_content_hash=current_hash,last_checked_at=pg_catalog.now(),last_status='ok' where id=src.id;
      else
        update public.intelligence_sources set last_checked_at=pg_catalog.now(),last_status=run_status where id=src.id;
      end if;
      insert into public.intelligence_scan_runs(source_id,status,http_status,discovered_count,summary)
      values(src.id,run_status,response.status,0,run_summary);
    exception when others then
      update public.intelligence_sources set last_checked_at=pg_catalog.now(),last_status='error' where id=src.id;
      insert into public.intelligence_scan_runs(source_id,status,summary,error_message)
      values(src.id,'error','Scheduled source check failed.',left(sqlerrm,800));
    end;
  end loop;
end;
$$;
revoke all on function private.scan_landsetu_sources() from public, anon, authenticated;
select cron.unschedule(jobid) from cron.job where jobname='landsetu-government-source-monitor';
select cron.schedule('landsetu-government-source-monitor','15 3 * * *','select private.scan_landsetu_sources();');