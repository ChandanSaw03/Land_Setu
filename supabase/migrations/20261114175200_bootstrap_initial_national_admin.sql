-- Bootstrap the first LandSetu National Admin.
-- This is a one-time bootstrap migration for the existing initial account.
update public.profiles
set role = 'national_admin',
    assigned_state = null,
    updated_at = now()
where id = '0ac3eef9-df52-4db5-b589-5061b8a02c53'::uuid;
