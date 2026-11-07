# Design system

How "What to Watch" looks and reads. Follow this when changing the app, and update it when Beth approves a new rule. Sizes are in CSS pixels (`styles.css`); colors are the tokens at the top of `styles.css`.

## Text sizes

The app uses one small scale. Each size has one job; avoid in-between sizes like 13.5 or 14.5.

| Size | Job | Where it's used |
|---|---|---|
| 22 | App title | "What to Watch" |
| 20 | Screen titles | "Settings"; show title on a detail screen |
| 18 | Headings | Home row titles ("Trending now"), Settings section headings, detail-screen headings ("Why this pick"), welcome card title |
| 17 | Score numbers | Big numbers in the detail-screen score boxes ("9.0", "90%") |
| 16 | Form inputs | Search box and "TV & movies" picker (16 stops iPhone from zooming in) |
| 15 | Buttons and tappable labels | Add to list, Mark watched, Like, Not for me, backup buttons, "Pick your services", "How it's calculated" item names, name in a detail screen's top bar, show names in search results |
| 14 | Body text and subtitles | Home row subtitles, Settings descriptions, "How it's calculated" text, genre and service names, show description, "Why this pick" text, detail-screen year/type/genres line, welcome card text, filter buttons |
| 13 | Show names under posters | Posters are narrow, so 13 keeps long names readable |
| 12 | Fine print | Year and rating under posters, score labels, service badges on the detail screen, "✓ Watched" badge, "Data updated" note, table headers |
| 10.5 | Badges on posters | Service badge on a poster ("Netflix") |

Default text (anything not listed) is 15 with 1.4 line spacing. Paragraphs use 1.5 line spacing.

## Colors

| Token | Color | Use |
|---|---|---|
| `--bg` | #0f1115 | Page background |
| `--surface` | #181b22 | Cards, sheets (Settings, detail screen), welcome card |
| `--surface-2` | #222631 | Buttons, score boxes, picker tiles |
| `--text` | #f2f3f5 | Main text |
| `--muted` | #9aa1ad | Subtitles, descriptions, fine print |
| `--line` | #2b303b | Borders and dividers |
| `--accent` | #ffb547 (orange) | Main call to action only ("Pick your services"), checked boxes |
| `--up` / `--down` | green / red | "Like" and "Not for me" when selected |

**Orange is not a "selected" color.** The list and watched buttons stay white with a plain outline when on; the checkmark and wording show the state.

## Buttons

- Rounded corners: 10 for buttons, 999 (pill) for filter buttons, 50% for round icon buttons.
- Secondary buttons: `--surface-2` fill, 1px `--line` outline, white text, weight 600, size 15.
- Main call to action: orange fill, dark text, weight 700. Sized to its label (not full width) on the welcome card.
- Button labels stay on one line on every iPhone, including the smallest (iPhone SE). Trim side padding before shrinking text.

## Spacing

- Screen side margin: 16.
- Space between home screen rows: 20 above each row title.
- Gap between side-by-side buttons: 10; between tiles in a grid: 6 to 8.
- Welcome card: 44 top and bottom, 24 sides, 28 above its button, everything centered.

## Writing

- Plain, short and friendly. Sentence case ("Add to list", not "Add To List").
- **Row subtitles:** one short line that says what the row is. Full explanations live in Settings under "How it's calculated". Subtitles may wrap to two lines on small phones; never cut them off with "…".
- **Periods:** leave the period off a subtitle or description that is a single sentence. Keep periods when there are two or more sentences.
- The Top picks subtitle stays the same before and after the user rates titles.
- Use "list" in buttons ("＋ Add to list", then a bookmark icon + "Added to list") and "Your watchlist" for the row.
- Use "＋" for an action that adds and "✓" for a state that's on (bookmark + "Added to list", "✓ Watched").

## Icons

- Icons are simple drawn shapes in the style of the search and settings buttons, not emoji (emoji look different on each phone).
- **On your list:** a white bookmark ribbon in a small dark circle in the poster's top-right corner, and a small grey "On your list" pill (with the bookmark) in search results. Search results show a "✓ Watched" pill the same way. It's hidden in "Your watchlist", where every title is on the list.
- **Watched:** a dimmed poster with a "✓ Watched" label in the middle.
- **Ratings:** 👍 and 👎 never show on posters. They appear only on the detail screen's Like and Not for me buttons.

## Behavior rules tied to the design

- Marking a title watched doesn't change any other button. A watched title stays on the list and keeps showing in "Your watchlist" (dimmed, with a "✓ Watched" badge), but leaves every other row except the Netflix Top 10.
- A watched TV series counts as unwatched again once a season premieres after the date it was marked watched, so the new season shows in the rows. Marking it watched again hides it until the next season.
- "Not for me" (👎) titles are hidden from every row except "Your watchlist" and the Netflix Top 10. Search still finds them so the rating can be undone.
- Changing services in Settings updates the home screen when Settings closes, so nothing flashes behind the sheet.

## Checking a visual change

Before pushing a visual change, check it at the smallest iPhone size (iPhone SE, 375 wide) and a large one (iPhone 15 Pro Max, 430 wide). Send Beth a screenshot first when she asks.
