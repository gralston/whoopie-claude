import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../context/GameContext';
import Card, { MiniCard, MediumCard, CardBack, TrickCard } from '../components/Card';
import RulesContent from '../components/RulesContent';
import { HelpMenu } from '../components/HelpMenu';
import { FeedbackModal } from '../components/FeedbackModal';
import { PauseModal } from '../components/PauseModal';
import { Card as CardType, cardsEqual, isWhoopieCard, isSuitCard, isJoker, Suit, RANK_VALUES } from '@whoopie/shared';

const suitSymbols: Record<Suit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

// Player seat colors - used for initials on trick cards
const playerColors = [
  'text-blue-400',    // Player 0 (often "you")
  'text-green-400',   // Player 1
  'text-yellow-400',  // Player 2
  'text-pink-400',    // Player 3
  'text-cyan-400',    // Player 4
  'text-orange-400',  // Player 5
];

// Get player initials with color, disambiguating duplicates
function getPlayerDisplay(
  players: Array<{ name: string }>,
  playerIndex: number,
  myIndex: number
): { initials: string; colorClass: string } {
  const player = players[playerIndex];
  if (!player) return { initials: '?', colorClass: 'text-gray-400' };

  // Get first letter of first name (or first two if single word)
  const name = player.name.trim();
  let initials = name.charAt(0).toUpperCase();

  // Check for duplicate initials
  const sameInitials = players.filter((p, i) =>
    i !== playerIndex && p.name.trim().charAt(0).toUpperCase() === initials
  );

  if (sameInitials.length > 0) {
    // Add second character or number to disambiguate
    if (name.length > 1) {
      initials = name.substring(0, 2).toUpperCase();
    }
    // If still duplicate, add player position number
    const stillDuplicate = players.filter((p, i) =>
      i !== playerIndex && p.name.trim().substring(0, 2).toUpperCase() === initials
    );
    if (stillDuplicate.length > 0) {
      initials = initials.charAt(0) + (playerIndex + 1);
    }
  }

  // Use "ME" for current player
  if (playerIndex === myIndex) {
    initials = 'ME';
  }

  const colorClass = playerColors[playerIndex % playerColors.length] ?? 'text-gray-400';
  return { initials, colorClass };
}

// Sort hand by suit (clubs, diamonds, hearts, spades) then by rank ascending (2, 3, ... A)
function sortHandForDisplay(cards: CardType[]): CardType[] {
  const suitOrder = ['clubs', 'diamonds', 'hearts', 'spades'] as const;
  return [...cards].sort((a, b) => {
    // Jokers go at the end
    if (isJoker(a) && isJoker(b)) return 0;
    if (isJoker(a)) return 1;
    if (isJoker(b)) return -1;

    // Sort by suit first
    const suitDiff = suitOrder.indexOf(a.suit) - suitOrder.indexOf(b.suit);
    if (suitDiff !== 0) return suitDiff;

    // Then by rank ascending (low to high)
    return RANK_VALUES[a.rank] - RANK_VALUES[b.rank];
  });
}

// Animation phases for trick display
type TrickAnimationPhase = 'playing' | 'complete' | 'gathering' | 'collecting' | 'cleared';

interface CompletedTrickInfo {
  cards: Array<{ card: CardType; playerIndex: number; playerId: string }>;
  winnerIndex: number;
  winnerName: string;
  trumpSuit: string | null;
  whoopieRank: string | null;
  whoopieDefiningCard: CardType | null;
  jTrumpActive: boolean;
}

// Dealer cut display state
interface CutInfo {
  cutCards: CardType[];
  dealerIndex: number;
  dealerName: string;
}

