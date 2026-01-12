import {
  Card,
  SuitCard,
  JokerCard,
  Suit,
  Rank,
  SUITS,
  RANKS,
  RANK_VALUES,
} from './types';

// ============================================================================
// Card Creation & Utilities
// ============================================================================

/**
 * Create a suit card
 */
export function createSuitCard(suit: Suit, rank: Rank): SuitCard {
  return { type: 'suit', suit, rank };
}

/**
 * Create a joker card
 */
export function createJoker(jokerNumber: 1 | 2): JokerCard {
  return { type: 'joker', jokerNumber };
}

/**
 * Check if a card is a joker
 */
export function isJoker(card: Card): card is JokerCard {
  return card.type === 'joker';
}

/**
 * Check if a card is a suit card
 */
export function isSuitCard(card: Card): card is SuitCard {
  return card.type === 'suit';
}

/**
 * Get the rank value of a card (for comparison)
 * Jokers are treated as the Whoopie rank when comparing
 */
export function getRankValue(card: Card, whoopieRank: Rank | null): number {
  if (isJoker(card)) {
    // Jokers have the same denomination as Whoopie cards
    return whoopieRank ? RANK_VALUES[whoopieRank] : 0;
  }
  return RANK_VALUES[card.rank];
}

/**
 * Check if two cards are equal
 */
export function cardsEqual(a: Card, b: Card): boolean {
  if (a.type !== b.type) return false;
  if (isJoker(a) && isJoker(b)) {
    return a.jokerNumber === b.jokerNumber;
  }
  if (isSuitCard(a) && isSuitCard(b)) {
    return a.suit === b.suit && a.rank === b.rank;
  }
  return false;
}

/**
 * Get a display string for a card
 */
export function cardToString(card: Card): string {
  if (isJoker(card)) {
    return `Joker${card.jokerNumber}`;
  }
  const suitSymbols: Record<Suit, string> = {
    spades: '♠',
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
  };
  return `${card.rank}${suitSymbols[card.suit]}`;
}

/**
 * Parse a card string back to a Card object
 */
export function parseCardString(str: string): Card | null {
  if (str.startsWith('Joker')) {
    const num = parseInt(str.charAt(5));
    if (num === 1 || num === 2) {
      return createJoker(num);
    }
    return null;
  }

  const suitSymbolToSuit: Record<string, Suit> = {
    '♠': 'spades',
    '♥': 'hearts',
    '♦': 'diamonds',
    '♣': 'clubs',
  };

  const lastChar = str.charAt(str.length - 1);
  const suit = suitSymbolToSuit[lastChar];
  if (!suit) return null;

  const rankStr = str.slice(0, -1);
  if (!RANKS.includes(rankStr as Rank)) return null;

  return createSuitCard(suit, rankStr as Rank);
}

// ============================================================================
// Deck Operations
// ============================================================================

/**
 * Create a fresh 54-card deck (52 cards + 2 jokers)
 */
export function createDeck(): Card[] {
  const deck: Card[] = [];

  // Add all 52 suit cards
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(createSuitCard(suit, rank));
    }
  }

  // Add 2 jokers
  deck.push(createJoker(1));
  deck.push(createJoker(2));

  return deck;
}

/**
 * Fisher-Yates shuffle algorithm
 * Returns a new shuffled array (does not mutate original)
 */
export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled;
}

/**
 * Deal cards to players
 * Returns { hands, remainingDeck }
 * Deals one card at a time to each player starting from startingPlayerIndex
 */
export function dealCards(
  deck: Card[],
  numPlayers: number,
  cardsPerPlayer: number,
  startingPlayerIndex: number = 0
): { hands: Card[][]; remainingDeck: Card[] } {
  const hands: Card[][] = Array.from({ length: numPlayers }, () => []);
  let deckIndex = 0;

  // Deal one card at a time, going around the table
  for (let cardNum = 0; cardNum < cardsPerPlayer; cardNum++) {
    for (let p = 0; p < numPlayers; p++) {
      const playerIndex = (startingPlayerIndex + p) % numPlayers;
      const card = deck[deckIndex];
      if (!card) {
        throw new Error('Not enough cards in deck');
      }
      hands[playerIndex]!.push(card);
      deckIndex++;
    }
  }

  return {
    hands,
    remainingDeck: deck.slice(deckIndex),
  };
}

/**
 * Cut the deck - used for determining dealer/scorekeeper
 * Returns a random card from the deck (simulating a cut)
 */
