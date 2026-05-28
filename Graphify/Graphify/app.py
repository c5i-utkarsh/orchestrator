"""Flask web UI — Data Injection + Graphify pipeline."""

from __future__ import annotations

import json
import shutil
import traceback
from pathlib import Path
from werkzeug.utils import secure_filename
from flask import (Flask, render_template_string, request, jsonify,
                   send_file, Response, stream_with_context)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 100 * 1024 * 1024  # 100 MB

BASE_DIR    = Path(__file__).parent
CONFIG      = BASE_DIR / "config.json"
RAW_DIR     = BASE_DIR / "data" / "raw"
REPORT_HTML = BASE_DIR / "output" / "report.html"
GRAPH_HTML  = BASE_DIR / "output" / "graph_viz.html"

ALLOWED_EXT = {".txt", ".md", ".json", ".pdf", ".docx", ".xlsx", ".csv"}

# ── HTML template ──────────────────────────────────────────────────────────────
_TEMPLATE = r"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Graphify — AI Data Engine</title>
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#0e0e14;--bg2:#13131c;--bg3:#1a1a28;--bg4:#20202f;
  --card:#181825;--card2:#1e1e2e;--border:#2a2a3d;--border2:#35354f;
  --t1:#e8e6f0;--t2:#9390b0;--t3:#5c5a78;
  --accent:#7c6af8;--accent2:#9d8eff;--accdim:rgba(124,106,248,.1);
  --teal:#2dd4a0;--teallt:rgba(45,212,160,.1);--tealbdr:rgba(45,212,160,.3);
  --green:#4ade80;--greenlt:rgba(74,222,128,.1);--greenbdr:rgba(74,222,128,.3);
  --amber:#fbbf24;--amberlt:rgba(251,191,36,.1);--amberbdr:rgba(251,191,36,.3);
  --coral:#fb7185;--corallt:rgba(251,113,133,.1);--coralbdr:rgba(251,113,133,.3);
  --purple:#a78bfa;--blue:#60a5fa;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Sora','Segoe UI',sans-serif;background:var(--bg);color:var(--t1);font-size:13px;min-height:100vh}

/* ── TOPBAR ── */
.topbar{position:fixed;top:0;left:0;right:0;z-index:200;height:54px;
  background:rgba(14,14,20,.96);backdrop-filter:blur(16px);
  border-bottom:1px solid var(--border);
  display:flex;align-items:center;padding:0 32px;gap:4px}
.brand{font-size:17px;font-weight:700;color:var(--t1);margin-right:20px;
  display:flex;align-items:center;gap:10px;white-space:nowrap}
.brand-mark{width:28px;height:28px;background:var(--accent);border-radius:8px;
  display:flex;align-items:center;justify-content:center}
.tab{padding:7px 16px;border-radius:20px;cursor:pointer;font-size:12px;font-weight:600;
  color:var(--t3);border:1px solid transparent;background:none;font-family:inherit;
  transition:all .15s;white-space:nowrap}
.tab:hover{color:var(--t2);background:var(--bg3)}
.tab.on{background:var(--accent);color:#fff;border-color:var(--accent)}
.tab.done{color:var(--accent);border-color:var(--border2);background:var(--accdim)}
.nav-right{margin-left:auto;display:flex;align-items:center;gap:10px}
.live-pill{font-size:11px;color:var(--teal);background:var(--teallt);
  border:1px solid var(--tealbdr);padding:4px 10px;border-radius:10px;font-weight:600}

/* ── PAGES ── */
.page{display:none;padding:82px 0 60px;min-height:100vh}
.page.on{display:block}
.inner{max-width:1100px;margin:0 auto;padding:0 32px}

/* ── PAGE HEADER ── */
.ph{background:var(--card);border-bottom:1px solid var(--border);padding:22px 0 16px;margin-bottom:24px}
.ph-label{font-size:10px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;
  color:var(--t3);margin-bottom:4px;display:flex;align-items:center;gap:7px}
.ph-label::before{content:'';width:16px;height:1px;background:var(--accent);display:inline-block}
.ph-title{font-size:22px;font-weight:600;color:var(--t1)}
.ph-sub{font-size:12px;color:var(--t2);margin-top:4px}

/* ── SOURCE TABS ── */
.src-tabs{display:flex;gap:8px;margin-bottom:16px}
.src-tab{padding:7px 16px;border-radius:8px;border:1px solid var(--border);
  background:var(--card2);color:var(--t3);font-size:12px;font-weight:500;
  cursor:pointer;font-family:inherit;transition:all .15s}
.src-tab.on{border-color:var(--accent);color:var(--accent);background:var(--accdim)}

/* ── UPLOAD ZONE ── */
.upload-zone{border:1.5px dashed var(--border2);border-radius:12px;padding:28px 20px;
  text-align:center;cursor:pointer;background:var(--card);transition:all .2s}
.upload-zone:hover,.upload-zone.drag{border-color:var(--accent);background:rgba(124,106,248,.05)}
.upload-zone input{display:none}
.upload-icon{width:40px;height:40px;background:var(--bg4);border:1px solid var(--border);
  border-radius:9px;display:flex;align-items:center;justify-content:center;margin:0 auto 10px}
.upload-zone p{font-size:12px;color:var(--t2)}
.upload-zone p span{color:var(--accent)}
.upload-zone small{font-size:10px;color:var(--t3);margin-top:4px;display:block}

/* ── DB PANEL ── */
.db-panel{background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.db-head{display:flex;align-items:center;gap:10px;padding:14px 18px;
  background:var(--card2);border-bottom:1px solid var(--border);cursor:pointer;user-select:none}
.db-head:hover{background:var(--bg4)}
.db-head-icon{width:28px;height:28px;background:rgba(96,165,250,.1);
  border:1px solid rgba(96,165,250,.3);border-radius:7px;
  display:flex;align-items:center;justify-content:center}
.db-title{font-size:12px;font-weight:600;color:var(--t1)}
.db-sub{font-size:10px;color:var(--t3)}
.db-body{padding:18px;display:none}
.db-body.open{display:block}
.db-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px}
.fld{display:flex;flex-direction:column;gap:4px}
.fld label{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--t3)}
.fld input,.fld select{background:var(--bg3);border:1px solid var(--border2);border-radius:8px;
  padding:9px 12px;font-size:12px;color:var(--t1);font-family:inherit;outline:none;transition:border-color .2s}
