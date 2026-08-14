/** Single source of truth for repo separation and release gates. */
export const CANONICAL_REPO = 'drewnicorn-git/fantasy-draft-wizard';
/** Legacy archive — not monitored by canonical repo CI; do not push here from this project. */
export const ARCHIVE_REPO = 'drewnicorn-git/fantasy-draft-wizard-app';
export const PAGES_URL = 'https://drewnicorn-git.github.io/fantasy-draft-wizard/';

export function assertCanonicalRepo(context = process.env.GITHUB_REPOSITORY) {
  if (context !== CANONICAL_REPO) {
    throw new Error(
      `Wrong repository: expected ${CANONICAL_REPO}, got ${context ?? '(unset)'}. ` +
        'This workflow must not run on the archive repo.',
    );
  }
}
