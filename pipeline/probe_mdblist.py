#!/usr/bin/env python3
"""One-off check of what MDBList returns for a sample of titles from data/feed.json.

Prints, per title, which rating sources come back (with values), so we can see
how complete MDBList's TV critic scores are. The API key (MDBLIST_API_KEY) is
never printed.
"""
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEY = os.environ.get("MDBLIST_API_KEY", "").strip()
if not KEY:
    sys.exit("MDBLIST_API_KEY is not set")


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "tv-recommendations/1.0 (personal project)", "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"null"), dict(r.headers)
    except urllib.error.HTTPError as e:
        body = e.read()[:300].decode("utf-8", "replace")
        return e.code, body, dict(e.headers)


feed = json.loads((ROOT / "data" / "feed.json").read_text())
titles = [t for t in feed["titles"].values() if t.get("imdb_id")]
tv = sorted((t for t in titles if t["type"] == "tv"), key=lambda t: -(t.get("imdb_votes") or 0))
new_tv = sorted((t for t in titles if t["type"] == "tv" and (t.get("latest_air") or "") >= "2025"), key=lambda t: -(t.get("imdb_votes") or 0))
movies = sorted((t for t in titles if t["type"] == "movie" and t.get("rt") is None), key=lambda t: -(t.get("imdb_votes") or 0))
sample, seen = [], set()
for t in tv[:6] + new_tv[:8] + movies[:3]:
    if t["id"] not in seen:
        seen.add(t["id"]); sample.append(t)

# Try the current API first, then the older one, and report which works.
styles = [
    ("api.mdblist.com", lambda t: f"https://api.mdblist.com/imdb/{'show' if t['type'] == 'tv' else 'movie'}/{t['imdb_id']}?apikey={urllib.parse.quote(KEY)}"),
    ("mdblist.com/api", lambda t: f"https://mdblist.com/api/?apikey={urllib.parse.quote(KEY)}&i={t['imdb_id']}"),
]
working = None
for name, make in styles:
    status, body, headers = get(make(sample[0]))
    print(f"[{name}] {sample[0]['title']}: HTTP {status}")
    if status == 200 and isinstance(body, dict) and body.get("ratings") is not None:
        working = (name, make)
        print("  top-level fields:", sorted(body.keys()))
        limits = {k: v for k, v in headers.items() if "limit" in k.lower() or "remaining" in k.lower()}
        if limits:
            print("  rate-limit headers:", limits)
        break
    print("  response:", str(body)[:300])
if not working:
    sys.exit("No MDBList endpoint worked; see responses above.")

name, make = working
print(f"\nUsing {name}. Ratings per title (source=value/score, votes):")
counts = {"tv": {"n": 0, "tomatoes": 0, "metacritic": 0}, "movie": {"n": 0, "tomatoes": 0, "metacritic": 0}}
for t in sample:
    status, body, _ = get(make(t))
    if status != 200 or not isinstance(body, dict):
        print(f"  {t['title'][:40]:40s} {t['type']:5s} HTTP {status}: {str(body)[:120]}")
        continue
    rs = body.get("ratings") or []
    have = {r.get("source"): r for r in rs if r.get("value") is not None or r.get("score") is not None}
    c = counts[t["type"]]; c["n"] += 1
    c["tomatoes"] += "tomatoes" in have
    c["metacritic"] += "metacritic" in have
    desc = ", ".join(f"{s}={r.get('value')}/{r.get('score')}" + (f" ({r.get('votes')} votes)" if r.get('votes') else "") for s, r in have.items())
    print(f"  {t['title'][:40]:40s} {t['type']:5s} {t.get('latest_air') or t.get('release')}: {desc or 'no ratings'}")
print("\nCoverage in this sample:")
for k, c in counts.items():
    if c["n"]:
        print(f"  {k}: {c['n']} titles, Rotten Tomatoes {c['tomatoes']}, Metacritic {c['metacritic']}")
