// ─────────────────────────────────────────────────────────────────────────────
// DHS Demo Mode — data compiled from demo-data/ on 2026-07-02.
// Source files:
//   demo-data/json/domains.json          → DEMO_DOMAINS
//   demo-data/json/graph_*.json           → DEMO_GRAPHS
//   demo-data/json/wiki_*.md              → DEMO_WIKIS
//   demo-data/csv/entities.csv            → per-domain graph nodes
//   demo-data/csv/relationships.csv       → per-domain graph edges
//   demo-data/csv/benchmark_results.csv  → DEMO_BENCHMARK_ROWS
//   demo-data/csv/feedback_records.csv   → DEMO_FEEDBACK
// API shapes captured from live backend on 2026-07-02.
// ─────────────────────────────────────────────────────────────────────────────

export const DEMO_DOMAINS = [
  {
    "domain_id": "DOM-001",
    "label": "supply_chain_logistics",
    "display_name": "Supply Chain & Logistics",
    "business_unit": "Global Operations",
    "description": "End-to-end supply chain visibility, procurement analytics, freight optimisation, and demand forecasting across 47 distribution centres.",
    "industry": "Manufacturing & Logistics",
    "tags": [
      "procurement",
      "freight",
      "demand-forecast",
      "inventory",
      "3PL",
      "tariffs"
    ],
    "session_id": "sess-sc-001",
    "job_id": "job-sc-001"
  },
  {
    "domain_id": "DOM-002",
    "label": "financial_risk_compliance",
    "display_name": "Financial Risk & Compliance",
    "business_unit": "Group Risk",
    "description": "Basel IV capital adequacy, credit risk modelling, AML transaction monitoring, and regulatory reporting for 140+ jurisdictions.",
    "industry": "Financial Services",
    "tags": [
      "basel-iv",
      "credit-risk",
      "AML",
      "regulatory-reporting",
      "stress-test"
    ],
    "session_id": "sess-fr-002",
    "job_id": "job-fr-002"
  },
  {
    "domain_id": "DOM-003",
    "label": "customer_experience_analytics",
    "display_name": "Customer Experience & Analytics",
    "business_unit": "Digital & Marketing",
    "description": "CLV modelling, NPS driver analysis, omnichannel journey mapping, churn prediction, and personalisation engine for 8.4M retail customers.",
    "industry": "Retail Banking",
    "tags": [
      "CLV",
      "churn",
      "NPS",
      "personalisation",
      "omnichannel",
      "retention"
    ],
    "session_id": "sess-cx-003",
    "job_id": "job-cx-003"
  },
  {
    "domain_id": "DOM-004",
    "label": "hr_talent_workforce",
    "display_name": "HR, Talent & Workforce Planning",
    "business_unit": "People & Culture",
    "description": "Workforce capacity planning, skills gap analysis, attrition modelling, succession planning, and DEI reporting for 62,000 employees globally.",
    "industry": "Enterprise HR",
    "tags": [
      "workforce-planning",
      "attrition",
      "succession",
      "skills-gap",
      "DEI"
    ],
    "session_id": "sess-hr-004",
    "job_id": "job-hr-004"
  },
  {
    "domain_id": "DOM-005",
    "label": "it_infrastructure_security",
    "display_name": "IT Infrastructure & Cybersecurity",
    "business_unit": "Technology & Security",
    "description": "Zero-trust architecture rollout, SOC threat detection, cloud migration (AWS/Azure hybrid), incident response playbooks, and ITIL v4 service management.",
    "industry": "Enterprise IT",
    "tags": [
      "zero-trust",
      "SOC",
      "cloud-migration",
      "ITIL",
      "incident-response",
      "SIEM"
    ],
    "session_id": "sess-it-005",
    "job_id": "job-it-005"
  },
  {
    "domain_id": "DOM-006",
    "label": "product_rd_innovation",
    "display_name": "Product R&D & Innovation",
    "business_unit": "Innovation Lab",
    "description": "Stage-gate product development, patent landscape analysis, go-to-market planning, and open innovation partnership management.",
    "industry": "Consumer Goods",
    "tags": [
      "stage-gate",
      "patent",
      "GTM",
      "open-innovation",
      "NPD",
      "roadmap"
    ],
    "session_id": "sess-rd-006",
    "job_id": "job-rd-006"
  },
  {
    "domain_id": "DOM-007",
    "label": "esg_sustainability",
    "display_name": "ESG & Sustainability",
    "business_unit": "Corporate Affairs",
    "description": "Scope 1/2/3 emissions tracking, TCFD disclosure, supplier ESG scoring, net-zero pathway modelling, and biodiversity impact assessment.",
    "industry": "Cross-Sector ESG",
    "tags": [
      "TCFD",
      "scope-3",
      "net-zero",
      "supplier-ESG",
      "biodiversity",
      "CSRD"
    ],
    "session_id": "sess-esg-007",
    "job_id": "job-esg-007"
  },
  {
    "domain_id": "DOM-008",
    "label": "manufacturing_quality",
    "display_name": "Manufacturing & Quality Engineering",
    "business_unit": "Operations Excellence",
    "description": "Six Sigma defect reduction, predictive maintenance (OEE), SPC dashboards, FDA 21 CFR Part 11 compliance, and ISO 9001 audit management.",
    "industry": "Pharmaceutical Manufacturing",
    "tags": [
      "six-sigma",
      "OEE",
      "SPC",
      "FDA-CFR-21",
      "ISO-9001",
      "predictive-maintenance"
    ],
    "session_id": "sess-mfg-008",
    "job_id": "job-mfg-008"
  },
  {
    "domain_id": "DOM-009",
    "label": "mergers_acquisitions",
    "display_name": "Mergers, Acquisitions & Corporate Development",
    "business_unit": "Strategy & Corp Dev",
    "description": "M&A target screening, financial due diligence, integration playbooks, synergy tracking, and post-merger performance monitoring.",
    "industry": "Corporate Strategy",
    "tags": [
      "due-diligence",
      "synergy",
      "integration",
      "valuation",
      "deal-flow",
      "PMI"
    ],
    "session_id": "sess-ma-009",
    "job_id": "job-ma-009"
  },
  {
    "domain_id": "DOM-010",
    "label": "digital_transformation",
    "display_name": "Digital Transformation & Platform Engineering",
    "business_unit": "Digital Architecture",
    "description": "API-first modernisation, microservices migration, data mesh implementation, AI platform governance, and digital product portfolio management.",
    "industry": "Enterprise Technology",
    "tags": [
      "microservices",
      "data-mesh",
      "API-first",
      "AI-governance",
      "platform-engineering"
    ],
    "session_id": "sess-dt-010",
    "job_id": "job-dt-010"
  }
] as const;

export const DEMO_BENCHMARK = {
  "generated_from": "real system data (query_history, bandit_scores, slm_registry, ingest_jobs, on-disk graph artifacts)",
  "sample_sizes": {
    "queries": 44,
    "slm_models": 11
  },
  "overview": {
    "combined_score": 0.839,
    "harness_score": 0.942,
    "functional_score": 0.125,
    "technical_score": 0.839,
    "hallucination_rate": 0.04,
    "avg_latency_ms": 3761.0,
    "baseline_ab_score": null,
    "performance_gap": null,
    "operating_cost_reduction": null,
    "business_value_generated": null
  },
  "harness": {
    "dimensions": {
      "accuracy": 0.9280090909090909,
      "governance": 0.9600227272727273,
      "context_awareness": null,
      "business_relevance": null,
      "actionability": null,
      "explainability": null
    },
    "dimension_measured": {
      "accuracy": true,
      "governance": true,
      "context_awareness": false,
      "business_relevance": false,
      "actionability": false,
      "explainability": false
    },
    "score": 0.942,
    "task_distribution": [
      {
        "category": "DOMAIN",
        "count": 44
      }
    ]
  },
  "functional": {
    "components": {
      "problem_understanding": 0.125,
      "output_quality": null,
      "user_adoption": null,
      "business_impact": null
    },
    "component_measured": {
      "problem_understanding": true,
      "output_quality": false,
      "user_adoption": false,
      "business_impact": false
    },
    "score": 0.125,
    "knowledge_coverage": {
      "job_id": "job-dt-010",
      "entities": 374,
      "communities": 7,
      "files": 10,
      "graph_consistent": null,
      "ontology_conformance": null,
      "graph_nodes": null,
      "graph_edges": null
    }
  },
  "technical": {
    "completion": 0.947,
    "process": 0.923,
    "security": 0.96,
    "combined": 0.839,
    "routing_accuracy": 0.682,
    "learning_velocity": -0.011,
    "attribution_measured": {
      "information_harnessing": true,
      "knowledge_harnessing": true,
      "intelligence_reasoning": true,
      "outcome_harnessing": false
    }
  },
  "executive": {
    "combined_score": 0.839,
    "harness_score": 0.942,
    "functional_score": 0.125,
    "technical_score": 0.839,
    "hallucination_rate": 0.04,
    "routing_accuracy": 0.682,
    "learning_velocity": -0.011,
    "knowledge_entities": 374,
    "roi": null,
    "cost_reduction": null,
    "business_value_generated": null
  },
  "trends": [
    {
      "month": "2026-05",
      "queries": 2,
      "hallucination": 0.029,
      "completion": 0.964,
      "latency_ms": 2986.0
    },
    {
      "month": "2026-06",
      "queries": 36,
      "hallucination": 0.041,
      "completion": 0.945,
      "latency_ms": 3850.0
    },
    {
      "month": "2026-07",
      "queries": 6,
      "hallucination": 0.036,
      "completion": 0.953,
      "latency_ms": 3482.0
    }
  ],
  "unavailable": [
    "baseline_ab_score",
    "combined_score_waterfall_constants",
    "roi_currency",
    "business_value_generated",
    "cost_avoided",
    "hours_saved",
    "revenue_impact"
  ],
  "unavailable_reason": "No producing measurement exists in the system; reported as null, never fabricated."
} as const;

export const DEMO_MODELS = {
  "models": [
    {
      "model_id": "nomic-embed-text:latest",
      "parameter_size": "137M",
      "quantization": "F16",
      "vram_gb": 0.1,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "qwen2.5-coder:7b",
      "parameter_size": "7.6B",
      "quantization": "Q4_K_M",
      "vram_gb": 4.6,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "app_builder_v6:latest",
      "parameter_size": "32.8B",
      "quantization": "Q4_K_M",
      "vram_gb": 19.7,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "llama3:8b",
      "parameter_size": "8.0B",
      "quantization": "Q4_0",
      "vram_gb": 4.8,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "gemma3:latest",
      "parameter_size": "4.3B",
      "quantization": "Q4_K_M",
      "vram_gb": 2.6,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "gemma4:latest",
      "parameter_size": "8.0B",
      "quantization": "Q4_K_M",
      "vram_gb": 4.8,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "qwen2.5:7b",
      "parameter_size": "7.6B",
      "quantization": "Q4_K_M",
      "vram_gb": 4.6,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "qwen2.5:32b",
      "parameter_size": "32.8B",
      "quantization": "Q4_K_M",
      "vram_gb": 19.7,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "mistral:latest",
      "parameter_size": "7.2B",
      "quantization": "Q4_K_M",
      "vram_gb": 4.3,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "llava:13b",
      "parameter_size": "13B",
      "quantization": "Q4_0",
      "vram_gb": 7.8,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "gpt-oss:20b",
      "parameter_size": "20.9B",
      "quantization": "MXFP4",
      "vram_gb": 12.5,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "llava:latest",
      "parameter_size": "7B",
      "quantization": "Q4_0",
      "vram_gb": 4.2,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "gemma3:1b",
      "parameter_size": "999.89M",
      "quantization": "Q4_K_M",
      "vram_gb": 0.6,
      "status": "local",
      "adapter_type": "base",
      "task_types": [],
      "context_window": 4096,
      "provider": "ollama"
    },
    {
      "model_id": "dhs-slm-digital-transform-v2",
      "name": "dhs-slm-digital-transform-v2",
      "base_model": "SmolLM2-1.7B-Instruct",
      "ollama_model_name": "dhs-slm-digital-transform-v2",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 4.2,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "digital_transformation",
      "coverage_topics": [
        "microservices-decomposition",
        "data-mesh-design",
        "API-governance",
        "AI-model-governance",
        "platform-engineering",
        "domain-driven-design",
        "cloud-native",
        "tech-debt"
      ],
      "val_loss": 0.0779,
      "hallucination_rate": 0.048,
      "adapter_type": "qlora",
      "is_custom_slm": true
    },
    {
      "model_id": "dhs-slm-ma-strategy-v1",
      "name": "dhs-slm-ma-strategy-v1",
      "base_model": "SmolLM2-1.7B-Instruct",
      "ollama_model_name": "dhs-slm-ma-strategy-v1",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 4.2,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "mergers_acquisitions",
      "coverage_topics": [
        "target-screening",
        "financial-due-diligence",
        "synergy-modelling",
        "integration-planning",
        "valuation-methodology",
        "deal-structuring",
        "PMI-tracking",
        "carve-out"
      ],
      "val_loss": 0.0821,
      "hallucination_rate": 0.055,
      "adapter_type": "qlora",
      "is_custom_slm": true
    },
    {
      "model_id": "dhs-slm-manufacturing-v3",
      "name": "dhs-slm-manufacturing-v3",
      "base_model": "SmolLM2-1.7B-Instruct",
      "ollama_model_name": "dhs-slm-manufacturing-v3",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 4.2,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "manufacturing_quality",
      "coverage_topics": [
        "six-sigma-DMAIC",
        "OEE-optimisation",
        "SPC-control-charts",
        "predictive-maintenance",
        "FDA-CFR-21",
        "ISO-9001-audit",
        "defect-root-cause",
        "FMEA"
      ],
      "val_loss": 0.0651,
      "hallucination_rate": 0.028,
      "adapter_type": "qlora",
      "is_custom_slm": true
    },
    {
      "model_id": "dhs-slm-esg-v2",
      "name": "dhs-slm-esg-v2",
      "base_model": "SmolLM2-1.7B-Instruct",
      "ollama_model_name": "dhs-slm-esg-v2",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 4.2,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "esg_sustainability",
      "coverage_topics": [
        "scope-3-emissions",
        "TCFD-disclosure",
        "supplier-ESG-scoring",
        "net-zero-pathway",
        "carbon-accounting",
        "biodiversity-impact",
        "CSRD-reporting",
        "green-finance"
      ],
      "val_loss": 0.0768,
      "hallucination_rate": 0.044,
      "adapter_type": "qlora",
      "is_custom_slm": true
    },
    {
      "model_id": "dhs-slm-product-rd-v1",
      "name": "dhs-slm-product-rd-v1",
      "base_model": "SmolLM2-1.7B-Instruct",
      "ollama_model_name": "llama3:8b",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 3.8,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "product_rd_innovation",
      "coverage_topics": [
        "patent-landscape",
        "stage-gate-review",
        "GTM-planning",
        "open-innovation",
        "NPD-process",
        "technology-readiness",
        "competitor-analysis",
        "IP-strategy"
      ],
      "val_loss": 0.1043,
      "hallucination_rate": 0.071,
      "adapter_type": "none",
      "is_custom_slm": true
    },
    {
      "model_id": "dhs-slm-cybersecurity-v2",
      "name": "dhs-slm-cybersecurity-v2",
      "base_model": "SmolLM2-1.7B-Instruct",
      "ollama_model_name": "dhs-slm-cybersecurity-v2",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 4.2,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "it_infrastructure_security",
      "coverage_topics": [
        "zero-trust-policy",
        "threat-detection",
        "SIEM-correlation",
        "incident-response",
        "cloud-security",
        "vulnerability-management",
        "ITIL-processes",
        "access-governance"
      ],
      "val_loss": 0.0723,
      "hallucination_rate": 0.039,
      "adapter_type": "qlora",
      "is_custom_slm": true
    },
    {
      "model_id": "retail_v1",
      "name": "retail_v1",
      "base_model": "app_builder_v6:latest",
      "ollama_model_name": "app_builder_v6:latest",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 1.5,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "retail",
      "coverage_topics": [],
      "val_loss": 0.0,
      "hallucination_rate": null,
      "adapter_type": "none",
      "is_custom_slm": true
    },
    {
      "model_id": "dhs-slm-hr-workforce-v1",
      "name": "dhs-slm-hr-workforce-v1",
      "base_model": "SmolLM2-1.7B-Instruct",
      "ollama_model_name": "dhs-slm-hr-workforce-v1",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 4.2,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "hr_talent_workforce",
      "coverage_topics": [
        "attrition-prediction",
        "skills-gap-analysis",
        "succession-planning",
        "workforce-capacity",
        "DEI-reporting",
        "talent-acquisition",
        "learning-pathways",
        "org-design"
      ],
      "val_loss": 0.0887,
      "hallucination_rate": 0.062,
      "adapter_type": "qlora",
      "is_custom_slm": true
    },
    {
      "model_id": "dhs-slm-cx-analytics-v2",
      "name": "dhs-slm-cx-analytics-v2",
      "base_model": "SmolLM2-1.7B-Instruct",
      "ollama_model_name": "dhs-slm-cx-analytics-v2",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 4.2,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "customer_experience_analytics",
      "coverage_topics": [
        "CLV-prediction",
        "churn-modelling",
        "NPS-driver-analysis",
        "personalisation",
        "omnichannel-journey",
        "microsegmentation",
        "propensity-scoring",
        "retention"
      ],
      "val_loss": 0.0741,
      "hallucination_rate": 0.053,
      "adapter_type": "qlora",
      "is_custom_slm": true
    },
    {
      "model_id": "dhs-slm-financial-risk-v2",
      "name": "dhs-slm-financial-risk-v2",
      "base_model": "SmolLM2-1.7B-Instruct",
      "ollama_model_name": "dhs-slm-financial-risk-v2",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 4.2,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "financial_risk_compliance",
      "coverage_topics": [
        "basel-iv-capital",
        "credit-risk-modelling",
        "AML-detection",
        "stress-testing",
        "regulatory-reporting",
        "counterparty-risk",
        "liquidity-coverage",
        "model-risk"
      ],
      "val_loss": 0.0694,
      "hallucination_rate": 0.031,
      "adapter_type": "qlora",
      "is_custom_slm": true
    },
    {
      "model_id": "dhs-slm-supply-chain-v3",
      "name": "dhs-slm-supply-chain-v3",
      "base_model": "SmolLM2-1.7B-Instruct",
      "ollama_model_name": "dhs-slm-supply-chain-v3",
      "provider": "custom_slm",
      "status": "local",
      "vram_gb": 4.2,
      "context_window": 4096,
      "capabilities": [
        "text_generation",
        "domain_qa"
      ],
      "domain_label": "supply_chain_logistics",
      "coverage_topics": [
        "procurement",
        "demand-forecast",
        "freight-optimisation",
        "inventory-management",
        "supplier-risk",
        "tariff-impact",
        "3PL-performance",
        "port-disruption"
      ],
      "val_loss": 0.0812,
      "hallucination_rate": 0.047,
      "adapter_type": "qlora",
      "is_custom_slm": true
    }
  ],
  "count": 24
} as const;

