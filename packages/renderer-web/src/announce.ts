import type { InteractionEvent } from "@diceforge-sdk/core";

/**
 * Plain-language description of a resolved event, used for aria-live
 * announcements and available to any consumer that wants consistent wording.
 */
export function formatEventAnnouncement(event: InteractionEvent): string {
  if (event.kind === "coin-flip") {
    return `Coin flip: ${event.outcome}.`;
  }
  const groups = event.groups
    .map((group) => {
      const dice = group.dice
        // A rerolled value was replaced, not merely excluded — say which.
        .map((die) =>
          die.kept ? `${die.value}` : `${die.value} ${die.rerolled ? "rerolled" : "dropped"}`,
        )
        .join(", ");
      return `${group.notation}: ${dice}`;
    })
    .join("; ");
  const modifier =
    event.modifier === 0
      ? ""
      : ` Modifier ${event.modifier > 0 ? `+${event.modifier}` : event.modifier}.`;
  return `Rolled ${event.expression}. ${groups}.${modifier} Total ${event.total}.`;
}

export type Announcer = {
  announce(message: string): void;
  dispose(): void;
};

/**
 * Maintains a visually hidden aria-live region inside the container so
 * screen readers hear results even when the visual presentation is skipped
 * or fails.
 */
export function createAnnouncer(container: HTMLElement): Announcer {
  const region = container.ownerDocument.createElement("div");
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.dataset.diceforge = "announcer";
  Object.assign(region.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    margin: "-1px",
    padding: "0",
    overflow: "hidden",
    clipPath: "inset(50%)",
    whiteSpace: "nowrap",
    border: "0",
  });
  container.append(region);
  return {
    announce(message: string): void {
      region.textContent = message;
    },
    dispose(): void {
      region.remove();
    },
  };
}
