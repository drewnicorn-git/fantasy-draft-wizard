# Senior Engineer Review Process

Every launch-readiness issue **must** pass automated gates before it is closed with a senior engineer approval comment.

## Non-negotiable checks (automated)

These recurring failure modes are enforced by `scripts/release-gate.mjs` and CI:

| Check | Catches |
|-------|---------|
| Canonical repo only | Workflows/deploy running on wrong repo |
| GitHub Pages enabled | Deploy skipped or 404 on new repo |
| Archive repo frozen SHA | Accidental pushes to `fantasy-draft-wizard-app` |
| Live site + rankings.json | Deploy succeeded but site broken |
| No API key in tree | Committed secrets |
| No archive push remote (local) | `git push app` accidents |
| Production build | TypeScript/build regressions |

## Workflow before closing any issue

1. Implement on branch / `main` in **`drewnicorn-git/fantasy-draft-wizard` only**
2. Push **only** to `origin` — never to `fantasy-draft-wizard-app`
3. Run locally:
   ```bash
   npm run release:gate
   ```
4. Wait for CI green:
   - **Build and Deploy Pages** (deploy job must run, not skip)
   - **Release gate** (pre + post deploy)
5. Post approval comment:
   ```bash
   npm run release:review -- <issue-number>
   gh issue close <issue-number>
   ```

## Do not close an issue if

- Any workflow is red on the canonical repo
- Deploy job was skipped
- Archive repo SHA moved off `FROZEN_ARCHIVE_SHA` in `scripts/lib/repo-config.mjs`
- Release gate was not run

## Archive repo

`fantasy-draft-wizard-app` is **frozen** at commit `c86ffb8`. It is not part of the overhaul. The automated gate fails if `main` on that repo changes.

## Changing frozen SHA

Only the repo owner may update `FROZEN_ARCHIVE_SHA` in `scripts/lib/repo-config.mjs` after an explicit decision to unfreeze the archive.
