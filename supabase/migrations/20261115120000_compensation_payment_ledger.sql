create table if not exists public.compensation_payments (
 id uuid primary key default gen_random_uuid(),
 parcel_id uuid not null references public.land_parcels(id) on delete cascade,
 amount numeric(16,2) not null check(amount>0),
 paid_on date not null default current_date,
 payment_reference text,
 payment_mode text not null default 'Bank Transfer' check(payment_mode in ('Bank Transfer','NEFT','RTGS','Cheque','UPI','Cash','Legacy opening balance','Other')),
 paid_to text, notes text, created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists compensation_payments_parcel_date_idx on public.compensation_payments(parcel_id,paid_on desc,created_at desc);
create unique index if not exists compensation_payments_reference_unique on public.compensation_payments(parcel_id,payment_reference) where payment_reference is not null and payment_reference<>'';
alter table public.compensation_payments enable row level security;
revoke all on public.compensation_payments from anon;
grant select,insert,update,delete on public.compensation_payments to authenticated;
create policy "Read payments for accessible parcels" on public.compensation_payments for select to authenticated using(exists(select 1 from public.land_parcels lp where lp.id=parcel_id and private.can_access_project(lp.project_id)));
create policy "Authorized teams record compensation payments" on public.compensation_payments for insert to authenticated with check(created_by=(select auth.uid()) and exists(select 1 from public.land_parcels lp where lp.id=parcel_id and private.can_access_project(lp.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])));
create policy "Authorized teams update compensation payments" on public.compensation_payments for update to authenticated using(exists(select 1 from public.land_parcels lp where lp.id=parcel_id and private.can_access_project(lp.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager']))) with check(exists(select 1 from public.land_parcels lp where lp.id=parcel_id and private.can_access_project(lp.project_id) and private."current_role"()=any(array['national_admin','state_admin','project_manager'])));
create policy "Admins delete compensation payments" on public.compensation_payments for delete to authenticated using(exists(select 1 from public.land_parcels lp where lp.id=parcel_id and private.can_access_project(lp.project_id) and private."current_role"()=any(array['national_admin','state_admin'])));
create or replace function private.refresh_parcel_compensation_totals() returns trigger language plpgsql set search_path='' as $$
declare target_parcel_id uuid; paid_total numeric(16,2); estimate numeric(16,2);
begin
 target_parcel_id:=coalesce(new.parcel_id,old.parcel_id);
 select coalesce(sum(cp.amount),0) into paid_total from public.compensation_payments cp where cp.parcel_id=target_parcel_id;
 select lp.compensation_estimated into estimate from public.land_parcels lp where lp.id=target_parcel_id;
 if estimate is not null and paid_total>estimate then raise exception 'Total compensation payments (%) exceed the parcel estimate (%)',paid_total,estimate; end if;
 update public.land_parcels set compensation_paid=paid_total,compensation_status=case when compensation_status='Not Applicable' and paid_total=0 then 'Not Applicable' when estimate is not null and paid_total>=estimate then 'Paid' when paid_total>0 then 'Partially Paid' else 'Pending' end,updated_at=now() where id=target_parcel_id;
 return coalesce(new,old);
end; $$;
drop trigger if exists compensation_payments_refresh_totals on public.compensation_payments;
create trigger compensation_payments_refresh_totals after insert or update or delete on public.compensation_payments for each row execute function private.refresh_parcel_compensation_totals();
insert into public.compensation_payments(parcel_id,amount,paid_on,payment_mode,notes,created_by)
select lp.id,lp.compensation_paid,lp.created_at::date,'Legacy opening balance','Opening balance migrated from the parcel register before payment-level tracking.',lp.created_by from public.land_parcels lp where lp.compensation_paid>0 and not exists(select 1 from public.compensation_payments cp where cp.parcel_id=lp.id and cp.payment_mode='Legacy opening balance');
