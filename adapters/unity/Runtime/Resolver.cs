using System;
using System.Collections.Generic;
using System.Linq;

namespace DiceForge
{
    /// <summary>
    /// Turns a parsed expression into an immutable record. Dice are rolled in
    /// term order, left to right, each group's dice in sequence, so a seeded
    /// source always produces the same record — on every platform (ADR-0021).
    /// </summary>
    public static class Resolver
    {
        /// <summary>One roll before selection has had its say.</summary>
        private sealed class RolledDie
        {
            public int Value;
            public string Label;
            public string Source;
            public bool Rerolled;
        }

        private static bool[] SelectKeptFlags(IReadOnlyList<int> values, DiceSelection selection)
        {
            var flags = new bool[values.Count];
            if (selection == null)
            {
                for (int index = 0; index < flags.Length; index++) flags[index] = true;
                return flags;
            }
            bool highestFirst = selection.Mode == "kh" || selection.Mode == "dh";
            var order = Enumerable.Range(0, values.Count).ToList();
            // A total comparator — value, then roll order — so the result never
            // depends on whether the sort happens to be stable. The core was
            // written this way for exactly this reason.
            order.Sort((a, b) =>
            {
                int compare = highestFirst
                    ? values[b].CompareTo(values[a])
                    : values[a].CompareTo(values[b]);
                return compare != 0 ? compare : a.CompareTo(b);
            });
            bool keepMode = selection.Mode == "kh" || selection.Mode == "kl";
            for (int index = 0; index < flags.Length; index++) flags[index] = !keepMode;
            for (int rank = 0; rank < selection.Count && rank < order.Count; rank++)
            {
                flags[order[rank]] = keepMode;
            }
            return flags;
        }

        private static RollGroupOutcome ResolveGroup(
            DiceGroupNode term, IRandomSource random, DieRegistry registry)
        {
            DieDefinition definition = term.Die == null ? null : registry?.Find(term.Die);
            if (term.Die != null && definition == null)
            {
                throw new DiceForgeException(
                    "invalid-argument",
                    "unknown die " + Json.Quote(term.Die) +
                    "; pass it to DiceForge.Create(dice) before rolling it");
            }
            int sides = definition?.Faces.Count ?? term.Sides;
            int highestValue = definition != null
                ? definition.Faces.Max(face => face.Value)
                : sides;

            // One draw, in order, exactly as a plain numeric die: neither a
            // custom die nor a modifier changes how many numbers a die
            // consumes, only what a face is worth and how many dice there are.
            Func<RolledDie> draw = () =>
            {
                int index = Sample.RollFace(random, sides);
                DieFace face = definition?.Faces[index - 1];
                return new RolledDie
                {
                    Value = face?.Value ?? index,
                    Label = face?.Label,
                };
            };

            // Each die is finished before the next one starts — rerolled and
            // exploded in sequence, the way it would be at a table (ADR-0016).
            var rolled = new List<RolledDie>();
            int extras = 0;
            for (int index = 0; index < term.Count; index++)
            {
                RolledDie current = draw();

                if (term.Reroll != null)
                {
                    int attempts = 0;
                    while (current.Value <= term.Reroll.Threshold
                           && attempts < Notation.MaxRerollsPerDie
                           && extras < Notation.MaxExtraDicePerGroup)
                    {
                        current.Rerolled = true;
                        rolled.Add(current);
                        extras += 1;
                        current = draw();
                        current.Source = "reroll";
                        attempts += 1;
                        if (term.Reroll.Once) break;
                    }
                }
                rolled.Add(current);

                if (term.Explode)
                {
                    int chain = 0;
                    RolledDie last = current;
                    while (last.Value == highestValue
                           && chain < Notation.MaxExplosionsPerDie
                           && extras < Notation.MaxExtraDicePerGroup)
                    {
                        last = draw();
                        last.Source = "explosion";
                        rolled.Add(last);
                        extras += 1;
                        chain += 1;
                    }
                }
            }

            // A rerolled result is history: recorded, but selection never sees
            // it and it can never count towards the subtotal.
            var live = rolled.Where(die => !die.Rerolled).ToList();
            bool[] keptFlags = SelectKeptFlags(live.Select(die => die.Value).ToList(), term.Selection);
            int livePosition = 0;
            var dice = new List<DieOutcome>();
            foreach (RolledDie die in rolled)
            {
                bool kept = !die.Rerolled
                            && (livePosition < keptFlags.Length ? keptFlags[livePosition++] : true);
                dice.Add(new DieOutcome
                {
                    Sides = sides,
                    Value = die.Value,
                    Kept = kept,
                    Die = definition?.Id,
                    Label = die.Label,
                    Source = die.Source,
                    Rerolled = die.Rerolled,
                });
            }
            int subtotal = dice.Where(die => die.Kept).Sum(die => die.Value);

            // The canonical notation reports the resolved die: a custom group
            // renders its registered id and real face count.
            var rendered = definition != null
                ? new DiceGroupNode(
                    term.Sign, term.Count, sides, definition.Id, term.Reroll, term.Explode,
                    term.Selection)
                : term;
            return new RollGroupOutcome
            {
                Notation = rendered.RenderNotation(),
                Sign = term.Sign,
                Sides = sides,
                Die = definition?.Id,
                Dice = dice,
                Subtotal = subtotal,
            };
        }

        /// <summary>Resolves a parsed expression into a roll record.</summary>
        public static RollResult ResolveRoll(
            DiceExpression expression, IRandomSource random, DieRegistry dice = null)
        {
            var groups = new List<RollGroupOutcome>();
            int modifier = 0;
            int diceTotal = 0;
            foreach (ExpressionTerm term in expression.Terms)
            {
                if (term is ModifierNode constant)
                {
                    modifier += constant.Sign * constant.Value;
                    continue;
                }
                RollGroupOutcome group = ResolveGroup((DiceGroupNode)term, random, dice);
                groups.Add(group);
                diceTotal += group.Sign * group.Subtotal;
            }
            return new RollResult
            {
                Expression = expression.Normalized,
                Groups = groups,
                Modifier = modifier,
                Total = diceTotal + modifier,
                Provenance = random.Provenance(),
            };
        }

        /// <summary>
        /// Flips a coin. One draw, and the low bit decides — the same rule the
        /// core uses, so a seeded stream produces the same sequence here.
        /// </summary>
        public static CoinFlipResult ResolveCoinFlip(IRandomSource random)
        {
            return new CoinFlipResult
            {
                Outcome = Sample.RollFace(random, 2) == 1 ? "heads" : "tails",
                Provenance = random.Provenance(),
            };
        }
    }
}
