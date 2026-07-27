import type { AbortSignalLike, InteractionEvent, PresenterCapabilities } from "@diceforge-sdk/core";
import { DiceForgeError, validateEventRecord } from "@diceforge-sdk/core";
import type { DiceTheme, ShapedDieSides, VisualDie } from "@diceforge-sdk/renderer-web";
import {
  applyTexture,
  createDicePresenter,
  formatEventAnnouncement,
  hasCalibratedModel,
  instantiateDieModel,
  loadDieModel,
  loadThemeTexture,
  visualDiceForEvent,
} from "@diceforge-sdk/renderer-web";
import {
  AmbientLight,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  WebGLRenderer,
} from "three";
import type { PhysicsDie } from "./simulate.js";
import { simulateRoll } from "./simulate.js";

export type PhysicsPresenterOptions = {
  readonly container: HTMLElement;
  /** Models to roll. Without one there is nothing to draw, and every event is delegated. */
  readonly theme?: DiceTheme;
  /** "auto" (default) honors the platform's reduced-motion setting. */
  readonly reducedMotion?: "auto" | "animate" | "reduce";
  /** Maintain an aria-live region announcing results. Default true. */
  readonly announceResults?: boolean;
  /** Uniform random source for the throw. Seed it and a roll replays exactly. */
  readonly random?: () => number;
};

export type PhysicsPresenter = {
  readonly capabilities: PresenterCapabilities;
  present(event: InteractionEvent, options?: { signal?: AbortSignalLike }): Promise<void>;
  dispose(): void;
};

/** Model radius in scene units — the same scale the renderer draws dice at. */
const DIE_RADIUS = 1.05;
const CAMERA_ELEVATION = 62;
/** Dropped dice are revealed only once the whole roll has landed. */
const REVEAL_HOLD_MS = 220;
const REVEAL_MS = 420;

/** A visually hidden live region, so a result is spoken as well as drawn. */
function createAnnouncer(host: HTMLElement, doc: Document) {
  const region = doc.createElement("div");
  region.dataset.diceforge = "physics-announcer";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.style.cssText =
    "position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0";
  host.append(region);
  return {
    announce(text: string): void {
      region.textContent = text;
    },
    dispose(): void {
      region.remove();
    },
  };
}

function abortError(): Error {
  const error = new Error("presentation aborted");
  error.name = "AbortError";
  return error;
}

