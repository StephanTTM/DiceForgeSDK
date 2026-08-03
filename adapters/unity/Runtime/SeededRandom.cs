using System;

namespace DiceForge
{
    /// <summary>
    /// Reproducible randomness, seeded from a string or number (ADR-0005).
    ///
    /// The same seed produces the same sequence here as in the TypeScript core
    /// and the GDScript port, bit for bit — that is the contract the
    /// conformance vectors hold this file to (ADR-0021). The generator is
    /// xoshiro128** (public domain, Blackman and Vigna) over cyrb128 seeding.
    ///
    /// C# is kinder to this port than GDScript was. A C# <c>string</c> is
    /// UTF-16, exactly like JavaScript's, so <c>text[i]</c> yields the same code
    /// unit <c>charCodeAt(i)</c> does and astral characters split into surrogate
    /// pairs by themselves — the GDScript port had to do that by hand. And
    /// arithmetic on <c>uint</c> wraps at 32 bits in an unchecked context, which
    /// is what <c>Math.imul</c> means, so no 16-bit half-multiplication is
    /// needed either.
    /// </summary>
    public sealed class SeededRandom : IRandomSource
    {
        private uint _s0;
        private uint _s1;
        private uint _s2;
        private uint _s3;

        private SeededRandom(string seedText)
        {
            SeedText = seedText;
            uint[] state = HashSeed(seedText);
            _s0 = state[0];
            _s1 = state[1];
            _s2 = state[2];
            _s3 = state[3];
            if ((_s0 | _s1 | _s2 | _s3) == 0)
            {
                // xoshiro must never start at the all-zero state.
                _s0 = 0x9e3779b9;
                _s1 = 0x243f6a88;
                _s2 = 0xb7e15162;
                _s3 = 0x8aed2a6a;
            }
        }

        /// <summary>The seed exactly as given, which provenance reports.</summary>
        public string SeedText { get; }

        /// <summary>Creates a source from seed text.</summary>
        public static SeededRandom Create(string seed)
        {
            if (seed == null) throw new ArgumentNullException(nameof(seed));
            return new SeededRandom(seed);
        }

        /// <summary>
        /// Creates a source from a number. A numeric seed is its string form,
        /// so <c>Create(42)</c> and <c>Create("42")</c> are the same stream.
        /// </summary>
        public static SeededRandom Create(long seed)
        {
            return new SeededRandom(seed.ToString(System.Globalization.CultureInfo.InvariantCulture));
        }

        /// <summary>
        /// cyrb128: expands arbitrary text into four well-mixed 32-bit words.
        /// The constants are part of the reproducibility contract (ADR-0005);
        /// changing them changes every seeded sequence on every platform.
        /// </summary>
        private static uint[] HashSeed(string text)
        {
            unchecked
            {
                int h1 = 1779033703;
                int h2 = (int)3144134277u;
                int h3 = 1013904242;
                int h4 = (int)2773480762u;
                for (int i = 0; i < text.Length; i++)
                {
                    // A UTF-16 code unit, which is what charCodeAt returns.
                    int k = text[i];
                    h1 = h2 ^ (h1 ^ k) * 597399067;
                    h2 = h3 ^ (h2 ^ k) * (int)2869860233u;
                    h3 = h4 ^ (h3 ^ k) * 951274213;
                    h4 = h1 ^ (h4 ^ k) * (int)2716044179u;
                }
                h1 = (h3 ^ (int)((uint)h1 >> 18)) * 597399067;
                h2 = (h4 ^ (int)((uint)h2 >> 22)) * (int)2869860233u;
                h3 = (h1 ^ (int)((uint)h3 >> 17)) * 951274213;
                h4 = (h2 ^ (int)((uint)h4 >> 19)) * (int)2716044179u;
                return new[]
                {
                    (uint)(h1 ^ h2 ^ h3 ^ h4),
                    (uint)(h2 ^ h1),
                    (uint)(h3 ^ h1),
                    (uint)(h4 ^ h1),
                };
            }
        }

        private static uint Rotl(uint x, int k)
        {
            return (x << k) | (x >> (32 - k));
        }

        /// <summary>The next 32-bit draw. Every other primitive is built on this.</summary>
        public uint NextUint32()
        {
            unchecked
            {
                uint result = Rotl(_s1 * 5, 7) * 9;
                uint t = _s1 << 9;
                _s2 ^= _s0;
                _s3 ^= _s1;
                _s1 ^= _s2;
                _s0 ^= _s3;
                _s2 ^= t;
                _s3 = Rotl(_s3, 11);
                return result;
            }
        }

        /// <summary>How this source describes itself in a record.</summary>
        public Provenance Provenance()
        {
            return new Provenance("seeded", SeedText, "xoshiro128**");
        }
    }
}
