LANDSETU / BHOOMIPREDICT MVP
============================

Setup
-----
1. Configure the Supabase project URL and publishable key in supabase-config.js.
2. Run supabase-bhoomipredict.sql in the Supabase SQL editor after the existing
   LandSetu schema has been installed. It can be rerun to apply later additive
   updates, including project coordinates.
3. Serve this folder from a local web server and open index.html. Authentication
   and Supabase access require an internet connection.

BhoomiPredict workflow
----------------------
- Add and edit acquisition stage, compensation, approval delay, disputes,
  possession, rehabilitation, historical department delay, and source provenance
  under Projects.
- Import authorized CSV records from Projects. Required headers are
  project_code, project_name, state, district, and status. Optional headers:
  risk_level, progress, expected_completion (YYYY-MM or YYYY-MM-DD),
  latitude, longitude,
  acquisition_stage, compensation_completion, approval_delay_days, dispute_count,
  possession_progress, rehabilitation_progress,
  historical_department_delay_days, source_name, source_record_id,
  source_verified, and source_updated_at (YYYY-MM or YYYY-MM-DD).
  Duplicate project codes in a file are merged (the last valid row is used);
  matching saved project codes are updated. Invalid rows are reported.
- The Map page uses OpenStreetMap tiles and plots only projects with both
  latitude and longitude coordinates. Add coordinates manually or include
  latitude and longitude CSV columns; no geocoding service is used. The map
  provider receives tile requests for the viewed map area. Coordinate data is
  rendered in the browser as markers. OpenStreetMap attribution is displayed.
- Review BhoomiPredict for risk screening, contributing factors and suggested
  actions. Records with no screening inputs are marked Insufficient data.
- Record officer outcomes and mark verified feedback for later evaluation. Each
  feedback record also saves the current baseline score and method version for
  future comparison; it does not automatically retrain a model.

LandPortal LCW model
--------------------
Run python3 train_landportal_lcw.py to train the separate national reported-
conflict-count trend model and summarize the related
landportal-LCW-LCI-VALINV.csv investment-value indicator. The investment series
is shown only as context: it is nominal, has incomplete year coverage, and is
not used as a model feature. The script writes landportal-lcw-model.json and
landportal-lcw-evaluation.json. It uses a chronological 20% holdout and compares
the count model against a last-observation baseline; run python3 -m unittest
test_train_landportal_lcw.py to verify data loading and evaluation behavior.
The BhoomiPredict page displays the evaluation and indicator context separately
from project risk results.
On the supplied snapshot, holdout MAE was 19.37 counts versus 20.75 for the
baseline (about 6.7% lower); this modest result is not evidence of a current
forecast.

Important limitations
---------------------
The current screening is a transparent rule-based baseline, not a trained ML
model. Its score is not a calibrated delay probability, and its duration is not
an official forecast. No government MIS/API connector, GIS boundary dataset,
trained project-delay model, or automatic retraining is configured. The
LandPortal model is a separate historical count-trend experiment. The supplied
data has no project-level acquisition stages or delay outcomes, omits 47 years
between its observations, and ends in 2018. It must not be used as a current
forecast or as a project-delay predictor.
CSV import is a manual workflow: use only records you are authorized to process,
and verify source provenance before marking a record verified. Feedback is
persisted for future evaluation but does not trigger retraining.
