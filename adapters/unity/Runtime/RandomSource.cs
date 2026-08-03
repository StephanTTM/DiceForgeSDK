using System;

namespace DiceForge
{
    /// <summary>
    /// Where randomness comes from. Injected rather than reached for, so the
    /// engine holds no global state and a seeded run is exactly reproducible.
    /// </summary>
    public interface IRandomSource
    {
        /// <summary>A uniform draw across the whole 32-bit range.</summary>
        uint NextUint32();

        /// <summary>How this source describes itself in a resolved record.</summary>
        Provenance Provenance();
    }

    /// <summary>
    /// What produced a record's numbers: a seed and algorithm for a seeded
    /// source, or just the algorithm for a system one. Carried on every record
    /// so a result can say how it was made.
    /// </summary>
    public sealed class Provenance
    {
        public Provenance(string source, string seed, string algorithm)
        {
            Source = source;
            Seed = seed;
            Algorithm = algorithm;
        }

        /// <summary>"seeded" or "system".</summary>
        public string Source { get; }

        /// <summary>The seed text; null for a system source.</summary>
        public string Seed { get; }

        public string Algorithm { get; }
    }

    /// <summary>
    /// The platform's randomness, for when a run does not need to be repeated.
    /// Unity's own <c>UnityEngine.Random</c> is deliberately not used: the core
    /// stays free of engine types (ADR-0003), so this file compiles and is
    /// testable outside Unity.
    /// </summary>
    public sealed class SystemRandom : IRandomSource
    {
        private readonly Random _random = new Random();

        public uint NextUint32()
        {
            var bytes = new byte[4];
            _random.NextBytes(bytes);
            return BitConverter.ToUInt32(bytes, 0);
        }

        public Provenance Provenance()
        {
            return new Provenance("system", null, "math-random");
        }
    }

    /// <summary>Uniform face sampling, shared by every caller that rolls.</summary>
    public static class Sample
    {
        private const double Uint32Range = 4294967296.0;

        /// <summary>
        /// A uniform integer in [1, sides]. Rejection sampling, so every face is
        /// equally likely whatever the die size — plain modulo would favour the
        /// low faces, and the vectors would catch it.
        /// </summary>
        public static int RollFace(IRandomSource source, int sides)
        {
            if (sides < 1)
            {
                throw new DiceForgeException(
                    "invalid-argument",
                    "sides must be an integer between 1 and 4294967296, got " + sides);
            }
            uint limit = (uint)(Uint32Range - (Uint32Range % sides));
            uint value = source.NextUint32();
            while (value >= limit)
            {
                value = source.NextUint32();
            }
            return (int)(value % (uint)sides) + 1;
        }
    }
}
