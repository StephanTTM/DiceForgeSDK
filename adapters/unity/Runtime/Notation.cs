using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;

namespace DiceForge
{
    /// <summary>kh = keep highest, kl = keep lowest, dh = drop highest, dl = drop lowest.</summary>
    public sealed class DiceSelection
    {
        public DiceSelection(string mode, int count)
        {
            Mode = mode;
            Count = count;
        }

        public string Mode { get; }
        public int Count { get; }
    }

    /// <summary>`r2` rerolls while a die reads 2 or less; `ro2` rerolls once.</summary>
    public sealed class DiceReroll
    {
        public DiceReroll(int threshold, bool once)
        {
            Threshold = threshold;
            Once = once;
        }

        public int Threshold { get; }
        public bool Once { get; }
    }

    /// <summary>One term of an expression: a dice group, or a constant.</summary>
    public class ExpressionTerm
    {
        public ExpressionTerm(int sign)
        {
            Sign = sign;
        }

        /// <summary>+1 when the term adds to the total, -1 when it subtracts.</summary>
        public int Sign { get; }
    }

    public sealed class ModifierNode : ExpressionTerm
    {
        public ModifierNode(int sign, int value) : base(sign)
        {
            Value = value;
        }

        /// <summary>Absolute value; the sign carries the direction.</summary>
        public int Value { get; }
    }

    public sealed class DiceGroupNode : ExpressionTerm
    {
        public DiceGroupNode(
            int sign, int count, int sides, string die, DiceReroll reroll, bool explode,
            DiceSelection selection) : base(sign)
        {
            Count = count;
            Sides = sides;
            Die = die;
            Reroll = reroll;
            Explode = explode;
            Selection = selection;
        }

        public int Count { get; }
        public int Sides { get; }

        /// <summary>Custom die name when the group rolls one; null otherwise.</summary>
        public string Die { get; }

        public DiceReroll Reroll { get; }
        public bool Explode { get; }
        public DiceSelection Selection { get; }

        /// <summary>
        /// Canonical unsigned notation, e.g. "2d20kh1", "4d{fate}", "4d6r1!kh3".
        /// Modifiers are written in the order they apply — reroll, explode,
        /// keep/drop — whatever order they were typed, so two expressions that
        /// mean the same thing normalize alike.
        /// </summary>
        public string RenderNotation()
        {
            string die = Die != null ? "{" + Die + "}" : Sides.ToString(CultureInfo.InvariantCulture);
            string reroll = Reroll != null
                ? "r" + (Reroll.Once ? "o" : "") + Reroll.Threshold.ToString(CultureInfo.InvariantCulture)
                : "";
            string explode = Explode ? "!" : "";
            string selection = Selection != null
                ? Selection.Mode + Selection.Count.ToString(CultureInfo.InvariantCulture)
                : "";
            return Count.ToString(CultureInfo.InvariantCulture) + "d" + die + reroll + explode + selection;
        }
    }

    /// <summary>A parsed expression: the source, its canonical form, and its terms.</summary>
    public sealed class DiceExpression
    {
        public DiceExpression(string source, string normalized, IReadOnlyList<ExpressionTerm> terms)
        {
            Source = source;
            Normalized = normalized;
            Terms = terms;
        }

        public string Source { get; }

        /// <summary>Canonical lowercase form with explicit counts, e.g. "2d20kh1+3".</summary>
        public string Normalized { get; }

        public IReadOnlyList<ExpressionTerm> Terms { get; }
    }

