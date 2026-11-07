# What to Watch

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

**Your lists and search:**
- **＋ Watchlist** on any title adds it to a "Your watchlist" row at the top, newest first.
- **Mark watched** hides a title from every row (it stays in the Netflix Top 10 with a "Watched" badge) and takes it off your watchlist. To undo either, open the title (search finds watched titles) and tap the button again.
- **Search** (magnifying glass) finds any title the app tracks, across all services; titles on your services come first.

## How it works

- `pipeline/build_feed.py` runs on GitHub Actions every 2 hours. It refreshes the trending numbers (Trakt and TMDB) each time and everything else (what's on each service, IMDb ratings, critic scores, Netflix Top 10) about once a day. It writes `data/feed.json`.
- The app (`index.html`, `app.js`, `styles.css`) is published with GitHub Pages and reads that file. API keys never reach the app; they stay in GitHub Secrets.
- The Top picks ranking happens on the phone, so each person's thumbs only affect their own picks.

### Top picks ranking

Each signal is scored 0–100 and combined with these weights (edit them in `config.json`):

| Signal | Weight | How it's scored |
|---|---|---|
| Your taste | 30% | Your thumbs on titles plus genres you like or dislike in Settings (a genre set in Settings counts like two title thumbs), and TMDB's "more like this" for titles you rated |
| Audience | 25% | IMDb weighted rating: titles with few votes are pulled toward the average (5,000 votes for movies, 2,000 for TV) |
| New & recent | 20% | Full credit for titles released or premiered in the last 3 months, fading steadily to 0 at 3 years (`recency_full_days`, `recency_zero_days`); a new season of an older show counts a quarter (`recency_season_credit`); arriving on a service in the last 30 days counts fully |
| Critics | 15% | Average of Rotten Tomatoes and Metacritic |
| Trending | 10% | Average of Trakt watchers right now (log-scaled) and position on TMDB's daily trending list, each scaled separately for movies and TV |

If a title is missing a signal (no critic score, or you haven't rated anything or picked any genres yet), that signal is skipped and the other weights scale up to fill the gap. Titles you've rated or marked watched are left out of Top picks, as are titles with fewer than 5,000 IMDb votes (`row_tilt.top_picks_min_imdb_votes` in `config.json`).

## Setup

### 1. Get three free API keys

- **TMDB**: create an account at themoviedb.org, then go to Settings → API and request a key (choose "Developer", personal use). Copy the **API Key** (or the API Read Access Token; either works).
- **Trakt**: create an account at trakt.tv, then go to Settings → Your API Apps → New Application. Any name is fine; use `urn:ietf:wg:oauth:2.0:oob` as the redirect URI. Copy the **Client ID**.
- **OMDb**: request a free key at omdbapi.com/apikey.aspx and click the activation link in the email.
- **MDBList** (optional, adds critic scores for TV): sign up at mdblist.com, then Preferences → API Access → generate a key.

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

The app is then at **https://bfullest7.github.io/TV-recommendations/**.

The free OMDb key allows 1,000 lookups a day, so critic scores fill in over the first 2 days.

### 5. Put it on your phone

Open the link, then:
- **iPhone (Safari)**: Share → Add to Home Screen.
- **Android (Chrome)**: ⋮ menu → Add to Home screen.

Share the same link with friends; each person picks their own services and gives their own thumbs.

Ratings live only on the phone. To keep them safe, use **Settings → Back up your data → Save a backup**, and **Restore a backup** on a new phone. On iPhone, the home-screen app and Safari keep separate settings, so use one or the other.

## Changing things

- **Services, weights, thresholds, refresh limits**: `config.json` (`row_tilt` sets how much the audience and critics rows lean toward recent releases).
- **Refresh schedule**: the `cron` line in `.github/workflows/refresh.yml`.
- **Tests**: `python -m unittest discover -s tests`.

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data provided by JustWatch. Ratings from IMDb (non-commercial datasets), Rotten Tomatoes and Metacritic via OMDb and MDBList, trending data from Trakt, and Netflix Top 10 data from Netflix.
