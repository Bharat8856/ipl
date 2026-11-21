import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Award,
  BarChart3,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Shield,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Trophy,
  Users,
} from 'lucide-react';
import {
  AiAnalystReport,
  FranchiseCode,
  Participant,
  RoomState,
} from '../shared/types';
import { FRANCHISE_MAP } from '../shared/franchises';
import { formatCurrency, formatCurrencyCompact } from '../engine/bidding';
import { compareTeams } from '../engine/evaluator';
import { optimizePlayingXI } from '../engine/optimizer';
import { FranchiseBadge } from './FranchiseBadge';

type ResultsTab = 'leaderboard' | 'optimizer' | 'value' | 'compare' | 'analyst';

interface ResultsHubProps {
  roomState: RoomState;
  me: Participant | null;
  onUpdateCustomXI: (franchiseCode: FranchiseCode, playerIds: string[] | null) => void;
  onExitToLobbyHome: () => void;
}

export function ResultsHub({
  roomState,
  me,
  onUpdateCustomXI,
  onExitToLobbyHome,
}: ResultsHubProps) {
  const rankings = roomState.evaluation?.rankings ?? [];
  const defaultTeamCode =
    (me?.franchiseCode && rankings.some((r) => r.franchiseCode === me.franchiseCode)
      ? me.franchiseCode
      : rankings[0]?.franchiseCode) ?? 'MI';

  const [tab, setTab] = useState<ResultsTab>('leaderboard');
  const [selectedCode, setSelectedCode] = useState<FranchiseCode>(defaultTeamCode);
  const [swapOutId, setSwapOutId] = useState<string | null>(null);

  const [compareA, setCompareA] = useState<FranchiseCode>(rankings[0]?.franchiseCode ?? 'MI');
  const [compareB, setCompareB] = useState<FranchiseCode>(
    rankings[1]?.franchiseCode ?? rankings[0]?.franchiseCode ?? 'CSK',
  );

  const [aiReport, setAiReport] = useState<AiAnalystReport | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const selectedEval =
    rankings.find((r) => r.franchiseCode === selectedCode) ?? rankings[0] ?? null;
  const selectedTeamState = selectedEval ? roomState.teams[selectedEval.franchiseCode] : null;

  // Baseline optimal XI for comparing manual adjustments delta
  const baselineOptimalXI = useMemo(() => {
    if (!selectedTeamState) return null;
    return optimizePlayingXI(selectedTeamState.roster, null);
  }, [selectedTeamState]);

  const canEditSelectedXI = Boolean(
    selectedEval &&
      (me?.role === 'admin' || me?.franchiseCode === selectedEval.franchiseCode),
  );

  const handleSwapWithBench = (benchPlayerId: string) => {
    if (!selectedEval || !swapOutId || !canEditSelectedXI) return;
    const currentIds = selectedEval.playingXI.xi.map((r) => r.player.id);
    const updatedIds = currentIds.map((id) => (id === swapOutId ? benchPlayerId : id));
    onUpdateCustomXI(selectedEval.franchiseCode, updatedIds);
    setSwapOutId(null);
  };

  const handleGenerateAiAnalyst = async () => {
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch(`/api/rooms/${roomState.roomCode}/analyst`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as { report?: AiAnalystReport; error?: string };
      if (!res.ok || !data.report) {
        setAiError(data.error ?? 'Could not generate AI commentary.');
        return;
      }
      setAiReport(data.report);
    } catch {
      setAiError('Network error while contacting Gemini Analyst.');
    } finally {
      setAiLoading(false);
    }
  };

  const teamAEval = rankings.find((r) => r.franchiseCode === compareA) ?? rankings[0];
  const teamBEval = rankings.find((r) => r.franchiseCode === compareB) ?? rankings[1] ?? rankings[0];
  const comparison =
    teamAEval && teamBEval ? compareTeams(teamAEval, teamBEval) : null;

  const champion = rankings[0];

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Stage 4 of 4 · Final Post-Auction Evaluation · Snapshot {roomState.statsSnapshotVersion}
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Auction Standings &amp; Tactical Evaluation
          </h1>
          {champion && (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Top Rated Franchise:{' '}
              <strong className="text-slate-900 dark:text-white">
                {champion.franchiseName}
              </strong>{' '}
              ({champion.squadQualityScore.toFixed(1)} Squad Quality ·{' '}
              {champion.auctionEfficiencyScore.toFixed(1)} Auction Efficiency)
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onExitToLobbyHome}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          New Auction Room
        </button>
      </div>

      {/* Navigation Tabs */}
      <div
        role="tablist"
        aria-label="Evaluation views"
        className="mt-6 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 text-xs sm:text-sm font-semibold dark:border-slate-800 dark:bg-slate-900"
      >
        {(
          [
            ['leaderboard', 'Final Leaderboard', Trophy],
            ['optimizer', 'Playing XI Optimizer', Users],
            ['value', 'Value & Scouting', Award],
            ['compare', 'Head-to-Head', ArrowLeftRight],
            ['analyst', 'Gemini AI Analyst', Sparkles],
          ] as [ResultsTab, string, typeof Trophy][]
        ).map(([id, label, Icon]) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 transition-colors whitespace-nowrap shrink-0 ${
                active
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-amber-400'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ================= TAB 1: FINAL LEADERBOARD ================= */}
      {tab === 'leaderboard' && (
        <section className="mt-6 space-y-6">
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Rank</th>
                  <th className="px-4 py-3">Franchise</th>
                  <th className="px-4 py-3 text-right">Squad Quality</th>
                  <th className="px-4 py-3 text-right">Playing XI</th>
                  <th className="px-4 py-3 text-right">Auction Efficiency</th>
                  <th className="px-4 py-3 text-right">Squad / OS</th>
                  <th className="px-4 py-3 text-right">Purse Spent</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rankings.map((ev) => (
                  <tr
                    key={ev.franchiseCode}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3.5 font-mono-num font-bold text-slate-900 dark:text-white">
                      #{ev.rank}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <FranchiseBadge code={ev.franchiseCode} size="sm" />
                        <div>
                          <p className="font-bold text-slate-900 dark:text-white">
                            {ev.franchiseName}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {ev.ownerName}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-num text-base font-extrabold text-amber-700 dark:text-amber-400">
                      {ev.squadQualityScore.toFixed(1)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-num font-semibold text-slate-900 dark:text-slate-100">
                      {ev.playingXI.metrics.overallXIScore.toFixed(1)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-num font-semibold text-emerald-700 dark:text-emerald-400">
                      {ev.auctionEfficiencyScore.toFixed(1)}
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-num text-xs text-slate-700 dark:text-slate-300">
                      {ev.squadSize} · {ev.overseasCount} OS
                    </td>
                    <td className="px-4 py-3.5 text-right font-mono-num text-xs text-slate-700 dark:text-slate-300">
                      {formatCurrency(ev.purseSpentLakhs)}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <span
                        className={`font-semibold ${
                          ev.confidenceLevel === 'High'
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : ev.confidenceLevel === 'Medium'
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {ev.confidenceLevel} ({ev.confidenceScore}%)
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCode(ev.franchiseCode);
                          setTab('optimizer');
                        }}
                        className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                      >
                        Playing XI
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fairness note: <strong>Squad Quality</strong> evaluates pure cricketing strength
            (Playing XI synergy + bench depth) with zero penalty for spending heavily on marquee
            talent. <strong>Auction Efficiency</strong> measures value-for-money separately.
          </p>
        </section>
      )}

      {/* ================= TAB 2: INTERACTIVE PLAYING XI OPTIMIZER ================= */}
      {tab === 'optimizer' && selectedEval && (
        <section className="mt-6 space-y-6">
          {/* Franchise Selector Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {rankings.map((r) => (
                <button
                  key={r.franchiseCode}
                  type="button"
                  onClick={() => {
                    setSelectedCode(r.franchiseCode);
                    setSwapOutId(null);
                  }}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                    selectedEval.franchiseCode === r.franchiseCode
                      ? 'border-amber-600 bg-amber-50 text-slate-900 dark:border-amber-500 dark:bg-amber-500/15 dark:text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                  }`}
                >
                  <FranchiseBadge code={r.franchiseCode} size="xs" />
                  <span>{r.franchiseCode}</span>
                </button>
              ))}
            </div>

            {selectedEval.playingXI.isCustom && canEditSelectedXI && (
              <button
                type="button"
                onClick={() => {
                  onUpdateCustomXI(selectedEval.franchiseCode, null);
                  setSwapOutId(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Reset to Optimal XI</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 7 cols: Batting Order Playing XI + Bench Swap */}
            <div className="lg:col-span-7 space-y-5">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white">
                      {selectedEval.franchiseName} ·{' '}
                      {selectedEval.playingXI.isCustom ? 'Custom Playing XI' : 'Optimal Playing XI'}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {canEditSelectedXI && selectedEval.playingXI.bench.length > 0
                        ? 'Select any XI player below, then click a Bench player to test a live swap.'
                        : 'Ordered by T20 batting position and phase role.'}
                    </p>
                  </div>
                  <div className="text-right font-mono-num">
                    <p className="text-2xl font-extrabold text-amber-700 dark:text-amber-400">
                      {selectedEval.playingXI.metrics.overallXIScore.toFixed(1)}
                    </p>
                    {baselineOptimalXI && selectedEval.playingXI.isCustom && (
                      <p
                        className={`text-xs font-bold ${
                          selectedEval.playingXI.metrics.overallXIScore >=
                          baselineOptimalXI.metrics.overallXIScore
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {(
                          selectedEval.playingXI.metrics.overallXIScore -
                          baselineOptimalXI.metrics.overallXIScore
                        ).toFixed(1)}{' '}
                        vs Auto XI
                      </p>
                    )}
                  </div>
                </div>

                {selectedEval.playingXI.xi.length === 0 ? (
                  <p className="py-8 text-center text-sm text-slate-500">
                    No players drafted for this franchise.
                  </p>
                ) : (
                  <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedEval.playingXI.xi.map((rec, idx) => {
                      const isSelectedForSwap = swapOutId === rec.player.id;
                      return (
                        <div
                          key={rec.player.id}
                          className={`flex items-center justify-between gap-3 py-2.5 px-2 rounded-lg text-sm transition-colors ${
                            isSelectedForSwap
                              ? 'bg-amber-50 dark:bg-amber-500/15'
                              : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-5 font-mono-num text-xs font-bold text-slate-400">
                              {idx + 1}.
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900 dark:text-white">
                                {rec.player.name}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {rec.player.role} · {rec.player.battingHand} ·{' '}
                                {rec.player.battingPosition.toLowerCase()}
                                {rec.player.bowlingStyle !== 'NONE'
                                  ? ` · ${rec.player.bowlingStyle}`
                                  : ''}
                                {rec.player.isOverseas ? ' · Overseas' : ''}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-mono-num text-xs font-semibold text-slate-600 dark:text-slate-400">
                              {formatCurrencyCompact(rec.soldPriceLakhs)}
                            </span>
                            {canEditSelectedXI && selectedEval.playingXI.bench.length > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setSwapOutId(isSelectedForSwap ? null : rec.player.id)
                                }
                                className={`rounded-md border px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${
                                  isSelectedForSwap
                                    ? 'border-amber-600 bg-amber-600 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-slate-950'
                                    : 'border-slate-300 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                                }`}
                              >
                                {isSelectedForSwap ? 'Cancel Swap' : 'Swap Out'}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bench Reserves */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  Bench Reserves ({selectedEval.playingXI.bench.length})
                </h3>
                {selectedEval.playingXI.bench.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    All acquired players are currently in the Playing XI.
                  </p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedEval.playingXI.bench.map((rec) => (
                      <div
                        key={rec.player.id}
                        className="flex items-center justify-between gap-3 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900 dark:text-white">
                            {rec.player.name}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {rec.player.role} · {rec.player.battingHand} · OVR{' '}
                            {rec.player.ratings.overall}
                            {rec.player.isOverseas ? ' · Overseas' : ''}
                          </p>
                        </div>
                        {swapOutId && canEditSelectedXI ? (
                          <button
                            type="button"
                            onClick={() => handleSwapWithBench(rec.player.id)}
                            className="rounded-md bg-amber-600 px-3 py-1 font-bold text-white hover:bg-amber-700 whitespace-nowrap dark:bg-amber-500 dark:text-slate-950"
                          >
                            Bring Into XI
                          </button>
                        ) : (
                          <span className="font-mono-num text-slate-500">
                            {formatCurrencyCompact(rec.soldPriceLakhs)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right 5 cols: 10-Dimension Cricket Matrix + Best Bowling Plan */}
            <div className="lg:col-span-5 space-y-5">
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  Tactical XI Evaluation Matrix
                </h3>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Overseas in XI:{' '}
                  <strong
                    className={
                      selectedEval.playingXI.metrics.overseasCompliant
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }
                  >
                    {selectedEval.playingXI.metrics.overseasCount}/4
                    {selectedEval.playingXI.metrics.overseasCompliant ? ' Valid' : ' Violation'}
                  </strong>{' '}
                  · Bowling Options: {selectedEval.playingXI.metrics.totalBowlingOptions} (
                  {selectedEval.playingXI.metrics.paceOptions} Pace /{' '}
                  {selectedEval.playingXI.metrics.spinOptions} Spin) · LHB Top 7:{' '}
                  {selectedEval.playingXI.metrics.leftHandBattersTop7}
                </p>

                <div className="mt-4 space-y-2.5">
                  {(
                    [
                      ['Opening Combination', selectedEval.playingXI.metrics.openingScore],
                      ['Left-Right Batting Variety', selectedEval.playingXI.metrics.leftRightBalanceScore],
                      ['Top-Order Stability', selectedEval.playingXI.metrics.topOrderScore],
                      ['Middle-Order Capability', selectedEval.playingXI.metrics.middleOrderScore],
                      ['Finishing Power', selectedEval.playingXI.metrics.finishingScore],
                      ['Wicketkeeping', selectedEval.playingXI.metrics.wicketkeepingScore],
                      ['Pace & Spin Balance', selectedEval.playingXI.metrics.paceSpinBalanceScore],
                      ['Powerplay Bowling (1–6)', selectedEval.playingXI.metrics.powerplayBowlingScore],
                      ['Middle-Overs Bowling (7–15)', selectedEval.playingXI.metrics.middleBowlingScore],
                      ['Death-Overs Bowling (16–20)', selectedEval.playingXI.metrics.deathBowlingScore],
                      ['All-Rounder Depth', selectedEval.playingXI.metrics.allRounderScore],
                    ] as [string, number][]
                  ).map(([label, val]) => (
                    <div key={label} className="text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-700 dark:text-slate-300">{label}</span>
                        <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                          {val.toFixed(1)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                        <div
                          className={`h-full origin-left ${
                            val >= 82
                              ? 'bg-emerald-600 dark:bg-emerald-500'
                              : val >= 68
                                ? 'bg-amber-500'
                                : 'bg-red-500'
                          }`}
                          style={{ transform: `scaleX(${Math.min(1, val / 100)})` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Warnings & Missing Data */}
                {(selectedEval.playingXI.warnings.length > 0 ||
                  selectedEval.missingDataWarnings.length > 0) && (
                  <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200">
                    <p className="flex items-center gap-1.5 font-bold">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Tactical &amp; Data Confidence Notes ({selectedEval.confidenceLevel})</span>
                    </p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4">
                      {Array.from(
                        new Set([
                          ...selectedEval.playingXI.warnings,
                          ...selectedEval.missingDataWarnings,
                        ]),
                      ).map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Best Bowling Combination */}
              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <h3 className="flex items-center gap-2 font-display text-xl font-bold text-slate-900 dark:text-white">
                  <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span>Best Bowling Combination</span>
                </h3>
                <div className="mt-3 space-y-3 text-xs">
                  {selectedEval.playingXI.bowlingPlan.map((slot) => (
                    <div
                      key={slot.phase}
                      className="rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                    >
                      <p className="font-bold text-slate-700 dark:text-slate-200">
                        {slot.phase === 'PP'
                          ? 'Powerplay (Overs 1–6)'
                          : slot.phase === 'MIDDLE'
                            ? 'Middle Overs (Overs 7–15)'
                            : 'Death Overs (Overs 16–20)'}
                      </p>
                      {slot.bowlers.length === 0 ? (
                        <p className="mt-1 text-slate-500">No specialist bowlers available.</p>
                      ) : (
                        <div className="mt-1.5 space-y-1">
                          {slot.bowlers.map((b) => (
                            <div
                              key={b.playerId}
                              className="flex items-center justify-between text-slate-600 dark:text-slate-300"
                            >
                              <span>
                                {b.name} · {b.bowlingStyle}
                              </span>
                              <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                                {b.phaseRating}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ================= TAB 3: VALUE-FOR-MONEY & SCOUTING ================= */}
      {tab === 'value' && selectedEval && (
        <section className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            {rankings.map((r) => (
              <button
                key={r.franchiseCode}
                type="button"
                onClick={() => setSelectedCode(r.franchiseCode)}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 ${
                  selectedEval.franchiseCode === r.franchiseCode
                    ? 'border-amber-600 bg-amber-50 text-slate-900 dark:border-amber-500 dark:bg-amber-500/15 dark:text-white'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                }`}
              >
                <FranchiseBadge code={r.franchiseCode} size="xs" />
                <span>{r.franchiseCode}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Best Purchases */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="flex items-center gap-2 font-display text-xl font-bold text-emerald-700 dark:text-emerald-400">
                <TrendingUp className="h-4 w-4" />
                <span>Best Value Purchases</span>
              </h3>
              {selectedEval.bestPurchases.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500">No below-market steals recorded.</p>
              ) : (
                <div className="mt-3 space-y-2.5 text-xs">
                  {selectedEval.bestPurchases.map((v) => (
                    <div
                      key={v.playerId}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                        <span>{v.playerName}</span>
                        <span className="text-emerald-700 dark:text-emerald-400">{v.label}</span>
                      </div>
                      <p className="mt-1 font-mono-num text-slate-600 dark:text-slate-400">
                        Paid {formatCurrency(v.paidLakhs)} vs Fair {formatCurrency(v.fairValueLakhs)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Worst Purchases */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="flex items-center gap-2 font-display text-xl font-bold text-red-700 dark:text-red-400">
                <TrendingDown className="h-4 w-4" />
                <span>Biggest Overpays</span>
              </h3>
              {selectedEval.worstPurchases.length === 0 ? (
                <p className="mt-3 text-xs text-slate-500">
                  No overpriced buys — disciplined bidding across every lot.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5 text-xs">
                  {selectedEval.worstPurchases.map((v) => (
                    <div
                      key={v.playerId}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60"
                    >
                      <div className="flex items-center justify-between font-bold text-slate-900 dark:text-white">
                        <span>{v.playerName}</span>
                        <span className="text-red-600 dark:text-red-400">{v.label}</span>
                      </div>
                      <p className="mt-1 font-mono-num text-slate-600 dark:text-slate-400">
                        Paid {formatCurrency(v.paidLakhs)} vs Fair {formatCurrency(v.fairValueLakhs)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Strengths, Weaknesses & Missing Roles */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                Squad Strengths &amp; Gaps
              </h3>
              <div className="mt-3 space-y-3 text-xs">
                <div>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">Strengths</p>
                  {selectedEval.strengths.length === 0 ? (
                    <p className="mt-1 text-slate-500">None highlighted yet.</p>
                  ) : (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700 dark:text-slate-300">
                      {selectedEval.strengths.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">
                    Weaknesses &amp; Missing Roles
                  </p>
                  {selectedEval.weaknesses.length === 0 &&
                  selectedEval.missingRoles.length === 0 ? (
                    <p className="mt-1 flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>Well-balanced squad with no critical gaps.</span>
                    </p>
                  ) : (
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-700 dark:text-slate-300">
                      {selectedEval.missingRoles.map((r) => (
                        <li key={r}>Missing role: {r}</li>
                      ))}
                      {selectedEval.weaknesses.map((w) => (
                        <li key={w}>{w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Complete Value-for-Money Ledger */}
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full min-w-[600px] text-left text-xs sm:text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
                <tr>
                  <th className="px-4 py-3">Player</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3 text-right">Paid</th>
                  <th className="px-4 py-3 text-right">Fair Value</th>
                  <th className="px-4 py-3 text-right">Value Ratio</th>
                  <th className="px-4 py-3 text-right">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedEval.allValueVerdicts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      No purchases recorded for this franchise.
                    </td>
                  </tr>
                ) : (
                  selectedEval.allValueVerdicts.map((v) => (
                    <tr key={v.playerId}>
                      <td className="px-4 py-2.5 font-semibold text-slate-900 dark:text-white">
                        {v.playerName}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{v.role}</td>
                      <td className="px-4 py-2.5 text-right font-mono-num">
                        {formatCurrency(v.paidLakhs)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-num text-slate-600 dark:text-slate-400">
                        {formatCurrency(v.fairValueLakhs)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono-num font-bold">
                        {v.valueRatio.toFixed(2)}x
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold">
                        <span
                          className={
                            v.label === 'Steal' || v.label === 'Good Value'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : v.label === 'Fair Price'
                                ? 'text-slate-700 dark:text-slate-300'
                                : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {v.label}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ================= TAB 4: HEAD-TO-HEAD TEAM COMPARISON ================= */}
      {tab === 'compare' && comparison && teamAEval && teamBEval && (
        <section className="mt-6 space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <label
                htmlFor="cmp-team-a"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Franchise A
              </label>
              <select
                id="cmp-team-a"
                value={teamAEval.franchiseCode}
                onChange={(e) => setCompareA(e.target.value as FranchiseCode)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {rankings.map((r) => (
                  <option key={r.franchiseCode} value={r.franchiseCode}>
                    #{r.rank} {r.franchiseName} ({r.squadQualityScore.toFixed(1)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="cmp-team-b"
                className="block text-xs font-medium text-slate-500 dark:text-slate-400"
              >
                Franchise B
              </label>
              <select
                id="cmp-team-b"
                value={teamBEval.franchiseCode}
                onChange={(e) => setCompareB(e.target.value as FranchiseCode)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {rankings.map((r) => (
                  <option key={r.franchiseCode} value={r.franchiseCode}>
                    #{r.rank} {r.franchiseName} ({r.squadQualityScore.toFixed(1)})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <FranchiseBadge code={teamAEval.franchiseCode} size="md" />
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">
                    {teamAEval.franchiseName}
                  </p>
                  <p className="text-xs text-slate-500">
                    Category Wins: <strong className="font-mono-num">{comparison.aWins}</strong>
                  </p>
                </div>
              </div>

              <div className="text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                {comparison.overallEdge === 'TIE'
                  ? 'Even Matchup'
                  : `Edge: ${FRANCHISE_MAP[comparison.overallEdge].name}`}
              </div>

              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-bold text-slate-900 dark:text-white">
                    {teamBEval.franchiseName}
                  </p>
                  <p className="text-xs text-slate-500">
                    Category Wins: <strong className="font-mono-num">{comparison.bWins}</strong>
                  </p>
                </div>
                <FranchiseBadge code={teamBEval.franchiseCode} size="md" />
              </div>
            </div>

            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {comparison.metrics.map((row) => (
                <div
                  key={row.label}
                  className="grid grid-cols-12 items-center gap-2 py-2.5 text-xs sm:text-sm"
                >
                  <div
                    className={`col-span-3 font-mono-num font-bold ${
                      row.winner === 'A'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {row.teamAValue.toFixed(1)}
                  </div>
                  <div className="col-span-6 text-center text-xs font-medium text-slate-700 dark:text-slate-300">
                    {row.label}
                  </div>
                  <div
                    className={`col-span-3 text-right font-mono-num font-bold ${
                      row.winner === 'B'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {row.teamBValue.toFixed(1)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ================= TAB 5: GEMINI AI ANALYST ================= */}
      {tab === 'analyst' && (
        <section className="mt-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div>
              <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-slate-900 dark:text-white">
                <BarChart3 className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <span>AI Auction Broadcast Analyst</span>
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Explains the locked deterministic rankings and tactical metrics from snapshot{' '}
                <span className="font-mono-num">{roomState.statsSnapshotVersion}</span> without
                altering any calculated score.
              </p>
            </div>

            <button
              type="button"
              disabled={aiLoading}
              onClick={handleGenerateAiAnalyst}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-60 whitespace-nowrap shrink-0 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
            >
              <RefreshCw className={`h-4 w-4 ${aiLoading ? 'animate-spin' : ''}`} />
              <span>
                {aiLoading
                  ? 'Generating Report...'
                  : aiReport
                    ? 'Regenerate Analysis'
                    : 'Generate Analyst Breakdown'}
              </span>
            </button>
          </div>

          {aiError && (
            <div
              role="alert"
              className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {aiError}
            </div>
          )}

          {aiLoading && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="h-6 w-2/5 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-5/6 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="grid grid-cols-1 gap-3 pt-2 md:grid-cols-2">
                <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/70" />
                <div className="h-24 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800/70" />
              </div>
            </div>
          )}

          {aiReport && !aiLoading && (
            <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div>
                <h3 className="font-display text-2xl font-extrabold text-slate-900 dark:text-white">
                  {aiReport.headline}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
                  {aiReport.summary}
                </p>
              </div>

              {aiReport.keyTakeaways.length > 0 && (
                <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Key Auction Takeaways
                  </h4>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700 dark:text-slate-300">
                    {aiReport.keyTakeaways.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid grid-cols-1 gap-4 border-t border-slate-100 pt-4 md:grid-cols-2 dark:border-slate-800">
                {aiReport.teamInsights.map((insight) => {
                  const ev = rankings.find((r) => r.franchiseCode === insight.franchiseCode);
                  return (
                    <div
                      key={insight.franchiseCode}
                      className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <FranchiseBadge code={insight.franchiseCode} size="sm" />
                          <span className="font-bold text-slate-900 dark:text-white">
                            {FRANCHISE_MAP[insight.franchiseCode]?.name ?? insight.franchiseCode}
                          </span>
                        </div>
                        {ev && (
                          <span className="font-mono-num text-xs font-bold text-amber-700 dark:text-amber-400">
                            #{ev.rank} · {ev.squadQualityScore.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {insight.verdict}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {insight.tacticalNote}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
