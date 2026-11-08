# Design system

How "What to Watch" looks and reads. Follow this when changing the app, and update it when Beth approves a new rule. Sizes are in CSS pixels (`styles.css`); colors are the tokens at the top of `styles.css`.

## Text sizes

The app uses one small scale. Each size has one job; avoid in-between sizes like 13.5 or 14.5.

| Size | Job | Where it's used |
|---|---|---|
| 22 | App title | "What to Watch", with the orange TV logo (28 wide) just before it |
| 20 | Screen titles | "Settings"; show title on a detail screen |
| 18 | Headings | Home row titles ("Trending now"), Settings section headings, detail-screen headings ("Why this pick"), welcome card title |
| 17 | Score numbers | Big numbers in the detail-screen score boxes ("9.0", "90%") |
| 16 | Form inputs, tip headings | Search box and "TV & movies" picker (16 stops iPhone from zooming in); the bold heading in the genre tip |
| 15 | Buttons and tappable labels | Add to list, Mark watched, Like, Not for me, backup buttons, "Pick your services", "How it's calculated" item names, name in a detail screen's top bar, show names in search results |
| 14 | Body text and subtitles | Home row subtitles, Settings descriptions, "How it's calculated" text, genre and service names, show description, "Why this pick" text, detail-screen year/type/genres line, welcome card text, filter buttons |
| 13 | Title details in lists | Show names under posters (posters are narrow, so 13 keeps long names readable); the year/type/rating and service lines in search results |
| 12 | Fine print | Year and rating under posters, score labels, service badges on the detail screen, "Liked", "In your list" and "Watched" pills in search, "Data updated" note, table headers, the grey source line under each signal in "Why this pick" |
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
| `--accent` | #ffb547 (orange) | Main call to action only ("Pick your services"), checked boxes, the underline under the active tab on the Your list page (the one place it marks a selection), and one-time tips (dark text on the app color) |
| `--up` / `--down` | green / red | "Like" and "Not for me" when selected |

**Orange is not a "selected" or "focused" color.** The search box shows a thin grey (`--muted`) outline while you type. Nothing else ever shows a focus outline or tap flash: dropdowns, buttons, pills, posters and tabs just respond. The list and watched buttons stay white with a plain outline when on; the icon and wording show the state.

## Buttons

- Rounded corners: 10 for buttons, 999 (pill) for filter buttons, 50% for round icon buttons.
- Secondary buttons: `--surface-2` fill, 1px `--line` outline, white text, weight 600, size 15.
- Main call to action: orange fill, dark text, weight 700. Sized to its label (not full width) on the welcome card.
- Button labels stay on one line on every iPhone, including the smallest (iPhone SE). Trim side padding before shrinking text.

## Spacing

- Screen side margin: 16.
- Space between home screen rows: 28 above each row title; 14 between a row's subtitle and its posters.
- Gap between side-by-side buttons: 10; between tiles in a grid: 6 to 8.
- Paragraphs in "How it's calculated" (Settings and the Top picks page): 14 between paragraphs; 16 above and below charts.
- Welcome screen: behind the card, a tilted (-8°), darkened (38%) wall of today's trending posters, five across, filling the whole screen below the header, with a dark gradient rising from the bottom (solid page color at the very bottom, clear by about halfway up) and a softer one under the header (clear by 30% down). The card starts about 22% down the screen over the wall, slightly see-through (86% of the card color, lightly blurred), 34 in from each side (on small phones it widens to 16 in, so the text keeps two lines) with 50 top, 58 bottom and 26 side padding; 44 top and bottom, 24 sides, 28 above its button, everything centered. Title 20 bold, text 15, button 16. Text: "Find the best things to watch on your services. Select services to get started." on two balanced lines (no single word left alone); button "Select your services".

## Writing

- Plain, short and friendly. Sentence case ("Add to list", not "Add To List").
- **Row subtitles:** one short line that says what the row is. Full explanations live in Settings under "How it's calculated". Subtitles may wrap to two lines on small phones; never cut them off with "…".
- **Periods:** leave the period off a subtitle or description that is a single sentence. Keep periods when there are two or more sentences.
- The Top picks subtitle stays the same before and after the user rates titles.
- Use "list" in buttons ("＋ Add to list", then a bookmark icon + "Added to list") and "Your watchlist" for the row.
- Use "＋" for an action that adds ("＋ Add to list"). Show a state that's on with its icon: the bookmark for the list ("Added to list", "In your list"), "✓" for watched ("✓ Watched").

## Icons

