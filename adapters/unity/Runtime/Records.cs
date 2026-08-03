using System.Collections.Generic;
using System.Globalization;
using System.Text;

namespace DiceForge
{
    /// <summary>
    /// Minimal JSON writing, so a record serializes to exactly the schema v2
    /// shape every DiceForge platform reads — optional keys omitted rather than
    /// written as null, which is what makes the vectors comparable.
    /// </summary>
    public static class Json
    {
        /// <summary>A JSON string literal, escaped like JSON.stringify would.</summary>
        public static string Quote(string value)
        {
            var builder = new StringBuilder("\"");
            foreach (char c in value)
            {
                switch (c)
                {
                    case '"': builder.Append("\\\""); break;
                    case '\\': builder.Append("\\\\"); break;
                    case '\b': builder.Append("\\b"); break;
                    case '\f': builder.Append("\\f"); break;
                    case '\n': builder.Append("\\n"); break;
                    case '\r': builder.Append("\\r"); break;
                    case '\t': builder.Append("\\t"); break;
                    default:
                        if (c < 0x20) builder.Append("\\u").Append(((int)c).ToString("x4"));
                        else builder.Append(c);
                        break;
                }
            }
            return builder.Append('"').ToString();
        }

        public static string Number(int value) => value.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>One physical die inside a roll, in rolled order.</summary>
    public sealed class DieOutcome
    {
        public int Sides;
        public int Value;
        public bool Kept;

        /// <summary>Custom die this came from, when it was not a plain numeric die.</summary>
        public string Die;

        /// <summary>How the face reads, when that differs from the value.</summary>
        public string Label;

        /// <summary>"reroll" or "explosion" when the die is beyond the count asked for.</summary>
        public string Source;

        /// <summary>True when a reroll threw this result away (ADR-0016).</summary>
        public bool Rerolled;

        public string ToJson()
        {
            var builder = new StringBuilder("{");
            builder.Append("\"sides\":").Append(Json.Number(Sides));
            builder.Append(",\"value\":").Append(Json.Number(Value));
            builder.Append(",\"kept\":").Append(Kept ? "true" : "false");
            if (Die != null) builder.Append(",\"die\":").Append(Json.Quote(Die));
            if (Label != null) builder.Append(",\"label\":").Append(Json.Quote(Label));
            if (Source != null) builder.Append(",\"source\":").Append(Json.Quote(Source));
            if (Rerolled) builder.Append(",\"rerolled\":true");
            return builder.Append('}').ToString();
        }
    }

    /// <summary>The outcome of one dice group term such as "2d20kh1".</summary>
    public sealed class RollGroupOutcome
    {
        public string Notation;
        public int Sign;
        public int Sides;
        public string Die;
        public List<DieOutcome> Dice = new List<DieOutcome>();
        public int Subtotal;

        public string ToJson()
        {
            var builder = new StringBuilder("{");
            builder.Append("\"notation\":").Append(Json.Quote(Notation));
            builder.Append(",\"sign\":").Append(Json.Number(Sign));
            builder.Append(",\"sides\":").Append(Json.Number(Sides));
            if (Die != null) builder.Append(",\"die\":").Append(Json.Quote(Die));
            builder.Append(",\"dice\":[");
            for (int index = 0; index < Dice.Count; index++)
            {
                if (index > 0) builder.Append(',');
                builder.Append(Dice[index].ToJson());
            }
            builder.Append(']');
            builder.Append(",\"subtotal\":").Append(Json.Number(Subtotal));
            return builder.Append('}').ToString();
        }
    }

    /// <summary>What every resolved event shares.</summary>
    public abstract class InteractionEvent
    {
        /// <summary>Version of the serialized shape; 2 today (ADR-0015).</summary>
        public const int SchemaVersion = 2;

        public Provenance Provenance;

        public abstract string ToJson();

        protected string ProvenanceJson()
        {
            var builder = new StringBuilder("{");
            builder.Append("\"source\":").Append(Json.Quote(Provenance.Source));
            if (Provenance.Seed != null) builder.Append(",\"seed\":").Append(Json.Quote(Provenance.Seed));
            builder.Append(",\"algorithm\":").Append(Json.Quote(Provenance.Algorithm));
            return builder.Append('}').ToString();
        }
    }

    public sealed class RollResult : InteractionEvent
    {
        /// <summary>Canonical form of the rolled expression, e.g. "2d20kh1+3".</summary>
        public string Expression;

        public List<RollGroupOutcome> Groups = new List<RollGroupOutcome>();

        /// <summary>Net signed contribution of all constant terms.</summary>
        public int Modifier;

        public int Total;

        public override string ToJson()
        {
            var builder = new StringBuilder("{");
            builder.Append("\"kind\":\"roll\"");
            builder.Append(",\"schemaVersion\":").Append(Json.Number(SchemaVersion));
            builder.Append(",\"expression\":").Append(Json.Quote(Expression));
            builder.Append(",\"groups\":[");
            for (int index = 0; index < Groups.Count; index++)
            {
                if (index > 0) builder.Append(',');
                builder.Append(Groups[index].ToJson());
            }
            builder.Append(']');
            builder.Append(",\"modifier\":").Append(Json.Number(Modifier));
            builder.Append(",\"total\":").Append(Json.Number(Total));
            builder.Append(",\"provenance\":").Append(ProvenanceJson());
            return builder.Append('}').ToString();
        }
    }

    public sealed class CoinFlipResult : InteractionEvent
    {
        /// <summary>"heads" or "tails".</summary>
        public string Outcome;

        public override string ToJson()
        {
            var builder = new StringBuilder("{");
            builder.Append("\"kind\":\"coin-flip\"");
            builder.Append(",\"schemaVersion\":").Append(Json.Number(SchemaVersion));
            builder.Append(",\"outcome\":").Append(Json.Quote(Outcome));
            builder.Append(",\"provenance\":").Append(ProvenanceJson());
            return builder.Append('}').ToString();
        }
    }
}
