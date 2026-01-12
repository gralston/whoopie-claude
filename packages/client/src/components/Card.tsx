import { motion } from 'framer-motion';
import { Card as CardType, isSuitCard, isJoker, Suit } from '@whoopie/shared';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  small?: boolean;
  faceDown?: boolean;
}

const suitSymbols: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const suitColors: Record<Suit, string> = {
  spades: 'text-gray-900',
  hearts: 'text-red-600',
  diamonds: 'text-red-600',
  clubs: 'text-gray-900',
};

export default function Card({
  card,
  onClick,
  disabled = false,
  selected = false,
  small = false,
  faceDown = false,
}: CardProps) {
  const baseClasses = small
    ? 'w-10 h-14 text-xs'
    : 'w-16 h-24 sm:w-20 sm:h-28 text-sm sm:text-base';

  if (faceDown) {
    return (
      <div
        className={`${baseClasses} rounded-lg bg-blue-800 border-2 border-blue-600 card-shadow flex items-center justify-center`}
        style={{
          backgroundImage: `repeating-linear-gradient(
            45deg,
            transparent,
            transparent 5px,
            rgba(255,255,255,0.05) 5px,
            rgba(255,255,255,0.05) 10px
          )`,
        }}
      >
        <div className="text-blue-400 text-2xl font-bold">W</div>
      </div>
    );
  }

  if (isJoker(card)) {
    return (
      <motion.button
        onClick={onClick}
        disabled={disabled}
        whileHover={!disabled ? { y: -8 } : undefined}
        whileTap={!disabled ? { scale: 0.95 } : undefined}
        className={`
          ${baseClasses}
          rounded-lg bg-white border-2
          ${selected ? 'border-yellow-400 ring-2 ring-yellow-400' : 'border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}
          card-shadow flex flex-col items-center justify-center
          transition-shadow
        `}
      >
        <span className="text-purple-600 font-bold text-lg">JOKER</span>
        <span className="text-2xl">🃏</span>
      </motion.button>
    );
  }

  if (isSuitCard(card)) {
    const symbol = suitSymbols[card.suit];
    const colorClass = suitColors[card.suit];

    return (
      <motion.button
        onClick={onClick}
        disabled={disabled}
        whileHover={!disabled ? { y: -8 } : undefined}
        whileTap={!disabled ? { scale: 0.95 } : undefined}
        className={`
          ${baseClasses}
          rounded-lg bg-white border-2
          ${selected ? 'border-yellow-400 ring-2 ring-yellow-400' : 'border-gray-300'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}
          card-shadow flex flex-col items-center justify-between p-1
          transition-shadow font-card
        `}
      >
        {/* Top left */}
        <div className={`self-start ${colorClass}`}>
          <div className="font-bold leading-none">{card.rank}</div>
          <div className="text-lg leading-none">{symbol}</div>
        </div>

        {/* Center */}
        <div className={`text-3xl ${colorClass}`}>{symbol}</div>

        {/* Bottom right (rotated) */}
        <div className={`self-end rotate-180 ${colorClass}`}>
          <div className="font-bold leading-none">{card.rank}</div>
          <div className="text-lg leading-none">{symbol}</div>
        </div>
      </motion.button>
    );
  }

  return null;
}

// Mini card for showing in tricks or other players' areas
export function MiniCard({ card, highlight = false }: { card: CardType; highlight?: boolean }) {
  if (isJoker(card)) {
    return (
      <div
        className={`w-8 h-12 rounded bg-white border ${
          highlight ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-gray-300'
        } flex items-center justify-center text-purple-600 text-xs font-bold card-shadow`}
      >
        JKR
      </div>
    );
  }

  if (isSuitCard(card)) {
    const symbol = suitSymbols[card.suit];
    const colorClass = suitColors[card.suit];

    return (
      <div
        className={`w-8 h-12 rounded bg-white border ${
          highlight ? 'border-yellow-400 ring-1 ring-yellow-400' : 'border-gray-300'
        } flex flex-col items-center justify-center card-shadow ${colorClass}`}
      >
        <span className="text-xs font-bold leading-none">{card.rank}</span>
        <span className="text-sm leading-none">{symbol}</span>
      </div>
    );
  }

  return null;
}

// Medium card for Whoopie defining card display
export function MediumCard({ card, highlight = false }: { card: CardType; highlight?: boolean }) {
  if (isJoker(card)) {
    return (
      <div
        className={`w-14 h-20 rounded-lg bg-white border-2 ${
          highlight ? 'border-yellow-400 ring-2 ring-yellow-400' : 'border-gray-300'
        } flex flex-col items-center justify-center text-purple-600 font-bold card-shadow`}
      >
        <span className="text-sm">JOKER</span>
        <span className="text-2xl">🃏</span>
      </div>
    );
  }

  if (isSuitCard(card)) {
    const symbol = suitSymbols[card.suit];
    const colorClass = suitColors[card.suit];

    return (
      <div
        className={`w-14 h-20 rounded-lg bg-white border-2 ${
          highlight ? 'border-yellow-400 ring-2 ring-yellow-400' : 'border-gray-300'
        } flex flex-col items-center justify-center card-shadow ${colorClass}`}
      >
        <span className="text-lg font-bold leading-none">{card.rank}</span>
        <span className="text-2xl leading-none">{symbol}</span>
      </div>
    );
  }

  return null;
}

// Card back for showing opponent hand (visual only, no count)
export function CardBack({ count }: { count: number }) {
  // Show stacked card backs based on count
  if (count === 0) return null;

  return (
    <div className="relative" style={{ width: '24px', height: '36px' }}>
      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
        <div
          key={i}
          className="absolute w-6 h-9 rounded bg-blue-800 border border-blue-600 card-shadow"
          style={{
            left: `${i * 2}px`,
            top: `${i * -1}px`,
            zIndex: i,
            backgroundImage: `repeating-linear-gradient(
              45deg,
              transparent,
              transparent 3px,
              rgba(255,255,255,0.05) 3px,
              rgba(255,255,255,0.05) 6px
            )`,
          }}
        />
      ))}
    </div>
  );
}