- Icons are simple drawn shapes in the style of the search and settings buttons, not emoji (emoji look different on each phone).
- **Poster status circles:** small white icons in dark circles in the poster's top-right corner, always in this order: **liked** (drawn thumbs-up), **in your list** (bookmark), **watched** (✓). A watched poster is also dimmed. Each icon is left out where every poster would have it: no bookmark in "Your watchlist" or the In your list tab, no thumb in the Liked tab, no ✓ (or dimming) in the Watched tab.
- **Not for me** is never marked on posters (those titles are hidden from rows).
- **Search results** show the same states as small grey pills under the service line: "Liked" (thumb), "In your list" (bookmark), "Watched" (✓).

## Behavior rules tied to the design

- Marking a title watched doesn't change any other button. A watched title stays on the list and keeps showing in "Your watchlist" (dimmed, with the ✓ circle), but leaves every other row except the Netflix Top 10.
- A watched TV series counts as unwatched again once a season premieres after the date it was marked watched, so the new season shows in the rows. Marking it watched again hides it until the next season.
- "Not for me" (👎) titles are hidden from every row except "Your watchlist" and the Netflix Top 10. Search still finds them so the rating can be undone.
- **Your list page** ("See all ›", grey 14, right of the "Your watchlist" title): full screen like search, with a round back arrow (‹) to the left of the title "Your list". Three tabs as plain words with an underline ("In your list", "Liked" and "Watched", no counts): 14 padding on each side, the active tab white with a 2-high orange underline spanning its padding, a faint full-width line under both; 20 below the line and 20 below the filter pills, then a scrolling bar with the sort and TV & movies pickers and service chips, then posters three across. Watched titles appear only in the Watched tab (not "In your list"), where posters aren't dimmed or marked watched. The Liked tab shows every title you've liked, listed or watched or not; it sorts by Recently liked (default; likes from before dates were saved come last), Best match, IMDb rating, Newest release or A–Z. Closing a title opened from this page updates it right away, keeping the scroll position: a title removed from the list leaves "In your list"; one marked watched moves to Watched; one un-marked in Watched goes back to "In your list" if it's on the list, or simply leaves; one un-liked leaves the Liked tab.
- **"How it works ›" on Top picks only:** grey 14 text link on the right edge of the "Top picks for you" title line, styled exactly like "See all ›". It opens "How Top picks work" full screen (like search) with a ✕, showing the same explanation and chart as Settings. Other rows rely on their subtitles.
- Search opens full screen on the page background, with the search box where the app title sits. It starts empty each time it's opened (viewing a result and coming back keeps the search). Settings and the detail screen are sheets that slide up over the home screen.
- **Nothing moves while browsing.** Like, Not for me and Mark watched leave the title where it is. A title that will leave the row dims (watched also shows "✓ Watched"); liked titles look unchanged and stay in Top picks. The rows update at natural moments: reopening the app, coming back to it, changing a filter, or closing Settings.
- Adding to or removing from the list updates "Your watchlist" right away, and the page shifts by the same height so what's on screen doesn't move.
- **One-time rating tip:** the first time someone who hasn't rated anything opens a title, a yellow bubble ("Tap Like or Not for me on any title. Each tap helps tune your Top picks.") fades in after half a second (until then it can't be seen or tapped, so the buttons show first). It floats over the content just above the Like / Not for me row, with a pointer at the middle of Like, and scrolls with the page. Inside: 18 top/bottom and 20 side padding, "Got it" on the right with 24 of space before it. "Got it", Like or Not for me fade it away in place and it never shows again; closing the title without either brings it back next time.
- **One-time genre tip:** once services are picked and no genre is liked or disliked, a yellow bubble (bold 16 heading "Make Top picks yours", then "Tell us the genres you love and we'll tailor your picks to match" at 14 on its own line, then left-aligned "Pick genres" as a filled deeper-orange (#e8902a) pill with dark text and "Not now" as text only, both 14 semi-bold) fades in half a second after the home rows show. It floats 14 below the lowest title text in the Top picks row, left edge lined up with the posters (16 in) and the right edge 56 in, so it's a little narrower than the content with a pointer up at its first title, and scrolls with the page. "Pick genres" opens Settings at the top, where "Genres you like" is visible right below the services; "Not now" fades it away. Either, or liking/disliking any genre, dismisses it for good. Rating titles doesn't affect it. The rating tip on the detail screen waits until this one is dismissed, and depends only on title ratings.
- Changes made in Settings (services, genre likes, restoring a backup) update the home screen when Settings closes, so nothing flashes behind the sheet.

## Checking a visual change

Before pushing a visual change, check it at the smallest iPhone size (iPhone SE, 375 wide) and a large one (iPhone 15 Pro Max, 430 wide). Send Beth a screenshot first when she asks.
