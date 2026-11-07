#!/usr/bin/env python3
"""Builds data/feed.json, the file the phone app reads.

Runs on GitHub Actions every couple of hours (see .github/workflows/refresh.yml).

  --mode full      Rebuild everything: what's on each service (TMDB), IMDb
                   ratings, critic scores (OMDb), Netflix Top 10, Trakt trending.
  --mode trending  Only refresh Trakt's "watching now" numbers, reusing the rest.
  --mode auto      (default) full if the last full refresh is older than
                   config.refresh.full_refresh_every_hours, otherwise trending.

API keys come from environment variables (GitHub Secrets):
  TMDB_API_KEY      TMDB "API Key" or "API Read Access Token"
  TRAKT_CLIENT_ID   Trakt app "Client ID"
  OMDB_API_KEY      OMDb key (optional: without it there are no critic scores)
  MDBLIST_API_KEY   MDBList key (optional: fills critic scores OMDb lacks, mostly TV)

Uses only the Python standard library.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import gzip
import io
import json
import math
import re
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
CACHE = DATA / "cache"

TMDB = "https://api.themoviedb.org/3"
TRAKT = "https://api.trakt.tv"
OMDB = "https://www.omdbapi.com/"
MDBLIST = "https://api.mdblist.com"
IMDB_RATINGS = "https://datasets.imdbws.com/title.ratings.tsv.gz"
NETFLIX_TOP10 = "https://www.netflix.com/tudum/top10/data/all-weeks-countries.tsv"

USER_AGENT = "tv-recommendations/1.0 (personal project)"

# TMDB uses combined genre names for TV; split them so movies and shows match.
GENRE_SPLIT = {
    "Action & Adventure": ["Action", "Adventure"],
    "Sci-Fi & Fantasy": ["Science Fiction", "Fantasy"],
    "War & Politics": ["War", "Politics"],
}

# TMDB has no Sports genre, so titles get one from their TMDB keywords.
# Keywords are matched whole (after splitting "football (soccer)" into its
# parts), so incidental tags like "baseball bat" or "sports car" don't count.
# A general sports keyword is enough on its own; a single specific sport is
# not (films tag one-off scenes such as "swimming" or "wrestling"), so it takes
# two or more of those.
SPORTS_GENERAL = {
    "sport", "sports", "sports drama", "sports comedy", "sports documentary", "sports film", "sports team",
    "professional sports", "sports coach", "athlete", "olympics", "olympic games", "paralympics",
    "formula 1", "formula one", "nascar", "motorsport", "nba", "nfl", "mlb", "nhl", "ufc", "wwe",
    "professional wrestling", "college football", "college basketball", "high school football",
    "world cup", "fifa world cup", "super bowl", "premier league", "esports", "sports anime", "sports entertainment",
}
SPORTS_SPECIFIC = {
    "football", "american football", "soccer", "basketball", "baseball", "ice hockey", "hockey", "tennis",
    "golf", "golfer", "boxing", "boxer", "boxing match", "mixed martial arts", "mma", "wrestling", "wrestler", "car racing",
    "auto racing", "racing", "race car driver", "horse racing", "cycling", "marathon", "track and field",
    "gymnastics", "figure skating", "skateboarding", "surfing", "snowboarding", "skiing", "swimming", "rugby",
    "volleyball", "quarterback", "pitcher", "rodeo", "bowling", "darts", "rock climbing",
    "climbing", "coach", "team", "championship", "tournament", "underdog", "training", "competition",
}
# generic words that only count alongside a real sport keyword
_WEAK = {"coach", "team", "championship", "tournament", "underdog", "training", "competition"}


def sports_keywords(keywords: list[str]) -> list[str]:
    """The keywords that make a title count as Sports (empty if it doesn't)."""
    general, specific = [], []
    for k in keywords:
        k = k.lower().strip()
        parts = [k] + [p.strip() for p in re.split(r"[()]", k) if p.strip()]
        if any(p in SPORTS_GENERAL for p in parts):
            general.append(k)
        elif any(p in SPORTS_SPECIFIC for p in parts):
            specific.append(k)
    real = [k for k in specific if k not in _WEAK]
    if general or (real and len(specific) >= 2):
        return general + specific
    return []


def is_sports(keywords: list[str]) -> bool:
    return bool(sports_keywords(keywords))


def log(*args):
    print(*args, file=sys.stderr, flush=True)


# --------------------------------------------------------------------------
# HTTP


class Http:
    """Tiny HTTP helper with retries. Tests replace `get` with a fake."""

    def get(self, url: str, headers: dict | None = None, timeout: int = 60) -> bytes:
        hdrs = {"User-Agent": USER_AGENT, **(headers or {})}
        delay = 2.0
        for attempt in range(5):
            req = urllib.request.Request(url, headers=hdrs)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return resp.read()
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < 4:
                    wait = float(e.headers.get("Retry-After") or delay)
                    time.sleep(min(wait, 30))
                    delay *= 2
                    continue
                raise
            except (urllib.error.URLError, TimeoutError):
                if attempt < 4:
                    time.sleep(delay)
                    delay *= 2
                    continue
                raise
        raise RuntimeError("unreachable")

    def get_json(self, url: str, headers: dict | None = None):
        return json.loads(self.get(url, headers))


http = Http()


# --------------------------------------------------------------------------
# Small helpers


def today() -> dt.date:
    override = os.environ.get("FEED_TODAY")  # used by tests
    return dt.date.fromisoformat(override) if override else dt.datetime.now(dt.timezone.utc).date()


def now_iso() -> str:
    override = os.environ.get("FEED_NOW")
    if override:
        return override
    return dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_date(s) -> dt.date | None:
    try:
        return dt.date.fromisoformat(s) if s else None
    except ValueError:
        return None


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: Path, obj, compact: bool = False):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(obj, separators=(",", ":"), ensure_ascii=False) if compact else json.dumps(obj, indent=1, ensure_ascii=False)
    path.write_text(text + "\n")


