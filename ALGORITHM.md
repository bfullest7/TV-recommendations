# How Tivvy picks and orders titles

The single place for how recommendations work: what data comes in, how each row ranks titles, how your choices change things, and why the rules are the way they are. Keep it current whenever a rule or number changes (see "Changes and why" at the end).

Numbers in `code style` are settings in `config.json`, which the app reads live, so most can be tuned without code changes. Where the logic lives: `pipeline/build_feed.py` (the data and the base scores, built on GitHub) and `app.js` (everything personal, worked out on each phone).

## 1. What comes in

The data build runs every 2 hours on GitHub and writes `data/feed.json`, which every phone downloads.

- **Every 2 hours (Trending update):** who's watching what right now (Trakt) and TMDB's daily trending lists. Critic score lookups also run then, within their daily limits.
- **Every morning (full rebuild):** the first run after 10:00 UTC, about 5:17 AM Eastern in winter (`full_refresh_utc_hour`). A missed morning run is caught up by the next one, and a manual rebuild doesn't skip the next morning's.

**When each source refreshes.** The schedule runs at 17 minutes past every even hour (UTC). GitHub often starts it late, sometimes by an hour.

| Source | What it gives | When it's fetched |
|---|---|---|
| **Trakt** | People watching each title right now | Every 2 hours |
| **TMDB trending** | Today's trending movies and shows | Every 2 hours. Titles new to the data get their details fetched right away. |
| **TMDB lists and details** | Which titles are on each service (via JustWatch), genres, posters, descriptions, release and season dates, running time, seasons, trailers, similar titles | Every morning. Service changes and "New on your services" arrivals are detected then. |
| **IMDb** | Ratings and vote counts (IMDb's daily file) | Every morning. If the file is unavailable, the previous ratings are kept. |
| **OMDb** | Rotten Tomatoes, Metacritic, IMDb fallback | Every 2 hours, new titles first, up to 900 lookups a day (`omdb_daily_limit`). Each title is rechecked every 30 days (`omdb_recheck_days`); recent releases still missing a score every 3 days. |
| **MDBList** | Rotten Tomatoes and Metacritic that OMDb lacks (mostly TV) | Same as OMDb, up to 900 a day (`mdblist_daily_limit`). |
| **Wikidata** | Exact Rotten Tomatoes and Metacritic page addresses | Every morning, for titles not checked yet; each title rechecked every 30 days. |
| **Netflix Top 10** | Netflix's official US weekly list | Checked every morning. Netflix publishes a new week each Tuesday, so it changes once a week. |

The daily lookup limits reset at midnight UTC (7 PM Eastern in winter). A big batch of new titles (like adding a new list) takes a day or so to get all its critic scores; normally new titles get them within 2 hours.

**On the phone.**
- **The data:** the app checks for new data each time it's opened or brought back to the screen, and redraws only if the data changed.
- **The settings:** `config.json` (weights, rotation and so on) is read each time the app starts, so a change applies the next time the app opens.
- **The app itself:** a new version shows the "Update available" banner. Without tapping Refresh, it updates on its own within about 10 minutes, or the next time the app starts fresh.
- **Your choices** (likes, Not for me, watched, watchlist, genres, services) are saved on the phone instantly and never leave it, except in a backup file.

**Which titles are tracked.** For each service, movies and TV separately, from TMDB:

| List | How many |
|---|---|
| Highest rated (300+ TMDB votes) | top 40 (`discover_pages_per_list` = 2 pages of 20) |
| Most popular right now | top 40 |
| New in the last 30 days | top 40 |
| Most well known (most-rated, e.g. Squid Game) | top 100 (`well_known_pages` = 5); top 200 for Netflix and Hulu TV (`well_known_pages_by_service`) |
| Most-rated documentaries | top 40, movies and TV (`genre_lists`) |
| Most-rated reality shows | top 40, TV only (`genre_lists`) |

Plus everything trending (Trakt top 100, TMDB's top 5 pages) and the Netflix Top 10. Only titles on at least one service stay in the data (about 2,700 in Nov 2026).

**What each title carries:** services (TMDB, via JustWatch), genres (TMDB; "Sports" added from keywords), IMDb rating and votes (IMDb's daily file), Rotten Tomatoes and Metacritic (OMDb, then MDBList for gaps), TMDB's recommended and similar titles, release and latest-season dates (announced seasons that haven't aired are ignored), running time or season count, trailer, and exact Rotten Tomatoes and Metacritic page addresses (Wikidata).

**Critic scores:** new titles are looked up first, within each service's daily limit (`omdb_daily_limit`, `mdblist_daily_limit`). Everything is rechecked monthly (`omdb_recheck_days`). Titles released in the last 60 days that are still missing a score are rechecked every 3 days (`recent_window_days`, `recent_recheck_days`), since reviews arrive after release. Rotten Tomatoes has no show-level scores for many TV shows in either source (checked Nov 2026), so those rely on Metacritic.

## 2. Base scores (same for everyone, 0 to 100)

Worked out in the data build.

| Score | How |
|---|---|
| **Audience** | IMDb rating adjusted for votes: titles with few votes are pulled toward the average (as if they had 5,000 extra average votes for movies, 2,000 for TV: `imdb_min_votes_movie`, `imdb_min_votes_tv`). Then 5.0 or lower = 0, 9.0 or higher = 100. |
| **Critics** | Average of Rotten Tomatoes (critics) and Metacritic, whichever exist. |
| **Trending** | 70% TMDB trending position (#1 = 100, falling evenly to 0 past the end of the list) + 30% Trakt watchers right now (log-scaled, so 10 vs 100 matters as much as 100 vs 1,000) (`trending_tmdb_share`). Movies and TV are scaled separately. |
| **New & recent** (worked out on the phone) | The best of: release or premiere date (full credit for the last 3 months, fading to 0 at 3 years: `recency_full_days`, `recency_zero_days`); a new season of an older show at a quarter of that (`recency_season_credit`); arriving on a service (full on arrival, fading to 0 over 30 days: `new_window_days`). |

## 3. The rows

Every row only shows titles on your services (and the TV & movies filter), and leaves out titles you've marked watched or Not for me, except where noted. Home rows show 20 (`row_length`); "See all" shows the rest.

| Row | Order |
|---|---|
| **Top picks for you** | Personal match score (section 4), among titles with 5,000+ IMDb votes (`top_picks_min_imdb_votes`). |
| **Your library** | Your watchlist, likes or watched titles (pills), most recent first. Not ranked; keeps watched and Not for me titles. |
| **Because you liked… / More like…** | Titles similar to one title (section 6), ordered by the personal match score. |
| **Trending now** | 75% Trending + 25% New & recent (`trending_recency`), among titles with 5,000+ IMDb votes (`trending_min_imdb_votes`). |
| **Top rated by audiences** | 65% Audience + 35% New & recent (`audience_recency`), among titles with 20,000+ IMDb votes (`min_imdb_votes`). |
| **Critics' favorites** | 65% Critics + 35% New & recent (`critics_recency`), among titles with 20,000+ IMDb votes. A title with only one of the two critic scores counts 5 points lower than one with both agreeing. |
| **New on your services** | Newest first: added to a service, a new season, or a new release, in the last 30 days. |
| **Netflix Top 10** | Netflix's official weekly list, as published. Shown only when the Netflix filter is on. Keeps watched and Not for me titles; never rotated or re-ranked. |

After ranking, Top Picks, Because you liked, Trending, Top rated, Critics' favorites and New all go through **keeping rows fresh** (section 7) and then **disliked genres sink** (section 5).

## 4. Top Picks: the personal match score

Each signal is 0 to 100, combined with these weights (`weights`):

| Signal | Weight |
|---|---|
| Your taste | 30% |
| Audience | 25% |
| New & recent | 20% |
| Critics | 15% |
| Trending | 10% |

A missing signal (no critic score yet, or no taste because you haven't rated anything or picked genres) is skipped, and the other weights scale up to fill the gap.

**Your taste** starts at 50 (neutral) and moves with:

- **Genres of titles you like.** Each like raises its genres, but common genres count less: each counts (1 − its share of all titles)³. That's about 25% for Drama, 45% for Comedy, 60% for Crime and nearly fully for rare genres (`COMMON_GENRE_SOFTENING` = 3 in `app.js`). So one liked drama adds a drama or two to Top Picks instead of filling it.
- **Genres you 👍 or 👎 in Profile.** Each counts like two title likes, at full strength.
- **Titles TMDB lists as similar** to ones you liked go up; similar to ones you marked Not for me go down.
- **Not for me never lowers genres.** It's usually about that title, not every drama.

Genre votes are smoothed (each genre's total is divided by its count + 1) and the genre part is capped, then: taste = 50 + 45 × genres + 25 × similar titles, kept between 0 and 100.

Liked titles stay in Top Picks and are re-ranked. "Why this pick" on a title's screen shows each signal's score, weight and points.

## 5. Your choices and what they change

| Choice | The title itself | Other titles |
|---|---|---|
| **Like** | Stays in every row; never moved down by rotation; shows in Your library (Liked). | Top Picks: its genres go up (common genres less) and its similar titles go up. Starts a "Because you liked" row. Other rows: no change. |
| **Not for me** | Leaves every row when its screen closes (with an Undo banner). Stays in Your library, the Netflix Top 10 and search. | Top Picks: its similar titles go down. Genres: no change. Other rows: no change. |
| **Mark watched** | Leaves every row when its screen closes (with an Undo banner). Stays in Your library (with the ✓) and the Netflix Top 10. A series comes back once a new season premieres after it was marked. | None. |
| **Add to watchlist** | Never moved down by rotation; shows in Your library. | Seeds "More like…" rows after your likes. No effect on Top Picks scores. |
| **Genre 👍 in Profile** | | Top Picks: counts like two likes. Protects its titles from sinking if they're also in a disliked genre. |
| **Genre 👎 in Profile** | | Top Picks: counts like two dislikes. Every row (except Your library and the Netflix Top 10): its titles move to the end, keeping their order, unless they're also in a liked genre. |
| **Open a title** | Its rotation count clears; it keeps its place for 2 weeks. | None. |

Everything is recalculated from your saved choices each time the rows are drawn, so rule changes apply to everyone's existing likes, dislikes and rotation counts as soon as their app updates.

## 6. "Because you liked…" row

- **Which title it's about:** your liked titles, newest first ("Because you liked [title]"), then watchlist titles that aren't liked, disliked or watched ("More like [title]"). Watched titles only count if liked. A title needs at least 6 similar titles you can see.
- **Similar titles:** TMDB's recommendations and similar titles, both ways (titles that list it, and titles it lists). Liked titles are left out.
- **It changes once a day**, the first time the app is opened on a new day, moving to the next title in line. During a visit it only changes if its title stops being a favorite (unliked and off the watchlist), or its wording would be wrong.
- **No single title qualifies:** "Based on your favorites" pools similar titles from all of them (needs 4). Nothing liked or saved: no row.

## 7. Keeping rows fresh (rotation)

So titles you keep scrolling past make room for others. Applies to Top Picks, Because you liked, Trending, Top rated, Critics' favorites and New (and their "See all" pages), not Your library or the Netflix Top 10.

- **Seen:** a home-row poster mostly (60%) on screen for about a second, with nothing open on top. Counts once per day, however many visits.
- **Moving:** from the 3rd day a title is seen (any days, not necessarily in a row) without being opened, liked, saved or marked watched, it moves 5 places down its row per day seen (`start_day` = 3, `places_per_day` = 5). It goes behind the title already in that spot and never disappears. For someone who looks at a row's first screen (about 3 posters) daily: the same tiles on days 1 and 2; a completely new first screen on day 3, which stays for day 4; from day 5, a partial change every day, mixing new titles with familiar ones drifting back (by then many titles are moving and they pass each other). Real use varies with what people open, like or save, which days they visit, and the daily data. 5 is the smallest step that fully replaces the first screen: the first three titles move together, so with 4 places yesterday's #1 landed in the third spot. A title leaves the first 20 after about 6 days.
- **Reset:** not seen for 2 weeks (`reset_days` = 14) puts it back with a fresh count. Opening it clears its count and keeps it in place for 2 weeks.
- **When it shows:** only when rows are drawn (opening or coming back to the app, changing a filter), never during a visit. Today's sighting counts from tomorrow.

## 8. When things change on screen

Rows don't reshuffle while you browse, except:

- **Your library (row and page)** updates when the title's screen closes: a title that no longer belongs under the selected pill or tab fades out, with a banner and Undo ("Removed from your list", "Like removed", "Marked as not watched", and the two below).
- **Not for me and Mark watched:** the title fades out of its rows when its screen closes, then a 5-second "Marked not for me" or "Marked as watched" banner with Undo appears. Not for me always shows its banner, even when the title only stays in Your library (it has no poster mark); Mark watched doesn't when the title only stays in Your library, where it shows the ✓.
- Everything else waits for a natural moment: reopening or coming back to the app, changing a filter, or closing Profile.

## Changes and why

Newest first. Record each change to a rule or number here, with what was tried and why.

- **Nov 9, 2026. Common genres count less for likes.** One liked drama took Top Picks from 11 to 17–18 dramas out of 20. Now each genre of a liked title counts (1 − its share of titles)³, so Drama about 25%, and liking Breaking Bad gives 13 dramas. Tried: 40% for Drama (14–15) and 15% (drama likes barely mattered).
- **Nov 9, 2026. Not for me no longer lowers genres.** One disliked drama pushed every drama down. It's usually about the title; the genre 👎 in Profile is for whole genres. Tried: half and a quarter strength, and counting genres only after a pattern of dislikes (harder to predict).
- **Nov 11, 2026. Rotation moves 5 places a day** (was 4), so the whole first screen of a row (3 posters) is new on day 3; with 4, yesterday's #1 stayed in the third spot.
- **Nov 11, 2026. Rotation starts on the 3rd day seen** (was the 4th; the 2nd was tried the same day), so the first tiles change after two days instead of staying for several. Places per day stay at 4.
- **Nov 9, 2026. Rotation starts on the 4th day seen** (was the 3rd), so people get a few days to consider a title before it moves. Places per day stay at 4 (about one screen width); 3 is the gentler option if it feels too fast.
- **Nov 9, 2026. Not for me and Mark watched remove the title on close, with Undo** (before, the title dimmed and left at the next natural moment).
- **Nov 9, 2026. Announced seasons ignored** until they air (they showed future years like 2027 and took away a recent season's New & recent credit).
- **Nov 9, 2026. Full rebuild every morning** (was every 20 hours, drifting about 4 hours earlier each day).
- **Nov 9, 2026. Recent releases missing critic scores rechecked every 3 days** (was 30).
- **Nov 8, 2026. More titles tracked:** most-rated documentaries and reality shows per service, and top 200 TV on Netflix and Hulu (about 1,960 → 2,735 titles). Famous documentaries and reality shows get fewer ratings than dramas and were missed.
- **Nov 8, 2026. "Most well known" raised from top 60 to top 100** per service (about 1,516 → 1,960 titles).
