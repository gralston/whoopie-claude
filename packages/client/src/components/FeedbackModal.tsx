import { useState } from 'react';
import { motion } from 'framer-motion';
import { submitFeedback } from '../services/api';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function FeedbackModal({ isOpen, onClose }: FeedbackModalProps) {
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!message.trim()) {
      setErrorMessage('Please enter a message');
      setStatus('error');
      return;
    }

    setStatus('submitting');
    setErrorMessage('');

    try {
      const result = await submitFeedback(message, email || undefined);
      if (result.success) {
        setStatus('success');
        setMessage('');
        setEmail('');
        // Close after showing success
        setTimeout(() => {
          onClose();
          setStatus('idle');
        }, 2000);
      } else {
        setErrorMessage(result.error || 'Failed to submit feedback');
        setStatus('error');
      }
    } catch {
      setErrorMessage('Failed to submit feedback. Please try again.');
      setStatus('error');
    }
  };

  const handleClose = () => {
    if (status !== 'submitting') {
      onClose();
      setStatus('idle');
      setErrorMessage('');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="bg-gray-800 rounded-xl p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-white mb-4">Send Feedback</h2>

        {status === 'success' ? (
          <div className="text-center py-8">
            <div className="text-green-400 text-4xl mb-4">✓</div>
            <p className="text-green-400">Thank you for your feedback!</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="mb-4">
              <label className="block text-gray-300 text-sm mb-2">
                Message <span className="text-red-400">*</span>
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share your thoughts, report bugs, or suggest improvements..."
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
                rows={5}
                maxLength={1000}
                disabled={status === 'submitting'}
              />
              <div className="text-gray-500 text-xs text-right mt-1">
                {message.length}/1000
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-gray-300 text-sm mb-2">
                Email (optional)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                disabled={status === 'submitting'}
              />
              <p className="text-gray-500 text-xs mt-1">
                Include if you'd like a response
              </p>
            </div>

            {status === 'error' && (
              <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded-lg">
                <p className="text-red-400 text-sm">{errorMessage}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="flex-1 px-4 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition"
                disabled={status === 'submitting'}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={status === 'submitting'}
              >
                {status === 'submitting' ? 'Sending...' : 'Send'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </motion.div>
  );
}
