import { supabase, isSupabaseConfigured } from './supabase.js';

function getToday(): string {
  return new Date().toISOString().split('T')[0]!;
}

// Track current connections for max concurrent calculation
let currentConnections = 0;
let maxConcurrentToday = 0;
let lastDateCheck = getToday();

export function incrementConnections(): void {
  currentConnections++;
  const today = getToday();

  // Reset max if new day
  if (today !== lastDateCheck) {
    maxConcurrentToday = 0;
    lastDateCheck = today;
  }

  if (currentConnections > maxConcurrentToday) {
    maxConcurrentToday = currentConnections;
    updateMaxConcurrent(today, maxConcurrentToday);
  }
}

export function decrementConnections(): void {
  currentConnections = Math.max(0, currentConnections - 1);
}

export function getCurrentConnections(): number {
  return currentConnections;
}

async function updateMaxConcurrent(date: string, max: number): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const { error } = await supabase
      .from('daily_stats')
      .upsert({
        date,
        max_concurrent_players: max
      }, {
        onConflict: 'date'
      });
    if (error) console.error('Failed to update max concurrent:', error.message);
  } catch (error) {
    console.error('Failed to update max concurrent:', error);
  }
}

export async function recordGameCreated(
  gameId: string,
  playerCount: number,
  aiCount: number
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) {
    console.log('Supabase not configured, skipping recordGameCreated');
    return;
  }

  try {
    const { error: insertError } = await supabase.from('game_statistics').insert({
      game_id: gameId,
      player_count: playerCount,
      ai_count: aiCount,
      human_count: playerCount - aiCount,
      status: 'created'
    });

    if (insertError) {
      console.error('Failed to insert game_statistics:', insertError.message);
      return;
    }

    console.log(`Game created recorded: ${gameId}`);
  } catch (error) {
    console.error('Failed to record game created:', error);
  }
}

export async function recordGameStarted(
  gameId: string,
  playerCount: number,
  aiCount: number
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const { error } = await supabase
      .from('game_statistics')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        player_count: playerCount,
        ai_count: aiCount,
        human_count: playerCount - aiCount
      })
      .eq('game_id', gameId);

    if (error) {
      console.error('Failed to record game started:', error.message);
      return;
    }

    // Update daily stats for games started
    const today = getToday();
    await incrementDailyStat(today, 'games_started');
    await incrementDailyStat(today, 'human_players_today', playerCount - aiCount);
    await incrementDailyStat(today, 'ai_players_today', aiCount);

    console.log(`Game started recorded: ${gameId} with ${playerCount} players (${aiCount} AI)`);
  } catch (error) {
    console.error('Failed to record game started:', error);
  }
}

export async function recordGameCompleted(
  gameId: string,
  stanzasPlayed: number = 0
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const { error } = await supabase
      .from('game_statistics')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        stanzas_played: stanzasPlayed
      })
      .eq('game_id', gameId);

    if (error) {
      console.error('Failed to record game completed:', error.message);
      return;
    }

    // Update daily stats
    const today = getToday();
    await incrementDailyStat(today, 'games_completed');

    console.log(`Game completed recorded: ${gameId} with ${stanzasPlayed} stanzas`);
  } catch (error) {
    console.error('Failed to record game completed:', error);
  }
}

export async function recordGameAbandoned(gameId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const { error } = await supabase
      .from('game_statistics')
      .update({
        status: 'abandoned',
        completed_at: new Date().toISOString()
      })
      .eq('game_id', gameId);

    if (error) {
      console.error('Failed to record game abandoned:', error.message);
      return;
    }

    // Update daily stats
    const today = getToday();
    await incrementDailyStat(today, 'games_abandoned');

    console.log(`Game abandoned recorded: ${gameId}`);
  } catch (error) {
    console.error('Failed to record game abandoned:', error);
  }
}

export async function updateGamePlayerCount(
  gameId: string,
  playerCount: number,
  aiCount: number
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const { error } = await supabase
      .from('game_statistics')
      .update({
        player_count: playerCount,
        ai_count: aiCount,
        human_count: playerCount - aiCount
      })
      .eq('game_id', gameId);

    if (error) {
      console.error('Failed to update game player count:', error.message);
    }
  } catch (error) {
    console.error('Failed to update game player count:', error);
  }
}