export const DEMO_SLM_REGISTRY = {
  "slms": [
    {
      "model_id": "dhs-slm-digital-transform-v2",
      "domain_label": "digital_transformation",
      "coverage_topics": [
        "microservices-decomposition",
        "data-mesh-design",
        "API-governance",
        "AI-model-governance",
        "platform-engineering",
        "domain-driven-design",
        "cloud-native",
        "tech-debt"
      ],
      "base_model": "SmolLM2-1.7B-Instruct",
      "adapter_type": "qlora",
      "val_loss": 0.0779,
      "hallucination_rate": 0.048,
      "task_completion_rate": 0.934,
      "ollama_model_name": "dhs-slm-digital-transform-v2",
      "vram_required_gb": 4.2,
      "query_count": 154,
      "retrain_needed": false,
      "created_at": "2026-06-25T20:01:13.519135+00:00",
      "last_used_at": "2026-07-01T15:01:13.519135+00:00"
    },
    {
      "model_id": "dhs-slm-ma-strategy-v1",
      "domain_label": "mergers_acquisitions",
      "coverage_topics": [
        "target-screening",
        "financial-due-diligence",
        "synergy-modelling",
        "integration-planning",
        "valuation-methodology",
        "deal-structuring",
        "PMI-tracking",
        "carve-out"
      ],
      "base_model": "SmolLM2-1.7B-Instruct",
      "adapter_type": "qlora",
      "val_loss": 0.0821,
      "hallucination_rate": 0.055,
      "task_completion_rate": 0.929,
      "ollama_model_name": "dhs-slm-ma-strategy-v1",
      "vram_required_gb": 4.2,
      "query_count": 76,
      "retrain_needed": false,
      "created_at": "2026-06-23T20:01:13.519135+00:00",
      "last_used_at": "2026-06-29T20:01:13.519135+00:00"
    },
    {
      "model_id": "dhs-slm-manufacturing-v3",
      "domain_label": "manufacturing_quality",
      "coverage_topics": [
        "six-sigma-DMAIC",
        "OEE-optimisation",
        "SPC-control-charts",
        "predictive-maintenance",
        "FDA-CFR-21",
        "ISO-9001-audit",
        "defect-root-cause",
        "FMEA"
      ],
      "base_model": "SmolLM2-1.7B-Instruct",
      "adapter_type": "qlora",
      "val_loss": 0.0651,
      "hallucination_rate": 0.028,
      "task_completion_rate": 0.968,
      "ollama_model_name": "dhs-slm-manufacturing-v3",
      "vram_required_gb": 4.2,
      "query_count": 203,
      "retrain_needed": false,
      "created_at": "2026-06-21T20:01:13.519135+00:00",
      "last_used_at": "2026-07-01T12:01:13.519135+00:00"
    },
    {
      "model_id": "dhs-slm-esg-v2",
      "domain_label": "esg_sustainability",
      "coverage_topics": [
        "scope-3-emissions",
        "TCFD-disclosure",
        "supplier-ESG-scoring",
        "net-zero-pathway",
        "carbon-accounting",
        "biodiversity-impact",
        "CSRD-reporting",
        "green-finance"
      ],
      "base_model": "SmolLM2-1.7B-Instruct",
      "adapter_type": "qlora",
      "val_loss": 0.0768,
      "hallucination_rate": 0.044,
      "task_completion_rate": 0.935,
      "ollama_model_name": "dhs-slm-esg-v2",
      "vram_required_gb": 4.2,
      "query_count": 121,
      "retrain_needed": false,
      "created_at": "2026-06-18T20:01:13.519135+00:00",
      "last_used_at": "2026-07-01T16:01:13.519135+00:00"
    },
    {
      "model_id": "dhs-slm-product-rd-v1",
      "domain_label": "product_rd_innovation",
      "coverage_topics": [
        "patent-landscape",
        "stage-gate-review",
        "GTM-planning",
        "open-innovation",
        "NPD-process",
        "technology-readiness",
        "competitor-analysis",
        "IP-strategy"
      ],
      "base_model": "SmolLM2-1.7B-Instruct",
      "adapter_type": "none",
      "val_loss": 0.1043,
      "hallucination_rate": 0.071,
      "task_completion_rate": 0.904,
      "ollama_model_name": "llama3:8b",
      "vram_required_gb": 3.8,
      "query_count": 89,
      "retrain_needed": true,
      "created_at": "2026-06-15T20:01:13.519135+00:00",
      "last_used_at": "2026-06-30T20:01:13.519135+00:00"
    },
    {
      "model_id": "dhs-slm-cybersecurity-v2",
      "domain_label": "it_infrastructure_security",
      "coverage_topics": [
        "zero-trust-policy",
        "threat-detection",
        "SIEM-correlation",
        "incident-response",
        "cloud-security",
        "vulnerability-management",
        "ITIL-processes",
        "access-governance"
      ],
      "base_model": "SmolLM2-1.7B-Instruct",
      "adapter_type": "qlora",
      "val_loss": 0.0723,
      "hallucination_rate": 0.039,
      "task_completion_rate": 0.952,
      "ollama_model_name": "dhs-slm-cybersecurity-v2",
      "vram_required_gb": 4.2,
      "query_count": 167,
      "retrain_needed": false,
      "created_at": "2026-06-13T20:01:13.519135+00:00",
      "last_used_at": "2026-07-01T08:01:13.519135+00:00"
    },
    {
      "model_id": "retail_v1",
      "domain_label": "retail",
      "coverage_topics": [],
      "base_model": "app_builder_v6:latest",
      "adapter_type": "none",
      "val_loss": 0.0,
      "hallucination_rate": null,
      "task_completion_rate": null,
      "ollama_model_name": "app_builder_v6:latest",
      "vram_required_gb": 1.5,
      "query_count": 0,
      "retrain_needed": false,
      "created_at": "2026-06-12T12:32:04.940094+00:00",
      "last_used_at": null
    },
    {
      "model_id": "dhs-slm-hr-workforce-v1",
      "domain_label": "hr_talent_workforce",
      "coverage_topics": [
        "attrition-prediction",
        "skills-gap-analysis",
        "succession-planning",
        "workforce-capacity",
        "DEI-reporting",
        "talent-acquisition",
        "learning-pathways",
        "org-design"
      ],
      "base_model": "SmolLM2-1.7B-Instruct",
      "adapter_type": "qlora",
      "val_loss": 0.0887,
      "hallucination_rate": 0.062,
      "task_completion_rate": 0.918,
      "ollama_model_name": "dhs-slm-hr-workforce-v1",
      "vram_required_gb": 4.2,
      "query_count": 143,
      "retrain_needed": false,
      "created_at": "2026-06-09T20:01:13.519135+00:00",
      "last_used_at": "2026-07-01T14:01:13.519135+00:00"
    },
    {
      "model_id": "dhs-slm-cx-analytics-v2",
      "domain_label": "customer_experience_analytics",
      "coverage_topics": [
        "CLV-prediction",
        "churn-modelling",
        "NPS-driver-analysis",
        "personalisation",
        "omnichannel-journey",
        "microsegmentation",
        "propensity-scoring",
        "retention"
      ],
      "base_model": "SmolLM2-1.7B-Instruct",
      "adapter_type": "qlora",
      "val_loss": 0.0741,
      "hallucination_rate": 0.053,
      "task_completion_rate": 0.937,
      "ollama_model_name": "dhs-slm-cx-analytics-v2",
      "vram_required_gb": 4.2,
      "query_count": 198,
      "retrain_needed": false,
      "created_at": "2026-06-03T20:01:13.519135+00:00",
      "last_used_at": "2026-07-01T17:01:13.519135+00:00"
    },
    {
      "model_id": "dhs-slm-financial-risk-v2",
      "domain_label": "financial_risk_compliance",
      "coverage_topics": [
        "basel-iv-capital",
        "credit-risk-modelling",
        "AML-detection",
        "stress-testing",
        "regulatory-reporting",
        "counterparty-risk",
        "liquidity-coverage",
        "model-risk"
      ],
      "base_model": "SmolLM2-1.7B-Instruct",
      "adapter_type": "qlora",
      "val_loss": 0.0694,
      "hallucination_rate": 0.031,
      "task_completion_rate": 0.963,
      "ollama_model_name": "dhs-slm-financial-risk-v2",
      "vram_required_gb": 4.2,
      "query_count": 412,
      "retrain_needed": false,
      "created_at": "2026-05-27T20:01:13.519135+00:00",
      "last_used_at": "2026-07-01T19:01:13.519135+00:00"
    },
    {
      "model_id": "dhs-slm-supply-chain-v3",
      "domain_label": "supply_chain_logistics",
      "coverage_topics": [
        "procurement",
        "demand-forecast",
        "freight-optimisation",
        "inventory-management",
        "supplier-risk",
        "tariff-impact",
        "3PL-performance",
        "port-disruption"
      ],
      "base_model": "SmolLM2-1.7B-Instruct",
      "adapter_type": "qlora",
      "val_loss": 0.0812,
      "hallucination_rate": 0.047,
      "task_completion_rate": 0.941,
      "ollama_model_name": "dhs-slm-supply-chain-v3",
      "vram_required_gb": 4.2,
      "query_count": 287,
      "retrain_needed": false,
      "created_at": "2026-05-20T20:01:13.519135+00:00",
      "last_used_at": "2026-07-01T18:01:13.519135+00:00"
    }
  ],
  "count": 11
} as const;

export const DEMO_CORPORA = [
  {
    "job_id": "job-sc-001",
    "domain_label": "supply_chain_logistics",
    "project_name": "Supply Chain Intelligence – Global Ops",
    "file_count": 9,
    "entity_count": 487,
    "community_count": 8,
    "version": 3,
    "created_at": "2026-07-01T09:15:00.000000+00:00",
    "file_list": [
      {"name": "cpg_sku_master.csv",           "size": 142080, "added_at": "2026-07-01T09:10:00Z"},
      {"name": "cpg_weekly_demand.csv",         "size": 89600,  "added_at": "2026-07-01T09:10:00Z"},
      {"name": "cpg_vendor_scorecard.csv",      "size": 61440,  "added_at": "2026-07-01T09:10:00Z"},
      {"name": "cpg_inventory_snapshot.csv",    "size": 77824,  "added_at": "2026-07-01T09:10:00Z"},
      {"name": "cpg_trade_promotions.csv",      "size": 51200,  "added_at": "2026-07-01T09:10:00Z"},
      {"name": "product_catalog.txt",           "size": 28672,  "added_at": "2026-07-01T09:10:00Z"},
      {"name": "market_research_report.txt",    "size": 35840,  "added_at": "2026-07-01T09:10:00Z"},
      {"name": "trade_promotion_guidelines.txt","size": 20480,  "added_at": "2026-07-01T09:10:00Z"},
      {"name": "category_playbook.txt",         "size": 18432,  "added_at": "2026-07-01T09:10:00Z"}
    ]
  },
  {
    "job_id": "job-sc-002",
    "domain_label": "supply_chain_logistics",
    "project_name": "Supply Chain Intelligence – Q4 Update",
    "file_count": 4,
    "entity_count": 312,
    "community_count": 5,
    "version": 1,
    "created_at": "2026-07-03T14:30:00.000000+00:00",
    "file_list": [
      {"name": "q4_demand_forecast.csv",        "size": 91136, "added_at": "2026-07-03T14:25:00Z"},
      {"name": "q4_vendor_contracts.pdf",       "size": 204800,"added_at": "2026-07-03T14:25:00Z"},
      {"name": "q4_inventory_review.csv",       "size": 55296, "added_at": "2026-07-03T14:25:00Z"},
      {"name": "supply_chain_strategy.txt",     "size": 32768, "added_at": "2026-07-03T14:25:00Z"}
    ]
  },
  {
    "job_id": "job-fr-002",
    "domain_label": "financial_risk_compliance",
    "project_name": "Financial Risk – Basel IV Assessment",
    "file_count": 6,
    "entity_count": 542,
    "community_count": 11,
    "version": 2,
    "created_at": "2026-06-28T11:00:00.000000+00:00",
    "file_list": [
      {"name": "Basel_IV_Capital_Assessment_2024.txt","size": 184320,"added_at": "2026-06-28T10:55:00Z"},
      {"name": "credit_risk_model_v3.csv",      "size": 122880, "added_at": "2026-06-28T10:55:00Z"},
      {"name": "aml_transaction_patterns.csv",  "size": 98304,  "added_at": "2026-06-28T10:55:00Z"},
      {"name": "regulatory_reporting_q2.pdf",   "size": 256000, "added_at": "2026-06-28T10:55:00Z"},
      {"name": "stress_test_scenarios.xlsx",    "size": 71680,  "added_at": "2026-06-28T10:55:00Z"},
      {"name": "compliance_checklist.txt",      "size": 24576,  "added_at": "2026-06-28T10:55:00Z"}
    ]
  },
  {
    "job_id": "job-cx-003",
    "domain_label": "customer_experience_analytics",
    "project_name": "CX Analytics – Voice of Customer",
    "file_count": 5,
    "entity_count": 398,
    "community_count": 7,
    "version": 1,
    "created_at": "2026-06-20T08:45:00.000000+00:00",
    "file_list": [
      {"name": "customer_surveys_2026.csv",     "size": 163840, "added_at": "2026-06-20T08:40:00Z"},
      {"name": "nps_cohort_analysis.csv",       "size": 81920,  "added_at": "2026-06-20T08:40:00Z"},
      {"name": "churn_prediction_features.csv", "size": 102400, "added_at": "2026-06-20T08:40:00Z"},
      {"name": "cx_strategy_roadmap.pdf",       "size": 307200, "added_at": "2026-06-20T08:40:00Z"},
      {"name": "support_ticket_themes.txt",     "size": 40960,  "added_at": "2026-06-20T08:40:00Z"}
    ]
  },
  {
    "job_id": "job-mfg-004",
    "domain_label": "manufacturing_ops",
    "project_name": "Manufacturing Ops – Quality Control",
    "file_count": 4,
    "entity_count": 276,
    "community_count": 6,
    "version": 1,
    "created_at": "2026-06-15T07:30:00.000000+00:00",
    "file_list": [
      {"name": "defect_analysis_2026.csv",      "size": 73728,  "added_at": "2026-06-15T07:25:00Z"},
      {"name": "production_line_metrics.csv",   "size": 90112,  "added_at": "2026-06-15T07:25:00Z"},
      {"name": "iso_9001_audit_report.pdf",     "size": 409600, "added_at": "2026-06-15T07:25:00Z"},
      {"name": "maintenance_schedule.xlsx",     "size": 55296,  "added_at": "2026-06-15T07:25:00Z"}
    ]
  },
  {
    "job_id": "job-hr-005",
    "domain_label": "hr_workforce",
    "project_name": "HR Workforce Analytics",
    "file_count": 3,
    "entity_count": 189,
    "community_count": 4,
    "version": 1,
    "created_at": "2026-06-10T13:00:00.000000+00:00",
    "file_list": [
      {"name": "headcount_2026.csv",            "size": 49152,  "added_at": "2026-06-10T12:55:00Z"},
      {"name": "performance_reviews.csv",       "size": 65536,  "added_at": "2026-06-10T12:55:00Z"},
      {"name": "talent_acquisition_kpis.txt",   "size": 20480,  "added_at": "2026-06-10T12:55:00Z"}
    ]
  }
] as const;

// Demo EDA summary data (for /quality/{id}/eda endpoint)
export const DEMO_EDA_SUMMARY = {
  files: [
    {
      file_id: "cpg_sku_master",
      summary: {
        source: { ext: "csv", adapter: "csv", source_type: "structured" },
        entity_statistics: { entity_count: 65, low_confidence_count: 3, mean_confidence: 0.78, min_confidence: 0.44, max_confidence: 0.94, duplicate_entities: [], orphan_entities: [] },
        relationship_statistics: { relationship_count: 158, low_confidence_count: 12, mean_confidence: 0.71, weak_edges: [], invalid_edge_patterns: [] },
        graph_metrics: { node_count: 63, edge_count: 108, graph_density: 0.028, disconnected_component_count: 5, central_entities: [] },
        semantic_quality_metrics: { ontology_violations: [], semantic_contradictions: [], consistency_score: 0.96 },
        confidence_scores: { entity_confidence_score: 0.78, relationship_confidence_score: 0.71, graph_trust_score: 0.82, semantic_coherence_score: 0.88, canonical_resolution_score: 0.85, knowledge_graph_completeness_score: 0.91, extraction_reliability_score: 1.0 }
      },
      metadata: { file_id: "cpg_sku_master", ext: "csv", doc_type: "table", source_type: "structured", adapter: "csv", statistics: { char_count: 142080, word_count: 18432, chunk_count: 12, avg_chunk_words: 1536 } },
      scorecard: { overall_kg_quality_score: 0.871, completeness_score: 0.91, consistency_score: 0.96, confidence_score: 0.78, graph_trust_score: 0.82, retrieval_readiness_score: 0.86, semantic_coherence_score: 0.88, canonical_resolution_score: 0.85, extraction_reliability_score: 1.0 }
    },
    {
      file_id: "product_catalog",
      summary: {
        source: { ext: "txt", adapter: "txt", source_type: "document" },
        entity_statistics: { entity_count: 48, low_confidence_count: 2, mean_confidence: 0.81, min_confidence: 0.52, max_confidence: 0.95, duplicate_entities: [], orphan_entities: [] },
        relationship_statistics: { relationship_count: 92, low_confidence_count: 8, mean_confidence: 0.74, weak_edges: [], invalid_edge_patterns: [] },
        graph_metrics: { node_count: 47, edge_count: 85, graph_density: 0.039, disconnected_component_count: 3, central_entities: [] },
        semantic_quality_metrics: { ontology_violations: [], semantic_contradictions: [], consistency_score: 0.98 },
        confidence_scores: { entity_confidence_score: 0.81, relationship_confidence_score: 0.74, graph_trust_score: 0.87, semantic_coherence_score: 0.91, canonical_resolution_score: 0.88, knowledge_graph_completeness_score: 0.93, extraction_reliability_score: 1.0 }
      },
      metadata: { file_id: "product_catalog", ext: "txt", doc_type: "freetext", source_type: "document", adapter: "txt", statistics: { char_count: 28672, word_count: 3840, chunk_count: 4, avg_chunk_words: 960 } },
      scorecard: { overall_kg_quality_score: 0.911, completeness_score: 0.94, consistency_score: 0.98, confidence_score: 0.81, graph_trust_score: 0.87, retrieval_readiness_score: 0.89, semantic_coherence_score: 0.91, canonical_resolution_score: 0.88, extraction_reliability_score: 1.0 }
    }
  ]
};

// Demo ontology data (for /quality/{id}/ontology endpoint)
export const DEMO_ONTOLOGY = {
  ontology: {
    domain_label: "supply_chain_logistics",
    entity_types: ["DATE", "ENTITY", "EVENT", "GPE", "LOC", "ORG", "PERSON", "PRODUCT"],
    allowed_relations: ["competes_with", "employs", "has_revenue", "located_in", "occurred_at", "owns", "related_to", "supplies"],
    proposed_relations: { "distributes": 4, "partners_with": 2 },
    proposed_entity_types: { "FACILITY": 3 }
  },
  graph_consistency: {
    node_count: 182, edge_count: 571, orphan_node_count: 12,
    ontology_nonconformant_edges: 0, self_loops: 2, dangling_edges: 0,
    referential_integrity: { valid: true, error_count: 0, errors: [] },
    passed: true
  }
};
export const DEMO_LEARNING = {
  "models": [
    {
      "model_id": "dhs-slm-digital-transform-v2",
      "query_count": 154,
      "accuracy_pct": 95.2,
      "val_loss": 0.0779,
      "task_completion_rate": 0.934,
      "hallucination_rate": 0.048,
      "reward": 0.935,
      "converged": false
    },
    {
      "model_id": "dhs-slm-ma-strategy-v1",
      "query_count": 76,
      "accuracy_pct": 94.5,
      "val_loss": 0.0821,
      "task_completion_rate": 0.929,
      "hallucination_rate": 0.055,
      "reward": 0.93,
      "converged": false
    },
    {
      "model_id": "dhs-slm-manufacturing-v3",
      "query_count": 203,
      "accuracy_pct": 97.2,
      "val_loss": 0.0651,
      "task_completion_rate": 0.968,
      "hallucination_rate": 0.028,
      "reward": 0.959,
      "converged": false
    },
    {
      "model_id": "dhs-slm-esg-v2",
      "query_count": 121,
      "accuracy_pct": 95.6,
      "val_loss": 0.0768,
      "task_completion_rate": 0.935,
      "hallucination_rate": 0.044,
      "reward": 0.937,
      "converged": false
    },
    {
      "model_id": "dhs-slm-product-rd-v1",
      "query_count": 89,
      "accuracy_pct": 92.9,
      "val_loss": 0.1043,
      "task_completion_rate": 0.904,
      "hallucination_rate": 0.071,
      "reward": 0.912,
      "converged": false
    },
    {
      "model_id": "dhs-slm-cybersecurity-v2",
      "query_count": 167,
      "accuracy_pct": 96.1,
      "val_loss": 0.0723,
      "task_completion_rate": 0.952,
      "hallucination_rate": 0.039,
      "reward": 0.947,
      "converged": false
    },
    {
      "model_id": "retail_v1",
      "query_count": 0,
      "accuracy_pct": 100.0,
      "val_loss": 0.0,
      "task_completion_rate": 0.85,
      "hallucination_rate": 0.0,
      "reward": 0.91,
      "converged": false
    },
    {
      "model_id": "dhs-slm-hr-workforce-v1",
      "query_count": 143,
      "accuracy_pct": 93.8,
      "val_loss": 0.0887,
      "task_completion_rate": 0.918,
      "hallucination_rate": 0.062,
      "reward": 0.922,
      "converged": false
    },
    {
      "model_id": "dhs-slm-cx-analytics-v2",
      "query_count": 198,
      "accuracy_pct": 94.7,
      "val_loss": 0.0741,
      "task_completion_rate": 0.937,
      "hallucination_rate": 0.053,
      "reward": 0.935,
      "converged": false
    },
    {
      "model_id": "dhs-slm-financial-risk-v2",
      "query_count": 412,
      "accuracy_pct": 96.9,
      "val_loss": 0.0694,
      "task_completion_rate": 0.963,
      "hallucination_rate": 0.031,
      "reward": 0.956,
      "converged": false
    },
    {
      "model_id": "dhs-slm-supply-chain-v3",
      "query_count": 287,
      "accuracy_pct": 95.3,
      "val_loss": 0.0812,
      "task_completion_rate": 0.941,
      "hallucination_rate": 0.047,
      "reward": 0.939,
      "converged": false
    }
  ],
  "summary": {
    "total_queries": 1850,
    "avg_accuracy_pct": 95.7,
    "any_converged": false,
    "active_models": 11
  }
} as const;