function prefersReduced(host: { matchMedia?: (q: string) => { matches: boolean } }): boolean {
  return host.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

type DrawnDie = {
  readonly object: Object3D;
  readonly motion: PhysicsDie;
  readonly kept: boolean;
  readonly materials: readonly MeshStandardMaterial[];
  readonly baseColors: readonly Color[];
};

/**
 * A presenter that rolls dice with physics and lands them on the recorded face.
 *
 * It draws only what it can honestly simulate — a roll whose dice all have
 * models. Coin flips, custom dice, unusual face counts, a missing theme or a
 * browser without WebGL are handed to `@diceforge-sdk/renderer-web`, which
 * already does them well. Delegating rather than reimplementing is why this
 * package is small.
 */
export function createPhysicsPresenter(options: PhysicsPresenterOptions): PhysicsPresenter {
  const { container } = options;
  if (!container || typeof container.appendChild !== "function") {
    throw new DiceForgeError("invalid-argument", "container must be an HTMLElement");
  }
  const doc = container.ownerDocument;
  const view = doc.defaultView ?? globalThis;

  // Everything this cannot roll goes here — coins, custom dice, no WebGL —
  // so there is one implementation of each rather than two.
  const delegate = createDicePresenter({
    container,
    ...(options.theme ? { theme: options.theme } : {}),
    ...(options.reducedMotion ? { reducedMotion: options.reducedMotion } : {}),
    // Announcing is done here, once, however the event was drawn: letting the
    // delegate do it too would say every physics roll twice.
    announceResults: false,
  });

  const announces = options.announceResults !== false;
  const announcer = announces ? createAnnouncer(container, doc) : undefined;

  /**
   * The delegate draws into the same container, and two canvases in normal
   * flow stack rather than overlap — so whichever is not drawing is hidden.
   * The delegate shows its own again whenever it presents.
   */
  const delegateCanvas = container.querySelector<HTMLElement>(
    'canvas[data-diceforge="webgl-presenter"]',
  );
  const showPhysics = (visible: boolean): void => {
    if (renderer) renderer.domElement.style.display = visible ? "block" : "none";
    if (delegateCanvas) delegateCanvas.style.display = visible ? "none" : "";
  };

  const models = options.theme?.models;
  const canRoll = delegate.mode === "webgl" && models !== undefined;

  let scene: Scene | undefined;
  let renderer: WebGLRenderer | undefined;
  let camera: PerspectiveCamera | undefined;
  let diceGroup: Group | undefined;
  let disposed = false;
  let cancelActive: (() => void) | undefined;

  function ensureScene(): { renderer: WebGLRenderer; scene: Scene; camera: PerspectiveCamera } {
    if (renderer && scene && camera) return { renderer, scene, camera };
    const width = container.clientWidth || 640;
    const height = container.clientHeight || 360;
    renderer = new WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.domElement.dataset.diceforge = "physics-presenter";
    container.append(renderer.domElement);

    scene = new Scene();
    scene.add(new HemisphereLight(0xdfe8ff, 0x30323a, 1.15));
    scene.add(new AmbientLight(0xffffff, 0.25));
    const key = new DirectionalLight(0xffffff, 2.1);
    key.position.set(5, 12, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.far = 80;
    scene.add(key);

    const ground = new Mesh(new PlaneGeometry(400, 400), new ShadowMaterial({ opacity: 0.26 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -DIE_RADIUS;
    ground.receiveShadow = true;
    scene.add(ground);

    diceGroup = new Group();
    scene.add(diceGroup);
    camera = new PerspectiveCamera(26, width / height, 0.1, 400);
    return { renderer, scene, camera };
  }

  /** Frames the tray, not the roll: the dice never leave it, so this never moves. */
  function frame(trayRadius: number): void {
    const active = camera;
    if (!active) return;
    const vertical = (active.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * active.aspect);
    const distance = Math.max(
      (trayRadius + DIE_RADIUS) / Math.tan(Math.min(vertical, horizontal) / 2),
      8,
    );
    const angle = (CAMERA_ELEVATION * Math.PI) / 180;
    active.position.set(0, distance * Math.sin(angle), distance * Math.cos(angle));
    active.lookAt(0, 0, 0);
  }

  function clearDice(): void {
    if (!diceGroup) return;
    for (const child of [...diceGroup.children]) {
      diceGroup.remove(child);
      child.traverse((node) => {
        if (node instanceof Mesh) {
          const materials = Array.isArray(node.material) ? node.material : [node.material];
          for (const material of materials) material.dispose();
        }
      });
    }
  }

  function ownedMaterials(object: Object3D): MeshStandardMaterial[] {
    const owned = object.userData.ownedMaterials as MeshStandardMaterial[] | undefined;
    if (owned) return owned;
    const found: MeshStandardMaterial[] = [];
    object.traverse((node) => {
      if (node instanceof Mesh) {
        const materials = Array.isArray(node.material) ? node.material : [node.material];
        for (const material of materials) {
          if (material instanceof MeshStandardMaterial) found.push(material);
        }
      }
    });
    return found;
  }

  /** Builds a die's mesh with its remap already applied inside the collider. */
  async function buildDie(die: VisualDie, motion: PhysicsDie): Promise<DrawnDie | null> {
    const shape = die.shape;
    if (shape === undefined || !models || !hasCalibratedModel(models, shape)) return null;
    const url = models.urls[shape];
    const model = url ? await loadDieModel(url) : null;
    if (!model) return null;
    const object = instantiateDieModel(model);
    object.scale.multiplyScalar(DIE_RADIUS);
    const textureUrl =
      (die.role === "tens" ? models.tensTextureUrl : undefined) ?? models.textureUrls?.[shape];
    if (textureUrl) {
      const texture = await loadThemeTexture(textureUrl);
      if (texture) applyTexture(object, texture);
    }
    // The remap lives on a wrapper, so the body's own orientation can be set
    // from the recording each frame without disturbing it (ADR-0018).
    const wrapper = new Group();
    wrapper.add(object);
    object.quaternion.set(motion.remap[0], motion.remap[1], motion.remap[2], motion.remap[3]);
    object.traverse((node) => {
      if (node instanceof Mesh) node.castShadow = true;
    });
    const materials = ownedMaterials(object);
    return {
      object: wrapper,
      motion,
      kept: die.kept,
      materials,
      baseColors: materials.map((material) => material.color.clone()),
    };
  }

  /** Pushes a dropped die back without making it see-through. */
  function reveal(dice: readonly DrawnDie[], progress: number): void {
    const k = Math.min(Math.max(progress, 0), 1);
    for (const die of dice) {
      if (die.kept) continue;
      die.object.scale.setScalar(1 - 0.18 * k);
      die.materials.forEach((material, index) => {
        const base = die.baseColors[index];
        if (base) material.color.copy(base).lerp(new Color(0x2a2e38), 0.72 * k);
        material.needsUpdate = true;
      });
    }
  }

  function pose(die: DrawnDie, frameIndex: number): void {
    const frames = die.motion.frames;
    const clamped = Math.min(frames.length - 1, Math.max(0, frameIndex));
    const frame = frames[clamped];
    if (!frame) return;
    die.object.position.set(frame.position[0], frame.position[1], frame.position[2]);
    die.object.quaternion.set(
      frame.orientation[0],
      frame.orientation[1],
      frame.orientation[2],
      frame.orientation[3],
    );
  }

  /** Plays the recording. No physics runs here — this is an animation. */
  function play(
    dice: readonly DrawnDie[],
    frameRate: number,
    motion: "animate" | "reduce",
    signal: AbortSignalLike | undefined,
  ): Promise<void> {
    const active = renderer;
    const activeScene = scene;
    const activeCamera = camera;
    if (!active || !activeScene || !activeCamera) return Promise.resolve();
    const longest = Math.max(...dice.map((die) => die.motion.frames.length));

    if (motion === "reduce") {
      for (const die of dice) pose(die, longest);
      reveal(dice, 1);
      active.render(activeScene, activeCamera);
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const start = performance.now();
      let raf = 0;
      let onAbort: (() => void) | undefined;
      const finish = (error?: Error): void => {
        cancelAnimationFrame(raf);
        if (onAbort && signal) signal.removeEventListener("abort", onAbort);
        cancelActive = undefined;
        if (error) reject(error);
        else resolve();
      };
      cancelActive = () => finish(abortError());
      if (signal) {
        onAbort = () => finish(abortError());
        signal.addEventListener("abort", onAbort);
      }

      const step = (): void => {
        const elapsed = performance.now() - start;
        const frameIndex = Math.floor((elapsed / 1000) * frameRate);
        for (const die of dice) pose(die, frameIndex);
        const landed = elapsed >= ((longest - 1) / frameRate) * 1000;
        if (landed) {
          const after = elapsed - ((longest - 1) / frameRate) * 1000;
          reveal(dice, (after - REVEAL_HOLD_MS) / REVEAL_MS);
        }
        active.render(activeScene, activeCamera);
        if (landed && elapsed > ((longest - 1) / frameRate) * 1000 + REVEAL_HOLD_MS + REVEAL_MS) {
          finish();
          return;
        }
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
  }

  const capabilities: PresenterCapabilities = {
    implementation: "@diceforge-sdk/presenter-physics",
    kinds: ["roll", "coin-flip"],
    // Whatever this cannot roll, the delegate can still show.
    dieSides: "any",
    media: canRoll ? ["3d", "2d"] : delegate.capabilities.media,
    cancellable: true,
    announces,
    honorsReducedMotion: true,
  };

  return {
    capabilities,
    async present(event, presentOptions) {
      if (disposed) {
        throw new DiceForgeError("invalid-argument", "presenter has been disposed");
      }
      const record = validateEventRecord(event);
      const signal = presentOptions?.signal;
      const reduced =
        options.reducedMotion === "reduce" ||
        (options.reducedMotion !== "animate" &&
          prefersReduced(view as { matchMedia?: (q: string) => { matches: boolean } }));

      // A coin is a toss, not a tumble, and a die this cannot model is better
      // drawn than faked.
      const visuals = record.kind === "roll" ? visualDiceForEvent(record) : [];
      const rollable =
        canRoll &&
        record.kind === "roll" &&
        visuals.length > 0 &&
        visuals.every((die) => die.shape !== undefined);
      if (!rollable) {
        showPhysics(false);
        await delegate.present(record, signal ? { signal } : {});
        announcer?.announce(formatEventAnnouncement(record));
        return;
      }

      if (signal?.aborted) throw abortError();
      const motion = simulateRoll(
        visuals.map((die) => ({ shape: die.shape as ShapedDieSides, face: die.face })),
        {
          dieRadius: DIE_RADIUS,
          ...(options.random ? { random: options.random } : {}),
        },
      );

      ensureScene();
      const built = await Promise.all(
        visuals.map((die, index) => buildDie(die, motion.dice[index] as PhysicsDie)),
      );
      if (built.some((die) => die === null)) {
        showPhysics(false);
        await delegate.present(record, signal ? { signal } : {});
        announcer?.announce(formatEventAnnouncement(record));
        return;
      }
      const dice = built as DrawnDie[];

      cancelActive?.();
      clearDice();
      for (const die of dice) {
        diceGroup?.add(die.object);
        pose(die, 0);
      }
      frame(motion.trayRadius);
      showPhysics(true);

      await play(dice, motion.frameRate, reduced ? "reduce" : "animate", signal);
      announcer?.announce(formatEventAnnouncement(record));
    },
    dispose() {
      disposed = true;
      cancelActive?.();
      clearDice();
      renderer?.dispose();
      renderer?.domElement.remove();
      announcer?.dispose();
      delegate.dispose();
    },
  };
}