export function cutDeck(deck: Card[]): { card: Card; index: number } {
  const index = Math.floor(Math.random() * deck.length);
  return { card: deck[index]!, index };
}

/**
 * Compare two cards for the initial cut (to determine dealer/scorekeeper)
 * Jokers rank highest (above Ace)
 * Returns: negative if a < b, positive if a > b, 0 if equal
 */
export function compareCardsForCut(a: Card, b: Card): number {
  // Jokers rank above everything
  if (isJoker(a) && isJoker(b)) {
    return a.jokerNumber - b.jokerNumber; // Joker1 < Joker2 for tie-breaking
  }
  if (isJoker(a)) return 1;  // a is higher
  if (isJoker(b)) return -1; // b is higher

  // Compare by rank only (suits don't matter for cutting)
  return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
}

// ============================================================================
// Hand Sorting
// ============================================================================

/**
 * Sort a hand by suit then rank (for display)
 * Order: spades, hearts, diamonds, clubs
 * Within suit: A, K, Q, J, 10, 9, 8, 7, 6, 5, 4, 3, 2
 * Jokers at the end
 */
export function sortHand(hand: Card[]): Card[] {
  return [...hand].sort((a, b) => {
    // Jokers go to the end
    if (isJoker(a) && isJoker(b)) {
      return a.jokerNumber - b.jokerNumber;
    }
    if (isJoker(a)) return 1;
    if (isJoker(b)) return -1;

    // Compare by suit first
    const suitOrder = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    if (suitOrder !== 0) return suitOrder;

    // Then by rank (high to low)
    return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
  });
}

/**
 * Sort hand with trump suit first
 */
export function sortHandWithTrump(hand: Card[], trumpSuit: Suit | null): Card[] {
  if (!trumpSuit) {
    return sortHand(hand);
  }

  return [...hand].sort((a, b) => {
    // Jokers go after trump
    if (isJoker(a) && isJoker(b)) {
      return a.jokerNumber - b.jokerNumber;
    }
    if (isJoker(a)) return isSuitCard(b) && b.suit === trumpSuit ? 1 : -1;
    if (isJoker(b)) return isSuitCard(a) && a.suit === trumpSuit ? -1 : 1;

    // Trump cards first
    const aIsTrump = a.suit === trumpSuit;
    const bIsTrump = b.suit === trumpSuit;
    if (aIsTrump && !bIsTrump) return -1;
    if (!aIsTrump && bIsTrump) return 1;

    // Within same trump status, sort by suit then rank
    const suitOrder = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
    if (suitOrder !== 0) return suitOrder;

    return RANK_VALUES[b.rank] - RANK_VALUES[a.rank];
  });
}

// ============================================================================
// Whoopie Card Detection
// ============================================================================

/**
 * Check if a card is a Whoopie card (matches the Whoopie rank)
 */
export function isWhoopieCard(card: Card, whoopieRank: Rank | null): boolean {
  if (!whoopieRank) return false;
  if (isJoker(card)) return true; // Jokers are always Whoopie denomination
  return card.rank === whoopieRank;
}

/**
 * Check if a card is trump
 * Trump includes: cards of the trump suit, Whoopie cards of any suit, and jokers
 */
export function isTrump(
  card: Card,
  trumpSuit: Suit | null,
  whoopieRank: Rank | null,
  jTrumpActive: boolean
): boolean {
  if (isJoker(card)) return true;

  if (isSuitCard(card)) {
    // If J-Trump is active, only Whoopie cards are trump
    if (jTrumpActive) {
      return card.rank === whoopieRank;
    }
    // Otherwise, trump suit and Whoopie cards are trump
    return card.suit === trumpSuit || card.rank === whoopieRank;
  }

  return false;
}

/**
 * Get all Whoopie cards in a hand
 */
export function getWhoopieCardsInHand(hand: Card[], whoopieRank: Rank | null): Card[] {
  return hand.filter((card) => isWhoopieCard(card, whoopieRank));
}

/**
 * Get all trump cards in a hand
 */
export function getTrumpCardsInHand(
  hand: Card[],
  trumpSuit: Suit | null,
  whoopieRank: Rank | null,
  jTrumpActive: boolean
): Card[] {
  return hand.filter((card) => isTrump(card, trumpSuit, whoopieRank, jTrumpActive));
}

/**
 * Get all cards of a specific suit in a hand
 */
export function getCardsOfSuit(hand: Card[], suit: Suit): SuitCard[] {
  return hand.filter((card): card is SuitCard => isSuitCard(card) && card.suit === suit);
}
