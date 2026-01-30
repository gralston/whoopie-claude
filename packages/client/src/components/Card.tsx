import { motion } from 'framer-motion';
import { Card as CardType, isSuitCard, isJoker, Suit, Rank } from '@whoopie/shared';

interface CardProps {
  card: CardType;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  small?: boolean;
  faceDown?: boolean;
}

// Suit symbols for simple HTML cards on mobile
const suitSymbol: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

const redSuits: Set<Suit> = new Set(['hearts', 'diamonds']);

// Simple HTML card for mobile readability
function SimpleCard({
  card,
  className = '',
}: {
  card: CardType;
  className?: string;
}) {
  if (isJoker(card)) {
    const isRed = card.jokerNumber === 1;
    return (
      <div
        className={`${className} rounded-lg bg-white flex flex-col items-center justify-center relative`}
      >
        <span className={`text-[10px] font-bold absolute top-0.5 left-1 ${isRed ? 'text-red-600' : 'text-gray-800'}`}>J</span>
        <span className={`text-lg font-bold ${isRed ? 'text-red-600' : 'text-gray-800'}`}>★</span>
        <span className={`text-[10px] font-bold absolute bottom-0.5 right-1 rotate-180 ${isRed ? 'text-red-600' : 'text-gray-800'}`}>J</span>
      </div>
    );
  }

  if (isSuitCard(card)) {
    const isRed = redSuits.has(card.suit);
    const color = isRed ? 'text-red-600' : 'text-gray-800';
    const symbol = suitSymbol[card.suit];
    return (
      <div
        className={`${className} rounded-lg bg-white flex flex-col items-center justify-center relative`}
      >
        <span className={`text-[10px] font-bold leading-none absolute top-0.5 left-1 ${color}`}>{card.rank}</span>
        <span className={`text-lg leading-none ${color}`}>{symbol}</span>
        <span className={`text-[10px] font-bold leading-none absolute bottom-0.5 right-1 rotate-180 ${color}`}>{card.rank}</span>
      </div>
    );
  }

  return null;
}

// Map game suit names to SVG file suit names (singular)
const suitToFile: Record<Suit, string> = {
  spades: 'spade',
  hearts: 'heart',
  diamonds: 'diamond',
  clubs: 'club',
};

// Map game rank names to SVG file rank names
const rankToFile: Record<Rank, string> = {
  'A': 'Ace',
  'K': 'King',
  'Q': 'Queen',
  'J': 'Jack',
  '10': '10',
  '9': '9',
  '8': '8',
  '7': '7',
  '6': '6',
  '5': '5',
  '4': '4',
  '3': '3',
  '2': '2',
};

// Get the SVG path for a card
function getCardSvgPath(card: CardType): string {
  if (isJoker(card)) {
    // Use red joker for joker 1, black joker for joker 2
    return card.jokerNumber === 1 ? '/cards/redJoker.svg' : '/cards/blackJoker.svg';
  }

  if (isSuitCard(card)) {
    const suit = suitToFile[card.suit];
    const rank = rankToFile[card.rank];
    return `/cards/${suit}${rank}.svg`;
  }

  return '/cards/blueBack.svg';
}

export default function Card({
  card,
  onClick,
  disabled = false,
  selected = false,
  small = false,
  faceDown = false,
}: CardProps) {
  const sizeClasses = small
    ? 'w-10 h-[60px]'
    : 'w-12 h-[72px] sm:w-16 sm:h-24 md:w-20 md:h-[120px]';

  if (faceDown) {
    return (
      <div className={`${sizeClasses} rounded-lg overflow-hidden card-shadow`}>
        <img
          src="/cards/blueBack.svg"
          alt="Card back"
          className="w-full h-full object-cover"
        />
      </div>
    );
  }

  const svgPath = getCardSvgPath(card);
  const altText = isJoker(card)
    ? `Joker ${card.jokerNumber}`
    : isSuitCard(card)
      ? `${card.rank} of ${card.suit}`
      : 'Card';

  const simpleSizeClasses = small
    ? 'w-10 h-[60px]'
    : 'w-12 h-[72px]';

  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={!disabled ? { y: -8 } : undefined}
      whileTap={!disabled ? { scale: 0.95 } : undefined}
      className={`
        ${sizeClasses}
        rounded-lg overflow-hidden
        ${selected ? 'ring-2 ring-yellow-400 ring-offset-2' : ''}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-lg'}
        card-shadow transition-shadow
      `}
    >
      <SimpleCard card={card} className={`${simpleSizeClasses} sm:hidden`} />
      <img
        src={svgPath}
        alt={altText}
        className="w-full h-full object-cover hidden sm:block"
        draggable={false}
      />
    </motion.button>
  );
}