export async function recordWhoopieCall(gameId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    // Get current count and increment
    const { data, error: selectError } = await supabase
      .from('game_statistics')
      .select('whoopie_calls')
      .eq('game_id', gameId)
      .single();

    if (selectError) {
      console.error('Failed to get whoopie_calls:', selectError.message);
      return;
    }

    const currentCalls = data?.whoopie_calls || 0;
    const { error } = await supabase
      .from('game_statistics')
      .update({ whoopie_calls: currentCalls + 1 })
      .eq('game_id', gameId);

    if (error) {
      console.error('Failed to record Whoopie call:', error.message);
    }
  } catch (error) {
    console.error('Failed to record Whoopie call:', error);
  }
}

export async function recordWhoopieMiss(gameId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    // Get current count and increment
    const { data, error: selectError } = await supabase
      .from('game_statistics')
      .select('whoopie_misses')
      .eq('game_id', gameId)
      .single();

    if (selectError) {
      console.error('Failed to get whoopie_misses:', selectError.message);
      return;
    }

    const currentMisses = data?.whoopie_misses || 0;
    const { error } = await supabase
      .from('game_statistics')
      .update({ whoopie_misses: currentMisses + 1 })
      .eq('game_id', gameId);

    if (error) {
      console.error('Failed to record Whoopie miss:', error.message);
    }
  } catch (error) {
    console.error('Failed to record Whoopie miss:', error);
  }
}

async function incrementDailyStat(date: string, field: string, amount: number = 1): Promise<void> {
  if (!supabase) return;

  try {
    // First try to get existing row
    const { data: existing, error: selectError } = await supabase
      .from('daily_stats')
      .select(field)
      .eq('date', date)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      // PGRST116 = no rows returned, which is fine
      console.error(`Failed to query daily stat ${field}:`, selectError.message);
      return;
    }

    if (existing && typeof existing === 'object') {
      const currentValue = (existing as unknown as Record<string, number>)[field] || 0;
      const { error } = await supabase
        .from('daily_stats')
        .update({ [field]: currentValue + amount })
        .eq('date', date);
      if (error) console.error(`Failed to increment ${field}:`, error.message);
    } else {
      const { error } = await supabase
        .from('daily_stats')
        .insert({ date, [field]: amount });
      if (error) console.error(`Failed to insert daily stat ${field}:`, error.message);
    }
  } catch (error) {
    console.error(`Failed to increment daily stat ${field}:`, error);
  }
}

export interface Statistics {
  // Basic counts
  totalGamesStarted: number;
  gamesCreatedNotStarted: number;
  gamesInProgress: number;
  gamesCompleted: number;
  gamesAbandoned: number;
  gamesToday: number;
  gamesCompletedToday: number;
  gamesAbandonedToday: number;
  humanPlayersToday: number;
  aiPlayersToday: number;
  maxConcurrentPlayers: number;
  currentConnections: number;
  // Calculated stats
  avgGameDurationMinutes: number | null;
  completionRate: number | null;  // percentage
  avgPlayersPerGame: number | null;
  gamesByPlayerCount: Record<number, number>;  // { 2: 5, 3: 10, 4: 20, ... }
  peakHour: number | null;  // 0-23
  peakHourGames: number;
  avgStanzasPerGame: number | null;
  totalWhoopiesCalled: number;
  totalWhoopieMisses: number;
}

