"""Generate summary_report.json and report.html from pipeline results."""

from __future__ import annotations

import json
import logging
from collections import Counter
from pathlib import Path

import networkx as nx

from .models import Document, PipelineResult

logger = logging.getLogger(__name__)

# Palette for rejection reasons in the HTML chart
_REASON_COLORS = {
    "duplicate":       "#ef4444",
    "near_duplicate":  "#f97316",
    "low_quality":     "#eab308",
    "low_relevance":   "#8b5cf6",
    "wrong_language":  "#06b6d4",
    "load_error":      "#6b7280",
}


def build_report(
    docs: list[Document],
    graph: nx.Graph,
    duration_seconds: float,
    report_path: str,
    html_report_path: str = "output/report.html",
) -> PipelineResult:
    """Write summary_report.json and report.html.

    Args:
        docs: All pipeline documents.
        graph: Built co-occurrence graph.
        duration_seconds: Total pipeline wall-clock time.
        report_path: Path for JSON report.
        html_report_path: Path for HTML dashboard.

    Returns:
        PipelineResult for programmatic access.
    """
    accepted = [d for d in docs if d.accepted]
    rejected = [d for d in docs if not d.accepted]
    rejection_breakdown = dict(
        Counter(d.rejection_reason.value for d in rejected if d.rejection_reason)
    )

    communities = len({
        data.get("community_id", 0)
        for _, data in graph.nodes(data=True)
        if "community_id" in data
    })

    result = PipelineResult(
        total_loaded=len(docs),
        total_accepted=len(accepted),
        total_rejected=len(rejected),
        rejection_breakdown=rejection_breakdown,
        graph_nodes=graph.number_of_nodes(),
        graph_edges=graph.number_of_edges(),
        graph_communities=communities,
        duration_seconds=round(duration_seconds, 3),
    )

    # ── JSON report ───────────────────────────────────────────────────────────
    report: dict = {
        "pipeline_summary": result.model_dump(),
        "accepted_documents": [_doc_summary(d) for d in accepted],
        "rejected_documents": [_rejected_summary(d) for d in rejected],
        "graph": {
            "nodes": graph.number_of_nodes(),
            "edges": graph.number_of_edges(),
            "communities": communities,
            "top_nodes_by_pagerank": _top_nodes_pagerank(graph, n=10),
        },
    }
    out = Path(report_path)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
    logger.info("JSON report written to '%s'", out)

    # ── HTML dashboard ────────────────────────────────────────────────────────
    html = _render_html(result, accepted, rejected, graph)
    html_out = Path(html_report_path)
    html_out.parent.mkdir(parents=True, exist_ok=True)
    html_out.write_text(html, encoding="utf-8")
    logger.info("HTML report written to '%s'", html_out)

    return result


# ── HTML rendering ─────────────────────────────────────────────────────────────

