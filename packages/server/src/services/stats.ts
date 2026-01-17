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
    await supabase
      .from('daily_stats')
      .upsert({
        date,
        max_concurrent_players: max
      }, {
        onConflict: 'date'
      });
  } catch (error) {
    console.error('Failed to update max concurrent:', error);
  }
}

export async function recordGameCreated(
  gameId: string,
  playerCount: number,
  aiCount: number
): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase.from('game_statistics').insert({
      game_id: gameId,
      player_count: playerCount,
      ai_count: aiCount,
      status: 'created'
    });

    // Update daily stats - get current value and increment
    const today = getToday();
    const { data: existing } = await supabase
      .from('daily_stats')
      .select('games_created')
      .eq('date', today)
      .single();

    if (existing) {
      await supabase
        .from('daily_stats')
        .update({ games_created: (existing.games_created || 0) + 1 })
        .eq('date', today);
    } else {
      await supabase
        .from('daily_stats')
        .insert({ date: today, games_created: 1 });
    }
  } catch (error) {
    console.error('Failed to record game created:', error);
  }
}

export async function recordGameStarted(gameId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase
      .from('game_statistics')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString()
      })
      .eq('game_id', gameId);
  } catch (error) {
    console.error('Failed to record game started:', error);
  }
}

export async function recordGameCompleted(gameId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase
      .from('game_statistics')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString()
      })
      .eq('game_id', gameId);

    // Update daily stats - get current value and increment
    const today = getToday();
    const { data: existing } = await supabase
      .from('daily_stats')
      .select('games_completed')
      .eq('date', today)
      .single();

    if (existing) {
      await supabase
        .from('daily_stats')
        .update({ games_completed: (existing.games_completed || 0) + 1 })
        .eq('date', today);
    } else {
      await supabase
        .from('daily_stats')
        .insert({ date: today, games_completed: 1 });
    }
  } catch (error) {
    console.error('Failed to record game completed:', error);
  }
}

export async function recordGameAbandoned(gameId: string): Promise<void> {
  if (!isSupabaseConfigured() || !supabase) return;

  try {
    await supabase
      .from('game_statistics')
      .update({
        status: 'abandoned',
        completed_at: new Date().toISOString()
      })
      .eq('game_id', gameId);
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
    await supabase
      .from('game_statistics')
      .update({
        player_count: playerCount,
        ai_count: aiCount
      })
      .eq('game_id', gameId);
  } catch (error) {
    console.error('Failed to update game player count:', error);
  }
}

export interface Statistics {
  totalGames: number;
  gamesCreated: number;
  gamesInProgress: number;
  gamesCompleted: number;
  gamesAbandoned: number;
  gamesToday: number;
  gamesCompletedToday: number;
  maxConcurrentPlayers: number;
  currentConnections: number;
}

export async function getStatistics(): Promise<Statistics> {
  const defaultStats: Statistics = {
    totalGames: 0,
    gamesCreated: 0,
    gamesInProgress: 0,
    gamesCompleted: 0,
    gamesAbandoned: 0,
    gamesToday: 0,
    gamesCompletedToday: 0,
    maxConcurrentPlayers: 0,
    currentConnections: getCurrentConnections()
  };

  if (!isSupabaseConfigured() || !supabase) return defaultStats;

  try {
    const today = getToday();

    // Get game counts by status
    const { data: statusCounts } = await supabase
      .from('game_statistics')
      .select('status')
      .then(result => {
        const counts = { created: 0, in_progress: 0, completed: 0, abandoned: 0 };
        result.data?.forEach(row => {
          counts[row.status as keyof typeof counts]++;
        });
        return { data: counts };
      });

    // Get today's games
    const { count: gamesToday } = await supabase
      .from('game_statistics')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00Z`);

    // Get today's completed games
    const { count: completedToday } = await supabase
      .from('game_statistics')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('completed_at', `${today}T00:00:00Z`);

    // Get max concurrent from daily stats
    const { data: dailyStats } = await supabase
      .from('daily_stats')
      .select('max_concurrent_players')
      .order('max_concurrent_players', { ascending: false })
      .limit(1)
      .single();

    const total = (statusCounts?.created || 0) +
                  (statusCounts?.in_progress || 0) +
                  (statusCounts?.completed || 0) +
                  (statusCounts?.abandoned || 0);

    return {
      totalGames: total,
      gamesCreated: statusCounts?.created || 0,
      gamesInProgress: statusCounts?.in_progress || 0,
      gamesCompleted: statusCounts?.completed || 0,
      gamesAbandoned: statusCounts?.abandoned || 0,
      gamesToday: gamesToday || 0,
      gamesCompletedToday: completedToday || 0,
      maxConcurrentPlayers: dailyStats?.max_concurrent_players || maxConcurrentToday,
      currentConnections: getCurrentConnections()
    };
  } catch (error) {
    console.error('Failed to get statistics:', error);
    return defaultStats;
  }
}
