create table if not exists public.project_milestones (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 milestone_title text not null,
 category text not null default 'Other' check(category in ('Land Acquisition','Compensation','Legal','Resettlement','Environmental','Construction','Approvals','Other')),
 description text,
 planned_start date not null,
 planned_end date not null,
 actual_start date,
 actual_end date,
 status text not null default 'Planned' check(status in ('Planned','In Progress','Completed','Delayed','On Hold','Cancelled')),
 priority text not null default 'Medium' check(priority in ('Low','Medium','High','Critical')),
 responsible_agency text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint project_milestones_valid_planned_dates check(planned_end>=planned_start),
 constraint project_milestones_valid_actual_dates check(actual_start is null or actual_end is null or actual_end>=actual_start)
);
create index if not exists project_milestones_project_dates_idx on public.project_milestones(project_id,planned_start,planned_end);
create index if not exists project_milestones_status_end_idx on public.project_milestones(status,planned_end);
create index if not exists project_milestones_created_by_idx on public.project_milestones(created_by);
alter table public.project_milestones enable row level security;
revoke all on public.project_milestones from anon;
grant select,insert,update,delete on public.project_milestones to authenticated;
drop policy if exists "Read milestones for accessible projects" on public.project_milestones;
create policy "Read milestones for accessible projects" on public.project_milestones for select to authenticated using(private.can_access_project(project_id));
drop policy if exists "Project teams create milestones" on public.project_milestones;
create policy "Project teams create milestones" on public.project_milestones for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
drop policy if exists "Project teams update milestones" on public.project_milestones;
create policy "Project teams update milestones" on public.project_milestones for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
drop policy if exists "Admins delete milestones" on public.project_milestones;
create policy "Admins delete milestones" on public.project_milestones for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));