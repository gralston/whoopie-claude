import { v4 as uuidv4 } from 'uuid';
import {
  GameState,
  GameSettings,
  Player,
  HumanPlayer,
  AIPlayer,
  AIDifficulty,
  Card,
  GameEvent,
  createGame,
  addPlayer,
  removePlayer,
  removePlayerAndRedeal,
  startGame,
  placeBid,
  playCard,
  continueToNextStanza,
  endGame,
  getPlayerView,
  getValidActions,
  isPlayersTurn,
} from '@whoopie/shared';

export interface GameSession {
  game: GameState;
  playerSockets: Map<string, string>; // playerId -> socketId
  spectatorSockets: Set<string>;
}

export class GameManager {
  private games: Map<string, GameSession> = new Map();
  private socketToGame: Map<string, string> = new Map(); // socketId -> gameId
  private socketToPlayer: Map<string, string> = new Map(); // socketId -> playerId

  createGame(hostSocketId: string, hostName: string, settings?: Partial<GameSettings>): GameSession {
    const playerId = uuidv4();
    const game = createGame(playerId, settings);

    const hostPlayer: HumanPlayer = {
      type: 'human',
      id: playerId,
      name: hostName,
      isConnected: true,
    };

    const { game: gameWithHost } = addPlayer(game, hostPlayer);

    const session: GameSession = {
      game: gameWithHost,
      playerSockets: new Map([[playerId, hostSocketId]]),
      spectatorSockets: new Set(),
    };

    this.games.set(gameWithHost.id, session);
    this.socketToGame.set(hostSocketId, gameWithHost.id);
    this.socketToPlayer.set(hostSocketId, playerId);

    return session;
  }

  joinGame(gameId: string, socketId: string, playerName: string): { session: GameSession; playerId: string; event: GameEvent } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    if (session.game.phase !== 'waiting') {
      throw new Error('Game already in progress');
    }

    const playerId = uuidv4();
    const player: HumanPlayer = {
      type: 'human',
      id: playerId,
      name: playerName,
      isConnected: true,
    };

    const { game, event } = addPlayer(session.game, player);
    session.game = game;
    session.playerSockets.set(playerId, socketId);
    this.socketToGame.set(socketId, gameId);
    this.socketToPlayer.set(socketId, playerId);