def _render_html(
    result: PipelineResult,
    accepted: list[Document],
    rejected: list[Document],
    graph: nx.Graph,
) -> str:
    rejection_labels = json.dumps(list(result.rejection_breakdown.keys()))
    rejection_values = json.dumps(list(result.rejection_breakdown.values()))
    rejection_colors = json.dumps([
        _REASON_COLORS.get(k, "#888") for k in result.rejection_breakdown.keys()
    ])

    top_nodes = _top_nodes_pagerank(graph, n=10)
    node_labels = json.dumps([n["node"] for n in top_nodes])
    node_scores = json.dumps([round(n["pagerank"] * 100, 2) for n in top_nodes])

    accepted_rows = "\n".join(
        f"""<tr>
              <td title="{d.source_path}">{Path(d.source_path).name}</td>
              <td>{d.language or '—'}</td>
              <td>{d.quality.token_count if d.quality else '—'}</td>
              <td><div class="bar-cell"><div class="bar" style="width:{min(d.quality.score*100,100):.0f}%"></div>
                  <span>{d.quality.score:.2f}</span></div></td>
              <td><div class="bar-cell"><div class="bar bar-purple" style="width:{min(d.relevance_score*100,100):.0f}%"></div>
                  <span>{d.relevance_score:.2f}</span></div></td>
            </tr>"""
        for d in accepted
    )

    rejected_rows = "\n".join(
        f"""<tr>
              <td title="{d.source_path}">{Path(d.source_path).name}</td>
              <td><span class="badge" style="background:{_REASON_COLORS.get(d.rejection_reason.value,'#888') if d.rejection_reason else '#888'}">{d.rejection_reason.value if d.rejection_reason else '—'}</span></td>
              <td class="detail-cell">{d.rejection_detail}</td>
            </tr>"""
        for d in rejected
    )

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Graphify — Pipeline Report</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
<style>
  *{{box-sizing:border-box;margin:0;padding:0}}
  body{{font-family:'Segoe UI',Inter,Arial,sans-serif;background:#070d1a;color:#dde3f0;min-height:100vh;padding:0 0 60px}}
  .topbar{{background:linear-gradient(90deg,#0d1b2a,#1b2a4a);padding:14px 32px;display:flex;align-items:center;gap:16px;box-shadow:0 2px 12px rgba(0,0,0,.6)}}
  .topbar h1{{font-size:20px;font-weight:700;color:#90e0ef;letter-spacing:1px}}
  .topbar .sub{{font-size:12px;color:#4a6a8a;margin-left:auto}}
  .container{{max-width:1200px;margin:0 auto;padding:32px 24px 0}}
  /* stat cards */
  .cards{{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px}}
  .card{{background:#0d1b2e;border:1px solid #1a2f4a;border-radius:12px;padding:20px 24px}}
  .card .val{{font-size:36px;font-weight:700;color:#90e0ef;line-height:1}}
  .card .lbl{{font-size:12px;color:#4a7a9a;margin-top:6px;text-transform:uppercase;letter-spacing:1px}}
  .card.green .val{{color:#4caf79}}
  .card.red .val{{color:#ef4444}}
  .card.yellow .val{{color:#f9c74f}}
  /* charts row */
  .charts{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:32px}}
  .chart-box{{background:#0d1b2e;border:1px solid #1a2f4a;border-radius:12px;padding:24px}}
  .chart-box h2{{font-size:14px;font-weight:600;color:#8aa4c0;margin-bottom:20px;text-transform:uppercase;letter-spacing:1px}}
  .chart-wrap{{position:relative;height:220px}}
  /* tables */
  .section{{background:#0d1b2e;border:1px solid #1a2f4a;border-radius:12px;padding:24px;margin-bottom:24px}}
  .section h2{{font-size:14px;font-weight:600;color:#8aa4c0;margin-bottom:18px;text-transform:uppercase;letter-spacing:1px}}
  table{{width:100%;border-collapse:collapse;font-size:13px}}
  th{{text-align:left;color:#4a7a9a;font-weight:600;padding:8px 12px;border-bottom:1px solid #1a2f4a;font-size:11px;text-transform:uppercase;letter-spacing:.8px}}
  td{{padding:10px 12px;border-bottom:1px solid #0f1f30;color:#b0c4d8;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
  tr:hover td{{background:#0f2035}}
  .badge{{display:inline-block;padding:2px 10px;border-radius:10px;font-size:11px;font-weight:600;color:#fff}}
  .bar-cell{{display:flex;align-items:center;gap:8px}}
  .bar{{height:6px;border-radius:3px;background:#1f6feb;min-width:2px}}
  .bar-purple{{background:#7c3aed}}
  .bar-cell span{{font-size:12px;color:#7a9ab8;white-space:nowrap}}
  .detail-cell{{color:#4a6a8a!important;font-size:12px;white-space:normal!important;max-width:400px}}
</style>
</head>
<body>
<div class="topbar">
  <h1>&#9741; Graphify — Pipeline Report</h1>
  <span class="sub">Duration: {result.duration_seconds}s &nbsp;|&nbsp; {result.total_loaded} files processed</span>
</div>
<div class="container">

  <!-- Stat cards -->
  <div class="cards">
    <div class="card"><div class="val">{result.total_loaded}</div><div class="lbl">Total Loaded</div></div>
    <div class="card green"><div class="val">{result.total_accepted}</div><div class="lbl">Accepted</div></div>
    <div class="card red"><div class="val">{result.total_rejected}</div><div class="lbl">Rejected</div></div>
    <div class="card yellow"><div class="val">{result.graph_nodes}</div><div class="lbl">Graph Nodes &nbsp;({result.graph_communities} communities)</div></div>
  </div>

  <!-- Charts -->
  <div class="charts">
    <div class="chart-box">
      <h2>Rejection Breakdown</h2>
      <div class="chart-wrap"><canvas id="rejChart"></canvas></div>
    </div>
    <div class="chart-box">
      <h2>Top Nodes by PageRank</h2>
      <div class="chart-wrap"><canvas id="prChart"></canvas></div>
    </div>
  </div>

  <!-- Accepted docs table -->
  <div class="section">
    <h2>Accepted Documents ({result.total_accepted})</h2>
    <table>
      <thead><tr><th>File</th><th>Language</th><th>Tokens</th><th>Quality Score</th><th>Relevance Score</th></tr></thead>
      <tbody>{accepted_rows}</tbody>
    </table>
  </div>

  <!-- Rejected docs table -->
  <div class="section">
    <h2>Rejected Documents ({result.total_rejected})</h2>
    <table>
      <thead><tr><th>File</th><th>Reason</th><th>Detail</th></tr></thead>
      <tbody>{rejected_rows}</tbody>
    </table>
  </div>

</div>

<script>
const chartDefaults = {{
  color: '#8aa4c0',
  plugins: {{ legend: {{ labels: {{ color: '#8aa4c0', font: {{ size: 12 }} }} }} }},
}};

// Rejection pie
new Chart(document.getElementById('rejChart'), {{
  type: 'doughnut',
  data: {{
    labels: {rejection_labels},
    datasets: [{{ data: {rejection_values}, backgroundColor: {rejection_colors}, borderWidth: 0 }}]
  }},
  options: {{
    ...chartDefaults,
    cutout: '60%',
    plugins: {{
      legend: {{ position: 'right', labels: {{ color: '#8aa4c0', font: {{ size: 12 }}, padding: 12 }} }}
    }}
  }}
}});

// PageRank bar
new Chart(document.getElementById('prChart'), {{
  type: 'bar',
  data: {{
    labels: {node_labels},
    datasets: [{{
      data: {node_scores},
      backgroundColor: 'rgba(0,180,216,0.6)',
      borderColor: '#00b4d8',
      borderWidth: 1,
      borderRadius: 4,
    }}]
  }},
  options: {{
    ...chartDefaults,
    indexAxis: 'y',
    plugins: {{ legend: {{ display: false }} }},
    scales: {{
      x: {{ ticks: {{ color: '#4a7a9a' }}, grid: {{ color: '#0f2035' }} }},
      y: {{ ticks: {{ color: '#8aa4c0' }}, grid: {{ color: '#0f2035' }} }}
    }}
  }}
}});
</script>
</body>
</html>"""


# ── Helpers ────────────────────────────────────────────────────────────────────

def _doc_summary(doc: Document) -> dict:
    return {
        "doc_id": doc.doc_id,
        "source": doc.source_path,
        "language": doc.language,
        "token_count": doc.quality.token_count if doc.quality else None,
        "quality_score": doc.quality.score if doc.quality else None,
        "relevance_score": doc.relevance_score,
        "num_chunks": len(doc.chunks),
    }


def _rejected_summary(doc: Document) -> dict:
    return {
        "doc_id": doc.doc_id,
        "source": doc.source_path,
        "reason": doc.rejection_reason.value if doc.rejection_reason else None,
        "detail": doc.rejection_detail,
    }


def _top_nodes_pagerank(G: nx.Graph, n: int) -> list[dict]:
    if G.number_of_nodes() == 0:
        return []
    by_pr = sorted(
        ((node, data.get("pagerank", 0.0)) for node, data in G.nodes(data=True)),
        key=lambda x: x[1],
        reverse=True,
    )[:n]
    return [{"node": node, "pagerank": round(pr, 6)} for node, pr in by_pr]
