import { describe, it, expect } from 'vitest';
import {
  createDeck,
  shuffleDeck,
  dealCards,
  sortHand,
  isWhoopieCard,
  isTrump,
  createSuitCard,
  createJoker,
  isJoker,
  cardToString,
} from '../cards';
import {
  getValidBids,
  getValidCards,
  resolveTrickWinner,
  getNextCardsPerPlayer,
} from '../rules';
import {
  calculatePlayerStanzaScore,
  calculateStanzaScores,
  calculateTruncatedAverage,
  calculateRankings,
} from '../scoring';
import {
  createGame,
  addPlayer,
  startGame,
  placeBid,
  playCard,
  generatePlayerId,
} from '../game-state';
import { getMaxCardsPerPlayer } from '../constants';
import type { Card, PlayedCard, HumanPlayer } from '../types';

describe('Card utilities', () => {
  it('creates a 54-card deck', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(54);
  });

  it('shuffles the deck', () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    expect(shuffled).toHaveLength(54);
    // Shuffled deck should be different from original (statistically)
    const sameOrder = deck.every((card, i) => {
      const s = shuffled[i]!;
      if (isJoker(card) && isJoker(s)) {
        return card.jokerNumber === s.jokerNumber;
      }
      if (!isJoker(card) && !isJoker(s)) {
        return card.suit === s.suit && card.rank === s.rank;
      }
      return false;
    });
    // Very unlikely to be in same order after shuffle
    expect(sameOrder).toBe(false);
  });

  it('deals cards correctly', () => {
    const deck = createDeck();
    const { hands, remainingDeck } = dealCards(deck, 4, 5, 0);

    expect(hands).toHaveLength(4);
    hands.forEach(hand => {
      expect(hand).toHaveLength(5);
    });
    expect(remainingDeck).toHaveLength(54 - 20);
  });

  it('identifies Whoopie cards', () => {
    const jackHearts = createSuitCard('hearts', 'J');
    const jackSpades = createSuitCard('spades', 'J');
    const kingHearts = createSuitCard('hearts', 'K');
    const joker = createJoker(1);

    // When J is the Whoopie rank
    expect(isWhoopieCard(jackHearts, 'J')).toBe(true);
    expect(isWhoopieCard(jackSpades, 'J')).toBe(true);
    expect(isWhoopieCard(kingHearts, 'J')).toBe(false);
    expect(isWhoopieCard(joker, 'J')).toBe(true); // Jokers are always Whoopie
  });

  it('identifies trump cards', () => {
    const aceHearts = createSuitCard('hearts', 'A');
    const jackHearts = createSuitCard('hearts', 'J');
    const jackSpades = createSuitCard('spades', 'J');
    const aceSpades = createSuitCard('spades', 'A');

    // Hearts is trump, J is Whoopie rank
    expect(isTrump(aceHearts, 'hearts', 'J', false)).toBe(true);  // In trump suit
    expect(isTrump(jackHearts, 'hearts', 'J', false)).toBe(true); // In trump suit AND Whoopie
    expect(isTrump(jackSpades, 'hearts', 'J', false)).toBe(true); // Whoopie card (all Jacks)
    expect(isTrump(aceSpades, 'hearts', 'J', false)).toBe(false); // Not trump
  });

  it('converts cards to strings', () => {
    expect(cardToString(createSuitCard('spades', 'A'))).toBe('A♠');
    expect(cardToString(createSuitCard('hearts', 'K'))).toBe('K♥');
    expect(cardToString(createJoker(1))).toBe('Joker1');
  });
});

