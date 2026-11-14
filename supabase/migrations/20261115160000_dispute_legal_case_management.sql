create table if not exists public.legal_cases (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 parcel_id uuid references public.land_parcels(id) on delete set null,
 case_number text not null,
 title text not null check(char_length(title) between 3 and 180),
 case_type text not null default 'Land ownership dispute' check(case_type in ('Land ownership dispute','Compensation dispute','Boundary dispute','Acquisition challenge','Possession dispute','Inheritance claim','Environmental / regulatory','Other')),
 court_name text,
 authority_name text,
 filing_date date,
 next_hearing_date date,
 status text not null default 'Open' check(status in ('Open','Under Review','Hearing Scheduled','Resolved','Closed')),
 priority text not null default 'Medium' check(priority in ('Low','Medium','High','Critical')),
 assigned_officer text,
 petitioner text,
 respondent text,
 summary text,
 last_order text,
 resolution text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(project_id,case_number)
);
create index if not exists legal_cases_project_status_idx on public.legal_cases(project_id,status,priority);
create index if not exists legal_cases_parcel_idx on public.legal_cases(parcel_id);
create index if not exists legal_cases_next_hearing_idx on public.legal_cases(next_hearing_date) where status not in ('Resolved','Closed');
create table if not exists public.legal_case_hearings (
 id uuid primary key default gen_random_uuid(),
 case_id uuid not null references public.legal_cases(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 hearing_date date not null,
 court_name text,
 hearing_notes text,
 order_summary text,
 next_hearing_date date,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists legal_case_hearings_case_date_idx on public.legal_case_hearings(case_id,hearing_date desc);
create index if not exists legal_case_hearings_project_idx on public.legal_case_hearings(project_id);
alter table public.legal_cases enable row level security;
alter table public.legal_case_hearings enable row level security;
revoke all on public.legal_cases,public.legal_case_hearings from anon;
grant select,insert,update,delete on public.legal_cases,public.legal_case_hearings to authenticated;
create policy "Read legal cases for accessible projects" on public.legal_cases for select to authenticated using(private.can_access_project(project_id));
create policy "Authorized teams register legal cases" on public.legal_cases for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and (parcel_id is null or exists(select 1 from public.land_parcels lp where lp.id=legal_cases.parcel_id and lp.project_id=legal_cases.project_id)) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Authorized teams update legal cases" on public.legal_cases for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and (parcel_id is null or exists(select 1 from public.land_parcels lp where lp.id=legal_cases.parcel_id and lp.project_id=legal_cases.project_id)) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete legal cases" on public.legal_cases for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
create policy "Read hearings for accessible projects" on public.legal_case_hearings for select to authenticated using(private.can_access_project(project_id));
create policy "Authorized teams add case hearings" on public.legal_case_hearings for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and exists(select 1 from public.legal_cases lc where lc.id=legal_case_hearings.case_id and lc.project_id=legal_case_hearings.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Authorized teams update case hearings" on public.legal_case_hearings for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and exists(select 1 from public.legal_cases lc where lc.id=legal_case_hearings.case_id and lc.project_id=legal_case_hearings.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete case hearings" on public.legal_case_hearings for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