def clamp(x, lo=0.0, hi=100.0):
    return max(lo, min(hi, x))


def key_for(kind: str, tmdb_id) -> str:
    return ("m" if kind == "movie" else "t") + str(tmdb_id)


def kind_of(key: str) -> str:
    return "movie" if key.startswith("m") else "tv"


# --------------------------------------------------------------------------
# TMDB


class Tmdb:
    def __init__(self, api_key: str, region: str):
        self.region = region
        if api_key.startswith("eyJ"):  # v4 "API Read Access Token"
            self.headers = {"Authorization": f"Bearer {api_key}", "accept": "application/json"}
            self.params = {}
        else:
            self.headers = {"accept": "application/json"}
            self.params = {"api_key": api_key}

    def get(self, path: str, **params):
        q = urllib.parse.urlencode({**self.params, **params})
        return http.get_json(f"{TMDB}{path}?{q}", self.headers)

    def resolve_services(self, services: list[dict]) -> dict[str, list[int]]:
        """Service key -> TMDB provider ids, combining config ids with name matches
        from TMDB's live provider list (so renamed/ad-tier variants are caught)."""
        found: dict[str, set[int]] = {s["key"]: set(s.get("provider_ids", [])) for s in services}
        for kind in ("movie", "tv"):
            try:
                providers = self.get(f"/watch/providers/{kind}", watch_region=self.region).get("results", [])
            except Exception as e:  # keep going with config ids
                log(f"warning: could not list {kind} providers: {e}")
                continue
            for p in providers:
                name = p.get("provider_name", "")
                if "Channel" in name:  # e.g. "Paramount+ Amazon Channel" is a different subscription
                    continue
                for s in services:
                    for m in s.get("match", []):
                        if name == m or name.startswith(m + " "):
                            found[s["key"]].add(p["provider_id"])
        return {k: sorted(v) for k, v in found.items()}

    def discover(self, kind: str, provider_ids: list[int], pages: int, **params) -> list[int]:
        ids = []
        for page in range(1, pages + 1):
            res = self.get(
                f"/discover/{kind}",
                watch_region=self.region,
                with_watch_providers="|".join(map(str, provider_ids)),
                with_watch_monetization_types="flatrate",
                include_adult="false",
                page=page,
                **params,
            )
            ids += [r["id"] for r in res.get("results", [])]
            if page >= res.get("total_pages", 1):
                break
        return ids

    def details(self, kind: str, tmdb_id: int, provider_to_service: dict[int, str]) -> dict | None:
        try:
            d = self.get(f"/{kind}/{tmdb_id}", append_to_response="external_ids,watch/providers,recommendations,keywords")
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            raise
        wp = (d.get("watch/providers") or {}).get("results", {}).get(self.region, {})
        services = sorted({provider_to_service[p["provider_id"]] for p in wp.get("flatrate", []) if p["provider_id"] in provider_to_service})
        genres = []
        for g in d.get("genres", []):
            for name in GENRE_SPLIT.get(g["name"], [g["name"]]):
                if name not in genres:
                    genres.append(name)
        kw = d.get("keywords") or {}
        keywords = [k.get("name", "") for k in (kw.get("keywords") or kw.get("results") or [])]
        sport_kw = sports_keywords(keywords)
        if sport_kw and "Sports" not in genres:
            genres.append("Sports")
        if kind == "movie":
            title, date = d.get("title"), d.get("release_date")
            latest = date
        else:
            title, date = d.get("name"), d.get("first_air_date")
            seasons = [s for s in d.get("seasons", []) if s.get("season_number", 0) > 0 and s.get("air_date")]
            latest = max((s["air_date"] for s in seasons), default=date)
        overview = (d.get("overview") or "").strip()
        if len(overview) > 450:
            overview = overview[:447].rsplit(" ", 1)[0] + "…"
        recs = [key_for(kind, r["id"]) for r in (d.get("recommendations") or {}).get("results", [])[:12]]
        return {
            "id": key_for(kind, tmdb_id),
            "type": kind,
            "title": title,
            "year": int(date[:4]) if date and date[:4].isdigit() else None,
            "release": date or None,
            "latest_air": latest or None,
            "poster": d.get("poster_path"),
            "overview": overview,
            "genres": genres,
            "services": services,
            "imdb_id": (d.get("external_ids") or {}).get("imdb_id") or d.get("imdb_id"),
            "popularity": round(d.get("popularity") or 0, 2),
            "recs": recs,
            "sports_keywords": sport_kw[:4] or None,  # why it was tagged Sports, for checking
            "link": wp.get("link") or f"https://www.themoviedb.org/{kind}/{tmdb_id}/watch?locale={self.region}",
        }

    def trending(self, pages: int) -> dict[str, int]:
        """Title key -> position (1 = top) on TMDB's daily trending list, per type.
        TMDB trending reflects activity across TMDB's much broader audience."""
        out: dict[str, int] = {}
        for kind in ("movie", "tv"):
            pos = 0
            for page in range(1, pages + 1):
                res = self.get(f"/trending/{kind}/day", page=page)
                for r in res.get("results", []):
                    pos += 1
                    out.setdefault(key_for(kind, r["id"]), pos)
                if page >= res.get("total_pages", 1):
                    break
        return out

    def search(self, kind: str, query: str) -> list[int]:
        res = self.get(f"/search/{kind}", query=query, include_adult="false")
        return [r["id"] for r in res.get("results", [])[:3]]


