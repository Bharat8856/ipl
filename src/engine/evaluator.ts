import {
  AuctionSettings,
  FranchiseCode,
  PlayerValueVerdict,
  RoomEvaluationSnapshot,
  SoldPlayerRecord,
  TeamEvaluation,
  TeamState,
} from '../shared/types';
import { FRANCHISE_MAP } from '../shared/franchises';
import { STATS_SNAPSHOT_VERSION } from '../shared/players';
import { detectMissingRoles } from './bidding';
import { optimizePlayingXI } from './optimizer';

function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export function evaluatePlayerValue(record: SoldPlayerRecord): PlayerValueVerdict {
  const paid = Math.max(1, record.soldPriceLakhs);
  const fair = Math.max(30, record.player.ratings.fairValueLakhs);
  const valueDeltaLakhs = fair - paid;
  const valueRatio = Math.round((fair / paid) * 100) / 100;

  let label: PlayerValueVerdict['label'] = 'Fair Price';
  if (valueRatio >= 1.35) label = 'Steal';
  else if (valueRatio >= 1.12) label = 'Good Value';
  else if (valueRatio >= 0.85) label = 'Fair Price';
  else if (valueRatio >= 0.68) label = 'Slight Overpay';
  else label = 'Overpay';

  return {
    playerId: record.player.id,
    playerName: record.player.name,
    role: record.player.role,
    paidLakhs: paid,
    fairValueLakhs: fair,
    valueDeltaLakhs,
    valueRatio,
    label,
  };
}

/**
 * Deterministic Team Evaluation Engine.
 * Crucial fairness principle:
 * - squadQualityScore measures PURE cricketing quality (Playing XI synergy + bench depth)
 *   with ZERO penalty for spending more purse on elite superstars.
 * - auctionEfficiencyScore is computed and displayed SEPARATELY as value-for-money.
 */