// Mini card for showing in tricks or other players' areas
export function MiniCard({ card, highlight = false }: { card: CardType; highlight?: boolean }) {
  const svgPath = getCardSvgPath(card);
  const altText = isJoker(card)
    ? `Joker ${card.jokerNumber}`
    : isSuitCard(card)
      ? `${card.rank} of ${card.suit}`
      : 'Card';

  return (
    <div
      className={`w-8 h-12 rounded overflow-hidden ${
        highlight ? 'ring-2 ring-yellow-400' : ''
      } card-shadow`}
    >
      <img
        src={svgPath}
        alt={altText}
        className="w-full h-full object-cover"
        draggable={false}
      />
    </div>
  );
}

// Trick card - scales based on player count for optimal visibility
export function TrickCard({
  card,
  highlight = false,
  playerCount
}: {
  card: CardType;
  highlight?: boolean;
  playerCount: number;
}) {
  const svgPath = getCardSvgPath(card);
  const altText = isJoker(card)
    ? `Joker ${card.jokerNumber}`
    : isSuitCard(card)
      ? `${card.rank} of ${card.suit}`
      : 'Card';

  // Scale card size based on player count
  // 2-4 players: large, 5-6: medium-large, 7-8: medium, 9-10: small
  let sizeClasses: string;
  let ringSize: string;

  if (playerCount <= 4) {
    sizeClasses = 'w-[50px] h-[75px] md:w-[68px] md:h-[102px]'; // mobile: 50x75px, desktop: 68x102px
    ringSize = 'ring-4';
  } else if (playerCount <= 6) {
    sizeClasses = 'w-10 h-[60px] md:w-14 md:h-[84px]'; // mobile: 40x60px, desktop: 56x84px
    ringSize = 'ring-4';
  } else if (playerCount <= 8) {
    sizeClasses = 'w-12 h-[72px]'; // 48x72px
    ringSize = 'ring-2';
  } else {
    sizeClasses = 'w-10 h-[60px]'; // 40x60px
    ringSize = 'ring-2';
  }

  // Mobile-only size classes for SimpleCard
  let simpleSizeClasses: string;
  if (playerCount <= 4) {
    simpleSizeClasses = 'w-[50px] h-[75px]';
  } else if (playerCount <= 6) {
    simpleSizeClasses = 'w-10 h-[60px]';
  } else if (playerCount <= 8) {
    simpleSizeClasses = 'w-12 h-[72px]';
  } else {
    simpleSizeClasses = 'w-10 h-[60px]';
  }

  return (
    <div
      className={`${sizeClasses} rounded-lg overflow-hidden ${
        highlight ? `${ringSize} ring-yellow-400` : ''
      } card-shadow`}
    >
      <SimpleCard card={card} className={`${simpleSizeClasses} sm:hidden`} />
      <img
        src={svgPath}
        alt={altText}
        className="w-full h-full object-cover hidden sm:block"
        draggable={false}
      />
    </div>
  );
}

// Medium card for Whoopie defining card display
export function MediumCard({ card, highlight = false }: { card: CardType; highlight?: boolean }) {
  const svgPath = getCardSvgPath(card);
  const altText = isJoker(card)
    ? `Joker ${card.jokerNumber}`
    : isSuitCard(card)
      ? `${card.rank} of ${card.suit}`
      : 'Card';

  return (
    <div
      className={`w-10 h-[60px] md:w-14 md:h-[84px] rounded-lg overflow-hidden ${
        highlight ? 'ring-2 ring-yellow-400' : ''
      } card-shadow`}
    >
      <SimpleCard card={card} className="w-10 h-[60px] sm:hidden" />
      <img
        src={svgPath}
        alt={altText}
        className="w-full h-full object-cover hidden sm:block"
        draggable={false}
      />
    </div>
  );
}

// Card back for showing opponent hand (visual only, no count)
export function CardBack({ count }: { count: number }) {
  if (count === 0) return null;

  return (
    <div className="relative" style={{ width: '24px', height: '36px' }}>
      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
        <div
          key={i}
          className="absolute w-6 h-9 rounded overflow-hidden card-shadow"
          style={{
            left: `${i * 2}px`,
            top: `${i * -1}px`,
            zIndex: i,
          }}
        >
          <img
            src="/cards/blueBack.svg"
            alt="Card back"
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}

// Export for use in Game.tsx trick display
export { getCardSvgPath };
