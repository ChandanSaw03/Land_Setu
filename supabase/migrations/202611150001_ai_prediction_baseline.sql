-- LandSetu AI prediction baseline integration (BhoomiPredict contributor logic).
-- Adds optional, provenance-aware screening inputs and user-owned outcome feedback.
alter table public.projects
  add column if not exists acquisition_stage text not null default 'Planning',
  add column if not exists compensation_completion numeric(5,2),
  add column if not exists approval_delay_days integer,
  add column if not exists dispute_count integer,
  add column if not exists possession_progress numeric(5,2),
  add column if not exists rehabilitation_progress numeric(5,2),
  add column if not exists historical_department_delay_days integer,
  add column if not exists source_name text,
  add column if not exists source_record_id text,
  add column if not exists source_verified boolean not null default false,
  add column if not exists source_updated_at date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='landsetu_projects_compensation_range' and conrelid='public.projects'::regclass) then
    alter table public.projects add constraint landsetu_projects_compensation_range check (compensation_completion is null or compensation_completion between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='landsetu_projects_possession_range' and conrelid='public.projects'::regclass) then
    alter table public.projects add constraint landsetu_projects_possession_range check (possession_progress is null or possession_progress between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='landsetu_projects_rehabilitation_range' and conrelid='public.projects'::regclass) then
    alter table public.projects add constraint landsetu_projects_rehabilitation_range check (rehabilitation_progress is null or rehabilitation_progress between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname='landsetu_projects_approval_delay_nonnegative' and conrelid='public.projects'::regclass) then
    alter table public.projects add constraint landsetu_projects_approval_delay_nonnegative check (approval_delay_days is null or approval_delay_days >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='landsetu_projects_dispute_count_nonnegative' and conrelid='public.projects'::regclass) then
    alter table public.projects add constraint landsetu_projects_dispute_count_nonnegative check (dispute_count is null or dispute_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='landsetu_projects_historical_delay_nonnegative' and conrelid='public.projects'::regclass) then
    alter table public.projects add constraint landsetu_projects_historical_delay_nonnegative check (historical_department_delay_days is null or historical_department_delay_days >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='landsetu_projects_stage_valid' and conrelid='public.projects'::regclass) then
    alter table public.projects add constraint landsetu_projects_stage_valid check (acquisition_stage in ('Planning','Notification','Valuation','Compensation','Possession','Rehabilitation','Completed'));
  end if;
end $$;

create table if not exists public.project_feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actual_status text not null check (actual_status in ('On Track','In Progress','At Risk','Completed','On Hold')),
  actual_progress numeric(5,2) not null check (actual_progress between 0 and 100),
  actual_delay_days integer not null default 0 check (actual_delay_days >= 0),
  prediction_level text check (prediction_level in ('Insufficient data','Low','Medium','High','Critical')),
  prediction_score integer check (prediction_score between 0 and 100),
  prediction_method text not null default 'rule-based-v1',
  notes text,
  verified boolean not null default false,
  recorded_at timestamptz not null default now()
);
create index if not exists project_feedback_project_recorded_idx on public.project_feedback(project_id,recorded_at desc);
alter table public.project_feedback enable row level security;
grant select,insert on public.project_feedback to authenticated;
drop policy if exists "LandSetu users read own prediction feedback" on public.project_feedback;
create policy "LandSetu users read own prediction feedback" on public.project_feedback for select to authenticated using (user_id=auth.uid());
drop policy if exists "LandSetu users add project prediction feedback" on public.project_feedback;
create policy "LandSetu users add project prediction feedback" on public.project_feedback for insert to authenticated with check (
 user_id=auth.uid() and exists (select 1 from public.projects p where p.id=project_feedback.project_id)
);
