import { SCORE_MAKE_BID_BASE, SCORE_MISS_BID, SCORE_MISSED_WHOOPIE_CALL } from './constants';

// ============================================================================
// Stanza Scoring
// ============================================================================

/**
 * Calculate score change for a single player in a stanza
 *
 * Rules:
 * - If player takes exactly their bid: score = 2 + bid
 * - If player takes more or fewer than bid: score = -1
 */
export function calculatePlayerStanzaScore(bid: number, tricksTaken: number): number {
  if (tricksTaken === bid) {
    return SCORE_MAKE_BID_BASE + bid;
  }
  return SCORE_MISS_BID;
}

/**
 * Calculate score changes for all players in a stanza
 */
export function calculateStanzaScores(
  bids: number[],
  tricksTaken: number[]
): number[] {
  if (bids.length !== tricksTaken.length) {
    throw new Error('Bids and tricks taken arrays must have same length');
  }

  return bids.map((bid, index) =>
    calculatePlayerStanzaScore(bid, tricksTaken[index]!)
  );
}

/**
 * Apply score changes to current scores
 */
export function applyScoreChanges(
  currentScores: number[],
  scoreChanges: number[]
): number[] {
  if (currentScores.length !== scoreChanges.length) {
    throw new Error('Scores and changes arrays must have same length');
  }

  return currentScores.map((score, index) => score + scoreChanges[index]!);
}

// ============================================================================
// Whoopie Call Penalty
// ============================================================================

/**
 * Calculate penalty for missing a Whoopie call
 * (Player plays a Whoopie card but doesn't say "Whoopie" before next card)
 */
export function getMissedWhoopieCallPenalty(): number {
  return SCORE_MISSED_WHOOPIE_CALL;
}

// ============================================================================
// Truncated Average (for new players joining mid-game)
// ============================================================================

/**
 * Calculate the truncated average of scores
 *
 * Used when a new player enters mid-game:
 * - Add all player scores
 * - Divide by number of players
 * - Truncate (floor) the result
 */
export function calculateTruncatedAverage(scores: number[]): number {
  if (scores.length === 0) return 0;

  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.floor(sum / scores.length);
}

// ============================================================================
// Game Rankings
// ============================================================================

/**
 * Calculate final rankings from scores
 * Returns array of rank numbers (1 = first place)
 * Ties get the same rank
 */
export function calculateRankings(scores: number[]): number[] {
  // Create array of { score, originalIndex }
  const indexed = scores.map((score, index) => ({ score, index }));

  // Sort by score descending
  indexed.sort((a, b) => b.score - a.score);

  // Assign ranks (handling ties)
  const rankings = new Array<number>(scores.length);
  let currentRank = 1;

  for (let i = 0; i < indexed.length; i++) {
    const current = indexed[i]!;

    // Check if tied with previous
    if (i > 0 && current.score === indexed[i - 1]!.score) {
      // Same rank as previous
      rankings[current.index] = rankings[indexed[i - 1]!.index]!;
    } else {
      // New rank (accounts for ties: if positions 1,2 tied for 1st, position 3 gets rank 3)
      rankings[current.index] = currentRank;
    }

    currentRank++;
  }

  return rankings;
}

/**
 * Get standings sorted by rank
 */
export function getStandings(
  playerIds: string[],
  playerNames: string[],
  scores: number[]
): { playerId: string; playerName: string; score: number; rank: number }[] {
  const rankings = calculateRankings(scores);

  const standings = playerIds.map((playerId, index) => ({
    playerId,
    playerName: playerNames[index]!,
    score: scores[index]!,
    rank: rankings[index]!,
  }));

  // Sort by rank
  standings.sort((a, b) => a.rank - b.rank);

  return standings;
}

// ============================================================================
// Point Award Positions (from rules Section IV)
// ============================================================================

/**
 * Determine which places receive points based on player count
 *
 * Per rules:
 * - 3-4 players: 1st place
 * - 5-7 players: 1st and 2nd place
 * - 8-10 players: 1st, 2nd, and 3rd place
 */
export function getPointAwardPositions(numPlayers: number): number[] {
  if (numPlayers <= 4) {
    return [1];
  }
  if (numPlayers <= 7) {
    return [1, 2];
  }
  return [1, 2, 3];
}

/**
 * Check if a player's rank qualifies for points
 */
export function rankGetsPoints(rank: number, numPlayers: number): boolean {
  const awardPositions = getPointAwardPositions(numPlayers);
  return awardPositions.includes(rank);
}

// ============================================================================
// Score Statistics
// ============================================================================

/**
 * Calculate score statistics for display
 */
export function getScoreStats(scores: number[]): {
  highest: number;
  lowest: number;
  average: number;
  spread: number;
} {
  if (scores.length === 0) {
    return { highest: 0, lowest: 0, average: 0, spread: 0 };
  }

  const highest = Math.max(...scores);
  const lowest = Math.min(...scores);
  const average = scores.reduce((a, b) => a + b, 0) / scores.length;
  const spread = highest - lowest;

  return { highest, lowest, average, spread };
}

/**
 * Calculate a player's bid success rate
 */
export function calculateBidSuccessRate(
  madeCount: number,
  totalStanzas: number
): number {
  if (totalStanzas === 0) return 0;
  return madeCount / totalStanzas;
}
