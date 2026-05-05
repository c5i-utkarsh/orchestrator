"""
LinUCB Contextual Bandit for model routing.

Feature vector:
  - query_embedding (1536-dim)
  - task_type one-hot (8 task types)
  - token_count (normalized)
  - entity_count (normalized)

Reward = f(task_completion, 1-hallucination_rate, user_acceptance)
"""
import json
import numpy as np
from pathlib import Path
from dataclasses import dataclass

from app.config import get_settings

settings = get_settings()

TASK_TYPES = [
    "domain_qa",
    "code_generation",
    "data_analysis",
    "time_series",
    "general_reasoning",
    "ui_building",
    "financial",
    "geospatial",
]

EMBEDDING_DIM = 1536
FEATURE_DIM = EMBEDDING_DIM + len(TASK_TYPES) + 2  # +2 for token/entity counts


@dataclass
class BanditUpdate:
    model_id: str
    context_vector: list[float]
    reward: float


class LinUCB:
    """
    LinUCB algorithm per model arm.
    Maintains A matrix (d×d) and b vector (d×1) per arm.
    """

    ALPHA = 1.0  # exploration parameter

    def __init__(self, feature_dim: int = FEATURE_DIM):
        self.d = feature_dim
        self._arms: dict[str, dict] = {}  # model_id -> {A, b}

    def _init_arm(self, model_id: str) -> None:
        if model_id not in self._arms:
            self._arms[model_id] = {
                "A": np.eye(self.d),
                "b": np.zeros(self.d),
            }

    def _build_feature_vector(
        self,
        query_embedding: list[float],
        task_type: str,
        token_count: int,
        entity_count: int,
    ) -> np.ndarray:
        emb = np.array(query_embedding[:EMBEDDING_DIM], dtype=np.float64)
        if len(emb) < EMBEDDING_DIM:
            emb = np.pad(emb, (0, EMBEDDING_DIM - len(emb)))

        task_onehot = np.zeros(len(TASK_TYPES))
        if task_type in TASK_TYPES:
            task_onehot[TASK_TYPES.index(task_type)] = 1.0

        scalars = np.array([
            min(token_count / 4096, 1.0),
            min(entity_count / 50, 1.0),
        ])

        return np.concatenate([emb, task_onehot, scalars])

    def score(
        self,
        model_ids: list[str],
        query_embedding: list[float],
        task_type: str,
        token_count: int,
        entity_count: int,
    ) -> dict[str, float]:
        """Return UCB score for each model arm."""
        x = self._build_feature_vector(query_embedding, task_type, token_count, entity_count)
        scores = {}

        for model_id in model_ids:
            self._init_arm(model_id)
            arm = self._arms[model_id]
            A_inv = np.linalg.inv(arm["A"])
            theta = A_inv @ arm["b"]
            ucb = float(theta @ x + self.ALPHA * np.sqrt(x @ A_inv @ x))
            scores[model_id] = ucb

        return scores

    def update(self, model_id: str, context_vector: list[float], reward: float) -> None:
        """Update arm parameters with observed reward."""
        self._init_arm(model_id)
        x = np.array(context_vector[:self.d], dtype=np.float64)
        if len(x) < self.d:
            x = np.pad(x, (0, self.d - len(x)))

        arm = self._arms[model_id]
        arm["A"] += np.outer(x, x)
        arm["b"] += reward * x

    def compute_reward(
        self,
        task_completion: float,
        hallucination_rate: float,
        user_acceptance: float,
    ) -> float:
        """Composite reward: 0-1."""
        return float(
            0.50 * task_completion +
            0.35 * (1.0 - hallucination_rate) +
            0.15 * user_acceptance
        )

    def save(self, path: str) -> None:
        state = {
            model_id: {
                "A": arm["A"].tolist(),
                "b": arm["b"].tolist(),
            }
            for model_id, arm in self._arms.items()
        }
        Path(path).write_text(json.dumps(state))

    def load(self, path: str) -> None:
        if not Path(path).exists():
            return
        state = json.loads(Path(path).read_text())
        self._arms = {
            model_id: {
                "A": np.array(data["A"]),
                "b": np.array(data["b"]),
            }
            for model_id, data in state.items()
        }


# Module-level singleton
_bandit: LinUCB | None = None


def get_bandit() -> LinUCB:
    global _bandit
    if _bandit is None:
        _bandit = LinUCB()
        bandit_path = Path(settings.slm_store_path) / "bandit_state.json"
        _bandit.load(str(bandit_path))
    return _bandit


def save_bandit() -> None:
    bandit_path = Path(settings.slm_store_path) / "bandit_state.json"
    get_bandit().save(str(bandit_path))
