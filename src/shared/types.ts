export type GameMode = 'private_multiplayer' | 'practice' | 'admin_hosted';

export type AuctionOrderMode =
  | 'marquee_first'
  | 'role_wise'
  | 'random'
  | 'admin_selected';

export type UnclaimedTeamPolicy = 'ai' | 'inactive';

export type AiDifficulty = 'conservative' | 'balanced' | 'aggressive';

export type RoomStage =
  | 'LOBBY'
  | 'LIVE'
  | 'PAUSED'
  | 'ROUND_BREAK'
  | 'ACCELERATED'
  | 'COMPLETED';

export type PlayerRole = 'BAT' | 'WK' | 'AR' | 'BOWL';

export type BattingHand = 'LHB' | 'RHB';

export type BowlingStyle = 'PACE' | 'SPIN' | 'NONE';

export type BattingPosition = 'OPENER' | 'TOP' | 'MIDDLE' | 'FINISHER' | 'LOWER';

export type BowlingPhase = 'PP' | 'MIDDLE' | 'DEATH';

export type FranchiseCode =
  | 'MI'
  | 'CSK'
  | 'RCB'
  | 'KKR'
  | 'SRH'
  | 'RR'
  | 'DC'
  | 'PBKS'
  | 'GT'
  | 'LSG';

export interface FranchiseConfig {
  code: FranchiseCode;
  name: string;
  shortName: string;
  city: string;
  primaryColor: string;
  secondaryColor: string;
  textOnPrimary: string;
}

export interface PlayerStatsSnapshot {
  matches: number;
  runs: number;
  battingAvg: number;
  strikeRate: number;
  wickets: number;
  economy: number;
  bowlingAvg: number;
  catchesStumpings: number;
  recentForm: number; // 0-100
  dataCompleteness: number; // 0-1
  missingFields: string[];
}

export interface PlayerRatings {
  overall: number; // 0-100
  batting: number;
  bowling: number;
  fielding: number;
  opening: number;
  topOrder: number;
  middleOrder: number;
  finishing: number;
  wicketkeeping: number;
  powerplayBowling: number;
  middleBowling: number;
  deathBowling: number;
  fairValueLakhs: number;
}

export interface AuctionPlayer {
  id: string;
  name: string;
  country: string;
  isOverseas: boolean;
  age: number;
  role: PlayerRole;
  battingHand: BattingHand;
  bowlingStyle: BowlingStyle;
  bowlingSubType: string;
  battingPosition: BattingPosition;
  bowlingPhases: BowlingPhase[];
  basePriceLakhs: number;
  marquee: boolean;
  setCategory: string;
  stats: PlayerStatsSnapshot;
  ratings: PlayerRatings;
}

export interface BidIncrementTier {
  upToLakhs: number;
  incrementLakhs: number;
}

export interface AuctionSettings {
  mode: GameMode;
  purseLakhs: number;
  minSquadSize: number;
  enforceMinSquad: boolean;
  maxSquadSize: number;
  maxOverseas: number;
  minBasePriceLakhs: number;
  countdownSeconds: number;
  orderMode: AuctionOrderMode;
  enableSecondRound: boolean;
  unclaimedPolicy: UnclaimedTeamPolicy;
  aiDifficulty: AiDifficulty;
  aiTeamCount: number;
  allowGuests: boolean;
  allowSpectators: boolean;
  incrementTiers: BidIncrementTier[];
  customOrderIds: string[];
}

export interface SoldPlayerRecord {
  player: AuctionPlayer;
  soldPriceLakhs: number;
  soldAt: number;
  roundNumber: number;
}

export interface TeamState {
  franchiseCode: FranchiseCode;
  controllerType: 'human' | 'ai' | 'inactive';
  ownerParticipantId: string | null;
  ownerName: string | null;
  purseTotalLakhs: number;
  purseSpentLakhs: number;
  roster: SoldPlayerRecord[];
  customXIIds: string[] | null;
}

export type ParticipantRole = 'admin' | 'participant' | 'spectator';

export interface Participant {
  id: string;
  userId: string;
  name: string;
  isGuest: boolean;
  role: ParticipantRole;
  franchiseCode: FranchiseCode | null;
  ready: boolean;
  connected: boolean;
  lastSeenAt: number;
}

export interface BidEntry {
  id: string;
  amountLakhs: number;
  franchiseCode: FranchiseCode;
  bidderName: string;
  participantId: string | null;
  isAi: boolean;
  timestamp: number;
}

export interface AuctionEvent {
  id: string;
  type: 'SOLD' | 'UNSOLD' | 'BID' | 'NOMINATE' | 'REOPEN' | 'STAGE' | 'CLAIM' | 'SYSTEM';
  message: string;
  timestamp: number;
  playerId?: string;
  franchiseCode?: FranchiseCode;
  amountLakhs?: number;
}

export interface LotResolutionBanner {
  id: string;
  status: 'SOLD' | 'UNSOLD';
  playerName: string;
  playerRole: PlayerRole;
  franchiseCode?: FranchiseCode;
  amountLakhs?: number;
  timestamp: number;
}

