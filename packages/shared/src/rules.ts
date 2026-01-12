import {
  Card,
  SuitCard,
  Suit,
  Rank,
  PlayedCard,
  CompletedTrick,
  StanzaState,
  RANK_VALUES,
} from './types';
import {
  isJoker,
  isSuitCard,
  getCardsOfSuit,
  isWhoopieCard,
  cardsEqual,
} from './cards';

// ============================================================================
// Legal Play Determination
// ============================================================================

/**
 * Get the suit that was led to the current trick
 * Returns null if a joker was led
 */
export function getLeadSuit(trick: PlayedCard[]): Suit | null {
  if (trick.length === 0) return null;
  const leadCard = trick[0]!;
  if (isJoker(leadCard.card)) return null;
  return leadCard.card.suit;
}

/**
 * Determine which cards in a hand can legally be played
 *
 * Rules:
 * - If leading: any card can be played
 * - If following: must follow suit if able
 * - If unable to follow suit: any card can be played
 * - When a joker is led: all suits count as trump, any card can be played
 */
export function getValidCards(
  hand: Card[],
  currentTrick: PlayedCard[],
  _trumpSuit: Suit | null,
  _whoopieRank: Rank | null,
  _jTrumpActive: boolean
): Card[] {
  // If leading, any card is valid
  if (currentTrick.length === 0) {
    console.log('[getValidCards] Leading - all cards valid:', hand.length);
    return [...hand];
  }

  const leadSuit = getLeadSuit(currentTrick);

  // If a joker was led, all suits are trump for this trick - any card is valid
  if (leadSuit === null) {
    console.log('[getValidCards] Joker led - all cards valid:', hand.length);
    return [...hand];
  }

  // Must follow suit if able
  const cardsOfLeadSuit = getCardsOfSuit(hand, leadSuit);

  console.log('[getValidCards] Lead suit:', leadSuit,
    '| Hand:', hand.map(c => isJoker(c) ? 'JOKER' : `${(c as any).rank} of ${(c as any).suit}`).join(', '),
    '| Cards of lead suit:', cardsOfLeadSuit.length);

  if (cardsOfLeadSuit.length > 0) {
    console.log('[getValidCards] Must follow suit - valid cards:', cardsOfLeadSuit.map(c => `${c.rank} of ${c.suit}`).join(', '));
    return cardsOfLeadSuit;
  }

  // Can't follow suit - any card is valid (including trump and Whoopie cards)
  console.log('[getValidCards] Cannot follow suit - all cards valid');
  return [...hand];
}

/**
 * Check if a specific card is a valid play
 */
export function isValidPlay(
  card: Card,
  hand: Card[],
  currentTrick: PlayedCard[],
  trumpSuit: Suit | null,
  whoopieRank: Rank | null,
  jTrumpActive: boolean
): boolean {
  // Card must be in hand
  if (!hand.some((c) => cardsEqual(c, card))) {
    return false;
  }

  const validCards = getValidCards(hand, currentTrick, trumpSuit, whoopieRank, jTrumpActive);
  return validCards.some((c) => cardsEqual(c, card));
}

// ============================================================================
// Bidding Rules
// ============================================================================

/**
 * Get valid bids for a player
 *
 * Rules:
 * - Non-dealers can bid 0 to cardsPerPlayer
 * - Dealer must ensure total bids ≠ cardsPerPlayer (so someone must fail)
 */
export function getValidBids(
  playerIndex: number,
  dealerIndex: number,
  cardsPerPlayer: number,
  existingBids: (number | null)[]
): number[] {
  const allBids = Array.from({ length: cardsPerPlayer + 1 }, (_, i) => i);

  // Not the dealer - any bid is valid
  if (playerIndex !== dealerIndex) {
    return allBids;
  }

  // Dealer - must avoid total == cardsPerPlayer
  const currentTotal = existingBids.reduce<number>(
    (sum, bid) => sum + (bid ?? 0),
    0
  );
  const forbiddenBid = cardsPerPlayer - currentTotal;

  return allBids.filter((bid) => bid !== forbiddenBid);
}

/**
 * Check if a bid is valid
 */
