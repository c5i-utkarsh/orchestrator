"""
Schema Enricher — pre-graphify step for structured data (CSV/Excel/Parquet).

Problem: graphify does spaCy NER on prose text.  Structured files produce
column names like ADJSTD_DMND_QTY_WK4_FCST which graphify cannot interpret.
Result: meaningless wiki articles and an orchestrator that can't map business
language to actual column names.

Solution: For each structured file in the corpus, this module:
  1. Expands cryptic column names using an abbreviation dictionary + LLM
  2. Samples representative values to infer data type, range, and role
  3. Cross-references unstructured docs in the same corpus for term matches
  4. Writes a human-readable .md wiki article per table into graphify-out/wiki/
     in exactly the same format graphify already produces — no downstream changes.

The articles declare a "prerequisite" relationship (Karpathy Zero-to-Hero style):
  metrics articles link to dimension articles that explain the key columns.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

# ─── Abbreviation dictionary (common ERP / WMS / CRM / supply-chain patterns) ──
_ABBR: dict[str, str] = {
    # Demand / forecasting
    "ADJSTD": "Adjusted", "DMND": "Demand", "FCST": "Forecast",
    "PRJCTD": "Projected", "UNCNSTND": "Unconstrained", "CNSTND": "Constrained",
    "CNSMPTN": "Consumption", "HIST": "Historical", "WGHTD": "Weighted",
    # Quantities / metrics
    "QTY": "Quantity", "AMT": "Amount", "VAL": "Value", "PCT": "Percentage",
    "CNT": "Count", "TOT": "Total", "AVG": "Average", "MIN": "Minimum",
    "MAX": "Maximum", "SUM": "Sum", "DIFF": "Difference", "DELTA": "Change",
    # Time
    "DT": "Date", "TS": "Timestamp", "WK": "Week", "MTH": "Month",
    "QTR": "Quarter", "YR": "Year", "YTD": "Year-to-Date", "MTD": "Month-to-Date",
    "LY": "Last Year", "CY": "Current Year", "PREV": "Previous", "CURR": "Current",
    "PRIO": "Prior", "FWRD": "Forward", "BKWD": "Backward",
    # Supply chain
    "PO": "Purchase Order", "SO": "Sales Order", "DO": "Delivery Order",
    "GR": "Goods Receipt", "GI": "Goods Issue", "STO": "Stock Transfer Order",
    "RCPT": "Receipt", "SHPMNT": "Shipment", "DLVRY": "Delivery",
    "TRNSIT": "Transit", "LT": "Lead Time", "MOQ": "Minimum Order Quantity",
    "EOQ": "Economic Order Quantity", "ROP": "Reorder Point",
    "SS": "Safety Stock", "DOH": "Days On Hand", "DOS": "Days Of Supply",
    "OTD": "On-Time Delivery", "OTIF": "On-Time In-Full", "FILL": "Fill Rate",
    "INV": "Inventory", "STK": "Stock", "WHS": "Warehouse", "LOC": "Location",
    "BIN": "Storage Bin", "PLNT": "Plant", "SLOC": "Storage Location",
    # People / org
    "VNDOR": "Vendor", "CUST": "Customer", "CSTMR": "Customer",
    "EMPL": "Employee", "MGR": "Manager", "ORG": "Organization",
    "DIV": "Division", "REG": "Region", "TERR": "Territory",
    # Product
    "SKU": "Stock Keeping Unit", "UPC": "Universal Product Code",
    "EAN": "European Article Number", "PROD": "Product", "ITM": "Item",
    "CAT": "Category", "SUBCAT": "Sub-Category", "BRAND": "Brand",
    "UOM": "Unit of Measure", "PACK": "Pack Size", "WT": "Weight",
    "VOL": "Volume", "DIM": "Dimension",
    # Status / type flags
    "CD": "Code", "ID": "Identifier", "NM": "Name", "DESC": "Description",
    "TYP": "Type", "STS": "Status", "FLG": "Flag", "IND": "Indicator",
    "PRMRY": "Primary", "SCNDRY": "Secondary", "DFLT": "Default",
    "ACTV": "Active", "INACTV": "Inactive", "DLTD": "Deleted",
    "APRVD": "Approved", "PNDNG": "Pending", "CNCLD": "Cancelled",
    # Finance / costing
    "COGS": "Cost of Goods Sold", "GP": "Gross Profit", "GM": "Gross Margin",
    "REV": "Revenue", "COST": "Cost", "PRC": "Price", "DSCNT": "Discount",
    "TAX": "Tax", "CURR": "Currency", "FX": "Foreign Exchange",
    "GL": "General Ledger", "AP": "Accounts Payable", "AR": "Accounts Receivable",
    # Systems / integrations
    "ERP": "Enterprise Resource Planning", "WMS": "Warehouse Management System",
    "TMS": "Transportation Management System", "CRM": "Customer Relationship Management",
    "SAP": "SAP", "SFDC": "Salesforce", "MDM": "Master Data Management",
    "ETL": "Extract Transform Load", "API": "API", "EDI": "Electronic Data Interchange",
}

_WORD_RE = re.compile(r"[A-Z0-9]+|[a-z0-9]+")


def expand_column_name(col: str) -> str:
    """
    Turn ADJSTD_DMND_QTY_WK4_FCST → Adjusted Demand Quantity Week 4 Forecast
    Handles: ALL_CAPS_UNDERSCORE, camelCase, PascalCase, mixed.
    """
    # Split on underscores first, then camelCase boundaries
    parts: list[str] = []
    for chunk in col.split("_"):
        # Split camelCase: e.g. AdjustedDmnd → ['Adjusted', 'Dmnd']
        sub = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", chunk)
        sub = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", sub)
        for token in sub.split():
            upper = token.upper()
            # Check abbreviation dict
            if upper in _ABBR:
                parts.append(_ABBR[upper])
            # Check trailing digit: WK4 → Week 4
            elif re.match(r"^[A-Z]+\d+$", token):
                word = re.match(r"^([A-Z]+)", token).group(1)
                num = re.search(r"(\d+)$", token).group(1)
                parts.append(_ABBR.get(word, word.title()) + " " + num)
            else:
                parts.append(token.title())
    result = " ".join(parts)
    return result


def _infer_column_role(col: str, values: list[Any]) -> str:
    """Guess whether the column is a metric, dimension, flag, or date."""
    col_u = col.upper()
    numeric = sum(1 for v in values if _is_numeric(v))
    if any(k in col_u for k in ("DT", "DATE", "TS", "TIME", "YR", "MTH", "WK")):
        return "date/time"
    if any(k in col_u for k in ("FLG", "IND", "FLAG", "BOOL", "YN")):
        return "flag"
    if any(k in col_u for k in ("CD", "CODE", "ID", "KEY", "NM", "NAME", "DESC")):
        return "dimension"
    if numeric / max(len(values), 1) > 0.7:
        return "metric"
    unique = len(set(str(v) for v in values))
    if unique / max(len(values), 1) < 0.3:
        return "category"
    return "dimension"


def _is_numeric(val: Any) -> bool:
    try:
        float(str(val).replace(",", ""))
        return True
    except (ValueError, TypeError):
        return False


def _sample_values(series: Any, n: int = 8) -> list[Any]:
    """Get up to n non-null unique representative values from a pandas Series."""
    try:
        non_null = series.dropna()
        unique_vals = non_null.unique()
        sampled = unique_vals[:n].tolist()
        return [v for v in sampled if str(v).strip() not in ("", "nan", "None")]
    except Exception:
        return []


def _find_term_in_unstructured(term: str, unstructured_texts: list[str], max_chars: int = 200) -> str:
    """Search unstructured docs for a term and return a short excerpt."""
    term_lower = term.lower()
    for text in unstructured_texts:
        idx = text.lower().find(term_lower)
        if idx != -1:
            start = max(0, idx - 60)
            end = min(len(text), idx + 140)
            return "…" + text[start:end].strip() + "…"
    return ""


def _build_wiki_md(
    table_name: str,
    enriched_columns: list[dict],
    row_count: int,
    doc_excerpt: str,
) -> str:
    """Render a wiki .md article in the same format as graphify_runner produces."""
    lines = [f"# {table_name} — Data Schema"]
    lines.append("")

    # Summary passage (> quoted, same as graphify format)
    metric_cols = [c for c in enriched_columns if c["role"] == "metric"]
    dim_cols = [c for c in enriched_columns if c["role"] in ("dimension", "category")]
    date_cols = [c for c in enriched_columns if c["role"] == "date/time"]

    summary = (
        f"The {table_name} table contains {row_count:,} records with "
        f"{len(metric_cols)} metric columns, {len(dim_cols)} dimension/category columns"
        + (f", and {len(date_cols)} date columns" if date_cols else "")
        + "."
    )
    lines.append(f"> {summary}")
    if doc_excerpt:
        lines.append(f"> Context from corpus: {doc_excerpt}")
    lines.append("")

    # Column glossary table
    lines.append("## Column Glossary")
    lines.append("")
    lines.append("| Column Name | Human-Readable Name | Role | Sample Values |")
    lines.append("|---|---|---|---|")
    for col in enriched_columns:
        samples = ", ".join(str(v) for v in col["samples"][:4])
        lines.append(f"| `{col['original']}` | {col['expanded']} | {col['role']} | {samples} |")
    lines.append("")

    # Entity sections (mirrors graphify format so existing wiki reader works)
    if metric_cols:
        metrics_str = ", ".join(c["expanded"] for c in metric_cols[:12])
        lines.append(f"**Metrics:** {metrics_str}")
    if dim_cols:
        dims_str = ", ".join(c["expanded"] for c in dim_cols[:12])
        lines.append(f"**Dimensions:** {dims_str}")
    if date_cols:
        dates_str = ", ".join(c["expanded"] for c in date_cols[:6])
        lines.append(f"**Date columns:** {dates_str}")
    lines.append("")

    # LLM-enriched description block (populated later if available)
    lines.append("## Business Context")
    lines.append("")
    lines.append("_[Auto-generated from column analysis and corpus cross-reference]_")
    lines.append("")

    return "\n".join(lines)


class SchemaEnricher:
    """
    Pre-graphify enrichment for structured files.

    Usage in ingest_task.py:
        enricher = SchemaEnricher(corpus_dir, adapter_registry)
        await enricher.run(docs)   # writes .md files, returns stats
    """

    STRUCTURED_EXTENSIONS = {".csv", ".parquet", ".xlsx", ".xls"}

    def __init__(self, corpus_dir: str, adapter_registry=None):
        self.corpus_dir = Path(corpus_dir)
        self._registry = adapter_registry  # may be None (rule-based fallback)
        self._wiki_dir = self.corpus_dir / "graphify-out" / "wiki"
        self._wiki_dir.mkdir(parents=True, exist_ok=True)

    async def run(
        self,
        docs: list,  # CanonicalDocument list from Ingester
        progress_callback=None,
    ) -> dict:
        """
        Scan corpus_dir for structured files, enrich schemas, write wiki .md files.
        Returns {tables_enriched, columns_processed, skipped}.
        """
        structured_files = [
            p for p in self.corpus_dir.rglob("*")
            if p.suffix.lower() in self.STRUCTURED_EXTENSIONS
        ]
        if not structured_files:
            return {"tables_enriched": 0, "columns_processed": 0, "skipped": 0}

        # Collect unstructured text from corpus for cross-referencing
        unstructured_texts = [
            d.text for d in docs
            if hasattr(d, "metadata") and d.metadata.get("type") not in ("csv", "parquet", "xlsx")
            and len(d.text) > 100
        ]

        tables_enriched = 0
        columns_processed = 0
        skipped = 0

        for i, file_path in enumerate(structured_files):
            if progress_callback:
                await progress_callback(
                    int((i / len(structured_files)) * 100),
                    f"Enriching schema: {file_path.name}",
                )
            try:
                result = await self._enrich_file(file_path, unstructured_texts)
                tables_enriched += result["tables"]
                columns_processed += result["columns"]
            except Exception as exc:
                skipped += 1
                # Write a minimal placeholder article so the wiki is not empty
                placeholder = f"# {file_path.stem} — Data File\n\n> Schema extraction failed: {exc}\n"
                out_path = self._wiki_dir / f"schema_{file_path.stem[:40]}.md"
                out_path.write_text(placeholder, encoding="utf-8")

        if progress_callback:
            await progress_callback(100, f"Schema enrichment complete: {tables_enriched} tables")

        return {
            "tables_enriched": tables_enriched,
            "columns_processed": columns_processed,
            "skipped": skipped,
        }

    async def _enrich_file(self, file_path: Path, unstructured_texts: list[str]) -> dict:
        import pandas as pd

        # Load file into DataFrames (one per sheet for Excel, one for CSV/Parquet)
        if file_path.suffix.lower() == ".csv":
            dfs = {file_path.stem: pd.read_csv(file_path, nrows=500, low_memory=False)}
        elif file_path.suffix.lower() == ".parquet":
            dfs = {file_path.stem: pd.read_parquet(file_path).head(500)}
        else:
            xls = pd.ExcelFile(file_path)
            dfs = {
                sheet: xls.parse(sheet, nrows=500)
                for sheet in xls.sheet_names[:5]  # max 5 sheets
            }

        tables = 0
        columns = 0

        for table_name, df in dfs.items():
            if df.empty or len(df.columns) == 0:
                continue

            enriched_cols = []
            for col in df.columns:
                col_str = str(col)
                expanded = expand_column_name(col_str)
                samples = _sample_values(df[col])
                role = _infer_column_role(col_str, samples)
                enriched_cols.append({
                    "original": col_str,
                    "expanded": expanded,
                    "role": role,
                    "samples": samples,
                    "llm_desc": "",
                })
                columns += 1

            # Cross-reference with unstructured docs using both the original
            # and expanded column name (pick first match)
            doc_excerpt = ""
            for col_info in enriched_cols[:5]:  # top 5 columns only
                excerpt = _find_term_in_unstructured(
                    col_info["expanded"].split()[0],  # first meaningful word
                    unstructured_texts,
                )
                if excerpt:
                    doc_excerpt = excerpt
                    break

            # Optional LLM enrichment — describe the table in plain English
            if self._registry:
                try:
                    teacher_info = await self._registry.get_best_local_model()
                    if teacher_info:
                        import asyncio
                        prompt = self._build_llm_prompt(table_name, enriched_cols, doc_excerpt)
                        llm_response = await asyncio.wait_for(
                            self._registry.generate(
                                teacher_info.model_id, prompt, temperature=0.3
                            ),
                            timeout=25.0,  # cap per-table LLM call — prevents pipeline stall
                        )
                        # Try to parse column descriptions from LLM response
                        enriched_cols = self._apply_llm_descriptions(enriched_cols, llm_response)
                except Exception:
                    pass  # LLM enrichment is non-fatal; rule-based output still written

            md_content = _build_wiki_md(
                table_name,
                enriched_cols,
                row_count=len(df),
                doc_excerpt=doc_excerpt,
            )

            # Write with a deterministic name that won't clash with graphify community files
            safe_name = re.sub(r"[^\w]", "_", table_name)[:50]
            out_path = self._wiki_dir / f"schema_{safe_name}.md"
            out_path.write_text(md_content, encoding="utf-8")
            tables += 1

        return {"tables": tables, "columns": columns}

    def _build_llm_prompt(
        self, table_name: str, cols: list[dict], doc_excerpt: str
    ) -> str:
        col_lines = "\n".join(
            f"  - {c['original']} (expanded: {c['expanded']}, role: {c['role']}, "
            f"samples: {c['samples'][:3]})"
            for c in cols[:20]  # cap at 20 to stay within context window
        )
        excerpt_section = f"\nRelated corpus excerpt:\n  {doc_excerpt}" if doc_excerpt else ""
        return (
            f"You are a data analyst enriching a schema glossary.\n"
            f"Table: {table_name}\n"
            f"Columns:\n{col_lines}"
            f"{excerpt_section}\n\n"
            f"For each column, provide a 1-sentence business description.\n"
            f"Output ONLY a JSON object where keys are exact column names "
            f"and values are description strings. No other text."
        )

    def _apply_llm_descriptions(self, cols: list[dict], llm_response: str) -> list[dict]:
        """Parse LLM JSON response and apply descriptions to enriched_cols."""
        try:
            match = re.search(r"\{.*\}", llm_response, re.DOTALL)
            if not match:
                return cols
            descriptions: dict[str, str] = json.loads(match.group())
            for col in cols:
                desc = descriptions.get(col["original"], "")
                if desc:
                    col["llm_desc"] = desc
        except Exception:
            pass
        return cols
