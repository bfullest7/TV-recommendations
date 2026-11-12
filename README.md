# Tivvy

A phone web app that shows the best things to stream right now on the services you have.

**Rows** (each one says where its data comes from):

| Row | Source |
|---|---|
| Top picks for you | All the signals below, plus your 👍 / 👎 |
| Trending now | 75% trending (70% TMDB daily trending + 30% Trakt watchers) + 25% "New & recent", titles with 5K+ IMDb votes |
| Top rated by audiences | IMDb ratings (adjusted for vote count), 65% rating + 35% "New & recent", titles with 20K+ IMDb votes |
| Critics' favorites | Rotten Tomatoes and Metacritic (via OMDb and MDBList), 65% critics + 35% "New & recent", titles with 20K+ IMDb votes |
| New on your services | TMDB, with streaming availability from JustWatch |
| Netflix Top 10 | Netflix's official weekly list; shown only when the Netflix filter is selected, and never used in rankings |

A filter at the top limits every row to one service. Your services and thumbs are saved only on your phone.

Each home row shows its best 20 titles; when there are more, a **See all ›** tile at the end opens the row in full (three across, 100 at a time, with more added as you near the end) with its own sort and filters.

**Your lists and search:**
- **＋ Add to list** on any title adds it to a "Your library" row right below Top Picks, newest first. Posters show small status icons in the corner: a thumb for titles you liked, a bookmark for titles in your list and a ✓ for titles you watched (posters are only dimmed when a title is no longer on your services).
- **Mark watched** hides a title from every row except "Your library" and the Netflix Top 10, where it shows the ✓. It doesn't take the title off your list. A watched series comes back to the rows when a new season premieres after you marked it.
- **👎 Not for me** hides a title from the same rows. Titles you like get a thumb on their poster; Not for me titles aren't marked.
- Mark watched and Not for me take effect when you close the title: it fades out of its rows and a banner offers Undo for 5 seconds. Otherwise nothing moves while you browse: a title you like stays where it is, and the rows update the next time you open the app, change a filter or close Settings. Adding to your list updates "Your library" right away without moving what's on screen.
- To undo any of these, open the title (search finds every title) and tap the button again.
- The "Your library" row has **Watchlist**, **Liked** and **Watched** pills that switch what the row shows; the **See all ›** tile at the end opens the **Your library** page: posters three across, with three tabs. **Watchlist** shows titles you've added and haven't watched; **Liked** shows every title you've liked; **Watched** shows everything you've marked watched. Sort (recently added, liked or watched, best match, IMDb rating, newest release, A–Z) and filter by service or TV & movies.
- **Search** (magnifying glass) opens full screen and starts empty each time. It finds any title the app tracks, across all services. Words can be in any order, and words that describe the title (its genre, "documentary", "movie", a service name) narrow the match instead of breaking it, so "mike tyson documentary" or "tyson netflix" find Mike Tyson's special, and "documentary" or "crime netflix" list matching titles; titles on your services come first, with "In your list" and "✓ Watched" labels.

## How it works

**[ALGORITHM.md](ALGORITHM.md) is the full reference for how titles are picked and ordered** (rows, scores, your choices, rotation, and a log of changes and why). The summary below gives the setup side.

