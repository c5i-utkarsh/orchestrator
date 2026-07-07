-- =============================================================================
-- SLM REGISTRY — 10 trained domain models
-- =============================================================================
INSERT INTO slm_registry (
  model_id, domain_label, coverage_topics, training_corpus_hash, base_model,
  adapter_type, val_loss, hallucination_rate, task_completion_rate, model_path,
  ollama_model_name, vram_required_gb, build_trigger_query, build_trigger_scores,
  created_at, last_used_at, query_count, retrain_needed
) VALUES

  ('dhs-slm-supply-chain-v3',
   'supply_chain_logistics',
   ARRAY['procurement','demand-forecast','freight-optimisation','inventory-management','supplier-risk','tariff-impact','3PL-performance','port-disruption'],
   'sha256:a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
   'SmolLM2-1.7B-Instruct', 'qlora', 0.0812, 0.047, 0.941,
   './slm_store/dhs-slm-supply-chain-v3', 'dhs-slm-supply-chain-v3', 4.2,
   'Build a supply chain intelligence system that auto-triggers demand forecast revisions when tariff changes or port closures are detected.',
   '{"benchmark_delta": 0.18, "coverage_gap": 0.21, "domain_specificity": 0.89}'::jsonb,
   NOW() - INTERVAL '42 days', NOW() - INTERVAL '2 hours', 287, FALSE),

  ('dhs-slm-financial-risk-v2',
   'financial_risk_compliance',
   ARRAY['basel-iv-capital','credit-risk-modelling','AML-detection','stress-testing','regulatory-reporting','counterparty-risk','liquidity-coverage','model-risk'],
   'sha256:b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3',
   'SmolLM2-1.7B-Instruct', 'qlora', 0.0694, 0.031, 0.963,
   './slm_store/dhs-slm-financial-risk-v2', 'dhs-slm-financial-risk-v2', 4.2,
   'Automate Basel IV capital adequacy reporting and flag AML anomalies in real time.',
   '{"benchmark_delta": 0.22, "coverage_gap": 0.15, "domain_specificity": 0.93}'::jsonb,
   NOW() - INTERVAL '35 days', NOW() - INTERVAL '1 hour', 412, FALSE),

  ('dhs-slm-cx-analytics-v2',
   'customer_experience_analytics',
   ARRAY['CLV-prediction','churn-modelling','NPS-driver-analysis','personalisation','omnichannel-journey','microsegmentation','propensity-scoring','retention'],
   'sha256:c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4',
   'SmolLM2-1.7B-Instruct', 'qlora', 0.0741, 0.053, 0.937,
   './slm_store/dhs-slm-cx-analytics-v2', 'dhs-slm-cx-analytics-v2', 4.2,
   'Predict 90-day churn for retail customers and recommend personalised product bundles.',
   '{"benchmark_delta": 0.16, "coverage_gap": 0.18, "domain_specificity": 0.87}'::jsonb,
   NOW() - INTERVAL '28 days', NOW() - INTERVAL '3 hours', 198, FALSE),

  ('dhs-slm-hr-workforce-v1',
   'hr_talent_workforce',
   ARRAY['attrition-prediction','skills-gap-analysis','succession-planning','workforce-capacity','DEI-reporting','talent-acquisition','learning-pathways','org-design'],
   'sha256:d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5',
   'SmolLM2-1.7B-Instruct', 'qlora', 0.0887, 0.062, 0.918,
   './slm_store/dhs-slm-hr-workforce-v1', 'dhs-slm-hr-workforce-v1', 4.2,
   'Identify critical role vacancies 12 months ahead and surface skills gaps across 62,000 employees.',
   '{"benchmark_delta": 0.14, "coverage_gap": 0.23, "domain_specificity": 0.84}'::jsonb,
   NOW() - INTERVAL '22 days', NOW() - INTERVAL '6 hours', 143, FALSE),

  ('dhs-slm-cybersecurity-v2',
   'it_infrastructure_security',
   ARRAY['zero-trust-policy','threat-detection','SIEM-correlation','incident-response','cloud-security','vulnerability-management','ITIL-processes','access-governance'],
   'sha256:e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6',
   'SmolLM2-1.7B-Instruct', 'qlora', 0.0723, 0.039, 0.952,
   './slm_store/dhs-slm-cybersecurity-v2', 'dhs-slm-cybersecurity-v2', 4.2,
   'Correlate SIEM alerts with threat intel feeds and generate zero-trust policy recommendations.',
   '{"benchmark_delta": 0.20, "coverage_gap": 0.12, "domain_specificity": 0.91}'::jsonb,
   NOW() - INTERVAL '18 days', NOW() - INTERVAL '12 hours', 167, FALSE),

  ('dhs-slm-product-rd-v1',
   'product_rd_innovation',
   ARRAY['patent-landscape','stage-gate-review','GTM-planning','open-innovation','NPD-process','technology-readiness','competitor-analysis','IP-strategy'],
   'sha256:f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1',
   'SmolLM2-1.7B-Instruct', 'none', 0.1043, 0.071, 0.904,
   './slm_store/dhs-slm-product-rd-v1', 'llama3:8b', 3.8,
   'Identify white-space patent opportunities and accelerate stage-gate reviews with AI scoring.',
   '{"benchmark_delta": 0.11, "coverage_gap": 0.28, "domain_specificity": 0.81}'::jsonb,
   NOW() - INTERVAL '16 days', NOW() - INTERVAL '1 day', 89, TRUE),

  ('dhs-slm-esg-v2',
   'esg_sustainability',
   ARRAY['scope-3-emissions','TCFD-disclosure','supplier-ESG-scoring','net-zero-pathway','carbon-accounting','biodiversity-impact','CSRD-reporting','green-finance'],
   'sha256:a1c3e5b2d4f6a1c3e5b2d4f6a1c3e5b2d4f6a1c3e5b2d4f6a1c3e5b2d4f6a1c3',
   'SmolLM2-1.7B-Instruct', 'qlora', 0.0768, 0.044, 0.935,
   './slm_store/dhs-slm-esg-v2', 'dhs-slm-esg-v2', 4.2,
   'Calculate Scope 3 Category 1 and 11 emissions across 2,400 suppliers and prepare TCFD disclosures.',
   '{"benchmark_delta": 0.19, "coverage_gap": 0.16, "domain_specificity": 0.90}'::jsonb,
   NOW() - INTERVAL '13 days', NOW() - INTERVAL '4 hours', 121, FALSE),

  ('dhs-slm-manufacturing-v3',
   'manufacturing_quality',
   ARRAY['six-sigma-DMAIC','OEE-optimisation','SPC-control-charts','predictive-maintenance','FDA-CFR-21','ISO-9001-audit','defect-root-cause','FMEA'],
   'sha256:b2d4f6c1e3a5b2d4f6c1e3a5b2d4f6c1e3a5b2d4f6c1e3a5b2d4f6c1e3a5b2d4',
   'SmolLM2-1.7B-Instruct', 'qlora', 0.0651, 0.028, 0.968,
   './slm_store/dhs-slm-manufacturing-v3', 'dhs-slm-manufacturing-v3', 4.2,
   'Reduce Line 7 defect rate from 3.2% to below 0.8% and predict equipment failures 72h ahead.',
   '{"benchmark_delta": 0.24, "coverage_gap": 0.10, "domain_specificity": 0.94}'::jsonb,
   NOW() - INTERVAL '10 days', NOW() - INTERVAL '8 hours', 203, FALSE),

  ('dhs-slm-ma-strategy-v1',
   'mergers_acquisitions',
   ARRAY['target-screening','financial-due-diligence','synergy-modelling','integration-planning','valuation-methodology','deal-structuring','PMI-tracking','carve-out'],
   'sha256:c3e5a1d2f4b6c3e5a1d2f4b6c3e5a1d2f4b6c3e5a1d2f4b6c3e5a1d2f4b6c3e5',
   'SmolLM2-1.7B-Instruct', 'qlora', 0.0821, 0.055, 0.929,
   './slm_store/dhs-slm-ma-strategy-v1', 'dhs-slm-ma-strategy-v1', 4.2,
   'Screen 200+ acquisition targets and model synergy cases for the top 10 shortlisted.',
   '{"benchmark_delta": 0.17, "coverage_gap": 0.20, "domain_specificity": 0.88}'::jsonb,
   NOW() - INTERVAL '8 days', NOW() - INTERVAL '2 days', 76, FALSE),

  ('dhs-slm-digital-transform-v2',
   'digital_transformation',
   ARRAY['microservices-decomposition','data-mesh-design','API-governance','AI-model-governance','platform-engineering','domain-driven-design','cloud-native','tech-debt'],
   'sha256:d4f6b1e3c5a2d4f6b1e3c5a2d4f6b1e3c5a2d4f6b1e3c5a2d4f6b1e3c5a2d4f6',
   'SmolLM2-1.7B-Instruct', 'qlora', 0.0779, 0.048, 0.934,
   './slm_store/dhs-slm-digital-transform-v2', 'dhs-slm-digital-transform-v2', 4.2,
   'Decompose monolithic ERP into microservices and implement data mesh domain ownership.',
   '{"benchmark_delta": 0.18, "coverage_gap": 0.17, "domain_specificity": 0.89}'::jsonb,
   NOW() - INTERVAL '6 days', NOW() - INTERVAL '5 hours', 154, FALSE)