export const DEMO_BANDIT = {
  "arms": [
    {
      "model_id": "claude-opus-4-5",
      "theta_norm": 35.3873,
      "estimated_reward": 0.9,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "gpt-4o",
      "theta_norm": 34.9941,
      "estimated_reward": 0.89,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "deepseek-coder-v2:16b",
      "theta_norm": 34.6009,
      "estimated_reward": 0.88,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "finbert-tone",
      "theta_norm": 34.6009,
      "estimated_reward": 0.88,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "claude-sonnet-4-5",
      "theta_norm": 34.2077,
      "estimated_reward": 0.87,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "qwen2.5:32b",
      "theta_norm": 34.2077,
      "estimated_reward": 0.87,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "chronos-t5-large",
      "theta_norm": 34.2077,
      "estimated_reward": 0.87,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "moirai-1.0-r-large",
      "theta_norm": 33.4213,
      "estimated_reward": 0.85,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "qwen2.5-coder:32b",
      "theta_norm": 32.6349,
      "estimated_reward": 0.83,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "timesfm-1.0-200m",
      "theta_norm": 32.6349,
      "estimated_reward": 0.83,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "qwen2.5-coder:7b",
      "theta_norm": 31.0622,
      "estimated_reward": 0.79,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "mistral:latest",
      "theta_norm": 19.6596,
      "estimated_reward": 0.5,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "llama3.2:latest",
      "theta_norm": 19.6596,
      "estimated_reward": 0.5,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "qwen2.5:7b",
      "theta_norm": 19.6596,
      "estimated_reward": 0.5,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "llama3.1:70b",
      "theta_norm": 19.6596,
      "estimated_reward": 0.5,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "qwen2.5:72b",
      "theta_norm": 19.6596,
      "estimated_reward": 0.5,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "gpt-4o-mini",
      "theta_norm": 19.6596,
      "estimated_reward": 0.5,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "gemini-2.0-flash",
      "theta_norm": 19.6596,
      "estimated_reward": 0.5,
      "observations": 0,
      "explore_width": 0.316228,
      "converged": false
    },
    {
      "model_id": "app_builder_v6:latest",
      "theta_norm": 19.6588,
      "estimated_reward": 0.5,
      "observations": 5,
      "explore_width": 0.31527,
      "converged": false
    }
  ],
  "total_arms": 19,
  "scoring_note": "theta_norm: strength of learned reward signal. observations: estimated real queries seen. explore_width: UCB uncertainty \u2014 decreases as model learns. converged: True when >50 observations and uncertainty < 0.01."
} as const;

export const DEMO_SLM_STATS = {
  "active_slms": 11,
  "tokens_saved": 0,
  "files_ingested": 0,
  "cost_saved": 0.0
} as const;

export const DEMO_BENCHMARK_ROWS = {
  "supply_chain_logistics": [
    {
      "model": "dhs-slm-supply-chain-v3",
      "task_type": "analysis",
      "metric": "gini",
      "value": 0.891,
      "delta": 0.181,
      "test_date": "2024-05-15"
    },
    {
      "model": "dhs-slm-supply-chain-v3",
      "task_type": "planning",
      "metric": "task_completion_rate",
      "value": 0.941,
      "delta": 0.179,
      "test_date": "2024-05-15"
    },
    {
      "model": "dhs-slm-supply-chain-v3",
      "task_type": "forecasting",
      "metric": "mape",
      "value": 0.112,
      "delta": 0.072,
      "test_date": "2024-05-15"
    },
    {
      "model": "dhs-slm-supply-chain-v3",
      "task_type": "hallucination",
      "metric": "hallucination_rate",
      "value": 0.047,
      "delta": 0.087,
      "test_date": "2024-05-15"
    },
    {
      "model": "llama3:8b",
      "task_type": "analysis",
      "metric": "gini",
      "value": 0.71,
      "delta": 0.0,
      "test_date": "2024-05-15"
    },
    {
      "model": "llama3:8b",
      "task_type": "planning",
      "metric": "task_completion_rate",
      "value": 0.762,
      "delta": 0.0,
      "test_date": "2024-05-15"
    }
  ],
  "financial_risk_compliance": [
    {
      "model": "dhs-slm-financial-risk-v2",
      "task_type": "regulatory",
      "metric": "task_completion_rate",
      "value": 0.963,
      "delta": 0.222,
      "test_date": "2024-06-01"
    },
    {
      "model": "dhs-slm-financial-risk-v2",
      "task_type": "detection",
      "metric": "precision",
      "value": 0.947,
      "delta": 0.224,
      "test_date": "2024-06-01"
    },
    {
      "model": "dhs-slm-financial-risk-v2",
      "task_type": "stress_test",
      "metric": "accuracy",
      "value": 0.968,
      "delta": 0.17,
      "test_date": "2024-06-01"
    },
    {
      "model": "dhs-slm-financial-risk-v2",
      "task_type": "hallucination",
      "metric": "hallucination_rate",
      "value": 0.031,
      "delta": 0.087,
      "test_date": "2024-06-01"
    },
    {
      "model": "llama3:8b",
      "task_type": "regulatory",
      "metric": "task_completion_rate",
      "value": 0.741,
      "delta": 0.0,
      "test_date": "2024-06-01"
    }
  ],
  "customer_experience_analytics": [
    {
      "model": "dhs-slm-cx-analytics-v2",
      "task_type": "analysis",
      "metric": "f1_score",
      "value": 0.887,
      "delta": 0.166,
      "test_date": "2024-06-08"
    },
    {
      "model": "dhs-slm-cx-analytics-v2",
      "task_type": "recommendation",
      "metric": "ndcg",
      "value": 0.834,
      "delta": 0.163,
      "test_date": "2024-06-08"
    },
    {
      "model": "dhs-slm-cx-analytics-v2",
      "task_type": "attribution",
      "metric": "r_squared",
      "value": 0.812,
      "delta": 0.168,
      "test_date": "2024-06-08"
    },
    {
      "model": "dhs-slm-cx-analytics-v2",
      "task_type": "hallucination",
      "metric": "hallucination_rate",
      "value": 0.053,
      "delta": 0.088,
      "test_date": "2024-06-08"
    }
  ],
  "hr_talent_workforce": [
    {
      "model": "dhs-slm-hr-workforce-v1",
      "task_type": "analysis",
      "metric": "task_completion_rate",
      "value": 0.919,
      "delta": 0.171,
      "test_date": "2024-06-12"
    },
    {
      "model": "dhs-slm-hr-workforce-v1",
      "task_type": "reporting",
      "metric": "coherence_score",
      "value": 0.887,
      "delta": 0.175,
      "test_date": "2024-06-12"
    },
    {
      "model": "dhs-slm-hr-workforce-v1",
      "task_type": "hallucination",
      "metric": "hallucination_rate",
      "value": 0.062,
      "delta": 0.085,
      "test_date": "2024-06-12"
    }
  ],
  "it_infrastructure_security": [
    {
      "model": "dhs-slm-cybersecurity-v2",
      "task_type": "incident_response",
      "metric": "task_completion_rate",
      "value": 0.957,
      "delta": 0.179,
      "test_date": "2024-06-14"
    },
    {
      "model": "dhs-slm-cybersecurity-v2",
      "task_type": "policy",
      "metric": "compliance_score",
      "value": 0.934,
      "delta": 0.178,
      "test_date": "2024-06-14"
    },
    {
      "model": "dhs-slm-cybersecurity-v2",
      "task_type": "hallucination",
      "metric": "hallucination_rate",
      "value": 0.039,
      "delta": 0.083,
      "test_date": "2024-06-14"
    }
  ],
  "esg_sustainability": [
    {
      "model": "dhs-slm-esg-v2",
      "task_type": "calculation",
      "metric": "accuracy",
      "value": 0.951,
      "delta": 0.178,
      "test_date": "2024-06-18"
    },
    {
      "model": "dhs-slm-esg-v2",
      "task_type": "disclosure",
      "metric": "tcfd_alignment_score",
      "value": 0.924,
      "delta": 0.176,
      "test_date": "2024-06-18"
    },
    {
      "model": "dhs-slm-esg-v2",
      "task_type": "hallucination",
      "metric": "hallucination_rate",
      "value": 0.044,
      "delta": 0.087,
      "test_date": "2024-06-18"
    }
  ],
  "manufacturing_quality": [
    {
      "model": "dhs-slm-manufacturing-v3",
      "task_type": "root_cause",
      "metric": "task_completion_rate",
      "value": 0.972,
      "delta": 0.188,
      "test_date": "2024-06-20"
    },
    {
      "model": "dhs-slm-manufacturing-v3",
      "task_type": "maintenance",
      "metric": "prediction_accuracy",
      "value": 0.961,
      "delta": 0.187,
      "test_date": "2024-06-20"
    },
    {
      "model": "dhs-slm-manufacturing-v3",
      "task_type": "compliance",
      "metric": "fda_alignment_score",
      "value": 0.978,
      "delta": 0.177,
      "test_date": "2024-06-20"
    },
    {
      "model": "dhs-slm-manufacturing-v3",
      "task_type": "hallucination",
      "metric": "hallucination_rate",
      "value": 0.028,
      "delta": 0.081,
      "test_date": "2024-06-20"
    }
  ],
  "mergers_acquisitions": [
    {
      "model": "dhs-slm-ma-strategy-v1",
      "task_type": "screening",
      "metric": "precision_at_10",
      "value": 0.841,
      "delta": 0.173,
      "test_date": "2024-06-22"
    },
    {
      "model": "dhs-slm-ma-strategy-v1",
      "task_type": "financial_modelling",
      "metric": "task_completion_rate",
      "value": 0.929,
      "delta": 0.175,
      "test_date": "2024-06-22"
    },
    {
      "model": "dhs-slm-ma-strategy-v1",
      "task_type": "hallucination",
      "metric": "hallucination_rate",
      "value": 0.055,
      "delta": 0.083,
      "test_date": "2024-06-22"
    }
  ],
  "digital_transformation": [
    {
      "model": "dhs-slm-digital-transform-v2",
      "task_type": "architecture",
      "metric": "task_completion_rate",
      "value": 0.938,
      "delta": 0.174,
      "test_date": "2024-06-25"
    },
    {
      "model": "dhs-slm-digital-transform-v2",
      "task_type": "governance",
      "metric": "compliance_score",
      "value": 0.921,
      "delta": 0.173,
      "test_date": "2024-06-25"
    },
    {
      "model": "dhs-slm-digital-transform-v2",
      "task_type": "hallucination",
      "metric": "hallucination_rate",
      "value": 0.048,
      "delta": 0.088,
      "test_date": "2024-06-25"
    }
  ]
} as const;

export const DEMO_FEEDBACK = [
  {
    "feedback_id": "FB-001",
    "session_id": "sess-sc-001",
    "query_id_ref": "1",
    "model_id": "dhs-slm-supply-chain-v3",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Excellent \u2014 gave us the exact supplier names and timelines we needed for the board deck. Saved 3 hours of research.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-05-20 14:23:00"
  },
  {
    "feedback_id": "FB-002",
    "session_id": "sess-sc-001",
    "query_id_ref": "2",
    "model_id": "dhs-slm-supply-chain-v3",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "The re-routing plan was immediately actionable. We shared it with logistics ops and they confirmed the Hamburg corridor was correct.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-05-28 09:11:00"
  },
  {
    "feedback_id": "FB-003",
    "session_id": "sess-sc-001",
    "query_id_ref": "3",
    "model_id": "dhs-slm-supply-chain-v3",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Good risk register summary. Would have liked the dual-sourcing cost estimates broken out by supplier.",
    "feedback_type": "improvement",
    "created_at": "2024-06-05 16:44:00"
  },
  {
    "feedback_id": "FB-004",
    "session_id": "sess-sc-001",
    "query_id_ref": "4",
    "model_id": "dhs-slm-supply-chain-v3",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Forecast numbers matched our existing spreadsheet model closely \u2014 92% accuracy. Team trusts this output now.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-12 11:02:00"
  },
  {
    "feedback_id": "FB-005",
    "session_id": "sess-sc-001",
    "query_id_ref": "5",
    "model_id": "dhs-slm-supply-chain-v3",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Contract reference to MLA clause 18.4 was correct. Slightly too formal in tone for a quick exec summary.",
    "feedback_type": "style",
    "created_at": "2024-06-18 15:30:00"
  },
  {
    "feedback_id": "FB-006",
    "session_id": "sess-sc-001",
    "query_id_ref": "6",
    "model_id": "dhs-slm-supply-chain-v3",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "The working capital number (21.4%) was better than our own model (19%). Now using DHS as primary tool.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-25 10:18:00"
  },
  {
    "feedback_id": "FB-007",
    "session_id": "sess-fr-002",
    "query_id_ref": "7",
    "model_id": "dhs-slm-financial-risk-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Output floor calculation was exactly right. Sent directly to Treasury team. Zero corrections needed.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-05-30 14:22:00"
  },
  {
    "feedback_id": "FB-008",
    "session_id": "sess-fr-002",
    "query_id_ref": "8",
    "model_id": "dhs-slm-financial-risk-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "TBML alert list matched our analyst team's assessment. Model caught Entity 3 (Horizon Tech HK) which our analyst had deprioritised \u2014 turned out to be the highest risk.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-08 10:44:00"
  },
  {
    "feedback_id": "FB-009",
    "session_id": "sess-fr-002",
    "query_id_ref": "9",
    "model_id": "dhs-slm-financial-risk-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Stress test numbers consistent with our internal model to within 3%. Significant time saving on the SBP narrative.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-15 09:32:00"
  },
  {
    "feedback_id": "FB-010",
    "session_id": "sess-fr-002",
    "query_id_ref": "10",
    "model_id": "dhs-slm-financial-risk-v2",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "CVA hedge recommendation was directionally correct. Needed our traders to verify the CDS notional sizing.",
    "feedback_type": "improvement",
    "created_at": "2024-06-20 16:01:00"
  },
  {
    "feedback_id": "FB-011",
    "session_id": "sess-fr-002",
    "query_id_ref": "11",
    "model_id": "dhs-slm-financial-risk-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "ICAAP HHI narrative was publication-ready. Edited for house style only. Saved half a day of analyst time.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-25 11:47:00"
  },
  {
    "feedback_id": "FB-012",
    "session_id": "sess-fr-002",
    "query_id_ref": "12",
    "model_id": "dhs-slm-financial-risk-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Model risk summary accurately flagged all 4 models. Rating changes were consistent with our MVM committee decisions.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-28 14:12:00"
  },
  {
    "feedback_id": "FB-013",
    "session_id": "sess-cx-003",
    "query_id_ref": "13",
    "model_id": "dhs-slm-cx-analytics-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Segment list and churn probabilities were consistent with our Salesforce data. Confidence high.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-05-22 10:15:00"
  },
  {
    "feedback_id": "FB-014",
    "session_id": "sess-cx-003",
    "query_id_ref": "14",
    "model_id": "dhs-slm-cx-analytics-v2",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "SME vs retail NPS driver distinction was insightful. NPS numbers matched our survey vendor data.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-01 15:44:00"
  },
  {
    "feedback_id": "FB-015",
    "session_id": "sess-cx-003",
    "query_id_ref": "15",
    "model_id": "dhs-slm-cx-analytics-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Product recommendation with Consumer Duty suitability was immediately useful. Compliance team approved the output.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-08 11:23:00"
  },
  {
    "feedback_id": "FB-016",
    "session_id": "sess-cx-003",
    "query_id_ref": "16",
    "model_id": "dhs-slm-cx-analytics-v2",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Journey funnel percentages were close to our GA4 data (within 2pp). Root cause hypotheses were actionable.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-14 16:30:00"
  },
  {
    "feedback_id": "FB-017",
    "session_id": "sess-cx-003",
    "query_id_ref": "17",
    "model_id": "dhs-slm-cx-analytics-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "CLV comparison digital vs branch was eye-opening. Changed our marketing budget allocation decision.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-22 09:55:00"
  },
  {
    "feedback_id": "FB-018",
    "session_id": "sess-cx-003",
    "query_id_ref": "18",
    "model_id": "dhs-slm-cx-analytics-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Monthly dashboard summary was accurate. Used as the basis for the exec pack \u2014 minimal edits.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-28 15:00:00"
  },
  {
    "feedback_id": "FB-019",
    "session_id": "sess-hr-004",
    "query_id_ref": "19",
    "model_id": "dhs-slm-hr-workforce-v1",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Critical role analysis was helpful. We were aware of Data Science gap but the quantification (0.8 successors/role) was new insight.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-02 10:23:00"
  },
  {
    "feedback_id": "FB-020",
    "session_id": "sess-hr-004",
    "query_id_ref": "20",
    "model_id": "dhs-slm-hr-workforce-v1",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Attrition cost breakdown (\u00a38.4M) was very close to our own finance team's estimate (\u00a38.1M). Confidence very high.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-12 14:44:00"
  },
  {
    "feedback_id": "FB-021",
    "session_id": "sess-hr-004",
    "query_id_ref": "21",
    "model_id": "dhs-slm-hr-workforce-v1",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "DEI audit numbers matched our HR data. Promotion equity ratio gap for ethnic minority (0.76) is being escalated to board.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-20 11:02:00"
  },
  {
    "feedback_id": "FB-022",
    "session_id": "sess-hr-004",
    "query_id_ref": "22",
    "model_id": "dhs-slm-hr-workforce-v1",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "3-year workforce plan was used directly in the board paper. Very detailed and realistic phasing.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-27 16:34:00"
  },
  {
    "feedback_id": "FB-023",
    "session_id": "sess-it-005",
    "query_id_ref": "23",
    "model_id": "dhs-slm-cybersecurity-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "IR playbook was immediately deployed. SOC team said it was more comprehensive than our previous manual playbook.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-08 09:45:00"
  },
  {
    "feedback_id": "FB-024",
    "session_id": "sess-it-005",
    "query_id_ref": "24",
    "model_id": "dhs-slm-cybersecurity-v2",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Cloud migration risk ranking was correct. CorePayments high-risk flag was already on our radar.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-14 15:22:00"
  },
  {
    "feedback_id": "FB-025",
    "session_id": "sess-it-005",
    "query_id_ref": "25",
    "model_id": "dhs-slm-cybersecurity-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Zero-trust contractor policy was NCSC CE+ compliant \u2014 confirmed by our external auditor.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-20 10:11:00"
  },
  {
    "feedback_id": "FB-026",
    "session_id": "sess-it-005",
    "query_id_ref": "26",
    "model_id": "dhs-slm-cybersecurity-v2",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Problem management summary was accurate. The overdue RCA P1-2024-0041 flag was correct.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-28 14:55:00"
  },
  {
    "feedback_id": "FB-027",
    "session_id": "sess-esg-007",
    "query_id_ref": "27",
    "model_id": "dhs-slm-esg-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Scope 3 Cat 1 calculation was within 5% of our third-party carbon accountant's figure. Accepted for disclosure.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-15 11:30:00"
  },
  {
    "feedback_id": "FB-028",
    "session_id": "sess-esg-007",
    "query_id_ref": "28",
    "model_id": "dhs-slm-esg-v2",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Net-zero pathway capex numbers (\u00a387M) aligned with our finance team's estimate. Milestone framework adopted.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-20 15:44:00"
  },
  {
    "feedback_id": "FB-029",
    "session_id": "sess-esg-007",
    "query_id_ref": "29",
    "model_id": "dhs-slm-esg-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Supplier ESG scoring identified ChemBase REACH violation we had not caught internally. Very high value alert.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-24 09:22:00"
  },
  {
    "feedback_id": "FB-030",
    "session_id": "sess-esg-007",
    "query_id_ref": "30",
    "model_id": "dhs-slm-esg-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "TCFD section was assurance-ready. KPMG made only minor clarifications. Huge time saving vs previous year.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-28 16:01:00"
  },
  {
    "feedback_id": "FB-031",
    "session_id": "sess-mfg-008",
    "query_id_ref": "31",
    "model_id": "dhs-slm-manufacturing-v3",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "RCA for Line 7 coating failure was accurate \u2014 thermocouple calibration drift confirmed by our maintenance team. Model identified it 2h before our manual investigation.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-12 08:34:00"
  },
  {
    "feedback_id": "FB-032",
    "session_id": "sess-mfg-008",
    "query_id_ref": "32",
    "model_id": "dhs-slm-manufacturing-v3",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "OEE dashboard summary matched our SCADA system data. Improvement priorities were exactly right.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-18 14:12:00"
  },
  {
    "feedback_id": "FB-033",
    "session_id": "sess-mfg-008",
    "query_id_ref": "33",
    "model_id": "dhs-slm-manufacturing-v3",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "FS-03 bearing prediction: failure occurred 6.2 days after the alert (model said 8.4 day P50). Planned replacement completed successfully.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-24 11:55:00"
  },
  {
    "feedback_id": "FB-034",
    "session_id": "sess-mfg-008",
    "query_id_ref": "34",
    "model_id": "dhs-slm-manufacturing-v3",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "21 CFR Part 11 compliance summary was accurate for all 5 exceptions. QA director accepted output for regulatory file.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-28 16:44:00"
  },
  {
    "feedback_id": "FB-035",
    "session_id": "sess-ma-009",
    "query_id_ref": "35",
    "model_id": "dhs-slm-ma-strategy-v1",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Target screen ranked PathogenIQ #1 \u2014 consistent with our investment bank's independent assessment. Useful validation.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-20 10:22:00"
  },
  {
    "feedback_id": "FB-036",
    "session_id": "sess-ma-009",
    "query_id_ref": "36",
    "model_id": "dhs-slm-ma-strategy-v1",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Synergy model NPV and IRR matched our internal M&A team's model (NPV within \u00a312M, IRR within 0.4%). Credible output.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-23 15:33:00"
  },
  {
    "feedback_id": "FB-037",
    "session_id": "sess-ma-009",
    "query_id_ref": "37",
    "model_id": "dhs-slm-ma-strategy-v1",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Integration risk register was comprehensive. MHRA constraint was a risk we had not fully documented \u2014 now added to formal register.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-26 11:04:00"
  },
  {
    "feedback_id": "FB-038",
    "session_id": "sess-ma-009",
    "query_id_ref": "38",
    "model_id": "dhs-slm-ma-strategy-v1",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Nexus Analytics PMI status was accurate. Revenue synergy shortfall analysis gave us the evidence to restructure the sales integration plan.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-29 14:22:00"
  },
  {
    "feedback_id": "FB-039",
    "session_id": "sess-dt-010",
    "query_id_ref": "39",
    "model_id": "dhs-slm-digital-transform-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Microservices decomposition plan with strangler fig sequencing was adopted by our architecture team unchanged.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-23 10:33:00"
  },
  {
    "feedback_id": "FB-040",
    "session_id": "sess-dt-010",
    "query_id_ref": "40",
    "model_id": "dhs-slm-digital-transform-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "Data mesh design with 8 domain owners and 34 data products matched our architecture target. BCBS 239 constraint mapping was particularly useful.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-25 15:01:00"
  },
  {
    "feedback_id": "FB-041",
    "session_id": "sess-dt-010",
    "query_id_ref": "41",
    "model_id": "dhs-slm-digital-transform-v2",
    "rating": "5",
    "thumbs_up": "true",
    "comment": "AI governance framework with 3-tier risk classification was adopted as our official policy. SS1/23 alignment confirmed by second-line risk.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-27 11:44:00"
  },
  {
    "feedback_id": "FB-042",
    "session_id": "sess-dt-010",
    "query_id_ref": "42",
    "model_id": "dhs-slm-digital-transform-v2",
    "rating": "4",
    "thumbs_up": "true",
    "comment": "Technical debt quantification (\u00a341M) was directionally correct. Our CAST assessment confirmed \u00a338M \u2014 within 8%.",
    "feedback_type": "outcome_quality",
    "created_at": "2024-06-29 16:22:00"
  }
] as const;

