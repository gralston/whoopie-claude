import { Server } from 'socket.io';
import {
  AIPlayer,
  GameState,
  Card,
  getValidCards,
  getValidBids,
  isWhoopieCard,
  isJoker,
  isSuitCard,
  RANK_VALUES,
  Rank,
} from '@whoopie/shared';
import { GameManager, GameSession } from './game-manager.js';

// AI timing constants (milliseconds)
const AI_BID_DELAY_MIN = 1000;
const AI_BID_DELAY_MAX = 2500;
const AI_PLAY_DELAY_MIN = 800;
const AI_PLAY_DELAY_MAX = 2000;

/**
 * Simple AI implementation
 * For now, all difficulties use similar logic - can be enhanced later
 */
export class AIRunner {
  constructor(
    private io: Server,
    private gameManager: GameManager
  ) {}

  /**
   * Check if AI needs to act and schedule it
   */
  checkAndRunAI(gameId: string): void {
    const session = this.gameManager.getSession(gameId);
    if (!session) {
      return;
    }

    const aiPlayer = this.gameManager.getCurrentAIPlayer(gameId);
    if (!aiPlayer) {
      return;
    }

    const { phase } = session.game;

    if (phase === 'bidding') {
      this.scheduleAIBid(gameId, aiPlayer, session);
    } else if (phase === 'playing') {
      this.scheduleAIPlay(gameId, aiPlayer, session);
    }
  }

  private scheduleAIBid(gameId: string, aiPlayer: AIPlayer, session: GameSession): void {
    const delay = this.getRandomDelay(AI_BID_DELAY_MIN, AI_BID_DELAY_MAX);

    setTimeout(() => {
      try {
        const bid = this.calculateBid(session.game, aiPlayer);
        const { session: updatedSession, events } = this.gameManager.aiPlaceBid(
          gameId,
          aiPlayer.id,
          bid
        );

        // Broadcast events
        this.broadcastEvents(gameId, updatedSession, events);

        // Check if another AI needs to act
        this.checkAndRunAI(gameId);
      } catch (error) {
        console.error('AI bid error:', error);
      }
    }, delay);
  }

  private scheduleAIPlay(gameId: string, aiPlayer: AIPlayer, session: GameSession): void {
    const delay = this.getRandomDelay(AI_PLAY_DELAY_MIN, AI_PLAY_DELAY_MAX);

    setTimeout(() => {
      try {
        const { card, callWhoopie } = this.calculatePlay(session.game, aiPlayer);
        const { session: updatedSession, events } = this.gameManager.aiPlayCard(
          gameId,
          aiPlayer.id,
          card,
          callWhoopie
        );

        // Broadcast events
        this.broadcastEvents(gameId, updatedSession, events);

        // Handle phase transitions
        if (updatedSession.game.phase === 'trickEnd') {
          // Pause for: last card anim (800ms) + display (3s) + collection anim (1.5s) + buffer
          setTimeout(() => {
            const { session: nextSession, events: nextEvents } = this.gameManager.continueGame(gameId);
            // Always broadcast state update, even if no events (phase change needs to be sent)
            this.broadcastEvents(gameId, nextSession, nextEvents);
            this.checkAndRunAI(gameId);
          }, 6000); // 800ms + 3000ms + 1500ms + 700ms buffer
        } else if (updatedSession.game.phase === 'stanzaEnd') {
          // Longer pause for stanza end (same animation timing)
          setTimeout(() => {
            const { session: nextSession, events: nextEvents } = this.gameManager.continueGame(gameId);
            this.broadcastEvents(gameId, nextSession, nextEvents);
            this.checkAndRunAI(gameId);
          }, 6000);
        } else {
          // Check if another AI needs to act
          this.checkAndRunAI(gameId);
        }
      } catch (error) {
        console.error('AI play error:', error);
      }
    }, delay);
  }