# --------------------------------------------------------------------------
# Other sources


def trakt_trending(client_id: str, limit: int) -> dict[str, int]:
    """Title key -> number of Trakt users watching right now."""
    headers = {"Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": client_id}
    out: dict[str, int] = {}
    for kind, path, field in (("movie", "movies", "movie"), ("tv", "shows", "show")):
        items = http.get_json(f"{TRAKT}/{path}/trending?limit={limit}", headers)
        for it in items:
            tmdb_id = ((it.get(field) or {}).get("ids") or {}).get("tmdb")
            if tmdb_id:
                out[key_for(kind, tmdb_id)] = int(it.get("watchers") or 0)
    return out


def imdb_ratings(wanted: set[str]) -> dict[str, tuple[float, int]]:
    """IMDb's free daily dataset (non-commercial use): tconst -> (rating, votes)."""
    raw = http.get(IMDB_RATINGS, timeout=300)
    out = {}
    with gzip.open(io.BytesIO(raw), "rt", encoding="utf-8") as f:
        next(f, None)
        for line in f:
            tconst, _, rest = line.partition("\t")
            if tconst in wanted:
                rating, votes = rest.rstrip("\n").split("\t")
                out[tconst] = (float(rating), int(votes))
    return out


def netflix_top10(region: str) -> tuple[str | None, list[dict]]:
    """Latest week of Netflix's official Top 10 for one country."""
    raw = http.get(NETFLIX_TOP10, timeout=300).decode("utf-8-sig")
    rows = [r for r in csv.DictReader(io.StringIO(raw), delimiter="\t") if r.get("country_iso2") == region]
    if not rows:
        return None, []
    week = max(r["week"] for r in rows)
    out = []
    for r in rows:
        if r["week"] != week:
            continue
        kind = "movie" if r["category"].lower().startswith("film") else "tv"
        out.append({"kind": kind, "rank": int(r["weekly_rank"]), "title": r["show_title"], "season": r.get("season_title") or ""})
    out.sort(key=lambda x: (x["rank"], x["kind"] != "tv"))
    return week, out


