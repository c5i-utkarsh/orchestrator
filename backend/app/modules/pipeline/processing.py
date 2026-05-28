import re
from typing import Dict, List


def clean_text(text: str) -> str:
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r" {2,}", " ", text)
    text = re.sub(r"[\x00-\x08\x0b-\x0c\x0e-\x1f\x7f]", "", text)
    return text.strip()


def chunk_text(text: str, size: int = 400, overlap: int = 60) -> List[Dict]:
    words = text.split()
    chunks: List[Dict] = []
    start = 0
    idx = 0
    while start < len(words):
        end = min(start + size, len(words))
        chunks.append({
            "idx": idx,
            "text": " ".join(words[start:end]),
            "start_word": start,
            "end_word": end,
            "word_count": max(0, end - start),
        })
        start += size - overlap
        idx += 1
    return chunks


def validate_chunking(chunks: List[Dict], total_words: int, target_overlap: int) -> Dict:
    if total_words <= 0:
        return {
            "total_words": 0,
            "chunk_count": len(chunks),
            "covered_words": 0,
            "coverage_pct": 0.0,
            "target_overlap_words": target_overlap,
            "adjacent_pairs_checked": 0,
            "overlap_correct_pairs": 0,
            "overlap_correctness_pct": 0.0,
            "min_overlap_words": 0,
            "max_overlap_words": 0,
            "data_loss_detected": False,
        }

    intervals = sorted(
        [(max(0, c.get("start_word", 0)), min(total_words, c.get("end_word", 0))) for c in chunks],
        key=lambda x: x[0],
    )
    covered = 0
    if intervals:
        s, e = intervals[0]
        for ns, ne in intervals[1:]:
            if ns <= e:
                e = max(e, ne)
            else:
                covered += max(0, e - s)
                s, e = ns, ne
        covered += max(0, e - s)

    overlaps: List[int] = []
    correct_pairs = 0
    for i in range(1, len(chunks)):
        prev = chunks[i - 1]
        curr = chunks[i]
        prev_start = prev.get("start_word", 0)
        prev_end = prev.get("end_word", 0)
        curr_start = curr.get("start_word", 0)
        curr_end = curr.get("end_word", 0)
        actual_overlap = max(0, prev_end - curr_start)
        overlaps.append(actual_overlap)

        prev_len = max(0, prev_end - prev_start)
        curr_len = max(0, curr_end - curr_start)
        expected_overlap = min(target_overlap, prev_len, curr_len)
        if actual_overlap == expected_overlap:
            correct_pairs += 1

    pairs = max(0, len(chunks) - 1)
    overlap_pct = round((correct_pairs / pairs) * 100, 2) if pairs else 100.0
    coverage_pct = round((covered / total_words) * 100, 2) if total_words else 0.0

    return {
        "total_words": total_words,
        "chunk_count": len(chunks),
        "covered_words": covered,
        "coverage_pct": coverage_pct,
        "target_overlap_words": target_overlap,
        "adjacent_pairs_checked": pairs,
        "overlap_correct_pairs": correct_pairs,
        "overlap_correctness_pct": overlap_pct,
        "min_overlap_words": min(overlaps) if overlaps else 0,
        "max_overlap_words": max(overlaps) if overlaps else 0,
        "data_loss_detected": covered < total_words,
    }
