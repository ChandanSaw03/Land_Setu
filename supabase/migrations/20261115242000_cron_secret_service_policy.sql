drop policy if exists "service role manages scheduled scan secret" on public.landsetu_cron_secrets;
create policy "service role manages scheduled scan secret" on public.landsetu_cron_secrets
for all to service_role using (true) with check (true);