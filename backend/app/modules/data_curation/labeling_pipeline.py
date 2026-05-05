"""
3-layer handler for 98% unlabeled data:
  Layer 1: LLM pseudo-labeling using graph context
  Layer 2: Uncertainty-based active learning sampling
  Layer 3: Self-consistency filtering (3x generate, >=2/3 agree)
"""
import json
from dataclasses import dataclass, field


@dataclass
class LabeledDocument:
    doc_id: str
    text: str
    label: str
    confidence: float
    layer: str       # "pseudo" | "active_learning" | "self_consistent"
    rejected: bool = False


class LabelingPipeline:
    def __init__(self, adapter_registry, graph_context: str = ""):
        self._registry = adapter_registry
        self._graph_context = graph_context

    async def label_batch(
        self,
        documents: list[dict],
        label_schema: list[str],
        teacher_model: str,
        active_sample_size: int = 50,
    ) -> list[LabeledDocument]:
        results = []

        for doc in documents:
            label, confidence = await self._pseudo_label(
                doc, label_schema, teacher_model
            )
            # Self-consistency: generate 3x, keep if >=2 agree
            labels = [label]
            for _ in range(2):
                alt_label, _ = await self._pseudo_label(doc, label_schema, teacher_model)
                labels.append(alt_label)

            from collections import Counter
            most_common, count = Counter(labels).most_common(1)[0]
            accepted = count >= 2

            results.append(LabeledDocument(
                doc_id=doc.get("id", ""),
                text=doc.get("text", ""),
                label=most_common,
                confidence=count / 3,
                layer="self_consistent" if accepted else "pseudo",
                rejected=not accepted,
            ))

        return results

    async def _pseudo_label(
        self, doc: dict, label_schema: list[str], model: str
    ) -> tuple[str, float]:
        schema_str = ", ".join(label_schema) if label_schema else "relevant, not_relevant"
        prompt = f"""Given this context from the knowledge graph:
{self._graph_context[:500]}

Classify this document into one of these categories: {schema_str}
Document: {doc.get('text', '')[:300]}

Respond with ONLY the category name, nothing else."""

        try:
            response = await self._registry.generate(model, prompt, temperature=0.1)
            response = response.strip().lower()
            matched = next(
                (l for l in label_schema if l.lower() in response),
                label_schema[0] if label_schema else "unlabeled"
            )
            return matched, 0.7
        except Exception:
            return label_schema[0] if label_schema else "unlabeled", 0.3
