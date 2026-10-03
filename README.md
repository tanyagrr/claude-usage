# Claude usage

A static dashboard of my Claude Code token usage: totals, tokens per day by model, where the tokens go (cache vs. output), and when I work.

## How it works

`scripts/collect.mjs` reads the local Claude Code transcripts in `~/.claude/projects/**/*.jsonl`, de-duplicates streamed responses, and writes aggregate counts to `data/usage.json`. Only numbers leave the machine: per-day and per-model token counts, session counts, and a weekday × hour activity grid. No prompts, responses, file paths or project names.

The page (`index.html`, `app.js`, `style.css`) is plain HTML/JS with no build step, so it can be hosted anywhere static: GitHub Pages, Vercel, Netlify.

## Updating

```powershell
powershell -ExecutionPolicy Bypass -File update.ps1
```

This re-runs the collector, commits `data/usage.json` and pushes. Extra transcript folders (e.g. from WSL) can be passed to the collector: `node scripts/collect.mjs \\wsl$\Ubuntu\home\me\.claude\projects`.

## Running locally

Any static server works, since the page fetches `data/usage.json`:

```bash
npx serve .
```
