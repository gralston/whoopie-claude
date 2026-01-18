# Whoopie Architecture

A multiplayer card game built with React, Node.js, and Socket.io.

**Total: ~8,700 lines of TypeScript**

| Package | Lines | Description |
|---------|-------|-------------|
| client | 3,873 | React SPA |
| shared | 2,598 | Game types and logic |
| server | 2,244 | Express + Socket.io |

---

## Tech Stack

- **Client**: React + TypeScript, Vite, Tailwind CSS, Framer Motion
- **Server**: Node.js + Express, Socket.io
- **Shared**: Common types and game logic
- **Database**: Supabase (PostgreSQL) for stats, feedback, paused games
- **Hosting**: Vercel (client), Railway (server)

---

## Package Structure

```
packages/
├── shared/     # Game types, rules, and pure game logic
├── server/     # Express + Socket.io server, AI players
└── client/     # React SPA
```

---

## Data Flow

```
┌─────────┐  Socket.io   ┌─────────┐   Supabase   ┌──────────┐
│ Client  │◄────────────►│ Server  │◄────────────►│ Database │
└─────────┘              └─────────┘              └──────────┘
                              │
                         Game Logic
                        (from shared)
```

---

## Key Concepts

### Game State (shared/types.ts)

- `GameState`: Complete game state (players, scores, stanza, phase)
- `PlayerView`: What a specific player can see (hides other hands)
- `GameEvent`: Real-time updates (cardPlayed, bidPlaced, etc.)

### Server (GameManager)

- Maintains in-memory `Map<gameId, GameSession>`
- `GameSession` = game state + socket mappings
- All mutations go through GameManager methods
- Emits events to room via Socket.io

### Client (GameContext)

- React context holding current game state
- Listens to `game:event` and `game:state` socket events
- Exposes actions: `createGame`, `joinGame`, `playCard`, etc.

---

## Socket Events

### Client → Server

| Event | Description |
|-------|-------------|
| `game:create` | Create new game |
| `game:join` | Join existing game |
| `game:start` | Host starts game |
| `game:bid` | Place a bid |
| `game:play` | Play a card |
| `game:pause` | Pause and save game |
| `game:resume` | Resume with code |

### Server → Client

| Event | Description |
|-------|-------------|
| `game:event` | Single game event |
| `game:state` | Full player view update |
| `game:kicked` | Player was removed |

---

## Game Phases

```
waiting → cutting → dealing → bidding → playing → trickEnd → stanzaEnd → gameEnd
                                           ↑          │
                                           └──────────┘ (repeat tricks)
```

Special phase: `resuming` (waiting for players to rejoin paused game)

---

## AI System

The `AIRunner` class manages AI players, polling for their turns and adding realistic delays.

### AI Difficulty Levels

| Difficulty | Bid Variance | Behavior |
|------------|--------------|----------|
| **Beginner** | ±1 trick | Overbids or underbids frequently |
| **Intermediate** | ±0.5 trick | Moderately accurate bids |
| **Expert** | ±0.2 trick | Very accurate bids |

### How AI Bidding Works

All AI players evaluate their hand using these heuristics:

| Card Type | Estimated Trick Value |
|-----------|----------------------|
| Jokers | +0.9 |
| Whoopie cards | +0.7 |
| High trump (Q, K, A) | +0.8 |
| Medium trump (10, J) | +0.5 |
| Low trump | +0.2 |
| Aces (non-trump) | +0.4 |

After calculating estimated tricks, random variance is added based on difficulty level.

### Card Play Strategy (Same for All Difficulties)

- **Need more tricks?** Play highest valid card
- **Already met bid?** Play lowest valid card
- AI always remembers to call "Whoopie!" (never gets the penalty)

### Future AI Enhancements

Potential improvements for smarter AI:
- Lead strategically to set up future tricks
- Count cards / track what's been played
- Avoid leading trump early
- Duck tricks more intelligently
- Vary strategy based on position in trick

---

## Persistence (Supabase)

| Table | Purpose |
|-------|---------|
| `game_statistics` | Track games created/completed |
| `daily_stats` | Aggregate daily metrics |
| `feedback` | User feedback submissions |
| `rate_limits` | Feedback rate limiting by IP hash |
| `paused_games` | Saved game state for resume |

---

## Environment Variables

### Server (Railway)

| Variable | Description |
|----------|-------------|
| `PORT` | Server port |
| `CORS_ORIGINS` | Allowed client origins (comma-separated) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `ADMIN_SECRET_KEY` | Admin dashboard authentication |

### Client (Vercel)

| Variable | Description |
|----------|-------------|
| `VITE_SOCKET_URL` | Server URL for Socket.io and API calls |

---

## Key Files Reference

### Shared Package
- `types.ts` - All TypeScript interfaces and types
- `game-logic.ts` - Pure functions for game rules
- `card-utils.ts` - Card comparison and validation

### Server Package
- `index.ts` - Express app setup and route mounting
- `socket-handlers.ts` - All Socket.io event handlers
- `game/game-manager.ts` - Core game state management
- `game/ai-runner.ts` - AI player logic
- `services/pause.ts` - Pause/resume persistence
- `services/stats.ts` - Statistics tracking
- `services/feedback.ts` - Feedback with rate limiting

### Client Package
- `context/GameContext.tsx` - Game state and actions
- `context/SocketContext.tsx` - Socket.io connection
- `pages/Game.tsx` - Main game UI (~1,800 lines)
- `pages/Home.tsx` - Landing page with create/join/resume
- `components/Card.tsx` - Card rendering components
