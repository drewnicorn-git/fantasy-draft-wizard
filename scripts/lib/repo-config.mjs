/** Single source of truth for repo separation and release gates. */
export const CANONICAL_REPO = 'drewnicorn-git/fantasy-draft-wizard';
export const ARCHIVE_REPO = 'drewnicorn-git/fantasy-draft-wizard-app';
/** Archive repo must stay on this commit unless explicitly unfrozen by owner. */
export const FROZEN_ARCHIVE_SHA = 'c86ffb8ebf361e707d4806cb3cc13f3da48debc9';
export const PAGES_URL = 'https://drewnicorn-git.github.io/fantasy-draft-wizard/';

export function assertCanonicalRepo(context = process.env.GITHUB_REPOSITORY) {
  if (context !== CANONICAL_REPO) {
    throw new Error(
      `Wrong repository: expected ${CANONICAL_REPO}, got ${context ?? '(unset)'}. ` +
        'This workflow must not run on the archive repo.',
    );
  }
}
