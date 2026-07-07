-- =============================================================================
-- BANDIT SCORES — model performance by task type across all domains
-- =============================================================================
INSERT INTO bandit_scores (task_type, model_id, score, query_count, updated_at)
VALUES
  -- Supply chain / logistics
  ('analysis',          'dhs-slm-supply-chain-v3',    0.941, 87,  NOW() - INTERVAL '2 hours'),
  ('planning',          'dhs-slm-supply-chain-v3',    0.928, 64,  NOW() - INTERVAL '3 hours'),
  ('forecasting',       'dhs-slm-supply-chain-v3',    0.953, 48,  NOW() - INTERVAL '5 hours'),
  ('risk_assessment',   'dhs-slm-supply-chain-v3',    0.917, 42,  NOW() - INTERVAL '6 hours'),
  ('optimisation',      'dhs-slm-supply-chain-v3',    0.934, 31,  NOW() - INTERVAL '8 hours'),
  ('performance_review','dhs-slm-supply-chain-v3',    0.922, 15,  NOW() - INTERVAL '10 hours'),

  -- Financial risk
  ('regulatory',        'dhs-slm-financial-risk-v2',  0.963, 112, NOW() - INTERVAL '1 hour'),
  ('detection',         'dhs-slm-financial-risk-v2',  0.974, 98,  NOW() - INTERVAL '2 hours'),
  ('stress_test',       'dhs-slm-financial-risk-v2',  0.958, 67,  NOW() - INTERVAL '3 hours'),
  ('reporting',         'dhs-slm-financial-risk-v2',  0.947, 89,  NOW() - INTERVAL '4 hours'),
  ('model_governance',  'dhs-slm-financial-risk-v2',  0.961, 46,  NOW() - INTERVAL '6 hours'),

  -- Customer experience
  ('analysis',          'dhs-slm-cx-analytics-v2',    0.932, 54,  NOW() - INTERVAL '3 hours'),
  ('root_cause',        'dhs-slm-cx-analytics-v2',    0.918, 38,  NOW() - INTERVAL '4 hours'),
  ('recommendation',    'dhs-slm-cx-analytics-v2',    0.944, 47,  NOW() - INTERVAL '5 hours'),
  ('attribution',       'dhs-slm-cx-analytics-v2',    0.921, 29,  NOW() - INTERVAL '7 hours'),
  ('journey_analysis',  'dhs-slm-cx-analytics-v2',    0.913, 30,  NOW() - INTERVAL '8 hours'),

  -- HR workforce
  ('analysis',          'dhs-slm-hr-workforce-v1',    0.919, 41,  NOW() - INTERVAL '6 hours'),
  ('planning',          'dhs-slm-hr-workforce-v1',    0.908, 33,  NOW() - INTERVAL '8 hours'),
  ('reporting',         'dhs-slm-hr-workforce-v1',    0.931, 28,  NOW() - INTERVAL '10 hours'),
  ('root_cause',        'dhs-slm-hr-workforce-v1',    0.901, 21,  NOW() - INTERVAL '12 hours'),

  -- Cybersecurity
  ('incident_response', 'dhs-slm-cybersecurity-v2',   0.957, 73,  NOW() - INTERVAL '12 hours'),
  ('risk_assessment',   'dhs-slm-cybersecurity-v2',   0.943, 58,  NOW() - INTERVAL '14 hours'),
  ('policy',            'dhs-slm-cybersecurity-v2',   0.961, 36,  NOW() - INTERVAL '16 hours'),
  ('service_management','dhs-slm-cybersecurity-v2',   0.948, 27,  NOW() - INTERVAL '18 hours'),

  -- ESG
  ('calculation',       'dhs-slm-esg-v2',             0.938, 34,  NOW() - INTERVAL '4 hours'),
  ('modelling',         'dhs-slm-esg-v2',             0.944, 28,  NOW() - INTERVAL '5 hours'),
  ('scoring',           'dhs-slm-esg-v2',             0.927, 32,  NOW() - INTERVAL '6 hours'),
  ('disclosure',        'dhs-slm-esg-v2',             0.951, 27,  NOW() - INTERVAL '7 hours'),

  -- Manufacturing
  ('root_cause',        'dhs-slm-manufacturing-v3',   0.972, 61,  NOW() - INTERVAL '8 hours'),
  ('performance_review','dhs-slm-manufacturing-v3',   0.967, 53,  NOW() - INTERVAL '9 hours'),
  ('maintenance',       'dhs-slm-manufacturing-v3',   0.978, 49,  NOW() - INTERVAL '10 hours'),
  ('compliance',        'dhs-slm-manufacturing-v3',   0.963, 40,  NOW() - INTERVAL '12 hours'),

  -- M&A
  ('screening',         'dhs-slm-ma-strategy-v1',     0.929, 22,  NOW() - INTERVAL '2 days'),
  ('financial_modelling','dhs-slm-ma-strategy-v1',    0.941, 19,  NOW() - INTERVAL '2 days'),
  ('planning',          'dhs-slm-ma-strategy-v1',     0.914, 18,  NOW() - INTERVAL '3 days'),
  ('tracking',          'dhs-slm-ma-strategy-v1',     0.923, 17,  NOW() - INTERVAL '3 days'),

  -- Digital transformation
  ('architecture',      'dhs-slm-digital-transform-v2', 0.938, 47, NOW() - INTERVAL '2 hours'),
  ('governance',        'dhs-slm-digital-transform-v2', 0.944, 38, NOW() - INTERVAL '3 hours'),
  ('analysis',          'dhs-slm-digital-transform-v2', 0.931, 42, NOW() - INTERVAL '4 hours'),

  -- Baseline Ollama fallback scores
  ('analysis',          'llama3:8b',                  0.821, 312, NOW() - INTERVAL '1 hour'),
  ('planning',          'llama3:8b',                  0.807, 278, NOW() - INTERVAL '2 hours'),
  ('reporting',         'llama3:8b',                  0.834, 201, NOW() - INTERVAL '3 hours'),
  ('root_cause',        'llama3:8b',                  0.798, 187, NOW() - INTERVAL '4 hours'),
  ('analysis',          'gemma3',                     0.811, 156, NOW() - INTERVAL '5 hours'),
  ('recommendation',    'gemma3',                     0.819, 143, NOW() - INTERVAL '6 hours')

ON CONFLICT (task_type, model_id) DO UPDATE
  SET score = EXCLUDED.score,
      query_count = EXCLUDED.query_count,
      updated_at = EXCLUDED.updated_at;
