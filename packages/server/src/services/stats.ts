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

export async function recordGameCompleted(gameId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    const { error } = await supabase
      .from('game_statistics')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('game_id', gameId);

    if (error) {
      console.error('Failed to record game completed:', error.message);
      return;
    }

    // Update daily stats
    const today = getToday();
    await incrementDailyStat(today, 'games_completed');

    console.log(`Game completed recorded: ${gameId}`);
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
    currentConnections: getCurrentConnections()
  };

  if (!isSupabaseConfigured() || !supabase) {
    console.log('Supabase not configured, returning default stats');
    return defaultStats;
  }

  try {
    const today = getToday();

    // Get all game statistics and count by status
    const { data: allGames, error: gamesError } = await supabase
      .from('game_statistics')
      .select('status, started_at');

    if (gamesError) {
      console.error('Failed to fetch game statistics:', gamesError.message);
      return defaultStats;
    }

    const counts = {
      created: 0,
      in_progress: 0,
      completed: 0,
      abandoned: 0,
      started: 0  // Games that actually started (have started_at)
    };

    allGames?.forEach(row => {
      const status = row.status as keyof typeof counts;
      if (status in counts) {
        counts[status]++;
      }
      if (row.started_at) {
        counts.started++;
      }
    });

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

    return {
      totalGamesStarted: counts.started,
      gamesCreatedNotStarted: counts.created,  // These are games that were created but never started
      gamesInProgress: counts.in_progress,
      gamesCompleted: counts.completed,
      gamesAbandoned: counts.abandoned,
      gamesToday: gamesToday || 0,
      gamesCompletedToday: completedToday || 0,
      gamesAbandonedToday: abandonedToday || 0,
      humanPlayersToday: dailyStats?.human_players_today || 0,
      aiPlayersToday: dailyStats?.ai_players_today || 0,
      maxConcurrentPlayers: maxStats?.max_concurrent_players || maxConcurrentToday,
      currentConnections: getCurrentConnections()
    };
  } catch (error) {
    console.error('Failed to get statistics:', error);
    return defaultStats;
  }
}
