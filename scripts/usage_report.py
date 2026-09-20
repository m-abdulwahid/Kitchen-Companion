"""How much Omni have we used? Shows it at a glance and builds the files the organisers ask for.

Run from the repo root (any Python 3, standard library only):
    python scripts/usage_report.py
    python scripts/usage_report.py --extra "C:\\path\\to\\another\\yibu_api_calls.jsonl"

What it does:
  1. Reads the ledger the voice service writes (artifacts/yibu_api_calls.jsonl), plus any --extra ledgers
     and any listed in USAGE_EXTRA_LEDGERS in .env, drops duplicate call_ids, and writes the merged copy to
     artifacts/summary/ledger_merged.jsonl. Your original ledgers are never changed.
  2. Prints calls and tokens by purpose, model and day.
  3. Runs the organisers' own summarize_usage.py on the merged ledger, which writes the two files to submit:
     artifacts/summary/usage_summary.json and artifacts/summary/usage_by_model_key_purpose.csv.

The same numbers are on the password-protected page http://localhost:8000/usage. The logic lives in
voice/usage.py. See docs/usage-reporting.md for the full checklist. Nothing here is sent anywhere.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "voice"))
import usage  # noqa: E402


def print_table(title: str, groups: list[dict]) -> None:
    print(f"\n{title}")
    print(f"  {'':34s} {'calls':>6s} {'failed':>6s} {'input':>9s} {'output':>9s} {'total':>9s}")
    for g in groups:
        print(f"  {g['name'][:34]:34s} {g['calls']:6d} {g['failed']:6d} {g['input']:9d} {g['output']:9d} {g['total']:9d}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--extra", action="append", default=[], type=Path,
                        help="another ledger to merge in (repeat for several)")
    parser.add_argument("--no-official", action="store_true", help="skip running the organisers' summarize_usage.py")
    parser.add_argument("--redact-paths", action="store_true",
                        help="replace the local folder path in usage_summary.json (source.path) with a placeholder; "
                             "the organisers' tool always writes your full local path there")
    args = parser.parse_args()

    paths = [usage.LEDGER, *usage.extra_ledgers(), *args.extra]
    if not usage.LEDGER.exists():
        print(f"missing ledger: {usage.LEDGER}")
        return 1
    rows, sources = usage.merge(paths)
    for path, src in zip(paths, sources):
        print(f"{path}: " + (f"{src['records']} records, {src['new']} new after removing duplicates" if src["found"] else "NOT FOUND, skipped"))
    if not rows:
        print("no records yet")
        return 0

    agg = usage.aggregate(rows)
    t = agg["totals"]
    print("\n" + "=" * 72)
    print(f"USAGE SO FAR   ({agg['period']['first'][:16]}  ->  {agg['period']['last'][:16]})")
    print("=" * 72)
    print(f"  calls recorded : {t['calls']}   (ok {t['ok']}, failed {t['failed']})")
    print(f"  input tokens   : {t['input']:,}")
    print(f"  output tokens  : {t['output']:,}")
    print(f"  TOTAL tokens   : {t['total']:,}")
    print(f"  key(s) used    : {', '.join(agg['key_suffixes'])}")
    if t["no_usage_calls"]:
        print(f"  note: {t['no_usage_calls']} calls report no token usage (usually failed calls); they count as unknown, not zero")
    print_table("By purpose", agg["by_purpose"])
    print_table("By model", agg["by_model"])
    print_table("By day (local time)", agg["by_day"])
    print("\nThe organisers' guide states no limit. Compare the total against the allocation in your approval email.")

    if args.no_official:
        return 0
    print("\n" + "-" * 72)
    print("Running the organisers' summarize_usage.py on the merged ledger...")
    result = usage.generate_files(rows, redact_paths=args.redact_paths)
    print(result["message"])
    if not result["ok"]:
        return 1
    print(f"\nFiles to attach when you submit (due {usage.DEADLINE:%A %Y-%m-%d, %I:%M %p} Eastern):")
    for name in usage.SUMMARY_FILES:
        print(f"  {usage.OUT_DIR / name}")
    print("Before sending, read docs/usage-reporting.md (privacy checks and what to tell the organisers).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
