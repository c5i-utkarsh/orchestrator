"""Write curated and rejected corpora to disk."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from .models import Document

logger = logging.getLogger(__name__)


def write_curated(docs: list[Document], output_dir: str) -> int:
    """Write accepted documents to *output_dir* as plain-text files.

    Args:
        docs: All pipeline documents.
        output_dir: Destination directory (created if absent).

    Returns:
        Number of files written.
    """
    return _write(
        docs=[d for d in docs if d.accepted],
        output_dir=output_dir,
        label="curated",
    )


def write_rejected(docs: list[Document], output_dir: str) -> int:
    """Write rejected documents alongside a JSON metadata sidecar.

    Args:
        docs: All pipeline documents.
        output_dir: Destination directory (created if absent).

    Returns:
        Number of files written.
    """
    rejected = [d for d in docs if not d.accepted]
    _write(docs=rejected, output_dir=output_dir, label="rejected")

    # Sidecar: rejection metadata for all rejected docs
    manifest_path = Path(output_dir) / "rejection_manifest.json"
    manifest = [
        {
            "doc_id": d.doc_id,
            "source_path": d.source_path,
            "rejection_reason": d.rejection_reason.value if d.rejection_reason else None,
            "rejection_detail": d.rejection_detail,
        }
        for d in rejected
    ]
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    logger.info("Rejection manifest written to '%s'", manifest_path)
    return len(rejected)


def _write(docs: list[Document], output_dir: str, label: str) -> int:
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)

    for doc in docs:
        stem = Path(doc.source_path).stem
        dest = out / f"{stem}__{doc.doc_id[:8]}.txt"
        dest.write_text(doc.clean_text or doc.raw_text, encoding="utf-8")

    logger.info("Wrote %d %s documents to '%s'", len(docs), label, out)
    return len(docs)
