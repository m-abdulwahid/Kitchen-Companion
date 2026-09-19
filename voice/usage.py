"""Usage accounting for the Omni API: read the audit ledger(s), total them, and build the files the
organisers ask for. Standard library only. Used by the /usage page in app.py and by
scripts/usage_report.py, so the two always agree. See docs/usage-reporting.md.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Iterable, Optional

ROOT = Path(__file__).resolve().parents[1]
LEDGER = ROOT / "artifacts" / "yibu_api_calls.jsonl"
OUT_DIR = ROOT / "artifacts" / "summary"
MERGED = OUT_DIR / "ledger_merged.jsonl"
OFFICIAL = ROOT / "examples" / "yibuapi_examples_20260918_v01" / "summarize_usage.py"
SUMMARY_FILES = ("usage_summary.json", "usage_by_model_key_purpose.csv")

# 11:59 PM EDT on 2026-09-20 (the organisers' deadline, America/Toronto).
DEADLINE = datetime(2026, 9, 20, 23, 59, tzinfo=timezone(timedelta(hours=-4)))

# Usage we know is missing from the ledger. Keep this list honest: it goes into the email draft.
KNOWN_GAPS = [
    "Two probe calls from scripts/discover.py (a text call and an audio call, about 00:58 Eastern on "
    "2026-09-19) were made before logging existed. Their reported usage was 23 and 69 tokens (92 total).",
    "Our run that tested all 56 voices made 64 calls but logged 63: the audit writer overwrote one record when "
    "several threads wrote at once (about 100 tokens). Fixed with a lock; no replacement record was invented.",
]


def _dotenv() -> dict[str, str]:
    values: dict[str, str] = {}
    path = ROOT / ".env"
    if path.exists():
        for raw in path.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def env(name: str, default: str = "") -> str:
    return os.environ.get(name) or _dotenv().get(name, default)


def extra_ledgers() -> list[Path]:
    """Other ledgers to merge, from USAGE_EXTRA_LEDGERS in .env (separated by ';' on Windows, ':' elsewhere)."""
    return [Path(p.strip()) for p in env("USAGE_EXTRA_LEDGERS").split(os.pathsep) if p.strip()]


def load_ledger(path: Path) -> tuple[list[dict], int]:
    rows, bad = [], 0
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except ValueError:
            bad += 1
    return rows, bad


def merge(paths: Iterable[Path]) -> tuple[list[dict], list[dict]]:
    """All records from the ledgers, duplicates (same call_id) dropped, oldest first. Originals are never changed."""
    merged: dict[str, dict] = {}
    sources = []
    for index, path in enumerate(paths):
        label = "main ledger" if index == 0 else f"extra ledger ({path.parent.parent.name})"
        if not path.exists():
            sources.append({"label": label, "found": False, "records": 0, "new": 0, "bad_lines": 0})
            continue
        rows, bad = load_ledger(path)
        new = 0
        for row in rows:
            call_id = row.get("call_id")
            if call_id and call_id not in merged:
                merged[call_id] = row
                new += 1
        sources.append({"label": label, "found": True, "records": len(rows), "new": new, "bad_lines": bad})
    return sorted(merged.values(), key=lambda r: r.get("timestamp_utc", "")), sources


def tokens(row: dict, field: str) -> int:
    value = row.get(field)
    return value if isinstance(value, int) else 0


def _group(rows: list[dict], key) -> list[dict]:
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        groups[str(key(row))].append(row)
    out = [{
        "name": name,
        "calls": len(items),
        "failed": sum(1 for r in items if not r.get("ok")),
        "input": sum(tokens(r, "input_tokens") for r in items),
        "output": sum(tokens(r, "output_tokens") for r in items),
        "total": sum(tokens(r, "total_tokens") for r in items),
    } for name, items in groups.items()]
    return sorted(out, key=lambda g: -g["total"])


def aggregate(rows: list[dict], recent: int = 30) -> dict:
    if not rows:
        return {"totals": {"calls": 0, "ok": 0, "failed": 0, "input": 0, "output": 0, "total": 0, "no_usage_calls": 0},
                "by_purpose": [], "by_model": [], "by_day": [], "recent": [], "period": None, "key_suffixes": []}
    ok = sum(1 for r in rows if r.get("ok"))
    return {
        "totals": {
            "calls": len(rows), "ok": ok, "failed": len(rows) - ok,
            "input": sum(tokens(r, "input_tokens") for r in rows),
            "output": sum(tokens(r, "output_tokens") for r in rows),
            "total": sum(tokens(r, "total_tokens") for r in rows),
            "no_usage_calls": sum(1 for r in rows if r.get("total_tokens") is None),
        },
        "by_purpose": _group(rows, lambda r: r.get("purpose")),
        "by_model": _group(rows, lambda r: r.get("model")),
        "by_day": sorted(_group(rows, lambda r: str(r.get("timestamp_local", ""))[:10]), key=lambda g: g["name"]),
        "recent": [{
            "when": str(r.get("timestamp_local", ""))[:19], "purpose": r.get("purpose"), "model": r.get("model"),
            "ok": bool(r.get("ok")), "status": r.get("status_code"), "tokens": r.get("total_tokens"),
            "latency_s": r.get("latency_s"),
        } for r in reversed(rows[-recent:])],
        "period": {"first": str(rows[0].get("timestamp_local", ""))[:19], "last": str(rows[-1].get("timestamp_local", ""))[:19]},
        "key_suffixes": sorted({str(r.get("key_suffix")) for r in rows}),
    }


def failed_calls(rows: list[dict]) -> list[dict]:
    """Short, harmless description of each failed call (the ledger's error text is trimmed)."""
    out = []
    for r in rows:
        if not r.get("ok"):
            message = ""
            try:
                message = json.loads(r.get("error") or "{}").get("error", {}).get("message", "")
            except ValueError:
                message = str(r.get("error") or "")
            out.append({"when": str(r.get("timestamp_local", ""))[:19], "purpose": r.get("purpose"),
                        "reason": message.replace("***.***.InvalidParameter:", "").replace("<400>", "").strip()[:90]})
    return out


def _summary_has_local_path(summary: Path) -> bool:
    """True if usage_summary.json contains an absolute local folder path (the organisers' tool writes one)."""
    try:
        path = json.loads(summary.read_text(encoding="utf-8")).get("source", {}).get("path", "")
    except (OSError, ValueError):
        return False
    return bool(re.match(r"^[A-Za-z]:[\\/]", path)) or path.startswith("/")


def privacy_checks(rows: list[dict]) -> list[dict]:
    """Checks the organisers ask for before sharing. Never returns the key itself."""
    key = env("OMNI_KEY")
    blob = json.dumps(rows, ensure_ascii=False)
    summary = OUT_DIR / "usage_summary.json"
    has_path = _summary_has_local_path(summary)
    return [
        {"name": "Full API key is not in the ledger", "ok": bool(key) and key not in blob,
         "detail": "Only the last 4 characters (key_suffix) are stored." if key else "OMNI_KEY is not set, so this could not be checked."},
        {"name": "Ledger holds no prompts or audio", "ok": not any(k in blob for k in ('"messages"', '"input_audio"', '"prompt"')),
         "detail": "Records contain counts, timings and short labels only."},
        {"name": "Summary has no local folder path", "ok": bool(summary.exists()) and not has_path,
         "detail": "The organisers' tool writes your full folder path into usage_summary.json (source.path). "
                   "Tick 'remove folder path' when generating if you do not want to share it." if has_path else
                   ("Generate the files to check." if not summary.exists() else "No absolute path found in usage_summary.json.")},
    ]


def files_info() -> list[dict]:
    out = []
    for name in SUMMARY_FILES:
        path = OUT_DIR / name
        if path.exists():
            stat = path.stat()
            out.append({"name": name, "exists": True, "bytes": stat.st_size,
                        "modified": datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M:%S")})
        else:
            out.append({"name": name, "exists": False, "bytes": 0, "modified": None})
    return out


def generate_files(rows: list[dict], redact_paths: bool = False) -> dict:
    """Write the merged ledger and run the organisers' summarize_usage.py on it."""
    if not OFFICIAL.exists():
        return {"ok": False, "message": "The organisers' summarize_usage.py was not found in examples/."}
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    MERGED.write_text("".join(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n" for r in rows), encoding="utf-8")
    done = subprocess.run([sys.executable, str(OFFICIAL), "--log", str(MERGED), "--out-dir", str(OUT_DIR)],
                          capture_output=True, text=True)
    if done.returncode != 0:
        return {"ok": False, "message": (done.stderr or done.stdout).strip()[-300:]}
    if redact_paths:
        path = OUT_DIR / "usage_summary.json"
        summary = json.loads(path.read_text(encoding="utf-8"))
        summary["source"]["path"] = "<local path removed>/" + MERGED.name
        path.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    totals = json.loads((OUT_DIR / "usage_summary.json").read_text(encoding="utf-8"))["totals"]
    return {"ok": True, "message": "Files written." + (" Folder path removed." if redact_paths else ""), "totals": totals}


def email_draft(agg: dict, failed: list[dict], sources: list[dict]) -> str:
    period = agg.get("period") or {}
    totals = agg["totals"]
    lines = [
        "Subject: Yibu API usage report",
        "",
        "Team name: [TEAM NAME]",
        "Project / repository link: [REPOSITORY LINK]",
        "Email used for the API application: [APPLICATION EMAIL]",
        f"Reporting period: {period.get('first', '?')} to {period.get('last', '?')} Eastern (regenerate the files right before sending)",
        f"Key suffix: {', '.join(agg.get('key_suffixes') or ['?'])}",
        "",
        f"Totals: {totals['calls']} calls ({totals['ok']} ok, {totals['failed']} failed), {totals['total']:,} tokens "
        f"({totals['input']:,} input, {totals['output']:,} output). Attached: usage_summary.json and usage_by_model_key_purpose.csv.",
        "",
        "Coverage notes:",
    ]
    extra = [s for s in sources[1:] if s["found"] and s["new"]]
    if extra:
        lines.append("- Additional ledger merged: " + "; ".join(f"{s['label']} added {s['new']} record(s)" for s in extra) + ".")
    lines += [f"- {gap}" for gap in KNOWN_GAPS]
    if totals["no_usage_calls"]:
        lines.append(f"- {totals['no_usage_calls']} failed call(s) report no token usage (counted as unknown, not zero):")
        lines += [f"    {f['when']} {f['purpose']}: {f['reason']}" for f in failed]
    lines += ["- Custom logging: the app's voice service writes the ledger with append_audit_record from yibu_audit.py; "
              "calls use streaming Chat Completions, and usage is taken from the final stream chunk.",
              "- Teammates who called the API with this key from other machines: [ADD THEIR LEDGERS OR REMOVE THIS LINE]"]
    return "\n".join(lines)


def read_summary_file(name: str) -> Optional[bytes]:
    """Only the two report files can be read, never an arbitrary path."""
    if name not in SUMMARY_FILES:
        return None
    path = OUT_DIR / name
    return path.read_bytes() if path.exists() else None
