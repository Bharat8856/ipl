import {
  AuctionPlayer,
  AuctionSettings,
  BidIncrementTier,
  BidValidationResult,
  FranchiseCode,
  Participant,
  RoomStage,
  SquadFeasibility,
  TeamState,
} from '../shared/types';
import { DEFAULT_INCREMENT_TIERS } from '../shared/franchises';

export function formatCurrency(lakhs: number): string {
  const safe = Math.max(0, Math.round(lakhs));
  if (safe >= 100) {
    const cr = safe / 100;
    return `₹${cr.toFixed(2)} Cr`;
  }
  return `₹${safe} L`;
}

export function formatCurrencyCompact(lakhs: number): string {
  const safe = Math.max(0, Math.round(lakhs));
  if (safe >= 100) {
    const cr = safe / 100;
    const formatted = Number.isInteger(cr) ? cr.toFixed(0) : cr.toFixed(2).replace(/0$/, '');
    return `₹${formatted}Cr`;
  }
  return `₹${safe}L`;
}

export function getMinIncrement(
  currentBidLakhs: number,
  tiers: BidIncrementTier[] = DEFAULT_INCREMENT_TIERS,
): number {
  const sorted = [...tiers].sort((a, b) => a.upToLakhs - b.upToLakhs);
  for (const tier of sorted) {
    if (currentBidLakhs < tier.upToLakhs) {
      return tier.incrementLakhs;
    }
  }
  return sorted[sorted.length - 1]?.incrementLakhs ?? 50;
}

export function getNextMinimumBid(
  currentBidLakhs: number,
  basePriceLakhs: number,
  hasBids: boolean,
  tiers: BidIncrementTier[] = DEFAULT_INCREMENT_TIERS,
): number {
  if (!hasBids || currentBidLakhs <= 0) {
    return basePriceLakhs;
  }
  return currentBidLakhs + getMinIncrement(currentBidLakhs, tiers);
}

export function detectMissingRoles(team: TeamState): string[] {
  const players = team.roster.map((r) => r.player);
  const missing: string[] = [];

  const wkCount = players.filter((p) => p.role === 'WK').length;
  const openerCount = players.filter(
    (p) => p.battingPosition === 'OPENER' || p.ratings.opening >= 82,
  ).length;
  const finisherCount = players.filter(
    (p) => p.battingPosition === 'FINISHER' || p.ratings.finishing >= 82,
  ).length;
  const arCount = players.filter((p) => p.role === 'AR').length;
  const paceCount = players.filter(
    (p) => p.bowlingStyle === 'PACE' && p.ratings.bowling >= 70,
  ).length;
  const spinCount = players.filter(
    (p) => p.bowlingStyle === 'SPIN' && p.ratings.bowling >= 70,
  ).length;
  const deathBowlerCount = players.filter(
    (p) => p.bowlingPhases.includes('DEATH') && p.ratings.deathBowling >= 78,
  ).length;

  if (wkCount === 0) missing.push('Wicketkeeper');
  if (openerCount < 2) missing.push(openerCount === 0 ? 'Openers (2)' : '2nd Opener');
  if (finisherCount === 0) missing.push('Finisher');
  if (arCount === 0) missing.push('All-Rounder');
  if (paceCount < 2) missing.push(paceCount === 0 ? 'Pace Bowlers (2)' : '2nd Pace Bowler');
  if (spinCount === 0) missing.push('Lead Spinner');
  if (deathBowlerCount === 0) missing.push('Death Bowler');

  return missing;
}

/**
 * Squad Feasibility Engine:
 * Minimum Reserve = Minimum Remaining Players * Minimum Permitted Purchase Price.
 * When checking for an incoming bid on 1 player, remaining minimum players AFTER buying this player
 * is max(0, minSquadSize - (currentSquadSize + 1)).
 */
export function computeSquadFeasibility(
  team: TeamState,
  settings: AuctionSettings,
  forIncomingPurchase = true,
): SquadFeasibility {
  const totalPurseLakhs = team.purseTotalLakhs;
  const spentPurseLakhs = team.purseSpentLakhs;
  const availablePurseLakhs = Math.max(0, totalPurseLakhs - spentPurseLakhs);
  const currentSquadSize = team.roster.length;
  const overseasCount = team.roster.filter((r) => r.player.isOverseas).length;
  const remainingSlotsMax = Math.max(0, settings.maxSquadSize - currentSquadSize);

  const minTarget = settings.enforceMinSquad ? settings.minSquadSize : 0;
  const minRemainingPlayers = settings.enforceMinSquad
    ? Math.max(0, minTarget - (forIncomingPurchase ? currentSquadSize + 1 : currentSquadSize))
    : 0;

  const minimumReserveLakhs = minRemainingPlayers * settings.minBasePriceLakhs;

  const maxAffordableBidLakhs =
    remainingSlotsMax <= 0
      ? 0
      : Math.max(0, availablePurseLakhs - minimumReserveLakhs);

  const completionDenominator = settings.enforceMinSquad
    ? Math.max(1, settings.minSquadSize)
    : Math.max(1, settings.maxSquadSize);
  const squadCompletionPct = Math.min(
    100,
    Math.round((currentSquadSize / completionDenominator) * 100),
  );

  return {
    totalPurseLakhs,
    spentPurseLakhs,
    availablePurseLakhs,
    currentSquadSize,
    overseasCount,
    remainingSlotsMax,
    minRemainingPlayers,
    minimumReserveLakhs,
    maxAffordableBidLakhs,
    squadCompletionPct,
    missingRoles: detectMissingRoles(team),
  };
}

