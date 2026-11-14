create table if not exists public.grievance_cases (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 reference_number text not null unique,
 subject text not null,
 category text not null default 'Other' check(category in ('Land Acquisition','Compensation','Resettlement','Environmental','Construction Impact','Access / Utilities','Other')),
 description text not null,
 complainant_name text,
 complainant_contact text,
 village text,
 received_date date not null default current_date,
 priority text not null default 'Normal' check(priority in ('Low','Normal','High','Critical')),
 status text not null default 'Received' check(status in ('Received','Under Review','Assigned','Action In Progress','Escalated','Resolved','Closed','Rejected')),
 assigned_to uuid references auth.users(id) on delete set null,
 due_date date,
 resolution_summary text,
 resolved_at timestamptz,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check((status in ('Resolved','Closed') and resolved_at is not null) or (status not in ('Resolved','Closed') and resolved_at is null))
);
create index if not exists grievance_cases_project_status_idx on public.grievance_cases(project_id,status,priority);
create index if not exists grievance_cases_due_idx on public.grievance_cases(due_date) where status not in ('Resolved','Closed','Rejected');
create table if not exists public.grievance_updates (
 id uuid primary key default gen_random_uuid(),
 grievance_id uuid not null references public.grievance_cases(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 update_type text not null default 'Progress Note' check(update_type in ('Progress Note','Assigned','Escalated','Status Changed','Complainant Contacted','Resolution Proposed','Resolved','Other')),
 update_date date not null default current_date,
 notes text not null,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
create index if not exists grievance_updates_case_date_idx on public.grievance_updates(grievance_id,update_date desc);
create table if not exists public.public_consultations (
 id uuid primary key default gen_random_uuid(),
 project_id uuid not null references public.projects(id) on delete cascade,
 consultation_date date not null,
 venue text not null,
 village text,
 meeting_type text not null default 'Public Hearing' check(meeting_type in ('Public Hearing','Village Meeting','Stakeholder Consultation','Special Consultation','Other')),
 agenda text,
 minutes text,
 participant_count integer not null default 0 check(participant_count>=0),
 groups_represented text,
 key_concerns text,
 commitments text,
 next_followup_date date,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists public_consultations_project_date_idx on public.public_consultations(project_id,consultation_date desc);
create table if not exists public.consultation_actions (
 id uuid primary key default gen_random_uuid(),
 consultation_id uuid not null references public.public_consultations(id) on delete cascade,
 project_id uuid not null references public.projects(id) on delete cascade,
 action_description text not null,
 assigned_to uuid references auth.users(id) on delete set null,
 due_date date,
 status text not null default 'Open' check(status in ('Open','In Progress','Completed','Deferred')),
 completion_notes text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists consultation_actions_project_status_idx on public.consultation_actions(project_id,status,due_date);
alter table public.grievance_cases enable row level security;
alter table public.grievance_updates enable row level security;
alter table public.public_consultations enable row level security;
alter table public.consultation_actions enable row level security;
revoke all on public.grievance_cases,public.grievance_updates,public.public_consultations,public.consultation_actions from anon;
grant select,insert,update,delete on public.grievance_cases,public.grievance_updates,public.public_consultations,public.consultation_actions to authenticated;
create policy "Read grievances in accessible projects" on public.grievance_cases for select to authenticated using(private.can_access_project(project_id));
create policy "Teams create grievances" on public.grievance_cases for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Teams update grievances" on public.grievance_cases for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete grievances" on public.grievance_cases for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
create policy "Read grievance updates in accessible projects" on public.grievance_updates for select to authenticated using(private.can_access_project(project_id));
create policy "Teams add grievance updates" on public.grievance_updates for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and exists(select 1 from public.grievance_cases g where g.id=grievance_updates.grievance_id and g.project_id=grievance_updates.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Read consultations in accessible projects" on public.public_consultations for select to authenticated using(private.can_access_project(project_id));
create policy "Teams create consultations" on public.public_consultations for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Teams update consultations" on public.public_consultations for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete consultations" on public.public_consultations for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
create policy "Read consultation actions in accessible projects" on public.consultation_actions for select to authenticated using(private.can_access_project(project_id));
create policy "Teams create consultation actions" on public.consultation_actions for insert to authenticated with check(created_by=(select auth.uid()) and private.can_access_project(project_id) and exists(select 1 from public.public_consultations c where c.id=consultation_actions.consultation_id and c.project_id=consultation_actions.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Teams update consultation actions" on public.consultation_actions for update to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])) with check(private.can_access_project(project_id) and exists(select 1 from public.public_consultations c where c.id=consultation_actions.consultation_id and c.project_id=consultation_actions.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']));
create policy "Admins delete consultation actions" on public.consultation_actions for delete to authenticated using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']));
