// Centralized rules content - edit here to update all rules displays

export default function RulesContent() {
  return (
    <div className="space-y-4 text-gray-300 text-sm">
      <section>
        <h3 className="text-yellow-400 font-semibold mb-1">The Basics</h3>
        <p>Whoopie is a trick-taking game. Each round ("stanza") you bid how many tricks you'll take, then try to hit your bid exactly.</p>
      </section>

      <section>
        <h3 className="text-yellow-400 font-semibold mb-1">Scoring</h3>
        <ul className="list-disc list-inside space-y-1">
          <li><span className="text-green-400">Make your bid exactly:</span> 2 + your bid</li>
          <li><span className="text-red-400">Miss your bid:</span> -1 point</li>
        </ul>
      </section>

      <section>
        <h3 className="text-yellow-400 font-semibold mb-1">The Whoopie Card</h3>
        <p>After dealing, a card is flipped from the deck. This <span className="text-white font-medium">Whoopie Defining Card</span> determines:</p>
        <ul className="list-disc list-inside space-y-1 mt-1">
          <li>The initial <span className="text-white">trump suit</span> (the card's suit)</li>
          <li>The <span className="text-yellow-300">Whoopie rank</span> (all cards of that rank are "Whoopie cards")</li>
        </ul>
      </section>

      <section>
        <h3 className="text-yellow-400 font-semibold mb-1">Whoopie Cards</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>Always count as trump, regardless of suit</li>
          <li>When played, <span className="text-white">change trump</span> to that card's suit</li>
          <li>Must call "Whoopie!" when playing one (or lose 1 point)</li>
        </ul>
      </section>

      <section>
        <h3 className="text-yellow-400 font-semibold mb-1">Playing & Winning Tricks</h3>
        <ul className="list-disc list-inside space-y-1">
          <li>Must follow the led suit if able</li>
          <li>Trump beats non-trump; highest trump wins</li>
          <li>Without trump, highest card in led suit wins</li>
          <li>If tied, the <span className="text-white">first card played</span> wins</li>
          <li><span className="text-yellow-300">Key rule:</span> A card's trump status is locked when played - it doesn't change if trump changes later in the trick</li>
        </ul>
      </section>

      <section>
        <h3 className="text-yellow-400 font-semibold mb-1">Jokers (Scramble Cards)</h3>
        <p className="mb-2">Jokers are always trump and <span className="text-white font-medium">take on the Whoopie rank</span> when played. For example: if the Whoopie card is a Jack of Hearts, a Joker becomes the Jack of trump when played.</p>
        <p className="mb-1">Special situations:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><span className="text-purple-400">Joker played mid-trick:</span> The LED suit becomes trump for the rest of that trick (subsequent plays only). J-Trump then persists: whatever suit is led becomes trump FOR THAT TRICK until a Whoopie card is played.</li>
          <li><span className="text-purple-400">Joker is led:</span> ALL cards become trump. Highest card wins.</li>
          <li><span className="text-purple-400">Joker as Whoopie defining card:</span> The first card led becomes both the Whoopie rank AND sets trump. If that first lead is also a Joker, that player auto-wins and their next card sets Whoopie/trump.</li>
        </ul>
      </section>

      <section>
        <h3 className="text-yellow-400 font-semibold mb-1">Stanza Progression</h3>
        <p>Cards per hand: 1 → 2 → 3 → ... → max → ... → 3 → 2 → 1, then game ends.</p>
      </section>
    </div>
  );
}
