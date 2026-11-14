LANDSETU / BHOOMIPREDICT MVP
============================

Setup
-----
1. Configure the Supabase project URL and publishable key in supabase-config.js.
2. Run supabase-bhoomipredict.sql in the Supabase SQL editor after the existing
   LandSetu schema has been installed.
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
  acquisition_stage, compensation_completion, approval_delay_days, dispute_count,
  possession_progress, rehabilitation_progress,
  historical_department_delay_days, source_name, source_record_id,
  source_verified, and source_updated_at (YYYY-MM or YYYY-MM-DD).
  Duplicate project codes in a file are merged (the last valid row is used);
  matching saved project codes are updated. Invalid rows are reported.
- Review BhoomiPredict for risk screening, contributing factors and suggested
  actions. Records with no screening inputs are marked Insufficient data.
- Record officer outcomes and mark verified feedback for later evaluation. Each
  feedback record also saves the current baseline score and method version for
  future comparison; it does not automatically retrain a model.

Important limitations
---------------------
The current screening is a transparent rule-based baseline, not a trained ML
model. Its score is not a calibrated delay probability, and its duration is not
an official forecast. No government MIS/API connector, GIS boundary dataset,
model training, model evaluation, or automatic retraining is configured.
CSV import is a manual workflow: use only records you are authorized to process,
and verify source provenance before marking a record verified. Feedback is
persisted for future evaluation but does not trigger retraining.
