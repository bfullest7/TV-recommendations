# Design system

How "Tivvy" looks and reads. Follow this when changing the app, and update it when Beth approves a new rule. Sizes are in CSS pixels (`styles.css`); colors are the tokens at the top of `styles.css`.

## Text sizes

The app uses one small scale. Each size has one job; avoid in-between sizes like 13.5 or 14.5.

| Size | Job | Where it's used |
|---|---|---|
| 22 | App title | "Tivvy", with the orange retro TV logo (28 wide) just before it; the welcome card title ("Welcome to Tivvy") |
| 20 | Screen titles | "Profile"; show title on a detail screen |
| 18 | Headings | Home row titles ("Trending now"), Settings section headings, detail-screen headings ("Why this pick") |
| 17 | Score numbers | Big numbers in the detail-screen score boxes ("9.0", "90%") |
| 16 | Form inputs, tip headings | Search box and "TV & movies" picker (16 stops iPhone from zooming in); the bold heading in the genre tip |
| 15 | Buttons and tappable labels | Add to list, Mark watched, Like, Not for me, backup buttons, "Pick your services", "How your picks work" item names, name in a detail screen's top bar, show names in search results |
| 14 | Body text and subtitles | Home row subtitles, Settings descriptions, "How your picks work" text, genre and service names, show description, "Why this pick" text, detail-screen year/type/genres line, welcome card text, filter buttons |
| 13 | Title details in lists | Show names under posters (posters are narrow, so 13 keeps long names readable); the year/type/rating and service lines in search results |
| 12 | Fine print | Year and rating under posters, score labels, service badges on the detail screen, "Liked", "In your list" and "Watched" pills in search, "Data updated" note, table headers, the "No longer available" note on posters, the grey source line under each signal in "Why this pick" |
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
| `--accent` | #ffb547 (orange) | Main call to action only ("Pick your services"), checked boxes, the underline under the active tab on the Your library page (the one place it marks a selection), and one-time tips (dark text on the app color) |
| `--up` / `--down` | green / red | "Like" and "Not for me" when selected |

**Orange is not a "selected" or "focused" color.** The search box shows a thin grey (`--muted`) outline while you type. Nothing else ever shows a focus outline or tap flash: dropdowns, buttons, pills, posters and tabs just respond. The list and watched buttons stay white with a plain outline when on; the icon and wording show the state.

## Buttons

- Rounded corners: 10 for buttons, 999 (pill) for filter buttons, 50% for round icon buttons.
- Secondary buttons: `--surface-2` fill, 1px `--line` outline, white text, weight 600, size 15.
- Main call to action: orange fill, dark text, weight 700. Sized to its label (not full width) on the welcome card.
- **No "Watch on" button on the detail screen.** It was tried and removed: services don't share title links, so the buttons were unreliable, and people go to their service's app (often on the TV) anyway. The service badges show where to watch.
- Button labels stay on one line on every iPhone, including the smallest (iPhone SE). Trim side padding before shrinking text.

## Spacing

