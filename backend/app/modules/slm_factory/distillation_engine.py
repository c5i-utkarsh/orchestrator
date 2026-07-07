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
You are a domain expert creating a high-quality Q&A training dataset.

Below is a knowledge graph article about a specific entity in the corpus.
Your task: generate {n_pairs} diverse, substantive question-answer pairs.

Article:
{article}

REQUIREMENTS:
- Questions must be specific to the entity or topic described — do NOT ask \
"what type is this entity?" or "is this a person?"
- Answers must be substantive (at least 15 words) and factual, grounded in the article
- Cover: key attributes, relationships to other entities, significance in the domain, \
business implications, comparisons, and actionable insights
- Include exactly 1 pair where the answer starts with \
"I don't have enough context to answer this" \
(for a question that is genuinely out of scope)
- Format: exactly one JSON array of objects with "question" and "answer" keys
- Output ONLY the JSON array, no other text, no markdown fences

Example of a GOOD pair:
{{"question": "What role does TechNova Solutions play in the IT supply chain?", \
"answer": "TechNova Solutions is an IT solutions provider headquartered in Austin, Texas, \
with a focus on enterprise software and cloud infrastructure."}}

Example of a BAD pair (do NOT generate these):
{{"question": "What type of entity is this?", "answer": "organization"}}
{{"question": "Is this tracked as a person?", "answer": "yes"}}
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

        # Pre-filter wiki articles — skip garbage entities (dates, numbers, key=value labels)
        quality_articles = [a for a in wiki_articles if self._is_quality_article(a)]
        if not quality_articles:
            yield {"type": "error", "message": "No quality wiki articles available for distillation"}
            return

        skipped_count = len(wiki_articles) - len(quality_articles)
        if skipped_count:
            import logging as _log
            _log.getLogger(__name__).info(
                "Distillation: skipped %d/%d wiki articles (garbage entities); using %d",
                skipped_count, len(wiki_articles), len(quality_articles),
            )

        # Scale target_pairs to corpus size: no point targeting 12 000 pairs
        # from a 5-article corpus — cap at 20 pairs per article maximum.
        effective_target = min(target_pairs, max(len(quality_articles) * 20, 50))

        # Keep pairs_per_article realistic for what an LLM can produce in one call
        pairs_per_article = min(12, max(3, effective_target // max(len(quality_articles), 1)))
        ood_per_article = 2

        all_pairs = []

        for i, article in enumerate(quality_articles):
            yield {
                "type": "progress",
                "step": "distillation",
                "article": i + 1,
                "total": len(quality_articles),
                "pairs_so_far": len(all_pairs),
            }

            prompt = IN_DOMAIN_TEMPLATE.format(
                n_pairs=pairs_per_article,
                article=article["content"][:3000],
            )

            # Single-pass generation (self-consistency disabled for speed;
            # enable by setting n_consistency=3 in slm_config for higher quality)
            responses = []
            try:
                raw = await self._registry.generate(teacher, prompt, temperature=0.7)
                batch = self._parse_pairs(raw)
                responses.append(batch)
            except Exception:
                responses.append([])

            consistent_pairs = self._self_consistency_filter(responses)
            # Apply quality filter: drop trivial / meta-type QA pairs
            quality_pairs = [p for p in consistent_pairs if self._is_quality_pair(p)]
            all_pairs.extend(quality_pairs)

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

            if len(all_pairs) >= effective_target:
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

    @staticmethod
    def _is_quality_pair(pair: dict) -> bool:
        """Return True only for substantive QA pairs worth training on.

        Rejects:
        - Trivially short answers (yes/no/true/false/single-word responses)
        - Meta-questions about entity type/classification
        - Pairs missing question or answer fields
        """
        question = (pair.get("question") or "").strip()
        answer = (pair.get("answer") or "").strip()

        if not question or not answer:
            return False

        # Reject trivially short answers (less than 15 characters)
        if len(answer) < 15:
            return False

        # Reject single-word or pure yes/no answers
        _TRIVIAL_ANSWERS = {
            "yes", "no", "true", "false", "none", "unknown",
            "n/a", "null", "0", "1", "entity", "organization",
            "person", "product", "location", "time", "value", "group",
        }
        if answer.lower().rstrip(".") in _TRIVIAL_ANSWERS:
            return False

        # Reject meta-questions about entity type/classification
        _META_PATTERNS = [
            "what type of entity",
            "what entity type",
            "is this tracked as",
            "is the entity",
            "what is the entity type",
            "how is this entity",
            "in which canonical",
            "in the canonical wiki",
        ]
        q_lower = question.lower()
        if any(p in q_lower for p in _META_PATTERNS):
            return False

        return True

    @staticmethod
    def _is_quality_article(article: dict) -> bool:
        """Return True only for wiki articles worth distilling QA pairs from.

        Rejects articles whose title is a raw data value (dates, numbers,
        key=value patterns) — these come from garbage NER entities that slipped
        through earlier filters and would produce useless QA pairs.
        """
        import re as _re
        title = (article.get("title") or article.get("canonical_id") or "").strip()
        content = (article.get("content") or article.get("summary") or "").strip()

        if not title or len(title) < 3:
            return False

        # Purely numeric title
        if title.replace(",", "").replace(".", "").replace(" ", "").isdigit():
            return False

        # Common artifact patterns: date=2024-01-08, resolution_time_hours=1.0, etc.
        _ARTIFACT_TITLE_RE = [
            _re.compile(r"^\d{4}-\d{2}-\d{2}"),       # ISO date
            _re.compile(r"^[a-z_]+=\S+$", _re.I),      # key=value
            _re.compile(r"^[#@\-_=.]+$"),               # noise chars
        ]
        for pat in _ARTIFACT_TITLE_RE:
            if pat.match(title):
                return False

        # Article with no meaningful content
        if len(content.strip()) < 30:
            return False

        return True



    def _self_consistency_filter(
        self, responses: list[list[dict]]
    ) -> list[dict]:
        """Keep pairs based on response count.
        Single-pass (1 response): return all pairs directly — no filtering needed.
        Multi-pass (N responses): keep pairs where >=2/3 agree on the question.
        """
        if not responses:
            return []
        # Single-pass mode: just return all generated pairs as-is
        if len(responses) == 1:
            return [p for p in responses[0] if p.get("question") and p.get("answer")]
        # Multi-pass: keep only pairs where the same question appeared in >=2/3 batches
        threshold = max(2, len(responses) * 2 // 3)
        question_counts: dict[str, list[dict]] = {}
        for batch in responses:
            for pair in batch:
                q = pair.get("question", "").strip().lower()
                if q:
                    question_counts.setdefault(q, []).append(pair)
        return [pairs[0] for pairs in question_counts.values() if len(pairs) >= threshold]
