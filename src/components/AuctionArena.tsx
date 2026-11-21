import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  FastForward,
  Flag,
  Gavel,
  Globe,
  ListOrdered,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  Users,
} from 'lucide-react';
import {
  FranchiseCode,
  Participant,
  RoomState,
} from '../shared/types';
import { FRANCHISE_MAP } from '../shared/franchises';
import { PLAYER_MAP } from '../shared/players';
import {
  computeSquadFeasibility,
  formatCurrency,
  formatCurrencyCompact,
  validateBid,
} from '../engine/bidding';
import { FranchiseBadge } from './FranchiseBadge';
import { ConfirmDialog } from './ConfirmDialog';

const PODIUM_BG = '/src/assets/images/auction_podium_bg_1795275104162.jpg';

type SideTab = 'activity' | 'franchises' | 'squad' | 'pool' | 'analyst';

interface AuctionArenaProps {
  roomState: RoomState;
  me: Participant | null;
  onPlaceBid: (proposedBidLakhs?: number) => void;
  onPause: () => void;
  onResume: () => void;
  onFinalizeLot: () => void;
  onNominate: (playerId: string) => void;
  onReopenUnsold: (playerIds: string[]) => void;
  onReorderQueue: (playerIds: string[]) => void;
  onStartSecondRound: () => void;
  onCompleteAuction: () => void;
}

