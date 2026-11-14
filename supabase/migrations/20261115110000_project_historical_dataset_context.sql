-- Attach the user-provided 60-observation India land-conflict dataset as
-- provenance/context metadata for every LandSetu project.
-- This is NOT a site-specific risk score or a project-level training label.
alter table public.projects
  add column if not exists historical_reference_dataset text not null default 'landportal-LCW-LCI-NOCONF.csv',
  add column if not exists historical_reference_indicator text not null default 'LCW-LCI-NOCONF',
  add column if not exists historical_reference_observations integer not null default 60,
  add column if not exists historical_reference_start_year integer not null default 1912,
  add column if not exists historical_reference_end_year integer not null default 2018,
  add column if not exists historical_reference_scope text not null default 'India national historical context only';

do $$
begin
  if not exists (select 1 from pg_constraint where conname='landsetu_projects_historical_reference_observations_nonnegative' and conrelid='public.projects'::regclass) then
    alter table public.projects add constraint landsetu_projects_historical_reference_observations_nonnegative check (historical_reference_observations >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='landsetu_projects_historical_reference_year_range' and conrelid='public.projects'::regclass) then
    alter table public.projects add constraint landsetu_projects_historical_reference_year_range check (historical_reference_start_year <= historical_reference_end_year);
  end if;
end $$;

comment on column public.projects.historical_reference_dataset is 'Source dataset attached as historical context; not a project-specific prediction.';
comment on column public.projects.historical_reference_observations is 'Number of historical national observations referenced by the project.';
comment on column public.projects.historical_reference_scope is 'Geographic and analytical scope of the historical reference.';
