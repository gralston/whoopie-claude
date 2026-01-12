import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useSocket } from './SocketContext';
import { Card, GameEvent, AIDifficulty } from '@whoopie/shared';

// Player view type (what the server sends)
interface PlayerView {
  id: string;
  phase: string;
  players: Array<{
    id: string;
    name: string;
    type: 'human' | 'ai';
    isConnected?: boolean;
  }>;
  scores: number[];
  hostId: string;
  stanza: {
    stanzaNumber: number;
    cardsPerPlayer: number;
    dealerIndex: number;
    whoopieDefiningCard: Card | null;
    whoopieRank: string | null;
    currentTrumpSuit: string | null;
    jTrumpActive: boolean;
    bids: (number | null)[];
    tricksTaken: number[];
    currentTrick: Array<{
      card: Card;
      playerId: string;
      playerIndex: number;
    }>;
    completedTricks: Array<{
      cards: Array<{ card: Card; playerId: string; playerIndex: number }>;
      winnerId: string;
      winnerIndex: number;
    }>;
    currentPlayerIndex: number;
    myHand: Card[];
    otherHandCounts: number[];
  } | null;
  myIndex: number;
  validActions: {
    canBid: number[];
    canPlay: Card[];
  };
  isMyTurn: boolean;
}

interface DisconnectedPlayer {
  playerId: string;
  playerName: string;
}

interface GameContextType {
  gameId: string | null;
  playerId: string | null;
  playerName: string | null;
  view: PlayerView | null;
  events: GameEvent[];
  error: string | null;
  disconnectedPlayer: DisconnectedPlayer | null;
  wasKicked: boolean;
  createGame: (playerName: string) => Promise<string>;
  joinGame: (gameId: string, playerName: string) => Promise<void>;
  addAI: (difficulty: AIDifficulty) => Promise<void>;
  startGame: () => Promise<void>;
  placeBid: (bid: number) => Promise<void>;
  playCard: (card: Card, calledWhoopie: boolean) => Promise<void>;
  leaveGame: () => void;
  kickPlayer: (targetPlayerId: string) => Promise<void>;
  replaceWithAI: (targetPlayerId: string) => Promise<void>;
  continueWithoutPlayer: (targetPlayerId: string) => Promise<void>;
  clearDisconnectedPlayer: () => void;
  clearKicked: () => void;
  clearError: () => void;
}

const GameContext = createContext<GameContextType | null>(null);

export function GameProvider({ children }: { children: React.ReactNode }) {
  const { socket, emit } = useSocket();
  const [gameId, setGameId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState<string | null>(null);
  const [view, setView] = useState<PlayerView | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [disconnectedPlayer, setDisconnectedPlayer] = useState<DisconnectedPlayer | null>(null);
  const [wasKicked, setWasKicked] = useState(false);

  // Listen for game events
  useEffect(() => {
    if (!socket) return;

    const handleEvent = (event: GameEvent) => {
      setEvents((prev) => [...prev, event]);
    };

    const handleState = (newView: PlayerView) => {
      setView(newView);
    };

    const handleUpdate = (data: { events: GameEvent[]; view: PlayerView }) => {
      setEvents((prev) => [...prev, ...data.events]);
      setView(data.view);
    };

    const handleKicked = () => {
      setWasKicked(true);
      setGameId(null);
      setPlayerId(null);
      setView(null);
      setEvents([]);
    };

    const handlePlayerDisconnected = (data: { playerId: string; playerName: string }) => {
      setDisconnectedPlayer(data);
    };

    socket.on('game:event', handleEvent);
    socket.on('game:state', handleState);
    socket.on('game:update', handleUpdate);
    socket.on('game:kicked', handleKicked);
    socket.on('game:playerDisconnected', handlePlayerDisconnected);

    return () => {
      socket.off('game:event', handleEvent);
      socket.off('game:state', handleState);
      socket.off('game:update', handleUpdate);
      socket.off('game:kicked', handleKicked);
      socket.off('game:playerDisconnected', handlePlayerDisconnected);
    };
  }, [socket]);

  const createGame = useCallback(async (name: string): Promise<string> => {
    const response = await emit<{ gameId: string; view: PlayerView }>('game:create', {
      playerName: name,
    });
    setGameId(response.gameId);
    setPlayerName(name);
    setPlayerId(response.view.players[0]?.id || null);
    setView(response.view);
    setEvents([]);
    return response.gameId;
  }, [emit]);

  const joinGame = useCallback(async (id: string, name: string): Promise<void> => {
    const response = await emit<{ playerId: string; view: PlayerView }>('game:join', {
      gameId: id,
      playerName: name,
    });
    setGameId(id);
    setPlayerName(name);
    setPlayerId(response.playerId);
    setView(response.view);
    setEvents([]);
  }, [emit]);

  const addAI = useCallback(async (difficulty: AIDifficulty): Promise<void> => {
    if (!gameId) throw new Error('Not in a game');
    await emit('game:addAI', { gameId, difficulty });
  }, [emit, gameId]);

  const startGame = useCallback(async (): Promise<void> => {
    if (!gameId) throw new Error('Not in a game');
    await emit('game:start', { gameId });
  }, [emit, gameId]);

  const placeBid = useCallback(async (bid: number): Promise<void> => {
    if (!gameId) throw new Error('Not in a game');
    await emit('game:bid', { gameId, bid });
  }, [emit, gameId]);

  const playCard = useCallback(async (card: Card, calledWhoopie: boolean): Promise<void> => {
    if (!gameId) throw new Error('Not in a game');
    await emit('game:play', { gameId, card, calledWhoopie });
  }, [emit, gameId]);

  const leaveGame = useCallback(() => {
    if (socket && gameId) {
      socket.emit('game:leave');
    }
    setGameId(null);
    setPlayerId(null);
    setView(null);
    setEvents([]);
  }, [socket, gameId]);

  const kickPlayer = useCallback(async (targetPlayerId: string): Promise<void> => {
    if (!gameId) throw new Error('Not in a game');
    await emit('game:kick', { gameId, targetPlayerId });
  }, [emit, gameId]);

  const replaceWithAI = useCallback(async (targetPlayerId: string): Promise<void> => {
    if (!gameId) throw new Error('Not in a game');
    await emit('game:replaceWithAI', { gameId, targetPlayerId });
    setDisconnectedPlayer(null);
  }, [emit, gameId]);

  const continueWithoutPlayer = useCallback(async (targetPlayerId: string): Promise<void> => {
    if (!gameId) throw new Error('Not in a game');
    await emit('game:continueWithout', { gameId, targetPlayerId });
    setDisconnectedPlayer(null);
  }, [emit, gameId]);

  const clearDisconnectedPlayer = useCallback(() => {
    setDisconnectedPlayer(null);
  }, []);

  const clearKicked = useCallback(() => {
    setWasKicked(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <GameContext.Provider
      value={{
        gameId,
        playerId,
        playerName,
        view,
        events,
        error,
        disconnectedPlayer,
        wasKicked,
        createGame,
        joinGame,
        addAI,
        startGame,
        placeBid,
        playCard,
        leaveGame,
        kickPlayer,
        replaceWithAI,
        continueWithoutPlayer,
        clearDisconnectedPlayer,
        clearKicked,
        clearError,
      }}
    >
      {children}
    </GameContext.Provider>
  );
}

export function useGame() {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}
