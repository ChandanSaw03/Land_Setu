create index if not exists compensation_payments_created_by_idx on public.compensation_payments(created_by);
create or replace function private.sync_parcel_compensation_status()
returns trigger language plpgsql set search_path='' as $$
begin
 update public.land_parcels set compensation_status=case when compensation_status='Not Applicable' and compensation_paid=0 then 'Not Applicable' when compensation_estimated is not null and compensation_paid>=compensation_estimated then 'Paid' when compensation_paid>0 then 'Partially Paid' else 'Pending' end,updated_at=now() where id=new.id;
 return new;
end; $$;
drop trigger if exists land_parcels_sync_compensation_status on public.land_parcels;
create trigger land_parcels_sync_compensation_status after update of compensation_estimated on public.land_parcels for each row execute function private.sync_parcel_compensation_status();
