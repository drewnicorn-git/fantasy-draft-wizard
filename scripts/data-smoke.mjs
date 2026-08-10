#!/usr/bin/env node
/**
 * Data pipeline smoke checks — fail if committed JSON regresses badly.
 * Run: npm run data:smoke
 */
import { readFileSync, existsSync } from 'node:fs';

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

function readJson(path) {
  if (!existsSync(path)) {
    fail(`Missing ${path}`);
    return null;
  }
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`Invalid JSON in ${path}: ${e.message}`);
    return null;
  }
}

function checkRankings() {
  const data = readJson('data/rankings.json');
  if (!data) return;

  const players = data.players ?? [];
  if (players.length < 500) {
    fail(`rankings.json has only ${players.length} players (expected >= 500)`);
  } else {
    pass(`rankings.json has ${players.length} players`);
  }

  const sources = data.sources ?? [];
  const required = ['espn', 'sleeper', 'ffc'];
  for (const src of required) {
    if (!sources.includes(src)) fail(`rankings.json missing required source: ${src}`);
  }
  if (required.every((s) => sources.includes(s))) {
    pass(`rankings.json includes core sources (${required.join(', ')})`);
  }

  const withProj = players.filter((p) => p.projections != null).length;
  const pct = players.length ? Math.round((withProj / players.length) * 100) : 0;
  if (pct < 50) {
    fail(`Only ${pct}% of players have projections (expected >= 50%)`);
  } else {
    pass(`${pct}% of players have Sleeper projections`);
  }
}

function checkInjuries() {
  const data = readJson('data/injuries.json');
  if (!data) return;
  const count = data.entries?.length ?? 0;
  if (count < 5) {
    fail(`injuries.json has only ${count} entries (expected >= 5)`);
  } else {
    pass(`injuries.json has ${count} entries`);
  }
}

function checkInSeason() {
  const data = readJson('data/inseason.json');
  if (!data) return;
  const count = data.players ? Object.keys(data.players).length : 0;
  if (count < 100) {
    fail(`inseason.json has only ${count} matched players (expected >= 100)`);
  } else {
    pass(`inseason.json has ${count} matched players`);
  }
  if (!data.season || !data.currentWeek) {
    fail('inseason.json missing season or currentWeek');
  } else {
    pass(`inseason.json season ${data.season} week ${data.currentWeek}`);
  }
}

function checkDepthCharts() {
  const data = readJson('data/depth-charts.json');
  if (!data) return;
  const teams = data.teams ? Object.keys(data.teams).length : 0;
  if (teams < 28) {
    fail(`depth-charts.json has only ${teams} teams (expected >= 28)`);
  } else {
    pass(`depth-charts.json has ${teams} teams`);
  }
}

function checkPublicMirrors() {
  for (const file of ['rankings.json', 'injuries.json', 'inseason.json', 'depth-charts.json']) {
    if (!existsSync(`public/${file}`)) {
      fail(`public/${file} missing (run build:pool or copy data to public/)`);
    }
  }
  if (existsSync('public/rankings.json')) {
    pass('public/ JSON mirrors present');
  }
}

console.log('\nData smoke checks\n');
checkRankings();
checkInjuries();
checkInSeason();
checkDepthCharts();
checkPublicMirrors();

console.log(`\n${passed.length} passed, ${errors.length} failed\n`);
if (errors.length) {
  process.exit(1);
}
console.log('Data smoke PASSED\n');
