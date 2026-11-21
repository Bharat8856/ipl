import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AuctionSettings,
  FranchiseCode,
  RoomState,
  UserSession,
} from '../shared/types';
import { soundEngine } from '../utils/sound';

export type SocketStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface ToastNotice {
  id: string;
  kind: 'info' | 'success' | 'error';
  message: string;
}

interface UseAuctionSocketOptions {
  roomCode: string | null;
  session: UserSession | null;
  asSpectator: boolean;
}

export function useAuctionSocket({
  roomCode,
  session,
  asSpectator,
}: UseAuctionSocketOptions) {
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [status, setStatus] = useState<SocketStatus>('disconnected');
  const [toasts, setToasts] = useState<ToastNotice[]>([]);
  const [lastError, setLastError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const prevStateRef = useRef<RoomState | null>(null);
  const mountedRef = useRef(true);

  const pushToast = useCallback((kind: ToastNotice['kind'], message: string) => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [{ id, kind, message }, ...prev].slice(0, 4));
    window.setTimeout(() => {
      if (mountedRef.current) {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const sendMessage = useCallback((payload: Record<string, unknown>) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      setLastError('Connection lost — reconnecting automatically.');
      pushToast('error', 'Connection lost — waiting to reconnect.');
      return false;
    }
    ws.send(JSON.stringify(payload));
    return true;
  }, [pushToast]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!roomCode || !session) {
      setRoomState(null);
      setStatus('disconnected');
      prevStateRef.current = null;
      return;
    }

    let intentionallyClosed = false;

    const connect = (isReconnect: boolean) => {
      if (intentionallyClosed) return;
      setStatus(isReconnect ? 'reconnecting' : 'connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (intentionallyClosed) {
          ws.close();
          return;
        }
        reconnectAttemptsRef.current = 0;
        setStatus('connected');
        setLastError(null);
        ws.send(
          JSON.stringify({
            type: 'join_room',
            roomCode,
            userId: session.userId,
            name: session.name,
            isGuest: session.isGuest,
            asSpectator,
          }),
        );
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(String(event.data)) as {
            type: string;
            state?: RoomState;
            error?: string;
            reconnected?: boolean;
          };

          if (data.type === 'joined' && data.reconnected) {
            pushToast('success', 'Reconnected — auction state synchronized.');
          }

          if (data.type === 'action_error' && data.error) {
            setLastError(data.error);
            soundEngine.playError();
            pushToast('error', data.error);
          }

          if (data.type === 'room_state' && data.state) {
            const prev = prevStateRef.current;
            const next = data.state;

            // Audio & notification triggers on real server state transitions
            if (prev) {
              if (
                next.bidHistory[0]?.id &&
                next.bidHistory[0].id !== prev.bidHistory[0]?.id
              ) {
                soundEngine.playBid();
              }

              if (
                next.lastResolution?.id &&
                next.lastResolution.id !== prev.lastResolution?.id
              ) {
                if (next.lastResolution.status === 'SOLD') {
                  soundEngine.playSold();
                  pushToast(
                    'success',
                    `SOLD: ${next.lastResolution.playerName} to ${next.lastResolution.franchiseCode}`,
                  );
                } else {
                  soundEngine.playUnsold();
                  pushToast('info', `UNSOLD: ${next.lastResolution.playerName}`);
                }
              }

              // Countdown tick in final 3 seconds
              if (next.stage === 'LIVE' || next.stage === 'ACCELERATED') {
                const prevSec = Math.ceil(prev.countdownRemainingMs / 1000);
                const nextSec = Math.ceil(next.countdownRemainingMs / 1000);
                if (nextSec !== prevSec && nextSec <= 3 && nextSec >= 1) {
                  soundEngine.playTick(nextSec === 1);
                }
              }

              // Stage change notifications
              if (next.stage !== prev.stage) {
                if (next.stage === 'PAUSED') pushToast('info', 'Auction paused by admin.');
                if (prev.stage === 'PAUSED' && (next.stage === 'LIVE' || next.stage === 'ACCELERATED')) {
                  pushToast('success', 'Auction resumed.');
                }
                if (next.stage === 'ACCELERATED') {
                  pushToast('info', 'Accelerated Round 2 is now live!');
                }
              }
            }

            prevStateRef.current = next;
            setRoomState(next);
          }
        } catch {
          // Ignore malformed frames
        }
      };

      ws.onclose = () => {
        if (intentionallyClosed || !mountedRef.current) return;
        setStatus('reconnecting');
        const attempt = reconnectAttemptsRef.current++;
        const delay = Math.min(5000, 600 * Math.pow(1.6, attempt));
        reconnectTimerRef.current = window.setTimeout(() => connect(true), delay);
      };

      ws.onerror = () => {
        // onclose handles reconnection
      };
    };

    connect(false);

    return () => {
      intentionallyClosed = true;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomCode, session, asSpectator, pushToast]);

  const actions = {
    updateSettings: (settings: Partial<AuctionSettings>) =>
      sendMessage({ type: 'update_settings', settings }),
    claimFranchise: (franchiseCode: FranchiseCode) =>
      sendMessage({ type: 'claim_franchise', franchiseCode }),
    releaseFranchise: () => sendMessage({ type: 'release_franchise' }),
    toggleReady: () => sendMessage({ type: 'toggle_ready' }),
    startAuction: () => sendMessage({ type: 'start_auction' }),
    placeBid: (proposedBidLakhs?: number) =>
      sendMessage({ type: 'place_bid', proposedBidLakhs }),
    pauseAuction: () => sendMessage({ type: 'pause_auction' }),
    resumeAuction: () => sendMessage({ type: 'resume_auction' }),
    finalizeLot: () => sendMessage({ type: 'finalize_lot' }),
    nominatePlayer: (playerId: string) =>
      sendMessage({ type: 'nominate_player', playerId }),
    reopenUnsold: (playerIds: string[]) =>
      sendMessage({ type: 'reopen_unsold', playerIds }),
    startSecondRound: () => sendMessage({ type: 'start_second_round' }),
    reorderQueue: (playerIds: string[]) =>
      sendMessage({ type: 'reorder_queue', playerIds }),
    completeAuction: () => sendMessage({ type: 'complete_auction' }),
    updateCustomXI: (franchiseCode: FranchiseCode, playerIds: string[] | null) =>
      sendMessage({ type: 'update_custom_xi', franchiseCode, playerIds }),
  };

  return {
    roomState,
    status,
    toasts,
    lastError,
    clearError: () => setLastError(null),
    dismissToast,
    actions,
  };
}