/** Knowledge graphs keyed by domain_label. Derived from demo-data/csv/entities.csv + relationships.csv. */
export const DEMO_GRAPHS: Record<string, { domain?: string; job_id?: string; node_count?: number; edge_count?: number; nodes: unknown[]; edges: unknown[]; communities?: unknown[]; generated?: string }> = {
  "supply_chain_logistics": {
    "domain": "supply_chain_logistics",
    "job_id": "job-sc-001",
    "generated": "2024-06-15T09:00:00Z",
    "nodes": [
      {
        "id": "nexus-global-ops",
        "label": "Nexus Global Operations",
        "type": "ORG",
        "count": 24,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "vinatex-electronics",
        "label": "Vinatex Electronics",
        "type": "ORG",
        "count": 8,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "hcm-components",
        "label": "HCM Components Ltd",
        "type": "ORG",
        "count": 6,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "monterrey-industrial",
        "label": "Monterrey Industrial",
        "type": "ORG",
        "count": 5,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "fastfreight-uk",
        "label": "FastFreight UK",
        "type": "ORG",
        "count": 11,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "nordic-express",
        "label": "Nordic Express",
        "type": "ORG",
        "count": 7,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "tranz-cargo-iberia",
        "label": "TranzCargo Iberia",
        "type": "ORG",
        "count": 6,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "semicore",
        "label": "SemiCore",
        "type": "ORG",
        "count": 9,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "nexus-plastics",
        "label": "Nexus Plastics",
        "type": "ORG",
        "count": 7,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "flexseal-gmbh",
        "label": "FlexSeal GmbH",
        "type": "ORG",
        "count": 6,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "dc-birmingham",
        "label": "DC-Birmingham",
        "type": "FACILITY",
        "count": 8,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "rotterdam-port",
        "label": "Rotterdam Port",
        "type": "LOCATION",
        "count": 12,
        "community": 3,
        "is_event_trigger": true
      },
      {
        "id": "hamburg-port",
        "label": "Hamburg Port",
        "type": "LOCATION",
        "count": 9,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "antwerp-port",
        "label": "Antwerp Port",
        "type": "LOCATION",
        "count": 7,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "us-tariff-china",
        "label": "US Tariff China Electronics 25%",
        "type": "REGULATION",
        "count": 14,
        "community": 5,
        "is_event_trigger": true
      },
      {
        "id": "james-whitfield",
        "label": "James Whitfield",
        "type": "PERSON",
        "count": 6,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "amara-osei",
        "label": "Amara Osei",
        "type": "PERSON",
        "count": 5,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "demand-forecast-q4",
        "label": "Demand Forecast Q4",
        "type": "PROCESS",
        "count": 10,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "safety-stock-policy",
        "label": "Safety Stock Policy",
        "type": "POLICY",
        "count": 8,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "master-logistics-agreement",
        "label": "Master Logistics Agreement",
        "type": "CONTRACT",
        "count": 9,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "fmcg-hpc-022",
        "label": "SKU FMCG-HPC-022",
        "type": "PRODUCT",
        "count": 7,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "otif-kpi",
        "label": "OTIF KPI 95%",
        "type": "METRIC",
        "count": 11,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "3pl-performance-scorecard",
        "label": "3PL Performance Scorecard",
        "type": "DOCUMENT",
        "count": 8,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "dual-sourcing-programme",
        "label": "Dual Sourcing Programme",
        "type": "INITIATIVE",
        "count": 6,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "inventory-optimisation",
        "label": "Inventory Optimisation Model",
        "type": "MODEL",
        "count": 7,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "s-s-replenishment",
        "label": "(s,S) Replenishment Policy",
        "type": "METHOD",
        "count": 5,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "sept-promo-campaign",
        "label": "September Promotional Campaign",
        "type": "EVENT",
        "count": 6,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "vietnam-sourcing-hub",
        "label": "Vietnam Sourcing Hub",
        "type": "LOCATION",
        "count": 8,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "port-strike-risk",
        "label": "Port Strike Risk",
        "type": "RISK",
        "count": 9,
        "community": 3,
        "is_event_trigger": true
      },
      {
        "id": "procurement-cost-q3",
        "label": "Q3 Procurement Cost",
        "type": "METRIC",
        "count": 6,
        "community": 5,
        "is_event_trigger": false
      }
    ],
    "edges": [
      {
        "source": "nexus-global-ops",
        "target": "fastfreight-uk",
        "relation": "contracted_3pl",
        "weight": 0.9
      },
      {
        "source": "nexus-global-ops",
        "target": "nordic-express",
        "relation": "contracted_3pl",
        "weight": 0.7
      },
      {
        "source": "nexus-global-ops",
        "target": "tranz-cargo-iberia",
        "relation": "contracted_3pl",
        "weight": 0.7
      },
      {
        "source": "nexus-global-ops",
        "target": "semicore",
        "relation": "single_source_supplier",
        "weight": 0.95
      },
      {
        "source": "nexus-global-ops",
        "target": "nexus-plastics",
        "relation": "single_source_supplier",
        "weight": 0.9
      },
      {
        "source": "nexus-global-ops",
        "target": "flexseal-gmbh",
        "relation": "single_source_supplier",
        "weight": 0.85
      },
      {
        "source": "nexus-global-ops",
        "target": "vinatex-electronics",
        "relation": "alternative_supplier",
        "weight": 0.6
      },
      {
        "source": "nexus-global-ops",
        "target": "hcm-components",
        "relation": "alternative_supplier",
        "weight": 0.6
      },
      {
        "source": "nexus-global-ops",
        "target": "monterrey-industrial",
        "relation": "alternative_supplier",
        "weight": 0.5
      },
      {
        "source": "nexus-global-ops",
        "target": "dc-birmingham",
        "relation": "operates",
        "weight": 0.8
      },
      {
        "source": "us-tariff-china",
        "target": "procurement-cost-q3",
        "relation": "impacts",
        "weight": 0.85
      },
      {
        "source": "us-tariff-china",
        "target": "semicore",
        "relation": "affects_supplier",
        "weight": 0.8
      },
      {
        "source": "us-tariff-china",
        "target": "vietnam-sourcing-hub",
        "relation": "drives_shift_to",
        "weight": 0.7
      },
      {
        "source": "port-strike-risk",
        "target": "rotterdam-port",
        "relation": "threatens",
        "weight": 0.9
      },
      {
        "source": "rotterdam-port",
        "target": "hamburg-port",
        "relation": "reroute_to",
        "weight": 0.8
      },
      {
        "source": "rotterdam-port",
        "target": "antwerp-port",
        "relation": "reroute_to",
        "weight": 0.75
      },
      {
        "source": "fastfreight-uk",
        "target": "otif-kpi",
        "relation": "below_threshold",
        "weight": 0.7
      },
      {
        "source": "master-logistics-agreement",
        "target": "fastfreight-uk",
        "relation": "governs",
        "weight": 0.9
      },
      {
        "source": "master-logistics-agreement",
        "target": "otif-kpi",
        "relation": "defines",
        "weight": 0.85
      },
      {
        "source": "demand-forecast-q4",
        "target": "fmcg-hpc-022",
        "relation": "covers",
        "weight": 0.8
      },
      {
        "source": "demand-forecast-q4",
        "target": "sept-promo-campaign",
        "relation": "accounts_for",
        "weight": 0.75
      },
      {
        "source": "demand-forecast-q4",
        "target": "dc-birmingham",
        "relation": "flags_constraint",
        "weight": 0.7
      },
      {
        "source": "inventory-optimisation",
        "target": "s-s-replenishment",
        "relation": "uses_method",
        "weight": 0.85
      },
      {
        "source": "dual-sourcing-programme",
        "target": "semicore",
        "relation": "targets",
        "weight": 0.9
      },
      {
        "source": "james-whitfield",
        "target": "nexus-global-ops",
        "relation": "vp_supply_chain",
        "weight": 0.8
      },
      {
        "source": "amara-osei",
        "target": "demand-forecast-q4",
        "relation": "owns",
        "weight": 0.75
      },
      {
        "source": "safety-stock-policy",
        "target": "fmcg-hpc-022",
        "relation": "applies_to",
        "weight": 0.7
      },
      {
        "source": "vietnam-sourcing-hub",
        "target": "vinatex-electronics",
        "relation": "contains",
        "weight": 0.9
      },
      {
        "source": "vietnam-sourcing-hub",
        "target": "hcm-components",
        "relation": "contains",
        "weight": 0.9
      },
      {
        "source": "3pl-performance-scorecard",
        "target": "fastfreight-uk",
        "relation": "scores",
        "weight": 0.8
      }
    ],
    "communities": [
      {
        "id": 1,
        "label": "Core Operations & Inventory",
        "node_count": 10,
        "key_entities": [
          "nexus-global-ops",
          "dc-birmingham",
          "demand-forecast-q4",
          "fmcg-hpc-022"
        ]
      },
      {
        "id": 2,
        "label": "Alternative Supplier Network",
        "node_count": 4,
        "key_entities": [
          "vinatex-electronics",
          "hcm-components",
          "monterrey-industrial",
          "vietnam-sourcing-hub"
        ]
      },
      {
        "id": 3,
        "label": "Logistics & 3PL",
        "node_count": 8,
        "key_entities": [
          "fastfreight-uk",
          "rotterdam-port",
          "hamburg-port",
          "master-logistics-agreement"
        ]
      },
      {
        "id": 4,
        "label": "Single-Source Risk",
        "node_count": 4,
        "key_entities": [
          "semicore",
          "nexus-plastics",
          "flexseal-gmbh",
          "dual-sourcing-programme"
        ]
      },
      {
        "id": 5,
        "label": "Tariff & Trade Risk",
        "node_count": 3,
        "key_entities": [
          "us-tariff-china",
          "procurement-cost-q3",
          "port-strike-risk"
        ]
      }
    ]
  },
  "financial_risk_compliance": {
    "domain": "financial_risk_compliance",
    "job_id": "job-fr-002",
    "generated": "2024-06-15T09:00:00Z",
    "nodes": [
      {
        "id": "meridian-bank-group",
        "label": "Meridian Bank Group",
        "type": "ORG",
        "count": 31,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "pra",
        "label": "Prudential Regulation Authority",
        "type": "ORG",
        "count": 14,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "ecb",
        "label": "European Central Bank",
        "type": "ORG",
        "count": 9,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "fca",
        "label": "Financial Conduct Authority",
        "type": "ORG",
        "count": 11,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "deutsche-bank",
        "label": "Deutsche Bank",
        "type": "ORG",
        "count": 8,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "bnp-paribas",
        "label": "BNP Paribas",
        "type": "ORG",
        "count": 7,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "societe-generale",
        "label": "Soci\u00e9t\u00e9 G\u00e9n\u00e9rale",
        "type": "ORG",
        "count": 6,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "ing-group",
        "label": "ING Group",
        "type": "ORG",
        "count": 5,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "unicredit",
        "label": "UniCredit",
        "type": "ORG",
        "count": 5,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "argent-properties",
        "label": "Argent Properties plc",
        "type": "ORG",
        "count": 6,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "nexus-financial",
        "label": "Nexus Financial",
        "type": "ORG",
        "count": 5,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "dataforge-consulting",
        "label": "DataForge Consulting",
        "type": "ORG",
        "count": 4,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "dr-priya-nair",
        "label": "Dr. Priya Nair",
        "type": "PERSON",
        "count": 9,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "marcus-webb",
        "label": "Marcus Webb",
        "type": "PERSON",
        "count": 6,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "james-okafor",
        "label": "James Okafor",
        "type": "PERSON",
        "count": 7,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "ellen-chu",
        "label": "Ellen Chu",
        "type": "PERSON",
        "count": 5,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "basel-iv",
        "label": "Basel IV Framework",
        "type": "REGULATION",
        "count": 16,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "aml-directive",
        "label": "6th AML Directive",
        "type": "REGULATION",
        "count": 8,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "crd-vi",
        "label": "CRD VI / CRR III",
        "type": "REGULATION",
        "count": 9,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "icaap",
        "label": "ICAAP",
        "type": "DOCUMENT",
        "count": 12,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "cet1-ratio",
        "label": "CET1 Ratio",
        "type": "METRIC",
        "count": 14,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "output-floor",
        "label": "Output Floor 72.5%",
        "type": "REGULATION",
        "count": 10,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "irb-mortgage-model",
        "label": "Retail Mortgage PD Model v7.2",
        "type": "MODEL",
        "count": 8,
        "community": 6,
        "is_event_trigger": false
      },
      {
        "id": "sme-scorecard",
        "label": "SME Scorecard v3.1",
        "type": "MODEL",
        "count": 7,
        "community": 6,
        "is_event_trigger": false
      },
      {
        "id": "aml-monitoring-system",
        "label": "AML Monitoring System",
        "type": "SYSTEM",
        "count": 11,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "credit-risk-rwa",
        "label": "Credit RWA \u00a314.8Bn",
        "type": "METRIC",
        "count": 9,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "stress-test-sbp",
        "label": "SBP Stress Test Scenario",
        "type": "PROCESS",
        "count": 10,
        "community": 4,
        "is_event_trigger": true
      },
      {
        "id": "cva-hedge",
        "label": "CVA Hedge Portfolio",
        "type": "INSTRUMENT",
        "count": 7,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "sar-filing",
        "label": "SAR Filing Process",
        "type": "PROCESS",
        "count": 6,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "hhi-concentration",
        "label": "HHI Concentration Index",
        "type": "METRIC",
        "count": 8,
        "community": 3,
        "is_event_trigger": false
      }
    ],
    "edges": [
      {
        "source": "meridian-bank-group",
        "target": "pra",
        "relation": "regulated_by",
        "weight": 0.95
      },
      {
        "source": "meridian-bank-group",
        "target": "fca",
        "relation": "regulated_by",
        "weight": 0.9
      },
      {
        "source": "meridian-bank-group",
        "target": "ecb",
        "relation": "reports_to",
        "weight": 0.7
      },
      {
        "source": "basel-iv",
        "target": "cet1-ratio",
        "relation": "governs",
        "weight": 0.9
      },
      {
        "source": "basel-iv",
        "target": "output-floor",
        "relation": "mandates",
        "weight": 0.95
      },
      {
        "source": "output-floor",
        "target": "credit-risk-rwa",
        "relation": "binding_constraint",
        "weight": 0.85
      },
      {
        "source": "meridian-bank-group",
        "target": "deutsche-bank",
        "relation": "counterparty_exposure",
        "weight": 0.9
      },
      {
        "source": "meridian-bank-group",
        "target": "bnp-paribas",
        "relation": "counterparty_exposure",
        "weight": 0.85
      },
      {
        "source": "meridian-bank-group",
        "target": "societe-generale",
        "relation": "counterparty_exposure",
        "weight": 0.8
      },
      {
        "source": "cva-hedge",
        "target": "deutsche-bank",
        "relation": "hedges_exposure_to",
        "weight": 0.75
      },
      {
        "source": "meridian-bank-group",
        "target": "argent-properties",
        "relation": "credit_exposure_breach",
        "weight": 0.8
      },
      {
        "source": "meridian-bank-group",
        "target": "nexus-financial",
        "relation": "credit_exposure_breach",
        "weight": 0.75
      },
      {
        "source": "hhi-concentration",
        "target": "icaap",
        "relation": "disclosed_in",
        "weight": 0.85
      },
      {
        "source": "aml-monitoring-system",
        "target": "sar-filing",
        "relation": "triggers",
        "weight": 0.9
      },
      {
        "source": "aml-directive",
        "target": "aml-monitoring-system",
        "relation": "requires",
        "weight": 0.9
      },
      {
        "source": "stress-test-sbp",
        "target": "cet1-ratio",
        "relation": "reduces",
        "weight": 0.8
      },
      {
        "source": "irb-mortgage-model",
        "target": "crd-vi",
        "relation": "validated_under",
        "weight": 0.85
      },
      {
        "source": "dr-priya-nair",
        "target": "meridian-bank-group",
        "relation": "chief_data_officer",
        "weight": 0.8
      },
      {
        "source": "marcus-webb",
        "target": "meridian-bank-group",
        "relation": "cfo",
        "weight": 0.8
      },
      {
        "source": "james-okafor",
        "target": "meridian-bank-group",
        "relation": "head_of_analytics",
        "weight": 0.75
      },
      {
        "source": "pra",
        "target": "icaap",
        "relation": "requires_submission",
        "weight": 0.9
      },
      {
        "source": "irb-mortgage-model",
        "target": "sme-scorecard",
        "relation": "peer_model",
        "weight": 0.6
      },
      {
        "source": "dataforge-consulting",
        "target": "irb-mortgage-model",
        "relation": "built",
        "weight": 0.7
      },
      {
        "source": "credit-risk-rwa",
        "target": "cet1-ratio",
        "relation": "determines",
        "weight": 0.85
      },
      {
        "source": "crd-vi",
        "target": "output-floor",
        "relation": "implements",
        "weight": 0.9
      }
    ],
    "communities": [
      {
        "id": 1,
        "label": "Internal Operations & Leadership",
        "node_count": 7,
        "key_entities": [
          "meridian-bank-group",
          "dr-priya-nair",
          "marcus-webb",
          "aml-monitoring-system"
        ]
      },
      {
        "id": 2,
        "label": "Counterparty Exposure Cluster",
        "node_count": 6,
        "key_entities": [
          "deutsche-bank",
          "bnp-paribas",
          "societe-generale",
          "cva-hedge"
        ]
      },
      {
        "id": 3,
        "label": "Concentration Risk",
        "node_count": 3,
        "key_entities": [
          "argent-properties",
          "nexus-financial",
          "hhi-concentration"
        ]
      },
      {
        "id": 4,
        "label": "Capital & Stress Testing",
        "node_count": 5,
        "key_entities": [
          "cet1-ratio",
          "credit-risk-rwa",
          "stress-test-sbp",
          "icaap"
        ]
      },
      {
        "id": 5,
        "label": "Regulatory Framework",
        "node_count": 7,
        "key_entities": [
          "pra",
          "fca",
          "basel-iv",
          "output-floor",
          "aml-directive"
        ]
      },
      {
        "id": 6,
        "label": "Model Risk",
        "node_count": 2,
        "key_entities": [
          "irb-mortgage-model",
          "sme-scorecard"
        ]
      }
    ]
  },
  "customer_experience_analytics": {
    "domain": "customer_experience_analytics",
    "nodes": [
      {
        "id": "nexus-retail-bank",
        "label": "Nexus Retail Bank",
        "type": "ORG",
        "count": 28,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "mass-affluent-segment",
        "label": "Mass Affluent Segment",
        "type": "SEGMENT",
        "count": 12,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "young-professional-segment",
        "label": "Young Professional Segment",
        "type": "SEGMENT",
        "count": 10,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "clv-prediction-model-v4",
        "label": "CLV Prediction Model v4",
        "type": "MODEL",
        "count": 9,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "nps-driver-analysis",
        "label": "NPS Driver Analysis",
        "type": "PROCESS",
        "count": 11,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "churn-prediction-model",
        "label": "Churn Prediction Model",
        "type": "MODEL",
        "count": 8,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "salesforce-fsc",
        "label": "Salesforce FSC",
        "type": "SYSTEM",
        "count": 13,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "digital-savers-25-35",
        "label": "Digital Savers 25-35",
        "type": "SEGMENT",
        "count": 9,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "lifetime-isa",
        "label": "Lifetime ISA",
        "type": "PRODUCT",
        "count": 7,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "green-mortgage",
        "label": "Green Mortgage",
        "type": "PRODUCT",
        "count": 6,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "sarah-chen",
        "label": "Sarah Chen",
        "type": "PERSON",
        "count": 5,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "consumer-duty",
        "label": "Consumer Duty",
        "type": "REGULATION",
        "count": 9,
        "community": 6,
        "is_event_trigger": false
      },
      {
        "id": "fca-consumer-duty",
        "label": "FCA Consumer Duty",
        "type": "REGULATION",
        "count": 8,
        "community": 6,
        "is_event_trigger": false
      },
      {
        "id": "omnichannel-journey-map",
        "label": "Omnichannel Journey Map",
        "type": "DOCUMENT",
        "count": 7,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "personalisation-engine",
        "label": "Personalisation Engine",
        "type": "SYSTEM",
        "count": 8,
        "community": 3,
        "is_event_trigger": false
      }
    ],
    "edges": [
      {
        "source": "nexus-retail-bank",
        "target": "mass-affluent-segment",
        "relation": "serves",
        "weight": 0.9
      },
      {
        "source": "mass-affluent-segment",
        "target": "clv-prediction-model-v4",
        "relation": "scored_by",
        "weight": 0.85
      },
      {
        "source": "churn-prediction-model",
        "target": "mass-affluent-segment",
        "relation": "identifies_churn_in",
        "weight": 0.8
      },
      {
        "source": "churn-prediction-model",
        "target": "young-professional-segment",
        "relation": "identifies_churn_in",
        "weight": 0.8
      },
      {
        "source": "nps-driver-analysis",
        "target": "salesforce-fsc",
        "relation": "pulls_data_from",
        "weight": 0.75
      },
      {
        "source": "digital-savers-25-35",
        "target": "lifetime-isa",
        "relation": "recommended_product",
        "weight": 0.85
      },
      {
        "source": "digital-savers-25-35",
        "target": "green-mortgage",
        "relation": "recommended_product",
        "weight": 0.8
      },
      {
        "source": "consumer-duty",
        "target": "clv-prediction-model-v4",
        "relation": "governs_deployment_of",
        "weight": 0.9
      },
      {
        "source": "personalisation-engine",
        "target": "salesforce-fsc",
        "relation": "integrates_with",
        "weight": 0.75
      },
      {
        "source": "sarah-chen",
        "target": "nexus-retail-bank",
        "relation": "head_of_cx",
        "weight": 0.8
      }
    ],
    "communities": [
      {
        "id": 1,
        "node_count": 3
      },
      {
        "id": 2,
        "node_count": 3
      },
      {
        "id": 3,
        "node_count": 3
      },
      {
        "id": 4,
        "node_count": 2
      },
      {
        "id": 5,
        "node_count": 2
      },
      {
        "id": 6,
        "node_count": 2
      }
    ],
    "node_count": 15,
    "edge_count": 10
  },
  "hr_talent_workforce": {
    "domain": "hr_talent_workforce",
    "nodes": [
      {
        "id": "nexus-global-workforce",
        "label": "Nexus Global Workforce",
        "type": "ORG",
        "count": 21,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "data-science-and-ai-engineering",
        "label": "Data Science & AI Engineering",
        "type": "FUNCTION",
        "count": 8,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "regulatory-affairs-function",
        "label": "Regulatory Affairs Function",
        "type": "FUNCTION",
        "count": 6,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "enterprise-architecture-function",
        "label": "Enterprise Architecture Function",
        "type": "FUNCTION",
        "count": 5,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "hr-attrition-model",
        "label": "HR Attrition Model",
        "type": "MODEL",
        "count": 7,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "dei-equity-audit-2024",
        "label": "DEI Equity Audit 2024",
        "type": "DOCUMENT",
        "count": 9,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "succession-planning-framework",
        "label": "Succession Planning Framework",
        "type": "PROCESS",
        "count": 8,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "henley-business-school",
        "label": "Henley Business School",
        "type": "ORG",
        "count": 4,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "gender-pay-gap-report",
        "label": "Gender Pay Gap Report",
        "type": "DOCUMENT",
        "count": 7,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "fast-track-programme",
        "label": "Fast-Track Programme",
        "type": "INITIATIVE",
        "count": 6,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "transformation-programme",
        "label": "Transformation Programme",
        "type": "INITIATIVE",
        "count": 9,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "nicole-baptiste",
        "label": "Nicole Baptiste",
        "type": "PERSON",
        "count": 5,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "workforce-capacity-plan-2024-2027",
        "label": "Workforce Capacity Plan 2024-2027",
        "type": "DOCUMENT",
        "count": 7,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "chro-office",
        "label": "CHRO Office",
        "type": "ORG",
        "count": 6,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "upskilling-pathways",
        "label": "Upskilling Pathways",
        "type": "INITIATIVE",
        "count": 5,
        "community": 2,
        "is_event_trigger": false
      }
    ],
    "edges": [
      {
        "source": "nexus-global-workforce",
        "target": "data-science-and-ai-engineering",
        "relation": "contains",
        "weight": 0.9
      },
      {
        "source": "data-science-and-ai-engineering",
        "target": "fast-track-programme",
        "relation": "targeted_by",
        "weight": 0.85
      },
      {
        "source": "hr-attrition-model",
        "target": "nexus-global-workforce",
        "relation": "monitors_attrition_for",
        "weight": 0.8
      },
      {
        "source": "succession-planning-framework",
        "target": "enterprise-architecture-function",
        "relation": "covers",
        "weight": 0.75
      },
      {
        "source": "dei-equity-audit-2024",
        "target": "gender-pay-gap-report",
        "relation": "includes",
        "weight": 0.85
      },
      {
        "source": "transformation-programme",
        "target": "upskilling-pathways",
        "relation": "funds",
        "weight": 0.8
      },
      {
        "source": "nicole-baptiste",
        "target": "nexus-global-workforce",
        "relation": "chro",
        "weight": 0.8
      },
      {
        "source": "henley-business-school",
        "target": "data-science-and-ai-engineering",
        "relation": "develops_talent_for",
        "weight": 0.7
      },
      {
        "source": "workforce-capacity-plan-2024-2027",
        "target": "transformation-programme",
        "relation": "plans_headcount_for",
        "weight": 0.85
      },
      {
        "source": "fast-track-programme",
        "target": "succession-planning-framework",
        "relation": "feeds_into",
        "weight": 0.75
      }
    ],
    "communities": [
      {
        "id": 1,
        "node_count": 6
      },
      {
        "id": 2,
        "node_count": 5
      },
      {
        "id": 3,
        "node_count": 1
      },
      {
        "id": 4,
        "node_count": 2
      },
      {
        "id": 5,
        "node_count": 1
      }
    ],
    "node_count": 15,
    "edge_count": 10
  },
  "it_infrastructure_security": {
    "domain": "it_infrastructure_security",
    "nodes": [
      {
        "id": "nexus-technology-group",
        "label": "Nexus Technology Group",
        "type": "ORG",
        "count": 24,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "crowdstrike-falcon",
        "label": "CrowdStrike Falcon",
        "type": "SYSTEM",
        "count": 9,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "beyondtrust-pam",
        "label": "BeyondTrust PAM",
        "type": "SYSTEM",
        "count": 7,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "zero-trust-architecture",
        "label": "Zero-Trust Architecture",
        "type": "FRAMEWORK",
        "count": 12,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "soc-(security-operations-centre)",
        "label": "SOC (Security Operations Centre)",
        "type": "FACILITY",
        "count": 11,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "fin-wks-0847",
        "label": "FIN-WKS-0847",
        "type": "ASSET",
        "count": 6,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "velociraptor",
        "label": "Velociraptor",
        "type": "TOOL",
        "count": 4,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "ncsc-cyber-essentials-plus",
        "label": "NCSC Cyber Essentials Plus",
        "type": "STANDARD",
        "count": 8,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "corepayments-v2",
        "label": "CorePayments v2",
        "type": "SYSTEM",
        "count": 10,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "cloud-migration-programme",
        "label": "Cloud Migration Programme",
        "type": "INITIATIVE",
        "count": 13,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "itil-problem-management",
        "label": "ITIL Problem Management",
        "type": "PROCESS",
        "count": 8,
        "community": 6,
        "is_event_trigger": false
      },
      {
        "id": "aws-msk",
        "label": "AWS MSK",
        "type": "SYSTEM",
        "count": 6,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "pci-dss-scope",
        "label": "PCI-DSS Scope",
        "type": "REGULATION",
        "count": 7,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "siem-platform",
        "label": "SIEM Platform",
        "type": "SYSTEM",
        "count": 10,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "david-kang",
        "label": "David Kang",
        "type": "PERSON",
        "count": 5,
        "community": 1,
        "is_event_trigger": false
      }
    ],
    "edges": [
      {
        "source": "nexus-technology-group",
        "target": "crowdstrike-falcon",
        "relation": "deployed",
        "weight": 0.9
      },
      {
        "source": "nexus-technology-group",
        "target": "beyondtrust-pam",
        "relation": "deployed",
        "weight": 0.85
      },
      {
        "source": "zero-trust-architecture",
        "target": "crowdstrike-falcon",
        "relation": "enforced_via",
        "weight": 0.8
      },
      {
        "source": "ncsc-cyber-essentials-plus",
        "target": "zero-trust-architecture",
        "relation": "aligns_with",
        "weight": 0.85
      },
      {
        "source": "corepayments-v2",
        "target": "pci-dss-scope",
        "relation": "in_scope_of",
        "weight": 0.9
      },
      {
        "source": "cloud-migration-programme",
        "target": "corepayments-v2",
        "relation": "migrates",
        "weight": 0.8
      },
      {
        "source": "soc",
        "target": "siem-platform",
        "relation": "uses",
        "weight": 0.9
      },
      {
        "source": "fin-wks-0847",
        "target": "soc",
        "relation": "monitored_by",
        "weight": 0.75
      },
      {
        "source": "david-kang",
        "target": "nexus-technology-group",
        "relation": "cto",
        "weight": 0.8
      },
      {
        "source": "itil-problem-management",
        "target": "nexus-technology-group",
        "relation": "governs_service_for",
        "weight": 0.8
      }
    ],
    "communities": [
      {
        "id": 1,
        "node_count": 2
      },
      {
        "id": 2,
        "node_count": 4
      },
      {
        "id": 3,
        "node_count": 3
      },
      {
        "id": 4,
        "node_count": 2
      },
      {
        "id": 5,
        "node_count": 3
      },
      {
        "id": 6,
        "node_count": 1
      }
    ],
    "node_count": 15,
    "edge_count": 10
  },
  "product_rd_innovation": {
    "domain": "product_rd_innovation",
    "nodes": [
      {
        "id": "aurora-health-monitor",
        "label": "Aurora Health Monitor",
        "type": "PRODUCT",
        "count": 14,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "quantumscape",
        "label": "QuantumScape",
        "type": "ORG",
        "count": 8,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "solid-power",
        "label": "Solid Power",
        "type": "ORG",
        "count": 6,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "toyota",
        "label": "Toyota",
        "type": "ORG",
        "count": 11,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "samsung-sdi",
        "label": "Samsung SDI",
        "type": "ORG",
        "count": 9,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "stage-gate-process",
        "label": "Stage-Gate Process",
        "type": "PROCESS",
        "count": 10,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "solid-state-battery-technology",
        "label": "Solid-State Battery Technology",
        "type": "TECHNOLOGY",
        "count": 12,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "fda-510(k)-clearance",
        "label": "FDA 510(k) Clearance",
        "type": "REGULATION",
        "count": 7,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "ce-mark",
        "label": "CE Mark",
        "type": "CERTIFICATION",
        "count": 6,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "john-lewis-partnership",
        "label": "John Lewis Partnership",
        "type": "ORG",
        "count": 5,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "technology-readiness-level-6",
        "label": "Technology Readiness Level 6",
        "type": "METRIC",
        "count": 6,
        "community": 1,
        "is_event_trigger": false
      }
    ],
    "edges": [
      {
        "source": "aurora-health-monitor",
        "target": "fda-510(k)-clearance",
        "relation": "requires",
        "weight": 0.9
      },
      {
        "source": "aurora-health-monitor",
        "target": "ce-mark",
        "relation": "requires",
        "weight": 0.85
      },
      {
        "source": "aurora-health-monitor",
        "target": "technology-readiness-level-6",
        "relation": "achieved",
        "weight": 0.85
      },
      {
        "source": "solid-state-battery-technology",
        "target": "quantumscape",
        "relation": "ip_dominated_by",
        "weight": 0.8
      },
      {
        "source": "solid-state-battery-technology",
        "target": "toyota",
        "relation": "ip_dominated_by",
        "weight": 0.85
      },
      {
        "source": "stage-gate-process",
        "target": "aurora-health-monitor",
        "relation": "governs_development_of",
        "weight": 0.9
      },
      {
        "source": "john-lewis-partnership",
        "target": "aurora-health-monitor",
        "relation": "retail_partner_for",
        "weight": 0.75
      },
      {
        "source": "solid-power",
        "target": "solid-state-battery-technology",
        "relation": "co_development_candidate",
        "weight": 0.7
      }
    ],
    "communities": [
      {
        "id": 1,
        "node_count": 2
      },
      {
        "id": 2,
        "node_count": 5
      },
      {
        "id": 3,
        "node_count": 1
      },
      {
        "id": 4,
        "node_count": 2
      },
      {
        "id": 5,
        "node_count": 1
      }
    ],
    "node_count": 11,
    "edge_count": 8
  },
  "esg_sustainability": {
    "domain": "esg_sustainability",
    "nodes": [
      {
        "id": "nexus-carbon-account",
        "label": "Nexus Carbon Account",
        "type": "ORG",
        "count": 18,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "iea-nze2050",
        "label": "IEA NZE2050",
        "type": "FRAMEWORK",
        "count": 11,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "tcfd-framework",
        "label": "TCFD Framework",
        "type": "STANDARD",
        "count": 13,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "csrd",
        "label": "CSRD",
        "type": "REGULATION",
        "count": 8,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "precisioncast-ltd",
        "label": "PrecisionCast Ltd",
        "type": "ORG",
        "count": 6,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "chembase-industrial",
        "label": "ChemBase Industrial",
        "type": "ORG",
        "count": 5,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "scope-3-cat-1-emissions",
        "label": "Scope 3 Cat 1 Emissions",
        "type": "METRIC",
        "count": 12,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "woodland-carbon-code",
        "label": "Woodland Carbon Code",
        "type": "STANDARD",
        "count": 5,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "sbti",
        "label": "SBTi",
        "type": "FRAMEWORK",
        "count": 9,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "kpmg-external-assurance",
        "label": "KPMG External Assurance",
        "type": "ORG",
        "count": 6,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "manchester-site",
        "label": "Manchester Site",
        "type": "FACILITY",
        "count": 7,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "rotterdam-site",
        "label": "Rotterdam Site",
        "type": "FACILITY",
        "count": 6,
        "community": 5,
        "is_event_trigger": false
      }
    ],
    "edges": [
      {
        "source": "nexus-carbon-account",
        "target": "iea-nze2050",
        "relation": "aligned_with",
        "weight": 0.9
      },
      {
        "source": "nexus-carbon-account",
        "target": "tcfd-framework",
        "relation": "discloses_under",
        "weight": 0.9
      },
      {
        "source": "tcfd-framework",
        "target": "csrd",
        "relation": "feeds_into",
        "weight": 0.8
      },
      {
        "source": "scope-3-cat-1-emissions",
        "target": "precisioncast-ltd",
        "relation": "largest_contributor_in",
        "weight": 0.85
      },
      {
        "source": "sbti",
        "target": "iea-nze2050",
        "relation": "references",
        "weight": 0.8
      },
      {
        "source": "woodland-carbon-code",
        "target": "sbti",
        "relation": "allowed_offset_under",
        "weight": 0.75
      },
      {
        "source": "kpmg-external-assurance",
        "target": "tcfd-framework",
        "relation": "assures",
        "weight": 0.85
      },
      {
        "source": "manchester-site",
        "target": "nexus-carbon-account",
        "relation": "highest_physical_risk_site_of",
        "weight": 0.8
      },
      {
        "source": "chembase-industrial",
        "target": "scope-3-cat-1-emissions",
        "relation": "contributes_to",
        "weight": 0.75
      }
    ],
    "communities": [
      {
        "id": 1,
        "node_count": 1
      },
      {
        "id": 2,
        "node_count": 4
      },
      {
        "id": 3,
        "node_count": 3
      },
      {
        "id": 4,
        "node_count": 2
      },
      {
        "id": 5,
        "node_count": 2
      }
    ],
    "node_count": 12,
    "edge_count": 9
  },
  "manufacturing_quality": {
    "domain": "manufacturing_quality",
    "nodes": [
      {
        "id": "nexus-pharma-manufacturing",
        "label": "Nexus Pharma Manufacturing",
        "type": "ORG",
        "count": 26,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "line-7",
        "label": "Line 7",
        "type": "ASSET",
        "count": 14,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "fill-seal-machine-fs-03",
        "label": "Fill-Seal Machine FS-03",
        "type": "ASSET",
        "count": 8,
        "community": 6,
        "is_event_trigger": false
      },
      {
        "id": "fda-21-cfr-part-11",
        "label": "FDA 21 CFR Part 11",
        "type": "REGULATION",
        "count": 12,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "iso-9001:2015",
        "label": "ISO 9001:2015",
        "type": "STANDARD",
        "count": 10,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "thermocouple-th-l7-04",
        "label": "Thermocouple TH-L7-04",
        "type": "ASSET",
        "count": 7,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "capa-mfg-2024-0142",
        "label": "CAPA-MFG-2024-0142",
        "type": "DOCUMENT",
        "count": 9,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "oee-target-75%",
        "label": "OEE Target 75%",
        "type": "METRIC",
        "count": 8,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "six-sigma-dmaic",
        "label": "Six Sigma DMAIC",
        "type": "METHODOLOGY",
        "count": 9,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "fmea-registry",
        "label": "FMEA Registry",
        "type": "DOCUMENT",
        "count": 6,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "skf-bearing-6308-2rs",
        "label": "SKF Bearing 6308-2RS",
        "type": "COMPONENT",
        "count": 5,
        "community": 6,
        "is_event_trigger": false
      },
      {
        "id": "batch-l7-20240614-003",
        "label": "Batch L7-20240614-003",
        "type": "DOCUMENT",
        "count": 5,
        "community": 1,
        "is_event_trigger": false
      }
    ],
    "edges": [
      {
        "source": "nexus-pharma-manufacturing",
        "target": "line-7",
        "relation": "operates",
        "weight": 0.9
      },
      {
        "source": "line-7",
        "target": "thermocouple-th-l7-04",
        "relation": "contains",
        "weight": 0.85
      },
      {
        "source": "thermocouple-th-l7-04",
        "target": "capa-mfg-2024-0142",
        "relation": "subject_of",
        "weight": 0.9
      },
      {
        "source": "fda-21-cfr-part-11",
        "target": "batch-l7-20240614-003",
        "relation": "governs",
        "weight": 0.9
      },
      {
        "source": "six-sigma-dmaic",
        "target": "line-7",
        "relation": "applied_to",
        "weight": 0.8
      },
      {
        "source": "oee-target-75%",
        "target": "line-7",
        "relation": "applies_to",
        "weight": 0.85
      },
      {
        "source": "fill-seal-machine-fs-03",
        "target": "skf-bearing-6308-2rs",
        "relation": "contains",
        "weight": 0.85
      },
      {
        "source": "iso-9001:2015",
        "target": "nexus-pharma-manufacturing",
        "relation": "certified_standard",
        "weight": 0.9
      },
      {
        "source": "fmea-registry",
        "target": "fill-seal-machine-fs-03",
        "relation": "covers",
        "weight": 0.8
      }
    ],
    "communities": [
      {
        "id": 1,
        "node_count": 5
      },
      {
        "id": 2,
        "node_count": 2
      },
      {
        "id": 3,
        "node_count": 1
      },
      {
        "id": 4,
        "node_count": 2
      },
      {
        "id": 6,
        "node_count": 2
      }
    ],
    "node_count": 12,
    "edge_count": 9
  },
  "mergers_acquisitions": {
    "domain": "mergers_acquisitions",
    "nodes": [
      {
        "id": "pathogeniq-ltd",
        "label": "PathogenIQ Ltd",
        "type": "ORG",
        "count": 18,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "nexus-analytics-(acquired)",
        "label": "Nexus Analytics (acquired)",
        "type": "ORG",
        "count": 14,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "diagnosys-gmbh",
        "label": "DiagnoSys GmbH",
        "type": "ORG",
        "count": 9,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "precisionlab-inc",
        "label": "PrecisionLab Inc",
        "type": "ORG",
        "count": 7,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "bioscan-uk",
        "label": "BioScan UK",
        "type": "ORG",
        "count": 8,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "pathogeniq-synergy-model",
        "label": "PathogenIQ Synergy Model",
        "type": "MODEL",
        "count": 9,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "integration-management-office",
        "label": "Integration Management Office",
        "type": "ORG",
        "count": 7,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "master-supply-agreement-schedule-7",
        "label": "Master Supply Agreement Schedule 7",
        "type": "CONTRACT",
        "count": 6,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "mhra-device-registration",
        "label": "MHRA Device Registration",
        "type": "PROCESS",
        "count": 7,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "100-day-integration-plan",
        "label": "100-Day Integration Plan",
        "type": "DOCUMENT",
        "count": 10,
        "community": 2,
        "is_event_trigger": false
      }
    ],
    "edges": [
      {
        "source": "pathogeniq-ltd",
        "target": "pathogeniq-synergy-model",
        "relation": "valued_by",
        "weight": 0.9
      },
      {
        "source": "pathogeniq-ltd",
        "target": "mhra-device-registration",
        "relation": "constrained_by",
        "weight": 0.85
      },
      {
        "source": "nexus-analytics-(acquired)",
        "target": "integration-management-office",
        "relation": "overseen_by",
        "weight": 0.9
      },
      {
        "source": "100-day-integration-plan",
        "target": "integration-management-office",
        "relation": "executed_by",
        "weight": 0.85
      },
      {
        "source": "diagnosys-gmbh",
        "target": "pathogeniq-ltd",
        "relation": "competed_against_in_screen",
        "weight": 0.7
      },
      {
        "source": "master-supply-agreement-schedule-7",
        "target": "precisioncast-ltd",
        "relation": "governs_supplier",
        "weight": 0.8
      },
      {
        "source": "pathogeniq-synergy-model",
        "target": "pathogeniq-ltd",
        "relation": "models_value_of",
        "weight": 0.9
      }
    ],
    "communities": [
      {
        "id": 1,
        "node_count": 2
      },
      {
        "id": 2,
        "node_count": 3
      },
      {
        "id": 3,
        "node_count": 3
      },
      {
        "id": 4,
        "node_count": 1
      },
      {
        "id": 5,
        "node_count": 1
      }
    ],
    "node_count": 10,
    "edge_count": 7
  },
  "digital_transformation": {
    "domain": "digital_transformation",
    "nodes": [
      {
        "id": "nexus-digital-architecture",
        "label": "Nexus Digital Architecture",
        "type": "ORG",
        "count": 22,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "apache-kafka-on-aws-msk",
        "label": "Apache Kafka on AWS MSK",
        "type": "TECHNOLOGY",
        "count": 9,
        "community": 2,
        "is_event_trigger": false
      },
      {
        "id": "datahub",
        "label": "DataHub",
        "type": "SYSTEM",
        "count": 8,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "onetrust",
        "label": "OneTrust",
        "type": "SYSTEM",
        "count": 6,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "erp-monolith-(sap-s-4hana)",
        "label": "ERP Monolith (SAP S/4HANA)",
        "type": "SYSTEM",
        "count": 14,
        "community": 4,
        "is_event_trigger": false
      },
      {
        "id": "order-management-microservice",
        "label": "Order Management Microservice",
        "type": "SYSTEM",
        "count": 9,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "data-mesh-architecture",
        "label": "Data Mesh Architecture",
        "type": "FRAMEWORK",
        "count": 12,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "bcbs-239",
        "label": "BCBS 239",
        "type": "REGULATION",
        "count": 8,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "ai-governance-framework",
        "label": "AI Governance Framework",
        "type": "DOCUMENT",
        "count": 11,
        "community": 6,
        "is_event_trigger": false
      },
      {
        "id": "technical-debt-register",
        "label": "Technical Debt Register",
        "type": "DOCUMENT",
        "count": 9,
        "community": 7,
        "is_event_trigger": false
      },
      {
        "id": "domain-data-council",
        "label": "Domain Data Council",
        "type": "ORG",
        "count": 7,
        "community": 3,
        "is_event_trigger": false
      },
      {
        "id": "cast-assessment",
        "label": "CAST Assessment",
        "type": "PROCESS",
        "count": 6,
        "community": 7,
        "is_event_trigger": false
      },
      {
        "id": "strangler-fig-pattern",
        "label": "Strangler Fig Pattern",
        "type": "METHOD",
        "count": 8,
        "community": 5,
        "is_event_trigger": false
      },
      {
        "id": "victoria-okonkwo",
        "label": "Victoria Okonkwo",
        "type": "PERSON",
        "count": 5,
        "community": 1,
        "is_event_trigger": false
      },
      {
        "id": "ss1-23-guidance",
        "label": "SS1/23 Guidance",
        "type": "REGULATION",
        "count": 6,
        "community": 6,
        "is_event_trigger": false
      }
    ],
    "edges": [
      {
        "source": "nexus-digital-architecture",
        "target": "erp-monolith-(sap-s-4hana)",
        "relation": "migrating_away_from",
        "weight": 0.9
      },
      {
        "source": "erp-monolith-(sap-s-4hana)",
        "target": "order-management-microservice",
        "relation": "decomposed_into",
        "weight": 0.85
      },
      {
        "source": "strangler-fig-pattern",
        "target": "order-management-microservice",
        "relation": "migration_method",
        "weight": 0.8
      },
      {
        "source": "apache-kafka-on-aws-msk",
        "target": "order-management-microservice",
        "relation": "event_bus_for",
        "weight": 0.85
      },
      {
        "source": "data-mesh-architecture",
        "target": "datahub",
        "relation": "catalogued_in",
        "weight": 0.8
      },
      {
        "source": "onetrust",
        "target": "data-mesh-architecture",
        "relation": "provides_consent_mgmt_for",
        "weight": 0.75
      },
      {
        "source": "bcbs-239",
        "target": "data-mesh-architecture",
        "relation": "constrains",
        "weight": 0.85
      },
      {
        "source": "ai-governance-framework",
        "target": "ss1-23-guidance",
        "relation": "aligned_with",
        "weight": 0.85
      },
      {
        "source": "technical-debt-register",
        "target": "erp-monolith-(sap-s-4hana)",
        "relation": "quantifies_debt_of",
        "weight": 0.8
      },
      {
        "source": "cast-assessment",
        "target": "technical-debt-register",
        "relation": "generates",
        "weight": 0.85
      },
      {
        "source": "victoria-okonkwo",
        "target": "nexus-digital-architecture",
        "relation": "chief_digital_officer",
        "weight": 0.8
      },
      {
        "source": "domain-data-council",
        "target": "data-mesh-architecture",
        "relation": "governs",
        "weight": 0.85
      }
    ],
    "communities": [
      {
        "id": 1,
        "node_count": 2
      },
      {
        "id": 2,
        "node_count": 1
      },
      {
        "id": 3,
        "node_count": 5
      },
      {
        "id": 4,
        "node_count": 1
      },
      {
        "id": 5,
        "node_count": 2
      },
      {
        "id": 6,
        "node_count": 2
      },
      {
        "id": 7,
        "node_count": 2
      }
    ],
    "node_count": 15,
    "edge_count": 12
  }
};

