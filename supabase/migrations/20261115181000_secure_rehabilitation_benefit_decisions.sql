alter table public.rehabilitation_benefits
 add constraint rehabilitation_benefits_approved_not_over_requested
 check(approved_amount is null or approved_amount<=requested_amount);
drop policy if exists "Admins review rehabilitation benefits" on public.rehabilitation_benefits;
create policy "Admins decide submitted rehabilitation benefits" on public.rehabilitation_benefits for update to authenticated
using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']) and status='Submitted')
with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']) and status in ('Approved','Rejected') and decided_by=(select auth.uid()) and decided_at is not null and disbursed_at is null);
create policy "Admins disburse approved rehabilitation benefits" on public.rehabilitation_benefits for update to authenticated
using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']) and status='Approved')
with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']) and status='Disbursed' and decided_at is not null and approved_amount is not null and disbursed_by=(select auth.uid()) and disbursed_at is not null);
