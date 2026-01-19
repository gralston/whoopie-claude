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
    : 'w-16 h-24 sm:w-20 sm:h-[120px]';

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
      <img
        src={svgPath}
        alt={altText}
        className="w-full h-full object-cover"
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
      className={`w-14 h-[84px] rounded-lg overflow-hidden ${
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
