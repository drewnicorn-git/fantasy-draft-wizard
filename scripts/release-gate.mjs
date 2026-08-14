#!/usr/bin/env node
/**
 * Release gate — automated senior-engineer checks before/after deploy.
 * Run locally before push: npm run release:gate
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import {
  CANONICAL_REPO,
  ARCHIVE_REPO,
  PAGES_URL,
  assertCanonicalRepo,
} from './lib/repo-config.mjs';

const mode = process.argv.includes('--ci-deploy')
  ? 'ci-deploy'
  : process.argv.includes('--ci-post-deploy')
    ? 'ci-post-deploy'
    : 'local';

const errors = [];
const passed = [];

function pass(msg) {
  passed.push(msg);
  console.log(`✓ ${msg}`);
}

function fail(msg) {
  errors.push(msg);
  console.error(`✗ ${msg}`);
}

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function checkNoLeakedSecrets() {
  try {
    sh('git grep -i "zjxN52" -- . ":(exclude)scripts/release-gate.mjs"');
    fail('Hardcoded FantasyPros API key material found in tree');
  } catch {
    pass('No known leaked API key strings in git tree');
  }

  if (existsSync('scripts/sources/fantasypros.ts')) {
    const src = readFileSync('scripts/sources/fantasypros.ts', 'utf8');
    if (/return\s+['"][a-zA-Z0-9]{20,}['"]/.test(src)) {
      fail('fantasypros.ts appears to contain a hardcoded API key fallback');
    } else {
      pass('fantasypros.ts has no hardcoded API key fallback');
    }
  }
}

function checkSingleEscapeHtmlUtility() {
  try {
    const matches = sh('git grep -n "function escapeHtml" -- src')
      .split('\n')
      .filter(Boolean)
      .filter((line) => !line.includes('src/utils/escapeHtml.ts'));
    if (matches.length) {
      fail(`Duplicate escapeHtml implementations found:\\n${matches.join('\\n')}`);
    } else {
      pass('Single shared escapeHtml utility (no duplicates in src/)');
    }
  } catch {
    pass('Single shared escapeHtml utility (no duplicates in src/)');
  }
}

function checkReadmeRepoPolicy() {
  const readme = readFileSync('README.md', 'utf8');
  if (!readme.includes('Do not push') && !readme.includes('do not push')) {
    fail('README.md missing explicit do-not-push policy for archive repo');
  } else {
    pass('README documents archive repo push policy');
  }
  if (!readme.includes(CANONICAL_REPO.split('/')[1])) {
    fail('README must reference the canonical repo as primary');
  } else {
    pass('README references canonical repo');
  }
}

function checkLocalRemotes() {
  const remotes = sh('git remote -v');
  const archivePush = remotes
    .split('\n')
    .filter((line) => line.includes('(push)'))
    .filter((line) => line.includes('fantasy-draft-wizard-app'));

  if (archivePush.length > 0) {
    fail(
      `Local git has push remote(s) to archive repo — remove them:\n${archivePush.join('\n')}\n` +
        '  git remote remove app',
    );
  } else {
    pass('No local push remotes target the archive repo');
  }

  if (!remotes.includes('fantasy-draft-wizard.git')) {
    fail('origin should point at the canonical repo (fantasy-draft-wizard)');
  } else {
    pass('origin points at canonical repo');
  }
}

async function checkPagesEnabled() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    fail('GITHUB_TOKEN required to verify Pages is enabled');
    return;
  }
  const res = await fetch(`https://api.github.com/repos/${CANONICAL_REPO}/pages`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
    },
  });
  if (!res.ok) {
    fail(`GitHub Pages not enabled on ${CANONICAL_REPO} (${res.status})`);
    return;
  }
  const json = await res.json();
  if (json.build_type !== 'workflow') {
    fail(`Pages build_type is ${json.build_type}, expected workflow`);
  } else {
    pass('GitHub Pages enabled with workflow deploy on canonical repo');
  }
}

async function checkLiveSite() {
  const res = await fetch(PAGES_URL, { redirect: 'follow' });
  if (!res.ok) {
    fail(`Live site ${PAGES_URL} returned ${res.status}`);
    return;
  }
  const html = await res.text();
  if (!html.includes('Fantasy Draft Wizard')) {
    fail('Live site HTML missing expected app title');
    return;
  }
  pass(`Live site reachable at ${PAGES_URL}`);
}

async function checkRankingsJsonOnSite() {
  const base = PAGES_URL.endsWith('/') ? PAGES_URL : `${PAGES_URL}/`;
  const res = await fetch(`${base}rankings.json`, { redirect: 'follow' });
  if (!res.ok) {
    fail(`rankings.json on live site returned ${res.status}`);
    return;
  }
  const json = await res.json();
  if (!Array.isArray(json.players) || json.players.length < 100) {
    fail(`rankings.json on live site invalid or too small (${json.players?.length ?? 0} players)`);
  } else {
    pass(`Live rankings.json has ${json.players.length} players`);
  }
}

async function main() {
  console.log(`\nRelease gate (${mode})\n`);

  if (mode === 'ci-deploy') {
    try {
      assertCanonicalRepo();
      pass(`Running on canonical repo ${CANONICAL_REPO}`);
    } catch (e) {
      fail(e.message);
    }
    await checkPagesEnabled();
    checkNoLeakedSecrets();
    checkReadmeRepoPolicy();
    checkSingleEscapeHtmlUtility();
  } else if (mode === 'ci-post-deploy') {
    try {
      assertCanonicalRepo();
      pass(`Post-deploy checks on ${CANONICAL_REPO}`);
    } catch (e) {
      fail(e.message);
    }
    await checkLiveSite();
    await checkRankingsJsonOnSite();
  } else {
    checkLocalRemotes();
    checkNoLeakedSecrets();
    checkReadmeRepoPolicy();
    checkSingleEscapeHtmlUtility();
    try {
      sh('npm run build');
      pass('Production build succeeds');
    } catch (e) {
      fail(`Production build failed: ${e.stderr ?? e.message}`);
    }
    try {
      sh('npm run data:smoke');
      pass('Data pipeline smoke checks pass');
    } catch (e) {
      fail(`Data smoke checks failed: ${e.stderr ?? e.message}`);
    }
  }

  console.log(`\n${passed.length} passed, ${errors.length} failed\n`);
  if (errors.length) {
    console.error('Release gate FAILED:\n' + errors.map((e) => `  - ${e}`).join('\n'));
    process.exit(1);
  }
  console.log('Release gate PASSED — safe to publish / close issue with senior review.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
