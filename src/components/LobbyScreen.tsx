import { useState } from 'react';
import {
  Bot,
  CheckCircle2,
  Circle,
  Play,
  Settings,
  Shield,
  Users,
  Wifi,
  WifiOff,
} from 'lucide-react';
import {
  AiDifficulty,
  AuctionOrderMode,
  AuctionSettings,
  FranchiseCode,
  Participant,
  RoomState,
  UnclaimedTeamPolicy,
} from '../shared/types';
import { FRANCHISES } from '../shared/franchises';
import { formatCurrency } from '../engine/bidding';
import { FranchiseBadge } from './FranchiseBadge';
import { ConfirmDialog } from './ConfirmDialog';

interface LobbyScreenProps {
  roomState: RoomState;
  me: Participant | null;
  onUpdateSettings: (patch: Partial<AuctionSettings>) => void;
  onClaimFranchise: (code: FranchiseCode) => void;
  onReleaseFranchise: () => void;
  onToggleReady: () => void;
  onStartAuction: () => void;
}

export function LobbyScreen({
  roomState,
  me,
  onUpdateSettings,
  onClaimFranchise,
  onReleaseFranchise,
  onToggleReady,
  onStartAuction,
}: LobbyScreenProps) {
  const [confirmStartOpen, setConfirmStartOpen] = useState(false);

  const isAdmin = me?.role === 'admin';
  const isSpectator = me?.role === 'spectator';
  const { settings, teams, participants } = roomState;

  const activeTeams = Object.values(teams).filter((t) => t.controllerType !== 'inactive');
  const humanTeams = activeTeams.filter((t) => t.controllerType === 'human');
  const aiTeams = activeTeams.filter((t) => t.controllerType === 'ai');
  const unreadyHumans = participants.filter(
    (p) => p.role !== 'spectator' && !p.ready,
  );

  const canStart = isAdmin && activeTeams.length >= 2 && humanTeams.length >= 1;

  const handleStartClick = () => {
    if (unreadyHumans.length > 0) {
      setConfirmStartOpen(true);
    } else {
      onStartAuction();
    }
  };

  return (
    <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
      {/* Stage Summary & Start Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-6 dark:border-slate-800">
        <div>
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">
            Stage 2 of 4 · Waiting Lobby &amp; Franchise Selection
          </p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl dark:text-white">
            Claim Your IPL Franchise
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            {humanTeams.length} human · {aiTeams.length} AI-controlled ·{' '}
            {10 - activeTeams.length} inactive · Purse {formatCurrency(settings.purseLakhs)} ·{' '}
            {settings.countdownSeconds}s bid timer
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isSpectator && me?.franchiseCode && (
            <button
              type="button"
              onClick={onToggleReady}
              className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                me.ready
                  ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
              }`}
            >
              {me.ready ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
              <span>{me.ready ? 'Ready for Auction' : 'Mark Ready'}</span>
            </button>
          )}

          {isAdmin && (
            <button
              type="button"
              disabled={!canStart}
              onClick={handleStartClick}
              className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
            >
              <Play className="h-4 w-4" />
              <span>Start Live Auction</span>
            </button>
          )}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
        {/* Left 8 Columns: 10 IPL Franchise Claim Grid */}
        <div className="lg:col-span-8">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
              IPL Franchises (10)
            </h2>
            {me?.franchiseCode && (
              <button
                type="button"
                onClick={onReleaseFranchise}
                className="text-xs font-semibold text-slate-600 underline hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Release {me.franchiseCode}
              </button>
            )}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {FRANCHISES.map((f) => {
              const team = teams[f.code];
              const isMine = me?.franchiseCode === f.code;
              const claimedByOther =
                team.controllerType === 'human' && !isMine && team.ownerParticipantId !== null;
              const disabled = isSpectator || claimedByOther;

              return (
                <button
                  key={f.code}
                  type="button"
                  disabled={disabled}
                  onClick={() => onClaimFranchise(f.code)}
                  className={`group flex items-center justify-between gap-4 rounded-xl border p-4 text-left transition-colors ${
                    isMine
                      ? 'border-amber-600 bg-amber-50/70 dark:border-amber-500 dark:bg-amber-500/10'
                      : claimedByOther
                        ? 'cursor-not-allowed border-slate-200 bg-slate-100/70 opacity-75 dark:border-slate-800 dark:bg-slate-900/50'
                        : 'border-slate-200 bg-white hover:border-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <FranchiseBadge code={f.code} size="md" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900 dark:text-white">
                        {f.name}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {isMine
                          ? 'Your Franchise'
                          : claimedByOther
                            ? `Claimed by ${team.ownerName}`
                            : team.controllerType === 'ai'
                              ? `Unclaimed · AI Managed (${settings.aiDifficulty})`
                              : 'Unclaimed · Inactive unless claimed'}
                      </p>
                    </div>
                  </div>

                  <span
                    className={`text-xs font-semibold whitespace-nowrap shrink-0 ${
                      isMine
                        ? 'text-amber-700 dark:text-amber-400'
                        : claimedByOther
                          ? 'text-slate-400 dark:text-slate-500'
                          : isSpectator
                            ? 'text-slate-400'
                            : 'text-slate-700 group-hover:text-amber-700 dark:text-slate-300 dark:group-hover:text-amber-400'
                    }`}
                  >
                    {isMine ? 'Selected' : claimedByOther ? 'Taken' : isSpectator ? 'View Only' : 'Claim'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Connected Participants List */}
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  Connected Participants ({participants.length})
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Room Code: <strong className="font-mono-num text-slate-900 dark:text-white">{roomState.roomCode}</strong>
              </span>
            </div>

            <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
              {participants.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 py-2.5 text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {p.connected ? (
                      <Wifi className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : (
                      <WifiOff className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    )}
                    <span className="truncate font-medium text-slate-900 dark:text-white">
                      {p.name}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {p.role === 'admin'
                        ? 'Admin'
                        : p.role === 'spectator'
                          ? 'Spectator'
                          : p.isGuest
                            ? 'Guest'
                            : 'Manager'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs whitespace-nowrap shrink-0">
                    <span className="font-mono-num font-semibold text-slate-700 dark:text-slate-300">
                      {p.franchiseCode ?? (p.role === 'spectator' ? 'Read-Only' : 'No Team')}
                    </span>
                    <span
                      className={
                        !p.connected
                          ? 'text-red-600 dark:text-red-400 font-medium'
                          : p.ready
                            ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                            : 'text-slate-500 dark:text-slate-400'
                      }
                    >
                      {!p.connected ? 'Disconnected' : p.ready ? 'Ready' : 'Waiting'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Auction Settings Panel */}
        <div className="lg:col-span-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  Auction Configuration
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {isAdmin ? 'Admin Controls' : 'Read-Only'}
              </span>
            </div>

            <div className="mt-5 space-y-4 text-sm">
              {/* Purse Budget */}
              <div>
                <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                  <label htmlFor="cfg-purse">Franchise Purse</label>
                  <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                    {formatCurrency(settings.purseLakhs)}
                  </span>
                </div>
                <select
                  id="cfg-purse"
                  disabled={!isAdmin}
                  value={settings.purseLakhs}
                  onChange={(e) => onUpdateSettings({ purseLakhs: Number(e.target.value) })}
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value={8000}>₹80.00 Cr</option>
                  <option value={10000}>₹100.00 Cr (Standard)</option>
                  <option value={12000}>₹120.00 Cr (Mega)</option>
                  <option value={15000}>₹150.00 Cr</option>
                </select>
              </div>

              {/* Bid Countdown */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="cfg-countdown"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Countdown (sec)
                  </label>
                  <input
                    id="cfg-countdown"
                    type="number"
                    min={3}
                    max={15}
                    disabled={!isAdmin}
                    value={settings.countdownSeconds}
                    onChange={(e) =>
                      onUpdateSettings({ countdownSeconds: Number(e.target.value) })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono-num text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cfg-overseas"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Max Overseas
                  </label>
                  <input
                    id="cfg-overseas"
                    type="number"
                    min={4}
                    max={8}
                    disabled={!isAdmin}
                    value={settings.maxOverseas}
                    onChange={(e) => onUpdateSettings({ maxOverseas: Number(e.target.value) })}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono-num text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>

              {/* Min & Max Squad */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="cfg-min-squad"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Min Squad Size
                  </label>
                  <input
                    id="cfg-min-squad"
                    type="number"
                    min={11}
                    max={20}
                    disabled={!isAdmin}
                    value={settings.minSquadSize}
                    onChange={(e) =>
                      onUpdateSettings({ minSquadSize: Number(e.target.value) })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono-num text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
                <div>
                  <label
                    htmlFor="cfg-max-squad"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Max Squad Size
                  </label>
                  <input
                    id="cfg-max-squad"
                    type="number"
                    min={settings.minSquadSize}
                    max={25}
                    disabled={!isAdmin}
                    value={settings.maxSquadSize}
                    onChange={(e) =>
                      onUpdateSettings({ maxSquadSize: Number(e.target.value) })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 font-mono-num text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>
              </div>

              {/* Auction Order */}
              <div>
                <label
                  htmlFor="cfg-order"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Player Auction Order
                </label>
                <select
                  id="cfg-order"
                  disabled={!isAdmin}
                  value={settings.orderMode}
                  onChange={(e) =>
                    onUpdateSettings({ orderMode: e.target.value as AuctionOrderMode })
                  }
                  className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="marquee_first">Marquee Round First</option>
                  <option value="role_wise">Role-Wise (BAT / WK / AR / BOWL)</option>
                  <option value="random">Randomized Order</option>
                  <option value="admin_selected">Admin-Selected / Manual</option>
                </select>
              </div>

              {/* Unclaimed Franchise Policy */}
              {settings.mode !== 'practice' ? (
                <div>
                  <label
                    htmlFor="cfg-unclaimed"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Unclaimed Franchises
                  </label>
                  <select
                    id="cfg-unclaimed"
                    disabled={!isAdmin}
                    value={settings.unclaimedPolicy}
                    onChange={(e) =>
                      onUpdateSettings({
                        unclaimedPolicy: e.target.value as UnclaimedTeamPolicy,
                      })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="ai">Controlled by AI Managers</option>
                    <option value="inactive">Remain Inactive</option>
                  </select>
                </div>
              ) : (
                <div>
                  <div className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-300">
                    <label htmlFor="cfg-ai-count">AI Rival Franchises</label>
                    <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                      {settings.aiTeamCount}
                    </span>
                  </div>
                  <input
                    id="cfg-ai-count"
                    type="range"
                    min={1}
                    max={9}
                    disabled={!isAdmin}
                    value={settings.aiTeamCount}
                    onChange={(e) =>
                      onUpdateSettings({ aiTeamCount: Number(e.target.value) })
                    }
                    className="mt-1.5 w-full accent-amber-600"
                  />
                </div>
              )}

              {/* AI Difficulty */}
              {(settings.mode === 'practice' || settings.unclaimedPolicy === 'ai') && (
                <div>
                  <label
                    htmlFor="cfg-ai-diff"
                    className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    <Bot className="h-3.5 w-3.5" />
                    <span>AI Bidding Strategy</span>
                  </label>
                  <select
                    id="cfg-ai-diff"
                    disabled={!isAdmin}
                    value={settings.aiDifficulty}
                    onChange={(e) =>
                      onUpdateSettings({ aiDifficulty: e.target.value as AiDifficulty })
                    }
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  >
                    <option value="conservative">Conservative (Value-First)</option>
                    <option value="balanced">Balanced (Realistic IPL)</option>
                    <option value="aggressive">Aggressive (Star Hunter)</option>
                  </select>
                </div>
              )}

              {/* Boolean Rules */}
              <div className="space-y-2.5 border-t border-slate-100 pt-3 dark:border-slate-800">
                <label className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
                  <span>Enforce Minimum Squad Reserve</span>
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={settings.enforceMinSquad}
                    onChange={(e) =>
                      onUpdateSettings({ enforceMinSquad: e.target.checked })
                    }
                    className="h-4 w-4 accent-amber-600"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
                  <span>Enable Accelerated Round 2 (Unsold)</span>
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={settings.enableSecondRound}
                    onChange={(e) =>
                      onUpdateSettings({ enableSecondRound: e.target.checked })
                    }
                    className="h-4 w-4 accent-amber-600"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
                  <span>Allow Guest Participants</span>
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={settings.allowGuests}
                    onChange={(e) =>
                      onUpdateSettings({ allowGuests: e.target.checked })
                    }
                    className="h-4 w-4 accent-amber-600"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-xs text-slate-700 dark:text-slate-300">
                  <span>Allow Spectator Mode</span>
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={settings.allowSpectators}
                    onChange={(e) =>
                      onUpdateSettings({ allowSpectators: e.target.checked })
                    }
                    className="h-4 w-4 accent-amber-600"
                  />
                </label>
              </div>

              {/* Price-Tier Bid Increments Reference */}
              <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Shield className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Price-Tier Bid Increments</span>
                </p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 font-mono-num text-[11px] text-slate-600 dark:text-slate-400">
                  <span>&lt; ₹1.00 Cr</span>
                  <span className="text-right font-semibold">+₹10 L</span>
                  <span>₹1.00 – ₹2.00 Cr</span>
                  <span className="text-right font-semibold">+₹20 L</span>
                  <span>₹2.00 – ₹5.00 Cr</span>
                  <span className="text-right font-semibold">+₹25 L</span>
                  <span>₹5.00 – ₹10.00 Cr</span>
                  <span className="text-right font-semibold">+₹50 L</span>
                  <span>≥ ₹10.00 Cr</span>
                  <span className="text-right font-semibold">+₹1.00 Cr</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmStartOpen}
        title="Start Auction Now?"
        description={`${unreadyHumans.length} participant${unreadyHumans.length === 1 ? ' is' : 's are'} not marked Ready yet. Starting will lock franchise selections and present the first player immediately.`}
        confirmLabel="Start Auction"
        onConfirm={() => {
          setConfirmStartOpen(false);
          onStartAuction();
        }}
        onCancel={() => setConfirmStartOpen(false)}
      />
    </main>
  );
}