.fld input:focus,.fld select:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(124,106,248,.1)}
.fld select option{background:var(--bg3)}
.db-actions{display:flex;gap:8px;align-items:center}
.db-status-txt{font-size:11px;color:var(--t3)}
.db-status-txt.ok{color:var(--green)}
.db-status-txt.err{color:var(--coral)}
.db-chips{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px;padding-top:14px;border-top:1px solid var(--border)}
.db-chip{display:flex;align-items:center;gap:6px;padding:5px 10px;background:var(--bg4);
  border:1px solid var(--border);border-radius:8px;font-size:10px;font-weight:500;color:var(--t2)}
.db-chip.ok{border-color:var(--greenbdr);color:var(--green);background:var(--greenlt)}
.db-chip-dot{width:6px;height:6px;border-radius:50%;background:var(--t3);flex-shrink:0}
.db-chip.ok .db-chip-dot{background:var(--green)}

/* ── BUTTONS ── */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;
  padding:8px 18px;border-radius:8px;font-size:12px;font-weight:500;cursor:pointer;
  border:1px solid var(--border2);background:var(--card2);color:var(--t1);
  font-family:inherit;transition:all .15s;white-space:nowrap}
.btn:hover{background:var(--bg4)}
.btn-p{background:var(--accent);color:#fff;border-color:var(--accent)}
.btn-p:hover{background:var(--accent2)}
.btn-teal{background:var(--teallt);color:var(--teal);border-color:var(--tealbdr)}
.btn-teal:hover{background:rgba(45,212,160,.18)}
.btn-danger{background:var(--corallt);color:var(--coral);border-color:var(--coralbdr)}
.btn-danger:hover{background:rgba(251,113,133,.18)}
.btn-sm{padding:6px 14px;font-size:11px;border-radius:7px}
.btn-full{width:100%}
.btn:disabled{opacity:.4;cursor:not-allowed}

/* ── DOC TABLE ── */
.tbl-wrap{border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-top:8px}
.doc-tbl{width:100%;border-collapse:collapse}
.doc-tbl th{font-size:10px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;
  color:var(--t3);padding:11px 14px;text-align:left;background:var(--bg4);
  border-bottom:1px solid var(--border)}
.doc-tbl td{padding:11px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
.doc-tbl tbody tr:last-child td{border-bottom:none}
.doc-tbl tbody tr:hover td{background:rgba(255,255,255,.02)}
.empty-row td{text-align:center;padding:32px;color:var(--t3);font-size:12px}

/* ── TYPE BADGES ── */
.tbadge{display:inline-flex;align-items:center;font-size:9px;font-weight:700;
  padding:3px 8px;border-radius:6px;letter-spacing:.05em}

/* ── STATUS ── */
.sdot{width:7px;height:7px;border-radius:50%;display:inline-block;margin-right:5px;flex-shrink:0}
.stxt{font-size:11px;font-weight:500}

/* ── PILLS ── */
.pills{display:flex;flex-wrap:wrap;gap:4px}
.pill{font-size:9px;font-weight:500;padding:3px 9px;border-radius:8px;
  border:1px solid var(--border);color:var(--t3);background:var(--bg4);white-space:nowrap;transition:all .2s}
.pill.done{background:var(--greenlt);color:var(--green);border-color:var(--greenbdr)}
.pill.active{background:rgba(167,139,250,.1);color:var(--purple);border-color:rgba(167,139,250,.3);animation:ppulse 1.4s infinite}
.pill.err{background:var(--corallt);color:var(--coral);border-color:var(--coralbdr)}
@keyframes ppulse{0%,100%{opacity:1}50%{opacity:.45}}

/* ── PROGRESS ── */
.prog-section{margin-top:16px}
.prog-row{margin-bottom:10px}
.prog-lbl{display:flex;justify-content:space-between;margin-bottom:4px;font-size:11px;color:var(--t2)}
.prog-t{height:4px;background:var(--bg4);border-radius:2px;overflow:hidden}
.prog-f{height:100%;border-radius:2px;background:var(--accent);transition:width .5s ease}
.prog-f.teal{background:var(--teal)}

/* ── STATUS BAR ── */
.status-bar{display:flex;align-items:center;gap:8px;padding:10px 14px;border-radius:8px;font-size:11px;margin-top:16px}
.status-bar.idle{background:var(--bg4);color:var(--t3);border:1px solid var(--border)}
.status-bar.running{background:rgba(124,106,248,.08);color:var(--purple);border:1px solid rgba(124,106,248,.3)}
.status-bar.done{background:var(--greenlt);color:var(--green);border:1px solid var(--greenbdr)}
.status-bar.error{background:var(--corallt);color:var(--coral);border:1px solid var(--coralbdr)}
.tdot{width:6px;height:6px;border-radius:50%;background:currentColor;animation:blink 1.3s infinite;flex-shrink:0}
.tdot:nth-child(2){animation-delay:.22s}.tdot:nth-child(3){animation-delay:.44s}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.1}}

/* ── METRICS CARDS ── */
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
.mcard{background:var(--card2);border:1px solid var(--border);border-radius:12px;
  padding:16px 18px;position:relative;overflow:hidden}
.mcard::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;
  background:var(--bc,var(--accent));border-radius:2px 2px 0 0}
.mc-val{font-size:26px;font-weight:700;color:var(--t1);line-height:1}
.mc-lbl{font-size:10px;color:var(--t3);margin-top:5px;text-transform:uppercase;letter-spacing:.08em}

