import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { GameMode, UserSession } from './shared/types';
import { useAuctionSocket } from './hooks/useAuctionSocket';
import { soundEngine } from './utils/sound';
import { StageHeader } from './components/StageHeader';
import { LandingScreen } from './components/LandingScreen';
import { LobbyScreen } from './components/LobbyScreen';
import { AuctionArena } from './components/AuctionArena';
import { ResultsHub } from './components/ResultsHub';

const SESSION_KEY = 'ipl_auction_session_v1';
const THEME_KEY = 'ipl_auction_theme_v1';

function loadStoredSession(): UserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as UserSession;
    if (parsed?.userId && parsed?.name) return parsed;
    return null;
  } catch {
    return null;
  }
}

export default function App() {
  const [session, setSession] = useState<UserSession | null>(() => loadStoredSession());
  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [asSpectator, setAsSpectator] = useState(false);
  const [roomBusy, setRoomBusy] = useState(false);
  const [landingError, setLandingError] = useState<string | null>(null);

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      return saved ? saved === 'dark' : true;
    } catch {
      return true;
    }
  });
  const [muted, setMuted] = useState(false);
  const autostartRanRef = useRef(false);

  // Sync Tailwind v4 .dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem(THEME_KEY, darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage failures
    }
  }, [darkMode]);

  const handleSaveSession = useCallback((next: UserSession | null) => {
    setSession(next);
    try {
      if (next) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(next));
      } else {
        localStorage.removeItem(SESSION_KEY);
      }
    } catch {
      // Ignore storage errors
    }
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const {
    roomState,
    status: socketStatus,
    toasts,
    dismissToast,
    actions,
  } = useAuctionSocket({
    roomCode: activeRoomCode,
    session,
    asSpectator,
  });

  // Expose live game stage on document.body for testability
  useEffect(() => {
    document.body.dataset.state = roomState
      ? roomState.stage.toLowerCase()
      : 'landing';
  }, [roomState]);

  const me = useMemo(() => {
    if (!roomState || !session) return null;
    return roomState.participants.find((p) => p.userId === session.userId) ?? null;
  }, [roomState, session]);

  const handleCreateRoom = useCallback(
    async (mode: GameMode, aiTeamCount?: number) => {
      if (!session) return;
      setLandingError(null);
      setRoomBusy(true);
      try {
        const res = await fetch('/api/rooms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            hostUserId: session.userId,
            hostName: session.name,
            isGuest: session.isGuest,
            mode,
            settings:
              mode === 'practice' && aiTeamCount
                ? { aiTeamCount }
                : undefined,
          }),
        });
        const data = (await res.json()) as { roomCode?: string; error?: string };
        if (!res.ok || !data.roomCode) {
          setLandingError(data.error ?? 'Failed to create room.');
          return;
        }
        setAsSpectator(false);
        setActiveRoomCode(data.roomCode);
      } catch {
        setLandingError('Network error while creating auction room.');
      } finally {
        setRoomBusy(false);
      }
    },
    [session],
  );

  const handleJoinRoom = useCallback(
    async (roomCode: string, spectator: boolean) => {
      if (!session) return;
      setLandingError(null);
      setRoomBusy(true);
      try {
        const code = roomCode.trim().toUpperCase();
        const res = await fetch(`/api/rooms/${encodeURIComponent(code)}`);
        const data = (await res.json()) as {
          roomCode?: string;
          allowGuests?: boolean;
          allowSpectators?: boolean;
          error?: string;
        };
        if (!res.ok || !data.roomCode) {
          setLandingError(data.error ?? `Room "${code}" not found.`);
          return;
        }
        if (session.isGuest && data.allowGuests === false) {
          setLandingError('This room does not allow guest accounts. Please sign in first.');
          return;
        }
        if (spectator && data.allowSpectators === false) {
          setLandingError('Spectator mode is disabled in this room.');
          return;
        }
        setAsSpectator(spectator);
        setActiveRoomCode(data.roomCode);
      } catch {
        setLandingError('Network error while checking room code.');
      } finally {
        setRoomBusy(false);
      }
    },
    [session],
  );

  // Support ?autostart=1 for instant demo/testing into a practice lobby
  useEffect(() => {
    if (autostartRanRef.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') !== '1') return;
    autostartRanRef.current = true;

    const bootstrap = async () => {
      const authRes = await fetch('/api/auth/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Demo Manager', isGuest: true }),
      });
      const authData = (await authRes.json()) as { session?: UserSession };
      if (!authData.session) return;
      handleSaveSession(authData.session);

      const roomRes = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostUserId: authData.session.userId,
          hostName: authData.session.name,
          isGuest: true,
          mode: 'practice',
          settings: { aiTeamCount: 4 },
        }),
      });
      const roomData = (await roomRes.json()) as { roomCode?: string };
      if (roomData.roomCode) {
        setAsSpectator(false);
        setActiveRoomCode(roomData.roomCode);
      }
    };
    void bootstrap();
  }, [handleSaveSession]);

  const handleLeaveRoom = useCallback(() => {
    setActiveRoomCode(null);
    setAsSpectator(false);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <StageHeader
        roomCode={activeRoomCode}
        stage={roomState?.stage ?? null}
        roundNumber={roomState?.roundNumber}
        socketStatus={socketStatus}
        muted={muted}
        darkMode={darkMode}
        userName={session?.name}
        isSpectator={me?.role === 'spectator' || asSpectator}
        onToggleMute={handleToggleMute}
        onToggleTheme={() => setDarkMode((d) => !d)}
        onLeaveRoom={activeRoomCode ? handleLeaveRoom : undefined}
      />

      {/* Screen Router */}
      {!activeRoomCode ? (
        <LandingScreen
          session={session}
          onSaveSession={handleSaveSession}
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          busy={roomBusy}
          error={landingError}
        />
      ) : !roomState ? (
        /* Loading Skeleton while synchronizing authoritative room state */
        <main className="mx-auto max-w-[1440px] px-4 py-10 sm:px-6">
          <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <div className="h-7 w-64 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div
                  key={n}
                  className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800/70"
                />
              ))}
            </div>
          </div>
        </main>
      ) : roomState.stage === 'LOBBY' ? (
        <LobbyScreen
          roomState={roomState}
          me={me}
          onUpdateSettings={actions.updateSettings}
          onClaimFranchise={actions.claimFranchise}
          onReleaseFranchise={actions.releaseFranchise}
          onToggleReady={actions.toggleReady}
          onStartAuction={actions.startAuction}
        />
      ) : roomState.stage === 'COMPLETED' ? (
        <ResultsHub
          roomState={roomState}
          me={me}
          onUpdateCustomXI={actions.updateCustomXI}
          onExitToLobbyHome={handleLeaveRoom}
        />
      ) : (
        <AuctionArena
          roomState={roomState}
          me={me}
          onPlaceBid={actions.placeBid}
          onPause={actions.pauseAuction}
          onResume={actions.resumeAuction}
          onFinalizeLot={actions.finalizeLot}
          onNominate={actions.nominatePlayer}
          onReopenUnsold={actions.reopenUnsold}
          onReorderQueue={actions.reorderQueue}
          onStartSecondRound={actions.startSecondRound}
          onCompleteAuction={actions.completeAuction}
        />
      )}

      {/* Non-blocking Activity & Feedback Toast Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-4 right-4 z-40 flex max-w-sm flex-col gap-2"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`flex items-start justify-between gap-3 rounded-lg border px-3.5 py-2.5 text-xs font-semibold shadow-lg ${
                t.kind === 'error'
                  ? 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200'
                  : t.kind === 'success'
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
                    : 'border-slate-300 bg-white text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
              }`}
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="opacity-70 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
