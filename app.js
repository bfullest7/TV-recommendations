/* What to Watch: phone web app.
 *
 * Reads data/feed.json (built every couple of hours by pipeline/build_feed.py)
 * and shows rows of titles on the viewer's streaming services. Everything
 * personal (chosen services, thumbs) is stored only on this phone.
 */
(() => {
  "use strict";

  const IMG = "https://image.tmdb.org/t/p/";
  const STORE = { services: "wtw.services", thumbs: "wtw.thumbs", genres: "wtw.genres", filter: "wtw.filter", kind: "wtw.kind", watched: "wtw.watched", watchlist: "wtw.watchlist", refreshedTo: "wtw.refreshedTo", lastBackup: "wtw.lastBackup" };
  const BACKUP_APP = "what-to-watch";
  const RESET_AFTER_MS = 60 * 1000; // away this long -> reopen at the main screen

  let feed = null;
  let myServices = [];
  let thumbs = {};
  let genrePrefs = {}; // genre -> 1 (like) or -1 (dislike), set in Settings
  let watched = {}; // id -> { title, type, at }: hidden from every row
  let watchlist = {}; // id -> { title, type, at }: shown in "Your watchlist"
  let filter = "all";
  let kind = "all"; // "all", "tv" or "movie"

  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------------------------------------------------------------- storage
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
  }

  // ---------------------------------------------------------------- helpers
  const svcInfo = (k) => feed.services.find((s) => s.key === k);
  const activeServices = () => (filter === "all" ? myServices : [filter]);
  const onMyServices = (t) => t && t.services.some((s) => activeServices().includes(s));
  const rightKind = (t) => kind === "all" || t.type === kind;
  const visible = (t) => onMyServices(t) && rightKind(t) && !watched[t.id];
  const kindWord = () => (kind === "tv" ? "TV shows" : kind === "movie" ? "movies" : "titles");
  const fmtCount = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(n));
  const fmtDate = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });

  function timeAgo(iso) {
    if (!iso) return "";
    const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
    if (mins < 2) return "just now";
    if (mins < 60) return `${mins} min ago`;
    const h = Math.round(mins / 60);
    if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
    const d = Math.round(h / 24);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }

  // ---------------------------------------------------------------- ranking
  const hasTaste = () => Object.keys(thumbs).length > 0 || Object.keys(genrePrefs).length > 0;
  const GENRE_PREF_VOTES = 2; // a genre set in Settings counts like two title thumbs

  /* "Your taste" score, 0-100 (50 = neutral), or null with no thumbs and no
   * genre likes.
   * - Genres: each title thumb moves its genres up/down; a genre liked or
   *   disliked in Settings counts as a stronger vote (smoothed either way).
   * - "More like this": titles TMDB recommends from a liked title get a boost,
   *   and from a disliked title get a drop. */
  function tasteModel() {
    if (!hasTaste()) return null;
    const aff = {}, n = {};
    const recs = {};
    for (const r of Object.values(thumbs)) {
      for (const g of r.genres || []) { aff[g] = (aff[g] || 0) + r.v; n[g] = (n[g] || 0) + 1; }
      for (const id of r.recs || []) recs[id] = (recs[id] || 0) + r.v;
    }
    for (const [g, v] of Object.entries(genrePrefs)) {
      aff[g] = (aff[g] || 0) + v * GENRE_PREF_VOTES;
      n[g] = (n[g] || 0) + GENRE_PREF_VOTES;
    }
    const score = (t) => {
      const gs = t.genres || [];
      // Sum (not average) so one strongly liked genre is enough to lift a title.
      const genre = Math.max(-1, Math.min(1, gs.reduce((sum, g) => sum + (aff[g] || 0) / ((n[g] || 0) + 1), 0)));
      const rec = Math.max(-1, Math.min(1, (recs[t.id] || 0) / 2));
      return Math.max(0, Math.min(100, 50 + 45 * genre + 25 * rec));
    };
    // What drove the taste score, for "Why this pick"
    score.explain = (t) => {
      const gs = t.genres || [];
      const similar = (v) => Object.values(thumbs).filter((r) => r.v === v && (r.recs || []).includes(t.id)).map((r) => r.title);
      return {
        likedGenres: gs.filter((g) => (aff[g] || 0) > 0),
        dislikedGenres: gs.filter((g) => (aff[g] || 0) < 0),
        likedSimilar: similar(1),
        dislikedSimilar: similar(-1),
      };
    };
    return score;
  }

  /* "New & recent" (0-100): full credit for titles released or premiered in
   * the last 3 months, fading steadily to 0 at 3 years (config.json). A new
   * season of an older show counts a quarter. Arriving on a service in the
   * last 30 days counts fully. */
  // Curve from config.json (row_tilt): full credit for recency_full_days, then a
  // steady fade to 0 at recency_zero_days. Defaults: 3 months and 3 years.
  const recentFullDays = () => (feed.row_tilt || {}).recency_full_days ?? 90;
  const recentZeroDays = () => (feed.row_tilt || {}).recency_zero_days ?? 3 * 365;
  // a new season of an older show counts this fraction of a brand-new title
  const seasonCredit = () => (feed.row_tilt || {}).recency_season_credit ?? 0.25;
  function ageScore(iso) {
    if (!iso) return 0;
    const days = (Date.now() - new Date(iso + "T12:00:00").getTime()) / 86400000;
    if (days < 0) return 0;
    const full = recentFullDays(), zero = recentZeroDays();
    if (days <= full) return 100;
    return Math.max(0, 100 * (1 - (days - full) / (zero - full)));
  }
  function recency(t) {
    const parts = {
      release: ageScore(t.release),
      season: t.type === "tv" && t.latest_air !== t.release ? seasonCredit() * ageScore(t.latest_air) : 0,
      arrival: t.scores.fresh || 0,
    };
    const top = Object.keys(parts).reduce((a, b) => (parts[b] > parts[a] ? b : a));
    return { score: Math.round(parts[top] * 10) / 10, why: top };
  }
  /* Trending score: TMDB trending and Trakt watchers blended by config.json
   * (TMDB's broader audience counts more). */
  function trendScore(t) {
    const p = t.trend_parts;
    if (!p) return t.scores.buzz || 0;
    const share = (feed.row_tilt || {}).trending_tmdb_share ?? 0.7;
    return share * p.tmdb + (1 - share) * p.trakt;
  }
  const signalScores = (t, taste) => ({ ...t.scores, buzz: trendScore(t), fresh: recency(t).score, taste: taste ? taste(t) : null });

  /* Each signal's score, its weight for this title (after skipping missing
   * signals), and the points it adds to the match score. */
  function breakdown(t, taste) {
    const w = feed.weights;
    const scores = signalScores(t, taste);
    const present = Object.keys(w).filter((k) => scores[k] !== null && scores[k] !== undefined);
    const wsum = present.reduce((s, k) => s + w[k], 0) || 1;
    const parts = Object.keys(w).map((k) => {
      const has = present.includes(k);
      const weight = has ? w[k] / wsum : 0;
      return { k, score: has ? scores[k] : null, weight, pts: has ? scores[k] * weight : 0 };
    });
    return { parts, total: parts.reduce((s, p) => s + p.pts, 0) };
  }

  /* Weighted average of the signals a title has. Missing signals (no IMDb
   * rating, no critic score, no thumbs yet) are left out and the remaining
   * weights are scaled up to fill the gap. */
  function pickScore(t, taste) {
    const w = feed.weights;
    const parts = signalScores(t, taste);
    let sum = 0, wsum = 0;
    for (const k of Object.keys(w)) {
      const v = parts[k];
      if (v === null || v === undefined) continue;
      sum += w[k] * v; wsum += w[k];
    }
    return wsum ? sum / wsum : 0;
  }

  // Top picks only includes titles with this many IMDb votes (none = no rating yet)
  const picksMinVotes = () => (feed.row_tilt || {}).top_picks_min_imdb_votes ?? 5000;
  function topPicks() {
    const taste = tasteModel();
    const min = picksMinVotes();
    const ranked = Object.values(feed.titles)
      .filter((t) => visible(t) && !thumbs[t.id] && (t.imdb_votes || 0) >= min)
      .map((t) => ({ t, s: pickScore(t, taste) }))
      .sort((a, b) => b.s - a.s);
    return ranked.map((x) => x.t);
  }

  // ---------------------------------------------------------------- rows
  function rowDefs() {
    const T = feed.titles;
    const from = (ids) => ids.map((id) => T[id]).filter(visible);
    // Audience and critics rows lean toward recent titles: score = (1 - w) x rating
    // + w x "New & recent", among titles with enough IMDb votes to be well known.
    const tilt = feed.row_tilt || { min_imdb_votes: 20000, audience_recency: 0.35, critics_recency: 0.35 };
    const tilted = (ids, key, w) => from(ids)
      .filter((t) => (t.imdb_votes || 0) >= tilt.min_imdb_votes && t.scores[key] != null)
      .map((t) => ({ t, s: (1 - w) * t.scores[key] + w * recency(t).score }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t);
    const trendMin = tilt.trending_min_imdb_votes ?? 5000;
    const trendRecency = tilt.trending_recency ?? 0.25;
    const listed = Object.entries(watchlist).sort((a, b) => (b[1].at || "").localeCompare(a[1].at || "")).map(([id]) => T[id]).filter((t) => t && onMyServices(t) && rightKind(t)); // watched titles stay here
    const defs = [
      ...(listed.length ? [{
        key: "watchlist", title: "Your watchlist", source: "Titles you saved to watch next, most recently added first.",
        items: listed,
      }] : []),
      {
        key: "picks", title: "Top picks for you",
        source: hasTaste()
          ? "Picked for you by blending how well viewers and critics rate each title, how popular it is right now and how new it is, plus your thumbs and genre likes."
          : "Picked for you by blending how well viewers and critics rate each title, how popular it is right now and how new it is. Rate titles to make it yours.",
        items: topPicks(),
      },
      {
        key: "trending", title: "Trending now",
        source: "Most popular today, based on how many people are looking it up on TMDB and how many Trakt users are watching it right now. Newer titles get a boost.",
        items: from(feed.rows.trending)
          .filter((t) => (t.imdb_votes || 0) >= trendMin)
          .map((t) => ({ t, s: (1 - trendRecency) * trendScore(t) + trendRecency * recency(t).score }))
          .sort((a, b) => b.s - a.s)
          .map((x) => x.t),
      },
      {
        key: "audience", title: "Top rated by audiences", source: "The titles IMDb viewers rate highest, with a boost for newer ones. Only well-known titles with plenty of ratings.",
        items: tilted(feed.rows.audience, "audience", tilt.audience_recency),
      },
      {
        key: "critics", title: "Critics' favorites", source: "The best-reviewed titles from professional critics on Rotten Tomatoes and Metacritic, with a boost for newer ones. Only well-known titles.",
        items: tilted(feed.rows.critics, "critic", tilt.critics_recency),
        // this row shows the score it's ranked by: Rotten Tomatoes, or Metacritic if there's no RT
        line: (t) => [latestYear(t), t.rt != null ? `RT ${t.rt}%` : t.mc != null ? `MC ${t.mc}` : null].filter(Boolean).join(" · "),
      },
      {
        key: "new", title: "New on your services", source: "Arrived in the last 30 days: new movies, new seasons and titles just added to your services. Newest first.",
        items: from(feed.rows.new),
      },
    ];
    // Only Netflix publishes official viewing numbers, so its Top 10 shows only when the Netflix filter is selected
    const hasNetflix = myServices.includes("netflix") && filter === "netflix";
    if (hasNetflix && feed.rows.netflix.length) {
      // right after Top picks: it's the only real viewing data, so it leads the popularity rows
      defs.splice(defs.findIndex((d) => d.key === "picks") + 1, 0, {
        key: "netflix", title: "Netflix Top 10",
        source: "Netflix's own list of its most-watched shows and movies in the US" + (feed.netflix_week ? `, for the week ending ${fmtDate(feed.netflix_week)}.` : ", updated weekly."),
        items: feed.rows.netflix.map((r) => T[r.id] && { ...T[r.id], _rank: r.rank, _kind: r.kind }).filter((t) => t && rightKind(t)),
        rank: true,
        forceService: "netflix",
      });
    }
    return defs;
  }

  /* Year of the latest release: the release year for movies, the most recent
   * season's year for TV (falling back to the premiere year). */
  const latestYear = (t) => {
    const d = (t.type === "tv" && t.latest_air) || t.release;
    return d ? d.slice(0, 4) : t.year ? String(t.year) : "";
  };
  /* Details screen: TV shows show premiere to latest season ("2024–2026"). */
  const yearRange = (t) => {
    const first = t.year ? String(t.year) : (t.release || "").slice(0, 4);
    const last = latestYear(t);
    return t.type === "tv" && first && last && last !== first ? `${first}–${last}` : last || first;
  };
  /* Line 1 of every card's subtitle: latest year and IMDb rating. */
  const metaLine1 = (t) => [latestYear(t), t.imdb != null && `IMDb ${t.imdb.toFixed(1)}`].filter(Boolean).join(" · ");

  function cardHtml(t, def) {
    const svcKey = def.forceService || t.services.find((s) => activeServices().includes(s));
    const svc = svcKey && svcInfo(svcKey);
    const thumb = thumbs[t.id];
    return `
      <button class="card ${watched[t.id] ? "is-watched" : ""}" data-id="${esc(t.id)}" aria-label="${esc(t.title)}">
        <div class="poster">
          ${t.poster ? `<img loading="lazy" src="${IMG}w342${esc(t.poster)}" alt="">` : `<div class="no-img">${esc(t.title)}</div>`}
          ${def.rank ? `<span class="rank">#${t._rank}</span>` : ""}
          <span class="marks">${watchlist[t.id] ? `<span class="mark" title="On your watchlist">🔖</span>` : ""}${thumb ? `<span class="mark">${thumb.v > 0 ? "👍" : "👎"}</span>` : ""}</span>
          ${watched[t.id] ? `<span class="watched-badge">✓ Watched</span>` : ""}
          ${svc ? `<span class="badge" style="background:${esc(svc.color)}">${esc(svc.name)}</span>` : ""}
        </div>
        <div class="name">${esc(t.title)}</div>
        <div class="meta">${esc(def.line ? def.line(t) : metaLine1(t)) || "&nbsp;"}</div>
      </button>`;
  }

  /* keepPlace: after a rating, genre change or data refresh, every row keeps
   * its scroll position except Top picks, which re-ranks and starts over at
   * its first title. Without keepPlace (filter changes), all rows start over. */
  function renderRows(keepPlace = false) {
    const saved = {};
    const pageY = window.scrollY;
    if (keepPlace) {
      for (const sc of document.querySelectorAll("#rows .row .scroller")) {
        const key = sc.closest(".row").dataset.row;
        if (key && key !== "picks") saved[key] = sc.scrollLeft;
      }
    }
    drawRows();
    if (keepPlace) {
      for (const sc of document.querySelectorAll("#rows .row .scroller")) {
        const key = sc.closest(".row").dataset.row;
        if (key in saved) sc.scrollLeft = saved[key];
      }
      window.scrollTo({ top: pageY });
    }
  }

  function drawRows() {
    if (!myServices.length) {
      $("#rows").innerHTML = `
        <div class="notice welcome">
          <b>Welcome to What to Watch!</b>
          <p>See the best things to stream right now on the services you have: what's trending, top rated, critics' favorites, what's new, and picks just for you.</p>
          <p>To get started, choose your streaming services.</p>
          <button class="done-btn" data-open-settings>Pick your services</button>
        </div>`;
      return;
    }
    const n = feed.row_length || 30;
    $("#rows").innerHTML = rowDefs().map((def) => `
      <section class="row" data-row="${def.key}" aria-labelledby="row-${def.key}">
        <div class="row-head">
          <h2 id="row-${def.key}">${esc(def.title)}</h2>
          <p class="source">${esc(def.source)}</p>
        </div>
        ${def.items.length
          ? `<div class="scroller">${def.items.slice(0, n).map((t) => cardHtml(t, def)).join("")}</div>`
          : `<p class="empty">No ${kindWord() === "titles" ? "titles" : kindWord()} here for ${filter === "all" ? "your services" : esc(svcInfo(filter).name)} right now.</p>`}
      </section>`).join("");
  }

  function renderFilters() {
    $("#filter-bar").hidden = !myServices.length;
    $("#kind-select").value = kind;
    $("#kind-select").classList.toggle("active", kind !== "all");
    if (!myServices.length) { $("#filters").innerHTML = ""; return; }
    const chips = [{ key: "all", name: "All" }, ...myServices.map(svcInfo).filter(Boolean)];
    $("#filters").innerHTML = chips.map((s) => `
      <button class="chip" data-filter="${esc(s.key)}" aria-pressed="${filter === s.key}">
        ${s.color ? `<span class="dot" style="background:${esc(s.color)}"></span>` : ""}${esc(s.name)}
      </button>`).join("");
  }

  // Data refresh status, shown at the bottom of Settings. The refresh job is
  // scheduled at :17 past every even hour (UTC); GitHub often starts it late.
  function nextRefreshText(lastIso) {
    const last = new Date(lastIso);
    const next = new Date(last);
    next.setUTCMinutes(17, 0, 0);
    while (next <= last) next.setUTCHours(next.getUTCHours() + 1);
    while (next.getUTCHours() % 2) next.setUTCHours(next.getUTCHours() + 1);
    const mins = Math.round((next - Date.now()) / 60000);
    if (mins <= 2) return "Next refresh any minute now.";
    if (mins < 60) return `Next refresh in about ${mins} min.`;
    const h = Math.floor(mins / 60), m = Math.round((mins % 60) / 5) * 5;
    return `Next refresh in about ${h} hr${m ? ` ${m} min` : ""}.`;
  }
  function renderUpdated() {
    const iso = feed?.trending_updated_at;
    $("#data-updated").textContent = iso
      ? `Data last updated ${timeAgo(iso)}. ${nextRefreshText(iso)} The data refreshes about every 2 hours.`
      : "";
  }

  function render(keepPlace = false) {
    if (!myServices.includes(filter)) filter = "all";
    renderFilters();
    renderRows(keepPlace);
    renderUpdated();
  }

  // ---------------------------------------------------------------- details
  function openDetails(id) {
    const t = feed.titles[id];
    if (!t) return;
    const thumb = thumbs[id]?.v || 0;
    const scores = [
      t.imdb != null && { v: t.imdb.toFixed(1), l: `IMDb · ${fmtCount(t.imdb_votes || 0)} votes` },
      t.rt != null && { v: `${t.rt}%`, l: "Rotten Tomatoes (critics)" },
      t.mc != null && { v: t.mc, l: "Metacritic" },
      t.watchers > 0 && { v: fmtCount(t.watchers), l: "Watching now on Trakt" },
      t.tmdb_trend_rank && { v: `#${t.tmdb_trend_rank}`, l: `Trending on TMDB today (${t.type === "tv" ? "TV" : "movies"})` },
      t.netflix_rank && { v: `#${t.netflix_rank}`, l: "Netflix Top 10" },
      t.new_date && { v: fmtDate(t.new_date), l: "New on streaming" },
    ].filter(Boolean);
    const services = t.services.map(svcInfo).filter(Boolean);
    $("#details-body").innerHTML = `
      <div class="sheet-head d-head">
        <span class="d-head-title">${esc(t.title)}</span>
        <button class="icon-btn close" data-close aria-label="Close"><svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
      </div>
      <div class="d-top">
        <div class="poster">${t.poster ? `<img src="${IMG}w342${esc(t.poster)}" alt="">` : `<div class="no-img">${esc(t.title)}</div>`}</div>
        <div class="d-info">
          <h2 id="d-title">${esc(t.title)}</h2>
          <div class="d-sub">${[yearRange(t), t.type === "tv" ? "TV series" : "Movie", t.genres.slice(0, 3).join(", ")].filter(Boolean).map(esc).join(" · ")}</div>
          <div class="d-services">${services.map((s) => `<span class="svc ${myServices.includes(s.key) ? "" : "not-mine"}" style="background:${esc(s.color)}">${esc(s.name)}</span>`).join("")}</div>
        </div>
      </div>
      ${scores.length ? `<div class="scores">${scores.map((s) => `<div class="score"><div class="v">${esc(s.v)}</div><div class="l">${esc(s.l)}</div></div>`).join("")}</div>` : ""}
      ${t.overview ? `<p class="overview">${esc(t.overview)}</p>` : ""}
      <div class="list-btns">
        <button class="list-btn" data-watchlist aria-pressed="${!!watchlist[id]}">${watchlist[id] ? "✓ Added to list" : "＋ Add to list"}</button>
        <button class="list-btn" data-watched aria-pressed="${!!watched[id]}">${watched[id] ? "✓ Watched" : "Mark watched"}</button>
      </div>
      <div class="thumbs">
        <button class="thumb up" data-thumb="1" aria-pressed="${thumb > 0}">👍 Like</button>
        <button class="thumb down" data-thumb="-1" aria-pressed="${thumb < 0}">👎 Not for me</button>
      </div>
      ${whyThisPick(t)}`;
    $("#details").dataset.id = id;
    showSheet($("#details"));
  }

  // ---------------------------------------------------------------- why this pick
  const list = (xs) => (xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1]);

  /* Plain-language phrase for a signal that helped (good) or held a title back. */
  function phrase(k, p, t, taste, good) {
    const s = p.score;
    if (k === "audience") {
      const votes = `${t.imdb.toFixed(1)} from ${fmtCount(t.imdb_votes || 0)} votes`;
      if (good) return `its ${s >= 80 ? "excellent" : s >= 65 ? "strong" : "solid"} IMDb rating (${votes})`;
      if ((t.imdb_votes || 0) < 2000) return `having few IMDb votes so far (${votes})`;
      return `${s < 25 ? "a low" : "a middling"} IMDb rating (${votes})`;
    }
    if (k === "critic") {
      const bits = [t.rt != null && `Rotten Tomatoes ${t.rt}%`, t.mc != null && `Metacritic ${t.mc}`].filter(Boolean).join(", ");
      return good ? `${s >= 80 ? "great" : "good"} reviews from critics (${bits})` : `mixed reviews from critics (${bits})`;
    }
    if (k === "buzz") {
      const bits = [t.watchers > 0 && `${fmtCount(t.watchers)} watching on Trakt`, t.tmdb_trend_rank && `#${t.tmdb_trend_rank} on TMDB`].filter(Boolean).join(", ");
      const both = t.watchers > 0 && t.tmdb_trend_rank;
      return `${both ? "trending on both Trakt and TMDB" : "trending right now"} (${bits})`;
    }
    if (k === "fresh") {
      const r = recency(t).why;
      const monthYear = (iso) => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });
      if (r === "arrival") {
        const svc = svcInfo(t.services.find((x) => activeServices().includes(x)) || t.services[0]);
        const season = t.type === "tv" && t.latest_air === t.new_date && t.release !== t.new_date;
        return `${season ? "a new season" : "being new"}${svc ? ` on ${svc.name}` : ""} (${fmtDate(t.new_date)})`;
      }
      if (r === "season") return `a recent season (${monthYear(t.latest_air)})`;
      return `${t.type === "tv" ? "premiering" : "coming out"} recently (${monthYear(t.release)})`;
    }
    if (k === "taste") {
      const e = taste.explain(t);
      if (good) {
        if (e.likedSimilar.length) return `being similar to ${list(e.likedSimilar.slice(0, 2))}, which you liked`;
        if (e.likedGenres.length) { const g = e.likedGenres.slice(0, 2); return `being ${list(g)}, ${g.length > 1 ? "genres" : "a genre"} you like`; }
        return "matching your ratings";
      }
      if (e.dislikedSimilar.length) return `being similar to ${list(e.dislikedSimilar.slice(0, 2))}, which you didn't like`;
      if (e.dislikedGenres.length) { const g = e.dislikedGenres.slice(0, 2); return `being ${list(g)}, ${g.length > 1 ? "genres" : "a genre"} you don't like`; }
      return "not matching your ratings";
    }
    return k;
  }

  function whyThisPick(t) {
    const taste = tasteModel();
    const { parts, total } = breakdown(t, taste);
    const match = Math.round(total);
    const has = parts.filter((p) => p.score !== null);

    let lead;
    if (watched[t.id]) lead = `You've marked this as watched, so it's hidden from your rows. Its match score of ${match} comes`;
    else if (thumbs[t.id]) lead = `You've rated this, so it's left out of your Top picks. Its match score of ${match} comes`;
    else if (!onMyServices(t)) lead = `This isn't on ${filter === "all" ? "your services" : "the service you're viewing"}, so it's not in your Top picks. Its match score of ${match} comes`;
    else if ((t.imdb_votes || 0) < picksMinVotes()) lead = `Top picks only includes titles with ${fmtCount(picksMinVotes())}+ IMDb votes, and this has ${t.imdb_votes ? fmtCount(t.imdb_votes) : "no IMDb rating yet"}, so it's not in your Top picks. Its match score of ${match} comes`;
    else if (!rightKind(t)) lead = `This is a ${t.type === "tv" ? "TV show" : "movie"}, and you're viewing ${kindWord()} only, so it's not in your Top picks right now. Its match score of ${match} comes`;
    else {
      const picks = topPicks();
      const rank = picks.findIndex((x) => x.id === t.id) + 1;
      const shown = feed.row_length || 30;
      lead = rank <= shown ? `#${rank} in your Top picks` : `#${rank} of ${picks.length} in your Top picks (below the ${shown} shown)`;
    }

    // Helped: signals scoring 60+, biggest contribution first. Held back: a weak
    // audience, critic or taste score with real weight (trending and new are
    // bonuses, so missing out on them isn't called a drawback).
    let helped = has.filter((p) => p.score >= 60).sort((a, b) => b.pts - a.pts);
    // the top two, plus a third if it adds nearly as much as the second
    helped = helped.slice(0, helped.length > 2 && helped[2].pts >= 0.9 * helped[1].pts ? 3 : 2);
    const held = has.filter((p) => ["audience", "critic", "taste"].includes(p.k) && p.score < 45 && p.weight >= 0.15)
      .sort((a, b) => b.weight * (100 - b.score) - a.weight * (100 - a.score))[0];

    let sentence = lead;
    const ranked = !lead.endsWith(" comes");
    if (helped.length) sentence += `${ranked ? ", mostly because of" : " mostly from"} ${list(helped.map((p) => phrase(p.k, p, t, taste, true)))}`;
    else {
      if (!ranked) sentence = sentence.replace(/ Its match score of (\d+) comes$/, " Its match score is $1");
      sentence += ". None of its scores stand out";
    }
    if (held) sentence += `${helped.length ? ", held back by" : ". It's held back by"} ${phrase(held.k, held, t, taste, false)}`;
    sentence += ".";
    const missing = parts.filter((p) => p.score === null && p.k !== "taste").map((p) => (p.k === "critic" ? "critic score" : "IMDb rating"));
    if (missing.length) sentence += ` It has no ${missing.join(" or ")}, so ${missing.length > 1 ? "those were" : "that was"} skipped.`;

    const label = { audience: "Audience (IMDb)", taste: "Your taste", buzz: "Trending", critic: "Critics", fresh: "New & recent" };
    const rows = parts.map((p) => p.score === null
      ? `<tr class="skip"><td>${label[p.k]}</td><td colspan="3">${p.k === "taste" ? "No thumbs or genre likes yet" : "No score, skipped"}</td></tr>`
      : `<tr><td>${label[p.k]}</td><td>${Math.round(p.score)}</td><td>${Math.round(p.weight * 100)}%</td><td>${p.pts.toFixed(1)}</td></tr>`).join("");
    return `
      <section class="why">
        <h3>Why this pick</h3>
        <p class="why-text">${esc(sentence)}</p>
        <table class="why-table">
          <thead><tr><th>Signal</th><th>Score</th><th>Weight</th><th>Points</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td>Match score</td><td></td><td></td><td>${match}</td></tr></tfoot>
        </table>
        <p class="hint">Scores are out of 100. Points = score × weight; the points add up to the match score that ranks Top picks.</p>
      </section>`;
  }

  const entry = (t) => ({ title: t.title, type: t.type, at: new Date().toISOString() });
  function redrawDetails(id) {
    const d = $("#details"), y = d.scrollTop;
    openDetails(id);
    d.scrollTop = y;
  }
  function toggleWatchlist(id) {
    if (watchlist[id]) delete watchlist[id];
    else watchlist[id] = entry(feed.titles[id]);
    save(STORE.watchlist, watchlist);
    redrawDetails(id);
    renderRows(true);
    if ($("#search").open) renderSearch();
  }
  function toggleWatched(id) {
    if (watched[id]) delete watched[id];
    else watched[id] = entry(feed.titles[id]);
    save(STORE.watched, watched);
    redrawDetails(id);
    renderRows(true);
    if ($("#search").open) renderSearch();
  }

  function setThumb(id, v) {
    const t = feed.titles[id];
    if (thumbs[id]?.v === v) delete thumbs[id];
    else thumbs[id] = { v, title: t.title, genres: t.genres, recs: t.recs, type: t.type };
    save(STORE.thumbs, thumbs);
    const d = $("#details"), y = d.scrollTop;
    openDetails(id); // redraw so "Why this pick" reflects the new rating
    d.scrollTop = y;
    renderRows(true);
  }

  // ---------------------------------------------------------------- search
  const norm = (x) => String(x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  let searchIndex = null;

  /* Searches every title the app tracks (on any service). Titles starting with
   * the search come first, then a word starting with it, then anywhere. */
  function searchTitles(q) {
    const nq = norm(q);
    if (!nq) return [];
    if (!searchIndex || searchIndex.feed !== feed) {
      searchIndex = { feed, items: Object.values(feed.titles).map((t) => ({ t, n: norm(t.title) })) };
    }
    const scored = [];
    for (const { t, n } of searchIndex.items) {
      let rank = -1;
      if (n === nq) rank = 0;
      else if (n.startsWith(nq)) rank = 1;
      else if ((" " + n).includes(" " + nq)) rank = 2;
      else if (n.includes(nq)) rank = 3;
      if (rank >= 0) scored.push({ t, rank, mine: t.services.some((k) => myServices.includes(k)) ? 0 : 1 });
    }
    // best match first; among equal matches, titles on your services first, then the best known
    return scored
      .sort((a, b) => a.rank - b.rank || a.mine - b.mine || (b.t.imdb_votes || 0) - (a.t.imdb_votes || 0))
      .slice(0, 40).map((x) => x.t);
  }

  function renderSearch() {
    const q = $("#search-input").value;
    const res = searchTitles(q);
    $("#search-results").innerHTML = !norm(q)
      ? `<li class="none">Search the ${fmtCount(Object.keys(feed.titles).length)} movies and shows the app tracks across all services.</li>`
      : res.length ? res.map((t) => {
          const mine = t.services.filter((k) => myServices.includes(k)).map(svcInfo).filter(Boolean);
          const where = mine.length ? mine.map((s) => s.name).join(", ")
            : t.services.length ? `Not on your services (${t.services.map((k) => svcInfo(k)?.name).filter(Boolean).join(", ")})` : "Not on a tracked service";
          return `<li><button class="result" data-id="${esc(t.id)}">
            <span class="r-poster">${t.poster ? `<img loading="lazy" src="${IMG}w92${esc(t.poster)}" alt="">` : ""}</span>
            <span class="r-text"><span class="r-title">${esc(t.title)}</span>
              <span class="r-sub">${[t.year, t.type === "tv" ? "TV" : "Movie", t.imdb && `IMDb ${t.imdb.toFixed(1)}`].filter(Boolean).map(esc).join(" · ")}</span>
              <span class="r-where ${mine.length ? "" : "not-mine"}">${esc(where)}</span></span>
            <span class="r-marks">${watchlist[t.id] ? "🔖" : ""}${watched[t.id] ? "✓" : ""}</span>
          </button></li>`;
        }).join("")
      : `<li class="none">No matches for "${esc(q)}". The app tracks popular, top-rated, new and trending titles, so less-known ones may be missing.</li>`;
  }

  function openSearch() {
    showSheet($("#search"));
    renderSearch();
    setTimeout(() => $("#search-input").focus(), 50);
  }

  // ---------------------------------------------------------------- settings
  function openSettings() {
    $("#service-picker").innerHTML = feed.services.map((s) => `
      <label><input type="checkbox" value="${esc(s.key)}" ${myServices.includes(s.key) ? "checked" : ""}>
        <span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(s.color)}"></span>${esc(s.name)}</label>`).join("");
    renderGenres();
    renderHow();
    renderWeights();
    showLastBackup();
    renderUpdated();
    const s = $("#settings");
    if (!s.open) {
      showSheet(s);
      s.scrollTop = 0; // always start at the top when Settings is opened
    }
  }



  // ---------------------------------------------------------------- genres
  /* Genres in the current data, most common first. */
  function allGenres() {
    const count = {};
    for (const t of Object.values(feed.titles)) for (const g of t.genres || []) count[g] = (count[g] || 0) + 1;
    for (const g of Object.keys(genrePrefs)) count[g] = count[g] || 0; // keep saved ones visible
    return Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
  }

  function renderGenres() {
    $("#genre-picker").innerHTML = allGenres().map((g) => {
      const v = genrePrefs[g] || 0;
      return `<div class="genre ${v > 0 ? "liked" : v < 0 ? "disliked" : ""}">
        <span class="g-name">${esc(g)}</span>
        <button class="g-btn up" data-genre="${esc(g)}" data-v="1" aria-pressed="${v > 0}" aria-label="Like ${esc(g)}">👍</button>
        <button class="g-btn down" data-genre="${esc(g)}" data-v="-1" aria-pressed="${v < 0}" aria-label="Dislike ${esc(g)}">👎</button>
      </div>`;
    }).join("");
  }

  function setGenre(g, v) {
    if (genrePrefs[g] === v) delete genrePrefs[g];
    else genrePrefs[g] = v;
    save(STORE.genres, genrePrefs);
    renderGenres();
    renderWeights();
    renderRows(true);
  }

  // ---------------------------------------------------------------- how it's calculated
  /* Plain-language explanations, built from the live settings in config.json. */
  /* Bar chart in the same style as the Top picks weights. Each item:
   * { name, src, value (0-1 for bar length), label (text on the right) } */
  const barsHtml = (items) => `<ul class="weights">${items.map((it) => `
    <li><div class="w-top"><span><span class="w-name">${esc(it.name)}</span>${it.src ? `<br><span class="w-src">${esc(it.src)}</span>` : ""}</span>
      <span class="w-pct">${esc(it.label)}</span></div>
      <div class="w-bar"><span style="width:${(Math.max(0, Math.min(1, it.value)) * 100).toFixed(1)}%"></span></div></li>`).join("")}</ul>`;
  const mixBars = (parts) => barsHtml(parts.map(([name, src, share]) => ({ name, src, value: share, label: `${Math.round(share * 100)}%` })));
  // the "New & recent" score for a title of a given age, using the live curve
  const scoreAtAge = (days) => {
    const full = recentFullDays(), zero = recentZeroDays();
    return days <= full ? 100 : Math.max(0, 100 * (1 - (days - full) / (zero - full)));
  };
  const ageText = (days) => (days % 365 === 0 ? `${days / 365} year${days === 365 ? "" : "s"}` : `${Math.round(days / 30)} months`);
  function renderHow() {
    const w = feed.weights;
    const t = feed.row_tilt || { min_imdb_votes: 20000, audience_recency: 0.35, critics_recency: 0.35 };
    const p = (x) => `${Math.round(x * 100)}%`;
    const votes = fmtCount(t.min_imdb_votes);
    const trendVotes = fmtCount(t.trending_min_imdb_votes ?? 5000);
    const items = [
      ["Top picks for you", `
        <p>Every title on your services gets a score from 0 to 100 for each signal, and these weights combine them into a <b>match score</b>. The percentages are the ones that apply to you right now.</p>
        <ul id="weights" class="weights"></ul>
        <p id="weights-note" class="weights-note"></p>
        <p>If a title is missing a signal (for example, no critic reviews), that signal is skipped for that title and the others are scaled up to fill the gap. Titles you've rated or marked watched are left out, and so are titles with fewer than ${fmtCount(picksMinVotes())} IMDb votes, so brand-new or little-known titles with no real rating yet can't top the list.</p>
        <p>Open any title and scroll to <b>Why this pick</b> to see its exact numbers.</p>`],
      ["Trending now", `
        ${(() => {
          const r = t.trending_recency ?? 0.25, sh = t.trending_tmdb_share ?? 0.7;
          return mixBars([
            ["TMDB trending", "How many people are looking it up today", (1 - r) * sh],
            ["Trakt watchers", "How many Trakt users are watching right now", (1 - r) * (1 - sh)],
            ["New & recent", "Newest releases count most", r],
          ]);
        })()}
        <p>TMDB's #1 trending title scores 100. Trakt counts are scaled so 10 vs 100 watchers counts as much as 100 vs 1,000.</p>
        <p>Movies and TV are scaled separately, so smaller movie audiences aren't compared with TV's. Only titles with ${trendVotes}+ IMDb votes are shown. Updated every 2 hours.</p>`],
      ["Top rated by audiences", `
        ${mixBars([["IMDb rating", "Adjusted for vote count", 1 - t.audience_recency], ["New & recent", "Newest releases count most", t.audience_recency]])}
        <p>Only titles with ${votes}+ IMDb votes.</p>
        <p>The IMDb rating is adjusted for vote count: titles with few votes are pulled toward the average, so a handful of 10/10 votes can't top the list.</p>`],
      ["Critics' favorites", `
        ${mixBars([["Critic score", "Rotten Tomatoes and Metacritic", 1 - t.critics_recency], ["New & recent", "Newest releases count most", t.critics_recency]])}
        <p>Only titles with ${votes}+ IMDb votes.</p>
        <p>The critic score is the average of Rotten Tomatoes (critics, not audience) and Metacritic, from OMDb, with MDBList filling in what OMDb lacks (most TV shows). Titles with neither are left out.</p>`],
      ["New on your services", `
        <p>Titles from the last 30 days, newest first: new movies, new seasons of shows, and titles that just arrived on one of your services. Streaming availability comes from TMDB, provided by JustWatch.</p>`],
      ["Netflix Top 10", `
        <p>Netflix's own official list of its most-watched shows and films in the US, published weekly. Shown only when the <b>Netflix</b> filter is selected, and not used in any ranking, since other services don't publish equivalent numbers.</p>`],
      ["Signal: Your taste", `
        <p>Built from your 👍/👎 on titles and your 👍/👎 on genres in <b>Genres you like</b>. Starts at 50 (neutral). Each 👍 on a title raises its genres and each 👎 lowers them. A genre you set in <b>Genres you like</b> counts like two title thumbs. Titles TMDB lists as similar to ones you liked get a boost, and similar to ones you disliked a drop.</p>
        <p>Not counted until you rate something or pick a genre.</p>`],
      ["Signal: New & recent", `
        <p>Score by how long ago a title came out:</p>
        ${barsHtml([["Up to 3 months", 90], ["6 months", 182], ["1 year", 365], ["18 months", 547], ["2 years", 730], ["3 years", 1095]]
          .map(([name, days]) => { const v = Math.round(scoreAtAge(days)); return { name, value: v / 100, label: String(v) }; }))}
        <p>Full credit (100) for titles released or premiered in the last ${ageText(recentFullDays())}, then fading steadily to 0 at ${ageText(recentZeroDays())} old (for example, a 1-year-old title scores ${Math.round(100 * (1 - (365 - recentFullDays()) / (recentZeroDays() - recentFullDays())))}). A new season of an older show counts ${seasonCredit() === 0.25 ? "a quarter" : seasonCredit() === 0.5 ? "half" : Math.round(seasonCredit() * 100) + "%"}, so long-running shows don't look brand new every season. Arriving on a service in the last 30 days counts fully.</p>`],
      ["Signal: Audience, Critics, Trending", `
        <p><b>Audience</b> is the vote-adjusted IMDb rating (5.0 or lower scores 0, 9.0 or higher scores 100). <b>Critics</b> is the Rotten Tomatoes / Metacritic average. <b>Trending</b> is the TMDB/Trakt blend from the Trending now row (without that row's recency share, since New &amp; recent is its own signal).</p>`],
      ["Watchlist & watched", `
        <p><b>＋ Add to list</b> on any title adds it to the "Your watchlist" row at the top, newest first. <b>Mark watched</b> hides a title from every row except "Your watchlist" and the Netflix Top 10, where it shows a "Watched" badge. It doesn't take the title off your watchlist. Both are saved on this phone and included in backups. To undo either, open the title (search finds watched titles too) and tap the button again.</p>`],
      ["When data updates", `
        <p>Trending numbers refresh every 2 hours. Everything else (what's on each service, ratings, Netflix Top 10) refreshes about once a day. Critic scores fill in gradually because of OMDb's and MDBList's daily limits. The time at the top of the app shows the last update.</p>`],
    ];
    $("#how").innerHTML = items.map(([title, body]) => `<details><summary>${esc(title)}</summary><div class="how-body">${body}</div></details>`).join("");
  }

  // ---------------------------------------------------------------- weights
  const SIGNALS = {
    audience: { name: "Audience rating", src: "IMDb, adjusted for vote count" },
    taste: { name: "Your taste", src: "Your 👍 and 👎 on titles, plus genres you like" },
    buzz: { name: "Trending", src: "TMDB trending 70% + Trakt watchers 30%" },
    critic: { name: "Critics", src: "Rotten Tomatoes and Metacritic" },
    fresh: { name: "New & recent", src: "Newest releases count most, fading over 3 years" },
  };
  const pct = (x) => `${Math.round(x * 100)}%`;

  /* Shows the weights that apply to this viewer right now: until they rate
   * something or pick a genre, "Your taste" is skipped and the others are scaled up. */
  function renderWeights() {
    if (!$("#weights")) return; // lives inside "How it's calculated"
    const w = feed.weights;
    const rated = hasTaste();
    const active = Object.keys(w).filter((k) => rated || k !== "taste");
    const total = active.reduce((s, k) => s + w[k], 0) || 1;
    $("#weights").innerHTML = Object.keys(w).map((k) => {
      const on = active.includes(k);
      const share = on ? w[k] / total : 0;
      const s = SIGNALS[k] || { name: k, src: "" };
      return `<li class="${on ? "" : "off"}">
        <div class="w-top"><span><span class="w-name">${esc(s.name)}</span><br><span class="w-src">${esc(s.src)}</span></span>
          <span class="w-pct">${on ? pct(share) : "0%"}</span></div>
        <div class="w-bar"><span style="width:${(share * 100).toFixed(1)}%"></span></div>
      </li>`;
    }).join("");
    $("#weights-note").textContent = rated ? ""
      : `Your taste will count for ${pct(w.taste / Object.values(w).reduce((a, b) => a + b, 0))} once you rate a title or like a genre; until then the other signals are scaled up to fill the gap.`;
  }

  // ---------------------------------------------------------------- backup
  function backupStatus(text, kind = "") {
    const el = $("#backup-status");
    el.textContent = text;
    el.className = `hint backup-status ${kind}`;
  }

  function showLastBackup() {
    const last = load(STORE.lastBackup, null);
    const n = Object.keys(thumbs).length + Object.keys(watchlist).length + Object.keys(watched).length;
    backupStatus(last
      ? `Last backup: ${new Date(last).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.`
      : n ? `No backup yet. Your ratings and lists are saved only on this phone.` : "");
  }

  async function saveBackup() {
    const data = { app: BACKUP_APP, version: 3, saved_at: new Date().toISOString(), services: myServices, thumbs, genres: genrePrefs, watchlist, watched };
    const name = `what-to-watch-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([JSON.stringify(data, null, 1)], name, { type: "application/json" });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        // iPhone/Android: opens the share sheet (Save to Files, email, etc.)
        await navigator.share({ files: [file], title: "What to Watch backup" });
      } else {
        const url = URL.createObjectURL(file);
        const a = Object.assign(document.createElement("a"), { href: url, download: name });
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
      save(STORE.lastBackup, data.saved_at);
      showLastBackup();
    } catch (e) {
      if (e && e.name === "AbortError") return; // share sheet closed without saving
      backupStatus("Couldn't save the backup. Please try again.", "err");
    }
  }

  async function restoreBackup(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.app !== BACKUP_APP || typeof data.thumbs !== "object") throw new Error("not a backup");
      const valid = Object.entries(data.thumbs).filter(([, r]) => r && (r.v === 1 || r.v === -1) && r.title);
      for (const [id, r] of valid) thumbs[id] = r;
      const known = (data.services || []).filter((k) => svcInfo(k));
      myServices = [...new Set([...myServices, ...known])];
      const genres = Object.entries(data.genres || {}).filter(([, v]) => v === 1 || v === -1);
      for (const [g, v] of genres) genrePrefs[g] = v;
      const okEntry = ([, r]) => r && typeof r.title === "string";
      const wl = Object.entries(data.watchlist || {}).filter(okEntry);
      const wd = Object.entries(data.watched || {}).filter(okEntry);
      for (const [id, r] of wl) watchlist[id] = r;
      for (const [id, r] of wd) watched[id] = r;
      save(STORE.watchlist, watchlist);
      save(STORE.watched, watched);
      save(STORE.thumbs, thumbs);
      save(STORE.genres, genrePrefs);
      save(STORE.services, myServices);
      openSettings();
      render();
      const nG = genres.length;
      backupStatus(`Restored ${valid.length} rating${valid.length === 1 ? "" : "s"}, ${nG} genre${nG === 1 ? "" : "s"}, ${wl.length} watchlist title${wl.length === 1 ? "" : "s"}, ${wd.length} watched title${wd.length === 1 ? "" : "s"} and ${known.length} service${known.length === 1 ? "" : "s"}.`, "ok");
    } catch {
      backupStatus("That file isn't a What to Watch backup.", "err");
    }
  }

  function goHome() {
    if (!feed) return;
    for (const d of document.querySelectorAll("dialog")) if (d.open) closeSheet(d);
    window.scrollTo({ top: 0 });
    for (const s of document.querySelectorAll(".scroller")) s.scrollLeft = 0;
  }

  function showSheet(d) {
    if (d.open) return;
    if (typeof d.showModal === "function") d.showModal();
    else d.setAttribute("open", "");
  }
  function closeSheet(d) {
    if (typeof d.close === "function") d.close();
    else d.removeAttribute("open");
  }

  // ---------------------------------------------------------------- events
  function wire() {
    $("#filters").addEventListener("click", (e) => {
      const b = e.target.closest("[data-filter]");
      if (!b) return;
      filter = b.dataset.filter;
      save(STORE.filter, filter);
      render();
      window.scrollTo({ top: 0 });
    });
    $("#kind-select").addEventListener("change", (e) => {
      kind = e.target.value;
      save(STORE.kind, kind);
      render();
      window.scrollTo({ top: 0 });
    });
    $("#rows").addEventListener("click", (e) => {
      if (e.target.closest("[data-open-settings]")) return openSettings();
      const c = e.target.closest(".card");
      if (c) openDetails(c.dataset.id);
    });
    $("#details").addEventListener("click", (e) => {
      const id = $("#details").dataset.id;
      const b = e.target.closest("[data-thumb]");
      if (b) return setThumb(id, Number(b.dataset.thumb));
      if (e.target.closest("[data-watchlist]")) return toggleWatchlist(id);
      if (e.target.closest("[data-watched]")) return toggleWatched(id);
    });
    $("#open-settings").addEventListener("click", () => feed && openSettings());
    $("#open-search").addEventListener("click", () => feed && openSearch());
    $("#search-input").addEventListener("input", renderSearch);
    $("#search-input").addEventListener("keydown", (e) => { if (e.key === "Enter") e.target.blur(); });
    $("#search-results").addEventListener("click", (e) => {
      const r = e.target.closest(".result");
      if (r) openDetails(r.dataset.id);
    });
    $("#service-picker").addEventListener("change", () => {
      myServices = [...$("#service-picker").querySelectorAll("input:checked")].map((i) => i.value);
      save(STORE.services, myServices);
      render();
    });
    $("#genre-picker").addEventListener("click", (e) => {
      const b = e.target.closest("[data-genre]");
      if (b) setGenre(b.dataset.genre, Number(b.dataset.v));
    });
    $("#backup-save").addEventListener("click", saveBackup);
    $("#backup-restore").addEventListener("click", () => $("#backup-file").click());
    $("#backup-file").addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) restoreBackup(f);
      e.target.value = "";
    });
    for (const d of document.querySelectorAll("dialog")) {
      d.addEventListener("click", (e) => {
        if (e.target === d || e.target.closest("[data-close]")) closeSheet(d);
      });
    }
    // Coming back after a while (or reopening from a link or the home screen)
    // starts at the main screen instead of wherever the app was left.
    let hiddenAt = null;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt && Date.now() - hiddenAt >= RESET_AFTER_MS) goHome();
      hiddenAt = null;
      refresh();
      checkForUpdate();
    });
    window.addEventListener("pageshow", (e) => {
      if (e.persisted) goHome(); // restored from the browser's back/forward cache
    });
    setInterval(renderUpdated, 60000);
    setInterval(checkForUpdate, 30 * 60000);
    $("#update-refresh").addEventListener("click", applyUpdate);
  }

  // ---------------------------------------------------------------- updates
  /* Each publish stamps index.html with a version and writes version.json.
   * If the published version is newer than the one running, offer a refresh. */
  const APP_VERSION = document.querySelector('meta[name="app-version"]')?.content || "dev";
  let latestVersion = null;
  async function checkForUpdate() {
    if (APP_VERSION === "dev") return;
    try {
      const res = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) return;
      const { version } = await res.json();
      if (version && version !== APP_VERSION) {
        latestVersion = version;
        // Already refreshed for this version: this is just the phone's saved
        // copy (kept up to 10 minutes), which updates itself, so don't ask again.
        if (load(STORE.refreshedTo, null) === version) return;
        $("#update-banner").hidden = false;
      }
    } catch { /* offline: try again later */ }
  }
  function applyUpdate() {
    save(STORE.refreshedTo, latestVersion);
    // A new address skips any cached copy of the old version.
    location.replace(`${location.pathname}?v=${encodeURIComponent(latestVersion || Date.now())}`);
  }

  // ---------------------------------------------------------------- start
  async function fetchFeed() {
    const res = await fetch("data/feed.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    // Weights come from config.json when available, so a change there takes
    // effect as soon as it's published (not only after the next data refresh).
    try {
      const cfg = await (await fetch("config.json", { cache: "no-cache" })).json();
      if (cfg && cfg.weights) data.weights = cfg.weights;
      if (cfg && cfg.row_tilt) data.row_tilt = cfg.row_tilt;
    } catch { /* keep the weights saved with the data */ }
    return data;
  }

  async function refresh() {
    try {
      const next = await fetchFeed();
      if (!feed || next.generated_at !== feed.generated_at) {
        feed = next;
        render(true);
      }
    } catch { /* keep showing what we have */ }
  }

  async function start() {
    // Tidy the address after an update refresh (drop ?v=...)
    if (location.search.includes("v=")) history.replaceState(null, "", location.pathname);
    checkForUpdate();
    myServices = load(STORE.services, []);
    thumbs = load(STORE.thumbs, {});
    genrePrefs = load(STORE.genres, {});
    watched = load(STORE.watched, {});
    watchlist = load(STORE.watchlist, {});
    filter = load(STORE.filter, "all");
    kind = ["all", "tv", "movie"].includes(load(STORE.kind, "all")) ? load(STORE.kind, "all") : "all";
    wire();
    try {
      feed = await fetchFeed();
    } catch {
      $("#rows").innerHTML = `<div class="notice"><b>No data yet.</b><br>The refresh job hasn't produced any results. Once it has run on GitHub, reload this page.</div>`;
      return;
    }
    myServices = myServices.filter((k) => svcInfo(k));
    render();
  }

  /* iPhone home-screen apps: on a fresh launch iOS can add the status-bar
   * space twice (the header sits too low) until its next layout pass, which
   * happens on a scroll or when you leave and come back. Trigger that layout
   * pass ourselves a few times in the first second: a 1pt scroll and back,
   * plus a forced re-layout. Only when at the top, so a real scroll is kept. */
  function settleLayout() {
    if (window.scrollY > 1) return;
    window.scrollTo(0, 1);
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      const h = document.querySelector("header.top");
      if (h) { h.style.transform = "translateZ(0)"; void h.offsetHeight; h.style.transform = ""; }
    });
  }
  function settleSoon() {
    [50, 150, 300].forEach((ms) => setTimeout(settleLayout, ms));
    // show the logo only after the layout has settled (so it doesn't move),
    // then reveal the app
    setTimeout(() => { const s = document.getElementById("splash"); if (s) s.classList.add("ready"); }, 400);
    setTimeout(revealApp, 1150);
  }
  // fade the logo out and the app in (home-screen launch only)
  function revealApp() {
    const root = document.documentElement;
    if (!root.classList.contains("settling")) return;
    const splash = document.getElementById("splash");
    if (splash) {
      splash.classList.add("leaving");
      setTimeout(() => splash.remove(), 250);
    }
    root.classList.remove("settling");
  }
  // safety net: never stay hidden, even if "load" doesn't fire as expected
  setTimeout(revealApp, 2500);
  window.addEventListener("load", settleSoon);
  window.addEventListener("pageshow", (e) => { if (e.persisted) settleSoon(); });

  // background helper (sw.js): always open the newest version of the app
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {});
  }

  start();
})();
