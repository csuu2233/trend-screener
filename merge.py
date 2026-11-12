"""Combine independently scanned shards into one publishable market snapshot."""
from __future__ import annotations

import json
import shutil
import argparse
from datetime import datetime, timezone
from pathlib import Path

from engine import POOLS

ROOT = Path(__file__).resolve().parent
IN = ROOT / "incoming"
OUT = ROOT / "site" / "data"


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False))


def status_for(data):
    return {"ok": True, "generated_at": data["generated_at"],
            "covered": data["daily_data_count"], "universe": data["universe_count"],
            "matches": {k: v["count"] for k, v in data["pools"].items()}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", choices=["all", "ashare", "us", "crypto"], required=True)
    market = ap.parse_args().market
    status_path = OUT / "status.json"
    status = json.loads(status_path.read_text()) if status_path.exists() else {}
    parts = sorted(IN.glob("ashare-*.json"))
    if market in ("all", "ashare"):
        if len(parts) != 10:
            status["ashare"] = {"ok": False, "error": f"A股仅完成 {len(parts)}/10 个批次，保留原快照"}
        else:
            pieces = [json.loads(p.read_text()) for p in parts]
            if any(x["daily_data_count"] == 0 for x in pieces):
                status["ashare"] = {"ok": False, "error": "A股存在无可用行情的批次，保留原快照"}
            else:
                result = {
                    "market": "ashare", "label": "A股", "source": pieces[0]["source"],
                    "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "latest_daily_date": max(x["latest_daily_date"] for x in pieces),
                    "universe_count": sum(x["universe_count"] for x in pieces),
                    "daily_data_count": sum(x["daily_data_count"] for x in pieces),
                    "failed_count": sum(x["failed_count"] for x in pieces),
                    "failed_examples": sum((x["failed_examples"] for x in pieces), [])[:100],
                    "diagnostics": {},
                    "pools": {},
                }
                for key, (label, _, _) in POOLS.items():
                    items = sum((x["pools"][key]["items"] for x in pieces), [])
                    items.sort(key=lambda x: x["main"]["score"], reverse=True)
                    result["pools"][key] = {"label": label, "count": len(items), "items": items}
                write(OUT / "ashare.json", result)
                status["ashare"] = status_for(result)
    for key in ("us", "crypto"):
        if market not in ("all", key):
            continue
        path = IN / f"{key}.json"
        if path.exists():
            data = json.loads(path.read_text())
            shutil.copyfile(path, OUT / f"{key}.json")
            status[key] = status_for(data)
        else:
            status[key] = {"ok": False, "error": f"{key} 扫描未产生快照，保留原快照"}
    write(status_path, status)
    print(json.dumps(status, ensure_ascii=False))


if __name__ == "__main__":
    main()
