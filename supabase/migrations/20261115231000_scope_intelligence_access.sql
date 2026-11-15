drop policy if exists "signed in users read intelligence documents" on public.intelligence_documents;
create policy "read permitted intelligence documents" on public.intelligence_documents for select to authenticated
using ((project_id is not null and private.can_access_project(project_id)) or (project_id is null and private.current_role() in ('national_admin','analyst')));
drop policy if exists "signed in users read delay predictions" on public.ai_delay_predictions;
create policy "read permitted delay predictions" on public.ai_delay_predictions for select to authenticated
using (private.can_access_project(project_id));
drop policy if exists "signed in users read intelligence alerts" on public.intelligence_alerts;
create policy "read permitted intelligence alerts" on public.intelligence_alerts for select to authenticated
using ((project_id is not null and private.can_access_project(project_id)) or (project_id is null and private.current_role() in ('national_admin','analyst')));
drop policy if exists "analysts manage alert read state" on public.intelligence_alerts;
create policy "update permitted intelligence alerts" on public.intelligence_alerts for update to authenticated
using (project_id is not null and private.can_access_project(project_id))
with check (project_id is not null and private.can_access_project(project_id));