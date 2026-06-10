#!/usr/bin/env python3
"""MEAMA PRMTR ETL CLI — orchestrates load -> transform -> push.

Usage:
    python pipeline/run_etl.py --help
    python pipeline/run_etl.py --list                 # list the 14 sources
    python pipeline/run_etl.py                         # full run (Phase 1)
    python pipeline/run_etl.py --source orders         # single source
"""
from __future__ import annotations

import argparse
import sys

from etl import load


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="run_etl.py",
        description="MEAMA PRMTR ETL: CSV -> DuckDB staging -> Supabase upserts.",
    )
    parser.add_argument(
        "--list", action="store_true", help="list registered CSV sources and exit"
    )
    parser.add_argument(
        "--source", metavar="NAME", help="run a single source loader by name"
    )
    parser.add_argument(
        "--db", default="pipeline/data/staging.duckdb", help="DuckDB staging file path"
    )
    return parser


def cmd_list() -> int:
    sources = load.list_sources()
    print(f"{len(sources)} registered sources:\n")
    for s in sources:
        status = "TODO" if load.LOADERS.get(s.name) is load._todo_loader else "ready"
        print(f"  [{status:>5}] {s.name:<22} {s.description}  ({s.filename})")
    return 0


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    if args.list:
        return cmd_list()

    # Full pipeline is wired in Phase 1 (load -> transform -> push).
    print("ETL pipeline is scaffolded. Loaders are TODO stubs (run --list to see them).")
    print("Phase 1 will implement: load.load_source -> transform.transform -> push.push")
    if args.source:
        print(f"\nRequested single source: {args.source!r} — loader is a Phase 1 stub.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
