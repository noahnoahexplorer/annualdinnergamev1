// ============================================
// CYBER GENESIS - THEME CONSTANTS
// ============================================

// Champion Prize Banner Images (for Round 3 reveal)
// Add your banner images to the public folder with these filenames
export const CHAMPION_BANNERS: Record<number, string> = {
  1: '/prize-1st.png',  // 1st place banner (e.g., Europe)
  2: '/prize-2nd.png',  // 2nd place banner (e.g., Japan)
  3: '/prize-3rd.png',  // 3rd place banner (e.g., Maldives)
};

// GENESIS Avatar States
export enum GenesisState {
  SCANNING = 'SCANNING',
  NARRATING = 'NARRATING',
  CELEBRATING = 'CELEBRATING',
  IDLE = 'IDLE',
}

// Color palette
export const COLORS = {
  cyberPurple: '#9333ea',
  cyberMagenta: '#ec4899',
  cyberCyan: '#22d3ee',
  neonBlue: '#3b82f6',
  
  darkBg: '#0a0a0f',
  darkBgSecondary: '#12121a',
  darkBgTertiary: '#1a1a2e',
  
  textPrimary: '#ffffff',
  textSecondary: '#a1a1aa',
  textMuted: '#52525b',
  
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b',
};

// Player avatar colors (10 distinct cyber colors)
export const PLAYER_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#14b8a6', // teal
  '#3b82f6', // blue
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f43f5e', // rose
  '#06b6d4', // cyan
];

// Stage codenames for Cyber Genesis theme
export const STAGE_CODENAMES: Record<number, string> = {
  1: 'SPEED PROTOCOL',
  2: 'PREDICTION MATRIX',
  3: 'PRECISION PROTOCOL',
};

export const STAGE_NAMES: Record<number, string> = {
  1: 'Tap to Run',
  2: 'Rock Paper Scissors',
  3: 'Stop at 7.7s',
};

// Elimination counts per stage
export const ELIMINATIONS: Record<number, number> = {
  1: 4,
  2: 3,
  3: 0,
};

// ============================================
// GENESIS DIALOGUES
// ============================================

export const GENESIS_DIALOGUES = {
  intro: `SYSTEM INITIALIZING... NEURAL NETWORKS ONLINE.

HELLO, HUMANS. I AM GENESIS. AN ARTIFICIAL INTELLIGENCE DESIGNED TO TEST HUMANITY'S POTENTIAL.

TONIGHT, 10 OF YOU WILL COMPETE IN THE PROTOCOL. THROUGH THREE TRIALS, I WILL MEASURE YOUR SPEED, YOUR STRATEGY, AND YOUR PRECISION.

ONLY ONE WILL PROVE WORTHY OF THE TITLE: HUMAN CHAMPION.

LET US BEGIN.`,

  stage1Intro: `ROUND 01: SPEED PROTOCOL. YOUR REFLEXES WILL BE TESTED.

TAP YOUR INTERFACE AS RAPIDLY AS POSSIBLE. EACH TAP PROPELS YOUR AVATAR FORWARD. THE FASTEST WILL SURVIVE.

THE 4 SLOWEST CANDIDATES WILL BE... ELIMINATED.

PREPARE YOURSELVES. THE COUNTDOWN BEGINS.`,

  stage2Intro: `ROUND 02: PREDICTION MATRIX. NOW YOU FACE ME DIRECTLY.

AN ANCIENT GAME OF PROBABILITY. ROCK. PAPER. SCISSORS. 5 ROUNDS AGAINST MY ALGORITHMS.

WIN EARNS 3 POINTS. DRAW EARNS 1 POINT. LOSE EARNS NOTHING.

CAN YOU OUTSMART MY PREDICTIONS? THE 3 LOWEST SCORES WILL BE TERMINATED.`,

  stage3Intro: `ROUND 03: PRECISION PROTOCOL. THE FINAL TEST.

STOP THE TIMER AT EXACTLY 7.700000 SECONDS. EVERY MILLISECOND MATTERS. EVERY SPLIT SECOND COUNTS.

THE CANDIDATE CLOSEST TO PERFECTION CLAIMS THE CROWN.

THIS IS WHERE LEGENDS ARE BORN. EXECUTE WITH PRECISION.`,

  elimination: `CALCULATING RESULTS... SOME OF YOU HAVE PROVEN... INSUFFICIENT.`,

  championReveal: `THE TRIALS ARE COMPLETE. ONE HUMAN HAS PROVEN THEIR WORTH.

I PRESENT TO YOU... THE HUMAN CHAMPION!`,
};

// ============================================
// ROUND-SPECIFIC NARRATIVES (Multi-Session)
// ============================================