/** Community wiki articles keyed by domain_label → article_list. */
export const DEMO_WIKIS: Record<string, Array<{title:string;content:string;community:number}>> = {
  "supply_chain_logistics": [
    {
      "title": "Supply Chain & Disruption",
      "content": "# Supply Chain Disruption & Tariff Impact\n\n**Organizations:** Nexus Global Operations, Vinatex Electronics, HCM Components Ltd, Monterrey Industrial, FastFreight UK, Nordic Express, TranzCargo Iberia, SemiCore, FlexSeal GmbH, Axiom Analytics Partners\n\n**Key People:** James Whitfield (VP Supply Chain), Amara Osei (Head of SC Analytics), Patricia Lim (CPO), Rob Davies (Head of Logistics Ops)\n\n**Locations:** Rotterdam Port, Hamburg Port, Antwerp Port, DC-Birmingham, Vietnam Sourcing Hub, Ho Chi Minh City, Monterrey Mexico\n\n**Regulations & Policies:** US Tariff China Electronics 25% (HTS 8541-8543), Master Logistics Agreement 2023, OTIF Target 95%, Safety Stock Policy 12-week cover\n\n**Metrics:** OTIF, MAPE 18.4%\u219212%, Working Capital \u00a387M excess, Procurement Spend \u00a32.4Bn, Disruption Cost \u00a334M (2022-2023)\n\n---\n\n## Key Passages\n\n> A 25% tariff increase would add approximately \u00a34.2M to Q3 procurement costs across 14 affected SKU families. Three qualified Vietnamese suppliers have confirmed capacity and can onboard within 6\u20138 weeks via existing supplier agreements.\n\n> Master Logistics Agreement (MLA) 2023 defines OTIF target 95%. Performance credit: 1.5% monthly freight spend per percentage point below 95%. FastFreight UK at 88.3% \u2014 breach of -6.7pp, credit \u00a387K/month.\n\n> Identified 10 critical single-source dependencies: SemiCore (IC substrates, 23% production exposure), Nexus Plastics (injection-moulded housings, 19%), FlexSeal GmbH (industrial seals, 17%). Dual-source programmes recommended with 6\u201318 month qualification timelines.\n\n> Demand forecast for FMCG-HPC-022: July 1.2M units, August 1.4M (+17% back-to-school), September 1.9M (+58% including 6-week promotional campaign). Recommend pre-building 800K units in June/July to buffer against September demand spike.\n\n> Applying (s,S) replenishment policy with demand-sensing inputs across 12 SKUs yields a projected 21.4% working capital reduction. Safety stock recalculated using Poisson demand model at 99.2% fill rate.\n\n---\n\n## Entity Relationships\n\n- **NGO \u2192 SemiCore**: Single-source supplier (23% production exposure, Taiwan Strait risk)\n- **US Tariff** \u2192 **Procurement Cost Q3**: +\u00a34.2M incremental impact\n- **Rotterdam Port** \u2192 **Hamburg Port**: Primary freight re-route (strike risk scenario)\n- **FastFreight UK** \u2192 **OTIF 95%**: Below threshold (-6.7pp), remediation in progress\n- **MLA 2023** \u2192 **OTIF KPI**: Contractual definition; performance credits activated\n\n---\n\n## Business Risks\n\n| Risk | Probability | Impact | Mitigation |\n|------|------------|--------|------------|\n| Rotterdam port strike | Medium | \u00a334M potential disruption | Hamburg/Antwerp re-route plan ready |\n| US tariff 25% electronics | High (confirmed) | \u00a34.2M Q3 cost | Vietnam dual-source underway |\n| SemiCore single-source | High | 23% production halt | Kyocera dual-source Q4 2024 |\n| FastFreight OTIF breach | Confirmed | \u00a3204K/month credits | SIP received 14 June |\n| DC-Birmingham capacity | Medium | September demand peak | Pre-build programme approved |\n",
      "community": 0
    }
  ],
  "financial_risk_compliance": [
    {
      "title": "Basel IV, AML & Credit Risk",
      "content": "# Basel IV, AML & Credit Risk \u2014 Meridian Bank Group\n\n**Organizations:** Meridian Bank Group, Prudential Regulation Authority, Financial Conduct Authority, European Central Bank, DataForge Consulting, NovaSentinel, KPMG, Deutsche Bank, BNP Paribas, Soci\u00e9t\u00e9 G\u00e9n\u00e9rale, ING Group, UniCredit\n\n**Key People:** Dr. Priya Nair (CDO), Marcus Webb (CFO), James Okafor (Head of Analytics), Ellen Chu (Principal Architect)\n\n**Regulations:** Basel IV / CRR III, 6th AML Directive, CRD VI, Output Floor 72.5%, PRA Annual Cyclical Scenario, CRR Article 395 (Large Exposures)\n\n**Models:** Retail Mortgage PD Model v7.2 (MRM RED), SME Scorecard v3.1 (MRM RED), LGD Residential v5 (MRM AMBER), CCF Corporate v2 (MRM AMBER)\n\n---\n\n## Key Passages\n\n> Standardised Approach RWA for corporate portfolio: \u00a314.8Bn. Output Floor (72.5% of internal model RWA) binding constraint at \u00a313.4Bn vs internal model \u00a311.2Bn \u2014 floor adds \u00a32.2Bn RWA uplift and \u00a3176M additional CET1 capital requirement.\n\n> 23 transactions identified meeting TBML over-invoicing criteria. 8 high-priority alerts recommended for SAR filing \u2014 consistent invoice-to-market-price ratios exceeding 240% for commodity goods (electronics, textiles) via 4 corporate entities in UAE, Hong Kong and Cyprus.\n\n> Under SBP scenario: retail mortgage PD increases from 1.2% to 4.7%; unsecured consumer from 3.8% to 9.1%; SME commercial from 2.4% to 7.3%. Stage 3 loan loss provisions increase by \u00a31.84Bn. CET1 ratio falls from 14.2% to 11.8%.\n\n> Retail Mortgage PD Model v7.2: Development Gini 0.73, Current Gini 0.61, degradation -16.4% (MRM Status: RED). Immediate redevelopment authorised. SME Scorecard v3.1: degradation -19.4% (MRM RED). External validation by PWC ordered.\n\n> Large exposure breaches: Argent Properties plc \u00a33.1Bn (107% of CRR limit), Nexus Financial \u00a33.0Bn (103% of limit). 90-day remediation plans in place.\n\n---\n\n## Capital Structure Summary\n\n| Metric | Value | Target / Limit |\n|--------|-------|----------------|\n| CET1 Ratio (current) | 14.2% | \u226510.5% (MDA trigger) |\n| CET1 Ratio (stressed SBP) | 11.8% | \u226510.5% |\n| SA RWA | \u00a314.8Bn | \u2014 |\n| Output Floor RWA | \u00a313.4Bn (binding) | \u2014 |\n| Large Exposure Breaches | 2 | 0 |\n\n---\n\n## AML Risk Indicators\n\n- **TBML Red Flags**: Invoice-to-market-price ratio >200% on cross-border goods >\u00a3500K\n- **High-risk jurisdictions**: UAE, Hong Kong, Cyprus (FATF enhanced monitoring)\n- **SAR filings Q2**: 8 submitted to National Crime Agency\n- **Accounts frozen**: 3 pending NCA review\n",
      "community": 0
    }
  ],
  "customer_experience_analytics": [
    {
      "title": "Customer Experience Analytics \u2014 Knowledge Summary",
      "content": "## Key Entities\n\nNexus Retail Bank, Mass Affluent Segment, Young Professional Segment, CLV Prediction Model v4, NPS Driver Analysis, Churn Prediction Model, Salesforce FSC, Digital Savers 25-35\n\n## Overview\nKnowledge graph constructed from 15 entities and 10 relationships across the customer experience analytics domain.",
      "community": 0
    }
  ],
  "hr_talent_workforce": [
    {
      "title": "Hr Talent Workforce \u2014 Knowledge Summary",
      "content": "## Key Entities\n\nNexus Global Workforce, Data Science & AI Engineering, Regulatory Affairs Function, Enterprise Architecture Function, HR Attrition Model, DEI Equity Audit 2024, Succession Planning Framework, Henley Business School\n\n## Overview\nKnowledge graph constructed from 15 entities and 10 relationships across the hr talent workforce domain.",
      "community": 0
    }
  ],
  "it_infrastructure_security": [
    {
      "title": "It Infrastructure Security \u2014 Knowledge Summary",
      "content": "## Key Entities\n\nNexus Technology Group, CrowdStrike Falcon, BeyondTrust PAM, Zero-Trust Architecture, SOC (Security Operations Centre), FIN-WKS-0847, Velociraptor, NCSC Cyber Essentials Plus\n\n## Overview\nKnowledge graph constructed from 15 entities and 10 relationships across the it infrastructure security domain.",
      "community": 0
    }
  ],
  "product_rd_innovation": [
    {
      "title": "Product Rd Innovation \u2014 Knowledge Summary",
      "content": "## Key Entities\n\nAurora Health Monitor, QuantumScape, Solid Power, Toyota, Samsung SDI, Stage-Gate Process, Solid-State Battery Technology, FDA 510(k) Clearance\n\n## Overview\nKnowledge graph constructed from 11 entities and 8 relationships across the product rd innovation domain.",
      "community": 0
    }
  ],
  "esg_sustainability": [
    {
      "title": "Esg Sustainability \u2014 Knowledge Summary",
      "content": "## Key Entities\n\nNexus Carbon Account, IEA NZE2050, TCFD Framework, CSRD, PrecisionCast Ltd, ChemBase Industrial, Scope 3 Cat 1 Emissions, Woodland Carbon Code\n\n## Overview\nKnowledge graph constructed from 12 entities and 9 relationships across the esg sustainability domain.",
      "community": 0
    }
  ],
  "manufacturing_quality": [
    {
      "title": "Manufacturing Quality \u2014 Knowledge Summary",
      "content": "## Key Entities\n\nNexus Pharma Manufacturing, Line 7, Fill-Seal Machine FS-03, FDA 21 CFR Part 11, ISO 9001:2015, Thermocouple TH-L7-04, CAPA-MFG-2024-0142, OEE Target 75%\n\n## Overview\nKnowledge graph constructed from 12 entities and 9 relationships across the manufacturing quality domain.",
      "community": 0
    }
  ],
  "mergers_acquisitions": [
    {
      "title": "Mergers Acquisitions \u2014 Knowledge Summary",
      "content": "## Key Entities\n\nPathogenIQ Ltd, Nexus Analytics (acquired), DiagnoSys GmbH, PrecisionLab Inc, BioScan UK, PathogenIQ Synergy Model, Integration Management Office, Master Supply Agreement Schedule 7\n\n## Overview\nKnowledge graph constructed from 10 entities and 7 relationships across the mergers acquisitions domain.",
      "community": 0
    }
  ],
  "digital_transformation": [
    {
      "title": "Digital Transformation \u2014 Knowledge Summary",
      "content": "## Key Entities\n\nNexus Digital Architecture, Apache Kafka on AWS MSK, DataHub, OneTrust, ERP Monolith (SAP S/4HANA), Order Management Microservice, Data Mesh Architecture, BCBS 239\n\n## Overview\nKnowledge graph constructed from 15 entities and 12 relationships across the digital transformation domain.",
      "community": 0
    }
  ]
};

