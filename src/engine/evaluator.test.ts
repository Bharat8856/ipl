import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePlayingXI, optimizePlayingXI } from './optimizer';
import { compareTeams, evaluateTeam } from './evaluator';
import { DEFAULT_AUCTION_SETTINGS } from '../shared/franchises';
import { PLAYER_MAP } from '../shared/players';
import { SoldPlayerRecord, TeamState } from '../shared/types';

function rec(id: string, price: number): SoldPlayerRecord {
  const player = PLAYER_MAP[id];
  assert.ok(player, `Missing test player ${id}`);
  return {
    player,
    soldPriceLakhs: price,
    soldAt: 1000,
    roundNumber: 1,
  };
}

test('Playing XI optimizer respects max 4 overseas players even with 6 overseas stars in squad', () => {
  const roster: SoldPlayerRecord[] = [
    // 6 elite overseas players
    rec('p_head', 1400),
    rec('p_buttler', 1400),
    rec('p_klaasen', 1500),
    rec('p_rashid', 1600),
    rec('p_narine', 1450),
    rec('p_cummins', 1350),
    // 8 domestic players covering batting, WK, AR, pace, spin
    rec('p_jaiswal', 1200),
    rec('p_suryakumar', 1500),
    rec('p_pant', 1400),
    rec('p_rinku', 900),
    rec('p_hardik', 1400),
    rec('p_axar', 1200),
    rec('p_bumrah', 1800),
    rec('p_arshdeep', 1300),
  ];

  const result = optimizePlayingXI(roster);
  assert.equal(result.xi.length, 11);
  assert.equal(result.metrics.overseasCompliant, true);
  assert.ok(result.metrics.overseasCount <= 4);
  assert.equal(result.metrics.hasKeeper, true);
  assert.ok(result.metrics.totalBowlingOptions >= 5);
  assert.ok(result.metrics.overallXIScore >= 82);
  assert.equal(result.bowlingPlan.length, 3);
});

test('manual lineup changes recalculate XI metrics and catch illegal 5-overseas lineup', () => {
  const roster: SoldPlayerRecord[] = [
    rec('p_head', 1400),
    rec('p_buttler', 1400),
    rec('p_klaasen', 1500),
    rec('p_rashid', 1600),
    rec('p_cummins', 1350),
    rec('p_kohli', 1500),
    rec('p_suryakumar', 1500),
    rec('p_hardik', 1400),
    rec('p_jadeja', 1200),
    rec('p_bumrah', 1800),
    rec('p_kuldeep', 1100),
    rec('p_arshdeep', 1200),
  ];

  const auto = optimizePlayingXI(roster);
  // Manually pick 5 overseas players -> should mark overseasCompliant=false and lower score
  const illegalCustomIds = [
    'p_head',
    'p_buttler',
    'p_klaasen',
    'p_rashid',
    'p_cummins',
    'p_kohli',
    'p_suryakumar',
    'p_hardik',
    'p_jadeja',
    'p_bumrah',
    'p_kuldeep',
  ];
  const custom = optimizePlayingXI(roster, illegalCustomIds);
  assert.equal(custom.isCustom, true);
  assert.equal(custom.metrics.overseasCount, 5);
  assert.equal(custom.metrics.overseasCompliant, false);
  assert.ok(custom.metrics.overallXIScore < auto.metrics.overallXIScore);
});

test('squad quality has NO arbitrary penalty for spending more on quality players; efficiency is separate', () => {
  const coreIds = [
    'p_jaiswal',
    'p_kohli',
    'p_suryakumar',
    'p_pant',
    'p_rinku',
    'p_hardik',
    'p_axar',
    'p_rashid',
    'p_bumrah',
    'p_arshdeep',
    'p_kuldeep',
  ];

  const expensiveTeam: TeamState = {
    franchiseCode: 'MI',
    controllerType: 'human',
    ownerParticipantId: 'u1',
    ownerName: 'BigSpender',
    purseTotalLakhs: 25000,
    purseSpentLakhs: 22000,
    roster: coreIds.map((id) => rec(id, 2000)), // Paid ₹20 Cr each
    customXIIds: null,
  };

  const bargainTeam: TeamState = {
    franchiseCode: 'CSK',
    controllerType: 'human',
    ownerParticipantId: 'u2',
    ownerName: 'ValueHunter',
    purseTotalLakhs: 25000,
    purseSpentLakhs: 5500,
    roster: coreIds.map((id) => rec(id, 500)), // Paid ₹5 Cr each for exact same players
    customXIIds: null,
  };

  const evExpensive = evaluateTeam(expensiveTeam, DEFAULT_AUCTION_SETTINGS);
  const evBargain = evaluateTeam(bargainTeam, DEFAULT_AUCTION_SETTINGS);

  // Squad quality must be IDENTICAL for identical players!
  assert.equal(evExpensive.squadQualityScore, evBargain.squadQualityScore);
  // Auction efficiency is evaluated separately and clearly favors the bargain team
  assert.ok(evBargain.auctionEfficiencyScore > evExpensive.auctionEfficiencyScore);

  const cmp = compareTeams(evExpensive, evBargain);
  assert.equal(cmp.overallEdge, 'TIE');
});

test('handles empty squad, incomplete squad, and missing-data warnings cleanly', () => {
  const emptyTeam: TeamState = {
    franchiseCode: 'DC',
    controllerType: 'human',
    ownerParticipantId: 'u3',
    ownerName: 'Empty',
    purseTotalLakhs: 10000,
    purseSpentLakhs: 0,
    roster: [],
    customXIIds: null,
  };

  const emptyEv = evaluateTeam(emptyTeam, DEFAULT_AUCTION_SETTINGS);
  assert.equal(emptyEv.squadQualityScore, 0);
  assert.equal(emptyEv.confidenceLevel, 'Low');
  assert.ok(emptyEv.missingDataWarnings.length > 0);

  // Incomplete squad with uncapped sparse-data players
  const sparseTeam: TeamState = {
    franchiseCode: 'PBKS',
    controllerType: 'human',
    ownerParticipantId: 'u4',
    ownerName: 'Prospects',
    purseTotalLakhs: 10000,
    purseSpentLakhs: 140,
    roster: [rec('p_raghuvanshi', 30), rec('p_mayank', 50), rec('p_suyash', 30), rec('p_naman', 30)],
    customXIIds: null,
  };

  const sparseEv = evaluateTeam(sparseTeam, DEFAULT_AUCTION_SETTINGS);
  assert.equal(sparseEv.confidenceLevel, 'Low');
  assert.ok(sparseEv.missingDataWarnings.some((w) => w.includes('Incomplete Playing XI')));
  assert.ok(sparseEv.missingDataWarnings.some((w) => w.includes('Mayank Yadav')));
  assert.ok(evaluatePlayingXI(sparseTeam.roster).warnings.some((w) => w.includes('wicketkeeper')));
});
