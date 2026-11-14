-- BhoomiPredict MVP data extensions.
-- Run in the Supabase SQL editor after the existing LandSetu schema is installed.

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
  add column if not exists source_updated_at date,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_compensation_completion_range' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_compensation_completion_range check (compensation_completion between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_possession_progress_range' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_possession_progress_range check (possession_progress between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_rehabilitation_progress_range' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_rehabilitation_progress_range check (rehabilitation_progress between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_approval_delay_nonnegative' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_approval_delay_nonnegative check (approval_delay_days >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_dispute_count_nonnegative' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_dispute_count_nonnegative check (dispute_count >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_historical_delay_nonnegative' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_historical_delay_nonnegative check (historical_department_delay_days >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_acquisition_stage_valid' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_acquisition_stage_valid check (acquisition_stage in ('Planning', 'Notification', 'Valuation', 'Compensation', 'Possession', 'Rehabilitation', 'Completed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_coordinates_paired' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_coordinates_paired check ((latitude is null) = (longitude is null));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_latitude_range' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_latitude_range check (latitude between -90 and 90);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'projects_longitude_range' and conrelid = 'public.projects'::regclass) then
    alter table public.projects add constraint projects_longitude_range check (longitude between -180 and 180);
  end if;
end $$;

create table if not exists public.project_feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  actual_status text not null check (actual_status in ('On Track', 'In Progress', 'At Risk', 'Completed', 'On Hold')),
  actual_progress numeric(5,2) not null check (actual_progress between 0 and 100),
  actual_delay_days integer not null default 0 check (actual_delay_days >= 0),
  prediction_level text check (prediction_level in ('Insufficient data', 'Low', 'Medium', 'High', 'Critical')),
  prediction_score integer check (prediction_score between 0 and 100),
  prediction_delay_days integer check (prediction_delay_days >= 0),
  prediction_method text not null default 'rule-based-v1',
  notes text,
  verified boolean not null default false,
  recorded_at timestamptz not null default now()
);

alter table public.project_feedback
  add column if not exists prediction_level text,
  add column if not exists prediction_score integer,
  add column if not exists prediction_delay_days integer,
  add column if not exists prediction_method text not null default 'rule-based-v1';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_feedback_prediction_level_valid' and conrelid = 'public.project_feedback'::regclass) then
    alter table public.project_feedback add constraint project_feedback_prediction_level_valid check (prediction_level in ('Insufficient data', 'Low', 'Medium', 'High', 'Critical'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_feedback_prediction_score_range' and conrelid = 'public.project_feedback'::regclass) then
    alter table public.project_feedback add constraint project_feedback_prediction_score_range check (prediction_score between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_feedback_prediction_delay_nonnegative' and conrelid = 'public.project_feedback'::regclass) then
    alter table public.project_feedback add constraint project_feedback_prediction_delay_nonnegative check (prediction_delay_days >= 0);
  end if;
end $$;

create index if not exists project_feedback_project_recorded_idx
  on public.project_feedback (project_id, recorded_at desc);

alter table public.project_feedback enable row level security;
grant select, insert on table public.project_feedback to authenticated;

drop policy if exists "Users can read their project feedback" on public.project_feedback;
create policy "Users can read their project feedback"
  on public.project_feedback for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users can add their project feedback" on public.project_feedback;
create policy "Users can add their project feedback"
  on public.project_feedback for insert to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.projects p
      where p.id = project_feedback.project_id
    )
  );