export function AuctionArena({
  roomState,
  me,
  onPlaceBid,
  onPause,
  onResume,
  onFinalizeLot,
  onNominate,
  onReopenUnsold,
  onReorderQueue,
  onStartSecondRound,
  onCompleteAuction,
}: AuctionArenaProps) {
  const [activeTab, setActiveTab] = useState<SideTab>('activity');
  const [poolFilter, setPoolFilter] = useState<'upcoming' | 'unsold' | 'sold'>('upcoming');
  const [poolSearch, setPoolSearch] = useState('');
  const [selectedUnsoldIds, setSelectedUnsoldIds] = useState<string[]>([]);
  const [confirmAction, setConfirmAction] = useState<
    null | 'complete' | 'second_round' | 'finalize'
  >(null);
  const [podiumImgError, setPodiumImgError] = useState(false);

  const isAdmin = me?.role === 'admin';
  const isSpectator = me?.role === 'spectator';
  const myTeam = me?.franchiseCode ? roomState.teams[me.franchiseCode] : null;
  const currentPlayer = roomState.currentPlayerId
    ? PLAYER_MAP[roomState.currentPlayerId]
    : null;

  const bidCheck = useMemo(
    () =>
      validateBid({
        stage: roomState.stage,
        participant: me,
        team: myTeam,
        player: currentPlayer,
        soldPlayerIds: roomState.soldPlayerIds,
        currentBidLakhs: roomState.currentBidLakhs,
        highestBidderFranchise: roomState.highestBidderFranchise,
        settings: roomState.settings,
      }),
    [roomState, me, myTeam, currentPlayer],
  );

  const myFeasibility = useMemo(
    () => (myTeam ? computeSquadFeasibility(myTeam, roomState.settings, true) : null),
    [myTeam, roomState.settings],
  );

  // Keyboard shortcut: press B to place bid when not typing in an input
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'b' && bidCheck.allowed) {
        e.preventDefault();
        onPlaceBid(bidCheck.requiredBidLakhs);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [bidCheck.allowed, bidCheck.requiredBidLakhs, onPlaceBid]);

  const countdownSec = Math.max(0, roomState.countdownRemainingMs / 1000);
  const countdownRatio =
    roomState.countdownTotalMs > 0
      ? Math.max(0, Math.min(1, roomState.countdownRemainingMs / roomState.countdownTotalMs))
      : 0;
  const isUrgent =
    (roomState.stage === 'LIVE' || roomState.stage === 'ACCELERATED') &&
    countdownSec <= 2.2 &&
    countdownSec > 0;

  const activeFranchises = Object.values(roomState.teams).filter(
    (t) => t.controllerType !== 'inactive',
  );

  const totalLots =
    roomState.soldPlayerIds.length +
    roomState.unsoldPlayerIds.length +
    roomState.queuePlayerIds.length +
    (currentPlayer ? 1 : 0);

  const filteredPoolIds = useMemo(() => {
    const source =
      poolFilter === 'upcoming'
        ? roomState.queuePlayerIds
        : poolFilter === 'unsold'
          ? roomState.unsoldPlayerIds
          : roomState.soldPlayerIds;
    const q = poolSearch.trim().toLowerCase();
    if (!q) return source;
    return source.filter((id) => {
      const p = PLAYER_MAP[id];
      if (!p) return false;
      return (
        p.name.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.setCategory.toLowerCase().includes(q)
      );
    });
  }, [poolFilter, poolSearch, roomState.queuePlayerIds, roomState.unsoldPlayerIds, roomState.soldPlayerIds]);

  const toggleUnsoldSelect = (id: string) => {
    setSelectedUnsoldIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const recentResolutionVisible =
    roomState.lastResolution && Date.now() - roomState.lastResolution.timestamp < 4500;

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-4 sm:px-6 lg:py-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* ================= PRIMARY AUCTION FLOOR (8 COLS) ================= */}
        <section className="lg:col-span-8 flex flex-col gap-5">
          {/* Compact Top Status Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-900 dark:text-white">
                {roomState.stage === 'PAUSED'
                  ? 'Paused'
                  : roomState.stage === 'ACCELERATED'
                    ? 'Accelerated Round 2'
                    : roomState.stage === 'ROUND_BREAK'
                      ? 'Round Break'
                      : 'Round 1 Live'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-num">
                Sold {roomState.soldPlayerIds.length} / Unsold {roomState.unsoldPlayerIds.length} / Queue {roomState.queuePlayerIds.length}
              </span>
              <span aria-hidden="true">·</span>
              <span>Pool {totalLots}</span>
            </div>

            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                {roomState.stage === 'PAUSED' ? (
                  <button
                    type="button"
                    onClick={onResume}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                  >
                    <Play className="h-3.5 w-3.5" />
                    <span>Resume ({countdownSec.toFixed(1)}s)</span>
                  </button>
                ) : (roomState.stage === 'LIVE' || roomState.stage === 'ACCELERATED') &&
                  currentPlayer ? (
                  <>
                    <button
                      type="button"
                      onClick={onPause}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Pause className="h-3.5 w-3.5" />
                      <span>Pause</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmAction('finalize')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                    >
                      <Gavel className="h-3.5 w-3.5" />
                      <span>{roomState.highestBidderFranchise ? 'Hammer Sold' : 'Mark Unsold'}</span>
                    </button>
                  </>
                ) : null}

                {roomState.unsoldPlayerIds.length > 0 && roomState.stage === 'ROUND_BREAK' && (
                  <button
                    type="button"
                    onClick={() => setConfirmAction('second_round')}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 whitespace-nowrap shrink-0 dark:bg-amber-500 dark:text-slate-950"
                  >
                    <FastForward className="h-3.5 w-3.5" />
                    <span>Start Round 2 ({roomState.unsoldPlayerIds.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setConfirmAction('complete')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 whitespace-nowrap shrink-0 dark:border-red-900/70 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950"
                >
                  <Flag className="h-3.5 w-3.5" />
                  <span>Complete Auction</span>
                </button>
              </div>
            )}
          </div>

          {/* MAIN AUCTION PODIUM STAGE */}
          {currentPlayer ? (
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              {/* Subtle studio backdrop in dark mode */}
              {!podiumImgError && (
                <img
                  src={PODIUM_BG}
                  alt=""
                  aria-hidden="true"
                  referrerPolicy="no-referrer"
                  onError={() => setPodiumImgError(true)}
                  className="pointer-events-none absolute inset-0 hidden h-full w-full object-cover opacity-28 dark:block"
                />
              )}

              {/* Authoritative Countdown Progress Bar across top edge */}
              <div className="relative h-1.5 w-full bg-slate-200 dark:bg-slate-800">
                <div
                  className={`h-full transition-transform duration-150 ease-linear origin-left ${
                    roomState.stage === 'PAUSED'
                      ? 'bg-slate-500'
                      : isUrgent
                        ? 'bg-red-600 dark:bg-red-500'
                        : 'bg-amber-500'
                  }`}
                  style={{ transform: `scaleX(${countdownRatio})` }}
                />
              </div>

              <div className="relative p-5 sm:p-7">
                {/* Recent SOLD / UNSOLD Banner */}
                {recentResolutionVisible && roomState.lastResolution && (
                  <div
                    key={roomState.lastResolution.id}
                    className={`mb-5 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-xs font-semibold animate-bid-pop ${
                      roomState.lastResolution.status === 'SOLD'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                        : 'border-slate-300 bg-slate-100 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    <span>
                      Last Lot:{' '}
                      <strong>{roomState.lastResolution.playerName}</strong>{' '}
                      {roomState.lastResolution.status === 'SOLD'
                        ? `SOLD to ${roomState.lastResolution.franchiseCode} for ${formatCurrency(roomState.lastResolution.amountLakhs ?? 0)}`
                        : 'went UNSOLD'}
                    </span>
                    <span className="font-mono-num uppercase tracking-wider">
                      {roomState.lastResolution.status}
                    </span>
                  </div>
                )}

                {/* Player Header + Countdown Clock */}
                <div className="grid grid-cols-1 gap-6 md:grid-cols-12 md:items-start">
                  {/* Player Profile */}
                  <div className="md:col-span-8">
                    <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                      <span className="font-semibold text-amber-700 dark:text-amber-400">
                        {currentPlayer.setCategory}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {currentPlayer.role === 'BAT'
                          ? 'Batter'
                          : currentPlayer.role === 'WK'
                            ? 'Wicketkeeper'
                            : currentPlayer.role === 'AR'
                              ? 'All-Rounder'
                              : 'Bowler'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="inline-flex items-center gap-1">
                        {currentPlayer.isOverseas && <Globe className="h-3.5 w-3.5 text-sky-600 dark:text-sky-400" />}
                        <span>
                          {currentPlayer.country}
                          {currentPlayer.isOverseas ? ' (Overseas)' : ' (Domestic)'}
                        </span>
                      </span>
                    </div>

                    <h2
                      data-testid="active-player-name"
                      className="mt-1.5 font-display text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl dark:text-white"
                    >
                      {currentPlayer.name}
                    </h2>

                    <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300">
                      {currentPlayer.battingHand} · {currentPlayer.battingPosition.toLowerCase()} batter
                      {currentPlayer.bowlingStyle !== 'NONE'
                        ? ` · ${currentPlayer.bowlingSubType}`
                        : ''}
                      {currentPlayer.bowlingPhases.length > 0
                        ? ` (${currentPlayer.bowlingPhases.join(' / ')})`
                        : ''}
                      {' · '}Age {currentPlayer.age}
                    </p>

                    {/* Deterministic Career Stats Strip */}
                    <div className="mt-5 grid grid-cols-3 gap-4 border-y border-slate-200 py-3.5 sm:grid-cols-6 dark:border-slate-800">
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Matches</p>
                        <p className="mt-0.5 font-mono-num text-base font-bold text-slate-900 dark:text-white">
                          {currentPlayer.stats.matches}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Runs</p>
                        <p className="mt-0.5 font-mono-num text-base font-bold text-slate-900 dark:text-white">
                          {currentPlayer.stats.runs}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Bat SR</p>
                        <p className="mt-0.5 font-mono-num text-base font-bold text-slate-900 dark:text-white">
                          {currentPlayer.stats.strikeRate.toFixed(1)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Wickets</p>
                        <p className="mt-0.5 font-mono-num text-base font-bold text-slate-900 dark:text-white">
                          {currentPlayer.stats.wickets}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Econ</p>
                        <p className="mt-0.5 font-mono-num text-base font-bold text-slate-900 dark:text-white">
                          {currentPlayer.stats.economy > 0
                            ? currentPlayer.stats.economy.toFixed(2)
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">Base Price</p>
                        <p className="mt-0.5 font-mono-num text-base font-bold text-amber-700 dark:text-amber-400">
                          {formatCurrencyCompact(currentPlayer.basePriceLakhs)}
                        </p>
                      </div>
                    </div>

                    {currentPlayer.stats.missingFields.length > 0 && (
                      <p className="mt-2.5 flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          Partial sample ({Math.round(currentPlayer.stats.dataCompleteness * 100)}%):{' '}
                          {currentPlayer.stats.missingFields.join(' · ')}
                        </span>
                      </p>
                    )}
                  </div>

                  {/* Authoritative Countdown Display */}
                  <div className="md:col-span-4 flex flex-col items-start md:items-end justify-between">
                    <div
                      className={`flex w-full md:w-44 flex-col items-center justify-center rounded-xl border p-4 ${
                        roomState.stage === 'PAUSED'
                          ? 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-800/80'
                          : isUrgent
                            ? 'border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950/50'
                            : 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950/70'
                      }`}
                    >
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {roomState.stage === 'PAUSED' ? 'Clock Paused' : 'Hammer Clock'}
                      </span>
                      <span
                        data-testid="countdown-clock"
                        className={`mt-1 font-mono-num text-4xl font-extrabold tracking-tight ${
                          roomState.stage === 'PAUSED'
                            ? 'text-slate-600 dark:text-slate-300'
                            : isUrgent
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {countdownSec.toFixed(1)}s
                      </span>
                      <span className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        Resets to {roomState.settings.countdownSeconds}s on bid
                      </span>
                    </div>
                  </div>
                </div>

                {/* CURRENT BID & HIGHEST BIDDER BLOCK */}
                <div className="mt-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 sm:items-center sm:p-5 dark:border-slate-800 dark:bg-slate-950/80">
                  <div>
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {roomState.highestBidderFranchise ? 'Current Highest Bid' : 'Opening Base Price'}
                    </p>
                    <p
                      key={roomState.currentBidLakhs}
                      data-testid="current-bid-amount"
                      className="mt-1 font-mono-num text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl animate-bid-pop dark:text-white"
                    >
                      {formatCurrency(roomState.currentBidLakhs)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3.5 sm:justify-end">
                    {roomState.highestBidderFranchise ? (
                      <>
                        <FranchiseBadge code={roomState.highestBidderFranchise} size="md" />
                        <div className="min-w-0">
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Highest Bidder
                          </p>
                          <p
                            data-testid="highest-bidder-name"
                            className="truncate text-base font-bold text-slate-900 dark:text-white"
                          >
                            {FRANCHISE_MAP[roomState.highestBidderFranchise].name}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {roomState.highestBidderName}
                          </p>
                        </div>
                      </>
                    ) : (
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Awaiting Opening Bid
                        </p>
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                          No bids placed yet
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* LARGE BIDDING CONTROLS & PRE-BID PURSE READOUT */}
                <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  {isSpectator ? (
                    <div className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3.5 text-sm font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                      <ShieldAlert className="h-5 w-5 text-slate-500 shrink-0" />
                      <span>Spectator Mode — Live viewing enabled. Bidding controls are disabled.</span>
                    </div>
                  ) : myTeam && myFeasibility ? (
                    <>
                      <button
                        type="button"
                        data-testid="place-bid-btn"
                        disabled={!bidCheck.allowed}
                        onClick={() => onPlaceBid(bidCheck.requiredBidLakhs)}
                        className="flex min-h-[56px] flex-1 items-center justify-center gap-3 rounded-xl bg-amber-600 px-6 py-3.5 text-lg font-extrabold text-white shadow-sm transition-transform active:scale-[0.99] hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                      >
                        <Gavel className="h-5 w-5 shrink-0" />
                        <span className="whitespace-nowrap">
                          {bidCheck.allowed
                            ? `Bid ${formatCurrency(bidCheck.requiredBidLakhs)}`
                            : bidCheck.code === 'ALREADY_HIGHEST_BIDDER'
                              ? 'Holding Highest Bid'
                              : `Cannot Bid (${formatCurrencyCompact(bidCheck.requiredBidLakhs)})`}
                        </span>
                      </button>

                      {/* Pre-bid budget verification readout */}
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-950/70">
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Available Purse</p>
                          <p className="font-mono-num text-sm font-bold text-slate-900 dark:text-white">
                            {formatCurrency(myFeasibility.availablePurseLakhs)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Min Reserve</p>
                          <p className="font-mono-num text-sm font-bold text-slate-700 dark:text-slate-300">
                            {formatCurrency(myFeasibility.minimumReserveLakhs)}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-500 dark:text-slate-400">Max Next Bid</p>
                          <p className="font-mono-num text-sm font-bold text-emerald-700 dark:text-emerald-400">
                            {formatCurrency(myFeasibility.maxAffordableBidLakhs)}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="w-full rounded-xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm text-slate-700 dark:border-slate-800 dark:bg-slate-800/60 dark:text-slate-300">
                      You are observing as Admin without an active franchise claim.
                    </div>
                  )}
                </div>

                {/* Explicit Bid Block Feedback */}
                {!isSpectator && myTeam && !bidCheck.allowed && bidCheck.reason && (
                  <p
                    role="status"
                    className={`mt-2.5 text-xs font-medium ${
                      bidCheck.code === 'ALREADY_HIGHEST_BIDDER'
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {bidCheck.reason}
                  </p>
                )}

                {bidCheck.allowed && (
                  <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                    Press <kbd className="font-mono-num font-semibold">B</kbd> for quick bid ·
                    Squad {myFeasibility?.currentSquadSize}/{roomState.settings.maxSquadSize} ·
                    Overseas {myFeasibility?.overseasCount}/{roomState.settings.maxOverseas}
                  </p>
                )}
              </div>
            </div>
          ) : (
            /* ROUND BREAK / EMPTY PODIUM STATE */
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
              <Gavel className="mx-auto h-10 w-10 text-amber-600 dark:text-amber-400" />
              <h2 className="mt-3 font-display text-3xl font-bold text-slate-900 dark:text-white">
                {roomState.roundNumber === 1 ? 'Round 1 Complete' : 'Queue Cleared'}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400">
                {roomState.unsoldPlayerIds.length > 0
                  ? `${roomState.unsoldPlayerIds.length} unsold players are waiting. Admin can start the Accelerated Second Round, reopen specific unsold players, or complete the auction for final AI evaluation.`
                  : 'All players have been processed. Admin can complete the auction to generate the final leaderboard and Playing XI analysis.'}
              </p>

              {isAdmin && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {roomState.unsoldPlayerIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setConfirmAction('second_round')}
                      className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950"
                    >
                      <FastForward className="h-4 w-4" />
                      <span>Start Accelerated Round 2</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setConfirmAction('complete')}
                    className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-800 dark:bg-white dark:text-slate-950"
                  >
                    <Flag className="h-4 w-4" />
                    <span>Complete Auction &amp; Evaluate</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Compact Live Purse Ticker Strip of Active Franchises */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Active Franchise Purses
              </span>
              <span>
                {roomState.participants.filter((p) => p.connected).length} online
              </span>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
              {activeFranchises.map((t) => {
                const avail = Math.max(0, t.purseTotalLakhs - t.purseSpentLakhs);
                const isHighest = roomState.highestBidderFranchise === t.franchiseCode;
                const isMine = me?.franchiseCode === t.franchiseCode;
                return (
                  <div
                    key={t.franchiseCode}
                    className={`flex items-center gap-2.5 rounded-lg border px-2.5 py-2 transition-colors ${
                      isHighest
                        ? 'border-amber-500 bg-amber-50/70 dark:bg-amber-500/15'
                        : isMine
                          ? 'border-slate-400 bg-slate-50 dark:border-slate-600 dark:bg-slate-800/70'
                          : 'border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/50'
                    }`}
                  >
                    <FranchiseBadge code={t.franchiseCode} size="xs" />
                    <div className="min-w-0">
                      <p className="font-mono-num text-xs font-bold text-slate-900 dark:text-white truncate">
                        {formatCurrencyCompact(avail)}
                      </p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {t.roster.length}/{roomState.settings.maxSquadSize} ·{' '}
                        {t.controllerType === 'ai' ? 'AI' : t.ownerName}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ================= RIGHT COMPANION RAIL (4 COLS) ================= */}
        <aside className="lg:col-span-4 flex flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 overflow-hidden">
          {/* Segmented Tab Bar */}
          <div
            role="tablist"
            aria-label="Auction room panels"
            className="grid grid-cols-5 border-b border-slate-200 bg-slate-50 p-1 text-xs font-semibold dark:border-slate-800 dark:bg-slate-950"
          >
            {(
              [
                ['activity', 'Bids', Activity],
                ['squad', 'Squad', CheckCircle2],
                ['franchises', 'Teams', Users],
                ['pool', 'Pool', ListOrdered],
                ['analyst', 'Live AI', BarChart3],
              ] as [SideTab, string, typeof Activity][]
            ).map(([id, label, Icon]) => {
              const selected = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setActiveTab(id)}
                  className={`flex flex-col items-center justify-center gap-0.5 rounded-lg py-2 transition-colors whitespace-nowrap ${
                    selected
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-amber-400'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span className="text-[11px]">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Body */}
          <div className="flex-1 overflow-y-auto p-4 max-h-[640px]">
            {/* TAB 1: BID HISTORY & ROOM ACTIVITY */}
            {activeTab === 'activity' && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Current Lot Bids ({roomState.bidHistory.length})
                  </h3>
                  {roomState.bidHistory.length === 0 ? (
                    <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                      No bids yet for this player.
                    </p>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      {roomState.bidHistory.slice(0, 8).map((b, idx) => (
                        <div
                          key={b.id}
                          className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs ${
                            idx === 0
                              ? 'bg-amber-50 font-semibold text-slate-900 dark:bg-amber-500/15 dark:text-white'
                              : 'bg-slate-50 text-slate-700 dark:bg-slate-950/60 dark:text-slate-300'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FranchiseBadge code={b.franchiseCode} size="xs" />
                            <span className="truncate">{b.bidderName}</span>
                          </div>
                          <span className="font-mono-num font-bold whitespace-nowrap">
                            {formatCurrency(b.amountLakhs)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-100 pt-4 dark:border-slate-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Auction Log
                  </h3>
                  <div className="mt-2 space-y-2">
                    {roomState.events.slice(0, 25).map((evt) => (
                      <div
                        key={evt.id}
                        className="text-xs leading-relaxed text-slate-600 dark:text-slate-300"
                      >
                        <span className="font-mono-num text-[10px] text-slate-400 mr-1.5">
                          {new Date(evt.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </span>
                        <span
                          className={
                            evt.type === 'SOLD'
                              ? 'font-semibold text-emerald-700 dark:text-emerald-400'
                              : evt.type === 'UNSOLD'
                                ? 'text-slate-500 dark:text-slate-400'
                                : ''
                          }
                        >
                          {evt.message}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: MY SQUAD & FEASIBILITY */}
            {activeTab === 'squad' && (
              <div>
                {myTeam && myFeasibility ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <FranchiseBadge code={myTeam.franchiseCode} size="md" />
                      <div>
                        <p className="font-bold text-slate-900 dark:text-white">
                          {FRANCHISE_MAP[myTeam.franchiseCode].name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Squad Completion {myFeasibility.squadCompletionPct}% ·{' '}
                          {myFeasibility.currentSquadSize}/{roomState.settings.maxSquadSize} Players
                        </p>
                      </div>
                    </div>

                    {/* Completion bar */}
                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                      <div
                        className="h-full bg-amber-500 transition-transform origin-left"
                        style={{
                          transform: `scaleX(${myFeasibility.squadCompletionPct / 100})`,
                        }}
                      />
                    </div>

                    {/* Feasibility Breakdown Grid */}
                    <div className="grid grid-cols-2 gap-2.5 text-xs">
                      <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                        <p className="text-slate-500 dark:text-slate-400">Total Purse</p>
                        <p className="mt-0.5 font-mono-num font-bold text-slate-900 dark:text-white">
                          {formatCurrency(myFeasibility.totalPurseLakhs)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                        <p className="text-slate-500 dark:text-slate-400">Spent Purse</p>
                        <p className="mt-0.5 font-mono-num font-bold text-slate-900 dark:text-white">
                          {formatCurrency(myFeasibility.spentPurseLakhs)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                        <p className="text-slate-500 dark:text-slate-400">Available Purse</p>
                        <p className="mt-0.5 font-mono-num font-bold text-emerald-700 dark:text-emerald-400">
                          {formatCurrency(myFeasibility.availablePurseLakhs)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                        <p className="text-slate-500 dark:text-slate-400">Min Reserve</p>
                        <p className="mt-0.5 font-mono-num font-bold text-amber-700 dark:text-amber-400">
                          {formatCurrency(myFeasibility.minimumReserveLakhs)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                        <p className="text-slate-500 dark:text-slate-400">Max Next Bid</p>
                        <p className="mt-0.5 font-mono-num font-bold text-slate-900 dark:text-white">
                          {formatCurrency(myFeasibility.maxAffordableBidLakhs)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
                        <p className="text-slate-500 dark:text-slate-400">Overseas Slots</p>
                        <p className="mt-0.5 font-mono-num font-bold text-slate-900 dark:text-white">
                          {myFeasibility.overseasCount} / {roomState.settings.maxOverseas}
                        </p>
                      </div>
                    </div>

                    {/* Missing Roles */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-950/60">
                      <p className="font-semibold text-slate-700 dark:text-slate-300">
                        Missing Roles
                      </p>
                      <p className="mt-1 text-slate-600 dark:text-slate-400">
                        {myFeasibility.missingRoles.length === 0
                          ? 'All core cricket roles covered.'
                          : myFeasibility.missingRoles.join(' · ')}
                      </p>
                    </div>

                    {/* Roster */}
                    <div>
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Acquired Players ({myTeam.roster.length})
                      </p>
                      {myTeam.roster.length === 0 ? (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          No players bought yet. Win your first bid to start building your XI.
                        </p>
                      ) : (
                        <div className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
                          {myTeam.roster.map((rec) => (
                            <div
                              key={rec.player.id}
                              className="flex items-center justify-between py-2 text-xs"
                            >
                              <div className="min-w-0">
                                <p className="truncate font-semibold text-slate-900 dark:text-white">
                                  {rec.player.name}
                                </p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                  {rec.player.role} · {rec.player.battingHand}
                                  {rec.player.isOverseas ? ' · Overseas' : ''}
                                </p>
                              </div>
                              <span className="font-mono-num font-bold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                                {formatCurrencyCompact(rec.soldPriceLakhs)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No franchise assigned to your account. Switch to Teams to inspect all franchises.
                  </p>
                )}
              </div>
            )}

            {/* TAB 3: ALL FRANCHISES & PARTICIPANTS */}
            {activeTab === 'franchises' && (
              <div className="space-y-3">
                {activeFranchises.map((t) => {
                  const feas = computeSquadFeasibility(t, roomState.settings, true);
                  const liveEv = roomState.evaluation?.rankings.find(
                    (r) => r.franchiseCode === t.franchiseCode,
                  );
                  return (
                    <div
                      key={t.franchiseCode}
                      className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FranchiseBadge code={t.franchiseCode} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-900 dark:text-white">
                              {FRANCHISE_MAP[t.franchiseCode].name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {t.controllerType === 'ai' ? 'AI Manager' : t.ownerName}
                            </p>
                          </div>
                        </div>
                        <div className="text-right font-mono-num">
                          <p className="font-bold text-slate-900 dark:text-white">
                            {formatCurrencyCompact(feas.availablePurseLakhs)}
                          </p>
                          <p className="text-[10px] text-slate-500">
                            Max Bid {formatCurrencyCompact(feas.maxAffordableBidLakhs)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-600 dark:border-slate-800 dark:text-slate-400">
                        <span>
                          Squad {feas.currentSquadSize}/{roomState.settings.maxSquadSize} · OS{' '}
                          {feas.overseasCount}/{roomState.settings.maxOverseas}
                        </span>
                        {liveEv && (
                          <span className="font-mono-num font-semibold text-amber-700 dark:text-amber-400">
                            Strength {liveEv.squadQualityScore.toFixed(1)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* TAB 4: PLAYER POOL, NOMINATION & UNSOLD REOPEN */}
            {activeTab === 'pool' && (
              <div className="space-y-3">
                <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold dark:bg-slate-950">
                  {(
                    [
                      ['upcoming', `Queue (${roomState.queuePlayerIds.length})`],
                      ['unsold', `Unsold (${roomState.unsoldPlayerIds.length})`],
                      ['sold', `Sold (${roomState.soldPlayerIds.length})`],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPoolFilter(key)}
                      className={`flex-1 rounded-md py-1.5 text-center transition-colors whitespace-nowrap ${
                        poolFilter === key
                          ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={poolSearch}
                    onChange={(e) => setPoolSearch(e.target.value)}
                    placeholder="Filter by player, role, or country..."
                    aria-label="Filter player pool"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-8 pr-3 text-xs text-slate-900 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                {isAdmin && poolFilter === 'unsold' && selectedUnsoldIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      onReopenUnsold(selectedUnsoldIds);
                      setSelectedUnsoldIds([]);
                    }}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700 dark:bg-amber-500 dark:text-slate-950"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Reopen Selected ({selectedUnsoldIds.length})</span>
                  </button>
                )}

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredPoolIds.length === 0 ? (
                    <p className="py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                      No players in this list.
                    </p>
                  ) : (
                    filteredPoolIds.slice(0, 40).map((id) => {
                      const p = PLAYER_MAP[id];
                      if (!p) return null;
                      const soldTeam =
                        poolFilter === 'sold'
                          ? Object.values(roomState.teams).find((t) =>
                              t.roster.some((r) => r.player.id === id),
                            )
                          : null;
                      const soldRec = soldTeam?.roster.find((r) => r.player.id === id);

                      return (
                        <div
                          key={id}
                          className="flex items-center justify-between gap-2 py-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {isAdmin && poolFilter === 'unsold' && (
                              <input
                                type="checkbox"
                                checked={selectedUnsoldIds.includes(id)}
                                onChange={() => toggleUnsoldSelect(id)}
                                aria-label={`Select ${p.name} to reopen`}
                                className="h-3.5 w-3.5 accent-amber-600"
                              />
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-slate-900 dark:text-white">
                                {p.name}
                              </p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {p.role} · {p.country} · Base {formatCurrencyCompact(p.basePriceLakhs)}
                              </p>
                            </div>
                          </div>

                          {poolFilter === 'sold' && soldTeam && soldRec ? (
                            <span className="font-mono-num text-[11px] font-bold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                              {soldTeam.franchiseCode} · {formatCurrencyCompact(soldRec.soldPriceLakhs)}
                            </span>
                          ) : isAdmin && poolFilter !== 'sold' ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              {poolFilter === 'upcoming' && roomState.queuePlayerIds[0] !== id && (
                                <button
                                  type="button"
                                  title={`Move ${p.name} next in queue`}
                                  aria-label={`Move ${p.name} next in queue`}
                                  onClick={() => {
                                    const nextOrder = [
                                      id,
                                      ...roomState.queuePlayerIds.filter((qId) => qId !== id),
                                    ];
                                    onReorderQueue(nextOrder);
                                  }}
                                  className="inline-flex h-6 w-6 items-center justify-center rounded border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => onNominate(id)}
                                className="rounded border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                              >
                                Nominate
                              </button>
                            </div>
                          ) : (
                            <span className="font-mono-num text-[11px] text-slate-500">
                              OVR {p.ratings.overall}
                            </span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* TAB 5: LIVE TEAM STRENGTH ESTIMATES */}
            {activeTab === 'analyst' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Deterministic live strength estimates updated after every lot (snapshot{' '}
                  <span className="font-mono-num">{roomState.statsSnapshotVersion}</span>).
                </p>

                {roomState.evaluation && roomState.evaluation.rankings.length > 0 ? (
                  roomState.evaluation.rankings.map((ev) => (
                    <div
                      key={ev.franchiseCode}
                      className="rounded-lg border border-slate-200 p-3 text-xs dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono-num font-bold text-slate-400">
                            #{ev.rank}
                          </span>
                          <FranchiseBadge code={ev.franchiseCode as FranchiseCode} size="xs" />
                          <span className="truncate font-bold text-slate-900 dark:text-white">
                            {ev.franchiseCode}
                          </span>
                        </div>
                        <span className="font-mono-num font-bold text-amber-700 dark:text-amber-400">
                          {ev.squadQualityScore.toFixed(1)} / 100
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                        <span>
                          XI {ev.playingXI.metrics.overallXIScore.toFixed(1)} · Eff{' '}
                          {ev.auctionEfficiencyScore.toFixed(0)}
                        </span>
                        <span>Confidence: {ev.confidenceLevel}</span>
                      </div>
                      {ev.missingRoles.length > 0 && (
                        <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                          Needs: {ev.missingRoles.slice(0, 3).join(', ')}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="py-6 text-center text-xs text-slate-500">
                    Strength rankings appear once bidding starts.
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Confirmation Dialogs for Critical Admin Actions */}
      <ConfirmDialog
        open={confirmAction === 'complete'}
        title="Complete Auction & Run Final Evaluation?"
        description="This ends bidding for all remaining players, locks all squads, and computes the final Playing XI rankings and team comparisons using the locked stats snapshot."
        confirmLabel="Complete Auction"
        danger
        onConfirm={() => {
          setConfirmAction(null);
          onCompleteAuction();
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'second_round'}
        title="Start Accelerated Second Round?"
        description={`Bring all ${roomState.unsoldPlayerIds.length} unsold players back to the auction podium for Round 2.`}
        confirmLabel="Start Round 2"
        onConfirm={() => {
          setConfirmAction(null);
          onStartSecondRound();
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === 'finalize'}
        title={
          roomState.highestBidderFranchise
            ? `Hammer SOLD to ${roomState.highestBidderFranchise}?`
            : 'Mark Current Player UNSOLD?'
        }
        description={
          roomState.highestBidderFranchise && currentPlayer
            ? `Lock ${currentPlayer.name} to ${FRANCHISE_MAP[roomState.highestBidderFranchise].name} for ${formatCurrency(roomState.currentBidLakhs)} and deduct the purse immediately.`
            : `Move ${currentPlayer?.name ?? 'this player'} to the unsold pool immediately.`
        }
        confirmLabel={roomState.highestBidderFranchise ? 'Confirm SOLD' : 'Confirm UNSOLD'}
        onConfirm={() => {
          setConfirmAction(null);
          onFinalizeLot();
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </main>
  );
}
