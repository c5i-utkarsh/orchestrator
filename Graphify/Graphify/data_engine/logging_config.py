"""Centralised logging setup for the pipeline."""

from __future__ import annotations

import logging
import sys
from pathlib import Path


def configure_logging(level: str = "INFO", log_file: str | None = None) -> None:
    """Configure root logger with console + optional file handler.

    Args:
        level: Standard Python log-level string (DEBUG, INFO, WARNING, ERROR).
        log_file: Path to write log output; skipped if None.
    """
    numeric_level = getattr(logging, level.upper(), logging.INFO)

    handlers: list[logging.Handler] = [
        _build_stream_handler(numeric_level),
    ]

    if log_file:
        Path(log_file).parent.mkdir(parents=True, exist_ok=True)
        handlers.append(_build_file_handler(log_file, numeric_level))

    logging.basicConfig(
        level=numeric_level,
        format="%(asctime)s  %(levelname)-8s  %(name)s — %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=handlers,
        force=True,
    )


def _build_stream_handler(level: int) -> logging.StreamHandler:
    handler = logging.StreamHandler(sys.stdout)
    handler.setLevel(level)
    return handler


def _build_file_handler(path: str, level: int) -> logging.FileHandler:
    handler = logging.FileHandler(path, encoding="utf-8")
    handler.setLevel(level)
    return handler
