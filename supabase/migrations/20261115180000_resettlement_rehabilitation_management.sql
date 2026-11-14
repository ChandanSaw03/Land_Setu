create table if not exists public.resettlement_households (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 parcel_id uuid references public.land_parcels(id) on delete set null,
 household_reference text,
 household_head text not null,
 contact_number text,
 household_size integer not null default 1 check(household_size>0),
 affected_category text not null default 'Landowner' check(affected_category in ('Landowner','Tenant','Agricultural Worker','Business Owner','Encroacher','Other')),
 livelihood_affected boolean not null default false,
 relocation_required boolean not null default false,
 vulnerability_notes text,
 assessment_date date,
 resettlement_status text not null default 'Assessment Pending' check(resettlement_status in ('Assessment Pending','Assessed','Eligible','Benefits Approved','Relocation In Progress','Relocated','Closed','Not Eligible')),
 relocation_site text,
 relocation_date date,
 livelihood_plan text,
 notes text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists resettlement_households_project_status_idx on public.resettlement_households(project_id,resettlement_status);
create index if not exists resettlement_households_parcel_idx on public.resettlement_households(parcel_id);
create table if not exists public.rehabilitation_benefits (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.resettlement_households(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 benefit_type text not null check(benefit_type in ('Housing Assistance','Livelihood Support','Employment Assistance','Training','Transport / Shifting','Rental Support','Subsistence Allowance','Other')),
 description text,
 requested_amount numeric(16,2) not null check(requested_amount>0),
 approved_amount numeric(16,2) check(approved_amount is null or approved_amount>0),
 status text not null default 'Submitted' check(status in ('Submitted','Approved','Rejected','Disbursed')),
 submitted_by uuid references auth.users(id) on delete set null,
 submitted_at timestamptz not null default now(),
 decided_by uuid references auth.users(id) on delete set null,
 decided_at timestamptz,
 decision_notes text,
 disbursed_by uuid references auth.users(id) on delete set null,
 disbursed_at timestamptz,
 disbursement_reference text,
 check((status='Submitted' and decided_at is null and disbursed_at is null) or (status='Approved' and decided_at is not null and disbursed_at is null) or (status='Rejected' and decided_at is not null and disbursed_at is null) or (status='Disbursed' and decided_at is not null and disbursed_at is not null and approved_amount is not null))
);
create index if not exists rehabilitation_benefits_project_status_idx on public.rehabilitation_benefits(project_id,status);
create index if not exists rehabilitation_benefits_household_idx on public.rehabilitation_benefits(household_id);
create table if not exists public.resettlement_milestones (
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.resettlement_households(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 milestone_type text not null check(milestone_type in ('Household Identified','Socio-economic Survey','Eligibility Confirmed','Benefit Approved','Training Started','Relocation Started','Relocated','Livelihood Restored','Other')),
 event_date date not null,
 reference_number text,
 notes text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists resettlement_milestones_timeline_idx on public.resettlement_milestones(household_id,event_date desc);
alter table public.resettlement_households enable row level security;
alter table public.rehabilitation_benefits enable row level security;
alter table public.resettlement_milestones enable row level security;
revoke all on public.resettlement_households,public.rehabilitation_benefits,public.resettlement_milestones from anon;
grant select,insert,update,delete on public.resettlement_households,public.rehabilitation_benefits,public.resettlement_milestones to authenticated;
create policy "Read resettlement households in accessible projects" on public.resettlement_households for select to authenticated using(private.can_access_project(project_id));
create policy "Teams create resettlement households" on public.resettlement_households for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and (parcel_id is null or exists(select 1 from public.land_parcels lp where lp.id=resettlement_households.parcel_id and lp.project_id=resettlement_households.project_id)) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Teams update resettlement households" on public.resettlement_households for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and (parcel_id is null or exists(select 1 from public.land_parcels lp where lp.id=resettlement_households.parcel_id and lp.project_id=resettlement_households.project_id)) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete resettlement households" on public.resettlement_households for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
create policy "Read rehabilitation benefits in accessible projects" on public.rehabilitation_benefits for select to authenticated using(private.can_access_project(project_id));
create policy "Teams submit rehabilitation benefits" on public.rehabilitation_benefits for insert to authenticated with check(submitted_by=(select auth.uid()) and private.can_access_project(project_id) and exists(select 1 from public.resettlement_households h where h.id=rehabilitation_benefits.household_id and h.project_id=rehabilitation_benefits.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']) and status='Submitted' and decided_at is null and disbursed_at is null);
create policy "Admins review rehabilitation benefits" on public.rehabilitation_benefits for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']) and status in ('Submitted','Approved')) with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']) and ((status in ('Approved','Rejected') and decided_by=(select auth.uid()) and decided_at is not null and disbursed_at is null) or (status='Disbursed' and decided_at is not null and approved_amount is not null and disbursed_by=(select auth.uid()) and disbursed_at is not null)));
create policy "Read resettlement milestones in accessible projects" on public.resettlement_milestones for select to authenticated using(private.can_access_project(project_id));
create policy "Teams record resettlement milestones" on public.resettlement_milestones for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and exists(select 1 from public.resettlement_households h where h.id=resettlement_milestones.household_id and h.project_id=resettlement_milestones.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Teams update resettlement milestones" on public.resettlement_milestones for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and exists(select 1 from public.resettlement_households h where h.id=resettlement_milestones.household_id and h.project_id=resettlement_milestones.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete resettlement milestones" on public.resettlement_milestones for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
