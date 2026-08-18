# CodeCraft Reporting Pipeline

Automated weekly reporting pipeline for crypto marketing clients.

## How it works

```
Google Sheet → Apps Script (buildDObject) → GitHub API → GitHub Pages
```

Each client has one tab in a Google Sheet. Clicking **Deploy Report** reads the sheet data, fetches `_template/index.html` from this repo, injects the data, and pushes `{slug}/index.html` live.

Reports are live at: `https://adele-cc.github.io/codecraft-reports/{slug}/`

---

## New machine setup

### 1. Clone this repo

```bash
git clone https://github.com/adele-cc/codecraft-reports
cd codecraft-reports
```

### 2. Set your GitHub token

```bash
export GITHUB_TOKEN=YOUR_TOKEN_HERE
# Add to ~/.bashrc or ~/.zshrc to persist
```

### 3. Push template changes

After editing `_template/index.html`:

```bash
bash _tools/push_template.sh
```

### 4. Apps Script

The Apps Script lives inside each client's Google Sheet — accessible from any browser. No local install needed.

**Extensions → Apps Script**

To paste a fresh copy: open `_tools/CodeCraft_AppsScript.js`, replace the token placeholders with the real values, paste into the editor and save.

---

## Repo structure

| Path | Purpose |
|------|---------|
| `_template/index.html` | Live report template |
| `_tools/push_template.sh` | Pushes template to GitHub (uses `$GITHUB_TOKEN`) |
| `_tools/CodeCraft_AppsScript.js` | Source of the Apps Script (tokens redacted) |
| `client-assets/` | Uploaded screenshots and images |
| `{slug}/index.html` | Deployed client reports |

---

## Sheet structure

Each tab = one client. Columns:

| Col | Field | Notes |
|-----|-------|-------|
| A | Section | `social`, `cookie3`, `kol`, `quest`, `pr`, `meta`, etc. |
| B | Key | e.g. `xFollowers`, `impressions` |
| C | Label | Display name (optional) |
| D | Start | Campaign start value |
| E | Last Week | |
| F | Now | Current value, or image URL for image fields |
| G | Show | `Y` = always show, `N` = hide, blank = show if value |

### Meta rows (section = `meta`)

| Key | Purpose |
|-----|---------|
| `client` | Client name |
| `clientLogo` | Logo image URL |
| `banner` | Banner image URL |
| `pin` | 4-digit PIN to protect the report |
| `published` | Y/N |
| `week` | Week number |
| `weekDate` | Date string in header |
| `campaignStart` | Campaign start date |

### Custom extras

Any row with a key ending in one of these suffixes gets auto-rendered:

| Suffix | Renders as |
|--------|-----------|
| `_link` | Link card |
| `_post` | Tweet card |
| `_text` | Text card |
| `_image` | Image card |

---

## Apps Script functions

| Function | Purpose |
|----------|---------|
| `onOpen()` | Adds CodeCraft menu to the sheet |
| `deployReport()` | Builds D object, injects into template, pushes to GitHub |
| `showUploadDialog()` | Popup to upload images to `client-assets/{slug}/` |
| `saveImageUrl()` | Writes uploaded image URL back to column F |
| `removeReport()` | Deletes `{slug}/index.html` from GitHub |
| `runDiagnostics()` | Shows debug info for the current sheet |
| `fetchTweetData()` | Fetches tweet data via fxtwitter API |
| `fetchTwitterProfile()` | Fetches avatar + followers via Xquik API |
| `buildDObject()` | Reads sheet rows → builds D object for the template |

---

## Template

The template uses inject markers that Apps Script replaces at deploy time:

```js
/*CC_DATA_INJECT_START*/
const D = {};
/*CC_DATA_INJECT_END*/
```

If the markers are missing, deploy fails with a clear error.

---

## KOL Creator Leaderboard (within the KOL Campaign section)

`secKol` now supports an optional full creator leaderboard — KPI row (avg score, avg followers, replies/post, etc.), a top-5 spotlight grid with a Cookie Score bar chart, and a sortable/searchable table of every creator. It's rendered by `buildKolLeaderboard()` and is purely additive: it only appears when `D.kol.leaderboard` is a non-empty array, so clients without it are unaffected.

**This is not yet wired to the Sheet.** The sheet's row-per-field schema (Section/Key/Start/Last Week/Now) doesn't fit a many-row table like 85 creators well, so `D.kol.leaderboard` has to be populated as a one-off step rather than through normal columns — e.g. by editing a deployed report's injected `const D = {...}` directly, or building a small script that merges creator data into `D.kol.leaderboard` before deploy (see `ethra-smart-growth/index.html` for the standalone version this was adapted from, and `xquik_api.md`-style notes for pulling avatars). If this needs to become sheet-driven for every client, that's a separate, larger change to `buildDObject()` and the sheet schema — flag it before starting since it touches the shared deploy script.

Each leaderboard row shape:
```js
{ rank: 1, username: "handle", url: "https://x.com/handle", score: 7400, followers: 2880, posts: 23, replies: 1670, avatar: "data:image/jpeg;base64,..." /* optional */ }
```

---

## Image uploads

The upload dialog (`📷 Upload Screenshot` menu):
- Uploads files directly to `client-assets/{slug}/` on GitHub via browser-side fetch (no Google auth required)
- Saves the resulting raw URL to column F via `saveImageUrl()`
- If that fails, shows the URL in a copyable input for manual paste

---

## In progress

- **PDF download button** — html2canvas + jsPDF approach, one landscape A4 page per section. Demo files exist but not yet integrated into the main template.
- **Team member upload permissions** — latest fix uses browser-side GitHub upload with a copy-URL fallback. Monitoring for issues.
