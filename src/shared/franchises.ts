import { AuctionSettings, BidIncrementTier, FranchiseCode, FranchiseConfig } from './types';

export const FRANCHISES: FranchiseConfig[] = [
  {
    code: 'MI',
    name: 'Mumbai Indians',
    shortName: 'Mumbai',
    city: 'Mumbai',
    primaryColor: '#004BA0',
    secondaryColor: '#D1AB3E',
    textOnPrimary: '#FFFFFF',
  },
  {
    code: 'CSK',
    name: 'Chennai Super Kings',
    shortName: 'Chennai',
    city: 'Chennai',
    primaryColor: '#F9CD05',
    secondaryColor: '#1D418C',
    textOnPrimary: '#0F172A',
  },
  {
    code: 'RCB',
    name: 'Royal Challengers Bengaluru',
    shortName: 'Bengaluru',
    city: 'Bengaluru',
    primaryColor: '#C8102E',
    secondaryColor: '#1C1C1C',
    textOnPrimary: '#FFFFFF',
  },
  {
    code: 'KKR',
    name: 'Kolkata Knight Riders',
    shortName: 'Kolkata',
    city: 'Kolkata',
    primaryColor: '#3A225D',
    secondaryColor: '#D4AF37',
    textOnPrimary: '#FFFFFF',
  },
  {
    code: 'SRH',
    name: 'Sunrisers Hyderabad',
    shortName: 'Hyderabad',
    city: 'Hyderabad',
    primaryColor: '#F26522',
    secondaryColor: '#1C1C1C',
    textOnPrimary: '#FFFFFF',
  },
  {
    code: 'RR',
    name: 'Rajasthan Royals',
    shortName: 'Rajasthan',
    city: 'Jaipur',
    primaryColor: '#EA1A85',
    secondaryColor: '#254AA5',
    textOnPrimary: '#FFFFFF',
  },
  {
    code: 'DC',
    name: 'Delhi Capitals',
    shortName: 'Delhi',
    city: 'New Delhi',
    primaryColor: '#0057B8',
    secondaryColor: '#EF1B23',
    textOnPrimary: '#FFFFFF',
  },
  {
    code: 'PBKS',
    name: 'Punjab Kings',
    shortName: 'Punjab',
    city: 'Mohali',
    primaryColor: '#D71920',
    secondaryColor: '#C5A253',
    textOnPrimary: '#FFFFFF',
  },
  {
    code: 'GT',
    name: 'Gujarat Titans',
    shortName: 'Gujarat',
    city: 'Ahmedabad',
    primaryColor: '#1B2133',
    secondaryColor: '#D4AF37',
    textOnPrimary: '#FFFFFF',
  },
  {
    code: 'LSG',
    name: 'Lucknow Super Giants',
    shortName: 'Lucknow',
    city: 'Lucknow',
    primaryColor: '#0057E2',
    secondaryColor: '#F37021',
    textOnPrimary: '#FFFFFF',
  },
];

export const FRANCHISE_MAP: Record<FranchiseCode, FranchiseConfig> = FRANCHISES.reduce(
  (acc, f) => {
    acc[f.code] = f;
    return acc;
  },
  {} as Record<FranchiseCode, FranchiseConfig>,
);

export const FRANCHISE_CODES: FranchiseCode[] = FRANCHISES.map((f) => f.code);

export const DEFAULT_INCREMENT_TIERS: BidIncrementTier[] = [
  { upToLakhs: 100, incrementLakhs: 10 }, // Up to ₹1 Cr: +₹10L
  { upToLakhs: 200, incrementLakhs: 20 }, // ₹1 Cr - ₹2 Cr: +₹20L
  { upToLakhs: 500, incrementLakhs: 25 }, // ₹2 Cr - ₹5 Cr: +₹25L
  { upToLakhs: 1000, incrementLakhs: 50 }, // ₹5 Cr - ₹10 Cr: +₹50L
  { upToLakhs: 999999, incrementLakhs: 100 }, // Above ₹10 Cr: +₹1 Cr
];

export const DEFAULT_AUCTION_SETTINGS: AuctionSettings = {
  mode: 'private_multiplayer',
  purseLakhs: 10000, // ₹100.00 Cr
  minSquadSize: 15,
  enforceMinSquad: true,
  maxSquadSize: 25,
  maxOverseas: 8,
  minBasePriceLakhs: 30, // ₹30 L
  countdownSeconds: 5,
  orderMode: 'marquee_first',
  enableSecondRound: true,
  unclaimedPolicy: 'ai',
  aiDifficulty: 'balanced',
  aiTeamCount: 5,
  allowGuests: true,
  allowSpectators: true,
  incrementTiers: DEFAULT_INCREMENT_TIERS,
  customOrderIds: [],
};