    return { session, playerId, event };
  }

  addAI(gameId: string, difficulty: AIDifficulty): { session: GameSession; event: GameEvent } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    const aiNames: Record<AIDifficulty, string[]> = {
      beginner: ['Rookie Bot', 'Newbie AI', 'Learner'],
      intermediate: ['Card Shark', 'Clever Bot', 'Smart AI'],
      expert: ['Master Bot', 'Pro AI', 'Genius'],
    };
    const names = aiNames[difficulty];
    const usedNames = session.game.players.map(p => p.name);
    const availableName = names.find(n => !usedNames.includes(n)) || `AI ${session.game.players.length + 1}`;

    const aiPlayer: AIPlayer = {
      type: 'ai',
      id: uuidv4(),
      name: availableName,
      difficulty,
    };

    const { game, event } = addPlayer(session.game, aiPlayer);
    session.game = game;

    return { session, event };
  }

  startGame(gameId: string, socketId: string): { session: GameSession; events: GameEvent[] } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    const playerId = this.socketToPlayer.get(socketId);
    if (playerId !== session.game.hostId) {
      throw new Error('Only host can start the game');
    }

    const { game, events } = startGame(session.game);
    session.game = game;

    return { session, events };
  }

  placeBid(gameId: string, socketId: string, bid: number): { session: GameSession; events: GameEvent[] } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    const playerId = this.socketToPlayer.get(socketId);
    const playerIndex = session.game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      throw new Error('Player not in game');
    }

    const { game, events } = placeBid(session.game, playerIndex, bid);
    session.game = game;

    return { session, events };
  }

  playCard(gameId: string, socketId: string, card: Card, calledWhoopie: boolean): { session: GameSession; events: GameEvent[] } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    const playerId = this.socketToPlayer.get(socketId);
    const playerIndex = session.game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      throw new Error('Player not in game');
    }

    const { game, events } = playCard(session.game, playerIndex, card, calledWhoopie);
    session.game = game;

    return { session, events };
  }

  // AI plays a card (called by AI runner)
  aiPlayCard(gameId: string, playerId: string, card: Card, calledWhoopie: boolean): { session: GameSession; events: GameEvent[] } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    const playerIndex = session.game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      throw new Error('AI player not in game');
    }

    const { game, events } = playCard(session.game, playerIndex, card, calledWhoopie);
    session.game = game;

    return { session, events };
  }

  // AI places a bid
  aiPlaceBid(gameId: string, playerId: string, bid: number): { session: GameSession; events: GameEvent[] } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    const playerIndex = session.game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      throw new Error('AI player not in game');
    }

    const { game, events } = placeBid(session.game, playerIndex, bid);
    session.game = game;

    return { session, events };
  }

  continueGame(gameId: string): { session: GameSession; events: GameEvent[] } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    if (session.game.phase === 'stanzaEnd') {
      const { game, events } = continueToNextStanza(session.game);
      session.game = game;
      return { session, events };
    }

    if (session.game.phase === 'trickEnd') {
      // Clear the trick and update phase to playing
      session.game = {
        ...session.game,
        phase: 'playing',
        stanza: session.game.stanza ? {
          ...session.game.stanza,
          currentTrick: [], // Clear the trick for the next round
        } : null,
      };
      return { session, events: [] };
    }

    return { session, events: [] };
  }

  leaveGame(socketId: string): { gameId: string; event: GameEvent; needsHostDecision?: boolean; leavingPlayerId?: string; leavingPlayerName?: string; gameAbandoned?: boolean; gameWasInProgress?: boolean } | null {
    const gameId = this.socketToGame.get(socketId);
    const playerId = this.socketToPlayer.get(socketId);

    if (!gameId || !playerId) {
      return null;
    }

    const session = this.games.get(gameId);
    if (!session) {
      return null;
    }

    const leavingPlayer = session.game.players.find(p => p.id === playerId);
    const leavingPlayerName = leavingPlayer?.name || 'Unknown';

    // If game hasn't started, clean up fully and remove the player
    if (session.game.phase === 'waiting') {
      // Clean up socket mappings completely for waiting phase
      this.socketToGame.delete(socketId);
      this.socketToPlayer.delete(socketId);
      session.playerSockets.delete(playerId);
      const { game, event } = removePlayer(session.game, playerId);
      session.game = game;

      // Transfer host if needed
      if (playerId === session.game.hostId && session.game.players.length > 0) {
        const newHost = session.game.players.find(p => p.type === 'human') || session.game.players[0];
        if (newHost) {
          session.game.hostId = newHost.id;
        }
      }

      // If no players left, delete the game
      if (session.game.players.length === 0) {
        this.games.delete(gameId);
      }

      return { gameId, event, gameWasInProgress: false };
    }

    // Game in progress - mark player as disconnected but keep them in the game
    // Clean up socket-specific mappings but KEEP playerSockets so reconnection works
    this.socketToGame.delete(socketId);
    this.socketToPlayer.delete(socketId);
    // Note: We deliberately do NOT delete from playerSockets here
    // This allows the player to reconnect with a new socket

    const playerIndex = session.game.players.findIndex(p => p.id === playerId);
    if (playerIndex !== -1) {
      const player = session.game.players[playerIndex] as HumanPlayer;
      player.isConnected = false;
    }

    // Transfer host if needed
    const wasHost = playerId === session.game.hostId;
    if (wasHost) {
      const newHost = session.game.players.find(p => p.type === 'human' && p.id !== playerId && (p as HumanPlayer).isConnected);
      if (newHost) {
        session.game.hostId = newHost.id;
      } else {
        // No connected humans left - game should end or continue with just AI
        // For now, just pick first human if exists
        const anyHuman = session.game.players.find(p => p.type === 'human' && p.id !== playerId);
        if (anyHuman) {
          session.game.hostId = anyHuman.id;
        }
      }
    }

    // Check if all human players are now disconnected
    const connectedHumans = session.game.players.filter(
      p => p.type === 'human' && (p as HumanPlayer).isConnected
    );
    const gameAbandoned = connectedHumans.length === 0;

    // If abandoned, clean up the game
    if (gameAbandoned) {
      // Clean up all socket mappings for this game
      for (const [pid, sid] of session.playerSockets) {
        this.socketToGame.delete(sid);
        this.socketToPlayer.delete(sid);
      }
      this.games.delete(gameId);
    }

    return {
      gameId,
      event: { type: 'playerLeft', playerId, playerName: leavingPlayerName },
      needsHostDecision: !gameAbandoned, // Only need decision if game isn't abandoned
      leavingPlayerId: playerId,
      leavingPlayerName,
      gameAbandoned,
      gameWasInProgress: true
    };
  }

  // Kick a player (host only)
  kickPlayer(gameId: string, hostSocketId: string, targetPlayerId: string): {
    session: GameSession;
    event: GameEvent;
    kickedPlayerName: string;
    targetSocketId?: string;
  } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    const hostPlayerId = this.socketToPlayer.get(hostSocketId);
    if (hostPlayerId !== session.game.hostId) {
      throw new Error('Only host can kick players');
    }

    if (targetPlayerId === hostPlayerId) {
      throw new Error('Cannot kick yourself');
    }

    const targetPlayer = session.game.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      throw new Error('Player not found');
    }

    const kickedPlayerName = targetPlayer.name;

    // Get the socket ID for the kicked player (if human)
    let targetSocketId: string | undefined;
    for (const [pid, sid] of session.playerSockets) {
      if (pid === targetPlayerId) {
        targetSocketId = sid;
        break;
      }
    }

    // Clean up socket mappings for human player
    if (targetSocketId) {
      this.socketToGame.delete(targetSocketId);
      this.socketToPlayer.delete(targetSocketId);
      session.playerSockets.delete(targetPlayerId);
    }

    // If game hasn't started, just remove them
    if (session.game.phase === 'waiting') {
      const { game, event } = removePlayer(session.game, targetPlayerId);
      session.game = game;
      return { session, event, kickedPlayerName, targetSocketId };
    }

    // Game in progress - mark as disconnected, host will decide to replace or continue
    const playerIndex = session.game.players.findIndex(p => p.id === targetPlayerId);
    if (playerIndex !== -1 && targetPlayer.type === 'human') {
      (targetPlayer as HumanPlayer).isConnected = false;
    }

    return {
      session,
      event: { type: 'playerLeft', playerId: targetPlayerId, playerName: kickedPlayerName },
      kickedPlayerName,
      targetSocketId
    };
  }

  // Replace a disconnected player with AI
  replaceWithAI(gameId: string, hostSocketId: string, targetPlayerId: string): {
    session: GameSession;
    event: GameEvent;
    newAIPlayer: AIPlayer;
  } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    const hostPlayerId = this.socketToPlayer.get(hostSocketId);
    if (hostPlayerId !== session.game.hostId) {
      throw new Error('Only host can replace players');
    }

    const playerIndex = session.game.players.findIndex(p => p.id === targetPlayerId);
    if (playerIndex === -1) {
      throw new Error('Player not found');
    }

    const oldPlayer = session.game.players[playerIndex]!;
    const botName = `${oldPlayer.name}-bot`;

    // Create AI replacement
    const aiPlayer: AIPlayer = {
      type: 'ai',
      id: targetPlayerId, // Keep same ID to preserve game state (hands, bids, etc.)
      name: botName,
      difficulty: 'beginner',
    };

    // Replace player in the game
    session.game.players[playerIndex] = aiPlayer;

    // Clean up any socket mappings for this player
    for (const [pid, sid] of session.playerSockets) {
      if (pid === targetPlayerId) {
        this.socketToGame.delete(sid);
        this.socketToPlayer.delete(sid);
        session.playerSockets.delete(pid);
        break;
      }
    }

    const event: GameEvent = {
      type: 'playerLeft',
      playerId: targetPlayerId,
      playerName: oldPlayer.name,
      replacement: aiPlayer
    };

    return { session, event, newAIPlayer: aiPlayer };
  }

  // Continue game without replacing - remove the player and redeal the current stanza
  continueWithoutPlayer(gameId: string, hostSocketId: string, targetPlayerId: string): {
    session: GameSession;
    events: GameEvent[];
  } {
    const session = this.games.get(gameId);
    if (!session) {
      throw new Error('Game not found');
    }

    const hostPlayerId = this.socketToPlayer.get(hostSocketId);
    if (hostPlayerId !== session.game.hostId) {
      throw new Error('Only host can make this decision');
    }

    // Remove the player and redeal the current stanza
    const { game: newGame, events } = removePlayerAndRedeal(session.game, targetPlayerId);
    session.game = newGame;

    return { session, events };
  }

  // Get list of disconnected players awaiting host decision
  getDisconnectedPlayers(gameId: string): Array<{ id: string; name: string }> {
    const session = this.games.get(gameId);
    if (!session) {
      return [];
    }

    return session.game.players
      .filter(p => p.type === 'human' && !(p as HumanPlayer).isConnected)
      .map(p => ({ id: p.id, name: p.name }));
  }

  // Reconnect a player who lost their socket connection
  reconnectPlayer(gameId: string, socketId: string, playerId: string): {
    session: GameSession;
    playerIndex: number;
  } | { error: string } {
    const session = this.games.get(gameId);
    if (!session) {
      return { error: 'Game not found' };
    }

    // Find the player in the game
    const playerIndex = session.game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return { error: 'Player not found in game' };
    }

    const player = session.game.players[playerIndex]!;
    if (player.type !== 'human') {
      return { error: 'Cannot reconnect AI player' };
    }

    // Check if this player is already connected with a different socket
    const existingSocketId = session.playerSockets.get(playerId);
    if (existingSocketId && existingSocketId !== socketId) {
      // Clean up old socket mapping
      this.socketToGame.delete(existingSocketId);
      this.socketToPlayer.delete(existingSocketId);
    }

    // Re-establish socket mappings
    session.playerSockets.set(playerId, socketId);
    this.socketToGame.set(socketId, gameId);
    this.socketToPlayer.set(socketId, playerId);

    // Mark player as connected
    (player as HumanPlayer).isConnected = true;

    return { session, playerIndex };
  }

  getSession(gameId: string): GameSession | undefined {
    return this.games.get(gameId);
  }

  getGameForSocket(socketId: string): GameSession | undefined {
    const gameId = this.socketToGame.get(socketId);
    return gameId ? this.games.get(gameId) : undefined;
  }

  getPlayerIdForSocket(socketId: string): string | undefined {
    return this.socketToPlayer.get(socketId);
  }

  getPlayerView(gameId: string, socketId: string) {
    const session = this.games.get(gameId);
    const playerId = this.socketToPlayer.get(socketId);

    if (!session || !playerId) {
      return null;
    }

    const playerIndex = session.game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      return null;
    }

    const view = getPlayerView(session.game, playerIndex);
    const validActions = getValidActions(session.game);
    const isMyTurn = isPlayersTurn(session.game, playerIndex);

    return {
      ...view,
      validActions,
      isMyTurn,
    };
  }

  getPublicGames(): { id: string; hostName: string; playerCount: number; maxPlayers: number }[] {
    const publicGames: { id: string; hostName: string; playerCount: number; maxPlayers: number }[] = [];

    for (const [id, session] of this.games) {
      if (session.game.settings.isPublic && session.game.phase === 'waiting') {
        const host = session.game.players.find(p => p.id === session.game.hostId);
        publicGames.push({
          id,
          hostName: host?.name || 'Unknown',
          playerCount: session.game.players.length,
          maxPlayers: session.game.settings.maxPlayers,
        });
      }
    }

    return publicGames;
  }

  getGameCount(): number {
    return this.games.size;
  }

  // Get current player if it's an AI
  getCurrentAIPlayer(gameId: string): AIPlayer | null {
    const session = this.games.get(gameId);
    if (!session || !session.game.stanza) {
      return null;
    }

    const currentPlayer = session.game.players[session.game.stanza.currentPlayerIndex];
    if (currentPlayer?.type === 'ai') {
      return currentPlayer;
    }

    return null;
  }

  // Pause a game - returns the game state to be saved
  pauseGame(gameId: string): { gameState: GameState; socketIds: string[] } | null {
    const session = this.games.get(gameId);
    if (!session) {
      return null;
    }

    // Get all connected socket IDs to notify them
    const socketIds = Array.from(session.playerSockets.values());

    // Store the game state before removing
    const gameState = { ...session.game };

    // Clean up socket mappings
    for (const socketId of socketIds) {
      this.socketToGame.delete(socketId);
      this.socketToPlayer.delete(socketId);
    }

    // Remove game from active games
    this.games.delete(gameId);

    return { gameState, socketIds };
  }

  // Resume a game from saved state
  resumeGame(
    gameState: GameState,
    originalPlayerNames: string[],
    hostSocketId: string,
    hostName: string
  ): { session: GameSession; playerId: string; playerIndex: number } | { error: string } {
    // Find the player slot matching this name
    const playerIndex = gameState.players.findIndex(
      p => p.type === 'human' && p.name.toLowerCase() === hostName.toLowerCase()
    );

    if (playerIndex === -1) {
      // Check if name was in original player list
      const wasOriginalPlayer = originalPlayerNames.some(
        n => n.toLowerCase() === hostName.toLowerCase()
      );
      if (!wasOriginalPlayer) {
        return { error: 'Your name was not in the original game. Please use the same name you played with.' };
      }
      return { error: 'Could not find your player slot' };
    }

    const player = gameState.players[playerIndex] as HumanPlayer;
    const playerId = player.id;

    // Store the phase the game was in before pausing
    const previousPhase = gameState.phase;

    // Create new session with game in resuming state
    const resumingGame: GameState = {
      ...gameState,
      id: uuidv4(), // New game ID for the resumed session
      phase: 'resuming',
    };

    // Store the previous phase so we can restore it
    (resumingGame as GameState & { previousPhase: string }).previousPhase = previousPhase;

    // Mark all human players as disconnected initially
    resumingGame.players = resumingGame.players.map(p => {
      if (p.type === 'human') {
        return { ...p, isConnected: false };
      }
      return p;
    });

    // Mark the rejoining player as connected
    (resumingGame.players[playerIndex] as HumanPlayer).isConnected = true;

    const session: GameSession = {
      game: resumingGame,
      playerSockets: new Map([[playerId, hostSocketId]]),
      spectatorSockets: new Set(),
    };

    this.games.set(resumingGame.id, session);
    this.socketToGame.set(hostSocketId, resumingGame.id);
    this.socketToPlayer.set(hostSocketId, playerId);

    // Update the hostId to the first rejoining player
    session.game.hostId = playerId;

    return { session, playerId, playerIndex };
  }

  // Rejoin a resumed game by name
  rejoinGame(
    gameId: string,
    socketId: string,
    playerName: string
  ): { session: GameSession; playerId: string; playerIndex: number } | { error: string } {
    const session = this.games.get(gameId);
    if (!session) {
      return { error: 'Game not found' };
    }

    if (session.game.phase !== 'resuming') {
      return { error: 'Game is not in resuming state' };
    }

    // Find the player slot matching this name
    const playerIndex = session.game.players.findIndex(
      p => p.type === 'human' && p.name.toLowerCase() === playerName.toLowerCase()
    );

    if (playerIndex === -1) {
      return { error: 'No player with that name in this game' };
    }

    const player = session.game.players[playerIndex] as HumanPlayer;

    if (player.isConnected) {
      return { error: 'A player with that name has already rejoined' };
    }

    // Mark as connected
    (session.game.players[playerIndex] as HumanPlayer).isConnected = true;

    const playerId = player.id;
    session.playerSockets.set(playerId, socketId);
    this.socketToGame.set(socketId, gameId);
    this.socketToPlayer.set(socketId, playerId);

    return { session, playerId, playerIndex };
  }

  // Check if all human players have rejoined
  allPlayersRejoined(gameId: string): boolean {
    const session = this.games.get(gameId);
    if (!session) return false;

    return session.game.players
      .filter(p => p.type === 'human')
      .every(p => (p as HumanPlayer).isConnected);
  }

  // Continue a resumed game (transition back to playing state)
  continueResumedGame(gameId: string): GameState | null {
    const session = this.games.get(gameId);
    if (!session || session.game.phase !== 'resuming') {
      return null;
    }

    // Restore the previous phase
    const previousPhase = (session.game as GameState & { previousPhase?: string }).previousPhase;
    if (previousPhase) {
      session.game.phase = previousPhase as GameState['phase'];
      delete (session.game as GameState & { previousPhase?: string }).previousPhase;
    } else {
      // Fallback to bidding if we don't know the previous phase
      session.game.phase = 'bidding';
    }

    return session.game;
  }

  // Get list of players who haven't rejoined yet
  getMissingPlayers(gameId: string): string[] {
    const session = this.games.get(gameId);
    if (!session) return [];

    return session.game.players
      .filter(p => p.type === 'human' && !(p as HumanPlayer).isConnected)
      .map(p => p.name);
  }
}
