# CodeCraft Tools

Scripts and source files for the CodeCraft reporting pipeline.

## How it works

```
Google Sheet → Apps Script → GitHub (_template/index.html) → GitHub Pages ({slug}/index.html)
```

## New machine setup

### 1. Clone this repo
```bash
git clone https://github.com/adele-cc/codecraft-reports
cd codecraft-reports
```

### 2. Set your GitHub token
The token lives in your personal environment — never commit it.

**Mac/Linux:**
```bash
export GITHUB_TOKEN=ghp_xxxxxxxxxxxxx
```
Add that line to `~/.zshrc` or `~/.bashrc` to persist it.

**Windows (Git Bash):**
```bash
echo 'export GITHUB_TOKEN=ghp_xxxxxxxxxxxxx' >> ~/.bashrc
source ~/.bashrc
```

### 3. Edit the template
The report template is `_template/index.html` in this repo.

After editing it locally, push it:
```bash
cd _tools
bash push_template.sh
```

### 4. Apps Script
The Apps Script lives in each client's Google Sheet (Extensions → Apps Script).

The source file is `_tools/CodeCraft_AppsScript.js` — keep this in sync when you make changes.

**On a new machine:** just open the Google Sheet in any browser, go to Extensions → Apps Script, and the script is already there. No local install needed.

**If you need to update the script:** paste the contents of `CodeCraft_AppsScript.js` into the Apps Script editor, updating `GITHUB_TOKEN` on line 2 with the real token.

## Files

| File | Purpose |
|------|---------|
| `_tools/CodeCraft_AppsScript.js` | Source of truth for the Apps Script |
| `_tools/push_template.sh` | Pushes `_template/index.html` to GitHub |
| `_template/index.html` | The live report template |
| `client-assets/` | Uploaded screenshots and images |
| `{slug}/index.html` | Deployed client reports |