ON CONFLICT (model_id) DO NOTHING;

-- Link SLMs to sessions
UPDATE sessions SET assigned_slm = 'dhs-slm-supply-chain-v3'      WHERE session_id = 'sess-sc-001';
UPDATE sessions SET assigned_slm = 'dhs-slm-financial-risk-v2'    WHERE session_id = 'sess-fr-002';
UPDATE sessions SET assigned_slm = 'dhs-slm-cx-analytics-v2'      WHERE session_id = 'sess-cx-003';
UPDATE sessions SET assigned_slm = 'dhs-slm-hr-workforce-v1'      WHERE session_id = 'sess-hr-004';
UPDATE sessions SET assigned_slm = 'dhs-slm-cybersecurity-v2'     WHERE session_id = 'sess-it-005';
UPDATE sessions SET assigned_slm = 'dhs-slm-product-rd-v1'        WHERE session_id = 'sess-rd-006';
UPDATE sessions SET assigned_slm = 'dhs-slm-esg-v2'               WHERE session_id = 'sess-esg-007';
UPDATE sessions SET assigned_slm = 'dhs-slm-manufacturing-v3'     WHERE session_id = 'sess-mfg-008';
UPDATE sessions SET assigned_slm = 'dhs-slm-ma-strategy-v1'       WHERE session_id = 'sess-ma-009';
UPDATE sessions SET assigned_slm = 'dhs-slm-digital-transform-v2' WHERE session_id = 'sess-dt-010';
