import re
from dataclasses import dataclass


@dataclass
class QualityScore:
    doc_id: str
    composite_score: float       # 0-1, higher is better
    length_score: float
    char_ratio_score: float
    language_score: float
    passed: bool


class QualityScorer:
    """
    Multi-signal quality scoring:
      - Length percentile (removes outlier-short and outlier-long docs)
      - Special character ratio (flags extraction artifacts)
      - Language detection (flags non-target language docs)
    """

    MIN_CHARS = 50
    MAX_CHARS = 100_000
    MAX_SPECIAL_CHAR_RATIO = 0.25
    TARGET_LANGUAGE = "en"
    PASS_THRESHOLD = 0.50

    def score_batch(self, documents: list[dict]) -> list[QualityScore]:
        if not documents:
            return []
        lengths = [len(d.get("text", "")) for d in documents]
        p10 = sorted(lengths)[max(0, int(len(lengths) * 0.10))]
        p90 = sorted(lengths)[min(len(lengths) - 1, int(len(lengths) * 0.90))]

        scores = []
        for doc in documents:
            score = self._score_one(doc, p10, p90)
            scores.append(score)
        return scores

    def _score_one(self, doc: dict, p10: int, p90: int) -> QualityScore:
        text = doc.get("text", "")
        doc_id = doc.get("id", "unknown")

        # Length score
        length = len(text)
        if length < self.MIN_CHARS or length > self.MAX_CHARS:
            length_score = 0.0
        elif length < p10:
            length_score = length / max(p10, 1)
        elif length > p90:
            length_score = p90 / max(length, 1)
        else:
            length_score = 1.0

        # Special character ratio score
        special_chars = len(re.findall(r"[^\w\s.,!?;:()\-'\"]", text))
        special_ratio = special_chars / max(len(text), 1)
        char_ratio_score = max(0.0, 1.0 - (special_ratio / self.MAX_SPECIAL_CHAR_RATIO))

        # Language detection score
        language_score = self._detect_language_score(text)

        composite = (
            0.30 * length_score +
            0.35 * char_ratio_score +
            0.35 * language_score
        )

        return QualityScore(
            doc_id=doc_id,
            composite_score=round(composite, 3),
            length_score=round(length_score, 3),
            char_ratio_score=round(char_ratio_score, 3),
            language_score=round(language_score, 3),
            passed=composite >= self.PASS_THRESHOLD,
        )

    def _detect_language_score(self, text: str) -> float:
        try:
            from langdetect import detect, LangDetectException
            lang = detect(text[:500])
            return 1.0 if lang == self.TARGET_LANGUAGE else 0.4
        except Exception:
            return 0.7  # neutral if detection fails
