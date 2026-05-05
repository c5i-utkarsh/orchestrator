"""
OrchestratorOutput — Pydantic schema for the structured recommendation output.
Every step MUST cite entity IDs from graph.json in what_we_found.
"""
from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field


class StepExplanation(BaseModel):
    what: str = Field(description="What this step does")
    why: str = Field(description="Why this step is needed")
    what_we_found: str = Field(description="Specific entities/facts from graph.json cited")
    decision_made: str = Field(description="The specific decision or output of this step")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence in this step's decision")
    caveats: list[str] = Field(default_factory=list, description="Known limitations or assumptions")
    graph_entity_ids: list[str] = Field(default_factory=list, description="Entity IDs cited from graph")


class ModelRecommendationCard(BaseModel):
    model_name: str
    provider: str
    task_type: str
    benchmark_score: float
    composite_score: float
    why_primary: str
    why_not_alternatives: list[str] = Field(default_factory=list)
    is_primary: bool = False
    vram_required_gb: float | None = None
    is_available_locally: bool = False


class SubTaskResult(BaseModel):
    task_type: str
    query_fragment: str
    assigned_model: str
    response: str
    confidence: float
    hallucination_verdict: str = "UNKNOWN"
    graph_citations: list[str] = Field(default_factory=list)


class OrchestratorStep(BaseModel):
    step_number: int
    step_name: str
    explanation: StepExplanation
    duration_ms: int = 0


class OrchestratorOutput(BaseModel):
    session_id: str
    query: str
    intent: str                           # DOMAIN | CAPABILITY | HYBRID
    primary_task_type: str
    coverage_action: str                  # ROUTE_MIXED | EXTEND_EXISTING | BUILD_NEW
    slm_model_id: str | None = None       # domain SLM used/being built
    steps: list[OrchestratorStep] = Field(default_factory=list)
    sub_task_results: list[SubTaskResult] = Field(default_factory=list)
    model_recommendations: list[ModelRecommendationCard] = Field(default_factory=list)
    final_answer: str = ""
    hallucination_rate: float = 0.0
    total_tokens_used: int = 0
    tokens_saved_by_compression: int = 0
    cached_hit: bool = False
    build_in_progress: bool = False       # True when SLM is being built (no fallback)
    estimated_build_minutes: int | None = None
    error: str | None = None
