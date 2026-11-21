import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSquadFeasibility,
  formatCurrency,
  getMinIncrement,
  getNextMinimumBid,
  validateBid,
} from './bidding';
import { DEFAULT_AUCTION_SETTINGS, DEFAULT_INCREMENT_TIERS } from '../shared/franchises';
import { AUCTION_PLAYERS, PLAYER_MAP } from '../shared/players';
import { AuctionSettings, Participant, TeamState } from '../shared/types';

function makeTeam(overrides?: Partial<TeamState>): TeamState {
  return {
    franchiseCode: 'MI',
    controllerType: 'human',
    ownerParticipantId: 'p1',
    ownerName: 'Aarav',
    purseTotalLakhs: 10000,
    purseSpentLakhs: 0,
    roster: [],
    customXIIds: null,
    ...overrides,
  };
}

function makeParticipant(overrides?: Partial<Participant>): Participant {
  return {
    id: 'p1',
    userId: 'u1',
    name: 'Aarav',
    isGuest: false,
    role: 'participant',
    franchiseCode: 'MI',
    ready: true,
    connected: true,
    lastSeenAt: Date.now(),
    ...overrides,
  };
}

test('price-tier increments scale accurately across price bands', () => {
  assert.equal(getMinIncrement(50, DEFAULT_INCREMENT_TIERS), 10);
  assert.equal(getMinIncrement(100, DEFAULT_INCREMENT_TIERS), 20);
  assert.equal(getMinIncrement(200, DEFAULT_INCREMENT_TIERS), 25);
  assert.equal(getMinIncrement(500, DEFAULT_INCREMENT_TIERS), 50);
  assert.equal(getMinIncrement(1200, DEFAULT_INCREMENT_TIERS), 100);

  assert.equal(getNextMinimumBid(0, 200, false, DEFAULT_INCREMENT_TIERS), 200);
  assert.equal(getNextMinimumBid(200, 200, true, DEFAULT_INCREMENT_TIERS), 225);
  assert.equal(formatCurrency(1250), '₹12.50 Cr');
  assert.equal(formatCurrency(75), '₹75 L');
});

test('squad feasibility enforces Minimum Reserve = Minimum Remaining Players * Minimum Permitted Purchase Price', () => {
  const settings: AuctionSettings = {
    ...DEFAULT_AUCTION_SETTINGS,
    purseLakhs: 1000, // ₹10 Cr
    minSquadSize: 15,
    enforceMinSquad: true,
    minBasePriceLakhs: 50, // ₹50 L
  };

  // Current squad = 0; buying 1 player leaves 14 minimum remaining players => reserve = 14 * 50 = 700L
  const team = makeTeam({ purseTotalLakhs: 1000, purseSpentLakhs: 0 });
  const feas = computeSquadFeasibility(team, settings, true);
  assert.equal(feas.minRemainingPlayers, 14);
  assert.equal(feas.minimumReserveLakhs, 700);
  assert.equal(feas.maxAffordableBidLakhs, 300);

  // Bid of 300 is allowed; bid of 320 violates minimum squad reserve!
  const player = PLAYER_MAP['p_bumrah'];
  const okBid = validateBid({
    stage: 'LIVE',
    participant: makeParticipant(),
    team,
    player,
    soldPlayerIds: [],
    currentBidLakhs: 275,
    highestBidderFranchise: 'CSK',
    proposedBidLakhs: 300,
    settings,
  });
  assert.equal(okBid.allowed, true);

  const badBid = validateBid({
    stage: 'LIVE',
    participant: makeParticipant(),
    team,
    player,
    soldPlayerIds: [],
    currentBidLakhs: 300,
    highestBidderFranchise: 'CSK',
    proposedBidLakhs: 325,
    settings,
  });
  assert.equal(badBid.allowed, false);
  assert.equal(badBid.code, 'RESERVE_VIOLATION');
});

test('prevents overseas limit violations, max squad violations, self-outbids, and spectator bids', () => {
  const settings: AuctionSettings = {
    ...DEFAULT_AUCTION_SETTINGS,
    maxOverseas: 2,
    maxSquadSize: 3,
    enforceMinSquad: false,
  };

  const overseasPlayers = AUCTION_PLAYERS.filter((p) => p.isOverseas);
  const domesticPlayer = AUCTION_PLAYERS.find((p) => !p.isOverseas)!;

  const teamWith2Overseas = makeTeam({
    roster: [
      { player: overseasPlayers[0], soldPriceLakhs: 200, soldAt: 1, roundNumber: 1 },
      { player: overseasPlayers[1], soldPriceLakhs: 200, soldAt: 2, roundNumber: 1 },
    ],
  });

  // 3rd overseas player rejected
  const osReject = validateBid({
    stage: 'LIVE',
    participant: makeParticipant(),
    team: teamWith2Overseas,
    player: overseasPlayers[2],
    soldPlayerIds: [],
    currentBidLakhs: 200,
    highestBidderFranchise: null,
    settings,
  });
  assert.equal(osReject.allowed, false);
  assert.equal(osReject.code, 'OVERSEAS_LIMIT');

  // Domestic player allowed
  const domOk = validateBid({
    stage: 'LIVE',
    participant: makeParticipant(),
    team: teamWith2Overseas,
    player: domesticPlayer,
    soldPlayerIds: [],
    currentBidLakhs: 200,
    highestBidderFranchise: null,
    settings,
  });
  assert.equal(domOk.allowed, true);

  // Spectator strictly blocked
  const specReject = validateBid({
    stage: 'LIVE',
    participant: makeParticipant({ role: 'spectator', franchiseCode: null }),
    team: teamWith2Overseas,
    player: domesticPlayer,
    soldPlayerIds: [],
    currentBidLakhs: 200,
    highestBidderFranchise: null,
    settings,
  });
  assert.equal(specReject.allowed, false);
  assert.equal(specReject.code, 'SPECTATOR_FORBIDDEN');

  // Self-outbid rejected
  const selfReject = validateBid({
    stage: 'LIVE',
    participant: makeParticipant(),
    team: teamWith2Overseas,
    player: domesticPlayer,
    soldPlayerIds: [],
    currentBidLakhs: 200,
    highestBidderFranchise: 'MI',
    settings,
  });
  assert.equal(selfReject.allowed, false);
  assert.equal(selfReject.code, 'ALREADY_HIGHEST_BIDDER');

  // Duplicate already-sold player rejected
  const soldReject = validateBid({
    stage: 'LIVE',
    participant: makeParticipant(),
    team: teamWith2Overseas,
    player: domesticPlayer,
    soldPlayerIds: [domesticPlayer.id],
    currentBidLakhs: 200,
    highestBidderFranchise: null,
    settings,
  });
  assert.equal(soldReject.allowed, false);
  assert.equal(soldReject.code, 'PLAYER_ALREADY_SOLD');
});
