#!/usr/bin/env python3
import argparse
import time
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from backend.tools import get_sp500_screener  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Warm the S&P 500 screener cache.")
    parser.add_argument("--metric", default="fcfYield", help="Metric to request (default: fcfYield).")
    parser.add_argument("--order", default="desc", choices=["asc", "desc"], help="Sort order.")
    parser.add_argument("--sleep", type=float, default=6.0, help="Sleep seconds between fetches.")
    parser.add_argument("--max-iterations", type=int, default=300, help="Max fetch loops.")
    parser.add_argument("--refresh", action="store_true", help="Force refresh of cached data.")
    args = parser.parse_args()

    last_remaining = None
    sleep_time = args.sleep

    for idx in range(args.max_iterations):
        resp = get_sp500_screener(
            metric=args.metric,
            order=args.order,
            limit=0,
            refresh=args.refresh if idx == 0 else False,
        )
        rows = resp.get("rows") or []
        remaining = int(resp.get("remaining") or 0)
        universe = int(resp.get("universeSize") or 0)
        loaded = len(rows)
        print(f"[{idx + 1}] Loaded {loaded}/{universe} tickers, remaining {remaining}.")

        if remaining <= 0:
            print("Done. Screener cache is warm.")
            return

        if last_remaining is not None and remaining >= last_remaining:
            sleep_time = min(max(sleep_time * 1.5, args.sleep), 120.0)
        else:
            sleep_time = args.sleep
        last_remaining = remaining

        time.sleep(sleep_time)

    print("Stopped: reached max iterations. Re-run to continue warming.")


if __name__ == "__main__":
    main()
