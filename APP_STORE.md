# Publishing Tivvy on the iOS App Store

Notes from a review in November 2026: what it would take to turn Tivvy into an App Store app, and what that would mean. Nothing here has been done yet. Re-check the data-source terms before acting, since they change.

## Summary

- **Building it is the easy part:** a few days of work, plus Apple's review (which can reject an app once or twice).
- **The data rights are the hard part:** several sources are licensed for non-commercial use only, and Apple treats the App Store as commercial even for free apps. TMDB, which supplies most of Tivvy's data and all the posters, would need to give written permission first.
- **Recommendation:** stay a home-screen web app unless being discoverable in the App Store (or native features like notifications) becomes important. If it does, email TMDB first; their answer decides whether it's realistic.

## How the conversion would work

Tivvy is a web app (a page added to the home screen). The App Store only accepts native apps, so the usual route is a thin native "shell" that runs the existing app inside a real iPhone app.

- **Shell:** a tool such as Capacitor wraps the existing `index.html`, `app.js` and `styles.css`. Most code stays as it is.
- **Live updates:** if the shell loads the live site, most changes keep shipping the way they do now (push to `main`), without a new App Store review each time. Bigger changes to how the app works should still go through review.
- **Apple Developer Program:** $99 a year.
- **A Mac with Xcode** to build and submit (or a cloud build service).
- **Store listing:** app name, description, screenshots, a privacy policy page and Apple's privacy questions. These are simple for Tivvy: there are no accounts, no tracking, and your choices stay on the phone.
- **Small checks:** that "Tivvy" isn't taken on the App Store, and that streaming services stay as plain-text badges (no logos).

### Apple's "minimum functionality" rule

Apple rejects apps that are "just a website in a wrapper". Tivvy already feels app-like (home-screen icon, launch screen, sheets, banners), which helps. To pass review reliably it would probably need a few native touches, for example:

- the native share sheet (Share Tivvy, sharing a title)
- haptics (small vibrations on taps like Like or Not for me)
- notifications, such as a new season of a show on your watchlist

### What already works in Tivvy's favor

- **It scales well:** all data work happens once on GitHub; phones just download a small file. Score lookups don't grow with the number of users.
- **Privacy is simple:** no sign-in, no tracking, nothing leaves the phone except in a backup file the person saves themselves.

## Data sources and their terms

Checked November 10, 2026. "Unclear" means the official terms couldn't be read or sources disagreed.

| Source | What it gives Tivvy | For a free App Store app |
|---|---|---|
| **TMDB** | Titles, posters, services, genres, trailers, similar titles | **Needs written permission (likely).** Free only for non-commercial use, with TMDB credited (logo, in an About or Credits section). Apple has rejected free TMDB-based apps, treating the App Store as commercial; crediting alone wasn't always enough. |
| **JustWatch** (via TMDB) | Which service each title is on | **Credit required** wherever it's shown. Tivvy already credits it in "How your picks work". |
| **IMDb** (daily ratings file) | Ratings and vote counts | **Problem.** Personal and non-commercial use only, and the data "must not be republished". Sharing it even through the website is a gray area. An App Store app would need IMDb's commercial license, or another source for ratings. |
| **Rotten Tomatoes** (via OMDb and MDBList) | Critic scores | **Unclear.** It has its own licensing; its official data is paid and expensive. Showing its scores in a published app may need permission. |
| **OMDb** | Critic scores, IMDb rating fallback | **Unclear.** Sources conflict; one says commercial use is allowed with credit. |
| **MDBList** | Critic scores for TV | **Unclear.** No API-specific terms found. |
| **Trakt** | "Watching now" numbers | **Unclear.** Free with a registered app; some paid App Store apps use it. |
| **Wikidata** | Exact Rotten Tomatoes and Metacritic page links | **Fine.** Free for any use. |
| **Netflix Top 10** | The weekly list | **Likely fine** with credit; publicly published. |

## Steps, if we go ahead

1. **Email TMDB** (their FAQ points to their sales contact). Describe Tivvy as a free app with no ads, no accounts and no data collection, and ask for written permission to publish on the App Store, including posters and the JustWatch availability data.
2. **Replace the IMDb ratings file,** e.g. with IMDb ratings from OMDb or with TMDB's own audience score. Worth considering for the website too, given IMDb's terms.
3. **Check Rotten Tomatoes, OMDb, MDBList and Trakt** directly. If Rotten Tomatoes scores can't be shown, critic scores could come from Metacritic only.
4. **Add an About / Credits section** with the TMDB logo and the JustWatch credit (and any others required).
5. **Build the shell** (e.g. Capacitor), add a few native touches, test on an iPhone.
6. **Join the Apple Developer Program,** prepare the store listing and privacy page, and submit for review.

## Sources

- [TMDB API Terms of Use](https://themoviedb.org:443/api-terms-of-use)
- [TMDB developer FAQ](https://developer.themoviedb.org/docs/faq)
- [TMDB forum: App Store considered commercial](https://themoviedb.org/talk/5d29d886be4b36756aa16a8a)
- [Apple Developer Forums: TMDB-based app rejected for copyright](https://developer.apple.com/forums/thread/649351)
- [IMDb non-commercial datasets](https://developer.imdb.com/non-commercial-datasets)
- [IMDb Help: Can I use IMDb data in my software?](https://help.imdb.com/article/imdb/general-information/can-i-use-imdb-data-in-my-software/G5JTRESSHJBBHTGX)
- [TMDB watch providers, JustWatch credit (library docs)](https://lorenzopant-tmdb-docs.vercel.app/docs/api-reference/watch-providers/tv-providers)
- [Rotten Tomatoes API options and pricing](https://api.market/blog/proapi/rotten-tomatoes/best-rotten-tomatoes-api)
- [Movie API comparison, including OMDb](https://zuplo.com/blog/2024/10/03/best-movie-api-imdb-vs-omdb-vs-tmdb)
- [MDBList terms (summary)](https://tostracker.app/document/mdblistcom-tos)
- [Rippple for Trakt (App Store example)](https://apps.apple.com/app/id6758765611)
