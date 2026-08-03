using System;

namespace DiceForge
{
    /// <summary>
    /// Everything the engine refuses, with a stable <see cref="Code"/> callers
    /// can branch on. Message wording is not API — only codes and, for
    /// notation, positions are (ADR-0021).
    /// </summary>
    public class DiceForgeException : Exception
    {
        public DiceForgeException(string code, string message) : base(message)
        {
            Code = code;
        }

        /// <summary>Stable identifier, e.g. "invalid-argument", "invalid-notation".</summary>
        public string Code { get; }
    }

    /// <summary>
    /// A notation error, carrying where in the expression it was found.
    ///
    /// The position is part of the contract every port reproduces exactly, so
    /// an editor can underline the same character on every platform.
    /// </summary>
    public sealed class DiceNotationException : DiceForgeException
    {
        public DiceNotationException(string message, int position)
            : base("invalid-notation", message)
        {
            Position = position;
        }

        /// <summary>Zero-based index into the expression.</summary>
        public int Position { get; }
    }
}
