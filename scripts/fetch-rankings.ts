import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { currentDraftSeason } from './season.js';
import { fetchFantasyPros } from './sources/fantasypros.js';
import { fetchEspn } from './sources/espn.js';
import { fetchSleeperAdp, fetchSleeperPlayers } from './sources/sleeper.js';
import { fetchYahoo } from './sources/yahoo.js';
import { fetchNfl } from './sources/nfl.js';
import { fetchEspnDepthCharts } from './sources/espn-depth.js';
import { fetchEspnInjuries } from './sources/espn-injuries.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rawDir = join(root, 'data', 'raw');

const seasonArg = process.argv.find((a) => a.startsWith('--season='));
const SEASON = seasonArg ? Number(seasonArg.split('=')[1]) : currentDraftSeason();

function writeRaw(name: string, payload: unknown): void {
  const path = join(rawDir, name);
  writeFileSync(
    path,
    JSON.stringify({ season: SEASON, fetchedAt: new Date().toISOString(), data: payload }, null, 1) + '\n',
  );
  console.log(`Wrote ${path}`);
}

async function run(): Promise<void> {
  mkdirSync(rawDir, { recursive: true });
  console.log(`Fetching rankings for season ${SEASON}`);

  const core = await Promise.allSettled([
    fetchEspn(SEASON).then((p) => {
      writeRaw(`espn-${SEASON}.json`, { players: p });
    }),
    fetchSleeperAdp(SEASON).then((p) => {
      writeRaw(`sleeper-adp-${SEASON}.json`, { players: p });
    }),
    fetchSleeperPlayers().then((p) => {
      writeRaw('sleeper-players.json', { players: p });
    }),
  ]);

  const fantasyPros = await Promise.allSettled([
    fetchFantasyPros(SEASON, 'STD').then((p) => {
      writeRaw(`fp-STD-${SEASON}.json`, { scoring: 'STD', players: p });
    }),
    fetchFantasyPros(SEASON, 'PPR').then((p) => {
      writeRaw(`fp-PPR-${SEASON}.json`, { scoring: 'PPR', players: p });
    }),
  ]);

  const optional = await Promise.allSettled([
    fetchEspnDepthCharts(SEASON).then((p) => writeRaw(`espn-depth-${SEASON}.json`, { players: p })),
    fetchEspnInjuries().then((p) => writeRaw(`espn-injuries-${SEASON}.json`, { players: p })),
    fetchYahoo(SEASON, 'STD').then((p) => writeRaw(`yahoo-STD-${SEASON}.json`, { scoring: 'STD', players: p })),
    fetchYahoo(SEASON, 'PPR').then((p) => writeRaw(`yahoo-PPR-${SEASON}.json`, { scoring: 'PPR', players: p })),
    fetchNfl(SEASON).then((p) => writeRaw(`nfl-STD-${SEASON}.json`, { scoring: 'STD', players: p })),
  ]);

  let failed = false;
  for (const r of core) {
    if (r.status === 'rejected') {
      failed = true;
      console.error('FAILED (required):', r.reason);
    }
  }
  for (const r of fantasyPros) {
    if (r.status === 'rejected') {
      console.warn('FantasyPros unavailable:', r.reason);
    }
  }
  for (const r of optional) {
    if (r.status === 'rejected') {
      console.warn('Optional source unavailable:', r.reason);
    }
  }

  if (failed) {
    process.exit(1);
  }
  console.log('Done. Run: npm run build:pool');
}

run();
