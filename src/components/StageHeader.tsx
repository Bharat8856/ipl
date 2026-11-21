import { useState } from 'react';
import {
  Check,
  Copy,
  LogOut,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
} from 'lucide-react';
import { RoomStage } from '../shared/types';
import { SocketStatus } from '../hooks/useAuctionSocket';

interface StageHeaderProps {
  roomCode: string | null;
  stage: RoomStage | null;
  roundNumber?: 1 | 2;
  socketStatus: SocketStatus;
  muted: boolean;
  darkMode: boolean;
  userName?: string;
  isSpectator?: boolean;
  onToggleMute: () => void;
  onToggleTheme: () => void;
  onLeaveRoom?: () => void;
}

const STAGE_LABEL: Record<RoomStage, string> = {
  LOBBY: 'Waiting Lobby · Franchise Draft',
  LIVE: 'Live Auction · Round 1',
  PAUSED: 'Auction Paused',
  ROUND_BREAK: 'Round Break · Admin Queue',
  ACCELERATED: 'Accelerated Auction · Round 2',
  COMPLETED: 'Post-Auction Evaluation & Rankings',
};

export function StageHeader({
  roomCode,
  stage,
  socketStatus,
  muted,
  darkMode,
  userName,
  isSpectator,
  onToggleMute,
  onToggleTheme,
  onLeaveRoom,
}: StageHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    if (!roomCode) return;
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked in sandbox
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-2 sm:gap-4 px-3 sm:px-6">
        {/* Zone 1: Brand Title */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span className="font-display text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
            IPL Auction Arena
          </span>
          {stage && (
            <span className="hidden md:inline text-sm text-slate-500 dark:text-slate-400 truncate">
              <span className="mx-2 text-slate-300 dark:text-slate-700" aria-hidden="true">
                /
              </span>
              {STAGE_LABEL[stage]}
            </span>
          )}
        </div>

        {/* Zone 2: Room Code & Live Connection */}
        <div className="flex items-center gap-2 sm:gap-5 text-xs sm:text-sm min-w-0">
          {roomCode && (
            <button
              type="button"
              onClick={handleCopyCode}
              title="Copy room invitation code"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2 sm:px-2.5 py-1.5 font-mono-num text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <span>
                <span className="hidden sm:inline">Room </span>
                {roomCode}
              </span>
              {copied ? (
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-400" />
              )}
            </button>
          )}

          {roomCode && (
            <span
              className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                socketStatus === 'connected'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : 'text-amber-700 dark:text-amber-400'
              }`}
              aria-live="polite"
            >
              {socketStatus === 'connected' ? (
                <Wifi className="h-3.5 w-3.5" />
              ) : (
                <WifiOff className="h-3.5 w-3.5" />
              )}
              <span>
                {socketStatus === 'connected'
                  ? 'Live'
                  : socketStatus === 'reconnecting'
                    ? 'Reconnecting'
                    : 'Connecting'}
              </span>
            </span>
          )}

          {userName && (
            <span className="hidden lg:inline text-xs text-slate-500 dark:text-slate-400 truncate max-w-[160px]">
              {userName}
              {isSpectator ? ' · Spectator' : ''}
            </span>
          )}
        </div>

        {/* Zone 3: Compact Utility Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'Unmute auction sounds' : 'Mute auction sounds'}
            title={muted ? 'Unmute auction sounds' : 'Mute auction sounds'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            title={darkMode ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {darkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {roomCode && onLeaveRoom && (
            <button
              type="button"
              onClick={onLeaveRoom}
              aria-label="Leave room"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Exit</span>
            </button>
          )}
        </div>
      </div>

      {/* Compact mobile stage line */}
      {stage && (
        <div className="border-t border-slate-100 px-4 py-1 text-xs font-medium text-slate-600 md:hidden dark:border-slate-900 dark:text-slate-400">
          {STAGE_LABEL[stage]}
        </div>
      )}
    </header>
  );
}
