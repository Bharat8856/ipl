import {
  AuctionPlayer,
  AuctionSettings,
  FranchiseCode,
  RoomState,
  TeamState,
} from '../shared/types';
import { computeSquadFeasibility, getNextMinimumBid, validateBid } from './bidding';

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967295;
}

/**
 * Computes a realistic max willingness-to-pay for an AI-controlled franchise on a specific player,
 * grounded in player fair value, squad role gaps, overseas cap, remaining purse, and AI difficulty.
 */
export function computeAiMaxValuation(
  team: TeamState,
  player: AuctionPlayer,
  settings: AuctionSettings,
  roomCode: string,
): number {
  const feasibility = computeSquadFeasibility(team, settings, true);
  if (feasibility.maxAffordableBidLakhs < player.basePriceLakhs) return 0;

  const difficultyMultiplier =
    settings.aiDifficulty === 'aggressive'
      ? 1.15
      : settings.aiDifficulty === 'conservative'
        ? 0.88
        : 1.0;

  // Deterministic franchise-specific valuation jitter (+/- 14%) so different AI franchises battle realistically
  const jitter = 0.86 + hashString(`${roomCode}:${team.franchiseCode}:${player.id}`) * 0.28;

  // Role need multiplier
  let needMultiplier = 1.0;
  const roster = team.roster.map((r) => r.player);
  const wkCount = roster.filter((p) => p.role === 'WK').length;
  const openerCount = roster.filter((p) => p.battingPosition === 'OPENER').length;
  const paceCount = roster.filter((p) => p.bowlingStyle === 'PACE' && p.ratings.bowling >= 68).length;
  const spinCount = roster.filter((p) => p.bowlingStyle === 'SPIN' && p.ratings.bowling >= 68).length;
  const deathCount = roster.filter((p) => p.bowlingPhases.includes('DEATH') && p.ratings.deathBowling >= 80).length;
  const arCount = roster.filter((p) => p.role === 'AR').length;

  if (player.role === 'WK' && wkCount === 0) needMultiplier += 0.22;
  else if (player.role === 'WK' && wkCount >= 2) needMultiplier -= 0.35;

  if (player.battingPosition === 'OPENER' && openerCount < 2) needMultiplier += 0.14;
  else if (player.battingPosition === 'OPENER' && openerCount >= 3) needMultiplier -= 0.25;

  if (player.bowlingStyle === 'PACE' && paceCount < 3) needMultiplier += 0.12;
  if (player.bowlingStyle === 'SPIN' && spinCount < 2) needMultiplier += 0.14;
  if (player.bowlingPhases.includes('DEATH') && player.ratings.deathBowling >= 82 && deathCount < 2) {
    needMultiplier += 0.16;
  }
  if (player.role === 'AR' && arCount < 2) needMultiplier += 0.15;

  const clampedNeed = Math.max(0.65, Math.min(1.14, needMultiplier));

  // Scale valuation relative to purse size (baseline fair values assume ₹100 Cr = 10000 Lakhs)
  const purseScale = settings.purseLakhs / 10000;

  // Purse pressure: if team still needs many minimum players, restrain overspending on one player
  const slotsLeftToMin = Math.max(1, settings.minSquadSize - team.roster.length);
  const avgBudgetPerRemainingMinSlot = feasibility.availablePurseLakhs / slotsLeftToMin;
  const budgetCapFactor =
    team.roster.length < 4
      ? Math.min(feasibility.maxAffordableBidLakhs, Math.round(settings.purseLakhs * 0.21))
      : Math.min(
          feasibility.maxAffordableBidLakhs,
          Math.round(avgBudgetPerRemainingMinSlot * 2.2),
        );

  const rawValuation =
    player.ratings.fairValueLakhs * purseScale * difficultyMultiplier * clampedNeed * jitter;

  return Math.min(budgetCapFactor, Math.round(rawValuation));
}

export function pickNextAiBidder(
  room: RoomState,
  player: AuctionPlayer,
): { franchiseCode: FranchiseCode; bidAmountLakhs: number } | null {
  const aiTeams = Object.values(room.teams).filter((t) => t.controllerType === 'ai');
  if (aiTeams.length === 0) return null;

  const hasBids = room.highestBidderFranchise !== null;
  const nextBid = getNextMinimumBid(
    room.currentBidLakhs,
    player.basePriceLakhs,
    hasBids,
    room.settings.incrementTiers,
  );

  const interested: { franchiseCode: FranchiseCode; headroom: number }[] = [];

  for (const team of aiTeams) {
    const check = validateBid({
      stage: room.stage,
      participant: null,
      team,
      player,
      soldPlayerIds: room.soldPlayerIds,
      currentBidLakhs: room.currentBidLakhs,
      highestBidderFranchise: room.highestBidderFranchise,
      proposedBidLakhs: nextBid,
      settings: room.settings,
      isAiBid: true,
    });
    if (!check.allowed) continue;

    const maxVal = computeAiMaxValuation(team, player, room.settings, room.roomCode);
    if (nextBid <= maxVal) {
      interested.push({
        franchiseCode: team.franchiseCode,
        headroom: maxVal - nextBid,
      });
    }
  }

  if (interested.length === 0) return null;

  // Prefer the AI franchise with the highest remaining valuation headroom (most motivated bidder)
  interested.sort((a, b) => b.headroom - a.headroom);
  return {
    franchiseCode: interested[0].franchiseCode,
    bidAmountLakhs: nextBid,
  };
}