/* ── SECTION DIVIDER ── */
.sec{font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;
  color:var(--t3);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.sec::after{content:'';flex:1;height:1px;background:var(--border)}
.sp16{height:16px}.sp24{height:24px}.sp32{height:32px}

/* ── LOG BOX ── */
#log-box{background:#040a12;border:1px solid var(--border);border-radius:8px;padding:14px;
  font-family:'Consolas',monospace;font-size:12px;color:#4ade80;
  height:240px;overflow-y:auto;white-space:pre-wrap;margin-top:16px}

/* ── RUN GRID ── */
.run-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.card-box{background:var(--card2);border:1px solid var(--border);border-radius:12px;padding:20px 22px}
.card-box h2{font-size:12px;font-weight:600;color:var(--t2);margin-bottom:14px;
  text-transform:uppercase;letter-spacing:1px}

/* ── IFRAME ── */
.iframe-wrap{border-radius:12px;overflow:hidden;border:1px solid var(--border)}
iframe{display:block;width:100%;border:none}

/* ── SEARCH ── */
.search-row{display:flex;gap:10px;margin-bottom:20px}
.search-row input{flex:1;background:var(--bg3);border:1px solid var(--border);
  border-radius:8px;color:var(--t1);padding:10px 16px;font-size:13px;
  font-family:inherit;outline:none}
.search-row input:focus{border-color:var(--accent)}
.res-card{background:var(--card2);border:1px solid var(--border);border-radius:10px;
  padding:16px 18px;margin-bottom:12px}
.res-score{font-size:10px;color:var(--teal);font-weight:600;text-transform:uppercase;
  letter-spacing:1px;margin-bottom:6px}
.res-src{font-size:10px;color:var(--t3);margin-bottom:8px}
.res-chunk{font-size:12px;color:var(--t2);line-height:1.7}
.res-chunk b{color:var(--amber);font-weight:normal}

/* ── SPINNER ── */
.spin{width:12px;height:12px;border:2px solid currentColor;border-top-color:transparent;
  border-radius:50%;animation:_spin .6s linear infinite;display:inline-block}
@keyframes _spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>

<!-- TOPBAR -->
<nav class="topbar">
  <div class="brand">
    <div class="brand-mark">
      <svg viewBox="0 0 14 14" fill="none" width="13" height="13">
        <polygon points="7,1 13,13 1,13" fill="white" opacity=".95"/>
      </svg>
    </div>
    Graphify
  </div>
  <button class="tab on"   id="tb-inject" onclick="gotoTab('inject',this)">① Inject</button>
  <button class="tab"      id="tb-run"    onclick="gotoTab('run',this)">▶ Run</button>
  <button class="tab"      id="tb-report" onclick="gotoTab('report',this)">Report</button>
  <button class="tab"      id="tb-graph"  onclick="gotoTab('graph',this)">Graph</button>
  <button class="tab"      id="tb-search" onclick="gotoTab('search',this)">Search</button>
  <div class="nav-right">
    <span class="live-pill" id="live-pill">● Idle</span>
  </div>
</nav>


<!-- ══════════════════════════════════════════════════════════
     PAGE: INJECT
