create table if not exists public.ai_prediction_queue (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parcel_id uuid references public.land_parcels(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','processing','completed','failed')),
  attempts integer not null default 0,
  scheduled_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ai_prediction_queue_project_uq on public.ai_prediction_queue(project_id) where parcel_id is null;
create unique index if not exists ai_prediction_queue_parcel_uq on public.ai_prediction_queue(parcel_id) where parcel_id is not null;
create index if not exists ai_prediction_queue_due_idx on public.ai_prediction_queue(status,scheduled_at,created_at);
alter table public.ai_prediction_queue enable row level security;
revoke all on public.ai_prediction_queue from public,anon,authenticated;
grant all on public.ai_prediction_queue to service_role;

create or replace function private.enqueue_landsetu_prediction(p_project_id uuid,p_parcel_id uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_project_id is null then return; end if;
  if p_parcel_id is null then
    insert into public.ai_prediction_queue(project_id,parcel_id,status,attempts,scheduled_at,last_error,updated_at)
    values(p_project_id,null,'pending',0,now(),null,now())
    on conflict (project_id) where parcel_id is null
    do update set status='pending',attempts=0,scheduled_at=now(),last_error=null,updated_at=now();
  else
    insert into public.ai_prediction_queue(project_id,parcel_id,status,attempts,scheduled_at,last_error,updated_at)
    values(p_project_id,p_parcel_id,'pending',0,now(),null,now())
    on conflict (parcel_id) where parcel_id is not null
    do update set project_id=excluded.project_id,status='pending',attempts=0,scheduled_at=now(),last_error=null,updated_at=now();
  end if;
end;
$$;
revoke all on function private.enqueue_landsetu_prediction(uuid,uuid) from public,anon,authenticated;

create or replace function private.queue_landsetu_prediction_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare pid uuid; paid uuid;
begin
  if TG_TABLE_NAME='projects' then
    pid:=coalesce(NEW.id,OLD.id);
    perform private.enqueue_landsetu_prediction(pid,null);
    perform private.enqueue_landsetu_prediction(pid,p.id) from public.land_parcels p where p.project_id=pid;
  elsif TG_TABLE_NAME='land_parcels' then
    perform private.enqueue_landsetu_prediction(coalesce(NEW.project_id,OLD.project_id),coalesce(NEW.id,OLD.id));
  elsif TG_TABLE_NAME='legal_cases' then
    pid:=coalesce(NEW.project_id,OLD.project_id); paid:=coalesce(NEW.parcel_id,OLD.parcel_id);
    perform private.enqueue_landsetu_prediction(pid,paid);
  elsif TG_TABLE_NAME='parcel_acquisitions' then
    perform private.enqueue_landsetu_prediction(coalesce(NEW.project_id,OLD.project_id),coalesce(NEW.parcel_id,OLD.parcel_id));
  elsif TG_TABLE_NAME in ('acquisition_milestones','acquisition_awards') then
    perform private.enqueue_landsetu_prediction(coalesce(NEW.project_id,OLD.project_id),null);
    if TG_TABLE_NAME='acquisition_awards' then
      paid:=coalesce(NEW.acquisition_id,OLD.acquisition_id);
      if paid is not null then
        perform private.enqueue_landsetu_prediction(a.project_id,a.parcel_id)
        from public.parcel_acquisitions a where a.id=paid;
      end if;
    end if;
  elsif TG_TABLE_NAME='intelligence_documents' then
    if coalesce(NEW.verification_status,OLD.verification_status)='verified' then
      pid:=coalesce(NEW.project_id,OLD.project_id); paid:=coalesce(NEW.parcel_id,OLD.parcel_id);
      perform private.enqueue_landsetu_prediction(pid,paid);
    end if;
  end if;
  return coalesce(NEW,OLD);
end;
$$;
revoke all on function private.queue_landsetu_prediction_changes() from public,anon,authenticated;

drop trigger if exists queue_ai_prediction_project on public.projects;
create trigger queue_ai_prediction_project after insert or update of status,progress,expected_completion,acquisition_stage,approval_delay_days,dispute_count,possession_progress,rehabilitation_progress,estimated_delay_days,acquisition_delay_reason on public.projects for each row execute function private.queue_landsetu_prediction_changes();
drop trigger if exists queue_ai_prediction_parcel on public.land_parcels;
create trigger queue_ai_prediction_parcel after insert or update of acquisition_status,compensation_estimated,compensation_paid,compensation_status,area_acres,notes on public.land_parcels for each row execute function private.queue_landsetu_prediction_changes();
drop trigger if exists queue_ai_prediction_case on public.legal_cases;
create trigger queue_ai_prediction_case after insert or update of status,priority,next_hearing_date,last_order,resolution,verification_status on public.legal_cases for each row execute function private.queue_landsetu_prediction_changes();
drop trigger if exists queue_ai_prediction_acquisition on public.parcel_acquisitions;
create trigger queue_ai_prediction_acquisition after insert or update of notice_date,response_deadline,consent_status,objection_status,objection_notes,acquisition_stage,possession_date,notes on public.parcel_acquisitions for each row execute function private.queue_landsetu_prediction_changes();
drop trigger if exists queue_ai_prediction_milestone on public.acquisition_milestones;
create trigger queue_ai_prediction_milestone after insert or update of milestone_type,event_date,notes on public.acquisition_milestones for each row execute function private.queue_landsetu_prediction_changes();
drop trigger if exists queue_ai_prediction_award on public.acquisition_awards;
create trigger queue_ai_prediction_award after insert or update of award_amount,submitted_on,status,decision_notes,decided_at on public.acquisition_awards for each row execute function private.queue_landsetu_prediction_changes();
drop trigger if exists queue_ai_prediction_document on public.intelligence_documents;
create trigger queue_ai_prediction_document after update of verification_status on public.intelligence_documents for each row execute function private.queue_landsetu_prediction_changes();

insert into public.ai_prediction_queue(project_id,parcel_id)
select p.id,null from public.projects p
on conflict (project_id) where parcel_id is null do update set status='pending',attempts=0,scheduled_at=now(),updated_at=now();
insert into public.ai_prediction_queue(project_id,parcel_id)
select p.project_id,p.id from public.land_parcels p
on conflict (parcel_id) where parcel_id is not null do update set status='pending',attempts=0,scheduled_at=now(),updated_at=now();

create or replace function private.trigger_landsetu_prediction_queue()
returns bigint language plpgsql security definer set search_path = '' as $$
declare secret_token uuid; request_id bigint;
begin
  select token into secret_token from public.landsetu_cron_secrets where id=1;
  if secret_token is null then raise exception 'LandSetu scheduled scan token is not configured'; end if;
  select net.http_post(
    url := 'https://jpzhfmizcijxryjbhjrl.supabase.co/functions/v1/landsetu-intelligence',
    body := jsonb_build_object('action','process_prediction_queue','limit',5),
    headers := jsonb_build_object('Content-Type','application/json','x-landsetu-cron-token',secret_token::text),
    timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function private.trigger_landsetu_prediction_queue() from public,anon,authenticated;
select cron.unschedule(jobid) from cron.job where jobname='landsetu-ai-delay-prediction-worker';
select cron.schedule('landsetu-ai-delay-prediction-worker','*/15 * * * *','select private.trigger_landsetu_prediction_queue();');