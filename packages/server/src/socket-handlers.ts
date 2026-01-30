import { Server, Socket } from 'socket.io';
import { GameManager } from './game/game-manager.js';
import { AIRunner } from './game/ai-runner.js';
import { Card, AIDifficulty, GameSettings } from '@whoopie/shared';

// Grace period before marking a player as disconnected (ms)
// Allows mobile browsers to reconnect after brief app switches
const DISCONNECT_GRACE_MS = 20_000;

// Track pending disconnects so we can cancel them on reconnect
const pendingDisconnects: Map<string, NodeJS.Timeout> = new Map(); // playerId -> timeout
import {
  recordGameCreated,
  recordGameStarted,
  recordGameCompleted,
  recordGameAbandoned,
  updateGamePlayerCount,
  recordWhoopieCall,
  recordWhoopieMiss
} from './services/stats.js';
import { saveGameState, loadGameState, checkResumeCode } from './services/pause.js';

export function setupSocketHandlers(io: Server, gameManager: GameManager): void {
  const aiRunner = new AIRunner(io, gameManager);

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Create a new game
    socket.on('game:create', (data: { playerName: string; settings?: Partial<GameSettings> }, callback) => {
      try {
        const session = gameManager.createGame(socket.id, data.playerName, data.settings);
        socket.join(session.game.id);

        // Track game creation
        const humanCount = session.game.players.filter(p => p.type === 'human').length;
        const aiCount = session.game.players.filter(p => p.type === 'ai').length;
        recordGameCreated(session.game.id, humanCount + aiCount, aiCount);

        const view = gameManager.getPlayerView(session.game.id, socket.id);
        callback({ success: true, gameId: session.game.id, view });
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Join an existing game
    socket.on('game:join', (data: { gameId: string; playerName: string }, callback) => {
      try {
        const { session, playerId, event } = gameManager.joinGame(
          data.gameId,
          socket.id,
          data.playerName
        );
        socket.join(session.game.id);

        // Track player count update
        const humanCount = session.game.players.filter(p => p.type === 'human').length;
        const aiCount = session.game.players.filter(p => p.type === 'ai').length;
        updateGamePlayerCount(session.game.id, humanCount + aiCount, aiCount);

        // Notify other players
        socket.to(session.game.id).emit('game:event', event);

        // Send full state to new player
        const view = gameManager.getPlayerView(session.game.id, socket.id);
        callback({ success: true, playerId, view });

        // Send updated view to all other players
        broadcastViewUpdate(io, gameManager, session.game.id, socket.id);
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Reconnect to a game after socket disconnect
    socket.on('game:reconnect', (data: { gameId: string; playerId: string }, callback) => {
      try {
        // Cancel any pending grace-period disconnect for this player
        const pendingTimeout = pendingDisconnects.get(data.playerId);
        if (pendingTimeout) {
          clearTimeout(pendingTimeout);
          pendingDisconnects.delete(data.playerId);
          console.log(`Player ${data.playerId} reconnected within grace period — disconnect cancelled`);
        }

        const result = gameManager.reconnectPlayer(data.gameId, socket.id, data.playerId);

        if ('error' in result) {
          callback({ success: false, error: result.error });
          return;
        }

        const { session, playerIndex } = result;
        socket.join(session.game.id);

        // Notify other players that this player reconnected
        const playerName = session.game.players[playerIndex]!.name;
        const reconnectEvent = {
          type: 'playerReconnected' as const,
          playerIndex,
          playerName
        };
        socket.to(session.game.id).emit('game:event', reconnectEvent);

        // Send full state to reconnected player
        const view = gameManager.getPlayerView(session.game.id, socket.id);
        callback({ success: true, view });

        // Send updated view to all other players (to update isConnected status)
        broadcastViewUpdate(io, gameManager, session.game.id, socket.id);

        console.log(`Player ${playerName} reconnected to game ${data.gameId}`);
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Add AI player
    socket.on('game:addAI', (data: { gameId: string; difficulty: AIDifficulty }, callback) => {
      try {
        const { session, event } = gameManager.addAI(data.gameId, data.difficulty);

        // Track player count update
        const humanCount = session.game.players.filter(p => p.type === 'human').length;
        const aiCount = session.game.players.filter(p => p.type === 'ai').length;
        updateGamePlayerCount(session.game.id, humanCount + aiCount, aiCount);

        // Notify all players
        io.to(session.game.id).emit('game:event', event);

        // Send updated view to all players
        broadcastViewUpdate(io, gameManager, session.game.id);

        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Start the game
    socket.on('game:start', (data: { gameId: string }, callback) => {
      try {
        const { session, events } = gameManager.startGame(data.gameId, socket.id);

        // Track game started with player counts
        const humanCount = session.game.players.filter(p => p.type === 'human').length;
        const aiCount = session.game.players.filter(p => p.type === 'ai').length;
        recordGameStarted(session.game.id, humanCount + aiCount, aiCount);

        // Broadcast events
        for (const event of events) {
          io.to(session.game.id).emit('game:event', event);
        }

        // Send updated view to all players
        broadcastViewUpdate(io, gameManager, session.game.id);

        callback({ success: true });

        // Check if AI needs to act
        aiRunner.checkAndRunAI(data.gameId);
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Place a bid
    socket.on('game:bid', (data: { gameId: string; bid: number }, callback) => {
      try {
        const { session, events } = gameManager.placeBid(data.gameId, socket.id, data.bid);

        // Broadcast events
        for (const event of events) {
          io.to(session.game.id).emit('game:event', event);
        }

        // Send updated view to all players
        broadcastViewUpdate(io, gameManager, session.game.id);

        callback({ success: true });

        // Check if AI needs to act
        aiRunner.checkAndRunAI(data.gameId);
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Play a card
    socket.on('game:play', (data: { gameId: string; card: Card; calledWhoopie: boolean }, callback) => {
      try {
        const { session, events } = gameManager.playCard(
          data.gameId,
          socket.id,
          data.card,
          data.calledWhoopie
        );

        // Track Whoopie calls and misses from events
        for (const event of events) {
          if (event.type === 'cardPlayed' && event.wasWhoopie && data.calledWhoopie) {
            recordWhoopieCall(data.gameId);
          } else if (event.type === 'whoopieCallMissed') {
            recordWhoopieMiss(data.gameId);
          }
        }

        // Broadcast events
        for (const event of events) {
          io.to(session.game.id).emit('game:event', event);
        }

        // Send updated view to all players
        broadcastViewUpdate(io, gameManager, session.game.id);

        callback({ success: true });

        // Track game completion with stanza count
        if (session.game.phase === 'gameEnd') {
          const stanzasPlayed = session.game.completedStanzas?.length || 0;
          recordGameCompleted(session.game.id, stanzasPlayed);
        }

        // Handle phase transitions
        if (session.game.phase === 'trickEnd') {
          // Pause for: last card anim (800ms) + display (4s) + gather (1s) + collect (1.5s) + buffer
          setTimeout(() => {
            const { session: nextSession, events: nextEvents } = gameManager.continueGame(data.gameId);
            for (const event of nextEvents) {
              io.to(nextSession.game.id).emit('game:event', event);
            }
            broadcastViewUpdate(io, gameManager, data.gameId);
            aiRunner.checkAndRunAI(data.gameId);
          }, 8000);
        } else if (session.game.phase === 'stanzaEnd') {
          // Same animation timing for stanza end
          setTimeout(() => {
            const { session: nextSession, events: nextEvents } = gameManager.continueGame(data.gameId);
            for (const event of nextEvents) {
              io.to(nextSession.game.id).emit('game:event', event);
            }
            broadcastViewUpdate(io, gameManager, data.gameId);

            // Check if game ended after stanza transition
            const updatedSession = gameManager.getSession(data.gameId);
            if (updatedSession?.game.phase === 'gameEnd') {
              const stanzasPlayed = updatedSession.game.completedStanzas?.length || 0;
              recordGameCompleted(data.gameId, stanzasPlayed);
            }

            aiRunner.checkAndRunAI(data.gameId);
          }, 8000);
        } else {
          // Check if AI needs to act
          aiRunner.checkAndRunAI(data.gameId);
        }
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Get current game state
    socket.on('game:getState', (data: { gameId: string }, callback) => {
      try {
        const view = gameManager.getPlayerView(data.gameId, socket.id);
        callback({ success: true, view });
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Leave game / disconnect
    socket.on('game:leave', () => {
      handleLeave(socket, io, gameManager, aiRunner);
    });

    // Kick a player (host only)
    socket.on('game:kick', (data: { gameId: string; targetPlayerId: string }, callback) => {
      try {
        const { session, event, kickedPlayerName, targetSocketId } = gameManager.kickPlayer(
          data.gameId,
          socket.id,
          data.targetPlayerId
        );

        // Notify the kicked player they've been removed
        if (targetSocketId) {
          io.to(targetSocketId).emit('game:kicked', { message: 'You have been removed from the game by the host.' });
        }

        // Notify all remaining players
        io.to(session.game.id).emit('game:event', event);
        broadcastViewUpdate(io, gameManager, session.game.id);

        // If game is in progress, we need to notify host they can replace with AI
        if (session.game.phase !== 'waiting') {
          // Send to host that they can replace this player
          const hostSocketId = findHostSocketId(gameManager, data.gameId);
          if (hostSocketId) {
            io.to(hostSocketId).emit('game:playerDisconnected', {
              playerId: data.targetPlayerId,
              playerName: kickedPlayerName
            });
          }
        }

        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Replace disconnected player with AI
    socket.on('game:replaceWithAI', (data: { gameId: string; targetPlayerId: string }, callback) => {
      try {
        const { session, event, newAIPlayer } = gameManager.replaceWithAI(
          data.gameId,
          socket.id,
          data.targetPlayerId
        );

        // Notify all players about the replacement
        io.to(session.game.id).emit('game:event', event);
        broadcastViewUpdate(io, gameManager, session.game.id);

        callback({ success: true, newPlayer: newAIPlayer });

        // Check if AI needs to act (the replaced player might be current player)
        aiRunner.checkAndRunAI(data.gameId);
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Continue without replacing a disconnected player - removes player and redeals
    socket.on('game:continueWithout', (data: { gameId: string; targetPlayerId: string }, callback) => {
      try {
        const { session, events } = gameManager.continueWithoutPlayer(data.gameId, socket.id, data.targetPlayerId);

        // Broadcast all events to remaining players
        for (const event of events) {
          io.to(session.game.id).emit('game:event', event);
        }

        // Update views for all players
        broadcastViewUpdate(io, gameManager, session.game.id);

        // Check if AI needs to act (in case it's now an AI's turn after redeal)
        aiRunner.checkAndRunAI(data.gameId);

        callback({ success: true });
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Pause a game and save state
    socket.on('game:pause', async (data: { gameId: string }, callback) => {
      try {
        const pauseResult = gameManager.pauseGame(data.gameId);
        if (!pauseResult) {
          callback({ success: false, error: 'Game not found' });
          return;
        }

        const { gameState, socketIds } = pauseResult;

        // Save to Supabase
        const saveResult = await saveGameState(gameState);
        if (!saveResult.success) {
          callback({ success: false, error: saveResult.error });
          return;
        }

        // Notify all players with the resume code
        const pauseEvent = { type: 'gamePaused' as const, resumeCode: saveResult.resumeCode! };
        for (const sid of socketIds) {
          io.to(sid).emit('game:event', pauseEvent);
        }

        callback({ success: true, resumeCode: saveResult.resumeCode });
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Check if a resume code is valid
    socket.on('game:checkResumeCode', async (data: { resumeCode: string }, callback) => {
      try {
        const result = await checkResumeCode(data.resumeCode);
        callback({ success: result.valid, playerNames: result.playerNames, error: result.error });
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Resume a paused game
    socket.on('game:resume', async (data: { resumeCode: string; playerName: string }, callback) => {
      try {
        const loadResult = await loadGameState(data.resumeCode);
        if (!loadResult.success || !loadResult.gameState) {
          callback({ success: false, error: loadResult.error });
          return;
        }

        const resumeResult = gameManager.resumeGame(
          loadResult.gameState,
          loadResult.playerNames || [],
          socket.id,
          data.playerName
        );

        if ('error' in resumeResult) {
          callback({ success: false, error: resumeResult.error });
          return;
        }

        const { session, playerId, playerIndex } = resumeResult;
        socket.join(session.game.id);

        // Get the player names that still need to rejoin
        const missingPlayers = gameManager.getMissingPlayers(session.game.id);

        const view = gameManager.getPlayerView(session.game.id, socket.id);
        callback({
          success: true,
          gameId: session.game.id,
          playerId,
          playerIndex,
          view,
          missingPlayers
        });
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Rejoin a resumed game
    socket.on('game:rejoin', (data: { gameId: string; playerName: string }, callback) => {
      try {
        const result = gameManager.rejoinGame(data.gameId, socket.id, data.playerName);

        if ('error' in result) {
          callback({ success: false, error: result.error });
          return;
        }

        const { session, playerId, playerIndex } = result;
        socket.join(session.game.id);

        // Notify other players
        const rejoinEvent = { type: 'playerRejoined' as const, playerIndex, playerName: data.playerName };
        socket.to(session.game.id).emit('game:event', rejoinEvent);

        // Broadcast updated view to all
        broadcastViewUpdate(io, gameManager, session.game.id);

        const view = gameManager.getPlayerView(session.game.id, socket.id);
        const missingPlayers = gameManager.getMissingPlayers(session.game.id);

        callback({
          success: true,
          playerId,
          playerIndex,
          view,
          missingPlayers,
          allRejoined: gameManager.allPlayersRejoined(session.game.id)
        });
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    // Continue a resumed game (after all players rejoined or host decides to continue)
    socket.on('game:continueResumed', (data: { gameId: string }, callback) => {
      try {
        const game = gameManager.continueResumedGame(data.gameId);
        if (!game) {
          callback({ success: false, error: 'Cannot continue game' });
          return;
        }

        // Notify all players that game is resuming
        io.to(data.gameId).emit('game:event', { type: 'gameResumed' as const });
        broadcastViewUpdate(io, gameManager, data.gameId);

        callback({ success: true });

        // Check if AI needs to act
        aiRunner.checkAndRunAI(data.gameId);
      } catch (error) {
        callback({ success: false, error: (error as Error).message });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);

      // Check if this socket is in an active game
      const playerId = gameManager.getPlayerIdForSocket(socket.id);
      const session = gameManager.getGameForSocket(socket.id);
      const isInProgressGame = session && session.game.phase !== 'waiting' && session.game.phase !== 'gameEnd';

      if (isInProgressGame && playerId) {
        const isHost = playerId === session.game.hostId;

        if (isHost) {
          // Host never auto-disconnects — they must explicitly leave
          console.log(`Host ${playerId} socket dropped, waiting indefinitely for reconnect`);
          pendingDisconnects.set(playerId, null as any);
        } else {
          // Grace period: delay disconnect to allow mobile reconnects
          console.log(`Player ${playerId} disconnect grace period started (${DISCONNECT_GRACE_MS}ms)`);
          const timeout = setTimeout(() => {
            pendingDisconnects.delete(playerId);
            console.log(`Player ${playerId} grace period expired, processing disconnect`);
            handleLeave(socket, io, gameManager, aiRunner);
          }, DISCONNECT_GRACE_MS);
          pendingDisconnects.set(playerId, timeout);
        }
      } else {
        // Not in an active game — disconnect immediately
        handleLeave(socket, io, gameManager, aiRunner);
      }
    });
  });
}

function findHostSocketId(gameManager: GameManager, gameId: string): string | undefined {
  const session = gameManager.getSession(gameId);
  if (!session) return undefined;

  for (const [playerId, socketId] of session.playerSockets) {
    if (playerId === session.game.hostId) {
      return socketId;
    }
  }
  return undefined;
}

function handleLeave(socket: Socket, io: Server, gameManager: GameManager, aiRunner?: AIRunner): void {
  const result = gameManager.leaveGame(socket.id);
  if (result) {
    io.to(result.gameId).emit('game:event', result.event);
    broadcastViewUpdate(io, gameManager, result.gameId);
    socket.leave(result.gameId);

    // Track abandoned games
    if (result.gameAbandoned && result.gameWasInProgress) {
      recordGameAbandoned(result.gameId);
    }

    // If game is in progress and host needs to decide what to do with the player
    if (result.needsHostDecision && result.leavingPlayerId && result.leavingPlayerName) {
      const hostSocketId = findHostSocketId(gameManager, result.gameId);
      if (hostSocketId) {
        io.to(hostSocketId).emit('game:playerDisconnected', {
          playerId: result.leavingPlayerId,
          playerName: result.leavingPlayerName
        });
      }
    }

    // Check if AI needs to act after a player leaves
    if (aiRunner && !result.gameAbandoned) {
      aiRunner.checkAndRunAI(result.gameId);
    }
  }
}

function broadcastViewUpdate(
  io: Server,
  gameManager: GameManager,
  gameId: string,
  excludeSocketId?: string
): void {
  const session = gameManager.getSession(gameId);
  if (!session) return;

  for (const [playerId, socketId] of session.playerSockets) {
    if (socketId !== excludeSocketId) {
      const view = gameManager.getPlayerView(gameId, socketId);
      if (view) {
        io.to(socketId).emit('game:state', view);
      }
    }
  }
}