══════════════════════════════════════════════════════════ -->
<div class="page on" id="pg-inject">
  <div class="ph">
    <div class="inner">
      <div class="ph-label">Step 1 · Foundation layer</div>
      <div class="ph-title">Data Injection &amp; GraphRAG</div>
      <div class="ph-sub">Upload files or connect a database — system cleans, labels, maps entities &amp; builds the knowledge graph</div>
    </div>
  </div>

  <div class="inner">

    <!-- Source sub-tabs -->
    <div class="src-tabs">
      <button class="src-tab on" id="st-file" onclick="switchSrc('file')">📄 File Upload</button>
      <button class="src-tab"    id="st-db"   onclick="switchSrc('db')">🗄 Database Connect</button>
    </div>

    <!-- ── File Upload section ── -->
    <div id="sec-file">
      <div class="upload-zone" id="drop-zone"
           onclick="document.getElementById('file-inp').click()"
           ondragover="event.preventDefault();this.classList.add('drag')"
           ondragleave="this.classList.remove('drag')"
           ondrop="event.preventDefault();this.classList.remove('drag');handleFiles(event.dataTransfer.files)">
        <input type="file" id="file-inp" multiple
               accept=".txt,.md,.json,.pdf,.docx,.xlsx,.csv"
               onchange="handleFiles(this.files)">
        <div class="upload-icon">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M9 2.5v10M6 5.5l3-3 3 3M3 13h12v2H3z" stroke="#7c6af8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <p>Drop files or <span>click to browse</span></p>
        <small>PDF · DOCX · XLSX · CSV · TXT · MD · JSON</small>
      </div>
    </div>

    <!-- ── Database Connect section ── -->
    <div id="sec-db" style="display:none">
      <div class="db-panel">
        <div class="db-head" onclick="toggleDbBody()">
          <div class="db-head-icon">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <ellipse cx="7" cy="4" rx="5" ry="2" stroke="#60a5fa" stroke-width="1.2"/>
              <path d="M2 4v3c0 1.1 2.24 2 5 2s5-.9 5-2V4" stroke="#60a5fa" stroke-width="1.2"/>
              <path d="M2 7v3c0 1.1 2.24 2 5 2s5-.9 5-2V7" stroke="#60a5fa" stroke-width="1.2"/>
            </svg>
          </div>
          <div style="flex:1">
            <div class="db-title">Database connection</div>
            <div class="db-sub">Connect a source to extract tables as documents</div>
          </div>
          <svg id="db-chev" width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2.5 4.5l4 4 4-4" stroke="#5c5a78" stroke-width="1.4" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="db-body" id="db-body">
          <div class="db-grid">
            <div class="fld">
              <label>Database type</label>
              <select id="db-type">
                <option>PostgreSQL</option>
                <option>MySQL</option>
                <option>Microsoft SQL Server</option>
                <option>SQLite</option>
                <option disabled>── Cloud (coming soon) ──</option>
                <option disabled>Snowflake</option>
                <option disabled>BigQuery</option>
                <option disabled>MongoDB</option>
              </select>
            </div>
            <div class="fld">
              <label>Host / Endpoint</label>
              <input type="text" id="db-host" placeholder="localhost">
            </div>
            <div class="fld">
              <label>Port</label>
              <input type="text" id="db-port" placeholder="5432">
            </div>
            <div class="fld">
              <label>Database name</label>
              <input type="text" id="db-name" placeholder="mydb">
            </div>
            <div class="fld">
              <label>Username</label>
              <input type="text" id="db-user" placeholder="postgres">
            </div>
            <div class="fld">
              <label>Password</label>
              <input type="password" id="db-pass" placeholder="••••••••">
            </div>
          </div>
          <div class="fld" style="margin-bottom:14px">
            <label>Schema (optional)</label>
            <input type="text" id="db-schema" placeholder="public">
          </div>
          <div class="db-actions">
            <button class="btn btn-sm" onclick="testDb()">Test connection</button>
            <button class="btn btn-sm btn-teal" onclick="connectDb()">Connect &amp; Ingest →</button>
            <span class="db-status-txt" id="db-status-txt">Not connected</span>
          </div>
          <div class="db-chips" id="db-chips"></div>
        </div>
      </div>
    </div>

    <div class="sp24"></div>

    <!-- ── Document table ── -->
    <div class="sec">Injected documents</div>
    <div class="tbl-wrap">
      <table class="doc-tbl">
        <thead>
          <tr>
            <th style="width:32%">Document</th>
            <th style="width:9%">Type</th>
            <th style="width:19%">Curation status</th>
            <th>Pipeline actions</th>
          </tr>
        </thead>
        <tbody id="doc-tbody">
          <tr class="empty-row" id="empty-hint">
            <td colspan="4">No files yet — drop files above or connect a database</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Progress bars -->
    <div class="prog-section" id="prog-section" style="display:none">
      <div class="prog-row">
        <div class="prog-lbl"><span>GraphRAG construction</span><span id="prog-pct">0%</span></div>
        <div class="prog-t"><div class="prog-f" id="prog-bar" style="width:0%"></div></div>
      </div>
      <div class="prog-row">
        <div class="prog-lbl"><span>Entity relationship mapping</span><span id="prog-ent-pct">0%</span></div>
        <div class="prog-t"><div class="prog-f teal" id="prog-ent" style="width:0%"></div></div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="status-bar idle" id="ingest-status">
      <span>Ready — add files or connect a database, then click Process</span>
    </div>

    <div class="sp24"></div>

    <!-- Summary cards (hidden until complete) -->
    <div id="summary-cards" style="display:none">
      <div class="sec">Session summary</div>
      <div class="cards">
        <div class="mcard" style="--bc:var(--blue)"><div class="mc-val" id="sc-total">—</div><div class="mc-lbl">Total loaded</div></div>
        <div class="mcard" style="--bc:var(--green)"><div class="mc-val" id="sc-acc">—</div><div class="mc-lbl">Accepted</div></div>
        <div class="mcard" style="--bc:var(--coral)"><div class="mc-val" id="sc-rej">—</div><div class="mc-lbl">Rejected</div></div>
        <div class="mcard" style="--bc:var(--amber)"><div class="mc-val" id="sc-nodes">—</div><div class="mc-lbl">Graph nodes</div></div>
      </div>
    </div>

    <div style="display:flex;gap:12px;align-items:center">
      <button class="btn btn-danger btn-sm" onclick="clearAll()">🗑 Clear all files</button>
      <button class="btn btn-p" id="process-btn" onclick="startIngest()">⚡ Process Files →</button>
    </div>
    <div class="sp32"></div>
  </div>
</div>


<!-- ══════════════════════════════════════════════════════════
     PAGE: RUN
══════════════════════════════════════════════════════════ -->
<div class="page" id="pg-run">
  <div class="ph">
    <div class="inner">
      <div class="ph-label">Batch mode</div>
      <div class="ph-title">Run Full Pipeline</div>
      <div class="ph-sub">Processes all files in data/raw — same stages as Inject but without live per-file tracking</div>
    </div>
  </div>
  <div class="inner">
    <div class="run-grid">
      <div class="card-box">
        <h2>Pipeline Control</h2>
        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button class="btn btn-p" id="run-btn" onclick="runPipeline()">▶ Run Pipeline</button>
          <span id="run-status"></span>
        </div>
        <div id="log-box">Waiting to run…</div>
      </div>
      <div class="card-box">
        <h2>Existing Raw Files</h2>
        <div id="raw-files-list" style="font-size:12px;color:var(--t3)">Loading…</div>
        <div style="margin-top:12px;display:flex;gap:8px">
          <button class="btn btn-sm" onclick="loadRawFiles()">↺ Refresh</button>
          <button class="btn btn-sm btn-danger" onclick="clearRaw()">🗑 Clear Raw</button>
        </div>
      </div>
    </div>
    <div class="sp32"></div>
  </div>
</div>


<!-- ══════════════════════════════════════════════════════════
     PAGE: REPORT
══════════════════════════════════════════════════════════ -->
<div class="page" id="pg-report">
  <div class="inner" style="padding-top:16px">
    <div id="report-ph" style="text-align:center;padding:80px 0;color:var(--t3)">Run the pipeline first to generate the report.</div>
    <div class="iframe-wrap" id="report-wrap" style="display:none">
      <iframe id="report-frame" src="" height="820"></iframe>
    </div>
  </div>
</div>


<!-- ══════════════════════════════════════════════════════════
     PAGE: GRAPH
══════════════════════════════════════════════════════════ -->
<div class="page" id="pg-graph">
  <div class="inner" style="padding-top:16px">
    <div id="graph-ph" style="text-align:center;padding:80px 0;color:var(--t3)">Run the pipeline first to build the graph.</div>
    <div class="iframe-wrap" id="graph-wrap" style="display:none">
      <iframe id="graph-frame" src="" height="860"></iframe>
    </div>
  </div>
</div>


<!-- ══════════════════════════════════════════════════════════
     PAGE: SEARCH
