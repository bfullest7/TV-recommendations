# Notes for Claude

## How Beth likes to work
- **Push each change right away** so Beth can test it on the phone. If Beth says "hold", commit locally and wait until told to push.
- After pushing, don't schedule a follow-up check that the publish went live (it costs usage, and publishing is reliable). Beth taps Refresh when the "Update available" banner appears.
- When Beth asks for options or "what do you think", explain the options and a recommendation **before** building anything.
- Keep explanations plain and non-technical.
- Never ask for API keys in chat. Keys live only in GitHub Secrets: `TMDB_API_KEY`, `TRAKT_CLIENT_ID`, `OMDB_API_KEY`, `MDBLIST_API_KEY`.

## The app
- Phone web app ("What to Watch"), mostly used as an iPhone home-screen app.
- Live at https://bfullest7.github.io/TV-recommendations/ (the address is case-sensitive). Repo: `bfullest7/TV-recommendations`, branch `main`.
- Files: `index.html`, `app.js`, `styles.css`, `sw.js` (helper that always loads the newest page), `manifest.webmanifest`, `icons/`, `config.json` (services, score weights, row settings; read live by the app).
- Data: `pipeline/build_feed.py` (Python standard library only) builds `data/feed.json` from TMDB, Trakt, IMDb, OMDb, MDBList and Netflix Top 10. Tests: `python3 -m unittest discover -s tests`.
- `README.md` explains the rows, scoring and setup.
- `DESIGN.md` is the design system: text sizes, colors, buttons, spacing and wording rules. Follow it for visual or wording changes, and update it when Beth approves a new rule.

## Publishing
- `.github/workflows/refresh.yml` refreshes the data every 2 hours and publishes the site on every push (data-only commits are skipped).
- On publish, the app version is a fingerprint of `index.html`, `app.js` and `styles.css`. It's stamped into the page and `version.json`, which drives the "Update available" banner.
- New site files must be added to the workflow's "Collect site files" copy step.
- Don't push while a manually started data refresh is still queued: a newer run cancels the pending one.

## iPhone home-screen quirks (already handled; be careful changing)
- The status bar is black-translucent with `viewport-fit=cover`. On a fresh launch, iOS briefly doubles the status-bar space. `settleLayout()` in `app.js` corrects it in the first 0.3 seconds.
- A launch screen (`#splash` in `index.html`) hides that correction: a white screen, then the logo fades in at about 0.4 seconds, then a 0.15-second fade to the dark app at about 1.15 seconds. It applies only when `navigator.standalone` is true.
- The launch screen is white on purpose: iOS always shows a white screen while starting the app, and a matching white launch screen hides that. Dark `apple-touch-startup-image` launch images were tried and removed: iOS still flashed white before them.
- The header has 24px of extra top padding so the title clears the iOS status-bar fade.
