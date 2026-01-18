import { supabase, isSupabaseConfigured } from './supabase.js';
import { GameState } from '@whoopie/shared';

// Generate a short, memorable resume code (e.g., "7X3K")
function generateResumeCode(): string {
  // Avoid confusing characters: 0/O, 1/I/L
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export interface PausedGame {
  id: string;
  resumeCode: string;
  gameState: GameState;
  playerNames: string[];
  createdAt: string;
  expiresAt: string;
}

export async function saveGameState(
  gameState: GameState
): Promise<{ success: boolean; resumeCode?: string; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Pause system not configured' };
  }

  // Generate a unique resume code (retry if collision)
  let resumeCode = generateResumeCode();
  let attempts = 0;
  const maxAttempts = 5;

  while (attempts < maxAttempts) {
    try {
      // Extract human player names for matching on resume
      const playerNames = gameState.players
        .filter(p => p.type === 'human')
        .map(p => p.name);

      const { error } = await supabase.from('paused_games').insert({
        resume_code: resumeCode,
        game_state: gameState,
        player_names: playerNames,
      });

      if (error) {
        // If duplicate key, try a new code
        if (error.code === '23505') {
          resumeCode = generateResumeCode();
          attempts++;
          continue;
        }
        throw error;
      }

      return { success: true, resumeCode };
    } catch (error) {
      console.error('Failed to save game state:', error);
      return { success: false, error: 'Failed to save game' };
    }
  }

  return { success: false, error: 'Failed to generate unique resume code' };
}

export async function loadGameState(
  resumeCode: string
): Promise<{ success: boolean; gameState?: GameState; playerNames?: string[]; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { success: false, error: 'Pause system not configured' };
  }

  try {
    const normalizedCode = resumeCode.toUpperCase().trim();

    const { data, error } = await supabase
      .from('paused_games')
      .select('*')
      .eq('resume_code', normalizedCode)
      .is('resumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return { success: false, error: 'Game not found or expired' };
    }

    // Mark as resumed
    await supabase
      .from('paused_games')
      .update({ resumed_at: new Date().toISOString() })
      .eq('id', data.id);

    return {
      success: true,
      gameState: data.game_state as GameState,
      playerNames: data.player_names as string[],
    };
  } catch (error) {
    console.error('Failed to load game state:', error);
    return { success: false, error: 'Failed to load game' };
  }
}

export async function checkResumeCode(
  resumeCode: string
): Promise<{ valid: boolean; playerNames?: string[]; error?: string }> {
  if (!isSupabaseConfigured() || !supabase) {
    return { valid: false, error: 'Pause system not configured' };
  }

  try {
    const normalizedCode = resumeCode.toUpperCase().trim();

    const { data, error } = await supabase
      .from('paused_games')
      .select('player_names')
      .eq('resume_code', normalizedCode)
      .is('resumed_at', null)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (error || !data) {
      return { valid: false, error: 'Game not found or expired' };
    }

    return {
      valid: true,
      playerNames: data.player_names as string[],
    };
  } catch (error) {
    console.error('Failed to check resume code:', error);
    return { valid: false, error: 'Failed to check code' };
  }
}
