-- =============================================================================
-- DHS ENTERPRISE DEMO DATA — SEED SCRIPT
-- Fortune 500 synthetic data for all 10 business domains
-- Reuses existing schema: slm_registry, sessions, query_history,
--   bandit_scores, ingest_jobs
-- Run: psql -U orchestrator -d orchestrator -f demo-data/sql/01_seed_sessions.sql
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SESSIONS (10 domains × 1 session each)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO sessions (session_id, session_name, domain_tags, user_goal, corpus_path, db_config, graph_path, created_at, updated_at)
VALUES
  ('sess-sc-001',  'Global Supply Chain Intelligence',
   ARRAY['procurement','freight','demand-forecast','inventory','3PL','tariffs'],
   'Build an end-to-end supply chain visibility platform that detects disruptions from tariff changes, port closures and weather events and auto-triggers demand forecast revisions.',
   './corpus_store/demo-sc-001', NULL, './corpus_store/demo-sc-001/graphify-out/graph.json',
   NOW() - INTERVAL '45 days', NOW() - INTERVAL '2 days'),

  ('sess-fr-002',  'Financial Risk & Regulatory Compliance Hub',
   ARRAY['basel-iv','credit-risk','AML','regulatory-reporting','stress-test'],
   'Automate Basel IV capital adequacy reporting, flag AML anomalies in real-time and produce PRA/ECB stress-test submissions with audit trails.',
   './corpus_store/demo-fr-002', NULL, './corpus_store/demo-fr-002/graphify-out/graph.json',
   NOW() - INTERVAL '38 days', NOW() - INTERVAL '1 day'),

  ('sess-cx-003',  'Customer Experience & CLV Analytics',
   ARRAY['CLV','churn','NPS','personalisation','omnichannel'],
   'Predict 90-day churn for 8.4M retail customers, surface top NPS drivers, and recommend personalised product bundles per customer microsegment.',
   './corpus_store/demo-cx-003', NULL, './corpus_store/demo-cx-003/graphify-out/graph.json',
   NOW() - INTERVAL '30 days', NOW() - INTERVAL '3 hours'),

  ('sess-hr-004',  'Workforce Planning & Talent Intelligence',
   ARRAY['workforce-planning','attrition','succession','skills-gap','DEI'],
   'Identify critical role vacancies 12 months ahead, surface skills gaps across 62,000 employees, and generate DEI equity audit reports for the board.',
   './corpus_store/demo-hr-004', NULL, './corpus_store/demo-hr-004/graphify-out/graph.json',
   NOW() - INTERVAL '25 days', NOW() - INTERVAL '6 hours'),

  ('sess-it-005',  'Cybersecurity & Infrastructure Intelligence',
   ARRAY['zero-trust','SOC','cloud-migration','ITIL','incident-response'],
   'Correlate SIEM alerts with threat intel feeds, generate zero-trust policy recommendations and produce ITIL major incident root cause analyses automatically.',
   './corpus_store/demo-it-005', NULL, './corpus_store/demo-it-005/graphify-out/graph.json',
   NOW() - INTERVAL '20 days', NOW() - INTERVAL '12 hours'),

  ('sess-rd-006',  'Product Innovation & R&D Intelligence',
   ARRAY['stage-gate','patent','GTM','open-innovation','NPD'],
   'Identify white-space opportunities in patent landscape, accelerate stage-gate reviews using AI-assisted technical feasibility scoring, and map open innovation partners.',
   './corpus_store/demo-rd-006', NULL, './corpus_store/demo-rd-006/graphify-out/graph.json',
   NOW() - INTERVAL '18 days', NOW() - INTERVAL '1 day'),

  ('sess-esg-007', 'ESG & Net-Zero Intelligence',
   ARRAY['TCFD','scope-3','net-zero','supplier-ESG','biodiversity'],
   'Calculate Scope 3 Category 1 and 11 emissions across 2,400 suppliers, model net-zero pathways under IEA NZE2050 and prepare TCFD/CSRD disclosures.',
   './corpus_store/demo-esg-007', NULL, './corpus_store/demo-esg-007/graphify-out/graph.json',
   NOW() - INTERVAL '15 days', NOW() - INTERVAL '4 hours'),

  ('sess-mfg-008', 'Manufacturing Quality & Predictive Maintenance',
   ARRAY['six-sigma','OEE','SPC','FDA-CFR-21','ISO-9001'],
   'Reduce defect rate on Line 7 from 3.2% to below 0.8% using real-time SPC, predict equipment failures 72h ahead and auto-generate FDA 21 CFR Part 11 deviation reports.',
   './corpus_store/demo-mfg-008', NULL, './corpus_store/demo-mfg-008/graphify-out/graph.json',
   NOW() - INTERVAL '12 days', NOW() - INTERVAL '8 hours'),

  ('sess-ma-009',  'M&A Deal Intelligence & Integration Tracker',
   ARRAY['due-diligence','synergy','integration','valuation','deal-flow'],
   'Screen 200+ acquisition targets in the $50M-$500M revenue band, model synergy cases for top 10 shortlisted targets, and track post-merger integration milestones.',
   './corpus_store/demo-ma-009', NULL, './corpus_store/demo-ma-009/graphify-out/graph.json',
   NOW() - INTERVAL '10 days', NOW() - INTERVAL '2 days'),

  ('sess-dt-010',  'Digital Transformation & Platform Architecture',
   ARRAY['microservices','data-mesh','API-first','AI-governance','platform-engineering'],
   'Decompose monolithic ERP into 34 bounded-context microservices, implement data mesh domain ownership, and establish AI model governance framework across 16 product teams.',
   './corpus_store/demo-dt-010', NULL, './corpus_store/demo-dt-010/graphify-out/graph.json',
   NOW() - INTERVAL '8 days', NOW() - INTERVAL '5 hours')

ON CONFLICT (session_id) DO NOTHING;
