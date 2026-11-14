LANDSETU — LAND ACQUISITION INTELLIGENCE PLATFORM
==================================================

Application
-----------
LandSetu is a browser-based dashboard connected to Supabase.

How to run
----------
1. Open the deployed LandSetu site, or serve this repository with a static web server.
2. Sign in using an account registered in the connected Supabase Auth project.
3. The application needs an internet connection for Supabase and map tiles.

Main modules
------------
- Authentication: Supabase Auth login, signup and logout.
- Dashboard: live project totals, status and risk summaries.
- Projects: create, edit, delete, search and filter saved project records.
- Access control: National Admin, State Admin, Project Manager, Analyst and Viewer roles.
- Project assignments and activity history.
- Project Insights and Reports, calculated from saved project records.
- CSV report export.
- Notifications and account profile settings.
- Interactive project map with exact saved latitude/longitude coordinates.

Map data and external services
------------------------------
- Leaflet 1.9.4 is loaded from the unpkg CDN for interactive map controls.
- Map background tiles are requested from OpenStreetMap's standard tile service.
- OpenStreetMap attribution is displayed on the map.
- Project records and coordinates are stored in the connected Supabase database.
- Coordinates are entered by an authorized user or selected by clicking the location picker map.
- There is no automatic geocoding service, government land-record API, or external government project dataset connected.
- Existing project records without coordinates remain unmapped until an authorized user adds their exact location. LandSetu does not invent coordinates from a state or district name.

Supabase configuration and security
------------------------------------
The browser uses the Supabase project URL and publishable/anon key in supabase-config.js.
That key is intended for browser use; never put a Supabase service_role or secret key in this repository.
Database row access is enforced with Supabase Row Level Security (RLS).

Data and analytics notes
------------------------
Dashboard counts, risk summaries and insights are calculated from records stored in Supabase.
They are not government statistics, external datasets, or predictive AI forecasts.