  private calculateBid(game: GameState, aiPlayer: AIPlayer): number {
    if (!game.stanza) {
      throw new Error('No active stanza');
    }

    const playerIndex = game.players.findIndex(p => p.id === aiPlayer.id);
    const hand = game.stanza.hands[playerIndex]!;
    const validBids = getValidBids(
      playerIndex,
      game.stanza.dealerIndex,
      game.stanza.cardsPerPlayer,
      game.stanza.bids
    );

    // Simple heuristic: count "strong" cards
    let estimatedTricks = 0;

    for (const card of hand) {
      if (isJoker(card)) {
        estimatedTricks += 0.9; // Jokers are very powerful
      } else if (isSuitCard(card)) {
        // Whoopie cards are strong
        if (isWhoopieCard(card, game.stanza.whoopieRank)) {
          estimatedTricks += 0.7;
        }
        // Trump cards
        else if (card.suit === game.stanza.currentTrumpSuit) {
          const value = RANK_VALUES[card.rank];
          if (value >= 12) estimatedTricks += 0.8; // Q, K, A of trump
          else if (value >= 10) estimatedTricks += 0.5;
          else estimatedTricks += 0.2;
        }
        // High non-trump
        else if (RANK_VALUES[card.rank] === 14) {
          estimatedTricks += 0.4; // Aces
        }
      }
    }

    // Add some randomness based on difficulty
    const variance = aiPlayer.difficulty === 'beginner' ? 1 :
                     aiPlayer.difficulty === 'intermediate' ? 0.5 : 0.2;
    const randomAdjust = (Math.random() - 0.5) * 2 * variance;

    let bid = Math.round(estimatedTricks + randomAdjust);
    bid = Math.max(0, Math.min(bid, game.stanza.cardsPerPlayer));

    // Make sure bid is valid
    if (!validBids.includes(bid)) {
      // Find closest valid bid
      bid = validBids.reduce((closest, valid) =>
        Math.abs(valid - bid) < Math.abs(closest - bid) ? valid : closest
      );
    }

    return bid;
  }

  private calculatePlay(game: GameState, aiPlayer: AIPlayer): { card: Card; callWhoopie: boolean } {
    if (!game.stanza) {
      throw new Error('No active stanza');
    }

    const playerIndex = game.players.findIndex(p => p.id === aiPlayer.id);
    const hand = game.stanza.hands[playerIndex]!;
    const validCards = getValidCards(
      hand,
      game.stanza.currentTrick,
      game.stanza.currentTrumpSuit,
      game.stanza.whoopieRank,
      game.stanza.jTrumpActive
    );

    if (validCards.length === 0) {
      throw new Error('No valid cards to play');
    }

    // Simple strategy: pick based on whether we want to win or lose
    const bid = game.stanza.bids[playerIndex] ?? 0;
    const tricksTaken = game.stanza.tricksTaken[playerIndex] ?? 0;
    const tricksNeeded = bid - tricksTaken;

    let selectedCard: Card;

    if (tricksNeeded > 0) {
      // Need to win tricks - play high
      selectedCard = this.getHighestCard(validCards, game.stanza.whoopieRank);
    } else {
      // Don't need tricks - play low
      selectedCard = this.getLowestCard(validCards, game.stanza.whoopieRank);
    }

    // Always call Whoopie for AI (they don't forget!)
    // Special case: if whoopieRank is null and this is a lead with a non-joker,
    // this card will DEFINE the whoopie rank, so it IS a whoopie card
    const isLead = game.stanza.currentTrick.length === 0;
    const willDefineWhoopieRank = isLead && game.stanza.whoopieRank === null && !isJoker(selectedCard);
    const callWhoopie = willDefineWhoopieRank || (isWhoopieCard(selectedCard, game.stanza.whoopieRank) && !isJoker(selectedCard));

    return { card: selectedCard, callWhoopie };
  }

  private getHighestCard(cards: Card[], whoopieRank: Rank | null): Card {
    return cards.reduce((highest, card) => {
      const highestValue = this.getCardStrength(highest, whoopieRank);
      const cardValue = this.getCardStrength(card, whoopieRank);
      return cardValue > highestValue ? card : highest;
    });
  }

  private getLowestCard(cards: Card[], whoopieRank: Rank | null): Card {
    return cards.reduce((lowest, card) => {
      const lowestValue = this.getCardStrength(lowest, whoopieRank);
      const cardValue = this.getCardStrength(card, whoopieRank);
      return cardValue < lowestValue ? card : lowest;
    });
  }

  private getCardStrength(card: Card, whoopieRank: Rank | null): number {
    if (isJoker(card)) return 100; // Jokers highest
    if (isWhoopieCard(card, whoopieRank)) return 50 + RANK_VALUES[card.rank]; // Whoopie cards high
    return RANK_VALUES[card.rank];
  }

  private getRandomDelay(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private broadcastEvents(gameId: string, session: GameSession, events: any[]): void {
    // Broadcast to all players in the game
    for (const socketId of session.playerSockets.values()) {
      const playerId = this.gameManager.getPlayerIdForSocket(socketId);
      if (playerId) {
        const playerIndex = session.game.players.findIndex(p => p.id === playerId);
        const view = this.gameManager.getPlayerView(gameId, socketId);
        this.io.to(socketId).emit('game:update', { events, view });
      }
    }
  }
}