export default function Game() {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();
  const {
    view,
    events,
    addAI,
    startGame,
    placeBid,
    playCard,
    leaveGame,
    kickPlayer,
    replaceWithAI,
    continueWithoutPlayer,
    pauseGame,
    resumeCode,
    clearResumeCode,
    missingPlayers,
    continueResumedGame,
    disconnectedPlayer,
    clearDisconnectedPlayer,
    wasKicked,
    clearKicked,
  } = useGame();
  const [selectedCard, setSelectedCard] = useState<CardType | null>(null);
  const [showWhoopiePrompt, setShowWhoopiePrompt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kickConfirm, setKickConfirm] = useState<{ playerId: string; playerName: string } | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showTrickExplanation, setShowTrickExplanation] = useState(false);
  const [showJTrumpHelp, setShowJTrumpHelp] = useState(false);
  const [showJokerWhoopieHelp, setShowJokerWhoopieHelp] = useState(false);

  // Animation state
  const [trickAnimPhase, setTrickAnimPhase] = useState<TrickAnimationPhase>('cleared');
  const [completedTrick, setCompletedTrick] = useState<CompletedTrickInfo | null>(null);
  const [cutInfo, setCutInfo] = useState<CutInfo | null>(null);
  const [lastTrickForReview, setLastTrickForReview] = useState<CompletedTrickInfo | null>(null);
  const [showTrickReview, setShowTrickReview] = useState(false);
  const [showScoreboard, setShowScoreboard] = useState(false);
  const [scoreDeltas, setScoreDeltas] = useState<number[] | null>(null);
  const [bidAnnouncements, setBidAnnouncements] = useState<Map<number, number>>(new Map());
  const [specialCardAnnouncement, setSpecialCardAnnouncement] = useState<{ type: 'whoopie' | 'scramble'; playerName: string } | null>(null);
  const [whoopieReveal, setWhoopieReveal] = useState<{ rank: string; suit: Suit } | null>(null);
  const prevWhoopieRankRef = useRef<string | null | undefined>(undefined);
  const prevPhaseRef = useRef<string | null>(null);
  const prevTrickLengthRef = useRef<number>(0);
  const cutShownRef = useRef<boolean>(false);
  const prevScoresRef = useRef<number[]>([]);
  const prevStanzaRef = useRef<number>(0);
  const prevBidsRef = useRef<(number | null)[]>([]);
  const [notification, setNotification] = useState<string | null>(null);
  const processedEventsRef = useRef<number>(0);

  useEffect(() => {
    if (!view && gameId && !wasKicked) {
      // TODO: Rejoin game if we have the ID but no view
      navigate('/');
    }
  }, [view, gameId, navigate, wasKicked]);

  // Warn before closing/reloading the page during an active game
  useEffect(() => {
    const isActiveGame = view && view.phase !== 'gameEnd';
    if (!isActiveGame) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };

    // Desktop: beforeunload dialog
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Mobile: intercept back button via History API
    window.history.pushState({ gameProtect: true }, '');
    const handlePopState = (e: PopStateEvent) => {
      if (e.state?.gameProtect === undefined) {
        // User pressed back — push state again and confirm
        window.history.pushState({ gameProtect: true }, '');
        if (confirm('Leave the game? Your progress may be lost.')) {
          window.history.back();
          window.history.back();
        }
      }
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [view, view?.phase]);

  // Handle being kicked - show message and redirect
  useEffect(() => {
    if (wasKicked) {
      // Small delay to let user see the kicked message
      const timer = setTimeout(() => {
        clearKicked();
        navigate('/');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [wasKicked, clearKicked, navigate]);

  const handleKickPlayer = (playerId: string, playerName: string) => {
    setKickConfirm({ playerId, playerName });
  };

  const handleConfirmKick = async (replaceWithBot: boolean) => {
    if (!kickConfirm) return;
    try {
      await kickPlayer(kickConfirm.playerId);
      if (replaceWithBot) {
        // Small delay to let the kick complete, then replace with AI
        setTimeout(async () => {
          try {
            await replaceWithAI(kickConfirm.playerId);
          } catch (err) {
            // Player might already be removed, that's ok
          }
        }, 100);
      }
      setKickConfirm(null);
    } catch (err) {
      setError((err as Error).message);
      setKickConfirm(null);
    }
  };

  const handleReplaceWithAI = async () => {
    if (!disconnectedPlayer) return;
    try {
      await replaceWithAI(disconnectedPlayer.playerId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleContinueWithout = async () => {
    if (!disconnectedPlayer) return;
    try {
      await continueWithoutPlayer(disconnectedPlayer.playerId);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  // Track when cards are played
  useEffect(() => {
    if (!view?.stanza) return;

    const currentTrick = view.stanza.currentTrick ?? [];
    const currentTrickLength = currentTrick.length;
    const prevTrickLength = prevTrickLengthRef.current;

    // A new card was played - set to playing animation
    if (currentTrickLength > prevTrickLength && currentTrickLength > 0) {
      setTrickAnimPhase('playing');
    }

    prevTrickLengthRef.current = currentTrickLength;
  }, [view?.stanza?.currentTrick?.length]);

  // Detect trick completion and run animation sequence
  useEffect(() => {
    if (!view) return;

    // When transitioning to trickEnd or stanzaEnd phase after playing
    const isEndPhase = view.phase === 'trickEnd' || view.phase === 'stanzaEnd';
    if (isEndPhase && prevPhaseRef.current === 'playing') {
      const currentTrick = view.stanza?.currentTrick ?? [];

      // Get winner from the last completed trick (authoritative source)
      const completedTricks = view.stanza?.completedTricks ?? [];
      const lastCompletedTrick = completedTricks[completedTricks.length - 1];
      const winnerIndex = lastCompletedTrick?.winnerIndex;

      // The server now keeps the trick populated during end phases
      if (currentTrick.length > 0 && winnerIndex !== undefined) {
        const winnerName = view.players[winnerIndex]?.name ?? 'Unknown';

        // Save the completed trick info for animation
        const trickInfo: CompletedTrickInfo = {
          cards: currentTrick.map((c) => ({
            card: c.card,
            playerIndex: c.playerIndex,
            playerId: c.playerId,
          })),
          winnerIndex,
          winnerName,
          trumpSuit: view.stanza?.currentTrumpSuit ?? null,
          whoopieRank: view.stanza?.whoopieRank ?? null,
          whoopieDefiningCard: view.stanza?.whoopieDefiningCard ?? null,
          jTrumpActive: view.stanza?.jTrumpActive ?? false,
        };
        setCompletedTrick(trickInfo);
        setLastTrickForReview(trickInfo); // Save for review feature

        // Small delay to let last card animate in, then show complete phase
        setTimeout(() => {
          setTrickAnimPhase('complete');
        }, 600); // Let the last card animate in

        // Phase 2: Skip gathering, go straight to collecting (after 1.5s display)
        setTimeout(() => {
          setTrickAnimPhase('collecting');
        }, 2100); // 600ms + 1500ms display time

        // Phase 3: Clear (after 1 second for collection animation)
        setTimeout(() => {
          setTrickAnimPhase('cleared');
          setCompletedTrick(null);
        }, 3100); // 2100ms + 1000ms
      }
    }

    // Reset when new trick starts
    if (view.phase === 'playing' && (prevPhaseRef.current === 'trickEnd' || prevPhaseRef.current === 'stanzaEnd' || prevPhaseRef.current === 'bidding')) {
      setTrickAnimPhase('cleared');
      setCompletedTrick(null);
      prevTrickLengthRef.current = 0;
    }

    prevPhaseRef.current = view.phase;
  }, [view?.phase, view?.stanza?.completedTricks, view?.stanza?.currentTrick, view?.players]);

  // Track bids and show announcement when a new bid is placed
  useEffect(() => {
    if (!view?.stanza?.bids) return;

    const currentBids = view.stanza.bids;
    const prevBids = prevBidsRef.current;

    // Find if there's a new bid (a null that became a number)
    for (let i = 0; i < currentBids.length; i++) {
      const wasBid = prevBids[i] !== null && prevBids[i] !== undefined;
      const isBid = currentBids[i] !== null && currentBids[i] !== undefined;

      if (!wasBid && isBid) {
        // New bid detected - add to announcements
        setBidAnnouncements(prev => {
          const newMap = new Map(prev);
          newMap.set(i, currentBids[i]!);
          return newMap;
        });
      }
    }

    // Update the ref
    prevBidsRef.current = [...currentBids];
  }, [view?.stanza?.bids]);

  // Clear bid announcements when first card is played, and reset bids ref when stanza changes
  useEffect(() => {
    // Clear when the first card is actually played (not just when phase changes)
    const hasCardsInTrick = (view?.stanza?.currentTrick?.length ?? 0) > 0;
    if (view?.phase === 'playing' && hasCardsInTrick && bidAnnouncements.size > 0) {
      setBidAnnouncements(new Map());
    }
    if (view?.phase === 'bidding' && view?.stanza?.stanzaNumber !== prevStanzaRef.current) {
      prevBidsRef.current = [];
      setBidAnnouncements(new Map());
    }
  }, [view?.phase, view?.stanza?.stanzaNumber, view?.stanza?.currentTrick?.length]);

  // Track scores at stanza start and calculate deltas at stanza end
  useEffect(() => {
    if (!view) return;

    const currentStanza = view.stanza?.stanzaNumber ?? 0;

    // At the start of a new stanza (when stanza number changes during bidding), save the scores
    if (currentStanza !== prevStanzaRef.current && view.phase === 'bidding') {
      prevScoresRef.current = [...view.scores];
      prevStanzaRef.current = currentStanza;
      setScoreDeltas(null);
    }

    // When stanza ends, calculate and show deltas
    if (view.phase === 'stanzaEnd' && prevScoresRef.current.length > 0) {
      const deltas = view.scores.map((score, index) => score - (prevScoresRef.current[index] ?? 0));
      setScoreDeltas(deltas);
    }

    // Clear deltas when new stanza starts
    if (view.phase === 'bidding' && scoreDeltas !== null) {
      setScoreDeltas(null);
    }
  }, [view?.stanza?.stanzaNumber, view?.phase, view?.scores]);

  // Listen for cutForDealer event to show the dealer cut (only once per game)
  useEffect(() => {
    if (!view || !events || cutShownRef.current) return;

    // Find the cutForDealer event
    const cutEvent = events.find(e => e.type === 'cutForDealer');
    if (cutEvent && cutEvent.type === 'cutForDealer') {
      cutShownRef.current = true; // Mark as shown so we don't show again
      const dealerName = view.players[cutEvent.dealerIndex]?.name ?? 'Unknown';
      setCutInfo({
        cutCards: cutEvent.cutCards,
        dealerIndex: cutEvent.dealerIndex,
        dealerName,
      });

      // Clear after 4 seconds
      setTimeout(() => {
        setCutInfo(null);
      }, 4000);
    }
  }, [events, view?.players]);

  // Detect whoopie rank reveal (Joker defining card → first suited card led sets rank + trump)
  useEffect(() => {
    const currentRank = view?.stanza?.whoopieRank ?? null;
    const currentSuit = view?.stanza?.currentTrumpSuit as Suit | null;
    const definingCard = view?.stanza?.whoopieDefiningCard;

    // Detect transition: whoopieRank was null → now has a value, and defining card is a Joker
    if (
      prevWhoopieRankRef.current === null &&
      currentRank !== null &&
      currentSuit !== null &&
      definingCard && isJoker(definingCard)
    ) {
      setWhoopieReveal({ rank: currentRank, suit: currentSuit });
      setTimeout(() => setWhoopieReveal(null), 4000);
    }

    prevWhoopieRankRef.current = currentRank;
  }, [view?.stanza?.whoopieRank, view?.stanza?.currentTrumpSuit, view?.stanza?.whoopieDefiningCard]);

  // Handle player left notifications
  useEffect(() => {
    if (!events || events.length === 0) return;

    // Only process new events
    const newEvents = events.slice(processedEventsRef.current);
    processedEventsRef.current = events.length;

    for (const event of newEvents) {
      if (event.type === 'playerLeft') {
        const leavingPlayerName = event.playerName ?? 'A player';
        let message: string;

        if (event.replacement) {
          message = `${leavingPlayerName} has left the game and been replaced by ${event.replacement.name} - who will take over their position and score.`;
        } else {
          message = `${leavingPlayerName} has left the game. The stanza will be redealt.`;
        }

        setNotification(message);
        setTimeout(() => setNotification(null), 5000);
      }

      // Show Whoopie/Scramble announcement
      if (event.type === 'cardPlayed' && (event.wasWhoopie || event.wasScramble)) {
        const playerName = view?.players[event.playerIndex]?.name ?? 'Someone';
        const type = event.wasScramble ? 'scramble' : 'whoopie';
        setSpecialCardAnnouncement({ type, playerName });
        setTimeout(() => setSpecialCardAnnouncement(null), 2500);
      }
    }
  }, [events, view?.players]);

  if (!view) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white">Loading game...</p>
      </div>
    );
  }

  const handleAddAI = async (difficulty: 'beginner' | 'intermediate' | 'expert') => {
    try {
      await addAI(difficulty);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleStart = async () => {
    try {
      await startGame();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleBid = async (bid: number) => {
    try {
      await placeBid(bid);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleCardClick = (card: CardType) => {
    if (!view.isMyTurn || view.phase !== 'playing') return;

    // Check if this card is valid to play
    const isValid = view.validActions.canPlay.some((c) => cardsEqual(c, card));
    if (!isValid) return;

    // Check if it's a Whoopie card (need to call Whoopie!)
    const whoopieRank = view.stanza?.whoopieRank as any;
    if (isWhoopieCard(card, whoopieRank) && isSuitCard(card)) {
      setSelectedCard(card);
      setShowWhoopiePrompt(true);
    } else {
      // Play the card directly
      handlePlayCard(card, false);
    }
  };

  const handlePlayCard = async (card: CardType, calledWhoopie: boolean) => {
    setShowWhoopiePrompt(false);
    setSelectedCard(null);
    try {
      await playCard(card, calledWhoopie);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleLeave = () => {
    if (!confirm('Leave the game? You can rejoin if the game is still active.')) return;
    leaveGame();
    navigate('/');
  };

  const handlePause = async () => {
    if (!confirm('Pause the game? All players will be disconnected and given a resume code.')) return;
    try {
      await pauseGame();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleClosePauseModal = () => {
    clearResumeCode();
    navigate('/');
  };

  // Generate explanation for why a trick was won
  const generateTrickExplanation = (trick: CompletedTrickInfo): string => {
    if (!trick || trick.cards.length === 0) return '';

    const winnerCard = trick.cards.find(c => c.playerIndex === trick.winnerIndex)?.card;
    const leadCard = trick.cards[0]?.card;
    if (!winnerCard || !leadCard) return '';

    const winnerName = trick.winnerName;
    const whoopieRank = trick.whoopieRank as any;
    const trumpSuit = trick.trumpSuit;

    // Check if winner's card is a Joker
    if (isJoker(winnerCard)) {
      return `${winnerName} won with a Joker. Jokers are always trump and rank as ${whoopieRank || 'the highest cards'}.`;
    }

    // Find all Whoopie cards played in this trick (including Jokers)
    const whoopieCardsPlayed = trick.cards.filter(c =>
      isJoker(c.card) || (isSuitCard(c.card) && isWhoopieCard(c.card, whoopieRank))
    );

    // Find all trump cards (Whoopie cards + cards in trump suit)
    const trumpCardsPlayed = trick.cards.filter(c => {
      if (isJoker(c.card)) return true;
      if (isSuitCard(c.card)) {
        if (isWhoopieCard(c.card, whoopieRank)) return true;
        if (trumpSuit && c.card.suit === trumpSuit) return true;
      }
      return false;
    });

    const winnerIsWhoopie = isSuitCard(winnerCard) && isWhoopieCard(winnerCard, whoopieRank);
    const winnerIsTrumpSuit = isSuitCard(winnerCard) && trumpSuit && winnerCard.suit === trumpSuit;

    // Check if lead was a Joker (J-Trump scenario - all cards are trump)
    if (isJoker(leadCard)) {
      if (isSuitCard(winnerCard)) {
        return `A Joker was led, making all cards trump for this trick. ${winnerName}'s ${winnerCard.rank} of ${winnerCard.suit} was the highest card played.`;
      }
    }

    // Winner played a Whoopie card
    if (winnerIsWhoopie) {
      if (whoopieCardsPlayed.length > 1) {
        return `${winnerName}'s ${winnerCard.rank} of ${winnerCard.suit} is a Whoopie card (all ${whoopieRank}s are Whoopie). Multiple trump cards were played, and ${winnerName} had the highest.`;
      }
      return `${winnerName}'s ${winnerCard.rank} of ${winnerCard.suit} is a Whoopie card (all ${whoopieRank}s are Whoopie). Whoopie cards are always trump.`;
    }

    // Winner played a card in the trump suit (not a Whoopie card itself)
    if (winnerIsTrumpSuit && isSuitCard(winnerCard)) {
      // Check if a Whoopie card was played that changed trump to this suit
      const whoopieChangedTrump = whoopieCardsPlayed.some(c =>
        isSuitCard(c.card) && c.card.suit === winnerCard.suit
      );

      if (whoopieChangedTrump) {
        return `A Whoopie card (${whoopieRank} of ${winnerCard.suit}) was played, making ${suitSymbols[winnerCard.suit as Suit]} trump. ${winnerName}'s ${winnerCard.rank} of ${winnerCard.suit} was the highest trump.`;
      }

      if (trumpCardsPlayed.length > 1) {
        return `${winnerName}'s ${winnerCard.rank} of ${winnerCard.suit} was the highest trump (${suitSymbols[winnerCard.suit as Suit]}).`;
      }

      if (isSuitCard(leadCard) && leadCard.suit !== trumpSuit) {
        return `${winnerName} played trump (${suitSymbols[winnerCard.suit as Suit]}), which beats all non-trump cards.`;
      }
    }

    // Winner won with highest card in led suit (no trump played)
    if (isSuitCard(winnerCard) && isSuitCard(leadCard) && winnerCard.suit === leadCard.suit) {
      if (trumpCardsPlayed.length === 0) {
        return `No trump was played. ${winnerName}'s ${winnerCard.rank} of ${winnerCard.suit} was the highest card in the led suit.`;
      }
    }

    return `${winnerName} won with the highest trump card.`;
  };

  // Resuming lobby - waiting for players to rejoin
  if (view.phase === 'resuming') {
    const isHost = view.players[view.myIndex]?.id === view.hostId;
    const connectedPlayers = view.players.filter(p => p.type === 'human' && p.isConnected);
    const disconnectedPlayers = view.players.filter(p => p.type === 'human' && !p.isConnected);
    const aiPlayers = view.players.filter(p => p.type === 'ai');

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">Resuming Game</h1>
            <HelpMenu
              onShowRules={() => setShowRules(true)}
              onShowFeedback={() => setShowFeedback(true)}
            />
          </div>

          <p className="text-gray-300 mb-6">
            Waiting for players to rejoin. Share the game ID with other players.
          </p>

          {/* Game ID */}
          <div className="bg-gray-700 rounded-lg p-3 mb-6">
            <p className="text-gray-400 text-sm">Game ID</p>
            <p className="text-white font-mono text-sm break-all">{view.id}</p>
          </div>

          {/* Rejoined Players */}
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-white mb-3">
              Rejoined ({connectedPlayers.length})
            </h2>
            <div className="space-y-2">
              {connectedPlayers.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between bg-green-900/30 rounded-lg px-4 py-2"
                >
                  <span className="text-green-400">{player.name}</span>
                  <span className="text-green-500 text-sm">Connected</span>
                </div>
              ))}
            </div>
          </div>

          {/* Waiting For */}
          {disconnectedPlayers.length > 0 && (
            <div className="mb-4">
              <h2 className="text-lg font-semibold text-white mb-3">
                Waiting For ({disconnectedPlayers.length})
              </h2>
              <div className="space-y-2">
                {disconnectedPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between bg-yellow-900/30 rounded-lg px-4 py-2"
                  >
                    <span className="text-yellow-400">{player.name}</span>
                    <span className="text-yellow-500 text-sm">Waiting...</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Players */}
          {aiPlayers.length > 0 && (
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-white mb-3">
                AI Players ({aiPlayers.length})
              </h2>
              <div className="space-y-2">
                {aiPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between bg-gray-700 rounded-lg px-4 py-2"
                  >
                    <span className="text-gray-300">{player.name}</span>
                    <span className="text-gray-500 text-sm">AI</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          {isHost && (
            <div className="space-y-3">
              <button
                onClick={async () => {
                  try {
                    await continueResumedGame();
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
                disabled={connectedPlayers.length < 2 && aiPlayers.length === 0}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition"
              >
                {disconnectedPlayers.length > 0
                  ? `Continue Without Missing Players`
                  : `Continue Game`}
              </button>
              {disconnectedPlayers.length > 0 && (
                <p className="text-gray-400 text-sm text-center">
                  Missing players will be removed from the game.
                </p>
              )}
            </div>
          )}

          {!isHost && (
            <p className="text-gray-400 text-center">
              Waiting for the host to continue the game...
            </p>
          )}
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

        {/* Feedback Modal */}
        <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
      </div>
    );
  }

  // Waiting room
  if (view.phase === 'waiting') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h1 className="text-2xl font-bold text-white">Game Lobby</h1>
            <HelpMenu
              onShowRules={() => setShowRules(true)}
              onShowFeedback={() => setShowFeedback(true)}
            />
          </div>

          {/* Game ID */}
          <div className="bg-gray-700 rounded-lg p-3 mb-6">
            <p className="text-gray-400 text-sm">Game ID</p>
            <p className="text-white font-mono text-sm break-all">{view.id}</p>
          </div>

          {/* Players */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-3">
              Players ({view.players.length}/10)
            </h2>
            <div className="space-y-2">
              {view.players.map((player, index) => {
                const isMe = index === view.myIndex;
                const isHost = view.players[view.myIndex]?.id === view.hostId;
                const canKick = isHost && !isMe && player.id !== view.hostId;

                return (
                  <div
                    key={player.id}
                    className="flex items-center justify-between bg-gray-700 rounded-lg p-3"
                  >
                    <div className="flex items-center gap-2">
                      <span className={player.type === 'ai' ? 'text-purple-400' : 'text-white'}>
                        {player.name}
                      </span>
                      {player.type === 'ai' && (
                        <span className="text-xs bg-purple-600 px-2 py-0.5 rounded">AI</span>
                      )}
                      {isMe && (
                        <span className="text-xs bg-green-600 px-2 py-0.5 rounded">You</span>
                      )}
                      {player.id === view.hostId && (
                        <span className="text-xs bg-yellow-600 px-2 py-0.5 rounded">Host</span>
                      )}
                    </div>
                    {canKick && (
                      <button
                        onClick={() => handleKickPlayer(player.id, player.name)}
                        className="text-xs bg-red-600 hover:bg-red-700 px-2 py-1 rounded text-white transition"
                      >
                        Kick
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add AI buttons */}
          {view.players.length < 10 && view.players[view.myIndex]?.id === view.hostId && (
            <div className="mb-6">
              <p className="text-gray-400 text-sm mb-2">Add AI Player</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAddAI('beginner')}
                  className="flex-1 py-2 bg-green-700 hover:bg-green-600 text-white rounded-lg text-sm transition"
                >
                  Easy
                </button>
                <button
                  onClick={() => handleAddAI('intermediate')}
                  className="flex-1 py-2 bg-yellow-700 hover:bg-yellow-600 text-white rounded-lg text-sm transition"
                >
                  Medium
                </button>
                <button
                  onClick={() => handleAddAI('expert')}
                  className="flex-1 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg text-sm transition"
                >
                  Hard
                </button>
              </div>
            </div>
          )}

          {/* Start/Leave buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleLeave}
              className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition"
            >
              Leave
            </button>
            {view.players[view.myIndex]?.id === view.hostId && (
              <button
                onClick={handleStart}
                disabled={view.players.length < 2}
                className="flex-1 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition"
              >
                Start Game
              </button>
            )}
          </div>

          {error && <p className="text-red-400 text-sm mt-4 text-center">{error}</p>}
        </div>

        {/* Rules Modal (in waiting room) */}
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

        {/* Feedback Modal (in waiting room) */}
        <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />
      </div>
    );
  }

  // Game in progress
  return (
    <div className="h-[100dvh] felt-texture flex flex-col overflow-hidden">
      {/* Notification banner */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg text-center max-w-md"
          >
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top bar - game info */}
      <div className="bg-black/30 px-2 py-1 md:py-2 flex items-center justify-between relative z-30">
        <div className="flex items-center gap-1.5 md:gap-3">
          <button
            onClick={() => setShowScoreboard(true)}
            className="text-green-400 hover:text-green-300 text-sm transition"
          >
            Score
          </button>
          {lastTrickForReview && (
            <button
              onClick={() => setShowTrickReview(true)}
              className="text-blue-400 hover:text-blue-300 text-sm transition"
            >
              Review
            </button>
          )}
          <HelpMenu
            onShowRules={() => setShowRules(true)}
            onShowFeedback={() => setShowFeedback(true)}
            onLeave={handleLeave}
            onPause={handlePause}
          />
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <div className="text-white text-xs md:text-sm">
            <span className="hidden sm:inline">{view.stanza?.cardsPerPlayer} cards</span>
            <span className="sm:hidden">{view.stanza?.cardsPerPlayer} cards</span>
            {view.stanza?.bids && view.stanza.bids.some(b => b !== null) && (() => {
              const totalBids = view.stanza.bids.filter((b): b is number => b !== null).reduce((sum, b) => sum + b, 0);
              const diff = totalBids - view.stanza.cardsPerPlayer;
              const sign = diff > 0 ? '+' : '';
              const color = diff === 0 ? 'text-yellow-400' : diff > 0 ? 'text-green-400' : 'text-red-400';
              return <span className={`ml-1 ${color}`}>(bid: {sign}{diff})</span>;
            })()}
          </div>
          {/* Leader indicator - hidden on mobile, available in Scoreboard modal */}
          <div className="hidden md:block">
          {(() => {
            const maxScore = Math.max(...view.scores);
            const leaders = view.players.filter((_, i) => view.scores[i] === maxScore);
            if (leaders.length === 1) {
              return (
                <div className="text-sm">
                  <span className="text-gray-400">Leader: </span>
                  <span className="text-green-400 font-medium">{leaders[0]?.name} ({maxScore})</span>
                </div>
              );
            } else if (leaders.length > 1 && maxScore > 0) {
              return (
                <div className="text-sm">
                  <span className="text-gray-400">Tied: </span>
                  <span className="text-yellow-400">{leaders.length} players ({maxScore})</span>
                </div>
              );
            }
            return null;
          })()}
          </div>
        </div>
        <div className="text-white text-xs md:text-sm">
          Trump: {view.stanza?.jTrumpActive ? (
            <button
              onClick={() => setShowJTrumpHelp(true)}
              className="text-yellow-400 hover:text-yellow-300 underline decoration-dotted"
            >
              J-Trump ?
            </button>
          ) : view.stanza?.currentTrumpSuit ? (
            <span className={view.stanza.currentTrumpSuit === 'hearts' || view.stanza.currentTrumpSuit === 'diamonds' ? 'text-red-400' : ''}>
              {suitSymbols[view.stanza.currentTrumpSuit as Suit]}
            </span>
          ) : (
            <button
              onClick={() => setShowJTrumpHelp(true)}
              className="text-yellow-400 hover:text-yellow-300 underline decoration-dotted"
            >
              J-Trump ?
            </button>
          )}
        </div>
      </div>

      {/* Main game area */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-2 md:p-4 relative">
        {/* Arrange other players clockwise around the table */}
        {(() => {
          // Get other players in clockwise order starting from player to my left
          const numPlayers = view.players.length;
          const otherPlayers: Array<{
            player: typeof view.players[0];
            index: number;
            style: React.CSSProperties;
          }> = [];

          // Calculate positions around the table
          // Me is at bottom (6 o'clock). Other players distributed from left (9 o'clock)
          // through top (12 o'clock) to right (3 o'clock)
          const numOthers = numPlayers - 1;

          // Slot-based positioning that ensures good spacing for any player count
          // Uses predefined positions that look good, then interpolates for other counts

          const centerY = 50; // Center point for positioning

          // Define optimal positions for different player counts
          // Each position is [x%, y%] where (50, 50) is center
          const getPositions = (count: number): Array<[number, number]> => {
            switch (count) {
              case 1:
                return [[50, 18]]; // Top center
              case 2:
                return [[20, 35], [80, 35]]; // Left and right, fairly high
              case 3:
                return [[15, 45], [50, 18], [85, 45]]; // Triangle: left, top, right
              case 4:
                return [[12, 50], [35, 18], [65, 18], [88, 50]]; // Two on sides, two on top
              case 5:
                return [[10, 55], [25, 25], [50, 15], [75, 25], [90, 55]];
              case 6:
                return [[8, 58], [20, 30], [42, 15], [58, 15], [80, 30], [92, 58]];
              case 7:
                return [[6, 60], [16, 35], [35, 17], [50, 13], [65, 17], [84, 35], [94, 60]];
              case 8:
                return [[5, 62], [14, 40], [30, 20], [46, 13], [54, 13], [70, 20], [86, 40], [95, 62]];
              case 9:
                return [[4, 65], [12, 45], [24, 25], [40, 15], [50, 12], [60, 15], [76, 25], [88, 45], [96, 65]];
              default:
                // For 10+ players, generate positions algorithmically
                const positions: Array<[number, number]> = [];
                // Distribute in three rows: bottom-sides, middle-sides, and top
                const leftCount = Math.ceil(count / 3);
                const topCount = Math.ceil(count / 3);
                const rightCount = count - leftCount - topCount;

                // Left side (bottom to top)
                for (let j = 0; j < leftCount; j++) {
                  const t = leftCount === 1 ? 0.5 : j / (leftCount - 1);
                  positions.push([6 + t * 8, 65 - t * 45]);
                }
                // Top (left to right)
                for (let j = 0; j < topCount; j++) {
                  const t = topCount === 1 ? 0.5 : j / (topCount - 1);
                  positions.push([20 + t * 60, 12 + Math.sin(t * Math.PI) * 6]);
                }
                // Right side (top to bottom)
                for (let j = 0; j < rightCount; j++) {
                  const t = rightCount === 1 ? 0.5 : j / (rightCount - 1);
                  positions.push([94 - t * 8, 20 + t * 45]);
                }
                return positions;
            }
          };

          const positions = getPositions(numOthers);

          for (let i = 0; i < numOthers; i++) {
            const playerIndex = (view.myIndex + i + 1) % numPlayers;
            const [x, y] = positions[i] || [50, 50];

            otherPlayers.push({
              player: view.players[playerIndex]!,
              index: playerIndex,
              style: {
                position: 'absolute' as const,
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)',
              }
            });
          }

          const renderPlayerBox = (playerData: typeof otherPlayers[0]) => {
            const { player, index } = playerData;
            const bid = view.stanza?.bids[index];
            const tricks = view.stanza?.tricksTaken[index] ?? 0;
            const isCurrentPlayer = view.stanza?.currentPlayerIndex === index;
            const handCount = view.stanza?.otherHandCounts[index] ?? 0;
            const isHost = view.players[view.myIndex]?.id === view.hostId;
            const isHumanPlayer = player.type === 'human';
            const isDisconnected = isHumanPlayer && !(player as any).isConnected;
            const scoreDelta = scoreDeltas?.[index];

            return (
              <div
                key={player.id}
                className={`bg-black/40 rounded-lg p-1.5 md:p-3 text-center min-w-[60px] md:min-w-[100px] relative ${
                  isCurrentPlayer ? 'ring-2 ring-yellow-400' : ''
                } ${isDisconnected ? 'opacity-50' : ''}`}
              >
                {/* Score delta badge */}
                {scoreDelta !== undefined && scoreDelta !== null && (
                  <div className={`absolute -top-2 -right-2 px-2 py-0.5 rounded-full text-xs font-bold ${
                    scoreDelta > 0 ? 'bg-green-500 text-white' : scoreDelta < 0 ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'
                  }`}>
                    {scoreDelta > 0 ? `+${scoreDelta}` : scoreDelta}
                  </div>
                )}
                <p className={`text-xs md:text-base font-medium ${player.type === 'ai' ? 'text-purple-300' : 'text-white'}`}>
                  {player.name}
                  {isDisconnected && <span className="text-red-400 ml-1">(offline)</span>}
                </p>
                <p className="text-gray-400 text-xs hidden md:block">
                  Score: {view.scores[index]}
                </p>
                {bid !== null && bid !== undefined && (
                  <>
                    <p className="text-blue-300 text-xs whitespace-nowrap md:hidden">
                      B:{bid} T:{tricks}
                    </p>
                    <p className="text-blue-300 text-xs whitespace-nowrap hidden md:block">
                      Bid: {bid} | Tricks: {tricks}
                    </p>
                  </>
                )}
                {/* Desktop: card back visual + bid animation */}
                <div className="mt-1 md:mt-2 hidden md:flex items-center justify-center gap-2">
                  <AnimatePresence>
                    {bidAnnouncements.has(index) && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: 'spring', damping: 15 }}
                        className="bg-blue-600 rounded-full w-7 h-7 flex items-center justify-center shadow-lg border border-blue-400"
                      >
                        <span className="text-white text-xs font-bold">{bidAnnouncements.get(index)}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <CardBack count={handCount} />
                </div>
                {/* Mobile: bid animation (without CardBack) */}
                <div className="mt-0.5 flex items-center justify-center md:hidden">
                  <AnimatePresence>
                    {bidAnnouncements.has(index) && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ type: 'spring', damping: 15 }}
                        className="bg-blue-600 rounded-full w-6 h-6 flex items-center justify-center shadow-lg border border-blue-400"
                      >
                        <span className="text-white text-[10px] font-bold">{bidAnnouncements.get(index)}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
                {index === view.stanza?.dealerIndex && (
                  <span className="inline-block mt-0.5 md:mt-1 text-xs bg-yellow-600 px-1 md:px-2 py-0.5 rounded">
                    <span className="md:hidden">D</span>
                    <span className="hidden md:inline">Dealer</span>
                  </span>
                )}
                {isHost && (
                  <button
                    onClick={() => handleKickPlayer(player.id, player.name)}
                    className="mt-0.5 md:mt-1 text-xs bg-red-600/80 hover:bg-red-600 px-1 md:px-2 py-0.5 rounded text-white transition"
                  >
                    <span className="md:hidden">K</span>
                    <span className="hidden md:inline">Kick</span>
                  </button>
                )}
              </div>
            );
          };

          return (
            <>
              {otherPlayers.map((playerData) => (
                <div key={playerData.player.id} style={playerData.style}>
                  {renderPlayerBox(playerData)}
                </div>
              ))}
            </>
          );
        })()}

        {/* My bid announcement - shown above my hand area */}
        <AnimatePresence>
          {bidAnnouncements.has(view.myIndex) && (
            <motion.div
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 15 }}
              className="absolute bottom-36 left-1/2 -translate-x-1/2 z-40"
            >
              <div className="bg-blue-600 rounded-full w-8 h-8 flex items-center justify-center shadow-lg border border-blue-400">
                <span className="text-white text-sm font-bold">{bidAnnouncements.get(view.myIndex)}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Current trick area */}
        <div className="bg-black/20 rounded-xl p-3 md:p-8 min-w-[200px] md:min-w-[300px] min-h-[120px] md:min-h-[200px] flex flex-col items-center justify-center gap-2 relative">
          {/* Winner announcement - shown during complete, gathering, and collecting phases */}
          <AnimatePresence>
            {(trickAnimPhase === 'complete' || trickAnimPhase === 'gathering' || trickAnimPhase === 'collecting') && completedTrick && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute top-2 text-center"
              >
                <p className="text-xl font-bold text-yellow-400">
                  {completedTrick.winnerName} Takes The Trick
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Cards display - unified rendering for seamless animation */}
          <div className="flex items-center justify-center gap-3">
            <AnimatePresence mode="sync">
              {/* Always use currentTrick as source, animate based on phase */}
              {/* Don't render when phase is 'cleared' - prevents flash after collection */}
              {trickAnimPhase !== 'cleared' && view.stanza?.currentTrick && view.stanza.currentTrick.length > 0 ? (
                view.stanza.currentTrick.map((played, index) => {
                  const numPlayers = view.players.length;
                  const playerIndex = played.playerIndex;
                  const isMe = playerIndex === view.myIndex;
                  const numCards = view.stanza!.currentTrick.length;
                  const centerOffset = (index - (numCards - 1) / 2);

                  // Spacing between cards scales with player count (larger cards = more space)
                  const cardSpacing = numPlayers <= 4 ? 20 : numPlayers <= 6 ? 18 : numPlayers <= 8 ? 15 : 12;

                  // Determine if we're in the completion animation phase
                  const isCompletionPhase = trickAnimPhase === 'complete' || trickAnimPhase === 'collecting';
                  const winnerIndex = completedTrick?.winnerIndex;
                  const isWinner = winnerIndex !== undefined && playerIndex === winnerIndex;
                  const isWinnerMe = winnerIndex === view.myIndex;

                  // Calculate animation targets based on phase
                  let targetX = centerOffset * cardSpacing; // Default spread position
                  let targetY = 0;
                  let targetScale = 1;
                  let targetOpacity = 1;
                  let targetRotate = 0;

                  // Calculate start position (from player's seat)
                  let startX = 0;
                  let startY = 0;
                  let startRotate = 0;

                  if (isMe) {
                    startY = 200;
                    startRotate = 10;
                  } else {
                    const relativePos = (playerIndex - view.myIndex + numPlayers) % numPlayers;
                    if (relativePos === 1) {
                      startX = -300;
                      startRotate = -10;
                    } else if (relativePos === numPlayers - 1) {
                      startX = 300;
                      startRotate = 10;
                    } else {
                      startY = -180;
                      startRotate = -10;
                    }
                  }

                  // Adjust targets for collecting phase
                  if (trickAnimPhase === 'collecting' && winnerIndex !== undefined) {
                    const numOthers = numPlayers - 1;
                    const relativePos = (winnerIndex - view.myIndex + numPlayers) % numPlayers;
                    const stackOffset = index * 2;

                    if (isWinnerMe) {
                      targetX = stackOffset;
                      targetY = 250;
                    } else {
                      const playerOrdinal = relativePos - 1;
                      const getWinnerOffset = (count: number, idx: number): [number, number] => {
                        const pctToX = (pct: number) => (pct - 50) * 7;
                        const pctToY = (pct: number) => (pct - 50) * 5;
                        const positionSets: { [key: number]: Array<[number, number]> } = {
                          1: [[50, 18]], 2: [[20, 35], [80, 35]], 3: [[15, 45], [50, 18], [85, 45]],
                          4: [[12, 50], [35, 18], [65, 18], [88, 50]], 5: [[10, 55], [25, 25], [50, 15], [75, 25], [90, 55]],
                        };
                        const positions = positionSets[count] ?? positionSets[5]!;
                        const [px, py] = positions[Math.min(idx, positions.length - 1)] ?? [50, 30];
                        return [pctToX(px), pctToY(py)];
                      };
                      const [offX, offY] = getWinnerOffset(numOthers, playerOrdinal);
                      targetX = offX + stackOffset;
                      targetY = offY;
                    }
                    targetScale = 0.4;
                    targetOpacity = 0;
                    targetRotate = (index - (numCards - 1) / 2) * 5;
                  }

                  // Show winner highlight during complete phase
                  const showWinnerHighlight = trickAnimPhase === 'complete' && isWinner;

                  return (
                    <motion.div
                      key={`trick-card-${played.playerIndex}`}
                      initial={{ scale: 0.3, y: startY, x: startX, opacity: 0, rotate: startRotate }}
                      animate={{
                        scale: targetScale,
                        y: targetY,
                        x: targetX,
                        opacity: targetOpacity,
                        rotate: targetRotate,
                      }}
                      transition={{
                        type: 'tween',
                        duration: trickAnimPhase === 'collecting' ? 1.0 : 0.5,
                        ease: 'easeOut',
                      }}
                      className="relative"
                      style={{ zIndex: index }}
                    >
                      <TrickCard card={played.card} highlight={showWinnerHighlight} playerCount={numPlayers} />
                      {(() => {
                        const { initials, colorClass } = getPlayerDisplay(view.players, played.playerIndex, view.myIndex);
                        // Adjust label position based on card size
                        const labelOffset = numPlayers <= 4 ? '-bottom-6' : numPlayers <= 6 ? '-bottom-5' : '-bottom-4';
                        return (
                          <p className={`absolute ${labelOffset} left-1/2 -translate-x-1/2 text-xs font-bold whitespace-nowrap ${showWinnerHighlight ? 'text-yellow-400' : colorClass}`}>
                            {initials}
                          </p>
                        );
                      })()}
                    </motion.div>
                  );
                })
              ) : null}
            </AnimatePresence>
          </div>

          {/* Status message when no cards */}
          {trickAnimPhase === 'cleared' && (!view.stanza?.currentTrick || view.stanza.currentTrick.length === 0) && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-gray-400"
            >
              {view.phase === 'bidding' ? 'Bidding in progress...' : view.phase === 'trickEnd' || view.phase === 'stanzaEnd' ? 'Preparing next trick...' : 'Waiting for lead...'}
            </motion.p>
          )}
        </div>

        {/* Whoopie defining card - positioned top-right to avoid player overlap */}
        {view.stanza?.whoopieDefiningCard && (
          <div className="absolute right-1 top-1 md:right-4 md:top-4 text-center">
            <p className="text-gray-300 text-[10px] md:text-sm mb-0.5 md:mb-1 font-medium">Whoopie Card</p>
            {isJoker(view.stanza.whoopieDefiningCard) && (
              <button
                onClick={() => setShowJokerWhoopieHelp(true)}
                className="text-purple-400 hover:text-purple-300 text-xs underline decoration-dotted mb-0.5 block"
              >
                ?
              </button>
            )}
            <div className="flex items-center gap-1 justify-center">
              <MediumCard card={view.stanza.whoopieDefiningCard} highlight />
              {isJoker(view.stanza.whoopieDefiningCard) && view.stanza.whoopieRank && view.stanza.currentTrumpSuit && (
                <MediumCard
                  card={{ type: 'suit' as const, suit: view.stanza.currentTrumpSuit as Suit, rank: view.stanza.whoopieRank as any }}
                  highlight
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Bottom - player's hand and controls */}
      <div className="bg-black/40 p-2 md:p-4 safe-bottom">
        {/* Player info */}
        <div className="text-center mb-1 md:mb-3">
          <span className="text-white font-medium">
            {view.players[view.myIndex]?.name}
          </span>
          <span className="text-gray-400 mx-2">|</span>
          <span className="text-gray-300">Score: {view.scores[view.myIndex]}</span>
          {scoreDeltas?.[view.myIndex] !== undefined && scoreDeltas?.[view.myIndex] !== null && (
            <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-bold ${
              scoreDeltas[view.myIndex]! > 0 ? 'bg-green-500 text-white' : scoreDeltas[view.myIndex]! < 0 ? 'bg-red-500 text-white' : 'bg-gray-500 text-white'
            }`}>
              {scoreDeltas[view.myIndex]! > 0 ? `+${scoreDeltas[view.myIndex]}` : scoreDeltas[view.myIndex]}
            </span>
          )}
          {view.stanza?.bids[view.myIndex] !== null && view.stanza?.bids[view.myIndex] !== undefined && (
            <>
              <span className="text-gray-400 mx-2">|</span>
              <span className="text-blue-300 md:hidden">
                B:{view.stanza.bids[view.myIndex]} T:{view.stanza?.tricksTaken[view.myIndex] ?? 0}
              </span>
              <span className="text-blue-300 hidden md:inline">
                Bid: {view.stanza.bids[view.myIndex]} | Tricks: {view.stanza?.tricksTaken[view.myIndex] ?? 0}
              </span>
            </>
          )}
          {view.myIndex === view.stanza?.dealerIndex && (
            <span className="ml-2 text-xs bg-yellow-600 px-1 md:px-2 py-0.5 rounded">
              <span className="md:hidden">D</span>
              <span className="hidden md:inline">Dealer</span>
            </span>
          )}
        </div>

        {/* Bidding UI */}
        {view.phase === 'bidding' && view.isMyTurn && (
          <div className="flex flex-col items-center gap-2 mb-2 md:gap-3 md:mb-4">
            <p className="text-yellow-300 font-semibold">Your bid:</p>
            <div className="flex gap-2 flex-wrap justify-center">
              {view.validActions.canBid.map((bid) => (
                <button
                  key={bid}
                  onClick={() => handleBid(bid)}
                  className="w-12 h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-lg transition"
                >
                  {bid}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Status message */}
        {view.phase === 'bidding' && !view.isMyTurn && (
          <p className="text-center text-gray-400 mb-2 md:mb-4">
            Waiting for {view.players[view.stanza?.currentPlayerIndex ?? 0]?.name} to bid...
          </p>
        )}

        {view.phase === 'playing' && !view.isMyTurn && (
          <p className="text-center text-gray-400 mb-2 md:mb-4">
            Waiting for {view.players[view.stanza?.currentPlayerIndex ?? 0]?.name} to play...
          </p>
        )}

        {view.phase === 'playing' && view.isMyTurn && (
          <p className="text-center text-yellow-300 font-semibold mb-2 md:mb-4">Your turn - select a card!</p>
        )}

        {/* Player's hand */}
        <div className="flex justify-center gap-0.5 sm:gap-1 md:gap-2 flex-wrap">
          {sortHandForDisplay(view.stanza?.myHand ?? []).map((card, index) => {
            const isValid = view.validActions.canPlay.some((c) => cardsEqual(c, card));
            return (
              <Card
                key={index}
                card={card}
                onClick={() => handleCardClick(card)}
                disabled={!view.isMyTurn || view.phase !== 'playing' || !isValid}
                selected={selectedCard ? cardsEqual(selectedCard, card) : false}
              />
            );
          })}
        </div>
      </div>

      {/* Whoopie prompt modal */}
      <AnimatePresence>
        {showWhoopiePrompt && selectedCard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 text-center"
            >
              <h2 className="text-2xl font-bold text-yellow-400 mb-4">Whoopie!</h2>
              <p className="text-gray-300 mb-6">
                You're playing a Whoopie card! Don't forget to call "Whoopie!" or you'll lose a point.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowWhoopiePrompt(false);
                    setSelectedCard(null);
                  }}
                  className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handlePlayCard(selectedCard, true)}
                  className="flex-1 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg font-semibold transition"
                >
                  WHOOPIE!
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dealer Cut Overlay */}
      <AnimatePresence>
        {cutInfo && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex flex-col items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              className="bg-gray-800 rounded-xl p-6 max-w-lg text-center"
            >
              <h2 className="text-2xl font-bold text-white mb-4">Cut for Dealer</h2>
              <p className="text-gray-300 mb-4">Low card deals</p>

              <div className="flex gap-4 justify-center mb-6 flex-wrap">
                {cutInfo.cutCards.map((card, index) => {
                  const playerName = view.players[index]?.name ?? `Player ${index + 1}`;
                  const isDealer = index === cutInfo.dealerIndex;

                  return (
                    <div key={index} className="flex flex-col items-center">
                      <div className={`relative ${isDealer ? 'ring-4 ring-yellow-400 rounded-lg' : ''}`}>
                        <MiniCard card={card} />
                        {isDealer && (
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-yellow-500 text-black text-xs px-2 py-0.5 rounded font-bold">
                            LOW
                          </div>
                        )}
                      </div>
                      <p className={`mt-3 text-sm ${isDealer ? 'text-yellow-400 font-bold' : 'text-gray-400'}`}>
                        {playerName}
                      </p>
                    </div>
                  );
                })}
              </div>

              <p className="text-xl text-yellow-400 font-semibold">
                {cutInfo.dealerName} deals first!
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Review Last Trick Modal */}
      <AnimatePresence>
        {showTrickReview && lastTrickForReview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
            onClick={() => setShowTrickReview(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="relative w-full max-w-2xl h-[450px] mx-4 bg-gray-900 rounded-xl p-4"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Title and winner info - centered */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 text-center">
                <h2 className="text-xl font-bold text-white mb-1">Last Trick</h2>
                <p className="text-yellow-400 font-medium">
                  {lastTrickForReview.winnerName} won the trick
                </p>
              </div>

              {/* Trump/Whoopie info - upper right */}
              <div className="absolute top-4 right-4 text-sm text-gray-300 text-right">
                <div>
                  <span>Trump: </span>
                  {lastTrickForReview.jTrumpActive ? (
                    <span className="text-yellow-400">J-Trump</span>
                  ) : lastTrickForReview.trumpSuit ? (
                    <span className={lastTrickForReview.trumpSuit === 'hearts' || lastTrickForReview.trumpSuit === 'diamonds' ? 'text-red-400' : 'text-white'}>
                      {suitSymbols[lastTrickForReview.trumpSuit as Suit]}
                    </span>
                  ) : (
                    <span className="text-yellow-400">J-Trump</span>
                  )}
                </div>
                {lastTrickForReview.whoopieRank && (
                  <div className="text-yellow-300">Whoopie: {lastTrickForReview.whoopieRank}</div>
                )}
              </div>

              {/* Cards positioned around the virtual table */}
              {lastTrickForReview.cards.map((played, cardIndex) => {
                const numPlayers = view.players.length;
                const playerIndex = played.playerIndex;
                const isWinner = playerIndex === lastTrickForReview.winnerIndex;
                const isMe = playerIndex === view.myIndex;
                const playerName = view.players[playerIndex]?.name ?? 'Unknown';
                const playOrder = cardIndex + 1; // 1-based play order

                // Calculate position based on player's seat
                let positionStyle: React.CSSProperties = {};
                let labelPosition: 'top' | 'bottom' = 'bottom';

                if (isMe) {
                  // Bottom center
                  positionStyle = { bottom: '20px', left: '50%', transform: 'translateX(-50%)' };
                  labelPosition = 'bottom';
                } else {
                  const relativePos = (playerIndex - view.myIndex + numPlayers) % numPlayers;
                  if (relativePos === 1) {
                    // Left
                    positionStyle = { left: '60px', top: '50%', transform: 'translateY(-50%)' };
                    labelPosition = 'bottom';
                  } else if (relativePos === numPlayers - 1) {
                    // Right
                    positionStyle = { right: '60px', top: '50%', transform: 'translateY(-50%)' };
                    labelPosition = 'bottom';
                  } else {
                    // Top - spread multiple top players
                    const topPlayers = [];
                    for (let i = 2; i < numPlayers - 1; i++) {
                      topPlayers.push((view.myIndex + i) % numPlayers);
                    }
                    const topIndex = topPlayers.indexOf(playerIndex);
                    const topCount = topPlayers.length;
                    const offset = topCount > 1 ? (topIndex - (topCount - 1) / 2) * 120 : 0;
                    positionStyle = { top: '100px', left: `calc(50% + ${offset}px)`, transform: 'translateX(-50%)' };
                    labelPosition = 'top';
                  }
                }

                return (
                  <div
                    key={cardIndex}
                    className="absolute flex flex-col items-center"
                    style={positionStyle}
                  >
                    {labelPosition === 'top' && (
                      <p className={`text-sm mb-1 ${isWinner ? 'text-yellow-400 font-bold' : 'text-gray-300'}`}>
                        {playerName}
                      </p>
                    )}
                    <div className="relative">
                      {/* Play order badge */}
                      <div className={`absolute -top-2 -left-2 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold z-10 ${
                        playOrder === 1 ? 'bg-green-500 text-white' : 'bg-gray-600 text-white'
                      }`}>
                        {playOrder}
                      </div>
                      <MediumCard card={played.card} highlight={isWinner} />
                    </div>
                    {isWinner && (
                      <span className="mt-1 text-xs bg-yellow-500 text-black px-2 py-0.5 rounded font-bold">
                        WINNER
                      </span>
                    )}
                    {labelPosition === 'bottom' && !isWinner && (
                      <p className="text-sm mt-1 text-gray-300">
                        {playerName}
                      </p>
                    )}
                    {labelPosition === 'bottom' && isWinner && (
                      <p className="text-sm text-yellow-400 font-bold">
                        {playerName}
                      </p>
                    )}
                  </div>
                );
              })}

              {/* Why explanation */}
              {showTrickExplanation && (
                <div className="absolute bottom-16 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 rounded-lg p-3 max-w-sm text-center">
                  <p className="text-gray-300 text-sm">{generateTrickExplanation(lastTrickForReview)}</p>
                </div>
              )}

              {/* Buttons */}
              <div className="absolute bottom-4 right-4 flex gap-2">
                <button
                  onClick={() => setShowTrickExplanation(!showTrickExplanation)}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition text-sm"
                >
                  {showTrickExplanation ? 'Hide Why' : 'Why?'}
                </button>
                <button
                  onClick={() => {
                    setShowTrickReview(false);
                    setShowTrickExplanation(false);
                  }}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Scoreboard Modal */}
      <AnimatePresence>
        {showScoreboard && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50"
            onClick={() => setShowScoreboard(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="bg-gray-800 rounded-xl p-6 max-w-md w-full mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold text-white mb-4 text-center">Scoreboard</h2>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-600">
                    <th className="text-left text-gray-400 py-2 px-2">Player</th>
                    <th className="text-center text-gray-400 py-2 px-2">Score</th>
                    {view.stanza && (
                      <>
                        <th className="text-center text-gray-400 py-2 px-2">Bid</th>
                        <th className="text-center text-gray-400 py-2 px-2">Tricks</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {view.players
                    .map((player, index) => ({ player, index }))
                    .sort((a, b) => (view.scores[b.index] ?? 0) - (view.scores[a.index] ?? 0))
                    .map(({ player, index }) => {
                    const isMe = index === view.myIndex;
                    const isLeader = view.scores[index] === Math.max(...view.scores) && view.scores[index] > 0;
                    const bid = view.stanza?.bids[index];
                    const tricks = view.stanza?.tricksTaken[index] ?? 0;
                    const delta = scoreDeltas?.[index];

                    return (
                      <tr key={player.id} className={`border-b border-gray-700 ${isMe ? 'bg-green-900/30' : ''}`}>
                        <td className="py-2 px-2">
                          <span className={`${player.type === 'ai' ? 'text-purple-300' : 'text-white'} ${isLeader ? 'font-bold' : ''}`}>
                            {player.name}
                          </span>
                          {isMe && <span className="text-xs text-green-400 ml-1">(you)</span>}
                          {isLeader && <span className="text-xs text-yellow-400 ml-1">*</span>}
                        </td>
                        <td className="text-center py-2 px-2">
                          <span className="text-white font-medium">{view.scores[index]}</span>
                          {delta !== undefined && delta !== null && (
                            <span className={`ml-1 text-xs ${delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                              ({delta > 0 ? `+${delta}` : delta})
                            </span>
                          )}
                        </td>
                        {view.stanza && (
                          <>
                            <td className="text-center text-blue-300 py-2 px-2">
                              {bid !== null && bid !== undefined ? bid : '-'}
                            </td>
                            <td className="text-center text-gray-300 py-2 px-2">
                              {tricks}
                            </td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowScoreboard(false)}
                  className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kick Confirmation Modal */}
      <AnimatePresence>
        {kickConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 text-center"
            >
              <h2 className="text-xl font-bold text-white mb-2">Remove Player</h2>
              <p className="text-gray-300 mb-6">
                Remove <span className="text-yellow-400 font-medium">{kickConfirm.playerName}</span> from the game?
              </p>
              <div className="flex flex-col gap-3">
                {view.phase !== 'waiting' && (
                  <button
                    onClick={() => handleConfirmKick(true)}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition"
                  >
                    Remove & Replace with Bot
                  </button>
                )}
                <button
                  onClick={() => handleConfirmKick(false)}
                  className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition"
                >
                  {view.phase === 'waiting' ? 'Remove Player' : 'Remove & Leave Seat Empty'}
                </button>
                <button
                  onClick={() => setKickConfirm(null)}
                  className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Disconnected Player Modal (for host) */}
      <AnimatePresence>
        {disconnectedPlayer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 text-center"
            >
              <h2 className="text-xl font-bold text-white mb-2">Player Disconnected</h2>
              <p className="text-gray-300 mb-6">
                <span className="text-yellow-400 font-medium">{disconnectedPlayer.playerName}</span> has disconnected. They may reconnect — or you can take action now.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={clearDisconnectedPlayer}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold transition"
                >
                  Wait for them to reconnect
                </button>
                <button
                  onClick={handleReplaceWithAI}
                  className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition"
                >
                  Replace with {disconnectedPlayer.playerName}-bot
                </button>
                <button
                  onClick={handleContinueWithout}
                  className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-semibold transition"
                >
                  Continue without them
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Kicked Notification */}
      <AnimatePresence>
        {wasKicked && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="bg-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 text-center"
            >
              <h2 className="text-xl font-bold text-red-400 mb-2">Removed from Game</h2>
              <p className="text-gray-300 mb-4">
                You have been removed from the game by the host.
              </p>
              <p className="text-gray-500 text-sm">Returning to home...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* J-Trump Help Modal */}
      <AnimatePresence>
        {showJTrumpHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowJTrumpHelp(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="bg-gray-800 rounded-xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold text-yellow-400 mb-3">What is J-Trump?</h2>
              <div className="text-gray-300 text-sm space-y-3">
                <p>
                  <span className="text-white font-medium">J-Trump</span> means there is no fixed trump suit right now.
                </p>
                <p>
                  Each trick, the <span className="text-yellow-300">led suit becomes trump for that trick</span> — the leader effectively picks trump. Jokers and Whoopie cards are still always trump.
                </p>
                <p>
                  J-Trump can happen when:
                </p>
                <ul className="list-disc list-inside space-y-1">
                  <li>A <span className="text-purple-400">Joker</span> is the Whoopie defining card (no initial trump)</li>
                  <li>A <span className="text-purple-400">Joker</span> is played mid-trick (cancels the current trump)</li>
                </ul>
                <p>
                  J-Trump ends when a <span className="text-yellow-300">Whoopie card</span> is played — its suit becomes the new fixed trump.
                </p>
              </div>
              <button
                onClick={() => setShowJTrumpHelp(false)}
                className="mt-4 w-full py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
              >
                Got it!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Whoopie Rank Reveal (when Joker defining card → first card sets rank) */}
      <AnimatePresence>
        {whoopieReveal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{ type: 'spring', damping: 12, stiffness: 100 }}
              className="flex flex-col items-center"
            >
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-yellow-300 text-lg font-bold mb-4 drop-shadow-lg"
              >
                Whoopie Card Revealed!
              </motion.p>
              <motion.div
                animate={{
                  boxShadow: [
                    '0 0 20px rgba(234, 179, 8, 0.4)',
                    '0 0 60px rgba(234, 179, 8, 0.8)',
                    '0 0 20px rgba(234, 179, 8, 0.4)',
                  ],
                }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="bg-white rounded-xl w-24 h-36 md:w-32 md:h-48 flex flex-col items-center justify-center relative"
              >
                <span className={`text-base md:text-xl font-bold absolute top-2 left-3 ${
                  whoopieReveal.suit === 'hearts' || whoopieReveal.suit === 'diamonds' ? 'text-red-600' : 'text-gray-800'
                }`}>
                  {whoopieReveal.rank}
                </span>
                <span className={`text-4xl md:text-6xl ${
                  whoopieReveal.suit === 'hearts' || whoopieReveal.suit === 'diamonds' ? 'text-red-600' : 'text-gray-800'
                }`}>
                  {suitSymbols[whoopieReveal.suit]}
                </span>
                <span className={`text-base md:text-xl font-bold absolute bottom-2 right-3 rotate-180 ${
                  whoopieReveal.suit === 'hearts' || whoopieReveal.suit === 'diamonds' ? 'text-red-600' : 'text-gray-800'
                }`}>
                  {whoopieReveal.rank}
                </span>
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="text-white text-sm mt-4 drop-shadow-lg"
              >
                All {whoopieReveal.rank}s are Whoopie &bull; {suitSymbols[whoopieReveal.suit]} is trump
              </motion.p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Joker Whoopie Help Modal */}
      <AnimatePresence>
        {showJokerWhoopieHelp && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowJokerWhoopieHelp(false)}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="bg-gray-800 rounded-xl p-6 max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h2 className="text-xl font-bold text-purple-400 mb-3">Joker as Whoopie Card!</h2>
              <div className="text-gray-300 text-sm space-y-3">
                <p>
                  When a <span className="text-purple-400 font-medium">Joker</span> is flipped as the Whoopie defining card:
                </p>
                <p className="text-yellow-300 font-medium">
                  The first card led sets both the Whoopie rank AND trump suit!
                </p>
                <p>
                  Until that first card is played, there is no Whoopie rank and no trump suit. Once it&apos;s led, its rank becomes the Whoopie rank and its suit becomes trump for the rest of the stanza.
                </p>
                <p>
                  If the first card led is also a <span className="text-purple-400">Joker</span>, that player auto-wins the trick and their next led card sets Whoopie/trump.
                </p>
              </div>
              <button
                onClick={() => setShowJokerWhoopieHelp(false)}
                className="mt-4 w-full py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition"
              >
                Got it!
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

      {/* Feedback Modal */}
      <FeedbackModal isOpen={showFeedback} onClose={() => setShowFeedback(false)} />

      {/* Pause Modal */}
      <AnimatePresence>
        {resumeCode && (
          <PauseModal resumeCode={resumeCode} onClose={handleClosePauseModal} />
        )}
      </AnimatePresence>

      {/* Whoopie/Scramble Announcement */}
      <AnimatePresence>
        {specialCardAnnouncement && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            transition={{ type: 'spring', duration: 0.5 }}
            className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none"
          >
            <div className="text-center">
              <motion.div
                animate={{
                  scale: [1, 1.1, 1],
                  rotate: [0, -3, 3, -3, 0]
                }}
                transition={{ duration: 0.8, repeat: 2 }}
                className={`text-6xl md:text-8xl font-bold ${
                  specialCardAnnouncement.type === 'whoopie'
                    ? 'text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.8)]'
                    : 'text-purple-400 drop-shadow-[0_0_20px_rgba(192,132,252,0.8)]'
                }`}
              >
                {specialCardAnnouncement.type === 'whoopie' ? 'WHOOPIE!' : 'SCRAMBLE!'}
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-white text-xl mt-2"
              >
                {specialCardAnnouncement.playerName} played a {specialCardAnnouncement.type}!
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error toast */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg"
            onClick={() => setError(null)}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