export async function getStatistics(): Promise<Statistics> {
  const defaultStats: Statistics = {
    totalGamesStarted: 0,
    gamesCreatedNotStarted: 0,
    gamesInProgress: 0,
    gamesCompleted: 0,
    gamesAbandoned: 0,
    gamesToday: 0,
    gamesCompletedToday: 0,
    gamesAbandonedToday: 0,
    humanPlayersToday: 0,
    aiPlayersToday: 0,
    maxConcurrentPlayers: maxConcurrentToday,
    currentConnections: getCurrentConnections(),
    avgGameDurationMinutes: null,
    completionRate: null,
    avgPlayersPerGame: null,
    gamesByPlayerCount: {},
    peakHour: null,
    peakHourGames: 0,
    avgStanzasPerGame: null,
    totalWhoopiesCalled: 0,
    totalWhoopieMisses: 0
  };

  if (!isSupabaseConfigured() || !supabase) {
    console.log('Supabase not configured, returning default stats');
    return defaultStats;
  }

  try {
    const today = getToday();

    // Get all game statistics with more fields for calculations
    const { data: allGames, error: gamesError } = await supabase
      .from('game_statistics')
      .select('status, started_at, completed_at, player_count, stanzas_played, whoopie_calls, whoopie_misses');

    if (gamesError) {
      console.error('Failed to fetch game statistics:', gamesError.message);
      return defaultStats;
    }

    const counts = {
      created: 0,
      in_progress: 0,
      completed: 0,
      abandoned: 0,
      started: 0
    };

    // For calculations
    let totalDurationMs = 0;
    let durationCount = 0;
    let totalPlayers = 0;
    let playerCountGames = 0;
    const gamesByPlayerCount: Record<number, number> = {};
    const gamesByHour: Record<number, number> = {};
    let totalStanzas = 0;
    let stanzasCount = 0;
    let totalWhoopiesCalled = 0;
    let totalWhoopieMisses = 0;

    allGames?.forEach(row => {
      const status = row.status as keyof typeof counts;
      if (status in counts) {
        counts[status]++;
      }
      if (row.started_at) {
        counts.started++;

        // Track peak hours
        const startHour = new Date(row.started_at).getUTCHours();
        gamesByHour[startHour] = (gamesByHour[startHour] || 0) + 1;
      }

      // Calculate duration for completed/abandoned games
      if (row.started_at && row.completed_at) {
        const start = new Date(row.started_at).getTime();
        const end = new Date(row.completed_at).getTime();
        totalDurationMs += (end - start);
        durationCount++;
      }

      // Track player counts
      if (row.player_count && row.started_at) {
        totalPlayers += row.player_count;
        playerCountGames++;
        gamesByPlayerCount[row.player_count] = (gamesByPlayerCount[row.player_count] || 0) + 1;
      }

      // Track stanzas
      if (row.stanzas_played && row.stanzas_played > 0) {
        totalStanzas += row.stanzas_played;
        stanzasCount++;
      }

      // Track Whoopie calls
      if (row.whoopie_calls) totalWhoopiesCalled += row.whoopie_calls;
      if (row.whoopie_misses) totalWhoopieMisses += row.whoopie_misses;
    });

    // Find peak hour
    let peakHour: number | null = null;
    let peakHourGames = 0;
    for (const [hour, count] of Object.entries(gamesByHour)) {
      if (count > peakHourGames) {
        peakHour = parseInt(hour);
        peakHourGames = count;
      }
    }

    // Get today's started games (games started today)
    const { count: gamesToday } = await supabase
      .from('game_statistics')
      .select('*', { count: 'exact', head: true })
      .gte('started_at', `${today}T00:00:00Z`);

    // Get today's completed games
    const { count: completedToday } = await supabase
      .from('game_statistics')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', `${today}T00:00:00Z`);

    // Get today's abandoned games
    const { count: abandonedToday } = await supabase
      .from('game_statistics')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'abandoned')
      .gte('completed_at', `${today}T00:00:00Z`);

    // Get daily stats for player counts
    const { data: dailyStats } = await supabase
      .from('daily_stats')
      .select('*')
      .eq('date', today)
      .single();

    // Get max concurrent from all daily stats
    const { data: maxStats } = await supabase
      .from('daily_stats')
      .select('max_concurrent_players')
      .order('max_concurrent_players', { ascending: false })
      .limit(1)
      .single();

    // Calculate derived stats
    const totalFinished = counts.completed + counts.abandoned;
    const completionRate = totalFinished > 0 ? (counts.completed / totalFinished) * 100 : null;
    const avgDurationMinutes = durationCount > 0 ? (totalDurationMs / durationCount) / 60000 : null;
    const avgPlayersPerGame = playerCountGames > 0 ? totalPlayers / playerCountGames : null;
    const avgStanzasPerGame = stanzasCount > 0 ? totalStanzas / stanzasCount : null;

    return {
      totalGamesStarted: counts.started,
      gamesCreatedNotStarted: counts.created,
      gamesInProgress: counts.in_progress,
      gamesCompleted: counts.completed,
      gamesAbandoned: counts.abandoned,
      gamesToday: gamesToday || 0,
      gamesCompletedToday: completedToday || 0,
      gamesAbandonedToday: abandonedToday || 0,
      humanPlayersToday: dailyStats?.human_players_today || 0,
      aiPlayersToday: dailyStats?.ai_players_today || 0,
      maxConcurrentPlayers: maxStats?.max_concurrent_players || maxConcurrentToday,
      currentConnections: getCurrentConnections(),
      avgGameDurationMinutes: avgDurationMinutes ? Math.round(avgDurationMinutes * 10) / 10 : null,
      completionRate: completionRate ? Math.round(completionRate * 10) / 10 : null,
      avgPlayersPerGame: avgPlayersPerGame ? Math.round(avgPlayersPerGame * 10) / 10 : null,
      gamesByPlayerCount,
      peakHour,
      peakHourGames,
      avgStanzasPerGame: avgStanzasPerGame ? Math.round(avgStanzasPerGame * 10) / 10 : null,
      totalWhoopiesCalled,
      totalWhoopieMisses
    };
  } catch (error) {
    console.error('Failed to get statistics:', error);
    return defaultStats;
  }
}