export function isValidBid(
  bid: number,
  playerIndex: number,
  dealerIndex: number,
  cardsPerPlayer: number,
  existingBids: (number | null)[]
): boolean {
  if (bid < 0 || bid > cardsPerPlayer) return false;
  const validBids = getValidBids(playerIndex, dealerIndex, cardsPerPlayer, existingBids);
  return validBids.includes(bid);
}

// ============================================================================
// Trump State Management
// ============================================================================

/**
 * Determine trump changes when a card is played
 *
 * Returns the new trump state after this card is played
 */
export function getTrumpStateAfterPlay(
  card: Card,
  currentTrumpSuit: Suit | null,
  whoopieRank: Rank | null,
  jTrumpActive: boolean,
  leadSuit: Suit | null,
  isLead: boolean
): {
  newTrumpSuit: Suit | null;
  newJTrumpActive: boolean;
  wasWhoopie: boolean;
  wasScramble: boolean;
} {
  // Handle joker plays
  if (isJoker(card)) {
    if (isLead) {
      // Leading a joker: all suits are trump for this trick, J-Trump prevails after
      // (unless re-Whoopied)
      return {
        newTrumpSuit: null,
        newJTrumpActive: true,
        wasWhoopie: false,
        wasScramble: true,
      };
    } else {
      // Playing a joker (not leading): cancels current trump, J-Trump condition
      // For this trick, the suit originally led becomes trump
      return {
        newTrumpSuit: leadSuit, // The led suit becomes trump for rest of trick
        newJTrumpActive: true,
        wasWhoopie: false,
        wasScramble: true,
      };
    }
  }

  // Handle Whoopie card plays (non-joker)
  if (isSuitCard(card) && isWhoopieCard(card, whoopieRank)) {
    // Playing a Whoopie card changes trump to that suit
    return {
      newTrumpSuit: card.suit,
      newJTrumpActive: false, // Whoopie card cancels J-Trump
      wasWhoopie: true,
      wasScramble: false,
    };
  }

  // Normal card - no trump change
  return {
    newTrumpSuit: currentTrumpSuit,
    newJTrumpActive: jTrumpActive,
    wasWhoopie: false,
    wasScramble: false,
  };
}

// ============================================================================
// Trick Resolution
// ============================================================================

/**
 * Determine if cardA beats cardB in a trick
 *
 * Rules:
 * 1. Trump beats non-trump
 * 2. Whoopie cards are always trump
 * 3. Among trumps, higher rank wins
 * 4. Among equal trumps, the FIRST one played wins
 * 5. Each card's trump status is determined by what trump was when THAT card was played
 *    (stored in trumpSuitAtPlay). Once played, status never changes.
 */
export function cardBeatsCard(
  cardA: PlayedCard,
  cardB: PlayedCard,
  whoopieRank: Rank | null,
  leadSuit: Suit | null
): boolean {
  // Determine if each card was trump at the time it was played
  const aIsTrump = wasCardTrumpWhenPlayed(cardA, whoopieRank, leadSuit);
  const bIsTrump = wasCardTrumpWhenPlayed(cardB, whoopieRank, leadSuit);

  // Trump beats non-trump
  if (aIsTrump && !bIsTrump) return true;
  if (!aIsTrump && bIsTrump) return false;

  // Both trump - compare by rank
  if (aIsTrump && bIsTrump) {
    const aRankValue = getCardRankValue(cardA.card, whoopieRank);
    const bRankValue = getCardRankValue(cardB.card, whoopieRank);
    if (aRankValue > bRankValue) return true;
    if (aRankValue < bRankValue) return false;
    return false; // Equal rank - first played wins
  }

  // Neither is trump - must follow suit to have a chance of winning
  const aFollowsSuit = isSuitCard(cardA.card) && cardA.card.suit === leadSuit;
  const bFollowsSuit = isSuitCard(cardB.card) && cardB.card.suit === leadSuit;

  // Card that follows suit beats card that doesn't
  if (aFollowsSuit && !bFollowsSuit) return true;
  if (!aFollowsSuit && bFollowsSuit) return false;

  // Both follow suit (or neither does) - compare by rank
  const aRankValue = getCardRankValue(cardA.card, whoopieRank);
  const bRankValue = getCardRankValue(cardB.card, whoopieRank);

  if (aRankValue > bRankValue) return true;
  if (aRankValue < bRankValue) return false;

  // Equal rank - first played wins
  return false;
}

