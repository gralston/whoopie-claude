import {
  Card,
  Player,
  GameState,
  StanzaState,
  GameSettings,
  PlayedCard,
  CompletedStanzaRecord,
  GamePhase,
  Suit,
  Rank,
  GameEvent,
  RANK_VALUES,
} from './types';
import { getMaxCardsPerPlayer, DEFAULT_GAME_SETTINGS } from './constants';
import {
  createDeck,
  shuffleDeck,
  dealCards,
  cardsEqual,
  isJoker,
  isSuitCard,
  isWhoopieCard,
} from './cards';
import {
  getValidCards,
  getValidBids,
  isValidBid,
  isValidPlay,
  getNextPlayerIndex,
  getFirstLeaderIndex,
  getFirstBidderIndex,
  getNextCardsPerPlayer,
  getInitialTrumpFromDefiningCard,
  getTrumpFromFirstLead,
  getTrumpStateAfterPlay,
  createCompletedTrick,
  allBidsPlaced,
  getLeadSuit,
  canStartStanza,
} from './rules';
import {
  calculateStanzaScores,
  applyScoreChanges,
  calculateTruncatedAverage,
} from './scoring';

// ============================================================================
// Game Creation
// ============================================================================

/**
 * Generate a unique game ID (whoopie_xxxxx format with 5 alphanumeric chars)
 */
export function generateGameId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `whoopie_${id}`;
}

/**
 * Generate a unique player ID
 */
