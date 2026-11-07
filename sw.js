// Background helper: whenever the app is opened, get the newest page from the
// server instead of the phone's saved copy (which can be up to 10 minutes old).
// If the phone is offline, fall back to the last copy we saw.
const CACHE = "wtw-pages";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.mode !== "navigate" || req.method !== "GET") return; // everything else as normal
  e.respondWith((async () => {
    try {
      // "no-cache" = always check with the server (cheap if nothing changed)
      // (a navigation request can't be re-issued with options, so fetch by address)
      let res = await fetch(req.url, { cache: "no-cache", credentials: "same-origin" });
      // Safari refuses a redirected response for a page load; hand back a clean copy
      if (res.redirected) res = new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers });
      if (res.ok) {
        const copy = res.clone();
        e.waitUntil(caches.open(CACHE).then((c) => c.put("page", copy)));
      }
      return res;
    } catch (err) {
      const saved = await (await caches.open(CACHE)).match("page");
      if (saved) return saved;
      throw err;
    }
  })());
});
