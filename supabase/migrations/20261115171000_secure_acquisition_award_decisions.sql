drop policy if exists "Admins decide acquisition awards" on public.acquisition_awards;
create policy "Admins decide submitted acquisition awards" on public.acquisition_awards for update to authenticated
using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']) and status='Submitted')
with check(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin']) and status in ('Approved','Rejected') and decided_by=(select auth.uid()) and decided_at is not null);
create or replace function public.sync_acquisition_stage_after_award_decision() returns trigger language plpgsql set search_path=public as $$
begin
 if new.status='Approved' and old.status is distinct from new.status then
  update public.parcel_acquisitions set acquisition_stage='Award Approved',updated_at=now() where id=new.acquisition_id;
 end if;
 return new;
end;
$$;
drop trigger if exists acquisition_award_stage_sync on public.acquisition_awards;
create trigger acquisition_award_stage_sync after update of status on public.acquisition_awards for each row execute function public.sync_acquisition_stage_after_award_decision();
