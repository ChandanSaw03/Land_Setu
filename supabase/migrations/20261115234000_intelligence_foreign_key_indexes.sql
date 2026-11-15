create index if not exists intelligence_documents_parcel_idx on public.intelligence_documents(parcel_id);
create index if not exists intelligence_documents_source_idx on public.intelligence_documents(source_id);
create index if not exists intelligence_documents_created_by_idx on public.intelligence_documents(created_by);
create index if not exists ai_delay_predictions_parcel_idx on public.ai_delay_predictions(parcel_id);
create index if not exists intelligence_alerts_parcel_idx on public.intelligence_alerts(parcel_id);
create index if not exists intelligence_alerts_document_idx on public.intelligence_alerts(document_id);