export interface ValidateBidParams {
  stage: RoomStage;
  participant: Participant | null;
  team: TeamState | null;
  player: AuctionPlayer | null;
  soldPlayerIds: string[];
  currentBidLakhs: number;
  highestBidderFranchise: FranchiseCode | null;
  proposedBidLakhs?: number;
  settings: AuctionSettings;
  isAiBid?: boolean;
}

export function validateBid(params: ValidateBidParams): BidValidationResult {
  const {
    stage,
    participant,
    team,
    player,
    soldPlayerIds,
    currentBidLakhs,
    highestBidderFranchise,
    settings,
    isAiBid = false,
  } = params;

  const hasBids = highestBidderFranchise !== null;
  const requiredBidLakhs = player
    ? getNextMinimumBid(currentBidLakhs, player.basePriceLakhs, hasBids, settings.incrementTiers)
    : 0;
  const bidAmount = params.proposedBidLakhs ?? requiredBidLakhs;

  const emptyFeasibility: SquadFeasibility = {
    totalPurseLakhs: settings.purseLakhs,
    spentPurseLakhs: 0,
    availablePurseLakhs: settings.purseLakhs,
    currentSquadSize: 0,
    overseasCount: 0,
    remainingSlotsMax: settings.maxSquadSize,
    minRemainingPlayers: settings.enforceMinSquad ? settings.minSquadSize : 0,
    minimumReserveLakhs: settings.enforceMinSquad
      ? settings.minSquadSize * settings.minBasePriceLakhs
      : 0,
    maxAffordableBidLakhs: 0,
    squadCompletionPct: 0,
    missingRoles: [],
  };

  if (!isAiBid && participant?.role === 'spectator') {
    return {
      allowed: false,
      code: 'SPECTATOR_FORBIDDEN',
      reason: 'Spectators cannot submit bids.',
      requiredBidLakhs,
      feasibility: team ? computeSquadFeasibility(team, settings, true) : emptyFeasibility,
    };
  }

  if (!team) {
    return {
      allowed: false,
      code: 'NO_FRANCHISE',
      reason: 'Claim an IPL franchise before placing bids.',
      requiredBidLakhs,
      feasibility: emptyFeasibility,
    };
  }

  const feasibility = computeSquadFeasibility(team, settings, true);

  if (team.controllerType === 'inactive') {
    return {
      allowed: false,
      code: 'INACTIVE_FRANCHISE',
      reason: 'This franchise is inactive for this auction.',
      requiredBidLakhs,
      feasibility,
    };
  }

  if (stage !== 'LIVE' && stage !== 'ACCELERATED') {
    return {
      allowed: false,
      code: 'NOT_LIVE',
      reason: stage === 'PAUSED' ? 'Auction is currently paused.' : 'Bidding is not open right now.',
      requiredBidLakhs,
      feasibility,
    };
  }

  if (!player) {
    return {
      allowed: false,
      code: 'NO_ACTIVE_LOT',
      reason: 'No active player on the podium.',
      requiredBidLakhs,
      feasibility,
    };
  }

  if (soldPlayerIds.includes(player.id)) {
    return {
      allowed: false,
      code: 'PLAYER_ALREADY_SOLD',
      reason: `${player.name} has already been sold in this room.`,
      requiredBidLakhs,
      feasibility,
    };
  }

  if (highestBidderFranchise === team.franchiseCode) {
    return {
      allowed: false,
      code: 'ALREADY_HIGHEST_BIDDER',
      reason: 'You already hold the highest bid.',
      requiredBidLakhs,
      feasibility,
    };
  }

  if (feasibility.currentSquadSize >= settings.maxSquadSize) {
    return {
      allowed: false,
      code: 'SQUAD_FULL',
      reason: `Maximum squad size reached (${settings.maxSquadSize}/${settings.maxSquadSize}).`,
      requiredBidLakhs,
      feasibility,
    };
  }

  if (player.isOverseas && feasibility.overseasCount >= settings.maxOverseas) {
    return {
      allowed: false,
      code: 'OVERSEAS_LIMIT',
      reason: `Overseas player limit reached (${settings.maxOverseas}/${settings.maxOverseas}).`,
      requiredBidLakhs,
      feasibility,
    };
  }

  if (bidAmount < requiredBidLakhs) {
    return {
      allowed: false,
      code: 'BELOW_MIN_INCREMENT',
      reason: `Minimum valid bid is ${formatCurrency(requiredBidLakhs)}.`,
      requiredBidLakhs,
      feasibility,
    };
  }

  if (bidAmount > feasibility.availablePurseLakhs) {
    return {
      allowed: false,
      code: 'EXCEEDS_PURSE',
      reason: `Bid ${formatCurrency(bidAmount)} exceeds available purse (${formatCurrency(feasibility.availablePurseLakhs)}).`,
      requiredBidLakhs,
      feasibility,
    };
  }

  if (settings.enforceMinSquad && bidAmount > feasibility.maxAffordableBidLakhs) {
    return {
      allowed: false,
      code: 'RESERVE_VIOLATION',
      reason: `Max affordable bid is ${formatCurrency(feasibility.maxAffordableBidLakhs)} — must reserve ${formatCurrency(feasibility.minimumReserveLakhs)} for ${feasibility.minRemainingPlayers} remaining minimum squad slot${feasibility.minRemainingPlayers === 1 ? '' : 's'}.`,
      requiredBidLakhs,
      feasibility,
    };
  }

  return {
    allowed: true,
    requiredBidLakhs,
    feasibility,
  };
}
