import { useState, useEffect } from 'react';
import { getAdminStats, getAdminFeedback, updateFeedbackStatus, FeedbackItem } from '../services/api';

export default function Admin() {
  const [adminKey, setAdminKey] = useState(() => localStorage.getItem('adminKey') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getAdminStats>>>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);

  const loadData = async (key: string) => {
    setLoading(true);
    setError('');

    const statsData = await getAdminStats(key);
    if (!statsData) {
      setError('Invalid admin key or server error');
      setIsAuthenticated(false);
      localStorage.removeItem('adminKey');
      setLoading(false);
      return;
    }

    setStats(statsData);
    setIsAuthenticated(true);
    localStorage.setItem('adminKey', key);

    const feedbackData = await getAdminFeedback(key);
    if (feedbackData) {
      setFeedback(feedbackData.data);
      setFeedbackTotal(feedbackData.total);
    }

    setLoading(false);
  };

  useEffect(() => {
    if (adminKey) {
      loadData(adminKey);
    }
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (adminKey.trim()) {
      loadData(adminKey.trim());
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setAdminKey('');
    localStorage.removeItem('adminKey');
  };

  const handleStatusChange = async (feedbackId: string, status: 'new' | 'read' | 'resolved') => {
    const success = await updateFeedbackStatus(adminKey, feedbackId, status);
    if (success) {
      setFeedback(prev => prev.map(f =>
        f.id === feedbackId ? { ...f, status } : f
      ));
      if (selectedFeedback?.id === feedbackId) {
        setSelectedFeedback({ ...selectedFeedback, status });
      }
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'bg-blue-600';
      case 'read': return 'bg-yellow-600';
      case 'resolved': return 'bg-green-600';
      default: return 'bg-gray-600';
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-xl p-8 max-w-md w-full">
          <h1 className="text-2xl font-bold text-white mb-6 text-center">Admin Login</h1>
          <form onSubmit={handleLogin}>
            <input
              type="password"
              value={adminKey}
              onChange={(e) => setAdminKey(e.target.value)}
              placeholder="Enter admin key"
              className="w-full px-4 py-3 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 mb-4"
            />
            {error && (
              <p className="text-red-400 text-sm mb-4">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-bold text-white">Whoopie Admin</h1>
          <div className="flex gap-4">
            <button
              onClick={() => loadData(adminKey)}
              className="px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition"
            >
              Refresh
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-500 transition"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        {stats && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <StatCard label="Total Games Started" value={stats.totalGamesStarted} />
              <StatCard label="Games Today" value={stats.gamesToday} color="blue" />
              <StatCard label="Completed" value={stats.gamesCompleted} color="green" />
              <StatCard label="Abandoned" value={stats.gamesAbandoned} color="red" />
              <StatCard label="In Progress" value={stats.gamesInProgress} color="yellow" />
              <StatCard label="Completed Today" value={stats.gamesCompletedToday} color="green" />
              <StatCard label="Abandoned Today" value={stats.gamesAbandonedToday} color="red" />
              <StatCard label="Waiting (Not Started)" value={stats.gamesCreatedNotStarted} color="gray" />
              <StatCard label="Human Players Today" value={stats.humanPlayersToday} color="blue" />
              <StatCard label="AI Players Today" value={stats.aiPlayersToday} color="purple" />
              <StatCard label="Max Concurrent" value={stats.maxConcurrentPlayers} color="purple" />
              <StatCard label="Current Connections" value={stats.currentConnections} color="blue" />
            </div>

            {/* Calculated Stats */}
            <h2 className="text-lg font-semibold text-white mb-3">Calculated Statistics</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <StatCardText
                label="Avg Game Duration"
                value={stats.avgGameDurationMinutes !== null ? `${stats.avgGameDurationMinutes} min` : '—'}
                color="blue"
              />
              <StatCardText
                label="Completion Rate"
                value={stats.completionRate !== null ? `${stats.completionRate}%` : '—'}
                color="green"
              />
              <StatCardText
                label="Avg Players/Game"
                value={stats.avgPlayersPerGame !== null ? stats.avgPlayersPerGame.toString() : '—'}
                color="purple"
              />
              <StatCardText
                label="Peak Hour (UTC)"
                value={stats.peakHour !== null ? `${stats.peakHour}:00 (${stats.peakHourGames} games)` : '—'}
                color="yellow"
              />
              <StatCardText
                label="Avg Stanzas/Game"
                value={stats.avgStanzasPerGame !== null ? stats.avgStanzasPerGame.toString() : '—'}
                color="blue"
              />
              <StatCard label="Whoopie Calls" value={stats.totalWhoopiesCalled} color="green" />
              <StatCard label="Whoopie Misses" value={stats.totalWhoopieMisses} color="red" />
            </div>

            {/* Games by Player Count */}
            {Object.keys(stats.gamesByPlayerCount).length > 0 && (
              <>
                <h2 className="text-lg font-semibold text-white mb-3">Games by Player Count</h2>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-8">
                  {Object.entries(stats.gamesByPlayerCount)
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([count, games]) => (
                      <div key={count} className="bg-gray-700 rounded-lg p-3 text-center">
                        <p className="text-gray-400 text-xs">{count} players</p>
                        <p className="text-lg font-bold text-white">{games}</p>
                      </div>
                    ))}
                </div>
              </>
            )}
          </>
        )}

        {/* Feedback Section */}
        <div className="bg-gray-800 rounded-xl p-6">
          <h2 className="text-xl font-bold text-white mb-4">
            Feedback ({feedbackTotal})
          </h2>

          {feedback.length === 0 ? (
            <p className="text-gray-400 text-center py-8">No feedback yet</p>
          ) : (
            <div className="space-y-3">
              {feedback.map(item => (
                <div
                  key={item.id}
                  onClick={() => setSelectedFeedback(item)}
                  className="bg-gray-700 rounded-lg p-4 cursor-pointer hover:bg-gray-600 transition"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className={`px-2 py-1 text-xs rounded ${getStatusColor(item.status)}`}>
                      {item.status}
                    </span>
                    <span className="text-gray-400 text-sm">
                      {formatDate(item.created_at)}
                    </span>
                  </div>
                  <p className="text-gray-200 line-clamp-2">{item.message}</p>
                  {item.contact_email && (
                    <p className="text-blue-400 text-sm mt-2">{item.contact_email}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Feedback Detail Modal */}
        {selectedFeedback && (
          <div
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedFeedback(null)}
          >
            <div
              className="bg-gray-800 rounded-xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-start mb-4">
                <span className={`px-2 py-1 text-xs rounded ${getStatusColor(selectedFeedback.status)}`}>
                  {selectedFeedback.status}
                </span>
                <span className="text-gray-400 text-sm">
                  {formatDate(selectedFeedback.created_at)}
                </span>
              </div>

              <p className="text-gray-200 whitespace-pre-wrap mb-4">
                {selectedFeedback.message}
              </p>

              {selectedFeedback.contact_email && (
                <p className="text-blue-400 mb-4">
                  Contact: {selectedFeedback.contact_email}
                </p>
              )}

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => handleStatusChange(selectedFeedback.id, 'new')}
                  className={`px-3 py-2 rounded-lg transition ${
                    selectedFeedback.status === 'new'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  New
                </button>
                <button
                  onClick={() => handleStatusChange(selectedFeedback.id, 'read')}
                  className={`px-3 py-2 rounded-lg transition ${
                    selectedFeedback.status === 'read'
                      ? 'bg-yellow-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Read
                </button>
                <button
                  onClick={() => handleStatusChange(selectedFeedback.id, 'resolved')}
                  className={`px-3 py-2 rounded-lg transition ${
                    selectedFeedback.status === 'resolved'
                      ? 'bg-green-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  Resolved
                </button>
                <button
                  onClick={() => setSelectedFeedback(null)}
                  className="ml-auto px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'gray' }: { label: string; value: number; color?: string }) {
  const bgColors: Record<string, string> = {
    gray: 'bg-gray-700',
    blue: 'bg-blue-900/50',
    green: 'bg-green-900/50',
    yellow: 'bg-yellow-900/50',
    red: 'bg-red-900/50',
    purple: 'bg-purple-900/50',
  };

  return (
    <div className={`${bgColors[color]} rounded-xl p-4`}>
      <p className="text-gray-400 text-sm">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

function StatCardText({ label, value, color = 'gray' }: { label: string; value: string; color?: string }) {
  const bgColors: Record<string, string> = {
    gray: 'bg-gray-700',
    blue: 'bg-blue-900/50',
    green: 'bg-green-900/50',
    yellow: 'bg-yellow-900/50',
    red: 'bg-red-900/50',
    purple: 'bg-purple-900/50',
  };

  return (
    <div className={`${bgColors[color]} rounded-xl p-4`}>
      <p className="text-gray-400 text-sm">{label}</p>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
