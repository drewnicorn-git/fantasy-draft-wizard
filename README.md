# Fantasy Draft Wizard

A static fantasy football draft assistant: multi-source rankings, mock and live draft rooms, injury reports, depth charts, and in-season roster tools.

**Live site:** [fantasy-draft-wizard-app on GitHub Pages](https://drewnicorn-git.github.io/fantasy-draft-wizard-app/)

## Repositories

| Repo | Purpose |
|------|---------|
| [fantasy-draft-wizard](https://github.com/drewnicorn-git/fantasy-draft-wizard) | Development, issues, and launch roadmap |
| [fantasy-draft-wizard-app](https://github.com/drewnicorn-git/fantasy-draft-wizard-app) | Deploy target — GitHub Pages production site |

Pushes to `fantasy-draft-wizard-app` `main` deploy the static site. This repo tracks feature work and merges/releases to the app repo as phases complete.

## Features

- **Rankings** — FantasyPros, ESPN, Sleeper, and Fantasy Calc ADP with consensus columns, tags, and manual ranks
- **Mock draft** — Snake draft simulator with bot opponents and draft advice
- **Live draft** — Track real drafts pick-by-pick; export and move to in-season
- **Injuries** — ESPN injury report
- **Depth charts** — Per-team ESPN depth tables
- **In season** — Weekly stats/projections and roster tools

Rankings, injuries, depth charts, and in-season values refresh **daily** via GitHub Actions (no server required at runtime).

## Data updates

The `update-rankings` workflow (daily + manual dispatch):

1. `npm run fetch:rankings` — pull raw source JSON into `data/raw/`
2. `npm run build:pool` — merge into `data/rankings.json`, injuries, depth charts
3. `npm run build:inseason` — build in-season JSON
4. Commit `data/` and `public/` if changed

Deploy workflow runs `npm run build` only (uses committed `public/` JSON — does not re-fetch).

### Rankings refresh in the browser

- **Production (GitHub Pages):** **Reload snapshot** re-fetches `rankings.json` from the site (same data as daily CI).
- **Local dev:** **Refresh from live APIs** overlays ESPN, Sleeper, and Fantasy Calc in the browser (FantasyPros still comes from the last CI snapshot).

## Local development

**Requirements:** Node.js 24+ (see `.nvmrc`)

```bash
npm ci
cp .env.example .env   # add FANTASYPROS_API_KEY for full fetch
npm run update:rankings
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build to `dist/` |
| `npm run fetch:rankings` | Fetch raw source files |
| `npm run build:pool` | Build merged rankings pool |
| `npm run build:inseason` | Build in-season JSON |
| `npm run update:rankings` | Full pipeline (fetch + pool + inseason) |

## Secrets (maintainers)

Set in GitHub → Settings → Secrets → Actions on **both** repos that run fetch workflows:

| Secret | Used for |
|--------|----------|
| `FANTASYPROS_API_KEY` | FantasyPros consensus rankings API |

For local fetches, set `FANTASYPROS_API_KEY` in a `.env` file (never commit). If a key was ever committed to git history, **rotate it** in the FantasyPros dashboard.

## Launch roadmap

Work is tracked as [GitHub Issues](https://github.com/drewnicorn-git/fantasy-draft-wizard/issues) with `launch-readiness` labels (P0 → P2). Phase 0 covers security and production honesty; later phases add multi-league profiles, optional account sync, tests, and polish.

## License

Private project — all rights reserved unless otherwise noted.
