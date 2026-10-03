# Claude usage

A static dashboard of my Claude Code token usage: totals, tokens per day by model, where the tokens go (cache vs. output), and when I work.

## How it works

`scripts/collect.mjs` reads the local Claude Code transcripts in `~/.claude/projects/**/*.jsonl`, de-duplicates streamed responses, and writes aggregate counts to `data/usage.json`. Only numbers leave the machine: per-day and per-model token counts, session counts, and a weekday × hour activity grid. No prompts, responses, file paths or project names.

The page (`index.html`, `app.js`, `style.css`) is plain HTML/JS with no build step, so it can be hosted anywhere static: GitHub Pages, Vercel, Netlify.

## Plan limits

`data/limits.json` is a snapshot of the plan usage limits (5-hour and weekly windows, extra usage) as shown in the Claude app. Those numbers are not in the local transcripts, so this file is refreshed by asking Claude Code to update it; the page shows how old the snapshot is and marks windows that have reset since.

## Updating

A Windows scheduled task runs `auto-update.ps1` every 5 minutes while the PC is on. It re-runs the collector and, only if there is new usage, commits `data/` and pushes. Install or remove it with:

```powershell
powershell -ExecutionPolicy Bypass -File install-auto-update.ps1
Unregister-ScheduledTask -TaskName "Claude usage auto-update" -Confirm:$false
```

`update.ps1` does the same once, by hand. Changes and errors are logged to `auto-update.log` (not committed).

The page reads the newest commit's data through the GitHub API, so it doesn't wait for GitHub Pages to rebuild. It checks again every 5 minutes while open, and the Refresh button checks immediately. Extra transcript folders (e.g. from WSL) can be passed to the collector: `node scripts/collect.mjs \wsl$Ubuntuhomeme.claudeprojects`.

## Running locally

Any static server works, since the page fetches `data/usage.json`:

```bash
npx serve .
```