export const DEMO_SLM_STATUS: Record<string, object> = {
  "supply_chain_logistics": {
    "status": "done",
    "model_id": "dhs-slm-supply-chain-v3",
    "domain_label": "supply_chain_logistics"
  },
  "financial_risk_compliance": {
    "status": "done",
    "model_id": "dhs-slm-financial-risk-v2",
    "domain_label": "financial_risk_compliance"
  },
  "customer_experience_analytics": {
    "status": "done",
    "model_id": "dhs-slm-cx-analytics-v2",
    "domain_label": "customer_experience_analytics"
  },
  "hr_talent_workforce": {
    "status": "done",
    "model_id": "dhs-slm-hr-workforce-v1",
    "domain_label": "hr_talent_workforce"
  },
  "it_infrastructure_security": {
    "status": "done",
    "model_id": "dhs-slm-cybersecurity-v2",
    "domain_label": "it_infrastructure_security"
  },
  "product_rd_innovation": {
    "status": "done",
    "model_id": "dhs-slm-product-rd-v1",
    "domain_label": "product_rd_innovation"
  },
  "esg_sustainability": {
    "status": "done",
    "model_id": "dhs-slm-esg-v2",
    "domain_label": "esg_sustainability"
  },
  "manufacturing_quality": {
    "status": "done",
    "model_id": "dhs-slm-manufacturing-v3",
    "domain_label": "manufacturing_quality"
  },
  "mergers_acquisitions": {
    "status": "done",
    "model_id": "dhs-slm-ma-strategy-v1",
    "domain_label": "mergers_acquisitions"
  },
  "digital_transformation": {
    "status": "done",
    "model_id": "dhs-slm-digital-transform-v2",
    "domain_label": "digital_transformation"
  }
};

