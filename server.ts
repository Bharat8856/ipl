import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, Type } from '@google/genai';
import { AuctionRoomManager } from './src/engine/roomManager';
import { AUCTION_PLAYERS, STATS_SNAPSHOT_VERSION } from './src/shared/players';
import {
  AiAnalystReport,
  AuctionSettings,
  FranchiseCode,
  GameMode,
  UserSession,
} from './src/shared/types';
import { formatCurrency } from './src/engine/bidding';

const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

const app = express();
app.use(express.json({ limit: '1mb' }));

const roomManager = new AuctionRoomManager();
const sessions = new Map<string, UserSession>();

// Socket tracking per room
interface SocketMeta {
  ws: WebSocket;
  roomCode: string | null;
  userId: string | null;
}
const socketMap = new Map<WebSocket, SocketMeta>();
const roomSockets = new Map<string, Set<WebSocket>>();

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastRoomState(roomCode: string): void {
  const snapshot = roomManager.getSnapshot(roomCode);
  if (!snapshot) return;
  const clients = roomSockets.get(roomCode.toUpperCase());
  if (!clients || clients.size === 0) return;

  const msg = JSON.stringify({ type: 'room_state', state: snapshot });
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

function attachSocketToRoom(ws: WebSocket, roomCode: string, userId: string): void {
  const code = roomCode.toUpperCase();
  const prev = socketMap.get(ws);
  if (prev?.roomCode && prev.roomCode !== code) {
    roomSockets.get(prev.roomCode)?.delete(ws);
  }
  socketMap.set(ws, { ws, roomCode: code, userId });
  if (!roomSockets.has(code)) {
    roomSockets.set(code, new Set());
  }
  roomSockets.get(code)!.add(ws);
}

// ================= REST API =================

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, snapshotVersion: STATS_SNAPSHOT_VERSION });
});

app.get('/api/players', (_req, res) => {
  res.json({
    snapshotVersion: STATS_SNAPSHOT_VERSION,
    players: AUCTION_PLAYERS,
  });
});

app.post('/api/auth/session', (req, res) => {
  const { name, isGuest, email, existingUserId } = req.body as {
    name?: string;
    isGuest?: boolean;
    email?: string;
    existingUserId?: string;
  };

  const trimmed = (name ?? '').trim();
  if (!trimmed || trimmed.length < 2) {
    res.status(400).json({ error: 'Display name must be at least 2 characters.' });
    return;
  }

  const userId =
    existingUserId && typeof existingUserId === 'string'
      ? existingUserId
      : `usr_${crypto.randomBytes(6).toString('hex')}`;

  const session: UserSession = {
    userId,
    name: trimmed.slice(0, 28),
    isGuest: Boolean(isGuest),
    email: !isGuest && email ? String(email).trim().slice(0, 64) : undefined,
  };
  sessions.set(userId, session);
  res.json({ session });
});

app.post('/api/rooms', (req, res) => {
  const { hostUserId, hostName, isGuest, mode, settings } = req.body as {
    hostUserId?: string;
    hostName?: string;
    isGuest?: boolean;
    mode?: GameMode;
    settings?: Partial<AuctionSettings>;
  };

  if (!hostUserId || !hostName) {
    res.status(400).json({ error: 'Host session is required to create a room.' });
    return;
  }

  const validMode: GameMode =
    mode === 'practice' || mode === 'admin_hosted' || mode === 'private_multiplayer'
      ? mode
      : 'private_multiplayer';

  const managed = roomManager.createRoom({
    hostUserId,
    hostName,
    isGuest: Boolean(isGuest),
    mode: validMode,
    partialSettings: settings,
  });

  res.status(201).json({
    roomCode: managed.state.roomCode,
    state: managed.state,
  });
});

app.get('/api/rooms/:code', (req, res) => {
  const code = req.params.code.toUpperCase();
  const state = roomManager.getSnapshot(code);
  if (!state) {
    res.status(404).json({ error: `Room "${code}" not found.` });
    return;
  }
  res.json({
    roomCode: state.roomCode,
    stage: state.stage,
    mode: state.settings.mode,
    participantCount: state.participants.length,
    allowGuests: state.settings.allowGuests,
    allowSpectators: state.settings.allowSpectators,
  });
});

