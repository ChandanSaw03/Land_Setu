drop policy if exists "Authorized teams upload parcel documents" on public.parcel_documents;
create policy "Authorized teams upload parcel documents"
on public.parcel_documents for insert to authenticated
with check (
 uploaded_by=(select auth.uid())
 and private.can_access_project(project_id)
 and exists(select 1 from public.land_parcels lp where lp.id=parcel_documents.parcel_id and lp.project_id=parcel_documents.project_id)
 and private."current_role"()=any(array['national_admin','state_admin','project_manager'])
);
drop policy if exists "Authorized teams review parcel documents" on public.parcel_documents;
create policy "Authorized teams review parcel documents"
on public.parcel_documents for update to authenticated
using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']))
with check(
 private.can_access_project(project_id)
 and exists(select 1 from public.land_parcels lp where lp.id=parcel_documents.parcel_id and lp.project_id=parcel_documents.project_id)
 and private."current_role"()=any(array['national_admin','state_admin','project_manager'])
 and (verified_by is null or verified_by=(select auth.uid()))
 and (verification_status<>'Verified' or (verified_by=(select auth.uid()) and verified_at is not null))
);