# Fantasy Draft Wizard

A static fantasy football draft assistant: multi-source rankings, mock and live draft rooms, injury reports, depth charts, and in-season roster tools.

**Live site (overhaul):** [fantasy-draft-wizard on GitHub Pages](https://drewnicorn-git.github.io/fantasy-draft-wizard/)

## Repositories

| Repo | Purpose |
|------|---------|
| **[fantasy-draft-wizard](https://github.com/drewnicorn-git/fantasy-draft-wizard)** (this repo) | Launch overhaul: issues, CI, GitHub Pages deploy, daily data refresh |
| **[fantasy-draft-wizard-app](https://github.com/drewnicorn-git/fantasy-draft-wizard-app)** | **Frozen archive** — pre-overhaul version; do not push here |

The archived site remains at [fantasy-draft-wizard-app](https://drewnicorn-git.github.io/fantasy-draft-wizard-app/) (last updated at commit `c86ffb8`).

All new work is committed and pushed **only to this repo** (`git push origin main`). Do not push to `fantasy-draft-wizard-app`.

Before closing launch issues, run `npm run release:gate` and follow [.github/SENIOR_ENGINEER_REVIEW.md](.github/SENIOR_ENGINEER_REVIEW.md).

## Features

- **Rankings** — FantasyPros, ESPN, Sleeper, and Fantasy Calc ADP with consensus columns, tags, and manual ranks
- **Mock draft** — Snake draft simulator with bot opponents and draft advice
- **Live draft** — Track real drafts pick-by-pick; export and move to in-season
- **Injuries** — ESPN injury report
- **Depth charts** — Per-team ESPN depth tables
- **In season** — Weekly stats/projections and roster tools

Rankings, injuries, depth charts, and in-season values refresh **daily** via GitHub Actions (no server required at runtime).

### Cloud sync (optional)

Sign in with a **magic link** to sync your leagues across devices (laptop, phone, etc.). When `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured at build time, the header shows **Sign in**.

1. Create a [Supabase](https://supabase.com) project
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor
3. Enable Email auth (magic link) under Authentication → Providers
4. Add your site URL under Authentication → URL configuration (e.g. `https://drewnicorn-git.github.io/fantasy-draft-wizard/`)
5. Set GitHub Actions **repository secrets** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for deploy, or add them to local `.env` for dev

**`VITE_SUPABASE_URL` must be the Project URL** (`https://YOUR_REF.supabase.co`). Do **not** paste the REST API URL (`.../rest/v1`) from the API settings panel — that causes magic-link sign-in to fail with “Invalid path specified in request URL”.

**Supabase → Authentication → URL configuration** (required for magic links):

| Field | Value |
|-------|--------|
| Site URL | `https://drewnicorn-git.github.io/fantasy-draft-wizard/` |
| Redirect URLs | `https://drewnicorn-git.github.io/fantasy-draft-wizard/**` and `http://localhost:5173/**` |

Leagues save to localStorage immediately and **debounce-upload** to your account when signed in. On sign-in, the newer copy (local vs cloud) wins.

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
| `VITE_SUPABASE_URL` | Optional cloud sync — **Project URL only** (`https://xxx.supabase.co`, not `.../rest/v1`) |
| `VITE_SUPABASE_ANON_KEY` | Optional cloud sync (Supabase anon key) |

For local fetches, set `FANTASYPROS_API_KEY` in a `.env` file (never commit). If a key was ever committed to git history, **rotate it** in the FantasyPros dashboard.

## Launch roadmap

Work is tracked as [GitHub Issues](https://github.com/drewnicorn-git/fantasy-draft-wizard/issues) with `launch-readiness` labels (P0 → P2). Phase 0 covers security and production honesty; later phases add multi-league profiles, optional account sync, tests, and polish.

## License

Private project — all rights reserved unless otherwise noted.
