# What to Watch

A phone web app that shows the best things to stream right now on the services you have.

**Rows** (each one says where its data comes from):

| Row | Source |
|---|---|
| Top picks for you | All the signals below, plus your 👍 / 👎 |
| Trending now | Trakt: people watching right now |
| Top rated by audiences | IMDb ratings, adjusted for vote count |
| Critics' favorites | Rotten Tomatoes and Metacritic (via OMDb) |
| New on your services | TMDB, with streaming availability from JustWatch |
| Netflix Top 10 | Netflix's official weekly list (shown only, never used in rankings) |

A filter at the top limits every row to one service. Your services and thumbs are saved only on your phone.

## How it works

- `pipeline/build_feed.py` runs on GitHub Actions every 2 hours. It refreshes Trakt's trending numbers each time and everything else (what's on each service, IMDb ratings, critic scores, Netflix Top 10) about once a day. It writes `data/feed.json`.
- The app (`index.html`, `app.js`, `styles.css`) is published with GitHub Pages and reads that file. API keys never reach the app; they stay in GitHub Secrets.
- The Top picks ranking happens on the phone, so each person's thumbs only affect their own picks.

### Top picks ranking

Each signal is scored 0–100 and combined with these weights (edit them in `config.json`):

| Signal | Weight | How it's scored |
|---|---|---|
| Audience | 30% | IMDb weighted rating: titles with few votes are pulled toward the average (5,000 votes for movies, 2,000 for TV) |
| Your taste | 25% | From your thumbs: genres you like or dislike, and TMDB's "more like this" for titles you rated |
| Buzz | 20% | Trakt watchers right now, log-scaled |
| Critics | 15% | Average of Rotten Tomatoes and Metacritic |
| Freshness | 10% | New releases, new seasons, and titles newly added to a service, fading over 30 days |

If a title is missing a signal (no critic score, or you haven't rated anything yet), that signal is skipped and the other weights scale up to fill the gap. Titles you've rated are left out of Top picks.

## Setup

### 1. Get three free API keys

- **TMDB**: create an account at themoviedb.org, then go to Settings → API and request a key (choose "Developer", personal use). Copy the **API Key** (or the API Read Access Token; either works).
- **Trakt**: create an account at trakt.tv, then go to Settings → Your API Apps → New Application. Any name is fine; use `urn:ietf:wg:oauth:2.0:oob` as the redirect URI. Copy the **Client ID**.
- **OMDb**: request a free key at omdbapi.com/apikey.aspx and click the activation link in the email.

### 2. Add them to GitHub

In this repository: **Settings → Secrets and variables → Actions → New repository secret**. Add:

- `TMDB_API_KEY`
- `TRAKT_CLIENT_ID`
- `OMDB_API_KEY`

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

Ratings live only on the phone. To keep them safe, use **Settings → Back up your ratings → Save a backup**, and **Restore a backup** on a new phone. On iPhone, the home-screen app and Safari keep separate settings, so use one or the other.

## Changing things

- **Services, weights, thresholds, refresh limits**: `config.json`.
- **Refresh schedule**: the `cron` line in `.github/workflows/refresh.yml`.
- **Tests**: `python -m unittest discover -s tests`.

## Credits

This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability data provided by JustWatch. Ratings from IMDb (non-commercial datasets), Rotten Tomatoes and Metacritic via OMDb, trending data from Trakt, and Netflix Top 10 data from Netflix.
