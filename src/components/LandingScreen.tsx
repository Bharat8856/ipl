import { FormEvent, useState } from 'react';
import {
  ArrowRight,
  Bot,
  Crown,
  Eye,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';
import { GameMode, UserSession } from '../shared/types';
import { FRANCHISES } from '../shared/franchises';
import { FranchiseBadge } from './FranchiseBadge';

const HERO_IMG = '/src/assets/images/arena_hero_stadium_1795275102829.jpg';

interface LandingScreenProps {
  session: UserSession | null;
  onSaveSession: (session: UserSession) => void;
  onCreateRoom: (mode: GameMode, aiTeamCount?: number) => Promise<void>;
  onJoinRoom: (roomCode: string, asSpectator: boolean) => Promise<void>;
  busy: boolean;
  error: string | null;
}

const MODES: {
  id: GameMode;
  title: string;
  subtitle: string;
  details: string;
  icon: typeof Users;
}[] = [
  {
    id: 'private_multiplayer',
    title: 'Private Multiplayer Auction',
    subtitle: 'Friends join via room code',
    details:
      'Create a private room, share the 6-character code, claim IPL franchises, and bid live with a backend-synced 5s countdown.',
    icon: Users,
  },
  {
    id: 'practice',
    title: 'Practice Auction vs AI',
    subtitle: 'Solo training against smart AI teams',
    details:
      'Draft your franchise against 1 to 9 configurable AI managers that respect squad feasibility, overseas limits, and role gaps.',
    icon: Bot,
  },
  {
    id: 'admin_hosted',
    title: 'Admin-Hosted Auction',
    subtitle: 'Full commissioner floor control',
    details:
      'Run structured tournaments with manual player nomination, custom auction order, pause/resume precision, and spectator mode.',
    icon: Crown,
  },
];

export function LandingScreen({
  session,
  onSaveSession,
  onCreateRoom,
  onJoinRoom,
  busy,
  error,
}: LandingScreenProps) {
  const [authTab, setAuthTab] = useState<'guest' | 'account'>(
    session && !session.isGuest ? 'account' : 'guest',
  );
  const [nameInput, setNameInput] = useState(session?.name ?? '');
  const [emailInput, setEmailInput] = useState(session?.email ?? '');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSaving, setAuthSaving] = useState(false);

  const [selectedMode, setSelectedMode] = useState<GameMode>('practice');
  const [practiceAiCount, setPracticeAiCount] = useState(5);
  const [joinCode, setJoinCode] = useState('');
  const [joinAsSpectator, setJoinAsSpectator] = useState(false);
  const [joinLocalError, setJoinLocalError] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const handleAuthSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const trimmed = nameInput.trim();
    if (trimmed.length < 2) {
      setAuthError('Please enter a display name (at least 2 characters).');
      return;
    }
    if (authTab === 'account' && emailInput.trim() && !emailInput.includes('@')) {
      setAuthError('Please enter a valid email address or switch to Guest.');
      return;
    }

    setAuthSaving(true);
    try {
      const res = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          isGuest: authTab === 'guest',
          email: authTab === 'account' ? emailInput.trim() : undefined,
          existingUserId: session?.userId,
        }),
      });
      const data = (await res.json()) as { session?: UserSession; error?: string };
      if (!res.ok || !data.session) {
        setAuthError(data.error ?? 'Could not sign in.');
        return;
      }
      onSaveSession(data.session);
    } catch {
      setAuthError('Network error while creating session.');
    } finally {
      setAuthSaving(false);
    }
  };

  const handleJoinSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setJoinLocalError(null);
    const cleaned = joinCode.trim().toUpperCase();
    if (cleaned.length < 4) {
      setJoinLocalError('Enter a valid 6-character room code.');
      return;
    }
    await onJoinRoom(cleaned, joinAsSpectator);
  };

  return (
    <main className="min-h-[calc(100vh-3.5rem)] bg-slate-50 dark:bg-slate-950">
      {/* Broadcast Hero Banner */}
      <section className="relative overflow-hidden border-b border-slate-200 bg-slate-950 dark:border-slate-800">
        {!imgFailed ? (
          <img
            src={HERO_IMG}
            alt="Floodlit IPL cricket stadium at night"
            referrerPolicy="no-referrer"
            onError={() => setImgFailed(true)}
            className="absolute inset-0 h-full w-full object-cover object-center opacity-50"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-amber-950/30" />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/75 to-slate-950/45" />

        <div className="relative mx-auto max-w-[1440px] px-4 py-10 sm:px-6 lg:py-14">
          <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
            {/* Left: Title & Value Prop over clean negative space */}
            <div className="lg:col-span-7">
              <p className="text-xs font-semibold tracking-wider text-amber-400">
                Real-Time Multiplayer · 10 IPL Franchises · Playing XI Optimizer
              </p>
              <h1 className="mt-2 max-w-2xl text-balance font-display text-4xl font-extrabold tracking-tight text-white sm:text-5xl lg:text-6xl">
                Build a Championship IPL Squad Under Live Hammer Pressure
              </h1>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-slate-300">
                Compete head-to-head with friends or smart AI franchises. Every bid is
                validated server-side against your purse, minimum squad reserve, and
                overseas cap—followed by deterministic Playing XI evaluation.
              </p>

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                {FRANCHISES.map((f) => (
                  <FranchiseBadge key={f.code} code={f.code} size="sm" />
                ))}
              </div>
            </div>

            {/* Right: Profile / Sign-in Card */}
            <div className="lg:col-span-5">
              <div className="rounded-xl border border-slate-800 bg-slate-900/92 p-6 text-slate-100 shadow-2xl">
                {session ? (
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">
                          <UserCheck className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-slate-400">
                            {session.isGuest ? 'Guest Pass Active' : 'Signed In Manager'}
                          </p>
                          <p className="truncate text-lg font-bold text-white">
                            {session.name}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setNameInput(session.name);
                          setEmailInput(session.email ?? '');
                          onSaveSession(null as unknown as UserSession);
                        }}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        Switch User
                      </button>
                    </div>
                    <p className="mt-4 text-xs leading-relaxed text-slate-400">
                      Your identity stays synced across disconnects so you can rejoin active
                      rooms without losing your franchise or purse.
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleAuthSubmit} noValidate>
                    <div className="flex items-center justify-between gap-3">
                      <h2 className="font-display text-2xl font-bold text-white">
                        Step 1 · Enter the Arena
                      </h2>
                      <div className="inline-flex rounded-lg bg-slate-800 p-1">
                        <button
                          type="button"
                          onClick={() => setAuthTab('guest')}
                          className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            authTab === 'guest'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          Guest
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthTab('account')}
                          className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            authTab === 'account'
                              ? 'bg-amber-500 text-slate-950'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          Sign In
                        </button>
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <div>
                        <label
                          htmlFor="manager-name"
                          className="block text-xs font-medium text-slate-300"
                        >
                          Manager Display Name
                        </label>
                        <input
                          id="manager-name"
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          placeholder="e.g. Rohit, Kavya, Vikram"
                          maxLength={28}
                          className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      {authTab === 'account' && (
                        <div>
                          <label
                            htmlFor="manager-email"
                            className="block text-xs font-medium text-slate-300"
                          >
                            Email Address
                          </label>
                          <input
                            id="manager-email"
                            type="email"
                            value={emailInput}
                            onChange={(e) => setEmailInput(e.target.value)}
                            placeholder="manager@franchise.com"
                            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                      )}
                    </div>

                    {authError && (
                      <p role="alert" className="mt-3 text-xs font-medium text-red-400">
                        {authError}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={authSaving}
                      className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400 disabled:opacity-60 whitespace-nowrap"
                    >
                      <span>{authSaving ? 'Entering...' : authTab === 'guest' ? 'Continue as Guest' : 'Sign In & Continue'}</span>
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Step 2: Create Room or Join Room */}
      <section className="mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:py-10">
        {error && (
          <div
            role="alert"
            className="mb-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm font-medium text-red-800 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Create Room: 3 Game Modes */}
          <div className="lg:col-span-8">
            <div className="flex items-baseline justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Create an Auction Room
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Choose a game mode, then customize purse, squad rules, and order in the lobby.
                </p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = selectedMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMode(m.id)}
                    aria-pressed={active}
                    className={`flex flex-col rounded-xl border p-5 text-left transition-colors ${
                      active
                        ? 'border-amber-600 bg-amber-50/70 dark:border-amber-500 dark:bg-amber-500/10'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                          active
                            ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-slate-950'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        {active ? 'Selected' : 'Choose'}
                      </span>
                    </div>
                    <h3 className="mt-4 font-display text-xl font-bold text-slate-900 dark:text-white">
                      {m.title}
                    </h3>
                    <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      {m.subtitle}
                    </p>
                    <p className="mt-2.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                      {m.details}
                    </p>
                  </button>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              {selectedMode === 'practice' ? (
                <div className="flex flex-wrap items-center gap-4">
                  <label
                    htmlFor="ai-opponent-count"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    AI Rival Franchises:{' '}
                    <span className="font-mono-num font-bold text-slate-900 dark:text-white">
                      {practiceAiCount}
                    </span>
                  </label>
                  <input
                    id="ai-opponent-count"
                    type="range"
                    min={1}
                    max={9}
                    value={practiceAiCount}
                    onChange={(e) => setPracticeAiCount(Number(e.target.value))}
                    className="w-36 accent-amber-600 dark:accent-amber-500"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                  <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>
                    Backend-authoritative 5s countdown · Transactional simultaneous bids ·
                    Configurable unclaimed AI or Inactive policy
                  </span>
                </div>
              )}

              <button
                type="button"
                data-start="true"
                disabled={!session || busy}
                onClick={() => onCreateRoom(selectedMode, practiceAiCount)}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap shrink-0 dark:bg-amber-500 dark:text-slate-950 dark:hover:bg-amber-400"
              >
                <span>
                  {busy
                    ? 'Creating Room...'
                    : !session
                      ? 'Sign In Above to Create'
                      : `Create ${selectedMode === 'practice' ? 'Practice' : selectedMode === 'admin_hosted' ? 'Admin-Hosted' : 'Multiplayer'} Room`}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Join Existing Room by Code */}
          <div className="lg:col-span-4">
            <div className="h-full rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
                Join with Invitation Code
              </h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Enter the 6-character code shared by your room host.
              </p>

              <form onSubmit={handleJoinSubmit} className="mt-5 space-y-4">
                <div>
                  <label
                    htmlFor="join-room-code"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Room Invitation Code
                  </label>
                  <input
                    id="join-room-code"
                    type="text"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="e.g. K7M4QX"
                    maxLength={8}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-slate-50 px-3.5 py-2.5 font-mono-num text-base font-bold tracking-widest text-slate-900 placeholder:font-sans placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-400 focus:border-amber-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                  />
                </div>

                <label className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={joinAsSpectator}
                    onChange={(e) => setJoinAsSpectator(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 accent-amber-600"
                  />
                  <Eye className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <span>Join in Spectator Mode (read-only)</span>
                </label>

                {joinLocalError && (
                  <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                    {joinLocalError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={!session || busy}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-4 py-2.5 text-sm font-bold text-slate-900 transition-colors hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
                >
                  <span>{joinAsSpectator ? 'Watch as Spectator' : 'Join Auction Room'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
              </form>

              <div className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  Fair Play Guarantees
                </p>
                <p className="mt-1 leading-relaxed">
                  Spectators cannot bid. Simultaneous bids are serialized on the server.
                  Disconnected managers keep their franchise and auto-sync on reconnect.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