/**
 * Determine if a card was trump at the moment it was played
 *
 * KEY RULE: A card's trump status is locked at the moment it is played.
 * If trump changes AFTER a card is played (via Whoopie), that card's status
 * does NOT change. But if trump changed BEFORE a card is played, that card
 * uses the new trump status.
 *
 * Each PlayedCard stores trumpSuitAtPlay which is the trump suit at the moment
 * that specific card was played.
 */
function wasCardTrumpWhenPlayed(
  playedCard: PlayedCard,
  whoopieRank: Rank | null,
  leadSuit: Suit | null
): boolean {
  const card = playedCard.card;

  // Jokers are always trump
  if (isJoker(card)) return true;

  // Whoopie cards are always trump
  if (isWhoopieCard(card, whoopieRank)) return true;

  // For regular cards, check against the trump suit that was active
  // at the moment THIS card was played (stored in the PlayedCard record)
  if (playedCard.jTrumpActiveAtPlay) {
    // When a Joker is led (leadSuit is null), ALL cards are trump
    // The highest card wins (unless a Whoopie card is played)
    if (leadSuit === null) {
      return true;
    }
    // When a Joker is played mid-trick, the led suit becomes trump
    return card.suit === leadSuit;
  }

  // Normal case - was this card in the trump suit when it was played?
  return card.suit === playedCard.trumpSuitAtPlay;
}

/**
 * Get the effective rank value of a card
 */
function getCardRankValue(card: Card, whoopieRank: Rank | null): number {
  if (isJoker(card)) {
    // Jokers have same denomination as Whoopie rank
    // When whoopieRank is null (Joker was defining card and first lead was also Joker),
    // Jokers should have highest rank to guarantee auto-win
    return whoopieRank ? RANK_VALUES[whoopieRank] : 16; // 16 beats Ace (14)
  }
  return RANK_VALUES[card.rank];
}

/**
 * Resolve a completed trick to determine the winner
 *
 * Returns the index of the winning card in the trick array
 */
export function resolveTrickWinner(
  trick: PlayedCard[],
  whoopieRank: Rank | null
): number {
  if (trick.length === 0) {
    throw new Error('Cannot resolve empty trick');
  }

  const leadSuit = getLeadSuit(trick);
  let winnerIndex = 0;

  console.log(`[resolveTrickWinner] leadSuit: ${leadSuit}, whoopieRank: ${whoopieRank}`);
  trick.forEach((pc, i) => {
    const card = pc.card;
    const cardStr = isJoker(card) ? 'JOKER' : `${(card as any).rank} of ${(card as any).suit}`;
    const isTrump = wasCardTrumpWhenPlayed(pc, whoopieRank, leadSuit);
    console.log(`  [${i}] ${cardStr} | trumpSuitAtPlay: ${pc.trumpSuitAtPlay} | jTrumpActive: ${pc.jTrumpActiveAtPlay} | wasWhoopie: ${pc.wasWhoopie} | isTrump: ${isTrump}`);
  });

  for (let i = 1; i < trick.length; i++) {
    const currentWinner = trick[winnerIndex]!;
    const challenger = trick[i]!;

    // Check if challenger beats current winner
    if (cardBeatsCard(challenger, currentWinner, whoopieRank, leadSuit)) {
      winnerIndex = i;
    }
  }

  console.log(`  => Winner: [${winnerIndex}]`);
  return winnerIndex;
}

/**
 * Create a CompletedTrick record from the played cards
 */
export function createCompletedTrick(trick: PlayedCard[], whoopieRank: Rank | null): CompletedTrick {
  const winnerIndex = resolveTrickWinner(trick, whoopieRank);
  const winner = trick[winnerIndex]!;
  const leadSuit = getLeadSuit(trick);

  return {
    cards: [...trick],
    winnerId: winner.playerId,
    winnerIndex: winner.playerIndex,
    leadSuit,
  };
}

// ============================================================================
// Stanza Progression
// ============================================================================

/**
 * Calculate the next number of cards per player
 *
 * Pattern: 1, 2, 3, ... max, max-1, max-2, ... 1 (then repeats)
 */
