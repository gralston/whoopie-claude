import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface HelpMenuProps {
  onShowRules: () => void;
  onShowFeedback: () => void;
  variant?: 'default' | 'footer';
}

export function HelpMenu({ onShowRules, onShowFeedback, variant = 'default' }: HelpMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const buttonClass = variant === 'footer'
    ? 'text-blue-400 hover:text-blue-300 text-sm transition'
    : 'text-purple-400 hover:text-purple-300 text-sm transition';

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClass}
      >
        Help {isOpen ? '▲' : '▼'}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 mt-2 w-40 bg-gray-800 rounded-lg shadow-lg border border-gray-700 overflow-hidden z-50"
          >
            <button
              onClick={() => {
                onShowRules();
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 transition"
            >
              Rules
            </button>
            <button
              onClick={() => {
                onShowFeedback();
                setIsOpen(false);
              }}
              className="w-full px-4 py-2 text-left text-sm text-gray-200 hover:bg-gray-700 transition"
            >
              Feedback
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
