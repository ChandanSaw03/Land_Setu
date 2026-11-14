create table if not exists public.land_parcels (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 parcel_number text not null, survey_number text, owner_name text not null, owner_contact text, village text,
 area_acres numeric(14,4) not null check(area_acres>0),
 acquisition_status text not null default 'Identified' check(acquisition_status in ('Identified','Notice Served','Negotiation','Awarded','Possession Taken','Disputed','Withdrawn')),
 compensation_estimated numeric(16,2) check(compensation_estimated is null or compensation_estimated>=0),
 compensation_paid numeric(16,2) not null default 0 check(compensation_paid>=0),
 compensation_status text not null default 'Pending' check(compensation_status in ('Pending','Partially Paid','Paid','Not Applicable')),
 notes text, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint land_parcels_project_parcel_unique unique(project_id,parcel_number),
 constraint land_parcels_paid_not_over_estimated check(compensation_estimated is null or compensation_paid<=compensation_estimated)
);
create index if not exists land_parcels_project_id_idx on public.land_parcels(project_id);
create index if not exists land_parcels_status_idx on public.land_parcels(acquisition_status);
alter table public.land_parcels enable row level security;
revoke all on public.land_parcels from anon;
grant select,insert,update,delete on public.land_parcels to authenticated;
create policy "Read parcels for accessible projects" on public.land_parcels for select to authenticated using(private.can_access_project(project_id));
create policy "Authorized project teams add parcels" on public.land_parcels for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Authorized project teams update parcels" on public.land_parcels for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete parcels" on public.land_parcels for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
