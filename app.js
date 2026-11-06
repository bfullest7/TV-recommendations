/* What to Watch: phone web app.
 *
 * Reads data/feed.json (built every couple of hours by pipeline/build_feed.py)
 * and shows rows of titles on the viewer's streaming services. Everything
 * personal (chosen services, thumbs) is stored only on this phone.
 */
(() => {
  "use strict";

  const IMG = "https://image.tmdb.org/t/p/";
  const STORE = { services: "wtw.services", thumbs: "wtw.thumbs", filter: "wtw.filter" };

  let feed = null;
  let myServices = [];
  let thumbs = {};
  let filter = "all";

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
  const visible = (t) => t && t.services.some((s) => activeServices().includes(s));
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
  /* Taste score from thumbs, 0-100 (50 = neutral), or null with no thumbs.
   * - Genres: each thumb up/down moves its genres up/down (smoothed).
   * - "More like this": titles TMDB recommends from a liked title get a boost,
   *   and from a disliked title get a drop. */
  function tasteModel() {
    const rated = Object.values(thumbs);
    if (!rated.length) return null;
    const aff = {}, n = {};
    const recs = {};
    for (const r of rated) {
      for (const g of r.genres || []) { aff[g] = (aff[g] || 0) + r.v; n[g] = (n[g] || 0) + 1; }
      for (const id of r.recs || []) recs[id] = (recs[id] || 0) + r.v;
    }
    return (t) => {
      const gs = t.genres || [];
      // Sum (not average) so one strongly liked genre is enough to lift a title.
      const genre = Math.max(-1, Math.min(1, gs.reduce((sum, g) => sum + (aff[g] || 0) / ((n[g] || 0) + 1), 0)));
      const rec = Math.max(-1, Math.min(1, (recs[t.id] || 0) / 2));
      return Math.max(0, Math.min(100, 50 + 45 * genre + 25 * rec));
    };
  }

  /* Weighted average of the signals a title has. Missing signals (no IMDb
   * rating, no critic score, no thumbs yet) are left out and the remaining
   * weights are scaled up to fill the gap. */
  function pickScore(t, taste) {
    const w = feed.weights;
    const parts = { ...t.scores, taste: taste ? taste(t) : null };
    let sum = 0, wsum = 0;
    for (const k of Object.keys(w)) {
      const v = parts[k];
      if (v === null || v === undefined) continue;
      sum += w[k] * v; wsum += w[k];
    }
    return wsum ? sum / wsum : 0;
  }

  function topPicks() {
    const taste = tasteModel();
    return Object.values(feed.titles)
      .filter((t) => visible(t) && !thumbs[t.id])
      .map((t) => ({ t, s: pickScore(t, taste) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.t);
  }

  // ---------------------------------------------------------------- rows
  function rowDefs() {
    const T = feed.titles;
    const from = (ids) => ids.map((id) => T[id]).filter(visible);
    const defs = [
      {
        key: "picks", title: "Top picks for you",
        source: Object.keys(thumbs).length
          ? "Combines IMDb, Rotten Tomatoes and Metacritic, Trakt trending, what's new, and your thumbs"
          : "Combines IMDb, Rotten Tomatoes and Metacritic, Trakt trending, and what's new. Rate titles to make it yours.",
        items: topPicks(),
        meta: (t) => metaBest(t),
      },
      {
        key: "trending", title: "Trending now", source: "Trakt: what people are watching right now",
        items: from(feed.rows.trending),
        meta: (t) => `${fmtCount(t.watchers)} watching`,
      },
      {
        key: "audience", title: "Top rated by audiences", source: "IMDb ratings, adjusted for vote count",
        items: from(feed.rows.audience),
        meta: (t) => `IMDb ${t.imdb.toFixed(1)} · ${fmtCount(t.imdb_votes)} votes`,
      },
      {
        key: "critics", title: "Critics' favorites", source: "Rotten Tomatoes and Metacritic (via OMDb)",
        items: from(feed.rows.critics),
        meta: (t) => [t.rt != null && `RT ${t.rt}%`, t.mc != null && `MC ${t.mc}`].filter(Boolean).join(" · "),
      },
      {
        key: "new", title: "New on your services", source: "Streaming availability from TMDB / JustWatch",
        items: from(feed.rows.new),
        meta: (t) => (t.type === "tv" && t.latest_air === t.new_date && t.release !== t.new_date ? "New season · " : "New · ") + fmtDate(t.new_date),
      },
    ];
    const hasNetflix = myServices.includes("netflix") && (filter === "all" || filter === "netflix");
    if (hasNetflix && feed.rows.netflix.length) {
      defs.push({
        key: "netflix", title: "Netflix Top 10",
        source: "Netflix official Top 10" + (feed.netflix_week ? `, week ending ${fmtDate(feed.netflix_week)}` : ", updated weekly"),
        items: feed.rows.netflix.map((r) => T[r.id] && { ...T[r.id], _rank: r.rank, _kind: r.kind }).filter(Boolean),
        meta: (t) => (t._kind === "tv" ? "TV" : "Film"),
        rank: true,
        forceService: "netflix",
      });
    }
    return defs;
  }

  function metaBest(t) {
    if (t.imdb) return `IMDb ${t.imdb.toFixed(1)}` + (t.rt != null ? ` · RT ${t.rt}%` : "");
    if (t.rt != null) return `RT ${t.rt}%`;
    return t.year ? String(t.year) : "";
  }

  function cardHtml(t, def) {
    const svcKey = def.forceService || t.services.find((s) => activeServices().includes(s));
    const svc = svcKey && svcInfo(svcKey);
    const thumb = thumbs[t.id];
    return `
      <button class="card" data-id="${esc(t.id)}" aria-label="${esc(t.title)}">
        <div class="poster">
          ${t.poster ? `<img loading="lazy" src="${IMG}w342${esc(t.poster)}" alt="">` : `<div class="no-img">${esc(t.title)}</div>`}
          ${def.rank ? `<span class="rank">#${t._rank}</span>` : ""}
          ${thumb ? `<span class="my-thumb">${thumb.v > 0 ? "👍" : "👎"}</span>` : ""}
          ${svc ? `<span class="badge" style="background:${esc(svc.color)}">${esc(svc.name)}</span>` : ""}
        </div>
        <div class="name">${esc(t.title)}</div>
        <div class="meta">${esc(def.meta(t))}</div>
      </button>`;
  }

  function renderRows() {
    const n = feed.row_length || 30;
    $("#rows").innerHTML = rowDefs().map((def) => `
      <section class="row" aria-labelledby="row-${def.key}">
        <div class="row-head">
          <h2 id="row-${def.key}">${esc(def.title)}</h2>
          <p class="source">${esc(def.source)}</p>
        </div>
        ${def.items.length
          ? `<div class="scroller">${def.items.slice(0, n).map((t) => cardHtml(t, def)).join("")}</div>`
          : `<p class="empty">Nothing here for ${filter === "all" ? "your services" : esc(svcInfo(filter).name)} right now.</p>`}
      </section>`).join("");
  }

  function renderFilters() {
    const chips = [{ key: "all", name: "All" }, ...myServices.map(svcInfo).filter(Boolean)];
    $("#filters").innerHTML = chips.map((s) => `
      <button class="chip" data-filter="${esc(s.key)}" aria-pressed="${filter === s.key}">
        ${s.color ? `<span class="dot" style="background:${esc(s.color)}"></span>` : ""}${esc(s.name)}
      </button>`).join("");
  }

  function renderUpdated() {
    $("#updated").textContent = feed ? `Updated ${timeAgo(feed.trending_updated_at)}` : "";
  }

  function render() {
    if (!myServices.includes(filter)) filter = "all";
    renderFilters();
    renderRows();
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
      t.netflix_rank && { v: `#${t.netflix_rank}`, l: "Netflix Top 10" },
      t.new_date && { v: fmtDate(t.new_date), l: "New on streaming" },
    ].filter(Boolean);
    const services = t.services.map(svcInfo).filter(Boolean);
    $("#details-body").innerHTML = `
      <button class="icon-btn close d-close" data-close aria-label="Close">✕</button>
      <div class="d-top">
        <div class="poster">${t.poster ? `<img src="${IMG}w342${esc(t.poster)}" alt="">` : `<div class="no-img">${esc(t.title)}</div>`}</div>
        <div class="d-info">
          <h2 id="d-title">${esc(t.title)}</h2>
          <div class="d-sub">${[t.year, t.type === "tv" ? "TV series" : "Movie", t.genres.slice(0, 3).join(", ")].filter(Boolean).map(esc).join(" · ")}</div>
          <div class="d-services">${services.map((s) => `<span class="svc ${myServices.includes(s.key) ? "" : "not-mine"}" style="background:${esc(s.color)}">${esc(s.name)}</span>`).join("")}</div>
        </div>
      </div>
      ${scores.length ? `<div class="scores">${scores.map((s) => `<div class="score"><div class="v">${esc(s.v)}</div><div class="l">${esc(s.l)}</div></div>`).join("")}</div>` : ""}
      ${t.overview ? `<p class="overview">${esc(t.overview)}</p>` : ""}
      <div class="thumbs">
        <button class="thumb up" data-thumb="1" aria-pressed="${thumb > 0}">👍 Like</button>
        <button class="thumb down" data-thumb="-1" aria-pressed="${thumb < 0}">👎 Not for me</button>
      </div>
      <a class="watch-link" href="${esc(t.link)}" target="_blank" rel="noopener">Where to watch</a>`;
    $("#details").dataset.id = id;
    showSheet($("#details"));
  }

  function setThumb(id, v) {
    const t = feed.titles[id];
    if (thumbs[id]?.v === v) delete thumbs[id];
    else thumbs[id] = { v, title: t.title, genres: t.genres, recs: t.recs, type: t.type };
    save(STORE.thumbs, thumbs);
    $("#details").querySelectorAll("[data-thumb]").forEach((b) => b.setAttribute("aria-pressed", String(thumbs[id]?.v === Number(b.dataset.thumb))));
    renderRows();
  }

  // ---------------------------------------------------------------- settings
  function openSettings() {
    $("#service-picker").innerHTML = feed.services.map((s) => `
      <label><input type="checkbox" value="${esc(s.key)}" ${myServices.includes(s.key) ? "checked" : ""}>
        <span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${esc(s.color)}"></span>${esc(s.name)}</label>`).join("");
    renderRatings();
    showSheet($("#settings"));
  }

  function renderRatings() {
    const items = Object.entries(thumbs);
    $("#ratings").innerHTML = items.length
      ? items.map(([id, r]) => `<li><span>${r.v > 0 ? "👍" : "👎"}</span><span class="t">${esc(r.title)}</span><button data-unrate="${esc(id)}" aria-label="Remove rating for ${esc(r.title)}">✕</button></li>`).join("")
      : `<li class="none">No ratings yet. Open any title and tap 👍 or 👎.</li>`;
  }

  function showSheet(d) {
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
    $("#rows").addEventListener("click", (e) => {
      const c = e.target.closest(".card");
      if (c) openDetails(c.dataset.id);
    });
    $("#details").addEventListener("click", (e) => {
      const b = e.target.closest("[data-thumb]");
      if (b) setThumb($("#details").dataset.id, Number(b.dataset.thumb));
    });
    $("#open-settings").addEventListener("click", () => feed && openSettings());
    $("#service-picker").addEventListener("change", () => {
      myServices = [...$("#service-picker").querySelectorAll("input:checked")].map((i) => i.value);
      save(STORE.services, myServices);
      render();
    });
    $("#ratings").addEventListener("click", (e) => {
      const b = e.target.closest("[data-unrate]");
      if (!b) return;
      delete thumbs[b.dataset.unrate];
      save(STORE.thumbs, thumbs);
      renderRatings();
      renderRows();
    });
    for (const d of document.querySelectorAll("dialog")) {
      d.addEventListener("click", (e) => {
        if (e.target === d || e.target.closest("[data-close]")) closeSheet(d);
      });
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") refresh();
    });
    setInterval(renderUpdated, 60000);
  }

  // ---------------------------------------------------------------- start
  async function fetchFeed() {
    const res = await fetch("data/feed.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(res.status);
    return res.json();
  }

  async function refresh() {
    try {
      const next = await fetchFeed();
      if (!feed || next.generated_at !== feed.generated_at) {
        feed = next;
        render();
      }
    } catch { /* keep showing what we have */ }
  }

  async function start() {
    myServices = load(STORE.services, []);
    thumbs = load(STORE.thumbs, {});
    filter = load(STORE.filter, "all");
    wire();
    try {
      feed = await fetchFeed();
    } catch {
      $("#rows").innerHTML = `<div class="notice"><b>No data yet.</b><br>The refresh job hasn't produced any results. Once it has run on GitHub, reload this page.</div>`;
      return;
    }
    myServices = myServices.filter((k) => svcInfo(k));
    render();
    if (!myServices.length) {
      $("#rows").innerHTML = `<div class="notice"><b>Welcome!</b><br>Pick your streaming services in Settings to get started.</div>`;
      openSettings();
    }
  }

  start();
})();
