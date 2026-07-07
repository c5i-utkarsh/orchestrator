-- =============================================================================
-- INGEST JOBS — 10 completed ingestion jobs
-- =============================================================================
INSERT INTO ingest_jobs (
  job_id, session_id, status, progress, corpus_path, graph_path,
  domain_label, file_count, entity_count, community_count, metadata,
  created_at, completed_at
) VALUES

  ('job-sc-001', 'sess-sc-001', 'graph_done',
   '{"overall_pct":100,"steps":{"parse":100,"dedup":100,"quality":100,"graph":100}}'::jsonb,
   '../corpus_store/demo-sc-001',
   '../corpus_store/demo-sc-001/graphify-out/graph.json',
   'supply_chain_logistics', 12, 487, 8,
   '{"corpus_hash":"sha256:a1b2c3d4","file_types":[".pdf",".xlsx",".txt"],"avg_quality_score":0.871,"dedup_removed":3}'::jsonb,
   NOW() - INTERVAL '45 days', NOW() - INTERVAL '44 days 22 hours'),

  ('job-fr-002', 'sess-fr-002', 'graph_done',
   '{"overall_pct":100,"steps":{"parse":100,"dedup":100,"quality":100,"graph":100}}'::jsonb,
   '../corpus_store/demo-fr-002',
   '../corpus_store/demo-fr-002/graphify-out/graph.json',
   'financial_risk_compliance', 16, 612, 11,
   '{"corpus_hash":"sha256:b2c3d4e5","file_types":[".pdf",".docx",".csv"],"avg_quality_score":0.904,"dedup_removed":2}'::jsonb,
   NOW() - INTERVAL '38 days', NOW() - INTERVAL '37 days 21 hours'),

  ('job-cx-003', 'sess-cx-003', 'graph_done',
   '{"overall_pct":100,"steps":{"parse":100,"dedup":100,"quality":100,"graph":100}}'::jsonb,
   '../corpus_store/demo-cx-003',
   '../corpus_store/demo-cx-003/graphify-out/graph.json',
   'customer_experience_analytics', 10, 398, 7,
   '{"corpus_hash":"sha256:c3d4e5f6","file_types":[".pdf",".pptx",".csv"],"avg_quality_score":0.856,"dedup_removed":1}'::jsonb,
   NOW() - INTERVAL '30 days', NOW() - INTERVAL '29 days 23 hours'),

  ('job-hr-004', 'sess-hr-004', 'graph_done',
   '{"overall_pct":100,"steps":{"parse":100,"dedup":100,"quality":100,"graph":100}}'::jsonb,
   '../corpus_store/demo-hr-004',
   '../corpus_store/demo-hr-004/graphify-out/graph.json',
   'hr_talent_workforce', 9, 341, 6,
   '{"corpus_hash":"sha256:d4e5f6a1","file_types":[".pdf",".xlsx"],"avg_quality_score":0.839,"dedup_removed":2}'::jsonb,
   NOW() - INTERVAL '25 days', NOW() - INTERVAL '24 days 22 hours'),

  ('job-it-005', 'sess-it-005', 'graph_done',
   '{"overall_pct":100,"steps":{"parse":100,"dedup":100,"quality":100,"graph":100}}'::jsonb,
   '../corpus_store/demo-it-005',
   '../corpus_store/demo-it-005/graphify-out/graph.json',
   'it_infrastructure_security', 14, 523, 9,
   '{"corpus_hash":"sha256:e5f6a1b2","file_types":[".pdf",".md",".txt",".yaml"],"avg_quality_score":0.887,"dedup_removed":4}'::jsonb,
   NOW() - INTERVAL '20 days', NOW() - INTERVAL '19 days 23 hours'),

  ('job-rd-006', 'sess-rd-006', 'graph_done',
   '{"overall_pct":100,"steps":{"parse":100,"dedup":100,"quality":100,"graph":100}}'::jsonb,
   '../corpus_store/demo-rd-006',
   '../corpus_store/demo-rd-006/graphify-out/graph.json',
   'product_rd_innovation', 8, 289, 5,
   '{"corpus_hash":"sha256:f6a1b2c3","file_types":[".pdf",".pptx"],"avg_quality_score":0.821,"dedup_removed":1}'::jsonb,
   NOW() - INTERVAL '18 days', NOW() - INTERVAL '17 days 22 hours'),

  ('job-esg-007', 'sess-esg-007', 'graph_done',
   '{"overall_pct":100,"steps":{"parse":100,"dedup":100,"quality":100,"graph":100}}'::jsonb,
   '../corpus_store/demo-esg-007',
   '../corpus_store/demo-esg-007/graphify-out/graph.json',
   'esg_sustainability', 11, 421, 7,
   '{"corpus_hash":"sha256:a1c3e5b2","file_types":[".pdf",".xlsx",".csv"],"avg_quality_score":0.863,"dedup_removed":2}'::jsonb,
   NOW() - INTERVAL '15 days', NOW() - INTERVAL '14 days 22 hours'),

  ('job-mfg-008', 'sess-mfg-008', 'graph_done',
   '{"overall_pct":100,"steps":{"parse":100,"dedup":100,"quality":100,"graph":100}}'::jsonb,
   '../corpus_store/demo-mfg-008',
   '../corpus_store/demo-mfg-008/graphify-out/graph.json',
   'manufacturing_quality', 13, 558, 10,
   '{"corpus_hash":"sha256:b2d4f6c1","file_types":[".pdf",".csv",".xlsx",".txt"],"avg_quality_score":0.912,"dedup_removed":5}'::jsonb,
   NOW() - INTERVAL '12 days', NOW() - INTERVAL '11 days 21 hours'),

  ('job-ma-009', 'sess-ma-009', 'graph_done',
   '{"overall_pct":100,"steps":{"parse":100,"dedup":100,"quality":100,"graph":100}}'::jsonb,
   '../corpus_store/demo-ma-009',
   '../corpus_store/demo-ma-009/graphify-out/graph.json',
   'mergers_acquisitions', 7, 267, 5,
   '{"corpus_hash":"sha256:c3e5a1d2","file_types":[".pdf",".xlsx"],"avg_quality_score":0.876,"dedup_removed":1}'::jsonb,
   NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days 22 hours'),

  ('job-dt-010', 'sess-dt-010', 'graph_done',
   '{"overall_pct":100,"steps":{"parse":100,"dedup":100,"quality":100,"graph":100}}'::jsonb,
   '../corpus_store/demo-dt-010',
   '../corpus_store/demo-dt-010/graphify-out/graph.json',
   'digital_transformation', 10, 374, 7,
   '{"corpus_hash":"sha256:d4f6b1e3","file_types":[".md",".pdf",".yaml",".txt"],"avg_quality_score":0.858,"dedup_removed":2}'::jsonb,
   NOW() - INTERVAL '8 days', NOW() - INTERVAL '7 days 22 hours')

ON CONFLICT (job_id) DO NOTHING;
