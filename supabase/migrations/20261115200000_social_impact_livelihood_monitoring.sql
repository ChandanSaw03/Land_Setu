create table if not exists public.social_impact_assessments (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 assessment_type text not null default 'Baseline' check(assessment_type in ('Baseline','Periodic Monitoring','Mid-term Review','Post-relocation Review','Final Evaluation')),
 period_start date not null,
 period_end date not null,
 affected_households integer not null default 0 check(affected_households>=0),
 households_surveyed integer not null default 0 check(households_surveyed>=0 and households_surveyed<=affected_households),
 employment_baseline integer not null default 0 check(employment_baseline>=0),
 employment_current integer not null default 0 check(employment_current>=0),
 avg_monthly_income_baseline numeric(14,2) not null default 0 check(avg_monthly_income_baseline>=0),
 avg_monthly_income_current numeric(14,2) not null default 0 check(avg_monthly_income_current>=0),
 vulnerable_households integer not null default 0 check(vulnerable_households>=0 and vulnerable_households<=affected_households),
 findings text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 check(period_end>=period_start)
);
create index if not exists social_impact_assessments_project_period_idx on public.social_impact_assessments(project_id,period_end desc);

create table if not exists public.livelihood_indicators (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 category text not null default 'Other' check(category in ('Employment','Household Income','Agriculture','Small Business','Skills & Training','Access to Services','Food Security','Other')),
 indicator_name text not null,
 unit text not null,
 baseline_value numeric(16,2) not null default 0,
 current_value numeric(16,2) not null default 0,
 target_value numeric(16,2),
 sample_size integer not null default 0 check(sample_size>=0),
 measurement_date date not null default current_date,
 notes text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists livelihood_indicators_project_date_idx on public.livelihood_indicators(project_id,measurement_date desc);

create table if not exists public.livelihood_interventions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 intervention_type text not null default 'Other' check(intervention_type in ('Vocational Training','Employment Placement','Self-employment Grant','Agricultural Restoration','Small Business Support','Financial Literacy','Other')),
 intervention_name text not null,
 target_beneficiaries integer not null default 0 check(target_beneficiaries>=0),
 beneficiaries_enrolled integer not null default 0 check(beneficiaries_enrolled>=0 and beneficiaries_enrolled<=target_beneficiaries),
 beneficiaries_completed integer not null default 0 check(beneficiaries_completed>=0 and beneficiaries_completed<=beneficiaries_enrolled),
 budget_amount numeric(16,2) not null default 0 check(budget_amount>=0),
 start_date date,
 end_date date,
 status text not null default 'Planned' check(status in ('Planned','Active','Delayed','Completed','Cancelled')),
 outcome_notes text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check(end_date is null or start_date is null or end_date>=start_date)
);
create index if not exists livelihood_interventions_project_status_idx on public.livelihood_interventions(project_id,status);

alter table public.social_impact_assessments enable row level security;
alter table public.livelihood_indicators enable row level security;
alter table public.livelihood_interventions enable row level security;
revoke all on public.social_impact_assessments,public.livelihood_indicators,public.livelihood_interventions from anon;
grant select,insert,update,delete on public.social_impact_assessments,public.livelihood_indicators,public.livelihood_interventions to authenticated;

create policy "Read social impact assessments in accessible projects" on public.social_impact_assessments for select to authenticated using(private.can_access_project(project_id));
create policy "Teams create social impact assessments" on public.social_impact_assessments for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Teams update social impact assessments" on public.social_impact_assessments for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete social impact assessments" on public.social_impact_assessments for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));

create policy "Read livelihood indicators in accessible projects" on public.livelihood_indicators for select to authenticated using(private.can_access_project(project_id));
create policy "Teams create livelihood indicators" on public.livelihood_indicators for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Teams update livelihood indicators" on public.livelihood_indicators for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete livelihood indicators" on public.livelihood_indicators for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));

create policy "Read livelihood interventions in accessible projects" on public.livelihood_interventions for select to authenticated using(private.can_access_project(project_id));
create policy "Teams create livelihood interventions" on public.livelihood_interventions for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Teams update livelihood interventions" on public.livelihood_interventions for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete livelihood interventions" on public.livelihood_interventions for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
