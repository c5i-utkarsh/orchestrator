"""CLI entry point: python run_pipeline.py [--config path/to/config.json]"""

from __future__ import annotations

import argparse
import sys


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Data Readiness and Curation Engine",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--config",
        default="config.json",
        help="Path to the pipeline configuration file",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    try:
        from data_engine.main import run
        result = run(config_path=args.config)
        print(
            f"\nPipeline complete.\n"
            f"  Accepted : {result.total_accepted}\n"
            f"  Rejected : {result.total_rejected}\n"
            f"  Graph    : {result.graph_nodes} nodes, {result.graph_edges} edges\n"
            f"  Time     : {result.duration_seconds}s"
        )
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