- `pipeline/build_feed.py` runs on GitHub Actions every 2 hours. It refreshes the trending numbers (Trakt and TMDB) each time and everything else (what's on each service, IMDb ratings, critic scores, Netflix Top 10) once a day, early each morning (the first run after 10:00 UTC, 5:17 AM Eastern in winter; `full_refresh_utc_hour`). It writes `data/feed.json`.
- Which titles the app tracks: for each service, movies and TV separately, TMDB's top 40 highest rated, top 40 popular right now, top 40 new in the last 30 days (`discover_pages_per_list`, 20 per page) and top 100 most well known, meaning the most-rated titles such as Squid Game (`well_known_pages`; top 200 for Netflix and Hulu TV, `well_known_pages_by_service`), plus the best-known recent releases (the 60 most-rated movies, 100 on Netflix and Prime Video, and 40 most-rated shows from the last 3 years, plus the top 40 movies and 20 shows from 3–5 years ago, `recent_lists`), plus the top 40 most-rated documentaries and (TV only) reality shows, which get fewer ratings than dramas (`genre_lists`), plus everything trending and the Netflix Top 10.
- Critic scores (OMDb, then MDBList for gaps) are looked up for new titles on every refresh, newest first, within each service's daily limit, and rechecked monthly (`omdb_recheck_days`). Titles released in the last 60 days that are still missing a score are rechecked every 3 days instead (`recent_window_days`, `recent_recheck_days`), since reviews arrive after release.
- The app (`index.html`, `app.js`, `styles.css`) is published with GitHub Pages and reads that file. API keys never reach the app; they stay in GitHub Secrets.
- The Top Picks ranking happens on the phone, so each person's thumbs only affect their own picks.

### Top Picks ranking

(Summary; [ALGORITHM.md](ALGORITHM.md) has the details.)

Each signal is scored 0–100 and combined with these weights (edit them in `config.json`):

| Signal | Weight | How it's scored |
|---|---|---|
| Your taste | 30% | Genres of titles you liked (common genres count less: each counts (1 − its share of titles)³, about 25% for Drama) plus genres you like or dislike in Settings (a genre set in Settings counts like two title thumbs), and TMDB's "more like this" for titles you rated. Not for me on a title doesn't lower its genres, only its similar titles |
| Audience | 25% | IMDb weighted rating: titles with few votes are pulled toward the average (5,000 votes for movies, 2,000 for TV) |
| New & recent | 20% | Full credit for titles released or premiered in the last 3 months, fading steadily to 0 at 3 years (`recency_full_days`, `recency_zero_days`); a new season of an older show counts a quarter (`recency_season_credit`); arriving on a service in the last 30 days counts fully |
| Critics | 15% | Average of Rotten Tomatoes and Metacritic |
| Trending | 10% | Average of Trakt watchers right now (log-scaled) and position on TMDB's daily trending list, each scaled separately for movies and TV |

If a title is missing a signal (no critic score, or you haven't rated anything or picked any genres yet), that signal is skipped and the other weights scale up to fill the gap. Titles you've marked watched or Not for me are left out of Top Picks (titles you like stay in and are re-ranked), as are titles with fewer than 5,000 IMDb votes (`row_tilt.top_picks_min_imdb_votes` in `config.json`).

## Setup

### 1. Get three free API keys

- **TMDB**: create an account at themoviedb.org, then go to Settings → API and request a key (choose "Developer", personal use). Copy the **API Key** (or the API Read Access Token; either works).
- **Trakt**: create an account at trakt.tv, then go to Settings → Your API Apps → New Application. Any name is fine; use `urn:ietf:wg:oauth:2.0:oob` as the redirect URI. Copy the **Client ID**.
- **OMDb**: request a free key at omdbapi.com/apikey.aspx and click the activation link in the email.
- **MDBList** (optional, adds critic scores for TV): sign up at mdblist.com, then Preferences → API Access → generate a key.
- **Wikidata** (no key needed): the exact Rotten Tomatoes and Metacritic page for each title, so those score tiles on a title's screen can open the right page. Checked on full refreshes, rechecked monthly.

### 2. Add them to GitHub

In this repository: **Settings → Secrets and variables → Actions → New repository secret**. Add:

- `TMDB_API_KEY`
- `TRAKT_CLIENT_ID`
- `OMDB_API_KEY`
- `MDBLIST_API_KEY` (optional)

### 3. Turn on GitHub Pages

**Settings → Pages → Build and deployment → Source: GitHub Actions.**

### 4. Run the first refresh

**Actions → Refresh data and publish app → Run workflow**, mode `full`. It takes a few minutes. After that it runs on its own every 2 hours.

The app is then at **https://bfullest7.github.io/tivvy/**.

The free OMDb key allows 1,000 lookups a day, so critic scores fill in over the first 2 days.

### 5. Put it on your phone

Open the link, then:
- **iPhone (Safari)**: Share → Add to Home Screen.
- **Android (Chrome)**: ⋮ menu → Add to Home screen.

Share the same link with friends; each person picks their own services and gives their own thumbs.

Ratings live only on the phone. To keep them safe, use **Profile (the person icon) → Back up your data → Save a backup**, and **Restore a backup** on a new phone. On iPhone, the home-screen app and Safari keep separate settings, so use one or the other.

## Changing things

- **Services, weights, thresholds, refresh limits**: `config.json` (`row_tilt` sets how much the audience and critics rows lean toward recent releases).
- **Refresh schedule**: the `cron` line in `.github/workflows/refresh.yml`.
- **Tests**: `python -m unittest discover -s tests`.

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data provided by JustWatch. Ratings from IMDb (non-commercial datasets), Rotten Tomatoes and Metacritic via OMDb and MDBList, trending data from Trakt, and Netflix Top 10 data from Netflix.