// Server-side Gemini AI Analyst: explains locked deterministic scores without fabricating stats
app.post('/api/rooms/:code/analyst', async (req, res) => {
  const code = req.params.code.toUpperCase();
  const state = roomManager.getSnapshot(code);
  if (!state) {
    res.status(404).json({ error: `Room "${code}" not found.` });
    return;
  }

  if (!state.evaluation || state.evaluation.rankings.length === 0) {
    res.status(400).json({ error: 'No team evaluation snapshot available yet.' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    res.status(503).json({
      error:
        'Gemini AI Analyst requires GEMINI_API_KEY in Settings > Secrets. Deterministic statistical evaluations above remain fully active.',
    });
    return;
  }

  try {
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });

    const compactSnapshot = state.evaluation.rankings.map((team) => ({
      rank: team.rank,
      franchiseCode: team.franchiseCode,
      franchiseName: team.franchiseName,
      ownerName: team.ownerName,
      squadQualityScore: team.squadQualityScore,
      auctionEfficiencyScore: team.auctionEfficiencyScore,
      benchDepthScore: team.benchDepthScore,
      squadSize: team.squadSize,
      overseasCount: team.overseasCount,
      purseSpent: formatCurrency(team.purseSpentLakhs),
      purseRemaining: formatCurrency(team.purseRemainingLakhs),
      playingXIScore: team.playingXI.metrics.overallXIScore,
      openingScore: team.playingXI.metrics.openingScore,
      middleOrderScore: team.playingXI.metrics.middleOrderScore,
      finishingScore: team.playingXI.metrics.finishingScore,
      deathBowlingScore: team.playingXI.metrics.deathBowlingScore,
      powerplayBowlingScore: team.playingXI.metrics.powerplayBowlingScore,
      leftHandBattersTop7: team.playingXI.metrics.leftHandBattersTop7,
      paceOptions: team.playingXI.metrics.paceOptions,
      spinOptions: team.playingXI.metrics.spinOptions,
      hasKeeper: team.playingXI.metrics.hasKeeper,
      strengths: team.strengths,
      weaknesses: team.weaknesses,
      missingRoles: team.missingRoles,
      bestPurchases: team.bestPurchases.map(
        (b) => `${b.playerName} (${formatCurrency(b.paidLakhs)} vs fair ${formatCurrency(b.fairValueLakhs)})`,
      ),
      worstPurchases: team.worstPurchases.map(
        (w) => `${w.playerName} (${formatCurrency(w.paidLakhs)} vs fair ${formatCurrency(w.fairValueLakhs)})`,
      ),
      confidenceLevel: team.confidenceLevel,
      missingDataWarnings: team.missingDataWarnings,
    }));

    const modelName = 'gemini-4-hydrogen';
    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Analyze this locked deterministic IPL Auction evaluation snapshot (${state.statsSnapshotVersion}, Stage: ${state.stage}). Explain why teams ranked where they did, highlight tactical balance, value-for-money vs raw quality, and call out any missing-data caveats.

STRICT DATA SNAPSHOT:
${JSON.stringify(compactSnapshot, null, 2)}`,
      config: {
        systemInstruction:
          'You are a sharp IPL cricket auction broadcast analyst. You MUST ONLY cite and explain the exact statistics and scores present in the provided JSON snapshot. NEVER invent player stats, NEVER fabricate numbers, and NEVER alter or contradict the calculated rankings or scores. Keep analysis concise, insightful, and cricket-specific.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            summary: { type: Type.STRING },
            teamInsights: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  franchiseCode: { type: Type.STRING },
                  verdict: { type: Type.STRING },
                  tacticalNote: { type: Type.STRING },
                },
                required: ['franchiseCode', 'verdict', 'tacticalNote'],
              },
            },
            keyTakeaways: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['headline', 'summary', 'teamInsights', 'keyTakeaways'],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? '{}').trim()) as Omit<
      AiAnalystReport,
      'generatedAt' | 'model'
    >;

    const report: AiAnalystReport = {
      generatedAt: Date.now(),
      model: modelName,
      headline: parsed.headline ?? 'Post-Auction Tactical Review',
      summary: parsed.summary ?? '',
      teamInsights: (parsed.teamInsights ?? []).map((item) => ({
        franchiseCode: item.franchiseCode as FranchiseCode,
        verdict: item.verdict,
        tacticalNote: item.tacticalNote,
      })),
      keyTakeaways: parsed.keyTakeaways ?? [],
    };

    res.json({ report });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to generate AI analysis.';
    res.status(502).json({ error: `Gemini Analyst unavailable: ${message}` });
  }
});

// ================= HTTP + WEBSOCKET SERVER =================

async function startServer(): Promise<void> {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    socketMap.set(ws, { ws, roomCode: null, userId: null });

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw)) as {
          type: string;
          requestId?: string;
          roomCode?: string;
          userId?: string;
          name?: string;
          isGuest?: boolean;
          asSpectator?: boolean;
          franchiseCode?: FranchiseCode;
          settings?: Partial<AuctionSettings>;
          proposedBidLakhs?: number;
          playerId?: string;
          playerIds?: string[] | null;
        };

        const meta = socketMap.get(ws);
        const roomCode = (msg.roomCode ?? meta?.roomCode ?? '').toUpperCase();
        const userId = msg.userId ?? meta?.userId ?? '';

        const replyError = (error: string, code?: string) => {
          sendJson(ws, {
            type: 'action_error',
            requestId: msg.requestId,
            error,
            code,
          });
        };

        if (msg.type === 'ping') {
          sendJson(ws, { type: 'pong', ts: Date.now() });
          return;
        }

        if (msg.type === 'join_room') {
          if (!roomCode || !userId || !msg.name) {
            replyError('Missing room code or user identity.');
            return;
          }
          const res = roomManager.joinRoom({
            roomCode,
            userId,
            name: msg.name,
            isGuest: Boolean(msg.isGuest),
            asSpectator: Boolean(msg.asSpectator),
          });
          if (!res.ok || !res.data) {
            replyError(res.error ?? 'Could not join room.', res.code);
            return;
          }
          attachSocketToRoom(ws, roomCode, userId);
          sendJson(ws, {
            type: 'joined',
            requestId: msg.requestId,
            participant: res.data.participant,
            reconnected: res.data.reconnected,
          });
          broadcastRoomState(roomCode);
          return;
        }

        if (!roomCode || !userId) {
          replyError('Not joined to a room.');
          return;
        }

        let result: { ok: boolean; error?: string; code?: string } = { ok: false, error: 'Unknown action.' };

        switch (msg.type) {
          case 'update_settings':
            result = roomManager.updateSettings(roomCode, userId, msg.settings ?? {});
            break;
          case 'claim_franchise':
            if (!msg.franchiseCode) {
              replyError('Franchise code required.');
              return;
            }
            result = roomManager.claimFranchise(roomCode, userId, msg.franchiseCode);
            break;
          case 'release_franchise':
            result = roomManager.releaseFranchise(roomCode, userId);
            break;
          case 'toggle_ready':
            result = roomManager.toggleReady(roomCode, userId);
            break;
          case 'start_auction':
            result = roomManager.startAuction(roomCode, userId);
            break;
          case 'place_bid':
            result = roomManager.placeBid({
              roomCode,
              userId,
              proposedBidLakhs: msg.proposedBidLakhs,
            });
            break;
          case 'pause_auction':
            result = roomManager.pauseAuction(roomCode, userId);
            break;
          case 'resume_auction':
            result = roomManager.resumeAuction(roomCode, userId);
            break;
          case 'finalize_lot':
            result = roomManager.forceFinalizeLot(roomCode, userId);
            break;
          case 'nominate_player':
            if (!msg.playerId) {
              replyError('Player ID required.');
              return;
            }
            result = roomManager.nominatePlayer(roomCode, userId, msg.playerId);
            break;
          case 'reopen_unsold':
            result = roomManager.reopenUnsoldPlayers(
              roomCode,
              userId,
              Array.isArray(msg.playerIds) ? msg.playerIds : [],
            );
            break;
          case 'start_second_round':
            result = roomManager.startAcceleratedRound(roomCode, userId);
            break;
          case 'reorder_queue':
            result = roomManager.reorderQueue(
              roomCode,
              userId,
              Array.isArray(msg.playerIds) ? msg.playerIds : [],
            );
            break;
          case 'complete_auction':
            result = roomManager.completeAuction(roomCode, userId);
            break;
          case 'update_custom_xi':
            if (!msg.franchiseCode) {
              replyError('Franchise code required.');
              return;
            }
            result = roomManager.updateCustomXI(
              roomCode,
              userId,
              msg.franchiseCode,
              msg.playerIds ?? null,
            );
            break;
          default:
            replyError(`Unsupported message type: ${msg.type}`);
            return;
        }

        if (!result.ok) {
          replyError(result.error ?? 'Action rejected.', result.code);
        } else {
          sendJson(ws, { type: 'action_ok', requestId: msg.requestId, action: msg.type });
          broadcastRoomState(roomCode);
        }
      } catch (err) {
        sendJson(ws, {
          type: 'action_error',
          error: err instanceof Error ? err.message : 'Malformed request payload.',
        });
      }
    });

    ws.on('close', () => {
      const meta = socketMap.get(ws);
      socketMap.delete(ws);
      if (meta?.roomCode) {
        const set = roomSockets.get(meta.roomCode);
        set?.delete(ws);
        // Mark disconnected only if no other active socket for same userId in room
        const stillOpen = Array.from(set ?? []).some(
          (other) => socketMap.get(other)?.userId === meta.userId,
        );
        if (!stillOpen && meta.userId) {
          roomManager.setParticipantConnected(meta.roomCode, meta.userId, false);
          broadcastRoomState(meta.roomCode);
        }
      }
    });
  });

  // Authoritative 100ms backend game loop (countdowns + AI bidder decisions + lot settlement)
  setInterval(() => {
    const dirtyCodes = roomManager.tickAll(Date.now());
    for (const code of dirtyCodes) {
      broadcastRoomState(code);
    }
  }, 100);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`IPL Auction Arena server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
