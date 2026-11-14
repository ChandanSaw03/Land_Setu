create or replace function public.admin_set_user_role(
  p_user_id uuid,
  p_role text,
  p_assigned_state text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
     or private.current_role() <> 'national_admin' then
    raise exception 'Only a National Admin can manage user roles';
  end if;

  if p_role not in ('national_admin', 'state_admin', 'project_manager', 'analyst', 'viewer') then
    raise exception 'Invalid role';
  end if;

  if p_role = 'state_admin' and nullif(btrim(p_assigned_state), '') is null then
    raise exception 'State Admin accounts must have an assigned state';
  end if;

  if p_role <> 'national_admin'
     and exists (
       select 1
       from public.profiles
       where id = p_user_id and role = 'national_admin'
     )
     and (
       select count(*)
       from public.profiles
       where role = 'national_admin'
     ) <= 1 then
    raise exception 'Cannot remove the last National Admin. Assign another National Admin first.';
  end if;

  update public.profiles
  set role = p_role,
      assigned_state = nullif(btrim(p_assigned_state), ''),
      updated_at = now()
  where id = p_user_id;

  if not found then
    raise exception 'User profile not found';
  end if;
end;
$function$;

revoke execute on function public.admin_set_user_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text, text) to authenticated;
