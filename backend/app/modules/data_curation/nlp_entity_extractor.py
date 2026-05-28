"""
NLP entity & relationship extractor — ported from AI_Orchestrator/backend/entity_extraction.py.
Uses spaCy en_core_web_sm when available; falls back to regex patterns.
"""
import re
import logging
from typing import List, Dict, Tuple

logger = logging.getLogger(__name__)

try:
    import spacy
    _nlp = spacy.load("en_core_web_sm")
    SPACY_AVAILABLE = True
    logger.info("spaCy en_core_web_sm loaded")
except Exception as _e:
    SPACY_AVAILABLE = False
    logger.warning("spaCy unavailable (%s) — using regex entity fallback", _e)


# ── Entity type normalisation ─────────────────────────────────────────────────

_LABEL_TYPE_MAP = {
    "ORG": "organization", "PERSON": "person", "GPE": "location",
    "LOC": "location", "FAC": "facility", "PRODUCT": "product",
    "EVENT": "event", "LAW": "regulation", "DATE": "time",
    "TIME": "time", "MONEY": "value", "PERCENT": "value",
    "QUANTITY": "value", "ORDINAL": "value", "CARDINAL": "value",
    "NORP": "group", "WORK_OF_ART": "artifact", "LANGUAGE": "language",
}


def _label_to_type(label: str) -> str:
    return _LABEL_TYPE_MAP.get(label, "entity")


# ── Public API ────────────────────────────────────────────────────────────────

def extract_entities(text: str) -> List[Dict]:
    """Extract named entities from *text*. Returns list of {text, label, type}."""
    if SPACY_AVAILABLE:
        return _spacy_entities(text)
    return _regex_entities(text)


def extract_relationships(text: str, entities: List[Dict]) -> List[Dict]:
    """
    Extract co-occurrence relationships between entities.
    Returns list of {source, target, relation, context}.
    """
    rels: List[Dict] = []
    sentences = re.split(r"[.!?]", text)
    for sent in sentences:
        found = [e for e in entities if e["text"] in sent]
        for i in range(len(found)):
            for j in range(i + 1, min(i + 4, len(found))):
                rels.append({
                    "source": found[i]["text"],
                    "target": found[j]["text"],
                    "relation": _infer_relation(sent, found[i], found[j]),
                    "context": sent.strip()[:120],
                })
    return rels[:250]


# ── Internal helpers ──────────────────────────────────────────────────────────

def _spacy_entities(text: str) -> List[Dict]:
    chunk = text[:100_000]
    doc = _nlp(chunk)
    seen: set = set()
    out: List[Dict] = []
    for ent in doc.ents:
        key = (ent.text.strip(), ent.label_)
        if key not in seen and ent.text.strip():
            seen.add(key)
            out.append({
                "text": ent.text.strip(),
                "label": ent.label_,
                "type": _label_to_type(ent.label_),
            })
    return out


def _regex_entities(text: str) -> List[Dict]:
    out: List[Dict] = []
    seen: set = set()

    # Money / numeric values
    for m in re.finditer(
        r"\$[\d,]+(?:\.\d+)?(?:[MKB])?|\b\d+(?:,\d{3})*(?:\.\d+)?(?:\s*(?:million|billion|thousand))?\b",
        text,
    ):
        v = m.group().strip()
        if v not in seen:
            seen.add(v)
            out.append({"text": v, "label": "MONEY", "type": "value"})

    # Dates
    for m in re.finditer(
        r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4}"
        r"|\b\d{1,2}/\d{1,2}/\d{2,4}\b|\bQ[1-4]\s+\d{4}\b",
        text,
    ):
        v = m.group().strip()
        if v not in seen:
            seen.add(v)
            out.append({"text": v, "label": "DATE", "type": "time"})

    # Title-case multi-word phrases (likely proper nouns)
    for m in re.finditer(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b", text):
        v = m.group().strip()
        if v not in seen and len(v) > 3:
            seen.add(v)
            out.append({"text": v, "label": "ENTITY", "type": "entity"})

    # Acronyms
    for m in re.finditer(r"\b[A-Z]{2,6}\b", text):
        v = m.group().strip()
        if v not in seen:
            seen.add(v)
            out.append({"text": v, "label": "ORG", "type": "organization"})

    return out[:150]


def _infer_relation(sent: str, e1: Dict, e2: Dict) -> str:  # noqa: ARG001
    sl = sent.lower()
    if any(w in sl for w in ["revenue", "sales", "profit", "income"]):
        return "has_revenue"
    if any(w in sl for w in ["employ", "hire", "staff"]):
        return "employs"
    if any(w in sl for w in ["own", "acquir", "subsidiar"]):
        return "owns"
    if any(w in sl for w in ["partner", "collaborat", "joint"]):
        return "partners_with"
    if any(w in sl for w in ["locat", "headquarter", "based in", "office"]):
        return "located_in"
    if any(w in sl for w in ["found", "establish", "creat"]):
        return "founded_by"
    if any(w in sl for w in ["compet", "rival"]):
        return "competes_with"
    if any(w in sl for w in ["regulat", "govern", "oversee"]):
        return "regulated_by"
    if e1.get("type") == "time" or e2.get("type") == "time":
        return "occurred_at"
    return "related_to"


def extract_entities_from_chunks(chunks: List[Dict]) -> Tuple[List[Dict], List[Dict]]:
    """Run entity + relationship extraction per chunk, tagging each result with chunk_idx.

    Returns (entities, relationships) where every item carries:
      - chunk_idx   : int  — index of the chunk it was found in
      - chunk_preview: str — first 80 chars of the source chunk text
    Entities are de-duplicated by (text, label); the first-seen chunk_idx is kept.
    Up to 3 chunk_occurrences recorded per entity.
    """
    seen_entities: dict = {}   # (text, label) -> entity dict
    all_relationships: List[Dict] = []

    for chunk in chunks:
        cidx = chunk.get("idx", 0)
        ctext = chunk.get("text", "")
        preview = ctext[:80]

        chunk_ents = extract_entities(ctext)
        for ent in chunk_ents:
            key = (ent["text"], ent["label"])
            if key not in seen_entities:
                seen_entities[key] = {
                    **ent,
                    "chunk_idx": cidx,
                    "chunk_preview": preview,
                }
            else:
                existing = seen_entities[key]
                occurrences = existing.setdefault("chunk_occurrences", [existing["chunk_idx"]])
                if cidx not in occurrences and len(occurrences) < 3:
                    occurrences.append(cidx)

        chunk_rels = extract_relationships(ctext, chunk_ents)
        for rel in chunk_rels:
            all_relationships.append({
                **rel,
                "chunk_idx": cidx,
                "chunk_preview": preview,
            })

    entities = list(seen_entities.values())
    relationships = all_relationships[:500]
    return entities, relationships
