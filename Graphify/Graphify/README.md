# Graphify — Data Readiness and Curation Engine

A production-style local pipeline that takes a raw mixed corpus of files and produces:
- A **curated corpus** (accepted documents)
- A **rejected corpus** with reasons (manifest JSON)
- A **graph-ready artifact** (co-occurrence graph in JSON and GraphML)
- A **summary report** (JSON)

---

## Directory Structure

```
Graphify/
├── config.json                  # Pipeline configuration
├── requirements.txt
├── run_pipeline.py              # CLI entry point
│
├── data_engine/                 # Core package
│   ├── __init__.py
│   ├── models.py                # Pydantic domain models
│   ├── logging_config.py        # Centralised logging setup
│   ├── loader.py                # File discovery and loading
│   ├── text_utils.py            # Normalisation and tokenisation
│   ├── dedup.py                 # Exact + near-duplicate detection
│   ├── quality.py               # Heuristic quality scoring
│   ├── contamination.py         # Relevance / contamination scoring
│   ├── curator.py               # Write curated and rejected outputs
│   ├── graph_builder.py         # Keyword/entity co-occurrence graph
│   ├── report.py                # Summary report generation
│   └── main.py                  # Pipeline orchestrator
│
├── data/
│   ├── raw/                     # Drop input files here
│   ├── curated/                 # Accepted documents (written by pipeline)
│   ├── rejected/                # Rejected documents + rejection_manifest.json
│   └── graph/                   # graph.json, graph.graphml
│
└── output/
    ├── pipeline.log
    └── summary_report.json
```

---

## Setup

```bash
# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate       # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Download spaCy model (required for NER-augmented graph building)
python -m spacy download en_core_web_sm
```

> To enable PDF support, also run: `pip install PyMuPDF` and set `"enable_pdf": true` in `config.json`.

---

## Running the Pipeline

```bash
python run_pipeline.py
# or with a custom config:
python run_pipeline.py --config path/to/my_config.json
```

---

## Pipeline Stages

| Stage | Module | What it does |
|-------|--------|--------------|
| 1 | `loader.py` | Discover and load `.txt`, `.md`, `.json` (optionally `.pdf`) |
| 2 | `text_utils.py` | Unicode normalisation, URL stripping, whitespace collapse |
| 3 | `dedup.py` | SHA-256 exact dedup + Jaro-Winkler near-duplicate detection |
| 4 | `quality.py` | Token count, avg word length, symbol ratio, alpha ratio gates |
| 5 | `contamination.py` | Seed-term coverage relevance scoring |
| 6 | `curator.py` | Write accepted/rejected corpora + rejection manifest |
| 7 | `graph_builder.py` | Keyword + NER entity co-occurrence graph (NetworkX) |
| 8 | `report.py` | `summary_report.json` with full pipeline statistics |

---

## Configuration

All behaviour is driven by `config.json`. Key sections:

```json
{
  "dedup": {
    "similarity_threshold": 0.85   // Jaro-Winkler threshold for near-dup
  },
  "quality": {
    "min_token_count": 20,         // Reject documents shorter than this
    "min_alpha_ratio": 0.5         // Reject if less than 50% alphabetic chars
  },
  "contamination": {
    "seed_terms": ["machine learning", "graph", ...],
    "min_relevance_score": 0.05    // Reject if fewer than 5% of seed terms match
  },
  "graph": {
    "top_n_keywords": 20,
    "min_edge_weight": 2,
    "use_spacy_entities": true
  }
}
```

---

## Outputs

| File | Description |
|------|-------------|
| `data/curated/*.txt` | One file per accepted document |
| `data/rejected/*.txt` | One file per rejected document |
| `data/rejected/rejection_manifest.json` | Rejection reason + detail per doc |
| `data/graph/graph.json` | Node-link JSON (NetworkX format) |
| `data/graph/graph.graphml` | GraphML for Gephi / Cytoscape |
| `output/summary_report.json` | Full pipeline statistics |
| `output/pipeline.log` | Structured log of the run |