export function getNextCardsPerPlayer(
  currentCards: number,
  direction: 'up' | 'down',
  maxCards: number
): { cardsPerPlayer: number; direction: 'up' | 'down' } {
  if (direction === 'up') {
    if (currentCards >= maxCards) {
      // At max, switch to going down
      return { cardsPerPlayer: maxCards - 1, direction: 'down' };
    }
    return { cardsPerPlayer: currentCards + 1, direction: 'up' };
  } else {
    if (currentCards <= 1) {
      // At 1 going down, switch to going up
      return { cardsPerPlayer: 2, direction: 'up' };
    }
    return { cardsPerPlayer: currentCards - 1, direction: 'down' };
  }
}

/**
 * Get the next player index (wrapping around)
 */
export function getNextPlayerIndex(currentIndex: number, numPlayers: number): number {
  return (currentIndex + 1) % numPlayers;
}

/**
 * Get the player who leads the first trick (player to dealer's left)
 */
export function getFirstLeaderIndex(dealerIndex: number, numPlayers: number): number {
  return getNextPlayerIndex(dealerIndex, numPlayers);
}

/**
 * Get the index of the player who bids first (player to dealer's left)
 */
export function getFirstBidderIndex(dealerIndex: number, numPlayers: number): number {
  return getNextPlayerIndex(dealerIndex, numPlayers);
}

// ============================================================================
// Whoopie Defining Card Handling
// ============================================================================

/**
 * Determine the initial trump suit and Whoopie rank from the defining card
 *
 * If the defining card is a joker, trump and Whoopie rank are determined
 * by the first card led
 */
export function getInitialTrumpFromDefiningCard(definingCard: Card): {
  trumpSuit: Suit | null;
  whoopieRank: Rank | null;
  jTrumpActive: boolean;
} {
  if (isJoker(definingCard)) {
    // First led card will define trump and Whoopie rank
    return {
      trumpSuit: null,
      whoopieRank: null,
      jTrumpActive: true,
    };
  }

  return {
    trumpSuit: definingCard.suit,
    whoopieRank: definingCard.rank,
    jTrumpActive: false,
  };
}

/**
 * When a joker was the defining card, the first led card defines trump/Whoopie
 *
 * Special case: if the first lead is also a joker, that player automatically
 * wins the trick and leads again - the second card defines trump/Whoopie
 */
export function getTrumpFromFirstLead(firstLead: Card): {
  trumpSuit: Suit | null;
  whoopieRank: Rank | null;
  jTrumpActive: boolean;
  autoWin: boolean;
} {
  if (isJoker(firstLead)) {
    // Player leads joker when joker was defining card
    // They auto-win, and their second lead defines trump
    return {
      trumpSuit: null,
      whoopieRank: null,
      jTrumpActive: true,
      autoWin: true,
    };
  }

  return {
    trumpSuit: firstLead.suit,
    whoopieRank: firstLead.rank,
    jTrumpActive: false,
    autoWin: false,
  };
}

// ============================================================================
// Penalty Cards (Section II rules - for future implementation)
// ============================================================================

// Note: Penalty cards are an advanced feature from Section II of the rules
// They will be implemented in a future phase if needed
// For now, we focus on the core game mechanics from Section I

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate that a stanza can start
 */
export function canStartStanza(
  numPlayers: number,
  cardsPerPlayer: number
): { valid: boolean; error?: string } {
  if (numPlayers < 2) {
    return { valid: false, error: 'Need at least 2 players' };
  }
  if (numPlayers > 10) {
    return { valid: false, error: 'Maximum 10 players' };
  }

  const deckSize = 54;
  const cardsNeeded = numPlayers * cardsPerPlayer + 1; // +1 for Whoopie defining card

  if (cardsNeeded > deckSize) {
    return { valid: false, error: `Not enough cards for ${cardsPerPlayer} per player` };
  }

  return { valid: true };
}

/**
 * Check if all bids have been placed
 */
export function allBidsPlaced(bids: (number | null)[]): boolean {
  return bids.every((bid) => bid !== null);
}

/**
 * Check if all tricks in a stanza have been played
 */
export function stanzaComplete(stanza: StanzaState): boolean {
  return stanza.currentTrickNumber > stanza.cardsPerPlayer;
}
