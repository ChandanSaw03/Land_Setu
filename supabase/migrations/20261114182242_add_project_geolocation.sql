alter table public.projects
  add column latitude double precision,
  add column longitude double precision;

alter table public.projects
  add constraint projects_coordinates_valid
  check (
    (latitude is null and longitude is null)
    or (latitude between -90 and 90 and longitude between -180 and 180)
  );