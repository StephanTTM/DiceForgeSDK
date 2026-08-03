using System;
using System.Collections.Generic;
using System.Linq;

namespace DiceForge
{
    /// <summary>One face of a custom die: what it is worth, and how it reads.</summary>
    public sealed class DieFace
    {
        public DieFace(int value, string label = null)
        {
            Value = value;
            Label = label;
        }

        public int Value { get; }

        /// <summary>How the face reads when that differs from the value ("+", " ").</summary>
        public string Label { get; }
    }

    /// <summary>
    /// A custom die (ADR-0015): any set of faces, values that may repeat, be
    /// zero, or be negative, each optionally labelled.
    /// </summary>
    public sealed class DieDefinition
    {
        public const int MaxDieFaces = 1000;
        public const int MaxFaceValue = 1000000;
        public const int MaxDieIdLength = 24;
        public const int MaxFaceLabelLength = 8;

        private DieDefinition(string id, IReadOnlyList<DieFace> faces)
        {
            Id = id;
            Faces = faces;
        }

        public string Id { get; }

        public IReadOnlyList<DieFace> Faces { get; }

        /// <summary>
        /// Validates and freezes a definition. The rules match the TypeScript
        /// core exactly, because a die that is legal on one platform and not on
        /// another would break the promise that records travel.
        /// </summary>
        public static DieDefinition Define(string id, IEnumerable<DieFace> faces)
        {
            if (string.IsNullOrEmpty(id))
            {
                throw new DiceForgeException("invalid-argument", "invalid die definition: id is required");
            }
            if (id.Length > MaxDieIdLength)
            {
                throw new DiceForgeException(
                    "invalid-argument",
                    "invalid die definition: id exceeds " + MaxDieIdLength + " characters");
            }
            if (!IsValidId(id))
            {
                throw new DiceForgeException(
                    "invalid-argument",
                    "invalid die definition: id \"" + id +
                    "\" must start with a letter and use only letters, digits, - and _");
            }
            var list = faces == null ? new List<DieFace>() : faces.ToList();
            if (list.Count < 2)
            {
                throw new DiceForgeException(
                    "invalid-argument", "invalid die definition: a die needs at least two faces");
            }
            if (list.Count > MaxDieFaces)
            {
                throw new DiceForgeException(
                    "invalid-argument",
                    "invalid die definition: a die may not have more than " + MaxDieFaces + " faces");
            }
            foreach (DieFace face in list)
            {
                if (Math.Abs(face.Value) > MaxFaceValue)
                {
                    throw new DiceForgeException(
                        "invalid-argument",
                        "invalid die definition: face value exceeds " + MaxFaceValue);
                }
                if (face.Label != null && face.Label.Length > MaxFaceLabelLength)
                {
                    throw new DiceForgeException(
                        "invalid-argument",
                        "invalid die definition: face label exceeds " + MaxFaceLabelLength + " characters");
                }
            }
            return new DieDefinition(id, list);
        }

        private static bool IsValidId(string id)
        {
            if (!char.IsLetter(id[0]) || id[0] > 'z') return false;
            foreach (char c in id)
            {
                bool ok = (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9')
                          || c == '-' || c == '_';
                if (!ok) return false;
            }
            return true;
        }
    }

    /// <summary>
    /// The custom dice an expression may name, looked up case-insensitively —
    /// the same rule the parser and resolver both use.
    /// </summary>
    public sealed class DieRegistry
    {
        private readonly Dictionary<string, DieDefinition> _dice =
            new Dictionary<string, DieDefinition>(StringComparer.Ordinal);

        public DieRegistry(IEnumerable<DieDefinition> dice = null)
        {
            if (dice == null) return;
            foreach (DieDefinition die in dice) _dice[die.Id.ToLowerInvariant()] = die;
        }

        public int Count => _dice.Count;

        public IEnumerable<DieDefinition> Values => _dice.Values;

        public DieDefinition Find(string id)
        {
            if (id == null) return null;
            return _dice.TryGetValue(id.ToLowerInvariant(), out DieDefinition die) ? die : null;
        }
    }
}
