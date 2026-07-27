import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Generates starter rankings when live fetch has not run yet. */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const PLAYERS = [
  ['Ja\'Marr Chase', 'CIN', 'WR', 1, 1],
  ['Justin Jefferson', 'MIN', 'WR', 2, 2],
  ['Bijan Robinson', 'ATL', 'RB', 3, 3],
  ['CeeDee Lamb', 'DAL', 'WR', 4, 4],
  ['Saquon Barkley', 'PHI', 'RB', 5, 5],
  ['Christian McCaffrey', 'SF', 'RB', 6, 6],
  ['Amon-Ra St. Brown', 'DET', 'WR', 7, 7],
  ['Malik Nabers', 'NYG', 'WR', 8, 8],
  ['Ashton Jeanty', 'LV', 'RB', 9, 9],
  ['Puka Nacua', 'LAR', 'WR', 10, 10],
  ['Josh Allen', 'BUF', 'QB', 11, 15],
  ['Nico Collins', 'HOU', 'WR', 12, 11],
  ['De\'Von Achane', 'MIA', 'RB', 13, 12],
  ['Brian Thomas Jr.', 'JAC', 'WR', 14, 13],
  ['Drake London', 'ATL', 'WR', 15, 14],
  ['Lamar Jackson', 'BAL', 'QB', 16, 22],
  ['Jonathan Taylor', 'IND', 'RB', 17, 16],
  ['Brock Bowers', 'LV', 'TE', 18, 18],
  ['Garrett Wilson', 'NYJ', 'WR', 19, 17],
  ['Jahmyr Gibbs', 'DET', 'RB', 20, 19],
  ['Jayden Daniels', 'WAS', 'QB', 21, 28],
  ['Breece Hall', 'NYJ', 'RB', 22, 20],
  ['Kyren Williams', 'LAR', 'RB', 23, 21],
  ['AJ Brown', 'PHI', 'WR', 24, 23],
  ['Trey McBride', 'ARI', 'TE', 25, 25],
  ['Tee Higgins', 'CIN', 'WR', 26, 24],
  ['Alvin Kamara', 'NO', 'RB', 27, 26],
  ['James Cook', 'BUF', 'RB', 28, 27],
  ['Davante Adams', 'LAR', 'WR', 29, 29],
  ['Jaxon Smith-Njigba', 'SEA', 'WR', 30, 30],
  ['Joe Burrow', 'CIN', 'QB', 31, 35],
  ['Chase Brown', 'CIN', 'RB', 32, 31],
  ['Ladd McConkey', 'LAC', 'WR', 33, 32],
  ['George Kittle', 'SF', 'TE', 34, 34],
  ['Derrick Henry', 'BAL', 'RB', 35, 33],
  ['Travis Hunter', 'JAC', 'WR', 36, 36],
  ['Josh Jacobs', 'GB', 'RB', 37, 37],
  ['Terry McLaurin', 'WAS', 'WR', 38, 38],
  ['Kenneth Walker III', 'SEA', 'RB', 39, 39],
  ['DJ Moore', 'CHI', 'WR', 40, 40],
  ['Patrick Mahomes', 'KC', 'QB', 41, 48],
  ['James Conner', 'ARI', 'RB', 42, 41],
  ['Chris Olave', 'NO', 'WR', 43, 42],
  ['Travis Kelce', 'KC', 'TE', 44, 44],
  ['Tony Pollard', 'TEN', 'RB', 45, 43],
  ['Marvin Harrison Jr.', 'ARI', 'WR', 46, 45],
  ['Rashee Rice', 'KC', 'WR', 47, 46],
  ['Jordan Addison', 'MIN', 'WR', 48, 47],
  ['David Montgomery', 'DET', 'RB', 49, 49],
  ['Jaylen Waddle', 'MIA', 'WR', 50, 50],
];

function build(): void {
  const players = PLAYERS.map(([name, team, pos, ppr, std], i) => ({
    id: `${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-')}|${team}|${pos}`,
    name,
    team,
    pos,
    bye: 7 + (i % 10),
    tier: Math.ceil((i + 1) / 12),
    injuryStatus: null,
    ranks: {
      std: { fantasypros: std, espn: std + 1, sleeper: std },
      ppr: { fantasypros: ppr, espn: ppr + 1, sleeper: ppr },
    },
    consensus: { std, ppr },
    adp: { std: std + 0.5, ppr: ppr + 0.5 },
    posRank: { std: i + 1, ppr: i + 1 },
    rankStdDev: 2.5,
  }));

  const output = {
    season: 2025,
    builtAt: new Date().toISOString(),
    fetchedAt: null,
    sources: ['fantasypros', 'espn', 'sleeper'],
    players,
  };

  const json = JSON.stringify(output, null, 1) + '\n';
  mkdirSync(join(root, 'data'), { recursive: true });
  mkdirSync(join(root, 'public'), { recursive: true });
  writeFileSync(join(root, 'data', 'rankings.json'), json);
  writeFileSync(join(root, 'public', 'rankings.json'), json);
  console.log(`Seed rankings: ${players.length} players`);
}

build();
