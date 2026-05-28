"""Text normalisation utilities."""

from __future__ import annotations

import re
import unicodedata


_WHITESPACE_RE = re.compile(r"\s+")
_CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_URL_RE = re.compile(r"https?://\S+|www\.\S+")


def normalize(text: str, *, remove_urls: bool = True, lowercase: bool = False) -> str:
    """Return a clean version of *text*.

    Steps applied in order:
    1. Unicode NFKC normalisation (homoglyph collapse, ligature expansion).
    2. Strip C0/C1 control characters (but keep \\t, \\n, \\r).
    3. Optionally strip URLs.
    4. Collapse repeated whitespace to single space.
    5. Strip leading/trailing whitespace.
    6. Optionally lowercase.

    Args:
        text: Raw input string.
        remove_urls: Strip HTTP/HTTPS URLs before returning.
        lowercase: Fold to lowercase.

    Returns:
        Normalised string.
    """
    text = unicodedata.normalize("NFKC", text)
    text = _CONTROL_CHAR_RE.sub(" ", text)
    if remove_urls:
        text = _URL_RE.sub(" ", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    if lowercase:
        text = text.lower()
    return text


def tokenize(text: str) -> list[str]:
    """Simple whitespace tokeniser that strips punctuation from token edges.

    Args:
        text: Input string (should already be normalised).

    Returns:
        List of lowercase tokens.
    """
    return [tok.strip(".,;:!?\"'()[]{}") for tok in text.lower().split() if tok.strip(".,;:!?\"'()[]{}")]


def sentence_split(text: str) -> list[str]:
    """Naive sentence splitter on '. ', '! ', '? '.

    Args:
        text: Input string.

    Returns:
        List of sentence strings.
    """
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return [p.strip() for p in parts if p.strip()]
