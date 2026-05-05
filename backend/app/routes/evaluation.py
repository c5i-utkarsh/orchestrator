"""
POST /api/v1/evaluation/run — run hallucination + KPI evaluation against a model's answers.
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.adapters.registry import get_adapter_registry
from app.modules.evaluation.hallucination_detector import HallucinationDetector

router = APIRouter(prefix="/evaluation", tags=["evaluation"])


class EvaluationRequest(BaseModel):
    model_id: str
    qa_pairs: list[dict] = Field(description="[{question, answer, expected_answer}]")
    graph_context: str = ""


@router.post("/run")
async def run_evaluation(request: EvaluationRequest, db: AsyncSession = Depends(get_db)):
    adapter_registry = get_adapter_registry()
    detector = HallucinationDetector(adapter_registry)

    results = []
    hallucination_count = 0

    for pair in request.qa_pairs:
        answer = pair.get("answer", "")
        result = await detector.detect(answer, request.graph_context)
        if result.verdict == "FAIL":
            hallucination_count += 1
        results.append({
            "question": pair.get("question", ""),
            "verdict": result.verdict,
            "hallucination_rate": result.hallucination_rate,
            "hallucinated_claims": result.hallucinated_claims,
        })

    total = len(request.qa_pairs)
    overall_rate = hallucination_count / max(total, 1)

    return {
        "model_id": request.model_id,
        "total_pairs": total,
        "hallucination_rate": round(overall_rate, 4),
        "pass_rate": round(1 - overall_rate, 4),
        "meets_target": overall_rate < 0.02,
        "results": results,
    }
