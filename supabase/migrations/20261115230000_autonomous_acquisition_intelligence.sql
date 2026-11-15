-- LandSetu autonomous acquisition intelligence
create table if not exists public.intelligence_sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null unique,
  source_type text not null default 'government_portal',
  jurisdiction text,
  enabled boolean not null default true,
  scan_interval_hours integer not null default 24 check (scan_interval_hours between 1 and 720),
  last_checked_at timestamptz,
  last_status text,
  created_at timestamptz not null default now()
);
create table if not exists public.intelligence_scan_runs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.intelligence_sources(id) on delete set null,
  status text not null,
  http_status integer,
  discovered_count integer not null default 0,
  summary text,
  error_message text,
  created_at timestamptz not null default now()
);
create table if not exists public.intelligence_documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete set null,
  parcel_id uuid references public.land_parcels(id) on delete set null,
  source_id uuid references public.intelligence_sources(id) on delete set null,
  title text not null,
  source_url text,
  document_type text,
  published_on date,
  document_hash text,
  extracted_data jsonb not null default '{}'::jsonb,
  extraction_status text not null default 'pending' check (extraction_status in ('pending','processing','completed','failed','needs_review')),
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified','rejected')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(source_url, document_hash)
);
create table if not exists public.ai_delay_predictions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  parcel_id uuid references public.land_parcels(id) on delete cascade,
  model_version text not null,
  predicted_additional_days integer check (predicted_additional_days is null or predicted_additional_days >= 0),
  range_min_days integer check (range_min_days is null or range_min_days >= 0),
  range_max_days integer check (range_max_days is null or range_max_days >= 0),
  estimated_completion_date date,
  risk_score integer check (risk_score between 0 and 100),
  risk_level text check (risk_level in ('Low','Medium','High','Critical','Insufficient data')),
  drivers jsonb not null default '[]'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  data_completeness integer check (data_completeness between 0 and 100),
  explanation text,
  input_snapshot jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now()
);
create table if not exists public.intelligence_alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  parcel_id uuid references public.land_parcels(id) on delete cascade,
  document_id uuid references public.intelligence_documents(id) on delete set null,
  alert_type text not null,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  title text not null,
  message text not null,
  evidence_url text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists intelligence_documents_project_idx on public.intelligence_documents(project_id, created_at desc);
create index if not exists intelligence_predictions_project_idx on public.ai_delay_predictions(project_id, generated_at desc);
create index if not exists intelligence_alerts_project_idx on public.intelligence_alerts(project_id, created_at desc);
create index if not exists intelligence_alerts_unread_idx on public.intelligence_alerts(is_read, created_at desc);
create index if not exists intelligence_scan_runs_source_idx on public.intelligence_scan_runs(source_id, created_at desc);

alter table public.intelligence_sources enable row level security;
alter table public.intelligence_scan_runs enable row level security;
alter table public.intelligence_documents enable row level security;
alter table public.ai_delay_predictions enable row level security;
alter table public.intelligence_alerts enable row level security;

grant select on public.intelligence_sources, public.intelligence_scan_runs, public.intelligence_documents, public.ai_delay_predictions, public.intelligence_alerts to authenticated;

drop policy if exists "signed in users read intelligence sources" on public.intelligence_sources;
create policy "signed in users read intelligence sources" on public.intelligence_sources for select to authenticated using (true);
drop policy if exists "signed in users read scan runs" on public.intelligence_scan_runs;
create policy "signed in users read scan runs" on public.intelligence_scan_runs for select to authenticated using (true);
drop policy if exists "signed in users read intelligence documents" on public.intelligence_documents;
create policy "signed in users read intelligence documents" on public.intelligence_documents for select to authenticated using (true);
drop policy if exists "signed in users read delay predictions" on public.ai_delay_predictions;
create policy "signed in users read delay predictions" on public.ai_delay_predictions for select to authenticated using (true);
drop policy if exists "signed in users read intelligence alerts" on public.intelligence_alerts;
create policy "signed in users read intelligence alerts" on public.intelligence_alerts for select to authenticated using (true);
drop policy if exists "analysts manage alert read state" on public.intelligence_alerts;
create policy "analysts manage alert read state" on public.intelligence_alerts for update to authenticated
using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('national_admin','state_admin','project_manager','analyst')))
with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role in ('national_admin','state_admin','project_manager','analyst')));

insert into public.intelligence_sources(name,url,source_type,jurisdiction) values
('e-Gazette · Land Acquisition','https://egazette.gov.in/RecentUploads.aspx?Category=3','gazette','India'),
('Department of Land Resources · DILRMP','https://dilrmp.gov.in/','land_records','India'),
('LACRRIS · Compensation and R&R','https://larr.dolr.gov.in/','acquisition_dashboard','India'),
('MoRTH · Land Acquisition Guidelines','https://www.morth.gov.in/sites/default/files/notifications_document/A_Manual_of_Guidelines_on_Land_Acquisition_for_National_Highways_File3449.pdf','guidelines','India'),
('BhoomiRashi · NH Acquisition Search','https://bhoomirashi.gov.in/auth/revamp/search_proj.cshtml','acquisition_portal','India')
on conflict(url) do update set name=excluded.name,source_type=excluded.source_type,jurisdiction=excluded.jurisdiction;
