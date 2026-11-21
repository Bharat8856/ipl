import {
  BowlingPhase,
  BowlingPlanSlot,
  PlayingXIMetrics,
  PlayingXIResult,
  SoldPlayerRecord,
} from '../shared/types';

function clamp(val: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, val));
}

function round1(val: number): number {
  return Math.round(val * 10) / 10;
}

/**
 * Orders a Playing XI into a realistic T20 batting order (#1 to #11):
 * - #1, #2: Best two openers (preferring LHB/RHB combo)
 * - #3: Best top-order batter
 * - #4, #5: Best middle-order batters
 * - #6, #7: Best finishers / batting all-rounders
 * - #8-#11: Bowlers sorted by batting capability descending
 */
export function orderBattingLineup(xi: SoldPlayerRecord[]): SoldPlayerRecord[] {
  if (xi.length <= 1) return [...xi];
  const remaining = [...xi];
  const ordered: SoldPlayerRecord[] = [];

  const pickBest = (scoreFn: (r: SoldPlayerRecord) => number) => {
    if (remaining.length === 0) return;
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const val = scoreFn(remaining[i]);
      if (val > bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    ordered.push(remaining.splice(bestIdx, 1)[0]);
  };

  // Opener 1
  pickBest((r) => r.player.ratings.opening + (r.player.battingPosition === 'OPENER' ? 12 : 0));
  // Opener 2 (small bonus for opposite batting hand to Opener 1)
  const opener1Hand = ordered[0]?.player.battingHand;
  pickBest(
    (r) =>
      r.player.ratings.opening +
      (r.player.battingPosition === 'OPENER' ? 10 : 0) +
      (r.player.battingHand !== opener1Hand ? 5 : 0),
  );
  // #3 Top order
  pickBest((r) => r.player.ratings.topOrder + (r.player.battingPosition === 'TOP' ? 8 : 0));
  // #4 & #5 Middle order
  pickBest((r) => r.player.ratings.middleOrder + (r.player.battingPosition === 'MIDDLE' ? 8 : 0));
  pickBest((r) => r.player.ratings.middleOrder + (r.player.battingPosition === 'MIDDLE' ? 6 : 0));
  // #6 & #7 Finishers
  pickBest((r) => r.player.ratings.finishing + (r.player.battingPosition === 'FINISHER' ? 8 : 0));
  pickBest((r) => r.player.ratings.finishing + (r.player.battingPosition === 'FINISHER' ? 6 : 0));

  // #8 - #11 sorted by batting rating descending
  remaining.sort((a, b) => b.player.ratings.batting - a.player.ratings.batting);
  ordered.push(...remaining);

  return ordered;
}

export function buildBowlingPlan(xi: SoldPlayerRecord[]): BowlingPlanSlot[] {
  const capableBowlers = xi.filter((r) => r.player.bowlingStyle !== 'NONE' && r.player.ratings.bowling >= 50);

  const buildPhase = (phase: BowlingPhase): BowlingPlanSlot => {
    const ratingOf = (r: SoldPlayerRecord) => {
      if (phase === 'PP') return r.player.ratings.powerplayBowling;
      if (phase === 'MIDDLE') return r.player.ratings.middleBowling;
      return r.player.ratings.deathBowling;
    };

    const sorted = [...capableBowlers]
      .sort((a, b) => {
        const bonusA = a.player.bowlingPhases.includes(phase) ? 8 : 0;
        const bonusB = b.player.bowlingPhases.includes(phase) ? 8 : 0;
        return ratingOf(b) + bonusB - (ratingOf(a) + bonusA);
      })
      .slice(0, 3)
      .map((r) => ({
        playerId: r.player.id,
        name: r.player.name,
        bowlingStyle: r.player.bowlingStyle,
        phaseRating: ratingOf(r),
      }));

    return { phase, bowlers: sorted };
  };

  return [buildPhase('PP'), buildPhase('MIDDLE'), buildPhase('DEATH')];
}

export function evaluatePlayingXI(orderedXI: SoldPlayerRecord[]): {
  metrics: PlayingXIMetrics;
  bowlingPlan: BowlingPlanSlot[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const xi = orderBattingLineup(orderedXI);

  if (xi.length === 0) {
    return {
      metrics: {
        openingScore: 0,
        leftRightBalanceScore: 0,
        topOrderScore: 0,
        middleOrderScore: 0,
        finishingScore: 0,
        wicketkeepingScore: 0,
        paceSpinBalanceScore: 0,
        powerplayBowlingScore: 0,
        middleBowlingScore: 0,
        deathBowlingScore: 0,
        allRounderScore: 0,
        overseasCompliant: true,
        overseasCount: 0,
        totalBowlingOptions: 0,
        paceOptions: 0,
        spinOptions: 0,
        leftHandBattersTop7: 0,
        hasKeeper: false,
        overallXIScore: 0,
      },
      bowlingPlan: [
        { phase: 'PP', bowlers: [] },
        { phase: 'MIDDLE', bowlers: [] },
        { phase: 'DEATH', bowlers: [] },
      ],
      warnings: ['No players acquired yet.'],
    };
  }

  const overseasCount = xi.filter((r) => r.player.isOverseas).length;
  const overseasCompliant = overseasCount <= 4;
  if (!overseasCompliant) {
    warnings.push(`Overseas limit exceeded in XI (${overseasCount}/4 maximum).`);
  }
  if (xi.length < 11) {
    warnings.push(`Incomplete Playing XI (${xi.length}/11 players).`);
  }

  // 1. Opening combination (#1 and #2)
  const openers = xi.slice(0, 2);
  let openingScore = 0;
  if (openers.length === 2) {
    const avgOpen = (openers[0].player.ratings.opening + openers[1].player.ratings.opening) / 2;
    const lrOpenerBonus = openers[0].player.battingHand !== openers[1].player.battingHand ? 6 : 0;
    const specialistBonus =
      openers.filter((o) => o.player.battingPosition === 'OPENER').length * 2.5;
    openingScore = clamp(avgOpen + lrOpenerBonus + specialistBonus - 5);
  } else if (openers.length === 1) {
    openingScore = clamp(openers[0].player.ratings.opening * 0.5);
  }

  // 2. Left-right batting combination across top 7
  const top7 = xi.slice(0, 7);
  const lhbCount = top7.filter((r) => r.player.battingHand === 'LHB').length;
  const rhbCount = top7.length - lhbCount;
  let leftRightBalanceScore = 50;
  if (top7.length >= 4) {
    if (lhbCount >= 2 && lhbCount <= 4 && rhbCount >= 2) {
      leftRightBalanceScore = 94;
    } else if (lhbCount === 1 || rhbCount === 1) {
      leftRightBalanceScore = 76;
    } else {
      leftRightBalanceScore = 56;
      warnings.push('No left-right batting variety in the top 7.');
    }
    // Bonus for consecutive alternating pairs in top 5
    let alternations = 0;
    for (let i = 0; i < Math.min(4, top7.length - 1); i++) {
      if (top7[i].player.battingHand !== top7[i + 1].player.battingHand) alternations++;
    }
    leftRightBalanceScore = clamp(leftRightBalanceScore + alternations * 1.5);
  }

  // 3. Top-order stability (#1, #2, #3)
  const top3 = xi.slice(0, 3);
  const topOrderScore =
    top3.length > 0
      ? clamp(
          (top3.reduce((s, r) => s + (r.player.ratings.topOrder * 0.6 + r.player.ratings.batting * 0.4), 0) /
            3) *
            (top3.length / 3),
        )
      : 0;

  // 4. Middle-order capability (#4, #5)
  const middle = xi.slice(3, 5);
  const middleOrderScore =
    middle.length > 0
      ? clamp(
          (middle.reduce((s, r) => s + r.player.ratings.middleOrder, 0) / 2) *
            (middle.length / 2),
        )
      : 0;

  // 5. Finishing ability (#6, #7)
  const finishers = xi.slice(5, 7);
  const finishingScore =
    finishers.length > 0
      ? clamp(
          (finishers.reduce((s, r) => s + r.player.ratings.finishing, 0) / 2) *
            (finishers.length / 2),
        )
      : 0;

  // 6. Wicketkeeping
  const keepers = xi.filter((r) => r.player.role === 'WK');
  const hasKeeper = keepers.length > 0;
  let wicketkeepingScore = 0;
  if (hasKeeper) {
    const bestKeeper = Math.max(...keepers.map((k) => k.player.ratings.wicketkeeping));
    wicketkeepingScore = clamp(bestKeeper + (keepers.length >= 2 ? 3 : 0));
  } else {
    wicketkeepingScore = 15;
    warnings.push('No specialist wicketkeeper in Playing XI.');
  }

  // 7. Bowling resources: pace, spin, and phase coverage
  const genuineBowlers = xi.filter(
    (r) => r.player.bowlingStyle !== 'NONE' && r.player.ratings.bowling >= 64,
  );
  const partTimeBowlers = xi.filter(
    (r) =>
      r.player.bowlingStyle !== 'NONE' &&
      r.player.ratings.bowling >= 42 &&
      r.player.ratings.bowling < 64,
  );
  const totalBowlingOptions = genuineBowlers.length + partTimeBowlers.length * 0.5;
  const paceOptions = genuineBowlers.filter((r) => r.player.bowlingStyle === 'PACE').length;
  const spinOptions = genuineBowlers.filter((r) => r.player.bowlingStyle === 'SPIN').length;

  if (genuineBowlers.length < 5) {
    warnings.push(`Short on bowling: only ${genuineBowlers.length} frontline bowling options (need 5+).`);
  }
  if (paceOptions < 2) {
    warnings.push('Under-resourced pace attack (fewer than 2 frontline pacers).');
  }
  if (spinOptions < 1) {
    warnings.push('No frontline spinner in Playing XI.');
  }

  let paceSpinBalanceScore = 40;
  if (paceOptions >= 3 && spinOptions >= 2) {
    paceSpinBalanceScore = 96;
  } else if (paceOptions >= 2 && spinOptions >= 2) {
    paceSpinBalanceScore = 90;
  } else if (paceOptions >= 3 && spinOptions >= 1) {
    paceSpinBalanceScore = 84;
  } else if (paceOptions >= 2 && spinOptions >= 1) {
    paceSpinBalanceScore = 76;
  } else {
    paceSpinBalanceScore = clamp(paceOptions * 22 + spinOptions * 24);
  }
  if (genuineBowlers.length >= 6) paceSpinBalanceScore = clamp(paceSpinBalanceScore + 4);
  if (genuineBowlers.length < 5) paceSpinBalanceScore = clamp(paceSpinBalanceScore - (5 - genuineBowlers.length) * 14);

  // 8. Phase-specific bowling (PP, Middle, Death)
  const topNPhaseAvg = (phase: BowlingPhase, count: number) => {
    const scores = xi
      .filter((r) => r.player.bowlingStyle !== 'NONE' && r.player.ratings.bowling >= 45)
      .map((r) =>
        phase === 'PP'
          ? r.player.ratings.powerplayBowling
          : phase === 'MIDDLE'
            ? r.player.ratings.middleBowling
            : r.player.ratings.deathBowling,
      )
      .sort((a, b) => b - a);
    const chosen = scores.slice(0, count);
    if (chosen.length === 0) return 0;
    return clamp((chosen.reduce((a, b) => a + b, 0) / count));
  };

  const powerplayBowlingScore = topNPhaseAvg('PP', 2);
  const middleBowlingScore = topNPhaseAvg('MIDDLE', 3);
  const deathBowlingScore = topNPhaseAvg('DEATH', 2);

  if (deathBowlingScore < 70 && xi.length >= 8) {
    warnings.push('Vulnerable death-over bowling (overs 16–20).');
  }

  // 9. All-rounder contribution & batting depth
  const allRounders = xi.filter(
    (r) =>
      r.player.role === 'AR' ||
      (r.player.ratings.batting >= 65 && r.player.ratings.bowling >= 65),
  );
  const arQuality =
    allRounders.length > 0
      ? allRounders.reduce((s, r) => s + (r.player.ratings.batting + r.player.ratings.bowling) / 2, 0) /
        allRounders.length
      : 0;
  const battingDepthCount = xi.filter((r) => r.player.ratings.batting >= 62).length;
  const allRounderScore = clamp(
    Math.min(allRounders.length, 3) * 16 +
      arQuality * 0.45 +
      (battingDepthCount >= 8 ? 14 : battingDepthCount >= 7 ? 8 : 0),
  );

  // Weighted cricket synergy composite (explicitly NOT just sum of individual overalls)
  let rawComposite =
    openingScore * 0.11 +
    leftRightBalanceScore * 0.06 +
    topOrderScore * 0.11 +
    middleOrderScore * 0.11 +
    finishingScore * 0.10 +
    wicketkeepingScore * 0.08 +
    paceSpinBalanceScore * 0.10 +
    powerplayBowlingScore * 0.09 +
    middleBowlingScore * 0.08 +
    deathBowlingScore * 0.10 +
    allRounderScore * 0.06;

  // Size scaling for incomplete XIs
  const sizeFactor = Math.min(1, xi.length / 11);
  rawComposite *= sizeFactor;

  // Hard tactical penalties for illegal/broken cricket structures
  if (!overseasCompliant) rawComposite -= (overseasCount - 4) * 12;
  if (!hasKeeper && xi.length >= 6) rawComposite -= 8;
  if (genuineBowlers.length < 5 && xi.length >= 9) {
    rawComposite -= (5 - genuineBowlers.length) * 6;
  }

  const metrics: PlayingXIMetrics = {
    openingScore: round1(openingScore),
    leftRightBalanceScore: round1(leftRightBalanceScore),
    topOrderScore: round1(topOrderScore),
    middleOrderScore: round1(middleOrderScore),
    finishingScore: round1(finishingScore),
    wicketkeepingScore: round1(wicketkeepingScore),
    paceSpinBalanceScore: round1(paceSpinBalanceScore),
    powerplayBowlingScore: round1(powerplayBowlingScore),
    middleBowlingScore: round1(middleBowlingScore),
    deathBowlingScore: round1(deathBowlingScore),
    allRounderScore: round1(allRounderScore),
    overseasCompliant,
    overseasCount,
    totalBowlingOptions: round1(totalBowlingOptions),
    paceOptions,
    spinOptions,
    leftHandBattersTop7: lhbCount,
    hasKeeper,
    overallXIScore: round1(clamp(rawComposite)),
  };

  return {
    metrics,
    bowlingPlan: buildBowlingPlan(xi),
    warnings,
  };
}

/**
 * Generates the strongest valid Playing XI (max 11 players, max 4 overseas)
 * using role-aware greedy construction + local 1-for-1 swap hill-climbing
 * directly against the tactical cricket synergy evaluator (NOT naive overall sorting).
 */
export function optimizePlayingXI(
  roster: SoldPlayerRecord[],
  customXIIds?: string[] | null,
): PlayingXIResult {
  if (roster.length === 0) {
    const empty = evaluatePlayingXI([]);
    return {
      xi: [],
      bench: [],
      metrics: empty.metrics,
      bowlingPlan: empty.bowlingPlan,
      isCustom: false,
      warnings: empty.warnings,
    };
  }

  // If manual custom XI is provided and valid against current roster
  if (customXIIds && customXIIds.length > 0) {
    const rosterById = new Map(roster.map((r) => [r.player.id, r]));
    const customSelected: SoldPlayerRecord[] = [];
    for (const id of customXIIds) {
      const rec = rosterById.get(id);
      if (rec && customSelected.length < 11) {
        customSelected.push(rec);
      }
    }
    if (customSelected.length > 0) {
      const selectedSet = new Set(customSelected.map((r) => r.player.id));
      const bench = roster.filter((r) => !selectedSet.has(r.player.id));
      const ordered = orderBattingLineup(customSelected);
      const evalRes = evaluatePlayingXI(ordered);
      return {
        xi: ordered,
        bench,
        metrics: evalRes.metrics,
        bowlingPlan: evalRes.bowlingPlan,
        isCustom: true,
        warnings: evalRes.warnings,
      };
    }
  }

  // Build initial feasible XI (max 4 overseas) via tactical slot seeding
  const selected: SoldPlayerRecord[] = [];
  const used = new Set<string>();
  const canAdd = (r: SoldPlayerRecord) => {
    if (used.has(r.player.id) || selected.length >= 11) return false;
    if (r.player.isOverseas) {
      const currentOS = selected.filter((s) => s.player.isOverseas).length;
      if (currentOS >= 4) return false;
    }
    return true;
  };

  const tryPick = (predicate: (r: SoldPlayerRecord) => boolean, scoreFn: (r: SoldPlayerRecord) => number) => {
    const candidates = roster.filter((r) => canAdd(r) && predicate(r));
    if (candidates.length === 0) return false;
    candidates.sort((a, b) => scoreFn(b) - scoreFn(a));
    selected.push(candidates[0]);
    used.add(candidates[0].player.id);
    return true;
  };

  // Seed core T20 spine: 1 WK, 2 Openers, 1 Middle/Finisher, 2 Pacers, 1 Spinner, 1 All-Rounder
  tryPick((r) => r.player.role === 'WK', (r) => r.player.ratings.overall + r.player.ratings.wicketkeeping * 0.3);
  tryPick((r) => r.player.battingPosition === 'OPENER' || r.player.ratings.opening >= 80, (r) => r.player.ratings.opening);
  tryPick((r) => r.player.battingPosition === 'OPENER' || r.player.ratings.opening >= 78, (r) => r.player.ratings.opening);
  tryPick((r) => r.player.bowlingStyle === 'PACE' && r.player.ratings.bowling >= 65, (r) => r.player.ratings.deathBowling + r.player.ratings.bowling);
  tryPick((r) => r.player.bowlingStyle === 'PACE' && r.player.ratings.bowling >= 65, (r) => r.player.ratings.powerplayBowling + r.player.ratings.bowling);
  tryPick((r) => r.player.bowlingStyle === 'SPIN' && r.player.ratings.bowling >= 65, (r) => r.player.ratings.middleBowling + r.player.ratings.bowling);
  tryPick((r) => r.player.role === 'AR', (r) => r.player.ratings.overall + r.player.ratings.finishing * 0.25);

  // Fill remaining slots greedily by maximum marginal XI tactical score gain!
  while (selected.length < Math.min(11, roster.length)) {
    const candidates = roster.filter((r) => canAdd(r));
    if (candidates.length === 0) break;

    let bestCandidate = candidates[0];
    let bestScore = -Infinity;
    for (const c of candidates) {
      const trial = evaluatePlayingXI([...selected, c]).metrics.overallXIScore;
      if (trial > bestScore) {
        bestScore = trial;
        bestCandidate = c;
      }
    }
    selected.push(bestCandidate);
    used.add(bestCandidate.player.id);
  }

  // Hill-climbing 1-for-1 bench swap refinement (max 3 passes) to reach local optimum
  let bestXI = [...selected];
  let bestScore = evaluatePlayingXI(bestXI).metrics.overallXIScore;

  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    const xiIds = new Set(bestXI.map((r) => r.player.id));
    const bench = roster.filter((r) => !xiIds.has(r.player.id));

    for (let i = 0; i < bestXI.length; i++) {
      for (const sub of bench) {
        const trial = [...bestXI];
        trial[i] = sub;
        const osCount = trial.filter((r) => r.player.isOverseas).length;
        if (osCount > 4) continue;
        const score = evaluatePlayingXI(trial).metrics.overallXIScore;
        if (score > bestScore + 0.05) {
          bestXI = trial;
          bestScore = score;
          improved = true;
          break;
        }
      }
      if (improved) break;
    }
    if (!improved) break;
  }

  const ordered = orderBattingLineup(bestXI);
  const xiIdSet = new Set(ordered.map((r) => r.player.id));
  const bench = roster.filter((r) => !xiIdSet.has(r.player.id));
  const finalEval = evaluatePlayingXI(ordered);

  return {
    xi: ordered,
    bench,
    metrics: finalEval.metrics,
    bowlingPlan: finalEval.bowlingPlan,
    isCustom: false,
    warnings: finalEval.warnings,
  };
}
