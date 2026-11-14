-- Curated official reference records from MoSPI PAIMANA September 2026 Flash Report.
-- This registry is read-only for application users and separate from user-managed projects.
create table if not exists public.official_infrastructure_projects (
  id uuid primary key default gen_random_uuid(),
  source_record_key text not null unique,
  project_name text not null,
  sector text not null,
  ministry text not null,
  location_label text,
  latest_cost_crore numeric(16,2),
  source_status text not null check (source_status in ('completed','newly_onboarded')),
  commissioning_date date,
  source_snapshot_month date not null default date '2026-09-01',
  source_published_at date not null default date '2026-10-26',
  source_report_url text not null,
  source_notes text,
  created_at timestamptz not null default now(),
  constraint official_project_cost_nonnegative check (latest_cost_crore is null or latest_cost_crore >= 0)
);

alter table public.official_infrastructure_projects enable row level security;
grant select on public.official_infrastructure_projects to authenticated;
drop policy if exists "Authenticated users can read official infrastructure projects" on public.official_infrastructure_projects;
create policy "Authenticated users can read official infrastructure projects"
on public.official_infrastructure_projects for select to authenticated using (true);

insert into public.official_infrastructure_projects
(source_record_key,project_name,sector,ministry,location_label,latest_cost_crore,source_status,commissioning_date,source_report_url,source_notes)
values
('PAIMANA-2026-09-COMP-01','Buxar Thermal Power Project [1320 MW]','Electricity Generation','Ministry of Power','Buxar, Bihar',13756.56,'completed',date '2026-09-12','https://www.mospi.gov.in/uploads/latestReleases/latest_release_1793778572910_3a2465c4-a4d7-442d-9d40-83297f5e4f52_PIB_note_Sept_2026_Final_.pdf','Commissioned on 12 September 2026; inaugurated on 14 September 2026.'),
('PAIMANA-2026-09-COMP-02','Delhi-Amritsar-Katra Expressway Phase-I Package-I','Roads & Highways','Ministry of Road Transport & Highways','Jassur Kheri–Rukhi Paani corridor, Haryana',2429.90,'completed',date '2025-11-04','https://www.mospi.gov.in/uploads/latestReleases/latest_release_1793778572910_3a2465c4-a4d7-442d-9d40-83297f5e4f52_PIB_note_Sept_2026_Final_.pdf','Commissioned on 4 November 2025; inaugurated on 17 July 2026.'),
('PAIMANA-2026-09-COMP-03','NMDC Slurry Pipeline Project Phase-1','Steel','Ministry of Steel',null,5427.00,'completed',date '2026-09-26','https://www.mospi.gov.in/uploads/latestReleases/latest_release_1793778572910_3a2465c4-a4d7-442d-9d40-83297f5e4f52_PIB_note_Sept_2026_Final_.pdf','Commissioned on 26 September 2026; inaugurated on 27 September 2026.'),
('PAIMANA-2026-09-NEW-01','Upgradation to Two Lane with Paved Shoulder — Dholavira–Mauvana–Vauva–Santalpur, NH-754K, Package II','Roads & Highways','Ministry of Road Transport & Highways','Gujarat',575.07,'newly_onboarded',null,'https://www.mospi.gov.in/uploads/latestReleases/latest_release_1793778572910_3a2465c4-a4d7-442d-9d40-83297f5e4f52_PIB_note_Sept_2026_Final_.pdf','Newly onboarded under PAIMANA during September 2026.'),
('PAIMANA-2026-09-NEW-02','Installation of 2 Synchronous Condenser Units at 765/400/220 kV Fatehgarh-II PS','Transmission & Distribution','Ministry of Power','Fatehgarh-II pooling station',1157.00,'newly_onboarded',null,'https://www.mospi.gov.in/uploads/latestReleases/latest_release_1793778572910_3a2465c4-a4d7-442d-9d40-83297f5e4f52_PIB_note_Sept_2026_Final_.pdf','Newly onboarded under PAIMANA during September 2026.'),
('PAIMANA-2026-09-NEW-03','Transmission System for Integration of Krishnagiri REZ Phase-I','Transmission & Distribution','Ministry of Power','Krishnagiri, Tamil Nadu',7627.00,'newly_onboarded',null,'https://www.mospi.gov.in/uploads/latestReleases/latest_release_1793778572910_3a2465c4-a4d7-442d-9d40-83297f5e4f52_PIB_note_Sept_2026_Final_.pdf','Newly onboarded under PAIMANA during September 2026.'),
('PAIMANA-2026-09-NEW-04','Augmentation at Bhadla-III, Ramgarh PS and Kanpur (PG)','Transmission & Distribution','Ministry of Power','Bhadla / Ramgarh and Kanpur',1015.00,'newly_onboarded',null,'https://www.mospi.gov.in/uploads/latestReleases/latest_release_1793778572910_3a2465c4-a4d7-442d-9d40-83297f5e4f52_PIB_note_Sept_2026_Final_.pdf','Newly onboarded under PAIMANA during September 2026.'),
('PAIMANA-2026-09-NEW-05','Mechanization of Multipurpose Berth (MPB) on BOT Basis','Ports & Shipping','Ministry of Ports, Shipping and Waterways',null,630.67,'newly_onboarded',null,'https://www.mospi.gov.in/uploads/latestReleases/latest_release_1793778572910_3a2465c4-a4d7-442d-9d40-83297f5e4f52_PIB_note_Sept_2026_Final_.pdf','Listed among projects onboarded in September 2026; report also notes inauguration on 21 August 2026.'),
('PAIMANA-2026-09-NEW-06','Hosur–Omalur 147 km Umbrella Work PB57/2019-20/NR','Railways','Ministry of Railways','Hosur–Omalur, Tamil Nadu',1839.32,'newly_onboarded',null,'https://www.mospi.gov.in/uploads/latestReleases/latest_release_1793778572910_3a2465c4-a4d7-442d-9d40-83297f5e4f52_PIB_note_Sept_2026_Final_.pdf','Newly onboarded under PAIMANA during September 2026.')
on conflict (source_record_key) do update set
 project_name=excluded.project_name,sector=excluded.sector,ministry=excluded.ministry,
 location_label=excluded.location_label,latest_cost_crore=excluded.latest_cost_crore,
 source_status=excluded.source_status,commissioning_date=excluded.commissioning_date,
 source_snapshot_month=excluded.source_snapshot_month,source_published_at=excluded.source_published_at,
 source_report_url=excluded.source_report_url,source_notes=excluded.source_notes;
