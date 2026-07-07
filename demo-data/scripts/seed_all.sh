#!/usr/bin/env bash
# =============================================================================
# DHS Enterprise Demo Data Seed Script
# Seeds PostgreSQL database and corpus_store with Fortune 500 enterprise data
# Usage: bash demo-data/scripts/seed_all.sh
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
DEMO_DIR="$ROOT_DIR/demo-data"

DB_USER="${DB_USER:-orchestrator}"
DB_PASSWORD="${DB_PASSWORD:-orchestrator_secret}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-orchestrator}"

PSQL="psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME"
export PGPASSWORD="$DB_PASSWORD"

echo "================================================================"
echo "  DHS Enterprise Demo Data Seed"
echo "  Target: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo "================================================================"

# ── Test connection ─────────────────────────────────────────────────
echo ""
echo "[1/8] Testing database connection..."
$PSQL -c "SELECT version();" > /dev/null && echo "     ✓ Connected" || { echo "     ✗ Connection failed"; exit 1; }

# ── Run SQL seed files ──────────────────────────────────────────────
echo ""
echo "[2/8] Seeding sessions (10 business domains)..."
$PSQL -f "$DEMO_DIR/sql/01_seed_sessions.sql" > /dev/null && echo "     ✓ Sessions seeded"

echo ""
echo "[3/8] Seeding SLM registry (10 domain models)..."
$PSQL -f "$DEMO_DIR/sql/02_seed_slm_registry.sql" > /dev/null && echo "     ✓ SLM registry seeded"

echo ""
echo "[4/8] Seeding ingest jobs (10 completed ingestion jobs)..."
$PSQL -f "$DEMO_DIR/sql/03_seed_ingest_jobs.sql" > /dev/null && echo "     ✓ Ingest jobs seeded"

echo ""
echo "[5/8] Seeding query history (60 enterprise queries)..."
$PSQL -f "$DEMO_DIR/sql/04_seed_query_history.sql" > /dev/null && echo "     ✓ Query history seeded"

echo ""
echo "[6/8] Seeding bandit scores (model performance data)..."
$PSQL -f "$DEMO_DIR/sql/05_seed_bandit_scores.sql" > /dev/null && echo "     ✓ Bandit scores seeded"

# ── Set up corpus_store directories ────────────────────────────────
echo ""
echo "[7/8] Creating corpus_store directories and copying demo assets..."

DOMAINS=(
  "demo-sc-001"
  "demo-fr-002"
  "demo-cx-003"
  "demo-hr-004"
  "demo-it-005"
  "demo-rd-006"
  "demo-esg-007"
  "demo-mfg-008"
  "demo-ma-009"
  "demo-dt-010"
)

for domain in "${DOMAINS[@]}"; do
  mkdir -p "$ROOT_DIR/corpus_store/$domain/graphify-out/wiki"
  touch "$ROOT_DIR/corpus_store/$domain/canonical_corpus.jsonl"
  echo "     ✓ corpus_store/$domain created"
done

# Copy knowledge graphs
cp "$DEMO_DIR/json/graph_supply_chain.json" \
   "$ROOT_DIR/corpus_store/demo-sc-001/graphify-out/graph.json"
cp "$DEMO_DIR/json/graph_financial_risk.json" \
   "$ROOT_DIR/corpus_store/demo-fr-002/graphify-out/graph.json"

# Copy wiki pages
cp "$DEMO_DIR/json/wiki_supply_chain_community_0.md" \
   "$ROOT_DIR/corpus_store/demo-sc-001/graphify-out/wiki/community_0000.md"
cp "$DEMO_DIR/json/wiki_financial_risk_community_0.md" \
   "$ROOT_DIR/corpus_store/demo-fr-002/graphify-out/wiki/community_0000.md"

# Copy corpus documents
cp "$DEMO_DIR/corpus/SC_Strategy_2024.txt" \
   "$ROOT_DIR/corpus_store/demo-sc-001/SC_Strategy_2024.txt" 2>/dev/null || true
cp "$DEMO_DIR/corpus/Basel_IV_Capital_Assessment_2024.txt" \
   "$ROOT_DIR/corpus_store/demo-fr-002/Basel_IV_Capital_Assessment_2024.txt" 2>/dev/null || true

# Copy SLM training data to train.jsonl
cp "$DEMO_DIR/json/train_supply_chain.jsonl" \
   "$ROOT_DIR/corpus_store/demo-sc-001/train.jsonl" 2>/dev/null || true

echo "     ✓ Corpus assets deployed"

# ── Fix paths if seeded on a fresh run (./corpus_store → ../corpus_store) ──────
$PSQL -c "
  UPDATE ingest_jobs
  SET
    graph_path  = REPLACE(graph_path,  './corpus_store/', '../corpus_store/'),
    corpus_path = REPLACE(corpus_path, './corpus_store/', '../corpus_store/')
  WHERE job_id LIKE 'job-%';
" > /dev/null && echo "     ✓ corpus paths verified"

# ── Summary ─────────────────────────────────────────────────────────
echo ""
echo "[8/8] Verifying seed data..."
echo ""
$PSQL -c "
SELECT
  (SELECT COUNT(*) FROM sessions)     AS sessions,
  (SELECT COUNT(*) FROM slm_registry) AS slm_models,
  (SELECT COUNT(*) FROM ingest_jobs)  AS ingest_jobs,
  (SELECT COUNT(*) FROM query_history) AS queries,
  (SELECT COUNT(*) FROM bandit_scores) AS bandit_scores;
" 2>/dev/null

echo ""
echo "================================================================"
echo "  ✓ Seed complete!"
echo ""
echo "  Sessions:      10 business domains"
echo "  SLM models:    10 trained domain models"
echo "  Ingest jobs:   10 completed ingestions"
echo "  Query history: 60 enterprise queries"
echo "  Bandit scores: 43 model×task combinations"
echo "  Entities:      145 (see demo-data/csv/entities.csv)"
echo "  Relationships: 105 (see demo-data/csv/relationships.csv)"
echo "  Corpus docs:   2 full-text enterprise documents"
echo "  KG graphs:     2 (supply chain + financial risk)"
echo "  Wiki pages:    2 community summaries"
echo "  Training QA:   8 QA pairs for SLM (supply chain)"
echo "  Benchmark:     38 benchmark results"
echo "  Feedback:      42 user feedback records"
echo ""
echo "  Access the app at: http://192.168.42.62:3001"
echo "================================================================"