export interface SquadFeasibility {
  totalPurseLakhs: number;
  spentPurseLakhs: number;
  availablePurseLakhs: number;
  currentSquadSize: number;
  overseasCount: number;
  remainingSlotsMax: number;
  minRemainingPlayers: number;
  minimumReserveLakhs: number;
  maxAffordableBidLakhs: number;
  squadCompletionPct: number;
  missingRoles: string[];
}

export interface BidValidationResult {
  allowed: boolean;
  code?:
    | 'NOT_LIVE'
    | 'NO_ACTIVE_LOT'
    | 'SPECTATOR_FORBIDDEN'
    | 'NO_FRANCHISE'
    | 'INACTIVE_FRANCHISE'
    | 'ALREADY_HIGHEST_BIDDER'
    | 'PLAYER_ALREADY_SOLD'
    | 'BELOW_MIN_INCREMENT'
    | 'EXCEEDS_PURSE'
    | 'SQUAD_FULL'
    | 'OVERSEAS_LIMIT'
    | 'RESERVE_VIOLATION';
  reason?: string;
  requiredBidLakhs: number;
  feasibility: SquadFeasibility;
}

export interface PlayingXIMetrics {
  openingScore: number;
  leftRightBalanceScore: number;
  topOrderScore: number;
  middleOrderScore: number;
  finishingScore: number;
  wicketkeepingScore: number;
  paceSpinBalanceScore: number;
  powerplayBowlingScore: number;
  middleBowlingScore: number;
  deathBowlingScore: number;
  allRounderScore: number;
  overseasCompliant: boolean;
  overseasCount: number;
  totalBowlingOptions: number;
  paceOptions: number;
  spinOptions: number;
  leftHandBattersTop7: number;
  hasKeeper: boolean;
  overallXIScore: number;
}

export interface BowlingPlanSlot {
  phase: BowlingPhase;
  bowlers: {
    playerId: string;
    name: string;
    bowlingStyle: BowlingStyle;
    phaseRating: number;
  }[];
}

export interface PlayingXIResult {
  xi: SoldPlayerRecord[];
  bench: SoldPlayerRecord[];
  metrics: PlayingXIMetrics;
  bowlingPlan: BowlingPlanSlot[];
  isCustom: boolean;
  warnings: string[];
}

export interface PlayerValueVerdict {
  playerId: string;
  playerName: string;
  role: PlayerRole;
  paidLakhs: number;
  fairValueLakhs: number;
  valueDeltaLakhs: number;
  valueRatio: number; // fairValue / paid
  label: 'Steal' | 'Good Value' | 'Fair Price' | 'Slight Overpay' | 'Overpay';
}

export interface TeamEvaluation {
  franchiseCode: FranchiseCode;
  franchiseName: string;
  ownerName: string;
  controllerType: 'human' | 'ai' | 'inactive';
  rank: number;
  championshipScore: number; // 0-100 deterministic overall team strength
  squadQualityScore: number; // 0-100 pure cricketing quality (no spend penalty)
  benchDepthScore: number; // 0-100
  auctionEfficiencyScore: number; // 0-100 value-for-money separate from quality
  purseSpentLakhs: number;
  purseRemainingLakhs: number;
  squadSize: number;
  overseasCount: number;
  playingXI: PlayingXIResult;
  bestPurchases: PlayerValueVerdict[];
  worstPurchases: PlayerValueVerdict[];
  allValueVerdicts: PlayerValueVerdict[];
  weaknesses: string[];
  missingRoles: string[];
  strengths: string[];
  confidenceLevel: 'High' | 'Medium' | 'Low';
  confidenceScore: number; // 0-100
  missingDataWarnings: string[];
}

export interface RoomEvaluationSnapshot {
  snapshotVersion: string;
  generatedAt: number;
  rankings: TeamEvaluation[];
}

export interface RoomState {
  roomCode: string;
  createdAt: number;
  stage: RoomStage;
  settings: AuctionSettings;
  participants: Participant[];
  teams: Record<FranchiseCode, TeamState>;
  currentPlayerId: string | null;
  currentBidLakhs: number;
  highestBidderFranchise: FranchiseCode | null;
  highestBidderName: string | null;
  bidHistory: BidEntry[];
  countdownRemainingMs: number;
  countdownTotalMs: number;
  roundNumber: 1 | 2;
  queuePlayerIds: string[];
  soldPlayerIds: string[];
  unsoldPlayerIds: string[];
  events: AuctionEvent[];
  lastResolution: LotResolutionBanner | null;
  statsSnapshotVersion: string;
  evaluation: RoomEvaluationSnapshot | null;
}

export interface UserSession {
  userId: string;
  name: string;
  isGuest: boolean;
  email?: string;
}

export interface AiAnalystReport {
  generatedAt: number;
  model: string;
  headline: string;
  summary: string;
  teamInsights: {
    franchiseCode: FranchiseCode;
    verdict: string;
    tacticalNote: string;
  }[];
  keyTakeaways: string[];
}
