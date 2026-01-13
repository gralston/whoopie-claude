import { Server, Socket } from 'socket.io';
import { GameManager } from './game/game-manager.js';
import { AIRunner } from './game/ai-runner.js';
import { Card, AIDifficulty, GameSettings } from '@whoopie/shared';

export function setupSocketHandlers(io: Server, gameManager: GameManager): void {
  const aiRunner = new AIRunner(io, gameManager);

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Create a new game
    socket.on('game:create', (data: { playerName: string; settings?: Partial<GameSettings> }, callback) => {
      try {
        const session = gameManager.createGame(socket.id, data.playerName, data.settings);
        socket.join(session.game.id);

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

    // Add AI player
    socket.on('game:addAI', (data: { gameId: string; difficulty: AIDifficulty }, callback) => {
      try {
        const { session, event } = gameManager.addAI(data.gameId, data.difficulty);

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

        // Broadcast events
        for (const event of events) {
          io.to(session.game.id).emit('game:event', event);
        }

        // Send updated view to all players
        broadcastViewUpdate(io, gameManager, session.game.id);

        callback({ success: true });

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

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      handleLeave(socket, io, gameManager, aiRunner);
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
    if (aiRunner) {
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
