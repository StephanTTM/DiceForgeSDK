import { forgeAssets } from "@diceforge-sdk/assets-forge";
import type { DiceEngine, InteractionEvent } from "@diceforge-sdk/core";
import {
  createDiceEngine,
  createSeededRandomSource,
  createSession,
  DiceForgeError,
  defineDie,
  deserializeSession,
  replaySession,
  serializeEvent,
  serializeSession,
} from "@diceforge-sdk/core";
import { createPhysicsPresenter } from "@diceforge-sdk/presenter-physics";
import type {
  DicePresenter,
  DiceTheme,
  ForgeColor,
  MotionPreference,
  RenderModePreference,
} from "@diceforge-sdk/renderer-web";
import {
  createDicePresenter,
  forgeTheme,
  formatEventAnnouncement,
} from "@diceforge-sdk/renderer-web";

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`missing demo element ${selector}`);
  return element;
}

const stage = must<HTMLElement>("#stage");
const notationInput = must<HTMLInputElement>("#notation");
const seedInput = must<HTMLInputElement>("#seed");
const rollButton = must<HTMLButtonElement>("#roll");
const flipButton = must<HTMLButtonElement>("#flip");
const replayButton = must<HTMLButtonElement>("#replay");
const modeSelect = must<HTMLSelectElement>("#mode");
const motionSelect = must<HTMLSelectElement>("#motion");
const themeSelect = must<HTMLSelectElement>("#theme");
const soundInput = must<HTMLInputElement>("#sound");
const activeMode = must<HTMLElement>("#active-mode");
const status = must<HTMLElement>("#status");
const record = must<HTMLElement>("#record");

/**
 * Both presenters satisfy the core contract; only the extra `mode` is
 * browser-specific, so the demo asks `capabilities` for anything portable.
 */
type AnyPresenter = Pick<DicePresenter, "capabilities" | "present" | "dispose"> & {
  readonly mode?: string;
};

let presenter: AnyPresenter | undefined;
/**
 * A Fate die, to show what a custom definition buys: faces worth -1, 0 and +1
 * that read as symbols. Try "4d{fate}" in the notation box (ADR-0015). Custom
 * dice have no 3D model — a numbered one would show a face they do not have —
 * so they land as tiles even with a theme selected.
 */
const CUSTOM_DICE = [
  defineDie({
    id: "fate",
    faces: [
      { value: -1, label: "-" },
      { value: -1, label: "-" },
      { value: 0, label: " " },
      { value: 0, label: " " },
      { value: 1, label: "+" },
      { value: 1, label: "+" },
    ],
  }),
];

let engine: DiceEngine = createDiceEngine({ dice: CUSTOM_DICE });
let engineSeed = "";

/**
 * Marks the engine for rebuilding on the next roll. The seed box is compared
 * after trimming, so a value with a leading space can never match it.
 */
const STALE_SEED = " (stale)";

/** Theme picker value is a colour, or "" for no theme (tiles only). */
function selectedTheme(): DiceTheme | undefined {
  const color = themeSelect.value as ForgeColor | "";
  // The dice come from @diceforge-sdk/assets-forge, which resolves the files it
  // ships; nothing here has to know where they are served from.
  return color ? forgeTheme(forgeAssets({ color })) : undefined;
}

function rebuildPresenter(): void {
  presenter?.dispose();
  const theme = selectedTheme();
  const reducedMotion = motionSelect.value as MotionPreference;
  presenter =
    modeSelect.value === "physics"
      ? // Dice tumble under simulation and still land on the resolved face,
        // because each one's mesh is rotated inside its collider first
        // (ADR-0018). Coins and unmodelled dice fall through to the renderer.
        createPhysicsPresenter({
          container: stage,
          reducedMotion,
          // Knocks derived from the recording's own collisions (ADR-0020).
          // Only physics has impacts to sound; the renderer option ignores it.
          sound: soundInput.checked,
          ...(theme ? { theme } : {}),
        })
      : createDicePresenter({
          container: stage,
          renderMode: modeSelect.value as RenderModePreference,
          reducedMotion,
          ...(theme ? { theme } : {}),
        });
  // Ask the presenter what it can do rather than inferring it from the options
  // we passed — the same question an app would ask of any presenter (ADR-0014).
  const { implementation, media, announces } = presenter.capabilities;
  activeMode.textContent = `active: ${presenter.mode ?? implementation.split("/").pop()} · draws ${media.join(
    ", then ",
  )}${announces ? " · announces results" : ""}`;
}

function currentEngine(): DiceEngine {
  const seed = seedInput.value.trim();
  if (seed !== engineSeed) {
    engineSeed = seed;
    engine = seed
      ? createDiceEngine({ random: createSeededRandomSource(seed), dice: CUSTOM_DICE })
      : createDiceEngine({ dice: CUSTOM_DICE });
  }
  return engine;
}

/**
 * Everything rolled this session, kept the way an application would keep it —
 * the engine records nothing itself (ADR-0017).
 */
const log: InteractionEvent[] = [];

async function show(event: InteractionEvent): Promise<void> {
  log.push(event);
  replayButton.disabled = false;
  status.textContent = formatEventAnnouncement(event);
  record.textContent = serializeEvent(event);
  await presenter?.present(event);
}

/**
 * Replays the session from its serialized form, to make the point that nothing
 * is re-rolled: these are the stored outcomes, and the seeded engine's next
 * roll is unaffected by watching them again.
 */
async function replay(): Promise<void> {
  if (!presenter || log.length === 0) return;
  const stored = deserializeSession(serializeSession(createSession(log)));
  replayButton.disabled = true;
  try {
    await replaySession(stored, presenter, {
      onEvent: (event, index) => {
        status.textContent = `Replaying ${index + 1} of ${stored.events.length}: ${formatEventAnnouncement(event)}`;
        record.textContent = serializeEvent(event);
      },
    });
    status.textContent = `Replayed ${stored.events.length} stored event(s) — nothing was rolled again.`;
  } finally {
    replayButton.disabled = false;
  }
}

async function roll(): Promise<void> {
  try {
    await show(currentEngine().roll(notationInput.value));
  } catch (error) {
    if (error instanceof DiceForgeError) {
      status.textContent = error.message;
      record.textContent = "";
    } else {
      throw error;
    }
  }
}

async function flip(): Promise<void> {
  await show(currentEngine().flipCoin());
}

rollButton.addEventListener("click", () => void roll());
flipButton.addEventListener("click", () => void flip());
replayButton.addEventListener("click", () => void replay());
notationInput.addEventListener("keydown", (keyboardEvent) => {
  if (keyboardEvent.key === "Enter") void roll();
});
modeSelect.addEventListener("change", rebuildPresenter);
motionSelect.addEventListener("change", rebuildPresenter);
themeSelect.addEventListener("change", rebuildPresenter);
soundInput.addEventListener("change", rebuildPresenter);
seedInput.addEventListener("input", () => {
  engineSeed = STALE_SEED;
});

rebuildPresenter();