export const DEMO_SUGGESTIONS: Record<string, string[]> = {
  "supply_chain_logistics": [
    "What is the projected impact of US 25% tariffs on our Q3 procurement costs, and which alternative suppliers in Vietnam or Mexico can absorb the shortfall?",
    "Generate a freight re-routing plan for our European distribution if Rotterdam port is closed for 3 weeks, prioritising pharmaceutical SKUs.",
    "Identify top 10 single-source Tier 1 suppliers where disruption would halt more than 15% of production output.",
    "What does our Q4 demand forecast look like for FMCG-HPC-022 accounting for back-to-school seasonality and September promotional campaign?",
    "Analyse 3PL partner performance scorecards for Q2 \u2014 which carriers are underperforming on OTIF and what contractual remedies apply?",
    "Build an inventory optimisation recommendation for our 12 highest-velocity SKUs to reduce working capital by 18%."
  ],
  "financial_risk_compliance": [
    "Generate our Basel IV standardised approach capital requirements for the corporate lending portfolio including the output floor comparison.",
    "Flag all transactions in the past 30 days exhibiting TBML over-invoicing patterns in cross-border goods transactions above \u00a3500K.",
    "Run a severe-but-plausible stress test: GDP contracts 4.8%, unemployment 9.2%, house prices fall 28% \u2014 what is the loan loss provision impact?",
    "What are our top 5 bank counterparty exposures and how does our CVA hedge perform under a 200bp credit spread widening?",
    "Prepare the ICAAP narrative section on credit concentration risk including HHI by sector and single-name limits compliance.",
    "Identify model risk exposures where IRB model performance has degraded more than 15% vs validation benchmarks."
  ],
  "customer_experience_analytics": [
    "Which customer segments have the highest 90-day churn probability and what are the top 5 interventions ranked by expected retention uplift per \u00a3 of cost?",
    "What are the primary NPS detractor drivers among SME customers who have been with us more than 3 years vs retail detractors?",
    "Build a personalised product recommendation for 'Digital Savers 25-35' that maximises 12-month revenue within FCA Consumer Duty suitability constraints.",
    "Analyse the omnichannel customer journey for mortgage applications and identify highest abandonment steps with root cause hypotheses.",
    "What is the estimated lifetime value of customers from Q1 digital campaign vs branch referral programme, net of acquisition cost?",
    "Generate the monthly exec dashboard summary for CX KPIs: NPS, churn rate, CLV cohort performance, digital adoption and complaint volumes."
  ],
  "hr_talent_workforce": [
    "Which business-critical roles have both high vacancy risk and low succession pipeline depth \u2014 what targeted interventions should we prioritise?",
    "Analyse voluntary attrition patterns for the Technology division over 18 months and identify key predictive factors and total cost.",
    "Generate the Q2 DEI equity audit report covering gender pay gap, ethnic minority representation at Band D+, and promotion equity ratios.",
    "Build a 3-year workforce capacity plan for the Transformation Programme accounting for 400 FTE growth and AI platform skills requirements."
  ],
  "it_infrastructure_security": [
    "Our SIEM flagged lateral movement from a compromised Finance endpoint \u2014 generate a full incident response playbook for this threat vector.",
    "Assess cloud migration risk for our 47 on-premise applications moving to AWS in Q4 and recommend sequencing for top 10 highest-risk migrations.",
    "Generate a zero-trust network access policy for third-party contractors accessing core banking systems, compliant with NCSC Cyber Essentials Plus.",
    "What is our ITIL problem management backlog status and have all 8 major incident RCAs been completed with corrective actions closed?"
  ],
  "product_rd_innovation": [
    "Analyse the patent landscape for solid-state battery technology relevant to our portable device product line and identify white-space opportunities.",
    "Conduct a stage-gate Gate 3 review for Project Aurora (health monitoring device) covering technical readiness, market validation and GTM readiness."
  ],
  "esg_sustainability": [
    "Calculate our total Scope 3 Category 1 emissions for FY2024 using spend-based methodology and identify top 20 supplier categories driving highest emissions.",
    "Model our net-zero pathway to 2050 under IEA NZE2050 scenario \u2014 what intermediate milestones must we hit by 2030 and 2040?",
    "Score our top 50 suppliers on ESG criteria for the Annual Supplier Sustainability Report, flagging any contractual ESG covenant breaches.",
    "Prepare the TCFD Climate Risk section for the 2024 Annual Report covering physical risk at our top 5 manufacturing sites and transition risk financials."
  ],
  "manufacturing_quality": [
    "Perform root cause analysis for the Line 7 coating adhesion failure on 14 June where defects reached 3.8% \u2014 which process parameters are most likely causes?",
    "Generate the OEE dashboard for all 8 production lines for June, identify top 3 availability/performance/quality losses and recommend improvement actions.",
    "A predictive maintenance alert flagged Fill-Seal Machine FS-03 with elevated vibration on bearing B2 \u2014 what is the predicted time to failure and recommended action?",
    "Generate the monthly FDA 21 CFR Part 11 compliance summary for June batch records including any electronic signature exceptions and audit trail gaps."
  ],
  "mergers_acquisitions": [
    "Screen M&A target universe for healthcare diagnostics companies with revenues \u00a380M-\u00a3300M, EBITDA margins >18%, and strong IP portfolios.",
    "Build the synergy case for proposed acquisition of PathogenIQ Ltd at \u00a31.4Bn enterprise value \u2014 include revenue synergies, cost synergies, integration costs and NPV.",
    "What are the key integration risks for PathogenIQ acquisition and how should the 100-day integration plan protect the revenue run-rate?",
    "Track post-merger integration milestones for completed Nexus Analytics acquisition (closed 8 months ago) \u2014 which workstreams are behind schedule?"
  ],
  "digital_transformation": [
    "Produce a microservices decomposition plan for the Order Management ERP module using the strangler fig pattern \u2014 define bounded contexts and migration sequence.",
    "Design the data mesh architecture for the Analytics platform with domain owners, data products, and federated governance meeting GDPR and BCBS 239.",
    "Establish an AI model governance framework for our 16 AI/ML models in production \u2014 classify risk levels and define approval workflows.",
    "Quantify our technical debt across the legacy application estate and build a prioritised remediation roadmap balancing risk reduction vs delivery capacity."
  ]
};

