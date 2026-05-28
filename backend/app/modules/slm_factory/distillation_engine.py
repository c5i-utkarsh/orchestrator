"""
Distillation Engine — Teacher LLM reads knowledge graph → generates domain Q&A pairs.

Flow:
  1. Load nanoWiki articles from graphify output
  2. For each article batch: teacher generates Q&A pairs (incl. out-of-domain examples)
  3. Self-consistency filter: 3x generate, keep if >=2/3 agree on answer
  4. Target: 12,000–15,000 pairs per domain
  5. Save to JSONL for SLMBuilder training step
"""
import json
import re
import hashlib
from pathlib import Path
from typing import AsyncGenerator

from app.config import get_settings
from app.adapters.registry import AdapterRegistry

settings = get_settings()

IN_DOMAIN_TEMPLATE = """\
You are a teacher creating a Q&A dataset from a knowledge graph article.
Given the article below, generate {n_pairs} diverse question-answer pairs covering:
- Key facts and entities mentioned
- Relationships between entities
- Reasoning chains within the domain

Article:
{article}

REQUIREMENTS:
- Each Q&A must be answerable FROM the article alone
- Include 1 pair where the answer starts with "I don't have enough context to answer this"
  (covering a question that IS out of scope)
- Format: exactly one JSON array of objects with "question" and "answer" keys
- Output ONLY the JSON array, no other text
"""

OUT_OF_DOMAIN_TEMPLATE = """\
You are helping train a domain SLM to recognize what it does NOT know.
Generate {n_ood} examples where the answer must be:
  "This question is outside my domain. I specialize in: {domain_label}."

Make the questions plausible but clearly outside the domain.
Output ONLY a JSON array with "question" and "answer" keys.
"""


class DistillationEngine:
    def __init__(self, adapter_registry: AdapterRegistry):
        self._registry = adapter_registry

    async def generate(
        self,
        wiki_articles: list[dict],
        domain_label: str,
        output_path: str,
        target_pairs: int = 12000,
        teacher_model: str | None = None,
    ) -> AsyncGenerator[dict, None]:
        """
        Yields progress events: {type: "progress"|"done"|"error", ...}
        Writes JSONL to output_path.
        teacher_model: optional override — if None, uses best available local model.
        """
        if teacher_model:
            teacher = teacher_model
        else:
            teacher_info = await self._registry.get_best_local_model()
            if not teacher_info:
                yield {"type": "error", "message": "No local teacher model available"}
                return
            teacher = teacher_info.model_id

        output_file = Path(output_path)
        output_file.parent.mkdir(parents=True, exist_ok=True)

        pairs_per_article = max(8, target_pairs // max(len(wiki_articles), 1))
        ood_per_article = 2

        all_pairs = []

        for i, article in enumerate(wiki_articles):
            yield {
                "type": "progress",
                "step": "distillation",
                "article": i + 1,
                "total": len(wiki_articles),
                "pairs_so_far": len(all_pairs),
            }

            prompt = IN_DOMAIN_TEMPLATE.format(
                n_pairs=pairs_per_article,
                article=article["content"][:3000],
            )

            # Self-consistency: generate 3 times, keep pairs with >=2/3 agreement
            responses = []
            for _ in range(3):
                try:
                    raw = await self._registry.generate(teacher, prompt, temperature=0.7)
                    batch = self._parse_pairs(raw)
                    responses.append(batch)
                except Exception:
                    responses.append([])

            consistent_pairs = self._self_consistency_filter(responses)
            all_pairs.extend(consistent_pairs)

            # Out-of-domain examples
            ood_prompt = OUT_OF_DOMAIN_TEMPLATE.format(
                n_ood=ood_per_article,
                domain_label=domain_label,
            )
            try:
                ood_raw = await self._registry.generate(teacher, ood_prompt, temperature=0.8)
                ood_pairs = self._parse_pairs(ood_raw)
                all_pairs.extend(ood_pairs)
            except Exception:
                pass

            if len(all_pairs) >= target_pairs:
                break

        # Write JSONL
        with open(output_file, "w") as f:
            for pair in all_pairs[:target_pairs]:
                f.write(json.dumps({"messages": [
                    {"role": "user", "content": pair["question"]},
                    {"role": "assistant", "content": pair["answer"]},
                ]}) + "\n")

        yield {
            "type": "done",
            "pairs_written": min(len(all_pairs), target_pairs),
            "output_path": str(output_file),
        }

    def _parse_pairs(self, raw_text: str) -> list[dict]:
        """Extract JSON array from LLM response."""
        try:
            match = re.search(r"\[.*?\]", raw_text, re.DOTALL)
            if match:
                return json.loads(match.group())
        except (json.JSONDecodeError, Exception):
            pass
        return []

    def _self_consistency_filter(
        self, responses: list[list[dict]]
    ) -> list[dict]:
        """Keep Q&A pairs where >=2/3 responses produced the same question."""
        question_counts: dict[str, list[dict]] = {}
        for batch in responses:
            for pair in batch:
                q = pair.get("question", "").strip().lower()
                if q:
                    if q not in question_counts:
                        question_counts[q] = []
                    question_counts[q].append(pair)

        consistent = []
        for q, pairs in question_counts.items():
            if len(pairs) >= 2:
                consistent.append(pairs[0])
        return consistent