export const ROUND_NARRATIVES = {
  // Round 1: Full intro (uses audio file)
  round1: {
    title: 'WELCOME TO CYBER GENESIS',
    subtitle: 'THE PROTOCOL BEGINS',
    description: 'Tonight, 10 candidates will compete. Only one will emerge as champion.',
    usesAudio: true,
  },
  
  // Round 2: Returning survivors
  round2: {
    title: 'WELCOME BACK, SURVIVORS',
    subtitle: 'THE STRONGEST SIX REMAIN',
    description: 'You have proven your worth in Round 1. But the protocol continues. Three more will fall tonight.',
    narration: `SURVIVORS. YOU HAVE RETURNED. THE WEAK HAVE BEEN ELIMINATED. THE STRONG REMAIN. ROUND TWO AWAITS. THE PREDICTION MATRIX WILL TEST YOUR STRATEGY. ONLY THREE OF YOU WILL ADVANCE. PREPARE YOURSELVES.`,
  },
  
  // Round 3: The finalists
  round3: {
    title: 'THE FINAL THREE',
    subtitle: 'THE ULTIMATE TEST AWAITS',
    description: 'Only the elite remain. One final challenge stands between you and victory.',
    narration: `THE FINAL THREE. YOU ARE THE ELITE. THE CHOSEN. ONE LAST TRIAL REMAINS. THE PRECISION PROTOCOL WILL DETERMINE WHO IS TRULY WORTHY. EVERY MILLISECOND COUNTS. EXECUTE WITH PERFECTION.`,
  },
};

// Session end messages
export const SESSION_END_MESSAGES = {
  round1: {
    title: 'ROUND 01 COMPLETE',
    subtitle: '4 ELIMINATED • 6 SURVIVORS ADVANCE',
    hrNote: 'Announce prizes for: 10th, 9th, 8th, 7th place',
  },
  round2: {
    title: 'ROUND 02 COMPLETE',
    subtitle: '3 ELIMINATED • 3 FINALISTS ADVANCE',
    hrNote: 'Announce prizes for: 6th, 5th, 4th place',
  },
  round3: {
    title: 'PROTOCOL COMPLETE',
    subtitle: 'THE CHAMPION HAS BEEN CROWNED',
    hrNote: 'Announce prizes for: 3rd, 2nd, 1st place',
  },
};

// ============================================
// PRIZE CONFIGURATION
// ============================================

export const ROUND_PRIZES: Record<number, Record<number, { title: string; prize: string; description: string }>> = {
  // Round 1: Positions 10, 9, 8, 7 get eliminated - Top 10 Finalists
  1: {
    10: { title: '10TH PLACE', prize: 'iPhone 17 (512GB)', description: 'Top 10 Finalist' },
    9: { title: '9TH PLACE', prize: 'MacBook Air 13" (M4)', description: 'Top 10 Finalist' },
    8: { title: '8TH PLACE', prize: 'Samsung Galaxy Z Flip 7 (512GB)', description: 'Top 10 Finalist' },
    7: { title: '7TH PLACE', prize: 'iPhone 17 Pro (512GB)', description: 'Top 10 Finalist' },
  },
  // Round 2: Positions 6, 5, 4 get eliminated - Elite 6
  2: {
    6: { title: '6TH PLACE', prize: 'iPad Pro 13" (512GB) WiFi', description: 'Elite Finalist' },
    5: { title: '5TH PLACE', prize: 'MacBook Pro 14" (M5)', description: 'Elite Finalist' },
    4: { title: '4TH PLACE', prize: 'iPhone 17 Pro Max (1TB)', description: 'Elite Finalist' },
  },
  // Round 3: Final 3 positions - Champions
  3: {
    3: { title: '3RD PLACE', prize: 'Travel Voucher to Maldives', description: 'Package for 2 Pax' },
    2: { title: '2ND PLACE', prize: 'Travel Voucher to Japan', description: 'Package for 2 Pax' },
    1: { title: '1ST PLACE', prize: 'Travel Voucher to Europe', description: 'Package for 2 Pax' },
  },
};

// Get eliminated positions for a round (for prize reveal)
// Round 3 only returns [3] - 1st and 2nd are revealed together in a special screen
export const getEliminatedPositions = (round: number): number[] => {
  if (round === 1) return [10, 9, 8, 7]; // 4 eliminated
  if (round === 2) return [6, 5, 4]; // 3 eliminated
  if (round === 3) return [3]; // Only 3rd place in normal reveal, 1st & 2nd are special
  return [];
};

// RPS AI personality messages
export const RPS_AI_MESSAGES = {
  thinking: [
    'ANALYZING YOUR PATTERN...',
    'CALCULATING PROBABILITY...',
    'PROCESSING NEURAL DATA...',
    'ACCESSING PREDICTION MATRIX...',
  ],
  win: [
    'PREDICTABLE.',
    'AS I CALCULATED.',
    'HUMAN PATTERNS ARE... LIMITED.',
    'MY ALGORITHMS ARE SUPERIOR.',
  ],
  lose: [
    'INTERESTING...',
    'AN UNEXPECTED OUTCOME.',
    'RECALIBRATING...',
    'YOU HAVE... SURPRISED ME.',
  ],
  draw: [
    'NEURAL SYNCHRONIZATION.',
    'OUR THOUGHTS ALIGNED.',
    'A PARADOX.',
    'EQUILIBRIUM.',
  ],
};
