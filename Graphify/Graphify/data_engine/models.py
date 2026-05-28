"""Shared domain models for the pipeline."""

from __future__ import annotations

from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field


class RejectionReason(str, Enum):
    DUPLICATE = "duplicate"
    NEAR_DUPLICATE = "near_duplicate"
    LOW_QUALITY = "low_quality"
    LOW_RELEVANCE = "low_relevance"
    WRONG_LANGUAGE = "wrong_language"
    LOAD_ERROR = "load_error"


class QualityScore(BaseModel):
    token_count: int = 0
    avg_word_length: float = 0.0
    symbol_ratio: float = 0.0
    alpha_ratio: float = 0.0
    score: float = 0.0

    class Config:
        frozen = True


class Document(BaseModel):
    doc_id: str
    source_path: str
    extension: str
    raw_text: str = ""
    clean_text: str = ""
    content_hash: str = ""
    language: Optional[str] = None
    chunks: list[str] = Field(default_factory=list)
    quality: Optional[QualityScore] = None
    relevance_score: float = 0.0
    accepted: bool = True
    rejection_reason: Optional[RejectionReason] = None
    rejection_detail: str = ""
    metadata: dict[str, Any] = Field(default_factory=dict)


class PipelineResult(BaseModel):
    total_loaded: int = 0
    total_accepted: int = 0
    total_rejected: int = 0
    rejection_breakdown: dict[str, int] = Field(default_factory=dict)
    graph_nodes: int = 0
    graph_edges: int = 0
    graph_communities: int = 0
    duration_seconds: float = 0.0
