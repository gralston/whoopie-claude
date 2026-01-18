// ============================================================================
// Card Types
// ============================================================================

export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'] as const;
export type Rank = (typeof RANKS)[number];

// Numeric values for comparison (A=14, K=13, ..., 2=2)
export const RANK_VALUES: Record<Rank, number> = {
  'A': 14, 'K': 13, 'Q': 12, 'J': 11, '10': 10,
  '9': 9, '8': 8, '7': 7, '6': 6, '5': 5, '4': 4, '3': 3, '2': 2
};

export interface SuitCard {
  type: 'suit';
  suit: Suit;
  rank: Rank;
}

export interface JokerCard {
  type: 'joker';
  jokerNumber: 1 | 2; // To distinguish the two jokers
}

export type Card = SuitCard | JokerCard;

// ============================================================================
// Player Types
// ============================================================================

export type AIDifficulty = 'beginner' | 'intermediate' | 'expert';

export interface HumanPlayer {
  type: 'human';
  id: string;
  name: string;
  isConnected: boolean;
}

export interface AIPlayer {
  type: 'ai';
  id: string;
  name: string;
  difficulty: AIDifficulty;
}

export type Player = HumanPlayer | AIPlayer;

// ============================================================================
// Game Phase Types
// ============================================================================

export type GamePhase =
  | 'waiting'      // Waiting for players to join
  | 'resuming'     // Resuming a paused game, waiting for players to rejoin
  | 'cutting'      // Initial card cut to determine dealer/scorekeeper
  | 'dealing'      // Cards being dealt (for animation purposes)
  | 'bidding'      // Players placing bids
  | 'playing'      // Card play in progress
  | 'trickEnd'     // Brief pause after trick resolution
  | 'stanzaEnd'    // Stanza complete, showing scores
  | 'gameEnd';     // Game complete

// ============================================================================
// Trick Types
// ============================================================================

export interface PlayedCard {
  card: Card;
  playerId: string;
  playerIndex: number;
  // State at time of play (needed for complex trump resolution)
  trumpSuitAtPlay: Suit | null;
  jTrumpActiveAtPlay: boolean;
  wasWhoopie: boolean;   // Did this card change trump?
  wasScramble: boolean;  // Was this a joker (scramble)?
}

export interface CompletedTrick {
  cards: PlayedCard[];
  winnerId: string;
  winnerIndex: number;
  leadSuit: Suit | null; // null if joker led
}

// ============================================================================
// Stanza (Round) State
// ============================================================================

export interface StanzaState {
  stanzaNumber: number;          // 1-indexed stanza number
  cardsPerPlayer: number;        // How many cards dealt this stanza
  direction: 'up' | 'down';      // Are we going up (1→max) or down (max→1)?
  dealerIndex: number;           // Index of current dealer

  // Whoopie defining card
  whoopieDefiningCard: Card | null;
  whoopieRank: Rank | null;      // The denomination that is "Whoopie"
  initialTrumpSuit: Suit | null; // Trump at start of stanza (null if joker defining)

  // Current trump state (changes during play)
  currentTrumpSuit: Suit | null;
  jTrumpActive: boolean;         // True when joker has canceled fixed trump

  // Bidding
  bids: (number | null)[];       // null = hasn't bid yet

  // Playing
  currentTrickNumber: number;    // 1-indexed
  currentTrick: PlayedCard[];
  completedTricks: CompletedTrick[];
  tricksTaken: number[];         // Count per player

  // Hands
  hands: Card[][];               // hands[playerIndex] = that player's cards

  // Whose turn
  currentPlayerIndex: number;
}

// ============================================================================
// Full Game State
// ============================================================================

export interface GameSettings {
  maxPlayers: number;            // 2-10
  minPlayersToStart: number;     // Minimum to begin
  isPublic: boolean;             // Visible in lobby?
  allowSpectators: boolean;
}

export interface GameState {
  id: string;
  createdAt: number;             // Unix timestamp
  hostId: string;                // Player who created the game

  settings: GameSettings;
  phase: GamePhase;

  // Players
  players: Player[];
  scorekeeperIndex: number | null;  // Determined by initial cut

  // Scores (cumulative across stanzas)
  scores: number[];

  // Current stanza (null before game starts)
  stanza: StanzaState | null;

  // History
  completedStanzas: CompletedStanzaRecord[];

  // For new players joining mid-game
  truncatedAverage: number;
}

export interface CompletedStanzaRecord {
  stanzaNumber: number;
  cardsPerPlayer: number;
  dealerIndex: number;
  whoopieDefiningCard: Card;
  bids: number[];
  tricksTaken: number[];
  scoreChanges: number[];        // Points earned/lost this stanza
  playerIds: string[];           // Who was playing (for mid-game joins)
}

// ============================================================================
// Game Events (for real-time updates)
// ============================================================================

export type GameEvent =
  | { type: 'playerJoined'; player: Player }
  | { type: 'playerLeft'; playerId: string; playerName?: string; replacement?: Player }
  | { type: 'playerRejoined'; playerIndex: number; playerName: string } // Player rejoined a resumed game
  | { type: 'playerReconnected'; playerIndex: number; playerName: string } // Player reconnected after socket drop
  | { type: 'gameStarted' }
  | { type: 'gamePaused'; resumeCode: string } // Game was paused
  | { type: 'gameResuming'; playerNames: string[] } // Game is being resumed, waiting for players
  | { type: 'gameResumed' } // Game resumed and continuing
  | { type: 'cutForDealer'; cutCards: Card[]; dealerIndex: number }
  | { type: 'stanzaStarted'; stanza: StanzaState }
  | { type: 'bidPlaced'; playerIndex: number; bid: number }
  | { type: 'cardPlayed'; playerIndex: number; card: Card; wasWhoopie: boolean; wasScramble: boolean; newTrumpSuit: Suit | null }
  | { type: 'trickCompleted'; trick: CompletedTrick }
  | { type: 'stanzaCompleted'; scoreChanges: number[]; newScores: number[] }
  | { type: 'gameEnded'; finalScores: number[]; rankings: number[] }
  | { type: 'whoopieCallMissed'; playerIndex: number } // Penalty for not calling Whoopie
  | { type: 'stanzaRedealt'; reason: string } // Stanza was redealt (e.g., player removed)
  | { type: 'error'; message: string };

// ============================================================================
// Client Actions
// ============================================================================

export type ClientAction =
  | { type: 'joinGame'; gameId: string; playerName: string }
  | { type: 'leaveGame' }
  | { type: 'startGame' }
  | { type: 'placeBid'; bid: number }
  | { type: 'playCard'; card: Card; calledWhoopie: boolean }
  | { type: 'addAI'; difficulty: AIDifficulty }
  | { type: 'removePlayer'; playerId: string }
  | { type: 'replaceWithAI'; playerId: string; difficulty: AIDifficulty };

// ============================================================================
// Utility Types
// ============================================================================

export interface GameResult {
  rankings: { playerId: string; playerName: string; score: number; rank: number }[];
  duration: number; // milliseconds
  totalStanzas: number;
}

// What a player can see (hides other players' hands)
export interface PlayerView {
  gameState: Omit<GameState, 'stanza'> & {
    stanza: Omit<StanzaState, 'hands'> & {
      myHand: Card[];
      otherHandCounts: number[]; // How many cards each player has (indexed by player)
    } | null;
  };
  myIndex: number;
}