describe('Bidding rules', () => {
  it('allows any bid for non-dealers', () => {
    const bids = getValidBids(0, 3, 5, [null, null, null, null]);
    expect(bids).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('restricts dealer bid to avoid total = tricks', () => {
    // 4 players, 5 cards each. First 3 bid: 1, 2, 1 = 4 total
    // Dealer must not bid 1 (which would make total = 5)
    const existingBids: (number | null)[] = [1, 2, 1, null];
    const dealerBids = getValidBids(3, 3, 5, existingBids);
    expect(dealerBids).not.toContain(1);
    expect(dealerBids).toContain(0);
    expect(dealerBids).toContain(2);
    expect(dealerBids).toContain(3);
  });
});

describe('Scoring', () => {
  it('scores correctly for made bids', () => {
    expect(calculatePlayerStanzaScore(0, 0)).toBe(2);  // Bid 0, took 0 = 2+0 = 2
    expect(calculatePlayerStanzaScore(3, 3)).toBe(5);  // Bid 3, took 3 = 2+3 = 5
    expect(calculatePlayerStanzaScore(5, 5)).toBe(7);  // Bid 5, took 5 = 2+5 = 7
  });

  it('penalizes missed bids', () => {
    expect(calculatePlayerStanzaScore(2, 1)).toBe(-1); // Underbid
    expect(calculatePlayerStanzaScore(2, 3)).toBe(-1); // Overbid
    expect(calculatePlayerStanzaScore(0, 1)).toBe(-1); // Bid 0, took 1
  });

  it('calculates truncated average', () => {
    expect(calculateTruncatedAverage([10, 12, 14])).toBe(12);
    expect(calculateTruncatedAverage([54])).toBe(54);
    expect(calculateTruncatedAverage([10, 11])).toBe(10); // 21/2 = 10.5 -> 10
  });

  it('calculates rankings correctly', () => {
    const rankings = calculateRankings([10, 25, 15, 25]);
    expect(rankings[0]).toBe(4);  // Score 10 = 4th
    expect(rankings[1]).toBe(1);  // Score 25 = 1st (tied)
    expect(rankings[2]).toBe(3);  // Score 15 = 3rd
    expect(rankings[3]).toBe(1);  // Score 25 = 1st (tied)
  });
});

describe('Stanza progression', () => {
  it('calculates max cards per player', () => {
    expect(getMaxCardsPerPlayer(2)).toBe(26);
    expect(getMaxCardsPerPlayer(4)).toBe(13);
    expect(getMaxCardsPerPlayer(5)).toBe(10);
    expect(getMaxCardsPerPlayer(10)).toBe(5);
  });

  it('progresses cards correctly', () => {
    // Going up
    expect(getNextCardsPerPlayer(1, 'up', 5)).toEqual({ cardsPerPlayer: 2, direction: 'up' });
    expect(getNextCardsPerPlayer(4, 'up', 5)).toEqual({ cardsPerPlayer: 5, direction: 'up' });
    expect(getNextCardsPerPlayer(5, 'up', 5)).toEqual({ cardsPerPlayer: 4, direction: 'down' });

    // Going down
    expect(getNextCardsPerPlayer(4, 'down', 5)).toEqual({ cardsPerPlayer: 3, direction: 'down' });
    expect(getNextCardsPerPlayer(2, 'down', 5)).toEqual({ cardsPerPlayer: 1, direction: 'down' });
    expect(getNextCardsPerPlayer(1, 'down', 5)).toEqual({ cardsPerPlayer: 2, direction: 'up' });
  });
});

describe('Trick resolution', () => {
  it('higher card of led suit wins without trump', () => {
    const trick: PlayedCard[] = [
      { card: createSuitCard('hearts', '5'), playerId: 'p1', playerIndex: 0, trumpSuitAtPlay: 'spades', jTrumpActiveAtPlay: false, wasWhoopie: false, wasScramble: false },
      { card: createSuitCard('hearts', 'K'), playerId: 'p2', playerIndex: 1, trumpSuitAtPlay: 'spades', jTrumpActiveAtPlay: false, wasWhoopie: false, wasScramble: false },
      { card: createSuitCard('hearts', '9'), playerId: 'p3', playerIndex: 2, trumpSuitAtPlay: 'spades', jTrumpActiveAtPlay: false, wasWhoopie: false, wasScramble: false },
    ];

    const winnerIndex = resolveTrickWinner(trick, 'J');
    expect(winnerIndex).toBe(1); // King wins
  });

  it('trump beats non-trump', () => {
    const trick: PlayedCard[] = [
      { card: createSuitCard('hearts', 'A'), playerId: 'p1', playerIndex: 0, trumpSuitAtPlay: 'spades', jTrumpActiveAtPlay: false, wasWhoopie: false, wasScramble: false },
      { card: createSuitCard('spades', '2'), playerId: 'p2', playerIndex: 1, trumpSuitAtPlay: 'spades', jTrumpActiveAtPlay: false, wasWhoopie: false, wasScramble: false },
      { card: createSuitCard('hearts', 'K'), playerId: 'p3', playerIndex: 2, trumpSuitAtPlay: 'spades', jTrumpActiveAtPlay: false, wasWhoopie: false, wasScramble: false },
    ];

    const winnerIndex = resolveTrickWinner(trick, 'J');
    expect(winnerIndex).toBe(1); // 2 of trump beats Ace of hearts
  });

  it('Whoopie card is trump', () => {
    // Hearts is trump, J is Whoopie - Jack of any suit is trump
    // Lead diamonds, play Jack of clubs (Whoopie - changes trump to clubs)
    // Third player plays Ace of diamonds (not trump anymore)
    const trick: PlayedCard[] = [
      { card: createSuitCard('diamonds', 'A'), playerId: 'p1', playerIndex: 0, trumpSuitAtPlay: 'hearts', jTrumpActiveAtPlay: false, wasWhoopie: false, wasScramble: false },
      { card: createSuitCard('clubs', 'J'), playerId: 'p2', playerIndex: 1, trumpSuitAtPlay: 'hearts', jTrumpActiveAtPlay: false, wasWhoopie: true, wasScramble: false },
      { card: createSuitCard('diamonds', 'K'), playerId: 'p3', playerIndex: 2, trumpSuitAtPlay: 'clubs', jTrumpActiveAtPlay: false, wasWhoopie: false, wasScramble: false },
    ];

    const winnerIndex = resolveTrickWinner(trick, 'J');
    expect(winnerIndex).toBe(1); // Jack (Whoopie/trump) beats non-trump cards
  });

  it('first equal trump wins', () => {
    // Both players play Jack (Whoopie card) - first one wins
    const trick: PlayedCard[] = [
      { card: createSuitCard('hearts', '5'), playerId: 'p1', playerIndex: 0, trumpSuitAtPlay: 'spades', jTrumpActiveAtPlay: false, wasWhoopie: false, wasScramble: false },
      { card: createSuitCard('clubs', 'J'), playerId: 'p2', playerIndex: 1, trumpSuitAtPlay: 'spades', jTrumpActiveAtPlay: false, wasWhoopie: true, wasScramble: false },
      { card: createSuitCard('diamonds', 'J'), playerId: 'p3', playerIndex: 2, trumpSuitAtPlay: 'clubs', jTrumpActiveAtPlay: false, wasWhoopie: true, wasScramble: false },
    ];

    const winnerIndex = resolveTrickWinner(trick, 'J');
    expect(winnerIndex).toBe(1); // First Jack wins
  });
});

describe('Game flow', () => {
  it('creates a game', () => {
    const game = createGame('host123');
    expect(game.phase).toBe('waiting');
    expect(game.players).toHaveLength(0);
    expect(game.hostId).toBe('host123');
  });

  it('adds players', () => {
    let game = createGame('host123');
    const player1: HumanPlayer = { type: 'human', id: 'p1', name: 'Alice', isConnected: true };
    const player2: HumanPlayer = { type: 'human', id: 'p2', name: 'Bob', isConnected: true };

    ({ game } = addPlayer(game, player1));
    ({ game } = addPlayer(game, player2));

    expect(game.players).toHaveLength(2);
    expect(game.scores).toEqual([0, 0]);
  });

  it('starts the game and deals cards', () => {
    let game = createGame('host123');
    const player1: HumanPlayer = { type: 'human', id: 'p1', name: 'Alice', isConnected: true };
    const player2: HumanPlayer = { type: 'human', id: 'p2', name: 'Bob', isConnected: true };
    const player3: HumanPlayer = { type: 'human', id: 'p3', name: 'Carol', isConnected: true };

    ({ game } = addPlayer(game, player1));
    ({ game } = addPlayer(game, player2));
    ({ game } = addPlayer(game, player3));

    const result = startGame(game);
    game = result.game;

    expect(game.phase).toBe('bidding');
    expect(game.stanza).not.toBeNull();
    expect(game.stanza!.cardsPerPlayer).toBe(1);
    expect(game.stanza!.hands[0]).toHaveLength(1);
    expect(game.stanza!.hands[1]).toHaveLength(1);
    expect(game.stanza!.hands[2]).toHaveLength(1);
    expect(game.stanza!.whoopieDefiningCard).not.toBeNull();
  });

  it('handles bidding phase', () => {
    let game = createGame('host123');
    const players: HumanPlayer[] = [
      { type: 'human', id: 'p1', name: 'Alice', isConnected: true },
      { type: 'human', id: 'p2', name: 'Bob', isConnected: true },
      { type: 'human', id: 'p3', name: 'Carol', isConnected: true },
    ];

    players.forEach(p => {
      ({ game } = addPlayer(game, p));
    });

    ({ game } = startGame(game));

    // First stanza: 1 card each
    // Player 1 (to dealer's left) bids first
    const firstBidder = game.stanza!.currentPlayerIndex;
    expect(firstBidder).toBe(1); // Dealer is 0, so first bidder is 1

    ({ game } = placeBid(game, 1, 0));
    expect(game.stanza!.bids[1]).toBe(0);
    expect(game.stanza!.currentPlayerIndex).toBe(2);

    ({ game } = placeBid(game, 2, 1));
    expect(game.stanza!.bids[2]).toBe(1);
    // Now it's dealer's turn (index 0)
    expect(game.stanza!.currentPlayerIndex).toBe(0);

    // Dealer bids - total so far is 1, can't bid 0 (would make total = 1 = tricks)
    ({ game } = placeBid(game, 0, 1)); // Must bid something other than 0
    expect(game.phase).toBe('playing');
  });
});