══════════════════════════════════════════════════════════ -->
<div class="page" id="pg-search">
  <div class="ph">
    <div class="inner">
      <div class="ph-label">TF-IDF retrieval</div>
      <div class="ph-title">Corpus Search</div>
      <div class="ph-sub">Ask a question over your curated corpus</div>
    </div>
  </div>
  <div class="inner">
    <div class="search-row">
      <input type="text" id="q-inp" placeholder="Ask a question about your corpus…"
             onkeydown="if(event.key==='Enter')doSearch()">
      <button class="btn btn-p" onclick="doSearch()">Search</button>
    </div>
    <div id="search-status" style="font-size:12px;color:var(--t3);margin-bottom:12px"></div>
    <div id="search-results"></div>
    <div class="sp32"></div>
  </div>
</div>


<!-- ══ SCRIPT ══════════════════════════════════════════════ -->
<script>
// ── Tab navigation ────────────────────────────────────────
function gotoTab(name, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.tab').forEach(b => b.classList.remove('on'));
  document.getElementById('pg-' + name).classList.add('on');
  btn.classList.add('on');
}

// ── Source sub-tabs ───────────────────────────────────────
function switchSrc(t) {
  document.getElementById('sec-file').style.display = t === 'file' ? 'block' : 'none';
  document.getElementById('sec-db').style.display   = t === 'db'   ? 'block' : 'none';
  document.getElementById('st-file').classList.toggle('on', t === 'file');
  document.getElementById('st-db').classList.toggle('on', t === 'db');
}

function toggleDbBody() {
  const body = document.getElementById('db-body');
  const chev = document.getElementById('db-chev');
  body.classList.toggle('open');
  chev.style.transform = body.classList.contains('open') ? 'rotate(180deg)' : '';
}

// ── File type metadata ────────────────────────────────────
const FILE_TYPES = {
  PDF:  {bg:'rgba(251,113,133,.12)',c:'#fb7185',bdr:'rgba(251,113,133,.3)'},
  DOCX: {bg:'rgba(167,139,250,.12)',c:'#a78bfa',bdr:'rgba(167,139,250,.3)'},
  XLSX: {bg:'rgba(45,212,160,.12)', c:'#2dd4a0',bdr:'rgba(45,212,160,.3)'},
  CSV:  {bg:'rgba(251,191,36,.12)', c:'#fbbf24',bdr:'rgba(251,191,36,.3)'},
  TXT:  {bg:'rgba(96,165,250,.12)', c:'#60a5fa',bdr:'rgba(96,165,250,.3)'},
  MD:   {bg:'rgba(96,165,250,.12)', c:'#60a5fa',bdr:'rgba(96,165,250,.3)'},
  JSON: {bg:'rgba(45,212,160,.12)', c:'#2dd4a0',bdr:'rgba(45,212,160,.3)'},
  DB:   {bg:'rgba(96,165,250,.12)', c:'#60a5fa',bdr:'rgba(96,165,250,.3)'},
};
function typeBadge(ext) {
  const key = ext.replace('.','').toUpperCase();
  const t = FILE_TYPES[key] || FILE_TYPES.TXT;
  return `<span class="tbadge" style="background:${t.bg};color:${t.c};border:1px solid ${t.bdr}">${key}</span>`;
}

// ── Document table management ────────────────────────────
const fileRows = {}; // filename → rowId

function addFileRow(filename, source) {
  document.getElementById('empty-hint').style.display = 'none';
  const ext = filename.includes('.') ? '.' + filename.split('.').pop() : '.txt';
  const safe = filename.replace(/[^a-zA-Z0-9]/g, '_');
  const rowId = 'row_' + safe + '_' + Date.now();

  const tr = document.createElement('tr');
  tr.id = rowId;
  tr.innerHTML = `
    <td>
      <div style="font-size:12px;font-weight:500;color:var(--t1)">${filename}</div>
      <div style="font-size:10px;color:var(--t3);margin-top:2px" id="${rowId}_meta">${source === 'db' ? 'DB table' : 'queued'}</div>
    </td>
    <td>${typeBadge(ext)}</td>
    <td id="${rowId}_status">
      <span class="sdot" style="background:var(--border2)"></span>
      <span class="stxt" style="color:var(--t3)">Queued</span>
    </td>
    <td>
      <div class="pills">
        <span class="pill" id="${rowId}_p_cleaned">Cleaned</span>
        <span class="pill" id="${rowId}_p_labelled">Labelled</span>
        <span class="pill" id="${rowId}_p_entities_mapped">Entities mapped</span>
        <span class="pill" id="${rowId}_p_graphrag_ready">GraphRAG built</span>
      </div>
    </td>`;

  document.getElementById('doc-tbody').appendChild(tr);
  fileRows[filename] = rowId;
  return rowId;
}

function setPill(filename, stage, cls) {
  const rowId = fileRows[filename];
  if (!rowId) return;
  const p = document.getElementById(rowId + '_p_' + stage);
  if (p) { p.className = 'pill ' + cls; }
}

function setRowStatus(filename, dotColor, text, textColor, animate) {
  const rowId = fileRows[filename];
  if (!rowId) return;
  const td = document.getElementById(rowId + '_status');
  if (!td) return;
  const anim = animate ? 'animation:ppulse 1.2s infinite' : '';
  td.innerHTML = `<span class="sdot" style="background:${dotColor};${anim}"></span>
                  <span class="stxt" style="color:${textColor}">${text}</span>`;
}

function setRowMeta(filename, text) {
  const rowId = fileRows[filename];
  if (!rowId) return;
  const el = document.getElementById(rowId + '_meta');
  if (el) el.textContent = text;
}

