"""
Hallucination detector — LLM-judge approach.
Validates model answers against graph.json entity facts.
Target: <2% hallucination rate.
"""
import json
from dataclasses import dataclass
from pathlib import Path


JUDGE_PROMPT = """\
You are a hallucination detection judge. Given:
1. A KNOWLEDGE GRAPH CONTEXT (ground truth entities and facts)
2. A MODEL ANSWER

Identify claims in the answer that:
  - Contradict facts in the knowledge graph
  - Introduce entities or numbers not present in the context
  - Are plausible but unverifiable from the given context

Respond with JSON:
{{
  "hallucinated_claims": ["claim1", "claim2"],
  "hallucination_rate": 0.0,
  "verdict": "PASS" | "FAIL"
}}

KNOWLEDGE GRAPH CONTEXT:
{graph_context}

MODEL ANSWER:
{answer}
"""


@dataclass
class HallucinationResult:
    verdict: str               # PASS | FAIL
    hallucination_rate: float  # 0.0-1.0
    hallucinated_claims: list[str]
    doc_id: str = ""


class HallucinationDetector:
    def __init__(self, adapter_registry, judge_model: str | None = None):
        self._registry = adapter_registry
        self._judge_model = judge_model

    async def detect(
        self,
        answer: str,
        graph_context: str,
        doc_id: str = "",
    ) -> HallucinationResult:
        judge_info = await self._registry.get_best_local_model() if not self._judge_model else None
        judge = self._judge_model or (judge_info.model_id if judge_info else None)
        if not judge:
            return HallucinationResult(
                verdict="UNKNOWN",
                hallucination_rate=0.0,
                hallucinated_claims=[],
                doc_id=doc_id,
            )

        prompt = JUDGE_PROMPT.format(
            graph_context=graph_context[:2000],
            answer=answer[:1000],
        )

        try:
            raw = await self._registry.generate(judge, prompt, temperature=0.0)
            # Extract JSON from response
            import re
            match = re.search(r"\{.*\}", raw, re.DOTALL)
            if match:
                data = json.loads(match.group())
                return HallucinationResult(
                    verdict=data.get("verdict", "UNKNOWN"),
                    hallucination_rate=float(data.get("hallucination_rate", 0.0)),
                    hallucinated_claims=data.get("hallucinated_claims", []),
                    doc_id=doc_id,
                )
        except Exception:
            pass

        return HallucinationResult(
            verdict="UNKNOWN",
            hallucination_rate=0.0,
            hallucinated_claims=[],
            doc_id=doc_id,
        )
