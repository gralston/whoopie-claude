import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSocket } from '../context/SocketContext';
import { useGame } from '../context/GameContext';
import RulesContent from '../components/RulesContent';

export default function Home() {
  const navigate = useNavigate();
  const { isConnected } = useSocket();
  const { createGame, joinGame } = useGame();
  const [playerName, setPlayerName] = useState('');
  const [joinGameId, setJoinGameId] = useState('');
  const [mode, setMode] = useState<'home' | 'create' | 'join'>('home');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showRules, setShowRules] = useState(false);

  const handleCreate = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const gameId = await createGame(playerName.trim());
      navigate(`/game/${gameId}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim()) {
      setError('Please enter your name');
      return;
    }
    if (!joinGameId.trim()) {
      setError('Please enter game ID');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await joinGame(joinGameId.trim(), playerName.trim());
      navigate(`/game/${joinGameId.trim()}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <h1 className="text-6xl font-bold text-white mb-2">
            <span className="text-red-500">W</span>hoopie!
          </h1>
          <p className="text-gray-400 text-lg">A Ralston Family Tradition</p>
        </div>

        {/* Connection Status */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected ? 'bg-green-500' : 'bg-red-500'
            }`}
          />
          <span className="text-gray-400 text-sm">
            {isConnected ? 'Connected' : 'Connecting...'}
          </span>
        </div>

        {/* Main Card */}
        <div className="bg-gray-800 rounded-xl shadow-2xl p-6">
          {mode === 'home' && (
            <div className="space-y-4">
              <button
                onClick={() => setMode('create')}
                disabled={!isConnected}
                className="w-full py-4 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-lg transition"
              >
                Create Game
              </button>
              <button
                onClick={() => setMode('join')}
                disabled={!isConnected}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-lg transition"
              >
                Join Game
              </button>
              <button
                onClick={() => navigate('/lobby')}
                disabled={!isConnected}
                className="w-full py-4 bg-gray-600 hover:bg-gray-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-lg transition"
              >
                Browse Games
              </button>
            </div>
          )}

          {mode === 'create' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-4">Create New Game</h2>
              <input
                type="text"
                placeholder="Your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-green-500 focus:outline-none"
                maxLength={20}
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setMode('home');
                    setError(null);
                  }}
                  className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition"
                >
                  Back
                </button>
                <button
                  onClick={handleCreate}
                  disabled={loading || !isConnected}
                  className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white rounded-lg font-semibold transition"
                >
                  {loading ? 'Creating...' : 'Create'}
                </button>
              </div>
            </div>
          )}

          {mode === 'join' && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white mb-4">Join Game</h2>
              <input
                type="text"
                placeholder="Your name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
                maxLength={20}
              />
              <input
                type="text"
                placeholder="Game ID"
                value={joinGameId}
                onChange={(e) => setJoinGameId(e.target.value)}
                className="w-full p-3 bg-gray-700 text-white rounded-lg border border-gray-600 focus:border-blue-500 focus:outline-none"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setMode('home');
                    setError(null);
                  }}
                  className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition"
                >
                  Back
                </button>
                <button
                  onClick={handleJoin}
                  disabled={loading || !isConnected}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white rounded-lg font-semibold transition"
                >
                  {loading ? 'Joining...' : 'Join'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center mt-6">
          <p className="text-gray-500 text-sm">
            Created by Jonathan Wexler, 1966
          </p>
          <button
            onClick={() => setShowRules(true)}
            className="text-blue-400 hover:text-blue-300 text-sm transition mt-2"
          >
            The Rules of Whoopie
          </button>
        </div>
      </div>

      {/* Rules Modal */}
      <AnimatePresence>
        {showRules && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowRules(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="bg-gray-800 rounded-xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-2xl font-bold text-white mb-4">Whoopie Rules</h2>

              <RulesContent />

              <button
                onClick={() => setShowRules(false)}
                className="mt-6 w-full py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
              >
                Got it!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
