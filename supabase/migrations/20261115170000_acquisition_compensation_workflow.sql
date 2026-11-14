create table if not exists public.parcel_acquisitions (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 parcel_id uuid not null unique references public.land_parcels(id) on delete cascade,
 notice_reference text,
 notice_date date,
 response_deadline date,
 consent_status text not null default 'Not Started' check(consent_status in ('Not Started','Notice Served','Consent Received','Consent Declined','No Response')),
 objection_status text not null default 'None' check(objection_status in ('None','Received','Under Review','Resolved','Escalated')),
 objection_notes text,
 acquisition_stage text not null default 'Notice Preparation' check(acquisition_stage in ('Notice Preparation','Notice Served','Consent / Objection','Award Preparation','Award Approved','Possession Taken','Completed','On Hold')),
 possession_date date,
 notes text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,project_id)
);
create index if not exists parcel_acquisitions_project_stage_idx on public.parcel_acquisitions(project_id,acquisition_stage);
create index if not exists parcel_acquisitions_deadline_idx on public.parcel_acquisitions(response_deadline) where acquisition_stage not in ('Completed','On Hold');
create table if not exists public.acquisition_awards (
 id uuid primary key default gen_random_uuid(),
 acquisition_id uuid not null unique references public.parcel_acquisitions(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 award_reference text,
 award_amount numeric(16,2) not null check(award_amount>0),
 submitted_on date not null default current_date,
 status text not null default 'Submitted' check(status in ('Submitted','Approved','Rejected')),
 decision_notes text,
 decided_by uuid references auth.users(id) on delete set null,
 decided_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 check((status='Submitted' and decided_at is null) or (status in ('Approved','Rejected') and decided_at is not null))
);
create index if not exists acquisition_awards_project_status_idx on public.acquisition_awards(project_id,status);
create table if not exists public.acquisition_milestones (
 id uuid primary key default gen_random_uuid(),
 acquisition_id uuid not null references public.parcel_acquisitions(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 milestone_type text not null check(milestone_type in ('Notice Issued','Notice Served','Consent Received','Objection Filed','Objection Resolved','Award Submitted','Award Approved','Possession Taken','Other')),
 event_date date not null,
 reference_number text,
 notes text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists acquisition_milestones_timeline_idx on public.acquisition_milestones(acquisition_id,event_date desc);
alter table public.parcel_acquisitions enable row level security;
alter table public.acquisition_awards enable row level security;
alter table public.acquisition_milestones enable row level security;
revoke all on public.parcel_acquisitions,public.acquisition_awards,public.acquisition_milestones from anon;
grant select,insert,update,delete on public.parcel_acquisitions,public.acquisition_awards,public.acquisition_milestones to authenticated;
create policy "Read acquisitions in accessible projects" on public.parcel_acquisitions for select to authenticated using(private.can_access_project(project_id));
create policy "Teams register parcel acquisitions" on public.parcel_acquisitions for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and exists(select 1 from public.land_parcels lp where lp.id=parcel_acquisitions.parcel_id and lp.project_id=parcel_acquisitions.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Teams update parcel acquisitions" on public.parcel_acquisitions for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and exists(select 1 from public.land_parcels lp where lp.id=parcel_acquisitions.parcel_id and lp.project_id=parcel_acquisitions.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete parcel acquisitions" on public.parcel_acquisitions for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
create policy "Read acquisition awards in accessible projects" on public.acquisition_awards for select to authenticated using(private.can_access_project(project_id));
create policy "Teams submit acquisition awards" on public.acquisition_awards for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and exists(select 1 from public.parcel_acquisitions a where a.id=acquisition_awards.acquisition_id and a.project_id=acquisition_awards.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']) and status='Submitted' and decided_at is null and decided_by is null);
create policy "Admins decide acquisition awards" on public.acquisition_awards for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin'])) with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']) and (status='Submitted' or (status in ('Approved','Rejected') and decided_by=(select auth.uid()) and decided_at is not null)));
create policy "Read acquisition milestones in accessible projects" on public.acquisition_milestones for select to authenticated using(private.can_access_project(project_id));
create policy "Teams record acquisition milestones" on public.acquisition_milestones for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and exists(select 1 from public.parcel_acquisitions a where a.id=acquisition_milestones.acquisition_id and a.project_id=acquisition_milestones.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Teams update acquisition milestones" on public.acquisition_milestones for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and exists(select 1 from public.parcel_acquisitions a where a.id=acquisition_milestones.acquisition_id and a.project_id=acquisition_milestones.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete acquisition milestones" on public.acquisition_milestones for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