- Screen side margin: 16.
- Space between home screen rows: 28 above each row title; 14 between a row's subtitle and its posters.
- Gap between side-by-side buttons: 10; between tiles in a grid: 6 to 8.
- Paragraphs in "How your picks work" (Settings and the Top picks page): 14 between paragraphs; 16 above and below charts.
- Welcome screen: behind the card, a tilted (-8°), darkened (38%) wall of today's trending posters, five across, filling the whole screen below the header, with a dark gradient rising from the bottom (solid page color at the very bottom, clear by about halfway up) and a softer one under the header (clear by 30% down). The card's middle sits 45% of the way down the screen (a little above center, which looks centered to the eye), over the wall, slightly see-through (86% of the card color, lightly blurred), 34 in from each side (on small phones it widens to 16 in, so the text keeps two lines) with 50 top, 58 bottom and 26 side padding; 44 top and bottom, 24 sides, 28 above its button, everything centered. Title 22 bold, text 15, button 16. At the top, the orange retro TV logo (the header logo's drawing, 48 wide), 22 above the title. Title "Welcome to Tivvy" (no exclamation mark), 22 bold. Text: "Discover what to watch. The best shows and movies, picked just for you." (positive and action-first; no openers like "Never" or "No more") on two balanced lines (no single word left alone). Button "Get started". It opens Profile with one extra line at the top (15, main text color, 18 below the header), shown only when opened from the welcome card: "Pick your services, then tap 👍 on a few genres you love." Streaming services and Genres sit right below it, so picking both is one step. The Genres description doesn't call genres optional. The welcome screen has no header at all (the poster wall runs to the top of the screen); the header, with search and Settings (a person icon), appears once services are picked.

## Writing

- Plain, short and friendly. Sentence case ("Add to list", not "Add To List").
- **Row subtitles:** one short line that says what the row is. Full explanations live in Settings under "How your picks work". Subtitles may wrap to two lines on small phones; never cut them off with "…".
- **Periods:** leave the period off a subtitle or description that is a single sentence. Keep periods when there are two or more sentences.
- The Top picks subtitle stays the same before and after the user rates titles.
- Use "list" in buttons ("＋ Add to list", then a bookmark icon + "Added to list") "Watchlist" for the saved titles, and "Your library" for the home row and page that hold the watchlist, liked and watched titles.
- Use "＋" for an action that adds ("＋ Add to list"). Show a state that's on with its icon: the bookmark for the list ("Added to list", "In your list"), "✓" for watched ("✓ Watched").

## Icons

- **App icon:** a retro TV (rabbit-ear antennas, rounded screen, play arrow) drawn in thick dark (#0f1115) lines on the orange app color, sitting a little above center. The header logo is the same drawing in orange on the dark header; the launch screen shows it dark on an orange circle.

- **Link preview:** `icons/preview.png` (1200×630): the orange TV logo and "Tivvy" in large white type on the page color, with a soft orange glow. No tagline in the image, since the description shows under it. Title "Tivvy", description "Discover what to watch. The best shows and movies, picked just for you." The preview tags use full web addresses.

- Icons are simple drawn shapes in the style of the search and settings buttons, not emoji (emoji look different on each phone).
- **Header buttons:** search (21 wide) and Profile (an outline person icon, 20 wide), each in a 40 round button. The person icon opens "Profile" (the settings panel), with plain section headings: "Streaming services", "Genres", "How your picks work", "Back up your data".
- **Poster status circles:** small white icons in dark circles in the poster's top-right corner, always in this order: **liked** (drawn thumbs-up), **in your list** (bookmark), **watched** (✓). A watched poster is also dimmed. Each icon is left out where every poster would have it: no bookmark in "Your library" or the Watchlist tab, no thumb in the Liked tab, no ✓ (or dimming) in the Watched tab.
- **Not for me** is never marked on posters (those titles are hidden from rows).
- **Search results** show the same states as small grey pills under the service line: "Liked" (thumb), "In your list" (bookmark), "Watched" (✓).

## Behavior rules tied to the design

- Marking a title watched doesn't change any other button. A watched title stays on the list and keeps showing in "Your library" (dimmed, with the ✓ circle), but leaves every other row except the Netflix Top 10.
- A watched TV series counts as unwatched again once a season premieres after the date it was marked watched, so the new season shows in the rows. Marking it watched again hides it until the next season.
- "Not for me" (👎) titles are hidden from every row except "Your library" and the Netflix Top 10. Search still finds them so the rating can be undone.
- **Your library page** (opened from the "See all ›" tile, or the pills before anything is saved): full screen like search, with a round back arrow (‹) to the left of the title "Your library". Three tabs as plain words with an underline ("Watchlist", "Liked" and "Watched", no counts): 14 padding on each side, the active tab white with a 2-high orange underline spanning its padding, a faint full-width line under both; 20 below the line and 20 below the filter pills, then a scrolling bar with the sort and TV & movies pickers and service chips, then posters three across. A tab with nothing in it hides the sort and filters and shows, centered about 110 below the tab line: the tab's icon (28, white) in a 64 `--surface-2` circle, a bold 18 heading 24 below it, then a grey 15 message 10 below that, naming the button to tap in bold white (kept on one line). Watchlist: "Nothing saved yet" / "Tap **＋ Add to list** on any title to save it here." Liked: "Nothing liked yet" / "Tap **Like** on any title to see it here." Watched: "Nothing watched yet" / "Tap **Mark watched** on any title to see it here." Watched titles appear only in the Watched tab (not "Watchlist"), where posters aren't dimmed or marked watched. The Liked tab shows every title you've liked, listed or watched or not; it sorts by Recently liked (default; likes from before dates were saved come last), Best match, IMDb rating, Newest release or A–Z. Closing a title opened from this page updates it right away, keeping the scroll position: a title removed from the list leaves "Watchlist"; one marked watched moves to Watched; one un-marked in Watched goes back to "Watchlist" if it's on the list, or simply leaves; one un-liked leaves the Liked tab.
- **Home rows** show up to 20 titles (`row_length` in config.json). When a row has more, a "See all ›" tile ends it (poster-sized, card color with a thin outline, 15 semi-bold, same as in "Your library"). It opens that row in full on its own page: full screen like Your library, with a round back arrow (‹) and the row title, the row's grey 14 subtitle 14 below the header line, then 16 below that the scrolling bar with a sort picker (the row's own order first: "Best match for you", "Most popular", "Audience rating", "Critic rating", "Recently added"; then IMDb rating, Newest release, A–Z), the TV & movies picker and service chips (starting from the home screen's), then posters three across: 100 to start, with the next 100 added quietly when you're within two screens of the end, until the list runs out; a long list (over 100) ends with a grey 14 "That's everything", 28 below the grid. Home rows don't load more as you swipe: the best titles come first, and "See all" is the place to dig deeper.
- **Grid pages load a screen at a time, not in a cascade.** Opening a grid page (Your library, a row's "See all") or changing its tab, sort or filter keeps the old grid, dimmed to 40%, with a small grey spinner in the tile area, 40% of the way from the top of the grid to the bottom of the screen (a little above center, which looks centered to the eye). The spinner only appears if the wait passes 0.12 seconds, so changes are instant when the posters are already on the phone; once it appears it stays at least 0.3 seconds so it never flickers. This applies to opening a page and to changing a tab, sort or filter, until the posters for the first screen (12) have loaded and are ready to draw, then shows the new grid all at once with those posters already in place, with one soft 0.15-second fade. It never waits more than 3 seconds. Posters further down fade in (0.2 seconds) as you scroll to them.
- **"How it works ›" on Top picks only:** grey 14 text link on the right edge of the "Top picks for you" title line. It opens "How Top picks work" full screen (like search) with a ✕, showing the same explanation and chart as Settings. Other rows rely on their subtitles.
- Search opens full screen on the page background, with the search box where the app title sits. It starts empty each time it's opened (viewing a result and coming back keeps the search). Settings and the detail screen are sheets that slide up over the home screen. A title's detail screen always opens at the top, even if it was scrolled last time; tapping its buttons keeps your place.
- **Nothing moves while browsing.** Like, Not for me and Mark watched leave the title where it is. A title that will leave the row dims (watched also shows "✓ Watched"); liked titles look unchanged and stay in Top picks. The rows update at natural moments: reopening the app, coming back to it, changing a filter, or closing Settings.
- **"Your library" row** sits right below Top picks (your recommendations come first) and always shows. Under the title (no subtitle), three pills: **Watchlist** (bookmark), **Liked** (thumb), **Watched** (✓), with the same icons as the poster circles; 14 text, 36 high, 12 side padding, 8 apart, 10 below the title.
  - **Nothing saved, liked or watched yet:** the row is just the title and the pills, none selected; each pill opens that tab on the Your library page.
  - **Updates right away:** saving, liking or marking watched (from any row, a title or search) updates the row at once. When the row comes out of its empty state, it selects the pill the first title went to (like something first and it opens on Liked). After that the selected pill stays put. The page shifts by any change in the row's height so the row of the title you opened stays exactly where it was.
  - **Otherwise:** the pills switch the row in place, like tabs. The selected pill is white (like the "All" filter); Watchlist is selected each time the app opens. The row shows up to 20 titles (like every home row), most recent first (Watchlist includes watched titles, dimmed; Watched posters aren't dimmed), then a "See all ›" tile (poster-sized, card color with a thin outline, 15 semi-bold) that opens Your library at that tab. The home service and TV & movies filters apply.
  - **An empty pill** shows four dashed placeholder tiles, as tall as a poster plus its name (so there is no gap below them); the first says what to tap at 13 with the button name in bold white ("Tap **Like** on any title to see it here").
  - **Titles that leave your services** (or the data) stay in the row and on the Your library page (with "All" selected; not under a single service): the poster is dimmed like a watched one, with "No longer available" in the middle (12 semi-bold, white, in a dark rounded box 8 in from each side). The service badge stays, showing the service it was on while it was on yours (older saves didn't record it, so they show none). Without a poster, the name sits at the top of a plain tile, above the note. The title's screen says "No longer available" under the year line, and all its buttons still work; one gone from the data has no scores or "Why this pick". Likes still count toward your taste. A title saved from search that was never on your services isn't marked and stays out of the home row. Saves, likes and watched marks keep the poster, year and services for this.
  - The row is the same height in every state (cards reserve room for a two-line name), so switching pills never moves the rows below.
- The "Your library" row is the one exception to "nothing moves": it updates right away (see above). Every other row waits for a natural moment.
- **One-time rating tip:** the first time someone who hasn't rated anything opens a title, a yellow bubble ("Tap Like or Not for me on any title. Each tap helps tune your Top picks.") fades in after half a second (until then it can't be seen or tapped, so the buttons show first). It floats over the content just above the Like / Not for me row, with a pointer at the middle of Like, and scrolls with the page. Inside: 18 top/bottom and 20 side padding, "Got it" on the right with 24 of space before it. "Got it", Like or Not for me fade it away in place and it never shows again; closing the title without either brings it back next time.
- **One-time genre tip:** once services are picked and no genre is liked or disliked, a yellow bubble (bold 16 heading "Make Top picks yours", then "Tell us the genres you love and we'll tailor your picks to match" at 14 on its own line, then left-aligned "Pick genres" as a filled deeper-orange (#e8902a) pill with dark text and "Not now" as text only, both 14 semi-bold) fades in half a second after the home rows show. It floats 14 below the lowest title text in the Top picks row, left edge lined up with the posters (16 in) and the right edge 56 in, so it's a little narrower than the content with a pointer up at its first title, and scrolls with the page. "Pick genres" opens Settings at the top, where "Genres" is visible right below the services; "Not now" fades it away. Either, or liking/disliking any genre, dismisses it for good. Rating titles doesn't affect it. The rating tip on the detail screen waits until this one is dismissed, and depends only on title ratings.
- **Coming back to the app:** away less than 2 minutes, everything stays as you left it; 2 minutes or more, any open page or title closes and the home screen goes back to the top with every row at its first title. (iPhone may also close the app on its own after a while; then it starts fresh with the launch screen.)
- Changes made in Settings (services, genre likes, restoring a backup) update the home screen when Settings closes, so nothing flashes behind the sheet.

## Checking a visual change

Before pushing a visual change, check it at the smallest iPhone size (iPhone SE, 375 wide) and a large one (iPhone 15 Pro Max, 430 wide). Send Beth a screenshot first when she asks.
