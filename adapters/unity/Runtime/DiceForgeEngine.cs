using System.Collections.Generic;

namespace DiceForge
{
    /// <summary>
    /// The engine: resolve dice notation and coin flips into records, with no
    /// graphics, no network, and no Unity types anywhere in sight (ADR-0003).
    ///
    /// <code>
    /// var forge = DiceForgeEngine.Seeded("table-42");
    /// RollResult roll = forge.Roll("2d20kh1+3");
    /// int total = roll.Total;
    /// </code>
    ///
    /// The same seed produces the same rolls here as in the TypeScript core and
    /// the Godot addon, verified against exported conformance vectors bit for
    /// bit (ADR-0021).
    /// </summary>
    public sealed class DiceForgeEngine
    {
        private readonly IRandomSource _random;
        private readonly List<DieDefinition> _dice = new List<DieDefinition>();
        private DieRegistry _registry = new DieRegistry();

        private DiceForgeEngine(IRandomSource random)
        {
            _random = random;
        }

        /// <summary>A reproducible engine: the same seed replays exactly.</summary>
        public static DiceForgeEngine Seeded(string seed)
        {
            return new DiceForgeEngine(SeededRandom.Create(seed));
        }

        /// <summary>A reproducible engine from a numeric seed.</summary>
        public static DiceForgeEngine Seeded(long seed)
        {
            return new DiceForgeEngine(SeededRandom.Create(seed));
        }

        /// <summary>An engine on the platform's randomness, for ordinary play.</summary>
        public static DiceForgeEngine System()
        {
            return new DiceForgeEngine(new SystemRandom());
        }

        /// <summary>An engine on a source you supply.</summary>
        public static DiceForgeEngine Create(IRandomSource random)
        {
            return new DiceForgeEngine(random);
        }

        /// <summary>
        /// Registers a custom die so expressions may name it (ADR-0015).
        /// Returns this engine, so definitions chain.
        /// </summary>
        public DiceForgeEngine DefineDie(string id, IEnumerable<DieFace> faces)
        {
            _dice.Add(DieDefinition.Define(id, faces));
            _registry = new DieRegistry(_dice);
            return this;
        }

        /// <summary>The dice this engine knows, for the parser and resolver.</summary>
        public DieRegistry Dice => _registry;

        /// <summary>
        /// Rolls an expression. Throws <see cref="DiceNotationException"/> with
        /// a position for bad notation.
        /// </summary>
        public RollResult Roll(string expression)
        {
            DiceExpression parsed = Notation.Parse(expression, _registry);
            return Resolver.ResolveRoll(parsed, _random, _registry);
        }

        /// <summary>Flips a coin, drawing from the same stream as rolls.</summary>
        public CoinFlipResult FlipCoin()
        {
            return Resolver.ResolveCoinFlip(_random);
        }
    }
}