export function generatePlayerId(): string {
  return `player_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Create a new game in waiting state
 */
export function createGame(
  hostId: string,
  settings: Partial<GameSettings> = {}
): GameState {
  const fullSettings: GameSettings = {
    ...DEFAULT_GAME_SETTINGS,
    ...settings,
  };

  return {
    id: generateGameId(),
    createdAt: Date.now(),
    hostId,
    settings: fullSettings,
    phase: 'waiting',
    players: [],
    scorekeeperIndex: null,
    scores: [],
    stanza: null,
    completedStanzas: [],
    truncatedAverage: 0,
  };
}

// ============================================================================
// Player Management
// ============================================================================

/**
 * Add a player to the game
 */
export function addPlayer(
  game: GameState,
  player: Player
): { game: GameState; event: GameEvent } {
  if (game.phase !== 'waiting') {
    throw new Error('Cannot add players after game has started');
  }

  if (game.players.length >= game.settings.maxPlayers) {
    throw new Error('Game is full');
  }

  if (game.players.some((p) => p.id === player.id)) {
    throw new Error('Player already in game');
  }

  const newGame: GameState = {
    ...game,
    players: [...game.players, player],
    scores: [...game.scores, 0],
  };

  return {
    game: newGame,
    event: { type: 'playerJoined', player },
  };
}

/**
 * Remove a player from the game
 * If game is in progress, optionally replace with AI
 */
export function removePlayer(
  game: GameState,
  playerId: string,
  replacement?: Player
): { game: GameState; event: GameEvent } {
  const playerIndex = game.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) {
    throw new Error('Player not in game');
  }

  if (game.phase === 'waiting') {
    // Just remove the player
    const newPlayers = game.players.filter((p) => p.id !== playerId);
    const newScores = game.scores.filter((_, i) => i !== playerIndex);

    return {
      game: {
        ...game,
        players: newPlayers,
        scores: newScores,
      },
      event: { type: 'playerLeft', playerId },
    };
  }

  // Game in progress - must replace with someone
  if (!replacement) {
    throw new Error('Must provide replacement player for in-progress game');
  }

  const newPlayers = [...game.players];
  newPlayers[playerIndex] = replacement;

  // Update stanza hands if needed
  let newStanza = game.stanza;
  if (newStanza) {
    newStanza = { ...newStanza };
  }

  return {
    game: {
      ...game,
      players: newPlayers,
      stanza: newStanza,
    },
    event: { type: 'playerLeft', playerId, replacement },
  };
}

/**
 * Remove a player from an in-progress game and redeal the current stanza
 * Used when a player is kicked or leaves and we don't want to replace them
 */
export function removePlayerAndRedeal(
  game: GameState,
  playerId: string
): { game: GameState; events: GameEvent[] } {
  const playerIndex = game.players.findIndex((p) => p.id === playerId);
  if (playerIndex === -1) {
    throw new Error('Player not in game');
  }

  const playerName = game.players[playerIndex]!.name;

  if (game.phase === 'waiting') {
    // Just remove the player normally
    const { game: newGame } = removePlayer(game, playerId);
    return { game: newGame, events: [{ type: 'playerLeft', playerId, playerName }] };
  }

  if (!game.stanza) {
    throw new Error('No active stanza');
  }

  // Check if we'd have too few players
  if (game.players.length <= 2) {
    throw new Error('Cannot remove player: would have fewer than 2 players');
  }

  // Remove the player and their score
  const newPlayers = game.players.filter((p) => p.id !== playerId);
  const newScores = game.scores.filter((_, i) => i !== playerIndex);

  // Adjust dealer and scorekeeper indices
  let newDealerIndex = game.stanza.dealerIndex;
  let newScorekeeperIndex = game.scorekeeperIndex;

  if (playerIndex < newDealerIndex) {
    newDealerIndex--;
  } else if (playerIndex === newDealerIndex) {
    // Dealer was removed, next player becomes dealer
    newDealerIndex = newDealerIndex % newPlayers.length;
  }
  if (newDealerIndex >= newPlayers.length) {
    newDealerIndex = 0;
  }

  if (newScorekeeperIndex !== null) {
    if (playerIndex < newScorekeeperIndex) {
      newScorekeeperIndex--;
    } else if (playerIndex === newScorekeeperIndex) {
      newScorekeeperIndex = (newDealerIndex + 1) % newPlayers.length;
    }
    if (newScorekeeperIndex >= newPlayers.length) {
      newScorekeeperIndex = 0;
    }
  }

  const events: GameEvent[] = [
    { type: 'playerLeft', playerId, playerName },
    { type: 'stanzaRedealt', reason: 'Player removed from game' },
  ];

  // Create base game state without stanza
  const baseGame: GameState = {
    ...game,
    players: newPlayers,
    scores: newScores,
    scorekeeperIndex: newScorekeeperIndex,
    stanza: null,
  };

  // Redeal the stanza with the same parameters
  const { game: redealedGame, events: stanzaEvents } = startStanza(
    baseGame,
    newDealerIndex,
    game.stanza.cardsPerPlayer,
    game.stanza.direction
  );

  return {
    game: redealedGame,
    events: [...events, ...stanzaEvents],
  };
}

// ============================================================================
// Game Start
// ============================================================================

/**
 * Start the game (move from waiting to first stanza)
 * Performs a card cut to determine first dealer - lowest card deals
 */
export function startGame(game: GameState): { game: GameState; events: GameEvent[] } {
  if (game.phase !== 'waiting') {
    throw new Error('Game already started');
  }

  if (game.players.length < game.settings.minPlayersToStart) {
    throw new Error(`Need at least ${game.settings.minPlayersToStart} players`);
  }

  // Cut for dealer: deal one card to each player, lowest card deals
  const cutDeck = shuffleDeck(createDeck());
  const cutCards: Card[] = [];

  for (let i = 0; i < game.players.length; i++) {
    cutCards.push(cutDeck[i]!);
  }

  // Find the lowest card (suits don't matter, just rank)
  // Jokers are high (above Ace), so they can't win the cut
  let lowestIndex = 0;
  let lowestValue = getCardCutValue(cutCards[0]!);

  for (let i = 1; i < cutCards.length; i++) {
    const value = getCardCutValue(cutCards[i]!);
    if (value < lowestValue) {
      lowestValue = value;
      lowestIndex = i;
    }
  }

  const dealerIndex = lowestIndex;
  const scorekeeperIndex = (dealerIndex + 1) % game.players.length;

  const events: GameEvent[] = [
    { type: 'gameStarted' },
    { type: 'cutForDealer', cutCards, dealerIndex },
  ];

  // Start first stanza
  const stanzaResult = startStanza(
    {
      ...game,
      phase: 'dealing',
      scorekeeperIndex,
    },
    dealerIndex,
    1, // First stanza deals 1 card
    'up'
  );

  return {
    game: stanzaResult.game,
    events: [...events, ...stanzaResult.events],
  };
}

/**
 * Get the value of a card for cutting (lowest deals)
 * Jokers are high (15), Aces are 14, Kings 13, etc down to 2
 */
function getCardCutValue(card: Card): number {
  if (isJoker(card)) {
    return 15; // Jokers are highest, can't win the cut
  }
  return RANK_VALUES[card.rank];
}

// ============================================================================
// Stanza Management
// ============================================================================

/**
 * Start a new stanza
 */
export function startStanza(
  game: GameState,
  dealerIndex: number,
  cardsPerPlayer: number,
  direction: 'up' | 'down'
): { game: GameState; events: GameEvent[] } {
  const numPlayers = game.players.length;

  // Validate
  const validation = canStartStanza(numPlayers, cardsPerPlayer);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Create and shuffle deck
  const deck = shuffleDeck(createDeck());

  // Deal cards (starting with player to dealer's left)
  const firstPlayerIndex = getNextPlayerIndex(dealerIndex, numPlayers);
  const { hands, remainingDeck } = dealCards(
    deck,
    numPlayers,
    cardsPerPlayer,
    firstPlayerIndex
  );

  // Turn up Whoopie defining card
  const whoopieDefiningCard = remainingDeck[0]!;
  const { trumpSuit, whoopieRank, jTrumpActive } =
    getInitialTrumpFromDefiningCard(whoopieDefiningCard);

  // Create stanza state
  const stanza: StanzaState = {
    stanzaNumber: game.completedStanzas.length + 1,
    cardsPerPlayer,
    direction,
    dealerIndex,
    whoopieDefiningCard,
    whoopieRank,
    initialTrumpSuit: trumpSuit,
    currentTrumpSuit: trumpSuit,
    jTrumpActive,
    bids: new Array(numPlayers).fill(null),
    currentTrickNumber: 1,
    currentTrick: [],
    completedTricks: [],
    tricksTaken: new Array(numPlayers).fill(0),
    hands,
    currentPlayerIndex: getFirstBidderIndex(dealerIndex, numPlayers),
  };

  const newGame: GameState = {
    ...game,
    phase: 'bidding',
    stanza,
  };

  return {
    game: newGame,
    events: [{ type: 'stanzaStarted', stanza }],
  };
}

// ============================================================================
// Bidding
// ============================================================================

/**
 * Place a bid for the current player
 */
export function placeBid(
  game: GameState,
  playerIndex: number,
  bid: number
): { game: GameState; events: GameEvent[] } {
  if (game.phase !== 'bidding') {
    throw new Error('Not in bidding phase');
  }

  if (!game.stanza) {
    throw new Error('No active stanza');
  }

  if (playerIndex !== game.stanza.currentPlayerIndex) {
    throw new Error('Not this player\'s turn to bid');
  }

  if (!isValidBid(
    bid,
    playerIndex,
    game.stanza.dealerIndex,
    game.stanza.cardsPerPlayer,
    game.stanza.bids
  )) {
    throw new Error('Invalid bid');
  }

  // Update bids
  const newBids = [...game.stanza.bids];
  newBids[playerIndex] = bid;

  const events: GameEvent[] = [{ type: 'bidPlaced', playerIndex, bid }];

  // Check if all bids are in
  if (allBidsPlaced(newBids)) {
    // Move to playing phase
    const newStanza: StanzaState = {
      ...game.stanza,
      bids: newBids,
      currentPlayerIndex: getFirstLeaderIndex(game.stanza.dealerIndex, game.players.length),
    };

    return {
      game: {
        ...game,
        phase: 'playing',
        stanza: newStanza,
      },
      events,
    };
  }

  // Move to next bidder
  const nextPlayerIndex = getNextPlayerIndex(playerIndex, game.players.length);
  const newStanza: StanzaState = {
    ...game.stanza,
    bids: newBids,
    currentPlayerIndex: nextPlayerIndex,
  };

  return {
    game: {
      ...game,
      stanza: newStanza,
    },
    events,
  };
}

// ============================================================================
// Card Play
// ============================================================================

/**
 * Play a card for the current player
 */
export function playCard(
  game: GameState,
  playerIndex: number,
  card: Card,
  calledWhoopie: boolean
): { game: GameState; events: GameEvent[] } {
  if (game.phase !== 'playing') {
    throw new Error('Not in playing phase');
  }

  if (!game.stanza) {
    throw new Error('No active stanza');
  }

  if (playerIndex !== game.stanza.currentPlayerIndex) {
    throw new Error('Not this player\'s turn');
  }

  const hand = game.stanza.hands[playerIndex]!;
  if (!isValidPlay(
    card,
    hand,
    game.stanza.currentTrick,
    game.stanza.currentTrumpSuit,
    game.stanza.whoopieRank,
    game.stanza.jTrumpActive
  )) {
    throw new Error('Invalid play');
  }

  const events: GameEvent[] = [];
  const isLead = game.stanza.currentTrick.length === 0;
  const leadSuit = isLead ? null : getLeadSuit(game.stanza.currentTrick);

  // Handle special case: joker defining card - whoopieRank will be null until
  // a non-Joker card is led for the first time
  let newTrumpSuit = game.stanza.currentTrumpSuit;
  let newWhoopieRank = game.stanza.whoopieRank;
  let newJTrumpActive = game.stanza.jTrumpActive;

  if (isLead && game.stanza.whoopieRank === null) {
    // Leading when defining card was a joker and whoopie rank hasn't been set yet
    // This handles both the first lead (trick 1) and subsequent leads if first was also a Joker
    const firstLeadResult = getTrumpFromFirstLead(card);
    if (firstLeadResult.autoWin) {
      // Leading joker when defining was joker - Joker auto-wins this trick
      // (Joker will have rank 16, beating any card)
      // whoopieRank stays null, so the NEXT lead will set it
      newJTrumpActive = true;
    } else {
      // Non-Joker lead: this card's rank and suit become whoopie rank and trump
      newTrumpSuit = firstLeadResult.trumpSuit;
      newWhoopieRank = firstLeadResult.whoopieRank;
      newJTrumpActive = firstLeadResult.jTrumpActive;
    }
  }

  // Calculate trump state changes from this play
  const trumpChange = getTrumpStateAfterPlay(
    card,
    newTrumpSuit,
    newWhoopieRank,
    newJTrumpActive,
    leadSuit,
    isLead
  );

  // Check if player should have called Whoopie
  const shouldCallWhoopie = !isJoker(card) && isWhoopieCard(card, newWhoopieRank);
  const missedWhoopieCall = shouldCallWhoopie && !calledWhoopie;

  if (missedWhoopieCall) {
    events.push({ type: 'whoopieCallMissed', playerIndex });
  }

  // Create played card record
  const playedCard: PlayedCard = {
    card,
    playerId: game.players[playerIndex]!.id,
    playerIndex,
    trumpSuitAtPlay: newTrumpSuit,
    jTrumpActiveAtPlay: newJTrumpActive,
    wasWhoopie: trumpChange.wasWhoopie,
    wasScramble: trumpChange.wasScramble,
  };

  // Update state after play
  newTrumpSuit = trumpChange.newTrumpSuit;
  newJTrumpActive = trumpChange.newJTrumpActive;

  // Remove card from hand
  const newHand = hand.filter((c) => !cardsEqual(c, card));
  const newHands = [...game.stanza.hands];
  newHands[playerIndex] = newHand;

  // Add card to trick
  const newTrick = [...game.stanza.currentTrick, playedCard];

  events.push({
    type: 'cardPlayed',
    playerIndex,
    card,
    wasWhoopie: trumpChange.wasWhoopie,
    wasScramble: trumpChange.wasScramble,
    newTrumpSuit,
  });

  // Check if trick is complete
  if (newTrick.length === game.players.length) {
    return completeTrick(game, newTrick, newHands, newTrumpSuit, newWhoopieRank, newJTrumpActive, events, missedWhoopieCall ? playerIndex : null);
  }

  // Trick not complete - move to next player
  const nextPlayerIndex = getNextPlayerIndex(playerIndex, game.players.length);

  const newStanza: StanzaState = {
    ...game.stanza,
    hands: newHands,
    currentTrick: newTrick,
    currentTrumpSuit: newTrumpSuit,
    whoopieRank: newWhoopieRank ?? game.stanza.whoopieRank,
    jTrumpActive: newJTrumpActive,
    currentPlayerIndex: nextPlayerIndex,
  };

  return {
    game: {
      ...game,
      stanza: newStanza,
    },
    events,
  };
}

/**
 * Complete a trick and update game state
 */
function completeTrick(
  game: GameState,
  trick: PlayedCard[],
  hands: Card[][],
  trumpSuit: Suit | null,
  whoopieRank: Rank | null,
  jTrumpActive: boolean,
  events: GameEvent[],
  missedWhoopiePlayerIndex: number | null
): { game: GameState; events: GameEvent[] } {
  if (!game.stanza) {
    throw new Error('No active stanza');
  }

  // Resolve trick winner
  const completedTrick = createCompletedTrick(trick, whoopieRank);
  events.push({ type: 'trickCompleted', trick: completedTrick });

  // Update tricks taken
  const newTricksTaken = [...game.stanza.tricksTaken];
  newTricksTaken[completedTrick.winnerIndex]!++;

  // Add to completed tricks
  const newCompletedTricks = [...game.stanza.completedTricks, completedTrick];

  const newScores = [...game.scores];

  // Check if stanza is complete
  if (game.stanza.currentTrickNumber >= game.stanza.cardsPerPlayer) {
    return completeStanza(
      game,
      hands,
      newTricksTaken,
      newCompletedTricks,
      trumpSuit,
      whoopieRank,
      jTrumpActive,
      newScores,
      events,
      trick // Pass the final trick for animation
    );
  }

  // Transition to trickEnd - keep the trick visible for animation
  // The trick will be cleared when continueGame is called
  const newStanza: StanzaState = {
    ...game.stanza,
    hands,
    currentTrick: trick, // Keep the trick visible during trickEnd phase
    completedTricks: newCompletedTricks,
    tricksTaken: newTricksTaken,
    currentTrickNumber: game.stanza.currentTrickNumber + 1,
    currentPlayerIndex: completedTrick.winnerIndex,
    currentTrumpSuit: trumpSuit,
    whoopieRank: whoopieRank ?? game.stanza.whoopieRank,
    jTrumpActive,
  };

  return {
    game: {
      ...game,
      phase: 'trickEnd',
      stanza: newStanza,
      scores: newScores,
    },
    events,
  };
}

/**
 * Complete a stanza and calculate scores
 */
function completeStanza(
  game: GameState,
  hands: Card[][],
  tricksTaken: number[],
  completedTricks: ReturnType<typeof createCompletedTrick>[],
  trumpSuit: Suit | null,
  whoopieRank: Rank | null,
  jTrumpActive: boolean,
  currentScores: number[],
  events: GameEvent[],
  finalTrick: PlayedCard[] // The final trick to display during animation
): { game: GameState; events: GameEvent[] } {
  if (!game.stanza) {
    throw new Error('No active stanza');
  }

  // Calculate score changes
  const bids = game.stanza.bids as number[];
  const scoreChanges = calculateStanzaScores(bids, tricksTaken);
  const newScores = applyScoreChanges(currentScores, scoreChanges);

  events.push({
    type: 'stanzaCompleted',
    scoreChanges,
    newScores,
  });

  // Record completed stanza
  if (!game.stanza.whoopieDefiningCard) {
    throw new Error('Whoopie defining card should exist when completing stanza');
  }
  const stanzaRecord: CompletedStanzaRecord = {
    stanzaNumber: game.stanza.stanzaNumber,
    cardsPerPlayer: game.stanza.cardsPerPlayer,
    dealerIndex: game.stanza.dealerIndex,
    whoopieDefiningCard: game.stanza.whoopieDefiningCard,
    bids,
    tricksTaken,
    scoreChanges,
    playerIds: game.players.map((p) => p.id),
  };

  // Calculate next stanza parameters
  const maxCards = getMaxCardsPerPlayer(game.players.length);
  const { cardsPerPlayer: nextCards, direction: nextDirection } = getNextCardsPerPlayer(
    game.stanza.cardsPerPlayer,
    game.stanza.direction,
    maxCards
  );
  const nextDealerIndex = getNextPlayerIndex(game.stanza.dealerIndex, game.players.length);

  // Update truncated average
  const truncatedAverage = calculateTruncatedAverage(newScores);

  const newGame: GameState = {
    ...game,
    phase: 'stanzaEnd',
    scores: newScores,
    stanza: {
      ...game.stanza,
      hands,
      tricksTaken,
      completedTricks,
      currentTrumpSuit: trumpSuit,
      whoopieRank: whoopieRank ?? game.stanza.whoopieRank,
      jTrumpActive,
      currentTrick: finalTrick, // Keep the final trick visible for animation
    },
    completedStanzas: [...game.completedStanzas, stanzaRecord],
    truncatedAverage,
  };

  return {
    game: newGame,
    events,
  };
}

/**
 * Start the next stanza after viewing results
 */
export function continueToNextStanza(game: GameState): { game: GameState; events: GameEvent[] } {
  if (game.phase !== 'stanzaEnd') {
    throw new Error('Not in stanza end phase');
  }

  if (!game.stanza) {
    throw new Error('No stanza data');
  }

  // Calculate next stanza parameters
  const maxCards = getMaxCardsPerPlayer(game.players.length);
  const { cardsPerPlayer, direction } = getNextCardsPerPlayer(
    game.stanza.cardsPerPlayer,
    game.stanza.direction,
    maxCards
  );
  const nextDealerIndex = getNextPlayerIndex(game.stanza.dealerIndex, game.players.length);

  return startStanza(game, nextDealerIndex, cardsPerPlayer, direction);
}

// ============================================================================
// Game End
// ============================================================================

/**
 * End the game (can be called at any stanza end)
 */
export function endGame(game: GameState): { game: GameState; events: GameEvent[] } {
  if (game.phase === 'gameEnd') {
    throw new Error('Game already ended');
  }

  // Calculate final rankings
  const sortedIndices = game.scores
    .map((score, index) => ({ score, index }))
    .sort((a, b) => b.score - a.score)
    .map((item) => item.index);

  const rankings = new Array<number>(game.scores.length);
  sortedIndices.forEach((playerIndex, rank) => {
    rankings[playerIndex] = rank + 1;
  });

  return {
    game: {
      ...game,
      phase: 'gameEnd',
    },
    events: [
      {
        type: 'gameEnded',
        finalScores: game.scores,
        rankings,
      },
    ],
  };
}

// ============================================================================
// Player View (hides other players' hands)
// ============================================================================

/**
 * Create a player's view of the game (hiding other hands)
 */
export function getPlayerView(game: GameState, playerIndex: number) {
  if (!game.stanza) {
    return {
      ...game,
      myIndex: playerIndex,
    };
  }

  const myHand = game.stanza.hands[playerIndex] ?? [];
  const otherHandCounts = game.stanza.hands.map((hand, i) =>
    i === playerIndex ? hand.length : hand.length
  );

  return {
    ...game,
    stanza: {
      ...game.stanza,
      hands: undefined, // Don't expose all hands
      myHand,
      otherHandCounts,
    },
    myIndex: playerIndex,
  };
}

// ============================================================================
// State Queries
// ============================================================================

/**
 * Get valid actions for current player
 */
export function getValidActions(game: GameState): {
  canBid: number[];
  canPlay: Card[];
} {
  if (!game.stanza) {
    return { canBid: [], canPlay: [] };
  }

  const playerIndex = game.stanza.currentPlayerIndex;

  if (game.phase === 'bidding') {
    return {
      canBid: getValidBids(
        playerIndex,
        game.stanza.dealerIndex,
        game.stanza.cardsPerPlayer,
        game.stanza.bids
      ),
      canPlay: [],
    };
  }

  if (game.phase === 'playing') {
    const hand = game.stanza.hands[playerIndex] ?? [];
    return {
      canBid: [],
      canPlay: getValidCards(
        hand,
        game.stanza.currentTrick,
        game.stanza.currentTrumpSuit,
        game.stanza.whoopieRank,
        game.stanza.jTrumpActive
      ),
    };
  }

  return { canBid: [], canPlay: [] };
}

/**
 * Check if it's a specific player's turn
 */
export function isPlayersTurn(game: GameState, playerIndex: number): boolean {
  if (!game.stanza) return false;
  if (game.phase !== 'bidding' && game.phase !== 'playing') return false;
  return game.stanza.currentPlayerIndex === playerIndex;
}
