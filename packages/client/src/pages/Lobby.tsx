import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';

interface PublicGame {
  id: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
}

export default function Lobby() {
  const navigate = useNavigate();
  const { isConnected } = useSocket();
  const { joinGame } = useGame();
  const [games, setGames] = useState<PublicGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [playerName, setPlayerName] = useState('');
  const [joiningGameId, setJoiningGameId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGames();
    const interval = setInterval(fetchGames, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchGames = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3005';
      const response = await fetch(`${apiUrl}/api/games`);
      const data = await response.json();
      setGames(data);
    } catch (err) {
      console.error('Failed to fetch games:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (gameId: string) => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setJoiningGameId(gameId);
    setError(null);

    try {
      await joinGame(gameId, playerName.trim());
      navigate(`/game/${gameId}`);
    } catch (err) {
      setError((err as Error).message);
      setJoiningGameId(null);
    }
  };

  return (
    <div className="min-h-screen p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/')}
            className="text-gray-400 hover:text-white transition"
          >
            &larr; Back
          </button>
          <h1 className="text-2xl font-bold text-white">Game Lobby</h1>
          <div className="w-16" /> {/* Spacer */}
        </div>

        {/* Name Input */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6">
          <label className="block text-gray-400 text-sm mb-2">Your Name</label>
          <input
            type="text"
            placeholder="Enter your name to join a game"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
            maxLength={20}
          />
          {error && <p className="text-red-400 text-sm mt-2">{error}</p>}
        </div>

        {/* Games List */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-lg font-semibold text-white">Available Games</h2>
          </div>

          {loading ? (
            <div className="p-8 text-center text-gray-400">Loading games...</div>
          ) : games.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-gray-400 mb-4">No games available</p>
              <button
                onClick={() => navigate('/')}
                className="px-6 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold transition"
              >
                Create a Game
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {games.map((game) => (
                <div
                  key={game.id}
                  className="p-4 flex items-center justify-between hover:bg-gray-750"
                >
                  <div>
                    <p className="text-white font-medium">{game.hostName}'s Game</p>
                    <p className="text-gray-400 text-sm">
                      {game.playerCount} / {game.maxPlayers} players
                    </p>
                  </div>
                  <button
                    onClick={() => handleJoin(game.id)}
                    disabled={!isConnected || joiningGameId === game.id || !playerName.trim()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition"
                  >
                    {joiningGameId === game.id ? 'Joining...' : 'Join'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Refresh Button */}
        <div className="mt-4 text-center">
          <button
            onClick={fetchGames}
            className="text-gray-400 hover:text-white text-sm transition"
          >
            Refresh List
          </button>
        </div>
      </div>
    </div>
  );
}
