import test from 'node:test';
import assert from 'node:assert/strict';
import { AuctionRoomManager } from './roomManager';
import { PLAYER_MAP } from '../shared/players';

test('prevents duplicate simultaneous franchise claims and enforces permissions', () => {
  const mgr = new AuctionRoomManager();
  const managed = mgr.createRoom({
    hostUserId: 'admin1',
    hostName: 'Host',
    isGuest: false,
    mode: 'private_multiplayer',
    now: 1000,
  });
  const code = managed.state.roomCode;

  mgr.joinRoom({ roomCode: code, userId: 'u2', name: 'Riya', isGuest: true, now: 1001 });
  mgr.joinRoom({ roomCode: code, userId: 'spec1', name: 'Viewer', isGuest: true, asSpectator: true, now: 1002 });

  // Simultaneous franchise claim for MI: first wins, second rejected
  const c1 = mgr.claimFranchise(code, 'admin1', 'MI', 1010);
  const c2 = mgr.claimFranchise(code, 'u2', 'MI', 1010);
  assert.equal(c1.ok, true);
  assert.equal(c2.ok, false);
  assert.equal(c2.code, 'FRANCHISE_TAKEN');

  // Spectator cannot claim franchise
  const cSpec = mgr.claimFranchise(code, 'spec1', 'CSK', 1011);
  assert.equal(cSpec.ok, false);
  assert.equal(cSpec.code, 'SPECTATOR_FORBIDDEN');

  // Non-admin cannot change settings or start auction
  const nonAdminSettings = mgr.updateSettings(code, 'u2', { countdownSeconds: 8 }, 1012);
  assert.equal(nonAdminSettings.ok, false);
  assert.equal(nonAdminSettings.code, 'ADMIN_ONLY');

  const nonAdminStart = mgr.startAuction(code, 'u2', 1013);
  assert.equal(nonAdminStart.ok, false);
  assert.equal(nonAdminStart.code, 'ADMIN_ONLY');
});

test('handles simultaneous bids transactionally, preserves exact pause/resume countdown, and syncs on reconnect', () => {
  const mgr = new AuctionRoomManager();
  const managed = mgr.createRoom({
    hostUserId: 'admin1',
    hostName: 'Host',
    isGuest: false,
    mode: 'private_multiplayer',
    partialSettings: { unclaimedPolicy: 'inactive', countdownSeconds: 5 },
    now: 10_000,
  });
  const code = managed.state.roomCode;

  mgr.joinRoom({ roomCode: code, userId: 'u2', name: 'Riya', isGuest: false, now: 10_010 });
  mgr.joinRoom({ roomCode: code, userId: 'spec1', name: 'Spec', isGuest: true, asSpectator: true, now: 10_020 });

  mgr.claimFranchise(code, 'admin1', 'MI', 10_030);
  mgr.claimFranchise(code, 'u2', 'CSK', 10_040);
  assert.equal(mgr.startAuction(code, 'admin1', 10_100).ok, true);

  const playerId = managed.state.currentPlayerId!;
  const basePrice = PLAYER_MAP[playerId].basePriceLakhs;

  // Simultaneous bids at exact same proposed amount: first accepted, second rejected as below min increment
  const b1 = mgr.placeBid({ roomCode: code, userId: 'admin1', proposedBidLakhs: basePrice, now: 11_000 });
  const b2 = mgr.placeBid({ roomCode: code, userId: 'u2', proposedBidLakhs: basePrice, now: 11_000 });
  assert.equal(b1.ok, true);
  assert.equal(b2.ok, false);
  assert.equal(b2.code, 'BELOW_MIN_INCREMENT');

  // Spectator bid rejected
  const bSpec = mgr.placeBid({ roomCode: code, userId: 'spec1', now: 11_100 });
  assert.equal(bSpec.ok, false);
  assert.equal(bSpec.code, 'SPECTATOR_FORBIDDEN');

  // Countdown reset to 5000ms at t=11000 -> at t=13234 remaining should be 2766ms
  const pauseRes = mgr.pauseAuction(code, 'admin1', 13_234);
  assert.equal(pauseRes.ok, true);
  assert.equal(managed.state.stage, 'PAUSED');
  assert.equal(managed.state.countdownRemainingMs, 2766);

  // Bids while paused are blocked
  const bidWhilePaused = mgr.placeBid({ roomCode: code, userId: 'u2', now: 14_000 });
  assert.equal(bidWhilePaused.ok, false);

  // Resume 10 seconds later at t=23234 -> exact 2766ms preserved!
  const resumeRes = mgr.resumeAuction(code, 'admin1', 23_234);
  assert.equal(resumeRes.ok, true);
  assert.equal(managed.state.stage, 'LIVE');
  assert.equal(managed.countdownEndsAt, 23_234 + 2766);

  // Disconnect & Reconnect restores participant identity, franchise ownership, and live snapshot
  mgr.setParticipantConnected(code, 'u2', false, 23_500);
  assert.equal(managed.state.participants.find((p) => p.userId === 'u2')?.connected, false);
  const recon = mgr.joinRoom({ roomCode: code, userId: 'u2', name: 'Riya', isGuest: false, now: 23_700 });
  assert.equal(recon.ok, true);
  assert.equal(recon.data?.reconnected, true);
  assert.equal(recon.data?.participant.franchiseCode, 'CSK');
  assert.equal(recon.data?.participant.connected, true);

  // Resolve lot -> purse deducted exactly once, player cannot be nominated or sold again!
  const miPurseBefore = managed.state.teams.MI.purseSpentLakhs;
  mgr.resolveCurrentLot(code, 26_100);
  assert.equal(managed.state.teams.MI.purseSpentLakhs, miPurseBefore + basePrice);
  assert.equal(managed.state.soldPlayerIds.includes(playerId), true);

  const duplicateNom = mgr.nominatePlayer(code, 'admin1', playerId, 26_200);
  assert.equal(duplicateNom.ok, false);
  assert.equal(duplicateNom.code, 'PLAYER_ALREADY_SOLD');
});