export function evaluateTeam(team: TeamState, settings: AuctionSettings): TeamEvaluation {
  const franchise = FRANCHISE_MAP[team.franchiseCode];
  const playingXI = optimizePlayingXI(team.roster, team.customXIIds);
  const missingRoles = detectMissingRoles(team);
  const overseasCount = team.roster.filter((r) => r.player.isOverseas).length;

  // Bench depth score (quality & role coverage of reserves beyond the XI)
  const bench = playingXI.bench;
  let benchDepthScore = 0;
  if (bench.length > 0) {
    const avgBenchOverall =
      bench.reduce((sum, r) => sum + r.player.ratings.overall, 0) / bench.length;
    const benchRoles = new Set(bench.map((r) => r.player.role)).size;
    const benchSizeBonus = Math.min(bench.length, 6) * 4;
    benchDepthScore = clamp(avgBenchOverall * 0.68 + benchRoles * 4.5 + benchSizeBonus);
  }

  // Squad Quality Score (NO penalty for spending more on quality players!)
  const xiScore = playingXI.metrics.overallXIScore;
  const squadQualityScore = round1(clamp(xiScore * 0.84 + benchDepthScore * 0.16));

  // Separate Auction Efficiency Score (value-for-money vs deterministic fair value)
  const allValueVerdicts = team.roster.map(evaluatePlayerValue);
  let auctionEfficiencyScore = 0;
  if (allValueVerdicts.length > 0) {
    const totalPaid = team.roster.reduce((s, r) => s + r.soldPriceLakhs, 0);
    const totalFair = team.roster.reduce((s, r) => s + r.player.ratings.fairValueLakhs, 0);
    const ratio = totalPaid > 0 ? totalFair / totalPaid : 1;
    // ratio 1.0 => 76 pts, ratio 1.3 => 95 pts, ratio 0.7 => 56 pts
    auctionEfficiencyScore = round1(clamp(76 + (ratio - 1) * 62, 20, 100));
  }

  // Best & worst purchases
  const sortedByValue = [...allValueVerdicts].sort((a, b) => {
    // Combine relative ratio and absolute surplus so steals at scale rise to top
    const scoreA = (a.valueRatio - 1) * 60 + a.valueDeltaLakhs / 100;
    const scoreB = (b.valueRatio - 1) * 60 + b.valueDeltaLakhs / 100;
    return scoreB - scoreA;
  });

  const bestPurchases = sortedByValue.filter((v) => v.valueRatio >= 1.0).slice(0, 3);
  const worstPurchases = [...sortedByValue]
    .reverse()
    .filter((v) => v.valueRatio < 1.0)
    .slice(0, 3);

  // Strengths & weaknesses derived deterministically from XI metrics
  const strengths: string[] = [];
  const weaknesses: string[] = [...playingXI.warnings];
  const m = playingXI.metrics;

  if (m.openingScore >= 85) strengths.push(`Explosive opening pair (${m.openingScore}/100)`);
  if (m.leftRightBalanceScore >= 88) strengths.push(`Strong left-right batting variety (${m.leftHandBattersTop7} LHB in top 7)`);
  if (m.middleOrderScore >= 85) strengths.push(`Commanding middle order (${m.middleOrderScore}/100)`);
  if (m.finishingScore >= 85) strengths.push(`High-impact death finishers (${m.finishingScore}/100)`);
  if (m.deathBowlingScore >= 85) strengths.push(`Elite death-over bowling (${m.deathBowlingScore}/100)`);
  if (m.powerplayBowlingScore >= 86) strengths.push(`Penetrative powerplay attack (${m.powerplayBowlingScore}/100)`);
  if (m.paceSpinBalanceScore >= 88) strengths.push(`Balanced pace (${m.paceOptions}) & spin (${m.spinOptions}) unit`);
  if (m.allRounderScore >= 80) strengths.push(`Deep all-rounder core & batting depth`);

  if (team.roster.length > 0) {
    if (m.openingScore < 72) weaknesses.push(`Below-par opening combination (${m.openingScore}/100)`);
    if (m.middleOrderScore < 72) weaknesses.push(`Fragile middle order (${m.middleOrderScore}/100)`);
    if (m.finishingScore < 70) weaknesses.push(`Lacks proven death finishers (${m.finishingScore}/100)`);
    if (m.powerplayBowlingScore < 70) weaknesses.push(`Limited powerplay wicket-takers (${m.powerplayBowlingScore}/100)`);
    if (m.middleBowlingScore < 70) weaknesses.push(`Middle-overs bowling containment gap (${m.middleBowlingScore}/100)`);
  }

  // Deduplicate weaknesses
  const uniqueWeaknesses = Array.from(new Set(weaknesses));

  // Confidence level & missing-data warnings
  const missingDataWarnings: string[] = [];
  let confidenceScore = 100;

  if (team.roster.length === 0) {
    confidenceScore = 15;
    missingDataWarnings.push('No players drafted — evaluation is empty.');
  } else {
    if (team.roster.length < 11) {
      confidenceScore -= (11 - team.roster.length) * 6;
      missingDataWarnings.push(
        `Incomplete Playing XI (${team.roster.length}/11). Remaining slots lower forecast certainty.`,
      );
    }
    if (settings.enforceMinSquad && team.roster.length < settings.minSquadSize) {
      confidenceScore -= 8;
      missingDataWarnings.push(
        `Squad below configured minimum (${team.roster.length}/${settings.minSquadSize}).`,
      );
    }

    const avgCompleteness =
      team.roster.reduce((sum, r) => sum + r.player.stats.dataCompleteness, 0) /
      team.roster.length;
    if (avgCompleteness < 0.92) {
      confidenceScore -= Math.round((1 - avgCompleteness) * 60);
    }

    const sparsePlayers = team.roster.filter((r) => r.player.stats.missingFields.length > 0);
    for (const sp of sparsePlayers.slice(0, 3)) {
      missingDataWarnings.push(
        `${sp.player.name}: ${sp.player.stats.missingFields.join('; ')}`,
      );
    }
  }

  confidenceScore = Math.round(clamp(confidenceScore, 10, 100));
  const confidenceLevel: TeamEvaluation['confidenceLevel'] =
    confidenceScore >= 80 ? 'High' : confidenceScore >= 55 ? 'Medium' : 'Low';

  // Championship score reflects pure squad quality (92%) + tiny tie-break from bench/balance;
  // it does NOT penalize spending money on stars.
  const championshipScore = round1(
    team.roster.length === 0 ? 0 : clamp(squadQualityScore * 0.96 + (playingXI.metrics.overseasCompliant ? 4 : 0) - 4),
  );

  return {
    franchiseCode: team.franchiseCode,
    franchiseName: franchise.name,
    ownerName:
      team.controllerType === 'ai'
        ? `AI (${settings.aiDifficulty})`
        : team.ownerName ?? 'Unclaimed',
    controllerType: team.controllerType,
    rank: 0,
    championshipScore: round1(squadQualityScore),
    squadQualityScore,
    benchDepthScore: round1(benchDepthScore),
    auctionEfficiencyScore,
    purseSpentLakhs: team.purseSpentLakhs,
    purseRemainingLakhs: Math.max(0, team.purseTotalLakhs - team.purseSpentLakhs),
    squadSize: team.roster.length,
    overseasCount,
    playingXI,
    bestPurchases,
    worstPurchases,
    allValueVerdicts,
    weaknesses: uniqueWeaknesses,
    missingRoles,
    strengths: strengths.slice(0, 5),
    confidenceLevel,
    confidenceScore,
    missingDataWarnings,
  };
}