    /// <summary>
    /// Dice notation grammar v1.2 (see API.md for the full grammar):
    ///
    ///   expression := [sign] term { sign term }
    ///   term       := dice | integer
    ///   dice       := [count] ("d" | "D") (faces | "%" | "{" name "}") { modifier }
    ///   modifier   := reroll | "!" | selection
    ///   reroll     := "r" ["o"] threshold
    ///   selection  := ("kh" | "kl" | "dh" | "dl") [count]
    ///
    /// Case-insensitive; whitespace around terms and signs but not inside a
    /// group. "d%" means d100. A selection without a count defaults to 1.
    /// Modifiers may be written in any order and always apply as reroll, then
    /// explode, then keep/drop (ADR-0016).
    ///
    /// ASCII digits only, deliberately: three engines parse this grammar, and a
    /// locale-aware digit test would make "４d６" legal on one platform and not
    /// another. The conformance vectors pin that (ADR-0021).
    /// </summary>
    public static class Notation
    {
        public const int MaxExpressionLength = 500;
        public const int MaxTerms = 20;
        public const int MaxDicePerGroup = 100;
        public const int MaxModifier = 1000000;

        /// <summary>How many times one die may explode in a chain (ADR-0016).</summary>
        public const int MaxExplosionsPerDie = 10;

        /// <summary>How many times one die may be rerolled by `r` (ADR-0016).</summary>
        public const int MaxRerollsPerDie = 10;

        /// <summary>Dice a group's modifiers may add beyond the count asked for.</summary>
        public const int MaxExtraDicePerGroup = 100;

        private static readonly string[] SelectionModes = { "kh", "kl", "dh", "dl" };

        /// <summary>
        /// Parses an expression. Throws <see cref="DiceNotationException"/>
        /// with a zero-based position for syntax errors and limit violations.
        /// </summary>
        public static DiceExpression Parse(string expression, DieRegistry dice = null)
        {
            if (expression == null)
            {
                throw new DiceForgeException("invalid-argument", "expression must be a string");
            }
            if (expression.Length > MaxExpressionLength)
            {
                throw new DiceNotationException(
                    "expression exceeds " + MaxExpressionLength + " characters", MaxExpressionLength);
            }
            return new Parser(expression, dice).ParseExpression();
        }

        private sealed class ParsedDie
        {
            public int Sides;
            public string Id;
        }

        private sealed class Parser
        {
            private readonly string _source;
            private readonly DieRegistry _dice;
            private int _pos;

            public Parser(string source, DieRegistry dice)
            {
                _source = source;
                _dice = dice;
            }

            public DiceExpression ParseExpression()
            {
                var terms = new List<ExpressionTerm>();
                SkipWhitespace();
                if (AtEnd()) throw new DiceNotationException("expression is empty", _pos);
                terms.Add(ReadTerm(ReadSign(true)));
                SkipWhitespace();
                while (!AtEnd())
                {
                    terms.Add(ReadTerm(ReadSign(false)));
                    SkipWhitespace();
                    if (terms.Count > MaxTerms)
                    {
                        throw new DiceNotationException("expression exceeds " + MaxTerms + " terms", _pos);
                    }
                }
                if (!terms.Any(term => term is DiceGroupNode))
                {
                    throw new DiceNotationException(
                        "expression must include at least one die (for example \"1d6\")", 0);
                }
                return new DiceExpression(_source, Render(terms), terms);
            }

            private static string Render(IReadOnlyList<ExpressionTerm> terms)
            {
                var builder = new StringBuilder();
                for (int index = 0; index < terms.Count; index++)
                {
                    ExpressionTerm term = terms[index];
                    string body = term is DiceGroupNode group
                        ? group.RenderNotation()
                        : ((ModifierNode)term).Value.ToString(CultureInfo.InvariantCulture);
                    string op = term.Sign == -1 ? "-" : index == 0 ? "" : "+";
                    builder.Append(op).Append(body);
                }
                return builder.ToString();
            }

            private bool AtEnd() => _pos >= _source.Length;

            private char? Peek() => AtEnd() ? (char?)null : _source[_pos];

            // ASCII only: see the class comment. char.IsDigit would accept
            // fullwidth and other Unicode digits, diverging from the core.
            private static bool IsDigit(char c) => c >= '0' && c <= '9';

