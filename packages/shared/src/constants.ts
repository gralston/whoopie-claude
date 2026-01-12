// Game constants

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 10;

// Deck has 54 cards: 52 standard + 2 jokers
export const DECK_SIZE = 54;

// Calculate max cards per player: need at least 1 card left for Whoopie defining card
// maxCards = floor((54 - 1) / numPlayers)
export function getMaxCardsPerPlayer(numPlayers: number): number {
  return Math.floor((DECK_SIZE - 1) / numPlayers);
}

// Calculate total stanzas in a full game cycle (1 -> max -> 1)
// This is (max * 2) - 1 stanzas
export function getTotalStanzasInCycle(numPlayers: number): number {
  const max = getMaxCardsPerPlayer(numPlayers);
  return (max * 2) - 1;
}

// Stanza patterns for different player counts:
// 2 players: max = 26, cycle = 1,2,3...26,25...1 (51 stanzas)
// 3 players: max = 17, cycle = 1,2,3...17,16...1 (33 stanzas)
// 4 players: max = 13, cycle = 1,2,3...13,12...1 (25 stanzas)
// 5 players: max = 10, cycle = 1,2,3...10,9...1  (19 stanzas)
// 6 players: max = 8,  cycle = 1,2,3...8,7...1   (15 stanzas)
// 7 players: max = 7,  cycle = 1,2,3...7,6...1   (13 stanzas)
// 8 players: max = 6,  cycle = 1,2,3...6,5...1   (11 stanzas)
// 9 players: max = 5,  cycle = 1,2,3...5,4...1   (9 stanzas)
// 10 players: max = 5, cycle = 1,2,3,4,5,4...1   (9 stanzas)

// AI timing constants (milliseconds)
export const AI_BID_DELAY_MIN = 1000;
export const AI_BID_DELAY_MAX = 2500;
export const AI_PLAY_DELAY_MIN = 800;
export const AI_PLAY_DELAY_MAX = 2000;

// Animation timing (milliseconds)
export const DEAL_CARD_DELAY = 150;
export const TRICK_DISPLAY_TIME = 1500;
export const STANZA_END_DISPLAY_TIME = 3000;

// Scoring
export const SCORE_MAKE_BID_BASE = 2;  // Base points for making your bid
export const SCORE_MISS_BID = -1;       // Points for missing your bid
export const SCORE_MISSED_WHOOPIE_CALL = -1; // Penalty for not calling Whoopie

// Default game settings
export const DEFAULT_GAME_SETTINGS = {
  maxPlayers: 10,
  minPlayersToStart: 2,
  isPublic: true,
  allowSpectators: true,
} as const;