class RateLimited(Exception):
    pass


def mdblist_lookup(api_key: str, imdb_id: str, kind: str) -> dict:
    """Critic scores from MDBList: Rotten Tomatoes (critics) and Metacritic (critics).
    MDBList covers TV shows, which OMDb almost never has."""
    url = f"{MDBLIST}/imdb/{'show' if kind == 'tv' else 'movie'}/{imdb_id}?{urllib.parse.urlencode({'apikey': api_key})}"
    try:
        d = http.get_json(url)
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise RateLimited("MDBList daily limit reached")
        if e.code == 404:
            return {"rt": None, "mc": None}
        raise
    scores = {r.get("source"): r.get("value") for r in (d or {}).get("ratings") or []}

    def num(v):
        try:
            return int(round(float(v))) if v is not None else None
        except (TypeError, ValueError):
            return None
    return {"rt": num(scores.get("tomatoes")), "mc": num(scores.get("metacritic"))}


def omdb_lookup(api_key: str, imdb_id: str) -> dict | None:
    d = http.get_json(f"{OMDB}?{urllib.parse.urlencode({'apikey': api_key, 'i': imdb_id})}")
    if d.get("Response") != "True":
        if "limit" in (d.get("Error") or "").lower():
            raise RuntimeError("OMDb daily limit reached")
        return {"rt": None, "mc": None, "imdb": None, "imdb_votes": None}
    rt = next((r["Value"] for r in d.get("Ratings", []) if r.get("Source") == "Rotten Tomatoes"), None)
    mc = d.get("Metascore")
    votes = (d.get("imdbVotes") or "").replace(",", "")
    rating = d.get("imdbRating")
    return {
        "rt": int(rt.rstrip("%")) if rt and rt.rstrip("%").isdigit() else None,
        "mc": int(mc) if mc and mc.isdigit() else None,
        "imdb": float(rating) if rating and rating != "N/A" else None,
        "imdb_votes": int(votes) if votes.isdigit() else None,
    }


# --------------------------------------------------------------------------
# Scoring


def audience_score(rating, votes, kind, mean, cfg) -> float | None:
    """IMDb weighted rating (pulls low-vote titles toward the average), scaled
    so 5.0 -> 0 and 9.0 -> 100."""
    if rating is None or not votes:
        return None
    m = cfg["imdb_min_votes_movie"] if kind == "movie" else cfg["imdb_min_votes_tv"]
    adjusted = (votes * rating + m * mean) / (votes + m)
    return round(clamp((adjusted - 5.0) / 4.0 * 100), 1)


