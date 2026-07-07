# Final Demo Fixes — Summary

**Date:** 2026-07-02  
**TypeScript errors before:** 0 · **After:** 0  
**Production code changed:** 3 files (PipelineCanvas, processing/page, lib/mockFetch)  
**No components redesigned, no routing changed, no CSS altered**

---

## Fix 1 — Knowledge Harnessing Layout

### Files Modified
- `frontend/app/components/PipelineCanvas.tsx`

### Root Cause
Each pipeline node used `flex-shrink-0` with `minWidth: 80px` but no `maxWidth`. Label text for long stage names (e.g. "Ingestion & Extraction", 22 chars at 11px ≈ 120px) extended beyond the 80px node container and bled into the adjacent edge connector lines, causing visual overlap. The `flex-1` edge lines could not expand to compensate because the nodes were non-shrinkable.

### Fix Implemented
- Changed node container from `flex items-center flex-1` (per-row) to **fixed-width `88px` per node** with `flex: "0 0 auto"` 
- Edge connector changed from `flex-1` to a fixed `16px` separator, explicitly positioned at icon row height via `paddingTop: 22`
- Container `minWidth` now calculated dynamically: `nodes.length × 104 + 32px`
- Label font reduced from `text-[11px]` to `text-[10px]` with `overflowWrap: "break-word"` — long labels wrap cleanly to 2 lines within the 88px box
- Added explicit status text (`active`, `✓ done`, `Tap to review`) as separate line below label so status never overlaps the label
- `NodeStatusDot` ping animation preserved unchanged

### Demo Behaviour
All 17 pipeline nodes (14 ingestion + 3 post-ingestion) display with equal spacing, centered icons, wrapped labels, and status indicators — no text overlap at any viewport width. Pipeline horizontally scrollable on narrow screens.

---

## Fix 2 — Build Custom AI (Demo Mode)

### Files Modified
- `frontend/app/processing/page.tsx`

### Root Cause
In demo mode, clicking "Build Your AI →" opened the `SLMStudio` modal, which is the production training configuration UI. This modal requires manual configuration input and then polls the real backend for training progress (which doesn't exist in demo mode), causing the flow to stall indefinitely.

### Fix Implemented
Added a new async function `triggerDemoBuild()` in `processing/page.tsx` that:

1. Skips `SLMStudio` entirely
2. Animates through 7 build stages with realistic per-stage delays totalling **~35 seconds**:
   - Validate corpus (2s), Teacher LLM (5s), Generate QA pairs (5s), Filter dataset (5s), Student training (8s), Register SLM (5s), Validation (5s)
3. Appends a descriptive log message per stage to the existing live log panel
4. Updates the "Build Custom AI" node metric with a live percentage and stage name
5. On completion: fires the achievement toast, sets `slmBuildStatus = "done"`, persists `slm_model_id` to sessionStorage
6. Navigates to `/query` (Inference Harnessing) automatically

The "Build Your AI →" button click handler now checks `NEXT_PUBLIC_DEMO_MODE === "true"`:
- **Demo mode** → calls `triggerDemoBuild()` directly (no modal, no backend)
- **Production mode** → unchanged behaviour (opens `SLMStudio` modal)

### Demo Behaviour
Clicking "Build Your AI" immediately starts the animation. Realistic log messages appear one by one. Progress indicator updates on the node. Total elapsed time: ~35 seconds. App auto-navigates to Inference Harnessing on completion.

---

## Fix 3 — Outcome Harnessing Navigation

### Files Modified
- `frontend/app/lib/mockFetch.ts`

### Root Cause
The `recommendations/page.tsx` runs `deriveBuildPlan(parsed)` inside a try/catch in its startup `useEffect`. If this function throws, the catch block fires `router.push("/query")` — silently navigating the user back to Inference Harnessing.

`deriveBuildPlan` accesses `sub_task_results[i].query_fragment.toLowerCase()` — but the mock was sending `task` instead of `query_fragment`. This caused `undefined.toLowerCase()` → `TypeError` → catch fires → redirect back to `/query`.

The "double click" symptom appeared because:
1. First click: `/recommendations` loads → `deriveBuildPlan` throws → redirected to `/query`
2. Query page re-renders (now with `running = false` and an `answer` visible)
3. Second click: Same navigation but `orchestrator_output` was just re-set → still throws → redirected again

(Users who saw "second click works" were likely experiencing a lucky timing window.)

### Fix Implemented
Updated the mock `data` payload in `makeOrchestratorSSE()` to use the **exact field names** the `OrchestratorOutput` TypeScript interface and `deriveBuildPlan` function expect:

| Mock (old — wrong) | Mock (new — correct) | Used by |
|--------------------|---------------------|---------|
| `name` | `model_name` | `deriveBuildPlan → modelsByType()` |
| `is_available` | `is_available_locally` | recommendations model card |
| `reasoning` | `why_primary` | build plan model reasoning |
| — | `task_type: "domain_qa"` | `modelsByType(types)` filter |
| `task` | `query_fragment` | `subContent() → t.query_fragment.toLowerCase()` |
| `model_used` | `assigned_model` | recommendations sub-task display |
| — | `confidence` | sub-task confidence display |
| — | `query` | `deriveBuildPlan` project-type detection |

Also added `query` field to the output so `deriveBuildPlan` can detect the project type (ANALYTICS, CHATBOT, etc.) from the original query string.

### Demo Behaviour
After "Run Query" completes, clicking "Outcome Harnessing" (sidebar nav or inline "Open in Outcome workspace →" button) navigates immediately. No double-click required. The Recommendations page loads with the full build plan, answer with model attribution, and conversation history.