// ── File upload ───────────────────────────────────────────
async function handleFiles(files) {
  if (!files || !files.length) return;
  const fd = new FormData();
  for (const f of files) {
    addFileRow(f.name, 'file');
    setRowStatus(f.name, 'var(--amber)', 'Uploading…', 'var(--amber)', true);
    fd.append('files', f);
  }
  try {
    const r = await fetch('/upload', {method:'POST', body:fd});
    const d = await r.json();
    for (const name of (d.uploaded || [])) {
      setRowStatus(name, 'var(--border2)', 'Queued', 'var(--t3)', false);
      setRowMeta(name, 'ready to process');
    }
    for (const name of (d.skipped || [])) {
      setRowStatus(name, 'var(--coral)', 'Skipped', 'var(--coral)', false);
    }
    document.getElementById('prog-section').style.display = 'block';
  } catch(e) {
    setIngestStatus('error', 'Upload failed: ' + e.message);
  }
}

// ── DB connection ─────────────────────────────────────────
async function testDb() {
  const s = document.getElementById('db-status-txt');
  s.className = 'db-status-txt'; s.textContent = 'Testing…';
  const payload = _dbPayload();
  try {
    const r = await fetch('/db-test', {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const d = await r.json();
    s.className = 'db-status-txt ' + (d.ok ? 'ok' : 'err');
    s.textContent = d.ok ? '✓ ' + d.message : '✗ ' + d.message;
  } catch(e) {
    s.className = 'db-status-txt err'; s.textContent = '✗ Network error';
  }
}

async function connectDb() {
  const s = document.getElementById('db-status-txt');
  s.className = 'db-status-txt'; s.textContent = 'Connecting…';
  const payload = _dbPayload();
  try {
    const r = await fetch('/db-connect', {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)});
    const d = await r.json();
    if (d.ok) {
      s.className = 'db-status-txt ok';
      s.textContent = `✓ Connected — ${d.files.length} table(s) extracted`;
      // Add table files to the document table
      for (const fname of d.files) {
        addFileRow(fname, 'db');
        setRowStatus(fname, 'var(--border2)', 'Queued', 'var(--t3)', false);
      }
      addDbChip(payload.db_type, payload.database, d.conn_id);
      document.getElementById('prog-section').style.display = 'block';
    } else {
      s.className = 'db-status-txt err';
      s.textContent = '✗ ' + (d.error || 'Connection failed');
    }
  } catch(e) {
    s.className = 'db-status-txt err'; s.textContent = '✗ Network error';
  }
}

function _dbPayload() {
  return {
    db_type:  document.getElementById('db-type').value,
    host:     document.getElementById('db-host').value,
    port:     parseInt(document.getElementById('db-port').value) || 5432,
    database: document.getElementById('db-name').value,
    username: document.getElementById('db-user').value,
    password: document.getElementById('db-pass').value,
    schema:   document.getElementById('db-schema').value || null,
  };
}

function addDbChip(dbType, database, connId) {
  const chips = document.getElementById('db-chips');
  const chip = document.createElement('div');
  chip.className = 'db-chip ok';
  chip.innerHTML = `<span class="db-chip-dot"></span>${dbType} · ${database}`;
  chips.appendChild(chip);
}

// ── SSE Ingest stream ─────────────────────────────────────
let ingestSrc = null;
let totalFiles = 0;
let processedFiles = 0;

function startIngest() {
  const queued = Object.keys(fileRows);
  if (!queued.length) {
    setIngestStatus('error', 'No files to process — upload files first.');
    return;
  }
  if (ingestSrc) ingestSrc.close();

  // Mark all queued rows as "Processing"
  totalFiles = queued.length;
  processedFiles = 0;
  document.getElementById('process-btn').disabled = true;
  setIngestStatus('running', null);
  setLivePill('running');

  const fileList = encodeURIComponent(queued.join(','));
  ingestSrc = new EventSource('/ingest-stream?files=' + fileList);

  ingestSrc.onmessage = function(e) {
    try { handleSSE(JSON.parse(e.data)); }
    catch(err) { console.error('SSE parse error', err); }
  };
  ingestSrc.onerror = function() {
    ingestSrc.close();
    setIngestStatus('error', 'Stream error — check server logs.');
    document.getElementById('process-btn').disabled = false;
    setLivePill('idle');
  };
}

function handleSSE(evt) {
  if (evt.type === 'file_stage') {
    const {file, stage, status} = evt;
    if (stage === 'load_error') {
      setRowStatus(file, 'var(--coral)', 'Load error', 'var(--coral)', false);
      setPill(file, 'cleaned', 'err');
      processedFiles++;
    } else if (stage === 'cleaned') {
      setPill(file, 'cleaned', 'done');
      setRowStatus(file, 'var(--amber)', 'Processing', 'var(--amber)', true);
    } else if (stage === 'labelled') {
      if (status === 'rejected') {
        setPill(file, 'labelled', 'err');
        setRowStatus(file, 'var(--coral)', 'Rejected: ' + (evt.reason || ''), 'var(--coral)', false);
        processedFiles++;
      } else {
        setPill(file, 'labelled', 'done');
        if (evt.quality !== null && evt.quality !== undefined)
          setRowMeta(file, `quality: ${evt.quality}`);
      }
    } else if (stage === 'entities_mapped') {
      setPill(file, 'entities_mapped', 'done');
      if (evt.chunks) setRowMeta(file, `${evt.chunks} chunks`);
    }
    updateProgress();

  } else if (evt.type === 'pipeline_stage') {
    const msgs = {
      dedup:     'Deduplicating documents…',
      writing:   'Writing curated outputs…',
      graph:     'Building knowledge graph…',
      visualize: 'Generating visualization…',
    };
    setIngestStatus('running', msgs[evt.stage] || evt.message || evt.stage);
    if (evt.stage === 'graph') setProgress(85, 90);
    if (evt.stage === 'visualize') setProgress(95, 97);

  } else if (evt.type === 'graphrag_ready') {
    for (const fname of (evt.files || [])) {
      setPill(fname, 'graphrag_ready', 'done');
      setRowStatus(fname, 'var(--green)', 'GraphRAG ready', 'var(--green)', false);
      processedFiles++;
    }
    setProgress(100, 100);

  } else if (evt.type === 'complete') {
    ingestSrc.close();
    const s = evt.stats;
    setIngestStatus('done',
      `✓ Complete — ${s.accepted} accepted · ${s.rejected} rejected · ${s.graph_nodes} graph nodes`);
    showSummary(s);
    document.getElementById('process-btn').disabled = false;
    setLivePill('done');
    // pre-load report & graph iframes
    preloadOutputs();

  } else if (evt.type === 'error') {
    ingestSrc.close();
    setIngestStatus('error', evt.message);
    document.getElementById('process-btn').disabled = false;
    setLivePill('idle');
  }
}

function updateProgress() {
  const pct = totalFiles ? Math.round((processedFiles / totalFiles) * 80) : 0;
  setProgress(pct, pct + 5);
}

function setProgress(main, ent) {
  const m = Math.min(main, 100), e = Math.min(ent, 100);
  document.getElementById('prog-bar').style.width = m + '%';
  document.getElementById('prog-pct').textContent = m + '%';
  document.getElementById('prog-ent').style.width = e + '%';
  document.getElementById('prog-ent-pct').textContent = e + '%';
}

function setIngestStatus(cls, msg) {
  const el = document.getElementById('ingest-status');
  el.className = 'status-bar ' + cls;
  if (cls === 'running') {
    el.innerHTML = `<span class="tdot"></span><span class="tdot"></span><span class="tdot"></span>
      <span>${msg || 'Processing…'}</span>`;
  } else {
    el.textContent = msg || '';
  }
}

function setLivePill(state) {
  const p = document.getElementById('live-pill');
  if (state === 'running') { p.style.color='var(--amber)'; p.style.borderColor='var(--amberbdr)'; p.style.background='var(--amberlt)'; p.textContent='● Processing'; }
  else if (state === 'done') { p.style.color='var(--green)'; p.style.borderColor='var(--greenbdr)'; p.style.background='var(--greenlt)'; p.textContent='● Done'; }
  else { p.style.color='var(--teal)'; p.style.borderColor='var(--tealbdr)'; p.style.background='var(--teallt)'; p.textContent='● Idle'; }
}

function showSummary(s) {
  document.getElementById('summary-cards').style.display = 'block';
  document.getElementById('sc-total').textContent  = s.total;
  document.getElementById('sc-acc').textContent    = s.accepted;
  document.getElementById('sc-rej').textContent    = s.rejected;
  document.getElementById('sc-nodes').textContent  = s.graph_nodes;
}

async function clearAll() {
  if (!confirm('Delete all files in data/raw?')) return;
  await fetch('/clear-raw', {method:'POST'});
  // Clear table
  const tbody = document.getElementById('doc-tbody');
  tbody.innerHTML = '<tr class="empty-row" id="empty-hint"><td colspan="4">No files yet — drop files above or connect a database</td></tr>';
  Object.keys(fileRows).forEach(k => delete fileRows[k]);
  document.getElementById('prog-section').style.display = 'none';
  document.getElementById('summary-cards').style.display = 'none';
  setIngestStatus('idle', 'Ready — add files or connect a database, then click Process');
  setProgress(0, 0);
  setLivePill('idle');
}

function preloadOutputs() {
  document.getElementById('report-ph').style.display = 'none';
  document.getElementById('report-wrap').style.display = 'block';
  document.getElementById('report-frame').src = '/report-html?' + Date.now();
  document.getElementById('graph-ph').style.display = 'none';
  document.getElementById('graph-wrap').style.display = 'block';
  document.getElementById('graph-frame').src = '/graph-html?' + Date.now();
}

// ── Run Pipeline (batch) ──────────────────────────────────
async function runPipeline() {
  const btn = document.getElementById('run-btn');
  btn.disabled = true;
  document.getElementById('log-box').textContent = '';
  document.getElementById('run-status').innerHTML = '<span class="spin"></span> Running…';
  try {
    const r = await fetch('/run', {method:'POST'});
    const d = await r.json();
    if (d.success) {
      d.log.forEach(l => appendLog(l));
      document.getElementById('run-status').innerHTML = '✓ Done';
      preloadOutputs();
    } else {
      appendLog('ERROR: ' + d.error);
      document.getElementById('run-status').innerHTML = '✗ Failed';
    }
  } catch(e) {
    appendLog('Network error: ' + e);
  }
  btn.disabled = false;
}
function appendLog(line) {
  const b = document.getElementById('log-box');
  b.textContent += line + '\n'; b.scrollTop = b.scrollHeight;
}

async function loadRawFiles() {
  const r = await fetch('/raw-files');
  const d = await r.json();
  const el = document.getElementById('raw-files-list');
  el.innerHTML = d.files.length
    ? d.files.map(f => `<span style="display:inline-block;background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:3px 10px;font-size:11px;color:var(--t2);margin:2px">${f}</span>`).join('')
    : '<span style="color:var(--t3)">No files yet.</span>';
}

async function clearRaw() {
  if (!confirm('Delete all files in data/raw?')) return;
  await fetch('/clear-raw', {method:'POST'});
  loadRawFiles();
}

// ── Search ────────────────────────────────────────────────
async function doSearch() {
  const q = document.getElementById('q-inp').value.trim();
  if (!q) return;
  document.getElementById('search-status').textContent = 'Searching…';
  document.getElementById('search-results').innerHTML = '';
  try {
    const r = await fetch('/search', {method:'POST',
      headers:{'Content-Type':'application/json'}, body:JSON.stringify({query:q})});
    const d = await r.json();
    if (d.error) { document.getElementById('search-status').textContent = 'Error: ' + d.error; return; }
    document.getElementById('search-status').textContent = d.results.length + ' result(s) for "' + q + '"';
    const re = new RegExp('(' + q.split(' ').filter(Boolean).map(w => w.replace(/[.*+?^${}()|[\]\\]/g,'\$&')).join('|') + ')', 'gi');
    document.getElementById('search-results').innerHTML = d.results.map(res => `
      <div class="res-card">
        <div class="res-score">Score: ${res.score}</div>
        <div class="res-src">${res.source_path}</div>
        <div class="res-chunk">${res.chunk.replace(re,'<b>$1</b>')}</div>
      </div>`).join('');
  } catch(e) {
    document.getElementById('search-status').textContent = 'Network error';
  }
}

// ── Init ──────────────────────────────────────────────────
loadRawFiles();
</script>
</body>
</html>"""


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template_string(_TEMPLATE)


@app.route("/upload", methods=["POST"])
def upload():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    uploaded, skipped = [], []
    for f in request.files.getlist("files"):
        ext = Path(f.filename).suffix.lower()
        if ext in ALLOWED_EXT:
            dest = RAW_DIR / secure_filename(f.filename)
            f.save(dest)
            uploaded.append(f.filename)
        else:
            skipped.append(f.filename)
    return jsonify({"uploaded": uploaded, "skipped": skipped})


@app.route("/raw-files")
def raw_files():
    if not RAW_DIR.exists():
        return jsonify({"files": []})
    files = [p.name for p in sorted(RAW_DIR.iterdir()) if p.is_file()]
    return jsonify({"files": files})


@app.route("/clear-raw", methods=["POST"])
def clear_raw():
    if RAW_DIR.exists():
        shutil.rmtree(RAW_DIR)
    RAW_DIR.mkdir(parents=True)
    return jsonify({"ok": True})


# ── SSE ingest stream ──────────────────────────────────────────────────────────

@app.route("/ingest-stream")
def ingest_stream():
    from data_engine import ingestor

    cfg = json.loads(CONFIG.read_text())

    requested = request.args.get("files", "")
    if requested:
        names = [n.strip() for n in requested.split(",") if n.strip()]
        paths = sorted(
            RAW_DIR / name for name in names
            if (RAW_DIR / name).is_file()
        )
    else:
        paths = sorted(
            p for p in RAW_DIR.rglob("*")
            if p.is_file() and p.suffix.lower() in ALLOWED_EXT
        )

    def generate():
        try:
            for event in ingestor.ingest_and_stream(paths, cfg):
                yield f"data: {json.dumps(event)}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type':'error','message':str(exc)})}\n\n"
            yield f"data: {json.dumps({'type':'error','message':traceback.format_exc()})}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── DB routes ──────────────────────────────────────────────────────────────────

@app.route("/db-test", methods=["POST"])
def db_test():
    from data_engine.db_connector import test_connection
    d = request.get_json()
    ok, msg = test_connection(
        db_type=d.get("db_type", "postgresql"),
        host=d.get("host", ""),
        port=int(d.get("port", 5432)),
        database=d.get("database", ""),
        username=d.get("username", ""),
        password=d.get("password", ""),
        schema=d.get("schema"),
    )
    return jsonify({"ok": ok, "message": msg})


@app.route("/db-connect", methods=["POST"])
def db_connect():
    from data_engine.db_connector import connect_and_extract
    d = request.get_json()
    try:
        RAW_DIR.mkdir(parents=True, exist_ok=True)
        conn_id, files = connect_and_extract(
            db_type=d.get("db_type", "postgresql"),
            host=d.get("host", ""),
            port=int(d.get("port", 5432)),
            database=d.get("database", ""),
            username=d.get("username", ""),
            password=d.get("password", ""),
            schema=d.get("schema"),
            output_dir=str(RAW_DIR),
        )
        return jsonify({"ok": True, "conn_id": conn_id, "files": files})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)})


@app.route("/db-list")
def db_list():
    from data_engine.db_connector import list_connections
    return jsonify({"connections": list_connections()})


# ── Existing routes ────────────────────────────────────────────────────────────

@app.route("/run", methods=["POST"])
def run_pipeline():
    import logging as _log
    log_lines: list[str] = []

    class _Handler(_log.Handler):
        def emit(self, record):
            log_lines.append(self.format(record))

    handler = _Handler()
    handler.setFormatter(_log.Formatter("%(levelname)s  %(name)s — %(message)s"))
    root = _log.getLogger()
    root.addHandler(handler)
    try:
        from data_engine.main import run
        result = run(config_path=str(CONFIG))
        from visualize_graph import visualize
        visualize()
        return jsonify({"success": True, "log": log_lines, "result": result.model_dump()})
    except Exception as exc:
        return jsonify({"success": False, "error": str(exc),
                        "log": log_lines + [traceback.format_exc()]})
    finally:
        root.removeHandler(handler)


@app.route("/report-html")
def report_html():
    if not REPORT_HTML.exists():
        return "Report not generated yet.", 404
    return send_file(REPORT_HTML)


@app.route("/graph-html")
def graph_html():
    if not GRAPH_HTML.exists():
        return "Graph not generated yet.", 404
    return send_file(GRAPH_HTML)


@app.route("/search", methods=["POST"])
def search():
    from data_engine.search import CorpusSearchEngine
    from data_engine.loader import load_corpus
    from data_engine.text_utils import normalize
    from data_engine.chunker import chunk_documents

    data = request.get_json()
    query = data.get("query", "").strip()
    if not query:
        return jsonify({"results": []})
    try:
        cfg = json.loads(CONFIG.read_text())
        docs = load_corpus(cfg["curated_dir"], supported_extensions=[".txt"])
        for doc in docs:
            if doc.accepted and doc.raw_text:
                object.__setattr__(doc, "clean_text", normalize(doc.raw_text))
        chunk_cfg = cfg.get("chunking", {})
        chunk_documents(docs, chunk_size=chunk_cfg.get("chunk_size", 150),
                        overlap=chunk_cfg.get("overlap", 20))
        engine = CorpusSearchEngine.build(docs)
        s_cfg = cfg.get("search", {})
        results = engine.search(query, top_k=s_cfg.get("top_k", 5),
                                min_score=s_cfg.get("min_score", 0.05))
        return jsonify({"results": [
            {"doc_id": r.doc_id, "source_path": r.source_path,
             "chunk": r.chunk, "score": r.score}
            for r in results
        ]})
    except Exception as exc:
        return jsonify({"error": str(exc), "results": []})


if __name__ == "__main__":
    print("\n  Graphify — AI Data Engine")
    print("  Open http://localhost:5000\n")
    app.run(debug=False, port=5000, threaded=True)
