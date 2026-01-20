const API_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:3005';

export async function submitFeedback(
  message: string,
  contactEmail?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_URL}/api/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message, contactEmail }),
    });
    return response.json();
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

// Admin API functions
export async function getAdminStats(adminKey: string): Promise<{
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
  // New calculated stats
  avgGameDurationMinutes: number | null;
  completionRate: number | null;
  avgPlayersPerGame: number | null;
  gamesByPlayerCount: Record<number, number>;
  peakHour: number | null;
  peakHourGames: number;
  avgStanzasPerGame: number | null;
  totalWhoopiesCalled: number;
  totalWhoopieMisses: number;
} | null> {
  try {
    const response = await fetch(`${API_URL}/api/admin/stats`, {
      headers: {
        'X-Admin-Key': adminKey,
      },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export interface FeedbackItem {
  id: string;
  message: string;
  contact_email: string | null;
  created_at: string;
  status: 'new' | 'read' | 'resolved';
}

export async function getAdminFeedback(
  adminKey: string,
  limit = 50,
  offset = 0
): Promise<{ data: FeedbackItem[]; total: number } | null> {
  try {
    const response = await fetch(
      `${API_URL}/api/admin/feedback?limit=${limit}&offset=${offset}`,
      {
        headers: {
          'X-Admin-Key': adminKey,
        },
      }
    );
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

export async function updateFeedbackStatus(
  adminKey: string,
  feedbackId: string,
  status: 'new' | 'read' | 'resolved'
): Promise<boolean> {
  try {
    const response = await fetch(
      `${API_URL}/api/admin/feedback/${feedbackId}/status`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Admin-Key': adminKey,
        },
        body: JSON.stringify({ status }),
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}