def critic_score(rt, mc) -> float | None:
    vals = [v for v in (rt, mc) if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def trakt_score(watchers: int, max_watchers: int) -> float:
    """Log-scaled so 10 vs 100 watchers matters as much as 100 vs 1,000."""
    if watchers <= 0 or max_watchers <= 0:
        return 0.0
    return round(100 * math.log10(watchers + 1) / math.log10(max_watchers + 1), 1)


def tmdb_trend_score(rank: int | None, list_size: int) -> float:
    """#1 on TMDB's trending list -> 100, falling evenly to 0 past the end of the list."""
    if not rank or list_size <= 0:
        return 0.0
    return round(100 * (1 - (rank - 1) / list_size), 1)


def buzz_score(trakt: float, tmdb: float) -> float:
    """Average of the two, so a title needs to be hot on both to score high;
    hot on only one source gets about half credit."""
    return round((trakt + tmdb) / 2, 1)


def fresh_score(new_date: str | None, window: int, ref: dt.date) -> float:
    d = parse_date(new_date)
    if not d:
        return 0.0
    age = (ref - d).days
    if age < 0 or age > window:
        return 0.0
    return round(100 * (1 - age / window), 1)


def new_date_for(t: dict, seen: dict, baseline: str | None, window: int, ref: dt.date) -> str | None:
    """Most recent sign the title is new on one of its services:
    a new season (TV), a recent release (movie), or showing up on a service
    since we started tracking (only counted for titles we already knew, or
    recent releases, so old titles climbing the charts aren't called "new")."""
    candidates = []
    lo = ref - dt.timedelta(days=window)

    def ok(d):
        return d and lo <= d <= ref

    latest = parse_date(t.get("latest_air") if t["type"] == "tv" else t.get("release"))
    if ok(latest):
        candidates.append(latest)

    rec = seen.get(t["id"])
    base = parse_date(baseline)
    if rec and base:
        first = parse_date(rec.get("_first"))
        release = parse_date(t.get("release"))
        recent_release = release and (ref - release).days <= 365
        for svc in t["services"]:
            d = parse_date(rec.get(svc))
            if ok(d) and d > base and ((first and d > first) or recent_release):
                candidates.append(d)
    return max(candidates).isoformat() if candidates else None


def add_scores(titles: dict, watchers: dict, tmdb_trend: dict, netflix_ranks: dict, seen: dict, baseline, cfg) -> None:
    rk = cfg["ranking"]
    ref = today()
    rated = [t["imdb"] for t in titles.values() if t.get("imdb")]
    mean = sum(rated) / len(rated) if rated else 6.8
    # scaled separately for movies and TV: Trakt movie audiences are much smaller
    max_w = {k: max((w for key, w in watchers.items() if kind_of(key) == k), default=0) for k in ("movie", "tv")}
    list_size = {k: max((r for key, r in tmdb_trend.items() if kind_of(key) == k), default=0) for k in ("movie", "tv")}
    for t in titles.values():
        t["watchers"] = watchers.get(t["id"], 0)
        t["tmdb_trend_rank"] = tmdb_trend.get(t["id"])
        t["netflix_rank"] = netflix_ranks.get(t["id"])
        t["new_date"] = new_date_for(t, seen, baseline, rk["new_window_days"], ref)
        t["scores"] = {
            "audience": audience_score(t.get("imdb"), t.get("imdb_votes"), t["type"], mean, rk),
            "critic": critic_score(t.get("rt"), t.get("mc")),
            "buzz": buzz_score(trakt_score(t["watchers"], max_w[t["type"]]),
                               tmdb_trend_score(t["tmdb_trend_rank"], list_size[t["type"]])),
            "fresh": fresh_score(t["new_date"], rk["new_window_days"], ref),
        }


def build_rows(titles: dict, netflix: list[dict], cfg) -> dict:
    """Each row is a global ordering; the app filters it to the viewer's services."""
    rk = cfg["ranking"]
    ts = list(titles.values())
    pop = lambda t: t.get("popularity") or 0
    sc = lambda t, k: t["scores"][k]

    trending = sorted((t for t in ts if t["services"] and (t["watchers"] >= rk["trending_min_watchers"] or t.get("tmdb_trend_rank"))),
                      key=lambda t: (-sc(t, "buzz"), -t["watchers"], -pop(t)))
    audience = sorted((t for t in ts if sc(t, "audience") is not None and t["services"]),
                      key=lambda t: (-sc(t, "audience"), -(t.get("imdb_votes") or 0)))

    def critic_rank(t):  # a lone RT or Metacritic score counts a little less than both agreeing
        both = t.get("rt") is not None and t.get("mc") is not None
        return sc(t, "critic") - (0 if both else 5)

    critics = sorted((t for t in ts if sc(t, "critic") is not None and t["services"]),
                     key=lambda t: (-critic_rank(t), -(sc(t, "audience") or 0)))
    new = sorted((t for t in ts if t["new_date"] and t["services"]),
                 key=lambda t: (t["new_date"], pop(t)), reverse=True)
    return {
        "trending": [t["id"] for t in trending],
        "audience": [t["id"] for t in audience],
        "critics": [t["id"] for t in critics],
        "new": [t["id"] for t in new],
        "netflix": netflix,
    }


# --------------------------------------------------------------------------
# Main


def run(mode: str = "auto") -> dict:
    cfg = load_json(ROOT / "config.json", None)
    if cfg is None:
        raise SystemExit("config.json is missing or invalid")
    rf, region = cfg["refresh"], cfg["region"]

    tmdb_key = os.environ.get("TMDB_API_KEY", "").strip()
    trakt_key = os.environ.get("TRAKT_CLIENT_ID", "").strip()
    omdb_key = os.environ.get("OMDB_API_KEY", "").strip()
    mdb_key = os.environ.get("MDBLIST_API_KEY", "").strip()
    if not tmdb_key or not trakt_key:
        raise SystemExit("Missing TMDB_API_KEY or TRAKT_CLIENT_ID. Add them under Settings > Secrets and variables > Actions.")

    feed_path = DATA / "feed.json"
    old = load_json(feed_path, {})
    details_cache = load_json(CACHE / "details.json", {})
    omdb_cache = load_json(CACHE / "omdb.json", {"usage": {}, "titles": {}})
    mdb_cache = load_json(CACHE / "mdblist.json", {"usage": {}, "titles": {}})
    seen_cache = load_json(CACHE / "first_seen.json", {"baseline": None, "seen": {}})
    nf_map = load_json(CACHE / "netflix_map.json", {})

    if mode == "auto":
        last = old.get("full_refreshed_at")
        age_h = (dt.datetime.fromisoformat(now_iso().replace("Z", "+00:00")) - dt.datetime.fromisoformat(last.replace("Z", "+00:00"))).total_seconds() / 3600 if last else None
        mode = "full" if age_h is None or age_h >= rf["full_refresh_every_hours"] else "trending"
    log(f"mode: {mode}")

    tmdb = Tmdb(tmdb_key, region)
    svc_ids = tmdb.resolve_services(cfg["services"]) if mode == "full" else old.get("provider_ids") or {s["key"]: s["provider_ids"] for s in cfg["services"]}
    provider_to_service = {pid: k for k, ids in svc_ids.items() for pid in ids}

    def fetch_details(keys: list[str]) -> dict:
        def one(k):
            try:
                return k, tmdb.details(kind_of(k), int(k[1:]), provider_to_service)
            except Exception as e:
                log(f"warning: details {k}: {e}")
                return k, details_cache.get(k)
        with ThreadPoolExecutor(8) as ex:
            return {k: d for k, d in ex.map(one, keys) if d}

    # 1. Trakt: what people are watching right now (every run)
    watchers = trakt_trending(trakt_key, rf["trakt_trending_limit"])
    log(f"trakt trending: {len(watchers)}")
    try:
        tmdb_trend = tmdb.trending(rf.get("tmdb_trending_pages", 5))
    except Exception as e:  # keep going on Trakt alone
        log(f"warning: TMDB trending unavailable: {e}")
        tmdb_trend = {}
    log(f"tmdb trending: {len(tmdb_trend)}")
    trending_keys = set(watchers) | set(tmdb_trend)

    netflix_week = old.get("netflix_week")
    netflix_rows = (old.get("rows") or {}).get("netflix", [])

    if mode == "full":
        # 2. What's on each service: top rated, popular, and new, per service and type
        pool: set[str] = set()
        p = rf["discover_pages_per_list"]
        start = (today() - dt.timedelta(days=cfg["ranking"]["new_window_days"])).isoformat()
        for s in cfg["services"]:
            ids = svc_ids[s["key"]]
            for kind in ("movie", "tv"):
                votes = "vote_count.gte"
                lists = [
                    {"sort_by": "vote_average.desc", votes: 300},
                    {"sort_by": "popularity.desc"},
                    {"sort_by": "popularity.desc", ("primary_release_date.gte" if kind == "movie" else "air_date.gte"): start},
                ]
                for params in lists:
                    try:
                        pool.update(key_for(kind, i) for i in tmdb.discover(kind, ids, p, **params))
                    except Exception as e:
                        log(f"warning: discover {s['key']} {kind} {params}: {e}")
        pool.update(trending_keys)
        log(f"pool from discover + trending: {len(pool)}")

        # 3. Netflix official Top 10 (best effort)
        nf_items = []
        try:
            netflix_week, nf_items = netflix_top10(region)
        except Exception as e:
            log(f"warning: Netflix Top 10 unavailable: {e}")
            netflix_week, netflix_rows = old.get("netflix_week"), netflix_rows
        details = fetch_details(sorted(pool))

        if nf_items:
            netflix_rows = []
            for it in nf_items:
                mk = f"{it['kind']}|{it['title']}"
                k = nf_map.get(mk)
                if not k:
                    try:
                        cands = [key_for(it["kind"], i) for i in tmdb.search(it["kind"], it["title"])]
                    except Exception as e:
                        log(f"warning: search {it['title']}: {e}")
                        cands = []
                    for c in cands:  # prefer a match that is actually on Netflix
                        d = details.get(c) or fetch_details([c]).get(c)
                        if d:
                            details[c] = d
                            if "netflix" in d["services"]:
                                k = c
                                break
                    k = k or (cands[0] if cands else None)
                    if k:
                        nf_map[mk] = k
                if k and k not in details:
                    details.update(fetch_details([k]))
                # Netflix ranks each season separately; keep a show once, at its best rank
                if k and k in details and all(r["id"] != k for r in netflix_rows):
                    netflix_rows.append({"id": k, "rank": it["rank"], "kind": it["kind"], "season": it["season"]})

        # 4. IMDb ratings (full dataset, once a day)
        try:
            wanted = {d["imdb_id"] for d in details.values() if d.get("imdb_id")}
            ratings = imdb_ratings(wanted)
            for d in details.values():
                r = ratings.get(d.get("imdb_id"))
                d["imdb"], d["imdb_votes"] = (r if r else (None, None))
            log(f"imdb ratings matched: {len(ratings)}/{len(wanted)}")
        except Exception as e:
            log(f"warning: IMDb dataset unavailable, keeping previous ratings: {e}")
            for k, d in details.items():
                prev = details_cache.get(k, {})
                d["imdb"], d["imdb_votes"] = prev.get("imdb"), prev.get("imdb_votes")

        # 5. Track when titles appear on each service (for "New on your services")
        stamp = today().isoformat()
        seen = seen_cache["seen"]
        if not seen_cache.get("baseline"):
            seen_cache["baseline"] = stamp
        for k, d in details.items():
            rec = seen.get(k)
            if rec is None:
                seen[k] = {"_first": stamp, **{s: stamp for s in d["services"]}}
            else:
                for s in d["services"]:
                    rec.setdefault(s, stamp)
    else:
        details = {k: dict(v) for k, v in (old.get("titles") or {}).items()}
        missing = [k for k in trending_keys if k not in details]
        cached = {k: details_cache[k] for k in missing if k in details_cache}
        details.update(cached)
        details.update(fetch_details([k for k in missing if k not in cached]))

    # 6. Critic scores from OMDb (cached; limited calls per day)
    usage = omdb_cache.setdefault("usage", {})
    if usage.get("date") != today().isoformat():
        usage.update(date=today().isoformat(), count=0)
    oc = omdb_cache.setdefault("titles", {})
    if omdb_key:
        cutoff = (today() - dt.timedelta(days=rf["omdb_recheck_days"])).isoformat()
        todo = sorted(
            (d for d in details.values() if d.get("imdb_id") and d["services"] and (oc.get(d["imdb_id"], {}).get("checked", "") < cutoff)),
            key=lambda d: (d["imdb_id"] in oc, -(d.get("popularity") or 0)),
        )
        budget = max(0, rf["omdb_daily_limit"] - usage["count"])
        todo = todo[:budget]
        for d in todo:
            try:
                r = omdb_lookup(omdb_key, d["imdb_id"])
            except RuntimeError as e:
                log(f"warning: {e}")
                break
            except Exception as e:
                log(f"warning: OMDb {d['imdb_id']}: {e}")
                continue
            usage["count"] += 1
            oc[d["imdb_id"]] = {**r, "checked": today().isoformat()}
        log(f"omdb calls today: {usage['count']}")
    for d in details.values():
        o = oc.get(d.get("imdb_id") or "", {})
        d["rt"], d["mc"] = o.get("rt"), o.get("mc")
        if d.get("imdb") is None and o.get("imdb") is not None:  # fallback when not in the IMDb dataset yet
            d["imdb"], d["imdb_votes"] = o["imdb"], o.get("imdb_votes")

    # 6b. MDBList fills critic scores OMDb lacks (OMDb has almost none for TV)
    mu = mdb_cache.setdefault("usage", {})
    if mu.get("date") != today().isoformat():
        mu.update(date=today().isoformat(), count=0)
    mc_cache = mdb_cache.setdefault("titles", {})
    if mdb_key:
        cutoff = (today() - dt.timedelta(days=rf["omdb_recheck_days"])).isoformat()
        todo = sorted(
            (d for d in details.values()
             if d.get("imdb_id") and d["services"] and (d["rt"] is None or d["mc"] is None)
             and mc_cache.get(d["imdb_id"], {}).get("checked", "") < cutoff),
            key=lambda d: (d["imdb_id"] in mc_cache, -(d.get("imdb_votes") or 0)),
        )
        for d in todo[:max(0, rf.get("mdblist_daily_limit", 900) - mu["count"])]:
            try:
                r = mdblist_lookup(mdb_key, d["imdb_id"], d["type"])
            except RateLimited as e:
                log(f"warning: {e}")
                break
            except Exception as e:
                log(f"warning: MDBList {d['imdb_id']}: {e}")
                continue
            mu["count"] += 1
            mc_cache[d["imdb_id"]] = {**r, "checked": today().isoformat()}
        log(f"mdblist calls today: {mu['count']}")
    for d in details.values():
        m = mc_cache.get(d.get("imdb_id") or "", {})
        if d["rt"] is None:
            d["rt"] = m.get("rt")
        if d["mc"] is None:
            d["mc"] = m.get("mc")

    # 7. Keep titles that are on at least one service (or in the Netflix Top 10)
    nf_ids = {r["id"] for r in netflix_rows}
    titles = {k: d for k, d in details.items() if d["services"] or k in nf_ids}
    netflix_ranks = {r["id"]: r["rank"] for r in netflix_rows}
    add_scores(titles, watchers, tmdb_trend, netflix_ranks, seen_cache["seen"], seen_cache.get("baseline"), cfg)

    stamp = now_iso()
    feed = {
        "version": 1,
        "generated_at": stamp,
        "trending_updated_at": stamp,
        "full_refreshed_at": stamp if mode == "full" else old.get("full_refreshed_at"),
        "netflix_week": netflix_week,
        "region": region,
        "provider_ids": svc_ids,
        "services": [{k: s[k] for k in ("key", "name", "color")} for s in cfg["services"]],
        "weights": cfg["weights"],
        "row_length": cfg["ranking"]["row_length"],
        "titles": titles,
        "rows": build_rows(titles, netflix_rows, cfg),
    }

    save_json(feed_path, feed, compact=True)
    if mode == "full":
        save_json(CACHE / "details.json", details, compact=True)
        save_json(CACHE / "first_seen.json", seen_cache, compact=True)
        save_json(CACHE / "netflix_map.json", nf_map)
    save_json(CACHE / "omdb.json", omdb_cache, compact=True)
    save_json(CACHE / "mdblist.json", mdb_cache, compact=True)
    log(f"wrote {feed_path} with {len(titles)} titles")
    return feed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mode", type=str.lower, choices=["auto", "full", "trending"], default="auto")
    run(ap.parse_args().mode)


if __name__ == "__main__":
    main()