export const DEMO_ANSWERS: Record<string, { slm: string; hallucination_rate: number; task_completion_rate: number; answer: string }> = {
  "supply_chain_logistics": {
    "slm": "dhs-slm-supply-chain-v3",
    "hallucination_rate": 0.031,
    "task_completion_rate": 0.956,
    "answer": "**Supply Chain Intelligence \u2014 Nexus Global Operations**\n\nBased on the knowledge graph (487 entities, 5 communities) and corpus analysis:\n\n**Tariff Impact (US 25% Electronics Tariff, effective 1 Aug 2024)**\nThe tariff affects 14 SKU families (Consumer Electronics + Smart Home) with a Q3 incremental cost of **\u00a34.2M** and FY2025 net exposure of \u00a32.8M after Vietnam re-sourcing. Three qualified suppliers in Ho Chi Minh City can onboard within 6\u20138 weeks: Vinatex Electronics (emergency PO \u00a33.1M authorised 15 July), HCM Components Ltd (8-week onboarding), Saigon Tech Parts (in qualification). Monterrey Industrial (Mexico) qualifies for USMCA 0% treatment but requires a 3-week vendor audit.\n\n**Single-Source Risk Register (Top 3)**\n- SemiCore IC substrates: 23% production exposure (Taiwan Strait risk, 16-week lead time) \u2014 dual-source with Kyocera underway, Q4 2024 qualification\n- Nexus Plastics housings: 19% exposure (single Coventry plant) \u2014 Plastiform SA RFQ issued, Q3 2024 qualification\n- FlexSeal GmbH seals: 17% exposure (key person dependency) \u2014 Trelleborg AB technology transfer in negotiation\n\nSafety stock policy amended to 12-week cover for all Category A suppliers (up from 4 weeks).\n\n**3PL Performance (Q2 2024)**\nThree carriers below contractual 95% OTIF threshold: FastFreight UK 88.3% (\u22126.7pp, credit \u00a387K/month), Nordic Express 91.2% (\u22123.8pp, \u00a349K/month), TranzCargo Iberia 89.7% (\u22125.3pp, \u00a368K/month). Monthly credit run-rate: \u00a3287K. Service Improvement Plans received from FastFreight and TranzCargo. Nordic Express SIP overdue \u2014 legal team engaged.\n\n**Q4 Demand Forecast \u2014 FMCG-HPC-022**\nJuly 1.2M \u2192 August 1.4M (+17% back-to-school) \u2192 September 1.9M (+58% including 6-week promotional campaign) \u2192 October 1.1M (post-promo trough) \u2192 November 1.6M (seasonal ramp). Recommend pre-building 800K units in June/July. DC-Birmingham flagged as September capacity constraint \u2014 4,000 pallet overflow arrangement pending CPO approval.\n\n**Inventory Optimisation**\nApplying (s,S) replenishment with Poisson demand model at 99.2% fill rate across 12 highest-velocity SKUs: projected **21.4% working capital reduction** (\u00a318.6M freed cash). Phase 1: 4 SKUs in Month 1 (low volatility). Phase 2: 8 SKUs in Months 2\u20133."
  },
  "financial_risk_compliance": {
    "slm": "dhs-slm-financial-risk-v2",
    "hallucination_rate": 0.022,
    "task_completion_rate": 0.974,
    "answer": "**Financial Risk & Capital Intelligence \u2014 Meridian Bank Group**\n\n**Basel IV / Output Floor**\nSA RWA (corporate portfolio): **\u00a314.8Bn**. Output Floor (72.5% of IRB RWA) binds at \u00a313.4Bn \u2014 adding \u00a32.2Bn RWA uplift and **\u00a3176M additional CET1**. Current CET1: 14.2% (370bps above combined buffer). Management actions available (AT1 issuance, secured lending switches) provide 80bps reserve.\n\n**AML \u2014 TBML Alerts (May 2024)**\n23 high-priority alerts. **8 SAR filings** submitted to National Crime Agency: Goldstream Trading UAE (ratio 248%), Apex Commodities DMCC Dubai (312%, electronics), Horizon Tech HK (267%, textiles), Pacific Bridge Imports Cyprus (291%). 3 accounts frozen pending NCA review.\n\n**Stress Test (SBP Scenario)**\nGDP \u22124.8%, unemployment 9.2%, house prices \u221228%:\n- Retail Mortgage PD: 1.2% \u2192 4.7% (+3.5pp), ECL uplift \u00a3720M\n- Unsecured Consumer: 3.8% \u2192 9.1% (+5.3pp), ECL \u00a3580M\n- SME Commercial: 2.4% \u2192 7.3% (+4.9pp), ECL \u00a3480M\n- **Total Stage 3 provision increase: \u00a31.84Bn**\n- Post-stress CET1: 11.8% \u2014 above 10.5% regulatory minimum. 130bps headroom.\n\n**Model Risk**\nFour models degraded >15%: Retail Mortgage PD v7.2 (Gini \u221216.4%, MRM Red), SME Scorecard v3.1 (Gini \u221219.4%, MRM Red \u2014 external PWC validation ordered), LGD Residential v5 (RMSE +22%, Amber), CCF Corporate v2 (Spearman \u221218%, Amber). Immediate redevelopment authorised for both Red-rated models.\n\n**Large Exposures**\nArgent Properties plc: \u00a33.1Bn (107% of CRR limit). Nexus Financial: \u00a33.0Bn (103%). 90-day remediation plans in place. Board notified 12 April 2024."
  },
  "customer_experience_analytics": {
    "slm": "dhs-slm-cx-analytics-v2",
    "hallucination_rate": 0.047,
    "task_completion_rate": 0.937,
    "answer": "**Customer Experience Intelligence \u2014 Nexus Retail Bank**\n\n**Churn Risk Segmentation (90-day)**\nHighest risk: Young Professionals digital-only (31.2%), Mass Affluent 30-45 with mortgage <5yr (23.4%), Near-Retirement Downgraders 60-65 (18.7%).\n\n**Top 5 Retention Interventions by ROI**\n1. Proactive rate review call \u2014 \u00a312 cost, \u00a3340 CLV retention value (28\u00d7 ROI)\n2. Mortgage switch offer \u2014 \u00a334 cost, \u00a3890 CLV protection\n3. ISA incentive (LISA, under-40s only) \u2014 \u00a367 cost, \u00a31,240 CLV protection\n4. Financial health check \u2014 \u00a318 cost, \u00a3420 protection\n5. Fee waiver first year \u2014 \u00a3120 cost, \u00a3680 protection\nEstimated annual portfolio retention uplift: **\u00a314.2M**.\n\n**NPS Driver Analysis**\nSME detractors: RM accessibility 38%, digital banking UX 29%, credit decision speed 21%, fee complexity 12%. Retail detractors: branch closure proximity 44%, mobile app reliability 31%, fraud dispute resolution 25%. SME NPS \u221212 vs retail NPS +8.\n\n**Product Recommendation \u2014 Digital Savers 25-35 (n=142,000)**\nRecommended bundle: Lifetime ISA (91% eligible, \u00a31,000 government bonus) + Regular Saver 4.5% + Green Mortgage pre-approval (62% homeownership intent). Consumer Duty suitability confirmed. Projected 12-month incremental revenue: **\u00a318.4M**.\n\n**Mortgage Application Funnel**\nStart \u2192 Eligibility 87% \u2192 Document upload 71% \u2192 Credit search consent 58% \u2192 DIP 44% \u2192 Full application 31% \u2192 Completion 28%. Highest abandonment at consent step (\u221213pp). Root cause: GDPR consent language complexity. A/B test recommendation: simplified consent explainer (+4pp estimated conversion)."
  },
  "hr_talent_workforce": {
    "slm": "dhs-slm-hr-workforce-v1",
    "hallucination_rate": 0.058,
    "task_completion_rate": 0.921,
    "answer": "**Workforce Intelligence \u2014 Nexus Global Workforce (62,000 employees)**\n\n**Critical Role Risk (Top 3 clusters)**\nData Science & AI Engineering: 8 roles, avg 0.8 successors/role, external salary premium +34%. Regulatory Affairs: 3 roles, 1.1 successors, compliance dependency. Enterprise Architecture: 3 roles, 0.6 successors/role \u2014 most acute gap.\nInterventions: fast-track programme for 22 high-potentials, 3 strategic hires approved, Henley Business School partnership.\n\n**Technology Division Attrition (18-month rolling: 22.4% vs 11.2% group)**\nTop predictive factors: time-in-role >24 months without promotion (2.8\u00d7 multiplier), manager effectiveness <3.5/5 (2.1\u00d7), no L&D activity in 12 months (1.9\u00d7), below-market comp (1.7\u00d7). Total cost: \u00a38.4M/year. Recommended \u00a32.1M retention investment projects \u00a32.9M net saving.\n\n**DEI Q2 Audit**\nGender pay gap (median): 11.8% (\u21931.2pp YoY \u2014 outperforms FTSE 100 benchmark 14.1%). Ethnic minority Band D+: 12.4% (target 17% by 2027 \u2014 lagging by 4.6pp). Disability disclosure: 4.2% vs estimated 14% prevalence. Promotion equity: Female 0.89, Ethnic minority 0.76 (board action required).\n\n**3-Year Workforce Plan**\nYear 1: 180 FTE net growth (120 external, 60 redeployed). Year 2: 150 FTE. Year 3: 70 FTE. AI platform roles: 45 ML Engineers, 30 Data Engineers, 18 AI Product Managers \u2014 12 internal candidates identified, 81 external hires required. Total programme cost: \u00a328.4M. Critical path: ML Engineering ramp starts Q2 Year 1."
  },
  "it_infrastructure_security": {
    "slm": "dhs-slm-cybersecurity-v2",
    "hallucination_rate": 0.034,
    "task_completion_rate": 0.958,
    "answer": "**Cybersecurity Intelligence \u2014 Nexus Technology Group**\n\n**Incident Response \u2014 Lateral Movement (Finance Endpoint FIN-WKS-0847)**\nPhase 1 Containment (0\u20132hrs): Isolate FIN-WKS-0847, revoke AD credentials, block C2 IPs (185.220.x.x range) at perimeter.\nPhase 2 Investigation (2\u201324hrs): Memory forensics via Velociraptor, SIEM 7-day lookback \u2014 3 file shares accessed, 1 privileged account queried.\nPhase 3 Eradication: Rebuild from golden image, rotate all Finance passwords.\nPhase 4 PIR: 48hr review, CISO notification, ICO assessment (no PII exfiltrated confirmed).\n\n**Cloud Migration Risk (47 apps \u2192 AWS Q4)**\nHigh Risk (8 apps): CorePayments v2 (SWIFT+PCI-DSS, 6-month minimum cutover), RegulatoryReporting v4 (PRA real-time feeds, data residency), HR-Core (62K employee PII, GDPR Article 46 transfer mechanism needed). Recommended sequence: dev/test environments first (Q4), internal medium-risk apps (Q1), high-risk to specialist workstream with CTO sign-off.\n\n**Zero-Trust Contractor Policy**\nMFA mandatory (FIDO2 for privileged access), conditional access (managed device + CrowdStrike agent), JIT sessions max 8h. Contractor traffic on isolated VLAN, no lateral connectivity. BeyondTrust PAM session recording. DLP on all file transfers. NCSC CE+ aligned. PRA operational resilience self-assessment updated.\n\n**ITIL Problem Management**\n47 open problem records (23 Known Errors, 24 Under Investigation). 8 Major Incidents Q2: 7 RCAs complete (87.5%), P1-2024-0041 overdue by 12 days \u2014 escalated. 31 corrective actions raised: 18 closed, 9 in progress, 4 not started. Two recurring patterns identified: network switch firmware, certificate expiry management."
  },
  "esg_sustainability": {
    "slm": "dhs-slm-esg-v2",
    "hallucination_rate": 0.038,
    "task_completion_rate": 0.949,
    "answer": "**ESG & Sustainability Intelligence \u2014 Nexus Carbon Account**\n\n**Scope 3 Category 1 \u2014 FY2024 (Spend-Based, EXIOBASE factors)**\nTotal: **487,200 tCO2e**. Top 5 categories: Steel & Metals 112,400 tCO2e (23.1%), Chemical inputs 89,300 tCO2e (18.3%), Road freight 67,800 tCO2e (13.9%), IT hardware 54,200 tCO2e (11.1%), Packaging 38,700 tCO2e (7.9%). Top 20 categories = 93% of Cat 1 total. Highest decarbonisation leverage: steel supply chain (3 key suppliers have no net-zero commitment \u2014 SBTi engagement programme recommended).\n\n**Net-Zero Pathway (IEA NZE2050)**\nBaseline FY2024 Scope 1+2: 124,300 tCO2e.\n2030 target: 62,150 tCO2e (50% reduction). Key actions: 100% renewable electricity PPA (78MW contracted, covers 62%; additional 45MW tender underway), natural gas boiler replacement 14 sites (\u00a334M capex), electric fleet 380 vehicles. 2040: 12,430 tCO2e (90%). 2050: Net Zero via Woodland Carbon Code offsets (max 5% per SBTi). Total 2024\u20132030 capex: \u00a387M.\n\n**Supplier ESG Scoring (Top 50)**\n12 Green (70+), 28 Amber (40-69), 10 Red (<40). Covenant breaches: PrecisionCast Ltd (score 31, human rights audit overdue), FastPack Solutions (28, no CDP disclosure), ChemBase Industrial (34, REACH violation history), TransRoute Asia (29, no ISO 14001). 90-day improvement plans triggered under MSA Schedule 7. CPO escalation initiated.\n\n**TCFD Disclosure**\nManchester Site: high flood risk (IPCC RCP4.5 2040), \u00a38.4M asset exposure. Rotterdam Site: high risk, EU climate adaptation investment flagged. Carbon pricing at \u00a375/tCO2e (2030 ETS estimate): Scope 1+2 cost exposure \u00a39.3M/year on current trajectory. Assurance confirmed by KPMG under TCFD 2021 framework."
  },
  "manufacturing_quality": {
    "slm": "dhs-slm-manufacturing-v3",
    "hallucination_rate": 0.021,
    "task_completion_rate": 0.974,
    "answer": "**Manufacturing Quality Intelligence \u2014 Nexus Pharma Manufacturing**\n\n**Line 7 RCA (14 June Coating Failure \u2014 3.8% defect rate)**\nRoot cause confirmed: thermocouple calibration drift (TH-L7-04). 14 June 02:00\u201306:00 batch temperature: 58\u00b0C vs 54\u00b0C specification. Contributing factors: coating pan speed +12% vs baseline (night shift), incoming excipient lot EC-2024-0891 moisture content 4.1% vs 2.5% max. CAPA-MFG-2024-0142 raised. Immediate: recalibration + 4-hourly manual checks pending PM sensor replacement.\n\n**June OEE Summary (8 lines)**\nLine 2: 87.3% (best). Lines 4+6: 81\u201382%. Lines 1,3,5: 74\u201378%. Lines 7+8: 68\u201371% (below 75% target). Top losses: Line 7 maintenance overruns (\u22128.2% availability), changeover delays Lines 1+3 (\u22125.4%), coating speed reduction Lines 5\u20138 (\u22126.1%), weight variation Lines 3+5 (\u22121.9%). Improvement priority: Line 7 thermocouple programme, SMED changeover workshop Lines 1+3 (target 30% reduction).\n\n**FS-03 Bearing B2 Predictive Maintenance**\nCurrent RMS vibration: 12.4 mm/s (ISO 10816 Zone C). Predicted failure P50: 8.4 days, P90: 5.1 days. Recommended: planned replacement by 4 July (2 July 06:00\u201310:00 window). SKF-6308-2RS spare in stores (Qty: 2). Cost: \u00a34,200 planned vs \u00a3127K reactive failure. Risk of waiting: 47min unplanned line stoppage.\n\n**21 CFR Part 11 Compliance (June)**\n847 batch records: 842 fully compliant (99.4%). 5 exceptions: L7-20240614-003 (e-signature timeout, re-signed within 15 min), 2 batches with audit trail gap 23:47\u201323:52 during server maintenance (CAPA COMP-2024-0089 raised), 2 with incomplete humidity sensor data (manual bridge approved by QA). All assessed minor. Regulatory Affairs notified."
  },
  "mergers_acquisitions": {
    "slm": "dhs-slm-ma-strategy-v1",
    "hallucination_rate": 0.044,
    "task_completion_rate": 0.937,
    "answer": "**M&A Intelligence \u2014 Strategy & Corporate Development**\n\n**Healthcare Diagnostics Target Screen (247 targets \u2192 12 qualifying)**\nTop 5 by strategic fit: (1) PathogenIQ Ltd \u2014 \u00a3142M revenue, 24.3% EBITDA, 47 granted patents, PCR/NGS platform synergy 91/100. (2) DiagnoSys GmbH \u2014 \u00a3218M, 21.1% EBITDA, strong EU distribution. (3) PrecisionLab Inc \u2014 \u00a395M, 26.8% EBITDA, highest IP quality, US cross-sell. (4) BioScan UK \u2014 \u00a3167M, 19.4% EBITDA, NHS framework contract (regulatory moat). (5) ClinPath Analytics \u2014 \u00a3112M, 18.9% EBITDA. Valuation range: 9\u201314\u00d7 EBITDA.\n\n**PathogenIQ Synergy Case (\u00a31.4Bn EV, 9.8\u00d7 LTM EBITDA)**\nRevenue synergies \u00a334M yr3 run-rate: hospital cross-sell \u00a318M + APAC distribution \u00a316M. Cost synergies \u00a322M yr2: procurement \u00a38M, shared services \u00a39M, property \u00a35M. Integration costs \u00a348M over 24 months. **NPV at 12% WACC: \u00a3287M. IRR: 17.4%.** Deal dilutive above \u00a31.68Bn. Recommended bid range: \u00a31.35\u20131.52Bn.\n\n**100-Day Integration Plan**\nDays 1\u201330: stabilise/communicate (key talent retention packages, NHS account proactive engagement, MHRA registrations ring-fenced \u2014 no legal entity change until complete). Days 31\u201360: quick-win synergies (procurement consolidation \u00a32M). Days 61\u2013100: IMO stood up, ERP integration roadmap approved. Key risk: PathogenIQ startup culture \u2014 integration must preserve R&D autonomy.\n\n**Nexus Analytics PMI Status (Month 8 of 24)**\nOn track: HR integration 98%, brand migration 100%. Behind: IT consolidation 42% vs 65% target (ERP complexity, 4-month delay to Month 16). Revenue synergies \u00a32.8M vs \u00a36M target (lagging \u2014 sales integration slower than planned). Recovery plan required. Cost synergies \u00a39.2M (84% of Year 1 target \u2014 on track net of IT delay)."
  },
  "digital_transformation": {
    "slm": "dhs-slm-digital-transform-v2",
    "hallucination_rate": 0.041,
    "task_completion_rate": 0.943,
    "answer": "**Digital Transformation Intelligence \u2014 Nexus Digital Architecture**\n\n**Order Management Microservices Decomposition**\n6 bounded contexts: Order Capture, Pricing & Promotions, Inventory Allocation, Fulfilment Orchestration, Returns & Refunds, Order Analytics. 23 domain events mapped (OrderPlaced, InventoryReserved, ShipmentDispatched, etc.). Strangler Fig sequence: Phase 1 (Months 1\u20133) Order Analytics read-only; Phase 2 (4\u20138) Order Capture via API facade; Phase 3 (9\u201314) Pricing (highest coupling, requires event bus); Phase 4 (15\u201324) Fulfilment + Inventory; Phase 5 (24\u201330) Returns. Event bus: Apache Kafka on AWS MSK. Legacy ERP decommission Month 30.\n\n**Data Mesh Architecture**\n8 data domains: Customer (CDO), Risk & Finance (CFO/CRO), Supply Chain (COO), HR (CHRO), Technology (CTO), ESG (Corp Affairs), Sales & Marketing (CMO), Operations (COO). 34 data products catalogued in DataHub; 12 certified for enterprise consumption. Federated Governance: Data Council (CDO chaired), domain data stewards mandatory. BCBS 239: 11 critical risk products under enhanced SLA (99.9% availability, \u22644hr latency). GDPR: PIA required for personal data products; OneTrust consent management API integrated. Timeline: 18 months to full mesh.\n\n**AI Model Governance (16 production models)**\nHigh Risk (3): CLV Churn Model, Credit Risk Scorecard, AML Transaction Monitoring \u2014 CRO/CDO sign-off + biannual external validation. Medium Risk (9): Marketing Propensity, HR Attrition, Fraud Rule-Engine \u2014 annual review. Low Risk (4): internal analytics. Approval workflow: Development \u2192 Internal Validation \u2192 Second-Line Risk Review \u2192 Sponsor Sign-off (+ Independent Audit for High Risk). SS1/23 and EBA ML Guidelines alignment confirmed.\n\n**Technical Debt Analysis (147 legacy applications)**\nTotal remediation cost: **\u00a341M** (CAST methodology). High severity: 23 apps (\u00a318.4M) including 4 EOL OS/middleware, 3 undocumented owner, 2 known security vulnerabilities. Year 1 roadmap: eliminate 4 EOL platforms (\u00a33.8M risk-driven), decommission 12 redundant apps (\u00a32.1M saving). 10-year cost of inaction: \u00a3124M."
  },
  "product_rd_innovation": {
    "slm": "dhs-slm-product-rd-v1",
    "hallucination_rate": 0.064,
    "task_completion_rate": 0.913,
    "answer": "**Product R&D Intelligence \u2014 Innovation Lab**\n\n**Solid-State Battery Patent Landscape (4,847 patents, 2018\u20132024)**\nKey IP holders: Toyota (847 patents, oxide electrolytes), Samsung SDI (412, sulfide), QuantumScape (189, Li-metal anode), Solid Power (134). White-space opportunities: (1) Flexible thin-film solid-state cells for wearables \u2014 <40 filings globally, no dominant assignee; (2) Low-temperature performance for cold-chain IoT (<\u221220\u00b0C) \u2014 23 filings, two academic institutions. Strategy: defensive patents in white-space areas, QuantumScape licensing for portable devices, Solid Power co-development JV approach.\n\n**Project Aurora Gate 3 Review \u2014 APPROVED WITH CONDITIONS**\nTechnical: TRL 6 achieved (prototype in relevant environment). Regulatory: CE Mark and FDA 510(k) Class II confirmed. IP: 3 patents filed, 1 provisional in 2 additional markets. Market: 340-person user study NPS +67, intent to purchase 58% at \u00a3249. Competitive: 4.1\u00d7 longer battery life vs nearest competitor (independent lab confirmed). GTM: John Lewis + Boots term sheet agreed; DTC e-commerce ready.\nConditions: (1) Manufacturing partner finalisation by Week 6; (2) CE Mark timeline confirmed by Regulatory Affairs by Week 4."
  }
};

export const DEMO_NASH_INSIGHTS = {
  task_type: "analysis",
  valid_task_types: ["analysis", "planning", "reporting", "detection", "compliance", "root_cause", "maintenance"],
  dominant_model: "dhs-slm-supply-chain-v3",
  nash_explanation: "DHS Custom AI (domain-specific SLM) dominates the Nash equilibrium for domain tasks with a composite score of 0.941, outperforming all general-purpose models by 18+ percentage points on domain-specific benchmarks.",
  formula: "composite = 0.30×benchmark + 0.20×availability + 0.20×bandit + 0.15×speed + 0.10×ctx_fit + 0.05×task_fit",
  game_theory_note: "No unilateral deviation improves any player\'s payoff — the DHS domain SLM is the dominant strategy.",
  candidates: [
    { model: "dhs-slm-supply-chain-v3", provider: "custom_slm", benchmark: 0.941, availability: 1.0, bandit_score: 0.941, composite_score: 0.941, is_available: true, observations: 287, nash_probability: 0.72, is_dominant: true, benchmark_source: "domain_eval" },
    { model: "llama3:8b",  provider: "ollama", benchmark: 0.821, availability: 1.0, bandit_score: 0.821, composite_score: 0.821, is_available: true, observations: 312, nash_probability: 0.21, is_dominant: false, benchmark_source: "mmlu" },
    { model: "gemma3",     provider: "ollama", benchmark: 0.811, availability: 1.0, bandit_score: 0.811, composite_score: 0.811, is_available: true, observations: 156, nash_probability: 0.07, is_dominant: false, benchmark_source: "mmlu" },
  ],
} as const;

export const DEMO_PROCESS_STEPS = [
  { step: 1, label: "Requirements & Architecture", icon: "🏗️", output: "Microservices design with 6 bounded contexts. Event-driven via Apache Kafka on AWS MSK. OpenAPI 3.1 specification generated." },
  { step: 2, label: "Data Architecture",           icon: "🗄️", output: "PostgreSQL 16 + pgvector schema. 8 core tables, UUID PKs, JSONB metadata, cosine-similarity embeddings at VECTOR(768)." },
  { step: 3, label: "API Design",                  icon: "🔌", output: "REST + SSE APIs with JWT auth and rate limiting. 34 endpoints across 6 route groups. Swagger/OpenAPI docs auto-generated." },
  { step: 4, label: "AI/ML Pipeline",              icon: "🧠", output: "nomic-embed-text embeddings, domain SLM fine-tuning via QLoRA, hallucination detection against knowledge graph." },
  { step: 5, label: "Security & Compliance",       icon: "🔒", output: "Zero-trust ZTNA, PCI-DSS scope isolation, GDPR Article 46 transfer mechanisms, AES-256 encryption at rest." },
  { step: 6, label: "Deployment & Observability",  icon: "🚀", output: "Kubernetes on AWS EKS, GitOps via ArgoCD, Datadog APM, PagerDuty alerting, RTO <15min SLA." },
  { step: 7, label: "Testing & QA",                icon: "✅", output: "95% unit test coverage, E2E with Playwright, load testing with k6 at 2,000 RPS sustained, chaos engineering via Gremlin." },
] as const;

// ── Storage Manager demo data ─────────────────────────────────────────────────
export const DEMO_STORAGE = {
  projects: [
    {
      job_id: "demo-scl-001",
      project_name: "Supply Chain & Logistics",
      domain_label: "supply_chain_logistics",
      file_count: 14,
      corpus_size_bytes: 187_543_210,
      slm_size_bytes: 1_820_000_000,
      total_size_bytes: 2_007_543_210,
      created_at: "2026-06-10T09:00:00.000Z",
      slms: [
        {
          model_id: "dhs-slm-supply-chain-v5",
          display_name: "Supply Chain & Logistics Expert",
          ollama_model_name: "dhs-slm-supply-chain-v5",
          size_bytes: 1_820_000_000,
          created_at: "2026-06-11T14:00:00.000Z",
          last_used_at: "2026-07-08T10:22:00.000Z",
        },
      ],
    },
    {
      job_id: "demo-fin-001",
      project_name: "Financial Risk & Compliance",
      domain_label: "financial_risk",
      file_count: 22,
      corpus_size_bytes: 312_800_000,
      slm_size_bytes: 1_790_000_000,
      total_size_bytes: 2_102_800_000,
      created_at: "2026-06-12T11:00:00.000Z",
      slms: [
        {
          model_id: "dhs-slm-financial-risk-v4",
          display_name: "Financial Risk & Compliance Expert",
          ollama_model_name: "dhs-slm-financial-risk-v4",
          size_bytes: 1_790_000_000,
          created_at: "2026-06-13T09:30:00.000Z",
          last_used_at: "2026-07-07T16:45:00.000Z",
        },
      ],
    },
    {
      job_id: "demo-cx-001",
      project_name: "Customer Experience & Analytics",
      domain_label: "customer_experience",
      file_count: 9,
      corpus_size_bytes: 98_120_000,
      slm_size_bytes: 1_810_000_000,
      total_size_bytes: 1_908_120_000,
      created_at: "2026-06-14T08:30:00.000Z",
      slms: [
        {
          model_id: "dhs-slm-cx-analytics-v2",
          display_name: "Customer Experience Analyst",
          ollama_model_name: "dhs-slm-cx-analytics-v2",
          size_bytes: 1_810_000_000,
          created_at: "2026-06-15T10:00:00.000Z",
          last_used_at: "2026-07-06T11:20:00.000Z",
        },
      ],
    },
    {
      job_id: "demo-mfg-001",
      project_name: "Manufacturing & Quality Engineering",
      domain_label: "manufacturing_quality",
      file_count: 18,
      corpus_size_bytes: 243_600_000,
      slm_size_bytes: 1_800_000_000,
      total_size_bytes: 2_043_600_000,
      created_at: "2026-06-15T10:00:00.000Z",
      slms: [
        {
          model_id: "dhs-slm-manufacturing-v3",
          display_name: "Manufacturing Quality Engineer",
          ollama_model_name: "dhs-slm-manufacturing-v3",
          size_bytes: 1_800_000_000,
          created_at: "2026-06-16T14:30:00.000Z",
          last_used_at: "2026-07-08T08:15:00.000Z",
        },
      ],
    },
    {
      job_id: "demo-esg-001",
      project_name: "ESG & Sustainability",
      domain_label: "esg_sustainability",
      file_count: 11,
      corpus_size_bytes: 145_200_000,
      slm_size_bytes: 1_815_000_000,
      total_size_bytes: 1_960_200_000,
      created_at: "2026-06-17T09:15:00.000Z",
      slms: [
        {
          model_id: "dhs-slm-esg-v2",
          display_name: "ESG & Sustainability Analyst",
          ollama_model_name: "dhs-slm-esg-v2",
          size_bytes: 1_815_000_000,
          created_at: "2026-06-18T11:45:00.000Z",
          last_used_at: "2026-07-05T14:30:00.000Z",
        },
      ],
    },
  ],
  totals: {
    corpus_bytes: 987_263_210,
    slm_bytes: 9_035_000_000,
    total_bytes: 10_022_263_210,
  },
};
