"""Fetch completed bars, scan selected markets, and write transparent static snapshots."""
from __future__ import annotations

import argparse
import json
import traceback
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from engine import POOLS, scan_one, trend
from strategies import DEFINITIONS, scan_strategies
from sources import AShare, US, Crypto

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "site" / "data"
ADAPTERS = {"ashare": AShare, "us": US, "crypto": Crypto}


def write_json(path: Path, payload: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False), encoding="utf-8")
    tmp.replace(path)


def build_market(key: str, shard: tuple[int, int] | None = None) -> dict:
    adapter = ADAPTERS[key](ROOT)
    try:
        universe = adapter.universe()
        if shard:
            index, total = shard
            universe = [item for pos, item in enumerate(universe) if pos % total == index]
        selected = {p: [] for p in POOLS}
        strategies = {p: [] for p in DEFINITIONS if p != "multi_structure_trend"}
        failures = []
        reasons = Counter()
        daily_ok = 0
        latest_daily_date = ""
        for i, item in enumerate(universe, 1):
            try:
                daily = adapter.daily(item)
                if len(daily) < 60:
                    raise ValueError("日线不足60根")
                daily_ok += 1
                latest_daily_date = max(latest_daily_date, str(daily.datetime.iloc[-1])[:10])
                for strategy_id, signal in scan_strategies(daily, key).items():
                    strategies[strategy_id].append({**item, **signal})
                hour = None
                minute15 = None
                try:
                    hour = adapter.hour(item)
                except Exception:
                    reasons["60分钟不可用"] += 1
                if hour is not None and trend(hour)["ok"]:
                    try:
                        minute15 = adapter.quarter_hour(item)
                    except Exception:
                        reasons["15分钟不可用"] += 1
                found = scan_one(daily, hour, minute15, key)
                for pool, result in found.items():
                    selected[pool].append({**item, **result})
            except Exception as exc:
                failures.append({"symbol": item["symbol"], "reason": str(exc)[:180]})
                reasons["行情或扫描失败"] += 1
            log_step = 10 if len(universe) < 100 else 100
            if i % log_step == 0 or i == len(universe):
                print(f"{key}: {i}/{len(universe)} scanned; {sum(map(len, selected.values()))} matches", flush=True)
        for items in selected.values():
            items.sort(key=lambda x: x["main"]["score"], reverse=True)
        for items in strategies.values():
            items.sort(key=lambda x: x["symbol"])
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        payload = {
            "market": key, "label": adapter.label, "source": adapter.source,
            "generated_at": now, "universe_count": len(universe),
            "latest_daily_date": latest_daily_date,
            "daily_data_count": daily_ok, "failed_count": len(failures),
            "failed_examples": failures[:100], "diagnostics": dict(reasons),
            "pools": {p: {"label": POOLS[p][0], "count": len(selected[p]), "items": selected[p]} for p in POOLS},
            "strategies": {p: {"count": len(items), "items": items} for p, items in strategies.items()},
        }
        if not daily_ok:
            raise RuntimeError(f"{key}: no daily data; previous snapshot retained")
        path = OUT / "parts" / f"{key}-{shard[0]}.json" if shard else OUT / f"{key}.json"
        write_json(path, payload)
        return {"ok": True, "generated_at": now, "matches": {p: len(selected[p]) for p in POOLS},
                "covered": daily_ok, "universe": len(universe)}
    finally:
        adapter.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--market", choices=["all", *ADAPTERS], default="all")
    ap.add_argument("--shard", help="A-share batch as index/total, e.g. 0/10")
    args = ap.parse_args()
    shard = tuple(map(int, args.shard.split("/"))) if args.shard else None
    if shard and (args.market != "ashare" or len(shard) != 2 or shard[1] < 1 or not 0 <= shard[0] < shard[1]):
        ap.error("--shard requires --market ashare and valid index/total")
    if shard:
        build_market("ashare", shard)
        return
    keys = list(ADAPTERS) if args.market == "all" else [args.market]
    status_path = OUT / "status.json"
    status = json.loads(status_path.read_text()) if status_path.exists() else {}
    for key in keys:
        try:
            status[key] = build_market(key)
        except Exception as exc:
            status[key] = {"ok": False, "error": str(exc)[:300],
                           "attempted_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
            traceback.print_exc()
        write_json(status_path, status)
    print("Build status:", json.dumps(status, ensure_ascii=False))


if __name__ == "__main__":
    main()