            private static bool IsLetter(char c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');

            private void SkipWhitespace()
            {
                while (!AtEnd() && char.IsWhiteSpace(_source[_pos])) _pos++;
            }

            private int ReadSign(bool optional)
            {
                char? c = Peek();
                if (c == '+')
                {
                    _pos++;
                    return 1;
                }
                if (c == '-')
                {
                    _pos++;
                    return -1;
                }
                if (optional) return 1;
                throw new DiceNotationException("expected \"+\" or \"-\" before the next term", _pos);
            }

            private ExpressionTerm ReadTerm(int sign)
            {
                SkipWhitespace();
                int start = _pos;
                char? c = Peek();
                if (c == null) throw new DiceNotationException("expected a term after the operator", _pos);
                if (IsDigit(c.Value))
                {
                    int value = ReadInteger("number");
                    char? next = Peek();
                    if (next == 'd' || next == 'D') return ReadDiceGroup(sign, value, start);
                    if (value > MaxModifier)
                    {
                        throw new DiceNotationException("modifier exceeds " + MaxModifier, start);
                    }
                    return new ModifierNode(sign, value);
                }
                if (c == 'd' || c == 'D') return ReadDiceGroup(sign, 1, start);
                throw new DiceNotationException("unexpected character \"" + c + "\"", _pos);
            }

            private DiceGroupNode ReadDiceGroup(int sign, int count, int start)
            {
                _pos++; // consume "d"
                ParsedDie die = ReadDie();
                if (count < 1) throw new DiceNotationException("dice count must be at least 1", start);
                if (count > MaxDicePerGroup)
                {
                    throw new DiceNotationException("dice count exceeds " + MaxDicePerGroup, start);
                }

                DiceReroll reroll = null;
                bool explode = false;
                DiceSelection selection = null;
                while (!AtEnd())
                {
                    char? c = Peek();
                    if (c == '!')
                    {
                        if (explode) throw new DiceNotationException("explode is already set", _pos);
                        AssertCanExplode(die, _pos);
                        _pos++;
                        explode = true;
                        continue;
                    }
                    if (c == 'r' || c == 'R')
                    {
                        if (reroll != null) throw new DiceNotationException("reroll is already set", _pos);
                        reroll = ReadReroll(die);
                        continue;
                    }
                    if (c != null && IsLetter(c.Value))
                    {
                        if (selection != null)
                        {
                            throw new DiceNotationException("keep/drop is already set", _pos);
                        }
                        selection = ReadSelection(count);
                        continue;
                    }
                    break;
                }

                return new DiceGroupNode(sign, count, die.Sides, die.Id, reroll, explode, selection);
            }

            /// <summary>Face values this die can produce, when knowable while parsing.</summary>
            private IReadOnlyList<int> FaceValues(ParsedDie die)
            {
                if (die.Id == null) return null; // plain numeric: 1..sides
                DieDefinition definition = _dice?.Find(die.Id);
                return definition?.Faces.Select(face => face.Value).ToList();
            }

            private void AssertCanExplode(ParsedDie die, int position)
            {
                IReadOnlyList<int> values = FaceValues(die);
                if (values == null || values.Count == 0) return;
                int highest = values.Max();
                if (values.All(value => value == highest))
                {
                    throw new DiceNotationException(
                        "every face of this die is its highest, so it would explode forever", position);
                }
            }

            private DiceReroll ReadReroll(ParsedDie die)
            {
                int start = _pos;
                _pos++; // consume "r"
                char? next = Peek();
                bool once = next == 'o' || next == 'O';
                if (once) _pos++;
                int threshold = ReadInteger("reroll threshold");

                IReadOnlyList<int> values = FaceValues(die);
                int highest = values != null ? values.Max() : die.Sides;
                int lowest = values != null ? values.Min() : 1;
                if (threshold >= highest)
                {
                    throw new DiceNotationException(
                        "reroll threshold " + threshold +
                        " covers every face of this die, so it would never settle", start);
                }
                if (threshold < lowest)
                {
                    throw new DiceNotationException(
                        "reroll threshold " + threshold +
                        " is below every face of this die, so it would do nothing", start);
                }
                return new DiceReroll(threshold, once);
            }

            /// <summary>The part after "d": a face count, "%", or a braced name.</summary>
            private ParsedDie ReadDie()
            {
                char? c = Peek();
                if (c == '%')
                {
                    _pos++;
                    return new ParsedDie { Sides = 100 };
                }
                if (c == '{') return ReadNamedDie();
                if (c == null || !IsDigit(c.Value))
                {
                    throw new DiceNotationException("expected a die size or {name} after \"d\"", _pos);
                }
                int start = _pos;
                int sides = ReadInteger("die size");
                if (sides < 2)
                {
                    throw new DiceNotationException(
                        "d" + sides + " has no faces to roll; for a constant use a modifier such as \"+" +
                        sides + "\"", start);
                }
                if (sides > DieDefinition.MaxDieFaces)
                {
                    throw new DiceNotationException(
                        "die size exceeds " + DieDefinition.MaxDieFaces + " faces", start);
                }
                return new ParsedDie { Sides = sides };
            }

            private ParsedDie ReadNamedDie()
            {
                int start = _pos;
                _pos++; // consume "{"
                var name = new StringBuilder();
                while (!AtEnd() && Peek() != '}')
                {
                    name.Append(_source[_pos]);
                    _pos++;
                }
                if (AtEnd())
                {
                    throw new DiceNotationException("unterminated die name; expected \"}\"", start);
                }
                _pos++; // consume "}"
                if (name.Length == 0) throw new DiceNotationException("die name is empty", start);

                string text = name.ToString();
                DieDefinition definition = _dice?.Find(text);
                if (_dice != null && definition == null)
                {
                    var known = _dice.Values.Select(die => "d{" + die.Id + "}").ToList();
                    string hint = known.Count > 0
                        ? "defined dice are " + string.Join(", ", known)
                        : "no dice are defined";
                    throw new DiceNotationException(
                        "unknown die " + Json.Quote(text) + "; " + hint, start);
                }
                // Without a registry the name is carried through unresolved:
                // only the caller knows which dice exist, so resolution rejects it.
                return new ParsedDie
                {
                    Sides = definition?.Faces.Count ?? 0,
                    Id = definition?.Id ?? text,
                };
            }

            private DiceSelection ReadSelection(int diceCount)
            {
                char? c = Peek();
                if (c == null || !IsLetter(c.Value)) return null;
                int start = _pos;
                int available = Math.Min(2, _source.Length - _pos);
                string mode = _source.Substring(_pos, available).ToLowerInvariant();
                if (Array.IndexOf(SelectionModes, mode) < 0)
                {
                    throw new DiceNotationException(
                        "unknown roll modifier \"" + mode + "\"; supported modifiers are kh, kl, dh, dl",
                        start);
                }
                _pos += 2;
                int count = 1;
                char? next = Peek();
                if (next != null && IsDigit(next.Value))
                {
                    int countStart = _pos;
                    count = ReadInteger("keep/drop count");
                    if (count < 1)
                    {
                        throw new DiceNotationException("keep/drop count must be at least 1", countStart);
                    }
                    if (count > diceCount)
                    {
                        throw new DiceNotationException(
                            "keep/drop count " + count + " exceeds the " + diceCount +
                            " dice in the group", countStart);
                    }
                }
                return new DiceSelection(mode, count);
            }

            private int ReadInteger(string label)
            {
                int start = _pos;
                var digits = new StringBuilder();
                while (!AtEnd())
                {
                    char c = _source[_pos];
                    if (!IsDigit(c)) break;
                    digits.Append(c);
                    _pos++;
                }
                if (digits.Length == 0) throw new DiceNotationException("expected a " + label, start);
                if (digits.Length > 7) throw new DiceNotationException(label + " is too large", start);
                return int.Parse(digits.ToString(), CultureInfo.InvariantCulture);
            }
        }
    }
}
