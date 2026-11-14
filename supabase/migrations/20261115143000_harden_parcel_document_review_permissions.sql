create index if not exists parcel_documents_uploaded_by_idx on public.parcel_documents(uploaded_by);
create index if not exists parcel_documents_verified_by_idx on public.parcel_documents(verified_by);
alter table public.parcel_documents drop constraint if exists parcel_documents_storage_path_matches_parcel;
alter table public.parcel_documents add constraint parcel_documents_storage_path_matches_parcel check(storage_path like project_id::text||'/'||parcel_id::text||'/%');
revoke update on public.parcel_documents from authenticated;
grant update(verification_status,review_notes,verified_by,verified_at,updated_at) on public.parcel_documents to authenticated;
drop policy if exists "Authorized teams review parcel documents" on public.parcel_documents;
create policy "Authorized teams review parcel documents"
on public.parcel_documents for update to authenticated
using(private.can_access_project(project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']))
with check(
 private.can_access_project(project_id)
 and exists(select 1 from public.land_parcels lp where lp.id=parcel_id and lp.project_id=project_id)
 and private."current_role"()=any(array['national_admin','state_admin','project_manager'])
 and (verified_by is null or verified_by=(select auth.uid()))
 and (verification_status<>'Verified' or (verified_by=(select auth.uid()) and verified_at is not null))
);
