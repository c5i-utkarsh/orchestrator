"""
Stage Planner — divides the training corpus into 3-5 curriculum stages
ordered from easy → hard, outputs curriculum_plan.json.
"""
import json
from dataclasses import dataclass, field
from pathlib import Path

from app.modules.curriculum.difficulty_scorer import DifficultyScore


@dataclass
class CurriculumStage:
    stage_id: int
    label: str                   # e.g. "Stage 1: Fundamentals"
    difficulty_range: tuple[float, float]
    doc_ids: list[str]
    doc_count: int
    avg_difficulty: float


@dataclass
class CurriculumPlan:
    stages: list[CurriculumStage]
    total_docs: int
    n_stages: int


class StagePlanner:
    def plan(
        self,
        scores: list[DifficultyScore],
        n_stages: int = 3,
    ) -> CurriculumPlan:
        if not scores:
            return CurriculumPlan(stages=[], total_docs=0, n_stages=n_stages)

        sorted_scores = sorted(scores, key=lambda s: s.score)
        total = len(sorted_scores)
        stage_size = total // n_stages
        remainder = total % n_stages

        stages = []
        stage_labels = [
            "Fundamentals", "Intermediate", "Advanced", "Expert", "Specialist"
        ]

        offset = 0
        for i in range(n_stages):
            extra = 1 if i < remainder else 0
            end = offset + stage_size + extra
            batch = sorted_scores[offset:end]
            offset = end

            avg_diff = sum(s.score for s in batch) / max(len(batch), 1)
            stages.append(CurriculumStage(
                stage_id=i + 1,
                label=f"Stage {i + 1}: {stage_labels[min(i, len(stage_labels) - 1)]}",
                difficulty_range=(
                    round(batch[0].score, 2),
                    round(batch[-1].score, 2),
                ),
                doc_ids=[s.doc_id for s in batch],
                doc_count=len(batch),
                avg_difficulty=round(avg_diff, 2),
            ))

        return CurriculumPlan(stages=stages, total_docs=total, n_stages=n_stages)

    def save(self, plan: CurriculumPlan, output_path: str) -> None:
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        data = {
            "n_stages": plan.n_stages,
            "total_docs": plan.total_docs,
            "stages": [
                {
                    "stage_id": s.stage_id,
                    "label": s.label,
                    "difficulty_range": list(s.difficulty_range),
                    "doc_count": s.doc_count,
                    "avg_difficulty": s.avg_difficulty,
                    "doc_ids": s.doc_ids,
                }
                for s in plan.stages
            ],
        }
        Path(output_path).write_text(json.dumps(data, indent=2))