export function evaluateAllTeams(
  teams: Record<FranchiseCode, TeamState>,
  settings: AuctionSettings,
): RoomEvaluationSnapshot {
  const activeTeams = Object.values(teams).filter((t) => t.controllerType !== 'inactive');
  const evaluations = activeTeams.map((t) => evaluateTeam(t, settings));

  evaluations.sort((a, b) => {
    if (b.squadQualityScore !== a.squadQualityScore) {
      return b.squadQualityScore - a.squadQualityScore;
    }
    if (b.playingXI.metrics.overallXIScore !== a.playingXI.metrics.overallXIScore) {
      return b.playingXI.metrics.overallXIScore - a.playingXI.metrics.overallXIScore;
    }
    return b.auctionEfficiencyScore - a.auctionEfficiencyScore;
  });

  evaluations.forEach((ev, idx) => {
    ev.rank = idx + 1;
  });

  return {
    snapshotVersion: STATS_SNAPSHOT_VERSION,
    generatedAt: Date.now(),
    rankings: evaluations,
  };
}

export interface HeadToHeadMetric {
  label: string;
  teamAValue: number;
  teamBValue: number;
  winner: 'A' | 'B' | 'TIE';
}

export function compareTeams(teamA: TeamEvaluation, teamB: TeamEvaluation): {
  metrics: HeadToHeadMetric[];
  aWins: number;
  bWins: number;
  ties: number;
  overallEdge: FranchiseCode | 'TIE';
} {
  const rows: [string, number, number][] = [
    ['Squad Quality', teamA.squadQualityScore, teamB.squadQualityScore],
    ['Playing XI Rating', teamA.playingXI.metrics.overallXIScore, teamB.playingXI.metrics.overallXIScore],
    ['Opening Combo', teamA.playingXI.metrics.openingScore, teamB.playingXI.metrics.openingScore],
    ['Left-Right Variety', teamA.playingXI.metrics.leftRightBalanceScore, teamB.playingXI.metrics.leftRightBalanceScore],
    ['Top-Order Stability', teamA.playingXI.metrics.topOrderScore, teamB.playingXI.metrics.topOrderScore],
    ['Middle Order', teamA.playingXI.metrics.middleOrderScore, teamB.playingXI.metrics.middleOrderScore],
    ['Finishing Power', teamA.playingXI.metrics.finishingScore, teamB.playingXI.metrics.finishingScore],
    ['Wicketkeeping', teamA.playingXI.metrics.wicketkeepingScore, teamB.playingXI.metrics.wicketkeepingScore],
    ['Pace & Spin Balance', teamA.playingXI.metrics.paceSpinBalanceScore, teamB.playingXI.metrics.paceSpinBalanceScore],
    ['Powerplay Bowling', teamA.playingXI.metrics.powerplayBowlingScore, teamB.playingXI.metrics.powerplayBowlingScore],
    ['Middle-Overs Bowling', teamA.playingXI.metrics.middleBowlingScore, teamB.playingXI.metrics.middleBowlingScore],
    ['Death-Overs Bowling', teamA.playingXI.metrics.deathBowlingScore, teamB.playingXI.metrics.deathBowlingScore],
    ['All-Rounder Depth', teamA.playingXI.metrics.allRounderScore, teamB.playingXI.metrics.allRounderScore],
    ['Bench Depth', teamA.benchDepthScore, teamB.benchDepthScore],
    ['Auction Efficiency', teamA.auctionEfficiencyScore, teamB.auctionEfficiencyScore],
  ];

  let aWins = 0;
  let bWins = 0;
  let ties = 0;

  const metrics: HeadToHeadMetric[] = rows.map(([label, aVal, bVal]) => {
    let winner: 'A' | 'B' | 'TIE' = 'TIE';
    if (aVal > bVal + 0.4) {
      winner = 'A';
      aWins++;
    } else if (bVal > aVal + 0.4) {
      winner = 'B';
      bWins++;
    } else {
      ties++;
    }
    return { label, teamAValue: aVal, teamBValue: bVal, winner };
  });

  const overallEdge =
    teamA.squadQualityScore > teamB.squadQualityScore + 0.4
      ? teamA.franchiseCode
      : teamB.squadQualityScore > teamA.squadQualityScore + 0.4
        ? teamB.franchiseCode
        : 'TIE';

  return { metrics, aWins, bWins, ties, overallEdge };
}
