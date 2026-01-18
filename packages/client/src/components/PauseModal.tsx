import { useState } from 'react';
import { motion } from 'framer-motion';

interface PauseModalProps {
  resumeCode: string;
  onClose: () => void;
}

export function PauseModal({ resumeCode, onClose }: PauseModalProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(resumeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = resumeCode;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="bg-gray-800 rounded-xl p-6 max-w-md w-full text-center"
      >
        <h2 className="text-2xl font-bold text-white mb-4">Game Paused</h2>

        <p className="text-gray-300 mb-6">
          Share this code with other players to resume the game later.
          The code expires in 7 days.
        </p>

        <div className="bg-gray-900 rounded-lg p-4 mb-6">
          <p className="text-gray-400 text-sm mb-2">Resume Code</p>
          <p className="text-4xl font-mono font-bold text-green-400 tracking-widest">
            {resumeCode}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCopy}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition font-semibold"
          >
            {copied ? 'Copied!' : 'Copy Code'}
          </button>
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition font-semibold"
          >
            Close
          </button>
        </div>

        <p className="text-gray-500 text-sm mt-4">
          You can resume from the home page using this code.
        </p>
      </motion.div>
    </motion.div>
  );
}
