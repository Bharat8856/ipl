import crypto from 'node:crypto';
import {
  AuctionEvent,
  AuctionSettings,
  BidEntry,
  FranchiseCode,
  GameMode,
  Participant,
  ParticipantRole,
  RoomState,
  TeamState,
} from '../shared/types';
import {
  DEFAULT_AUCTION_SETTINGS,
  FRANCHISE_CODES,
  FRANCHISE_MAP,
} from '../shared/franchises';
import {
  AUCTION_PLAYERS,
  PLAYER_MAP,
  STATS_SNAPSHOT_VERSION,
  buildAuctionQueue,
} from '../shared/players';
import { formatCurrency, validateBid } from './bidding';
import { evaluateAllTeams } from './evaluator';
import { pickNextAiBidder } from './aiBidder';

export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  code?: string;
  data?: T;
}

export interface ManagedRoom {
  state: RoomState;
  countdownEndsAt: number | null;
  lastAiActionAt: number;
  nextAiDelayMs: number;
  resolvingLot: boolean;
  prePauseStage: 'LIVE' | 'ACCELERATED';
  seed: number;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(5).toString('hex')}`;
}

export class AuctionRoomManager {
  private rooms = new Map<string, ManagedRoom>();

  public getRoom(roomCode: string): ManagedRoom | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  public getAllRooms(): ManagedRoom[] {
    return Array.from(this.rooms.values());
  }

  public getSnapshot(roomCode: string, now = Date.now()): RoomState | null {
    const managed = this.getRoom(roomCode);
    if (!managed) return null;
    this.syncCountdownDisplay(managed, now);
    return managed.state;
  }

  private syncCountdownDisplay(managed: ManagedRoom, now: number): void {
    const { state } = managed;
    if (
      (state.stage === 'LIVE' || state.stage === 'ACCELERATED') &&
      managed.countdownEndsAt !== null
    ) {
      state.countdownRemainingMs = Math.max(0, managed.countdownEndsAt - now);
    }
  }

  private addEvent(
    state: RoomState,
    type: AuctionEvent['type'],
    message: string,
    extra?: Partial<Pick<AuctionEvent, 'playerId' | 'franchiseCode' | 'amountLakhs'>>,
    now = Date.now(),
  ): void {
    state.events.unshift({
      id: makeId('evt'),
      type,
      message,
      timestamp: now,
      ...extra,
    });
    if (state.events.length > 150) {
      state.events.length = 150;
    }
  }

  private createInitialTeams(settings: AuctionSettings): Record<FranchiseCode, TeamState> {
    const teams = {} as Record<FranchiseCode, TeamState>;
    for (const code of FRANCHISE_CODES) {
      teams[code] = {
        franchiseCode: code,
        controllerType: settings.unclaimedPolicy === 'ai' ? 'ai' : 'inactive',
        ownerParticipantId: null,
        ownerName: null,
        purseTotalLakhs: settings.purseLakhs,
        purseSpentLakhs: 0,
        roster: [],
        customXIIds: null,
      };
    }
    return teams;
  }

  private reconcileUnclaimedControllers(state: RoomState): void {
    const { settings, teams } = state;
    const unclaimed = FRANCHISE_CODES.filter((c) => teams[c].ownerParticipantId === null);

    if (settings.mode === 'practice') {
      // Practice mode: configurable number of AI opponents
      const desiredAi = Math.max(0, Math.min(unclaimed.length, settings.aiTeamCount));
      unclaimed.forEach((code, idx) => {
        teams[code].controllerType = idx < desiredAi ? 'ai' : 'inactive';
        teams[code].ownerName = idx < desiredAi ? `AI Manager` : null;
      });
    } else {
      for (const code of unclaimed) {
        teams[code].controllerType = settings.unclaimedPolicy === 'ai' ? 'ai' : 'inactive';
        teams[code].ownerName = settings.unclaimedPolicy === 'ai' ? 'AI Manager' : null;
      }
    }
  }

  public createRoom(params: {
    hostUserId: string;
    hostName: string;
    isGuest: boolean;
    mode: GameMode;
    partialSettings?: Partial<AuctionSettings>;
    now?: number;
  }): ManagedRoom {
    const now = params.now ?? Date.now();
    let roomCode = generateRoomCode();
    while (this.rooms.has(roomCode)) {
      roomCode = generateRoomCode();
    }

    const modeDefaults: Partial<AuctionSettings> =
      params.mode === 'practice'
        ? {
            mode: 'practice',
            unclaimedPolicy: 'ai',
            aiTeamCount: 5,
            minSquadSize: 12,
            countdownSeconds: 5,
          }
        : params.mode === 'admin_hosted'
          ? {
              mode: 'admin_hosted',
              unclaimedPolicy: 'inactive',
              countdownSeconds: 5,
            }
          : {
              mode: 'private_multiplayer',
              unclaimedPolicy: 'ai',
              countdownSeconds: 5,
            };

    const settings: AuctionSettings = {
      ...DEFAULT_AUCTION_SETTINGS,
      ...modeDefaults,
      ...params.partialSettings,
      mode: params.mode,
    };

    const seed = Math.floor(Math.random() * 100000) + 1;
    const queuePlayerIds = buildAuctionQueue(
      AUCTION_PLAYERS,
      settings.orderMode,
      settings.customOrderIds,
      seed,
    );

    const hostParticipant: Participant = {
      id: makeId('part'),
      userId: params.hostUserId,
      name: params.hostName.trim() || 'Host',
      isGuest: params.isGuest,
      role: 'admin',
      franchiseCode: null,
      ready: false,
      connected: true,
      lastSeenAt: now,
    };

    const state: RoomState = {
      roomCode,
      createdAt: now,
      stage: 'LOBBY',
      settings,
      participants: [hostParticipant],
      teams: this.createInitialTeams(settings),
      currentPlayerId: null,
      currentBidLakhs: 0,
      highestBidderFranchise: null,
      highestBidderName: null,
      bidHistory: [],
      countdownRemainingMs: settings.countdownSeconds * 1000,
      countdownTotalMs: settings.countdownSeconds * 1000,
      roundNumber: 1,
      queuePlayerIds,
      soldPlayerIds: [],
      unsoldPlayerIds: [],
      events: [],
      lastResolution: null,
      statsSnapshotVersion: STATS_SNAPSHOT_VERSION,
      evaluation: null,
    };

    this.reconcileUnclaimedControllers(state);
    this.addEvent(
      state,
      'STAGE',
      `Room ${roomCode} created by ${hostParticipant.name} (${params.mode.replace('_', ' ')}).`,
      undefined,
      now,
    );

    const managed: ManagedRoom = {
      state,
      countdownEndsAt: null,
      lastAiActionAt: now,
      nextAiDelayMs: 900,
      resolvingLot: false,
      prePauseStage: 'LIVE',
      seed,
    };

    this.rooms.set(roomCode, managed);
    return managed;
  }

  /**
   * Join or reconnect an existing participant (preserving franchise ownership and admin role!).
   */
  public joinRoom(params: {
    roomCode: string;
    userId: string;
    name: string;
    isGuest: boolean;
    asSpectator?: boolean;
    now?: number;
  }): ActionResult<{ participant: Participant; reconnected: boolean }> {
    const now = params.now ?? Date.now();
    const managed = this.getRoom(params.roomCode);
    if (!managed) {
      return { ok: false, code: 'ROOM_NOT_FOUND', error: `Room "${params.roomCode}" does not exist.` };
    }

    const { state } = managed;
    const existing = state.participants.find((p) => p.userId === params.userId);

    if (existing) {
      const wasDisconnected = !existing.connected;
      existing.connected = true;
      existing.lastSeenAt = now;
      if (params.name.trim()) existing.name = params.name.trim();
      this.syncCountdownDisplay(managed, now);
      if (wasDisconnected) {
        this.addEvent(state, 'SYSTEM', `${existing.name} reconnected to the room.`, undefined, now);
      }
      return { ok: true, data: { participant: existing, reconnected: wasDisconnected } };
    }

    if (params.isGuest && !state.settings.allowGuests) {
      return {
        ok: false,
        code: 'GUESTS_DISABLED',
        error: 'Guest access is disabled by the room admin.',
      };
    }

    const wantsSpectator = Boolean(params.asSpectator);
    if (wantsSpectator && !state.settings.allowSpectators) {
      return {
        ok: false,
        code: 'SPECTATORS_DISABLED',
        error: 'Spectator mode is disabled for this room.',
      };
    }

    // If auction is already underway, new non-existing users join as spectators (if enabled)
    const role: ParticipantRole =
      wantsSpectator || state.stage !== 'LOBBY' ? 'spectator' : 'participant';

    if (role === 'spectator' && !state.settings.allowSpectators) {
      return {
        ok: false,
        code: 'AUCTION_IN_PROGRESS',
        error: 'Auction already started and spectator mode is disabled.',
      };
    }

    const participant: Participant = {
      id: makeId('part'),
      userId: params.userId,
      name: params.name.trim() || 'Player',
      isGuest: params.isGuest,
      role,
      franchiseCode: null,
      ready: role === 'spectator',
      connected: true,
      lastSeenAt: now,
    };

    state.participants.push(participant);
    this.addEvent(
      state,
      'SYSTEM',
      `${participant.name} joined as ${role === 'spectator' ? 'Spectator' : 'Participant'}.`,
      undefined,
      now,
    );

    return { ok: true, data: { participant, reconnected: false } };
  }

  public setParticipantConnected(
    roomCode: string,
    userId: string,
    connected: boolean,
    now = Date.now(),
  ): void {
    const managed = this.getRoom(roomCode);
    if (!managed) return;
    const p = managed.state.participants.find((x) => x.userId === userId);
    if (!p || p.connected === connected) return;
    p.connected = connected;
    p.lastSeenAt = now;
    this.addEvent(
      managed.state,
      'SYSTEM',
      `${p.name} ${connected ? 'reconnected' : 'disconnected'}.`,
      undefined,
      now,
    );
  }

  private requireAdmin(managed: ManagedRoom, userId: string): ActionResult {
    const p = managed.state.participants.find((x) => x.userId === userId);
    if (!p || p.role !== 'admin') {
      return {
        ok: false,
        code: 'ADMIN_ONLY',
        error: 'Only the room admin can perform this action.',
      };
    }
    return { ok: true };
  }

  public updateSettings(
    roomCode: string,
    userId: string,
    patch: Partial<AuctionSettings>,
    now = Date.now(),
  ): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };

    const auth = this.requireAdmin(managed, userId);
    if (!auth.ok) return auth;

    const { state } = managed;
    if (state.stage !== 'LOBBY') {
      return {
        ok: false,
        code: 'SETTINGS_LOCKED',
        error: 'Auction settings can only be changed in the lobby.',
      };
    }

    const merged: AuctionSettings = {
      ...state.settings,
      ...patch,
      purseLakhs: Math.max(2000, Math.min(20000, patch.purseLakhs ?? state.settings.purseLakhs)),
      minSquadSize: Math.max(11, Math.min(20, patch.minSquadSize ?? state.settings.minSquadSize)),
      maxSquadSize: Math.max(
        patch.minSquadSize ?? state.settings.minSquadSize,
        Math.min(25, patch.maxSquadSize ?? state.settings.maxSquadSize),
      ),
      maxOverseas: Math.max(4, Math.min(8, patch.maxOverseas ?? state.settings.maxOverseas)),
      minBasePriceLakhs: Math.max(
        20,
        Math.min(200, patch.minBasePriceLakhs ?? state.settings.minBasePriceLakhs),
      ),
      countdownSeconds: Math.max(
        3,
        Math.min(15, patch.countdownSeconds ?? state.settings.countdownSeconds),
      ),
      aiTeamCount: Math.max(1, Math.min(9, patch.aiTeamCount ?? state.settings.aiTeamCount)),
    };

    state.settings = merged;
    state.countdownTotalMs = merged.countdownSeconds * 1000;
    state.countdownRemainingMs = merged.countdownSeconds * 1000;

    for (const code of FRANCHISE_CODES) {
      state.teams[code].purseTotalLakhs = merged.purseLakhs;
    }

    state.queuePlayerIds = buildAuctionQueue(
      AUCTION_PLAYERS,
      merged.orderMode,
      merged.customOrderIds,
      managed.seed,
    );

    this.reconcileUnclaimedControllers(state);
    this.addEvent(state, 'SYSTEM', 'Admin updated auction rules and configuration.', undefined, now);
    return { ok: true };
  }

  /**
   * Transactional franchise claiming — guarantees no duplicate franchise claims even under simultaneous requests.
   */
  public claimFranchise(
    roomCode: string,
    userId: string,
    franchiseCode: FranchiseCode,
    now = Date.now(),
  ): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const { state } = managed;

    if (state.stage !== 'LOBBY') {
      return {
        ok: false,
        code: 'CLAIM_LOCKED',
        error: 'Franchises can only be claimed in the waiting lobby.',
      };
    }

    const participant = state.participants.find((p) => p.userId === userId);
    if (!participant) return { ok: false, error: 'Participant not found.' };

    if (participant.role === 'spectator') {
      return {
        ok: false,
        code: 'SPECTATOR_FORBIDDEN',
        error: 'Spectators cannot claim a franchise.',
      };
    }

    const targetTeam = state.teams[franchiseCode];
    if (!targetTeam) return { ok: false, error: 'Invalid franchise code.' };

    // Prevent duplicate team claim
    if (
      targetTeam.ownerParticipantId !== null &&
      targetTeam.ownerParticipantId !== participant.id
    ) {
      return {
        ok: false,
        code: 'FRANCHISE_TAKEN',
        error: `${FRANCHISE_MAP[franchiseCode].name} is already claimed by ${targetTeam.ownerName}.`,
      };
    }

    // Release previous claim if switching franchises
    if (participant.franchiseCode && participant.franchiseCode !== franchiseCode) {
      const prevTeam = state.teams[participant.franchiseCode];
      prevTeam.ownerParticipantId = null;
      prevTeam.ownerName = null;
    }

    targetTeam.controllerType = 'human';
    targetTeam.ownerParticipantId = participant.id;
    targetTeam.ownerName = participant.name;
    participant.franchiseCode = franchiseCode;
    participant.ready = true;

    this.reconcileUnclaimedControllers(state);
    this.addEvent(
      state,
      'CLAIM',
      `${participant.name} claimed ${FRANCHISE_MAP[franchiseCode].name} (${franchiseCode}).`,
      { franchiseCode },
      now,
    );

    return { ok: true };
  }

  public releaseFranchise(roomCode: string, userId: string, now = Date.now()): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const { state } = managed;
    if (state.stage !== 'LOBBY') {
      return { ok: false, error: 'Cannot release franchise after auction has started.' };
    }

    const participant = state.participants.find((p) => p.userId === userId);
    if (!participant || !participant.franchiseCode) return { ok: true };

    const code = participant.franchiseCode;
    state.teams[code].ownerParticipantId = null;
    state.teams[code].ownerName = null;
    participant.franchiseCode = null;
    participant.ready = false;

    this.reconcileUnclaimedControllers(state);
    this.addEvent(
      state,
      'CLAIM',
      `${participant.name} released ${FRANCHISE_MAP[code].name}.`,
      { franchiseCode: code },
      now,
    );
    return { ok: true };
  }

  public toggleReady(roomCode: string, userId: string): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const participant = managed.state.participants.find((p) => p.userId === userId);
    if (!participant) return { ok: false, error: 'Participant not found.' };
    if (participant.role === 'spectator') return { ok: true };
    participant.ready = !participant.ready;
    return { ok: true };
  }

  public startAuction(roomCode: string, userId: string, now = Date.now()): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };

    const auth = this.requireAdmin(managed, userId);
    if (!auth.ok) return auth;

    const { state } = managed;
    if (state.stage !== 'LOBBY') {
      return { ok: false, error: 'Auction has already started.' };
    }

    this.reconcileUnclaimedControllers(state);

    const activeTeams = Object.values(state.teams).filter((t) => t.controllerType !== 'inactive');
    if (activeTeams.length < 2) {
      return {
        ok: false,
        code: 'MIN_TEAMS_REQUIRED',
        error: 'At least 2 active franchises (human or AI) are required to start the auction.',
      };
    }

    // In private multiplayer, require at least 1 human franchise claimed (unless admin-hosted where participants claimed)
    const humanTeams = activeTeams.filter((t) => t.controllerType === 'human');
    if (humanTeams.length === 0) {
      return {
        ok: false,
        code: 'CLAIM_REQUIRED',
        error: 'At least one participant must claim a franchise before starting.',
      };
    }

    state.stage = 'LIVE';
    state.roundNumber = 1;
    state.evaluation = evaluateAllTeams(state.teams, state.settings);
    this.addEvent(
      state,
      'STAGE',
      `Auction started! ${activeTeams.length} franchises competing (${humanTeams.length} human, ${activeTeams.length - humanTeams.length} AI).`,
      undefined,
      now,
    );

    this.advanceToNextPlayer(managed, now);
    return { ok: true };
  }

  private presentPlayer(managed: ManagedRoom, playerId: string, now: number): void {
    const { state } = managed;
    const player = PLAYER_MAP[playerId];
    if (!player) return;

    state.currentPlayerId = player.id;
    state.currentBidLakhs = player.basePriceLakhs;
    state.highestBidderFranchise = null;
    state.highestBidderName = null;
    state.bidHistory = [];
    state.countdownTotalMs = state.settings.countdownSeconds * 1000;
    state.countdownRemainingMs = state.countdownTotalMs;
    managed.countdownEndsAt = now + state.countdownTotalMs;
    managed.lastAiActionAt = now;
    managed.nextAiDelayMs = 750 + Math.floor(Math.random() * 550);
    managed.resolvingLot = false;
  }

  private advanceToNextPlayer(managed: ManagedRoom, now: number): void {
    const { state } = managed;

    // Pull next eligible (not already sold) player from queue
    while (state.queuePlayerIds.length > 0) {
      const nextId = state.queuePlayerIds.shift()!;
      if (!state.soldPlayerIds.includes(nextId) && PLAYER_MAP[nextId]) {
        this.presentPlayer(managed, nextId, now);
        return;
      }
    }

    // Queue exhausted!
    state.currentPlayerId = null;
    state.currentBidLakhs = 0;
    state.highestBidderFranchise = null;
    state.highestBidderName = null;
    state.bidHistory = [];
    managed.countdownEndsAt = null;
    state.countdownRemainingMs = 0;

    if (state.roundNumber === 1 && state.settings.enableSecondRound && state.unsoldPlayerIds.length > 0) {
      state.stage = 'ROUND_BREAK';
      this.addEvent(
        state,
        'STAGE',
        `Round 1 complete. ${state.unsoldPlayerIds.length} unsold players are eligible for the Accelerated Second Round.`,
        undefined,
        now,
      );
    } else {
      state.stage = 'ROUND_BREAK';
      this.addEvent(
        state,
        'STAGE',
        'All queued players processed. Admin may nominate/reopen unsold players or complete the auction.',
        undefined,
        now,
      );
    }
    state.evaluation = evaluateAllTeams(state.teams, state.settings);
  }

  /**
   * Transactional bid placement (used for both Human and AI bids).
   */
  public placeBid(params: {
    roomCode: string;
    userId: string | null;
    franchiseCode?: FranchiseCode;
    proposedBidLakhs?: number;
    isAi?: boolean;
    now?: number;
  }): ActionResult<{ bid: BidEntry }> {
    const now = params.now ?? Date.now();
    const managed = this.getRoom(params.roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };

    const { state } = managed;
    if (managed.resolvingLot) {
      return { ok: false, code: 'LOT_LOCKED', error: 'Lot result is being finalized.' };
    }

    const participant = params.userId
      ? state.participants.find((p) => p.userId === params.userId) ?? null
      : null;

    const targetCode = params.isAi
      ? params.franchiseCode ?? null
      : participant?.franchiseCode ?? null;

    const team = targetCode ? state.teams[targetCode] : null;
    const player = state.currentPlayerId ? PLAYER_MAP[state.currentPlayerId] : null;

    const validation = validateBid({
      stage: state.stage,
      participant,
      team,
      player,
      soldPlayerIds: state.soldPlayerIds,
      currentBidLakhs: state.currentBidLakhs,
      highestBidderFranchise: state.highestBidderFranchise,
      proposedBidLakhs: params.proposedBidLakhs,
      settings: state.settings,
      isAiBid: Boolean(params.isAi),
    });

    if (!validation.allowed || !team || !player) {
      return {
        ok: false,
        code: validation.code,
        error: validation.reason ?? 'Bid rejected.',
      };
    }

    const acceptedAmount = params.proposedBidLakhs ?? validation.requiredBidLakhs;
    const bidderName = params.isAi
      ? `${FRANCHISE_MAP[team.franchiseCode].shortName} AI`
      : participant?.name ?? team.ownerName ?? team.franchiseCode;

    const entry: BidEntry = {
      id: makeId('bid'),
      amountLakhs: acceptedAmount,
      franchiseCode: team.franchiseCode,
      bidderName,
      participantId: participant?.id ?? null,
      isAi: Boolean(params.isAi),
      timestamp: now,
    };

    state.currentBidLakhs = acceptedAmount;
    state.highestBidderFranchise = team.franchiseCode;
    state.highestBidderName = bidderName;
    state.bidHistory.unshift(entry);
    if (state.bidHistory.length > 25) state.bidHistory.length = 25;

    // Backend resets exact countdown on every accepted bid!
    state.countdownTotalMs = state.settings.countdownSeconds * 1000;
    state.countdownRemainingMs = state.countdownTotalMs;
    managed.countdownEndsAt = now + state.countdownTotalMs;
    managed.lastAiActionAt = now;
    managed.nextAiDelayMs = 700 + Math.floor(Math.random() * 600);

    this.addEvent(
      state,
      'BID',
      `${team.franchiseCode} (${bidderName}) bid ${formatCurrency(acceptedAmount)} for ${player.name}.`,
      { playerId: player.id, franchiseCode: team.franchiseCode, amountLakhs: acceptedAmount },
      now,
    );

    return { ok: true, data: { bid: entry } };
  }

  /**
   * Atomically locks and settles the active lot (SOLD or UNSOLD) — guarantees purse deducted exactly once
   * and prevents any player from being sold twice in the same room.
   */
  public resolveCurrentLot(roomCode: string, now = Date.now()): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const { state } = managed;

    if (managed.resolvingLot || !state.currentPlayerId) {
      return { ok: false, error: 'No active lot to resolve.' };
    }

    managed.resolvingLot = true;
    const player = PLAYER_MAP[state.currentPlayerId];
    if (!player) {
      managed.resolvingLot = false;
      return { ok: false, error: 'Player not found.' };
    }

    // Hard duplicate-sale prevention guard
    if (state.soldPlayerIds.includes(player.id)) {
      this.advanceToNextPlayer(managed, now);
      return { ok: false, code: 'DUPLICATE_SALE_BLOCKED', error: 'Player already sold.' };
    }

    if (state.highestBidderFranchise) {
      const winner = state.teams[state.highestBidderFranchise];
      const finalPrice = state.currentBidLakhs;

      // Final atomic deduction — executed exactly once
      winner.purseSpentLakhs += finalPrice;
      winner.roster.push({
        player,
        soldPriceLakhs: finalPrice,
        soldAt: now,
        roundNumber: state.roundNumber,
      });

      state.soldPlayerIds.push(player.id);
      state.unsoldPlayerIds = state.unsoldPlayerIds.filter((id) => id !== player.id);
      state.lastResolution = {
        id: makeId('res'),
        status: 'SOLD',
        playerName: player.name,
        playerRole: player.role,
        franchiseCode: winner.franchiseCode,
        amountLakhs: finalPrice,
        timestamp: now,
      };
      this.addEvent(
        state,
        'SOLD',
        `SOLD! ${player.name} joins ${FRANCHISE_MAP[winner.franchiseCode].name} for ${formatCurrency(finalPrice)}.`,
        { playerId: player.id, franchiseCode: winner.franchiseCode, amountLakhs: finalPrice },
        now,
      );
    } else {
      if (!state.unsoldPlayerIds.includes(player.id)) {
        state.unsoldPlayerIds.push(player.id);
      }
      state.lastResolution = {
        id: makeId('res'),
        status: 'UNSOLD',
        playerName: player.name,
        playerRole: player.role,
        timestamp: now,
      };
      this.addEvent(
        state,
        'UNSOLD',
        `UNSOLD: ${player.name} received no bids at base price ${formatCurrency(player.basePriceLakhs)}.`,
        { playerId: player.id },
        now,
      );
    }

    // Update live team strength snapshot after every lot
    state.evaluation = evaluateAllTeams(state.teams, state.settings);

    this.advanceToNextPlayer(managed, now);
    return { ok: true };
  }

  public pauseAuction(roomCode: string, userId: string, now = Date.now()): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const auth = this.requireAdmin(managed, userId);
    if (!auth.ok) return auth;

    const { state } = managed;
    if (state.stage !== 'LIVE' && state.stage !== 'ACCELERATED') {
      return { ok: false, error: 'Auction is not running.' };
    }

    // Preserve exact remaining countdown in milliseconds!
    const exactRemaining =
      managed.countdownEndsAt !== null
        ? Math.max(0, managed.countdownEndsAt - now)
        : state.countdownRemainingMs;

    managed.prePauseStage = state.stage;
    managed.countdownEndsAt = null;
    state.countdownRemainingMs = exactRemaining;
    state.stage = 'PAUSED';

    this.addEvent(
      state,
      'STAGE',
      `Auction paused by admin (${(exactRemaining / 1000).toFixed(1)}s preserved on clock).`,
      undefined,
      now,
    );
    return { ok: true };
  }

  public resumeAuction(roomCode: string, userId: string, now = Date.now()): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const auth = this.requireAdmin(managed, userId);
    if (!auth.ok) return auth;

    const { state } = managed;
    if (state.stage !== 'PAUSED') {
      return { ok: false, error: 'Auction is not paused.' };
    }

    const preserved = Math.max(200, state.countdownRemainingMs);
    state.stage = managed.prePauseStage;
    managed.countdownEndsAt = now + preserved;
    managed.lastAiActionAt = now;

    this.addEvent(
      state,
      'STAGE',
      `Auction resumed by admin with ${(preserved / 1000).toFixed(1)}s remaining.`,
      undefined,
      now,
    );
    return { ok: true };
  }

  public forceFinalizeLot(roomCode: string, userId: string, now = Date.now()): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const auth = this.requireAdmin(managed, userId);
    if (!auth.ok) return auth;

    if (managed.state.stage !== 'LIVE' && managed.state.stage !== 'ACCELERATED') {
      return { ok: false, error: 'Auction must be live to finalize the current lot.' };
    }
    return this.resolveCurrentLot(roomCode, now);
  }

  public nominatePlayer(
    roomCode: string,
    userId: string,
    playerId: string,
    now = Date.now(),
  ): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const auth = this.requireAdmin(managed, userId);
    if (!auth.ok) return auth;

    const { state } = managed;
    if (state.stage === 'COMPLETED' || state.stage === 'LOBBY') {
      return { ok: false, error: 'Can only nominate players during an active auction.' };
    }

    const player = PLAYER_MAP[playerId];
    if (!player) return { ok: false, error: 'Player not found.' };

    if (state.soldPlayerIds.includes(playerId)) {
      return {
        ok: false,
        code: 'PLAYER_ALREADY_SOLD',
        error: `${player.name} has already been sold in this room.`,
      };
    }

    if (state.currentPlayerId === playerId) {
      return { ok: false, error: `${player.name} is already on the podium.` };
    }

    // If there is an active lot with no bids, return it to front of queue; if bids exist, block overwrite
    if (state.currentPlayerId && state.highestBidderFranchise) {
      return {
        ok: false,
        error: 'Finish or resolve the active bidding lot before manually nominating another player.',
      };
    }

    if (state.currentPlayerId) {
      state.queuePlayerIds.unshift(state.currentPlayerId);
    }

    state.queuePlayerIds = state.queuePlayerIds.filter((id) => id !== playerId);
    state.unsoldPlayerIds = state.unsoldPlayerIds.filter((id) => id !== playerId);

    if (state.stage === 'ROUND_BREAK' || state.stage === 'PAUSED') {
      state.stage = state.roundNumber === 2 ? 'ACCELERATED' : 'LIVE';
    }

    this.presentPlayer(managed, playerId, now);
    this.addEvent(
      state,
      'NOMINATE',
      `Admin nominated ${player.name} to the auction podium.`,
      { playerId },
      now,
    );
    return { ok: true };
  }

  public reopenUnsoldPlayers(
    roomCode: string,
    userId: string,
    playerIds: string[],
    now = Date.now(),
  ): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const auth = this.requireAdmin(managed, userId);
    if (!auth.ok) return auth;

    const { state } = managed;
    if (state.stage === 'COMPLETED' || state.stage === 'LOBBY') {
      return { ok: false, error: 'Cannot reopen players in current stage.' };
    }

    const validIds = playerIds.filter(
      (id) =>
        state.unsoldPlayerIds.includes(id) &&
        !state.soldPlayerIds.includes(id) &&
        !state.queuePlayerIds.includes(id) &&
        state.currentPlayerId !== id,
    );

    if (validIds.length === 0) {
      return { ok: false, error: 'No eligible unsold players selected.' };
    }

    state.unsoldPlayerIds = state.unsoldPlayerIds.filter((id) => !validIds.includes(id));
    state.queuePlayerIds.push(...validIds);

    this.addEvent(
      state,
      'REOPEN',
      `Admin reopened ${validIds.length} unsold player${validIds.length === 1 ? '' : 's'} into the queue.`,
      undefined,
      now,
    );

    if (!state.currentPlayerId) {
      state.stage = state.roundNumber === 2 ? 'ACCELERATED' : 'LIVE';
      this.advanceToNextPlayer(managed, now);
    }
    return { ok: true };
  }

  public startAcceleratedRound(
    roomCode: string,
    userId: string,
    now = Date.now(),
  ): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const auth = this.requireAdmin(managed, userId);
    if (!auth.ok) return auth;

    const { state } = managed;
    if (state.unsoldPlayerIds.length === 0) {
      return { ok: false, error: 'There are no unsold players for an accelerated round.' };
    }

    state.roundNumber = 2;
    state.stage = 'ACCELERATED';
    const eligible = state.unsoldPlayerIds.filter((id) => !state.soldPlayerIds.includes(id));
    state.unsoldPlayerIds = [];
    state.queuePlayerIds = [...eligible, ...state.queuePlayerIds];

    this.addEvent(
      state,
      'STAGE',
      `Accelerated Second Round started with ${eligible.length} unsold players.`,
      undefined,
      now,
    );

    if (!state.currentPlayerId) {
      this.advanceToNextPlayer(managed, now);
    }
    return { ok: true };
  }

  public reorderQueue(
    roomCode: string,
    userId: string,
    orderedPlayerIds: string[],
    now = Date.now(),
  ): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const auth = this.requireAdmin(managed, userId);
    if (!auth.ok) return auth;

    const { state } = managed;
    const currentQueueSet = new Set(state.queuePlayerIds);
    const sanitized = orderedPlayerIds.filter((id) => currentQueueSet.has(id));
    const missing = state.queuePlayerIds.filter((id) => !sanitized.includes(id));
    state.queuePlayerIds = [...sanitized, ...missing];

    this.addEvent(state, 'SYSTEM', 'Admin updated upcoming player auction order.', undefined, now);
    return { ok: true };
  }

  public completeAuction(roomCode: string, userId: string, now = Date.now()): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const auth = this.requireAdmin(managed, userId);
    if (!auth.ok) return auth;

    const { state } = managed;
    if (state.stage === 'LOBBY') {
      return { ok: false, error: 'Auction has not started yet.' };
    }

    // If an active lot has a winning bid, lock it first so no purchase is lost
    if (state.currentPlayerId && state.highestBidderFranchise && !managed.resolvingLot) {
      this.resolveCurrentLot(roomCode, now);
    }

    state.currentPlayerId = null;
    state.currentBidLakhs = 0;
    state.highestBidderFranchise = null;
    state.highestBidderName = null;
    state.bidHistory = [];
    managed.countdownEndsAt = null;
    state.countdownRemainingMs = 0;
    state.stage = 'COMPLETED';
    state.evaluation = evaluateAllTeams(state.teams, state.settings);

    this.addEvent(
      state,
      'STAGE',
      `Auction completed! Final evaluations computed using snapshot ${state.statsSnapshotVersion}.`,
      undefined,
      now,
    );

    return { ok: true };
  }

  public updateCustomXI(
    roomCode: string,
    userId: string,
    franchiseCode: FranchiseCode,
    playerIds: string[] | null,
  ): ActionResult {
    const managed = this.getRoom(roomCode);
    if (!managed) return { ok: false, error: 'Room not found.' };
    const { state } = managed;

    const participant = state.participants.find((p) => p.userId === userId);
    if (!participant) return { ok: false, error: 'Participant not found.' };

    const team = state.teams[franchiseCode];
    if (!team) return { ok: false, error: 'Invalid franchise.' };

    // Only franchise owner or room admin can edit a team's custom XI
    const isOwner = participant.franchiseCode === franchiseCode;
    const isAdmin = participant.role === 'admin';
    if (!isOwner && !isAdmin) {
      return { ok: false, error: 'Only the franchise owner or room admin can edit this Playing XI.' };
    }

    if (playerIds !== null) {
      const rosterIds = new Set(team.roster.map((r) => r.player.id));
      const unique = Array.from(new Set(playerIds)).filter((id) => rosterIds.has(id));
      if (unique.length > 11) {
        return { ok: false, error: 'Playing XI cannot exceed 11 players.' };
      }
      team.customXIIds = unique;
    } else {
      team.customXIIds = null;
    }

    state.evaluation = evaluateAllTeams(state.teams, state.settings);
    return { ok: true };
  }

  /**
   * Advances backend countdowns and AI bidder ticks.
   * Returns list of roomCodes whose state changed and need broadcast.
   */
  public tickAll(now = Date.now()): string[] {
    const dirtyRooms: string[] = [];

    for (const managed of this.rooms.values()) {
      const { state } = managed;
      if (state.stage !== 'LIVE' && state.stage !== 'ACCELERATED') continue;
      if (!state.currentPlayerId || managed.countdownEndsAt === null) continue;

      const remaining = Math.max(0, managed.countdownEndsAt - now);
      const prevRemaining = state.countdownRemainingMs;
      state.countdownRemainingMs = remaining;

      // Trigger AI bidder if eligible and reaction delay elapsed
      if (remaining > 600 && now - managed.lastAiActionAt >= managed.nextAiDelayMs) {
        const player = PLAYER_MAP[state.currentPlayerId];
        if (player) {
          const aiMove = pickNextAiBidder(state, player);
          managed.lastAiActionAt = now;
          if (aiMove) {
            const res = this.placeBid({
              roomCode: state.roomCode,
              userId: null,
              franchiseCode: aiMove.franchiseCode,
              proposedBidLakhs: aiMove.bidAmountLakhs,
              isAi: true,
              now,
            });
            if (res.ok) {
              dirtyRooms.push(state.roomCode);
              continue;
            }
          } else {
            // No AI wants to bid further at current price — wait longer before rechecking
            managed.nextAiDelayMs = 2500;
          }
        }
      }

      // Countdown hit 0 -> atomically resolve lot!
      if (remaining <= 0) {
        this.resolveCurrentLot(state.roomCode, now);
        dirtyRooms.push(state.roomCode);
        continue;
      }

      // Emit smooth periodic countdown updates (every ~200ms)
      if (Math.floor(prevRemaining / 200) !== Math.floor(remaining / 200)) {
        dirtyRooms.push(state.roomCode);
      }
    }

    return dirtyRooms;
  }
}
