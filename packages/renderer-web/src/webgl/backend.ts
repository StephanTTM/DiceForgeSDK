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
  Quaternion,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
} from "three";
import type { PresentContext, PresenterBackend, VisualDie } from "../backend.js";
import { restingSilhouette } from "../math/orientation.js";
import type { CoinModel, DieModelSet } from "../theme.js";
import { hasCalibratedModel } from "../theme.js";
import {
  applyTexture,
  instantiateDieModel,
  loadDieModel,
  loadThemeTexture,
  modelSilhouetteScale,
} from "./models.js";

export type WebglBackendOptions = {
  readonly container: HTMLElement;
  /** The theme's models. A shape without one is not drawn by this backend. */
  readonly models?: DieModelSet | undefined;
  /** The theme's coin. Without one, coin flips are not drawn by this backend. */
  readonly coin?: CoinModel | undefined;
};

const TUMBLE_PORTION = 0.62;
const BASE_DURATION_MS = 1000;
const STAGGER_MS = 80;
const SETTLE_TAIL_MS = 120;
/** Dropped dice stay indistinguishable until the whole roll has landed. */
const REVEAL_HOLD_MS = 220;
const REVEAL_MS = 420;
/** A coin rests, is tossed, and lands again — it never simply spins in place. */
const COIN_REST_MS = 200;
const COIN_FLIGHT_MS = 1050;
const COIN_HEIGHT = 4.2;
const FLIP_AXIS = new Vector3(1, 0, 0);
const DIE_SPACING = 2.4;
const DICE_PER_ROW = 6;
const DIE_RADIUS = 1.25;
/** Elevation of the camera above the table: near top-down reads the up face. */
const TOP_DOWN_ELEVATION = 80;
/** A d4 is read from its side, so an all-d4 roll gets a lower, angled view. */
const ANGLED_ELEVATION = 38;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function abortError(): Error {
  const error = new Error("presentation aborted");
  error.name = "AbortError";
  return error;
}

type FlipPlan = {
  readonly heads: Quaternion;
  readonly turns: number;
};

type DieEntry = {
  readonly object: Object3D;
  readonly finalOrientation: Quaternion;
  readonly flip?: FlipPlan;
  readonly restingPosition: Vector3;
  readonly baseScale: Vector3;
  readonly startQuaternion: Quaternion;
  readonly tumbleAxis: Vector3;
  readonly tumbleSpeed: number;
  readonly delayMs: number;
  readonly kept: boolean;
  /** Materials this scene owns and may recolor when revealing dropped dice. */
  readonly dimMaterials: readonly MeshStandardMaterial[];
  readonly baseColors: readonly Color[];
  handoff?: Quaternion;
};

function randomUnitVector(): Vector3 {
  const vector = new Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1);
  return vector.lengthSq() < 1e-6 ? new Vector3(0, 1, 0) : vector.normalize();
}

function layoutPosition(index: number, total: number): Vector3 {
  const rows = Math.ceil(total / DICE_PER_ROW);
  const row = Math.floor(index / DICE_PER_ROW);
  const inRow = Math.min(total - row * DICE_PER_ROW, DICE_PER_ROW);
  const column = index % DICE_PER_ROW;
  const x = (column - (inRow - 1) / 2) * DIE_SPACING;
  const z = (row - (rows - 1) / 2) * DIE_SPACING;
  return new Vector3(x, 0, z);
}

function ownedMaterials(object: Object3D): MeshStandardMaterial[] {
  const fromModel = object.userData.ownedMaterials as MeshStandardMaterial[] | undefined;
  if (fromModel) return fromModel;
  const collected: MeshStandardMaterial[] = [];
  object.traverse((child) => {
    if (child instanceof Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) {
        if (material instanceof MeshStandardMaterial) collected.push(material);
      }
    }
  });
  return collected;
}

/**
 * Pushes a dropped die into the background: it darkens and shrinks slightly,
 * staying fully opaque so the roll can still be read. Opacity is deliberately
 * untouched — a see-through die reveals its own back faces and reads as a
 * rendering glitch rather than as "this one does not count".
 * `progress` runs 0 (as rolled) to 1.
 */
function applyDropReveal(entry: DieEntry, progress: number): void {
  const k = easeOutCubic(clamp01(progress));
  entry.object.scale.copy(entry.baseScale).multiplyScalar(1 - 0.18 * k);
  entry.dimMaterials.forEach((material, index) => {
    const base = entry.baseColors[index];
    if (base) material.color.copy(base).lerp(new Color(0x2a2e38), 0.72 * k);
    material.needsUpdate = true;
  });
}

export function createWebglBackend(options: WebglBackendOptions): PresenterBackend {
  const { container, models, coin: coinModel } = options;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
  const width = container.clientWidth || 640;
  const height = container.clientHeight || 360;
  renderer.setSize(width, height);
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  renderer.domElement.dataset.diceforge = "webgl-presenter";
  container.append(renderer.domElement);

  const scene = new Scene();
  // A narrow field of view keeps the dice close to an orthographic projection.
  // A wide one magnifies whatever is nearest the lens, which is a die's top
  // face — so a d6, whose top face is most of its silhouette, would render
  // noticeably larger than a d20 sized to match it.
  const camera = new PerspectiveCamera(22, width / height, 0.1, 400);
  let elevationDeg = TOP_DOWN_ELEVATION;
  let framedRadius = DIE_RADIUS * 2;

  scene.add(new HemisphereLight(0xdfe8ff, 0x30323a, 1.15));
  scene.add(new AmbientLight(0xffffff, 0.25));
  const keyLight = new DirectionalLight(0xffffff, 2.1);
  keyLight.position.set(5, 12, 6);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.near = 1;
  keyLight.shadow.camera.far = 60;
  keyLight.shadow.camera.left = -16;
  keyLight.shadow.camera.right = 16;
  keyLight.shadow.camera.top = 16;
  keyLight.shadow.camera.bottom = -16;
  keyLight.shadow.bias = -0.0012;
  scene.add(keyLight);
  const rimLight = new DirectionalLight(0xa9c7ff, 0.7);
  rimLight.position.set(-6, 4, -7);
  scene.add(rimLight);

  // Catches a soft contact shadow so dice read as resting on a surface.
  const ground = new Mesh(new PlaneGeometry(120, 120), new ShadowMaterial({ opacity: 0.26 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -DIE_RADIUS;
  ground.receiveShadow = true;
  scene.add(ground);

  const diceGroup = new Group();
  scene.add(diceGroup);

  /** Places the camera so the whole layout fits, at the given elevation. */
  function frameCamera(): void {
    const vertical = (camera.fov * Math.PI) / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
    const fit = Math.min(vertical, horizontal);
    const distance = Math.max((framedRadius * 1.12) / Math.tan(fit / 2), 6.5);
    const angle = (elevationDeg * Math.PI) / 180;
    camera.position.set(0, distance * Math.sin(angle), distance * Math.cos(angle));
    camera.lookAt(0, 0, 0);
  }
  frameCamera();

  const handleResize = (): void => {
    const nextWidth = container.clientWidth || width;
    const nextHeight = container.clientHeight || height;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    frameCamera();
    renderer.setSize(nextWidth, nextHeight);
    renderer.render(scene, camera);
  };
  globalThis.addEventListener?.("resize", handleResize);

  let activeFrame = 0;
  let cancelActive: (() => void) | undefined;

  function clearDice(): void {
    for (const child of [...diceGroup.children]) {
      diceGroup.remove(child);
      // Model instances share cached geometry and textures with the loader;
      // dispose only what this scene created.
      child.traverse((node) => {
        if (!(node instanceof Mesh)) return;
        if (node.userData.ownsGeometry) node.geometry.dispose();
      });
      for (const material of ownedMaterials(child)) material.dispose();
    }
  }

  function animate(entries: readonly DieEntry[], context: PresentContext): Promise<void> {
    cancelActive?.();
    if (context.signal?.aborted) return Promise.reject(abortError());
    const settle = (entry: DieEntry): void => {
      entry.object.quaternion.copy(entry.finalOrientation);
      entry.object.position.copy(entry.restingPosition);
      if (!entry.kept) applyDropReveal(entry, 1);
    };
    if (context.motion === "reduce") {
      for (const entry of entries) settle(entry);
      renderer.render(scene, camera);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const started = performance.now();
      const tossing = entries.some((entry) => entry.flip);
      const landedAt = tossing
        ? COIN_REST_MS + COIN_FLIGHT_MS
        : BASE_DURATION_MS + STAGGER_MS * Math.max(0, entries.length - 1) + SETTLE_TAIL_MS;
      const hasDropped = entries.some((entry) => !entry.kept);
      const revealAt = landedAt + REVEAL_HOLD_MS;
      const endsAt = hasDropped ? revealAt + REVEAL_MS : landedAt;
      let onAbort: (() => void) | undefined;
      const finish = (error?: Error): void => {
        cancelAnimationFrame(activeFrame);
        cancelActive = undefined;
        if (onAbort && context.signal) context.signal.removeEventListener("abort", onAbort);
        if (error) reject(error);
        else resolve();
      };
      cancelActive = () => finish(abortError());
      if (context.signal) {
        onAbort = () => finish(abortError());
        context.signal.addEventListener("abort", onAbort);
      }
      const frame = (now: number): void => {
        const elapsed = now - started;
        for (const entry of entries) {
          if (entry.flip) {
            // Sits flat, is tossed, and drops back onto the same spot. The arc
            // starts and ends at the table, so the coin lands rather than
            // hanging in the air.
            const u = clamp01((elapsed - COIN_REST_MS) / COIN_FLIGHT_MS);
            const settleEase = u * u * (3 - 2 * u);
            entry.object.position.copy(entry.restingPosition);
            entry.object.position.y = entry.restingPosition.y + COIN_HEIGHT * Math.sin(Math.PI * u);
            const spin = new Quaternion().setFromAxisAngle(
              FLIP_AXIS,
              Math.PI * entry.flip.turns * settleEase,
            );
            entry.object.quaternion.copy(spin.multiply(entry.flip.heads));
            continue;
          }
          const local = clamp01((elapsed - entry.delayMs) / BASE_DURATION_MS);
          entry.object.position.copy(entry.restingPosition);
          entry.object.position.y = entry.restingPosition.y + 5 * (1 - easeOutCubic(local));
          if (local < TUMBLE_PORTION) {
            const spin = new Quaternion().setFromAxisAngle(
              entry.tumbleAxis,
              entry.tumbleSpeed * local,
            );
            entry.object.quaternion.copy(spin.multiply(entry.startQuaternion));
          } else {
            if (!entry.handoff) entry.handoff = entry.object.quaternion.clone();
            const t = easeOutCubic((local - TUMBLE_PORTION) / (1 - TUMBLE_PORTION));
            entry.object.quaternion.copy(entry.handoff.clone().slerp(entry.finalOrientation, t));
          }
          // Dropped dice look exactly like the rest until every die has landed.
          if (hasDropped && !entry.kept && elapsed > revealAt) {
            applyDropReveal(entry, (elapsed - revealAt) / REVEAL_MS);
          }
        }
        renderer.render(scene, camera);
        if (elapsed >= endsAt) {
          for (const entry of entries) settle(entry);
          renderer.render(scene, camera);
          finish();
          return;
        }
        activeFrame = requestAnimationFrame(frame);
      };
      activeFrame = requestAnimationFrame(frame);
    });
  }

  function toEntry(
    object: Object3D,
    finalOrientation: Quaternion,
    index: number,
    total: number,
    kept: boolean,
    flip?: FlipPlan,
  ): DieEntry {
    const restingPosition = layoutPosition(index, total);
    object.position.copy(restingPosition);
    object.traverse((node) => {
      if (node instanceof Mesh) node.castShadow = true;
    });
    diceGroup.add(object);
    const dimMaterials = kept ? [] : ownedMaterials(object);
    return {
      object,
      finalOrientation,
      ...(flip ? { flip } : {}),
      restingPosition,
      baseScale: object.scale.clone(),
      startQuaternion: new Quaternion().setFromAxisAngle(
        randomUnitVector(),
        Math.random() * Math.PI * 2,
      ),
      tumbleAxis: randomUnitVector(),
      tumbleSpeed: 9 + Math.random() * 5,
      delayMs: index * STAGGER_MS,
      kept,
      dimMaterials,
      baseColors: dimMaterials.map((material) => material.color.clone()),
    };
  }

  async function resolveDieObject(
    die: VisualDie,
  ): Promise<{ object: Object3D; final: Quaternion } | null> {
    if (!hasCalibratedModel(models, die.shape)) return null;
    const url = models.urls[die.shape];
    const tuple = models.faceRotations[die.shape]?.[die.face - 1];
    const model = url ? await loadDieModel(url) : null;
    if (!model || !tuple) return null;
    const object = instantiateDieModel(model);
    // Even the set out by what each model actually covers on screen, not by
    // its nominal size: bevelling eats into a sharp-cornered solid more
    // than a round one, so equal bounding boxes do not look equal.
    const poses = (models.faceRotations[die.shape] ?? []).map(
      (q) => new Quaternion(q[0], q[1], q[2], q[3]),
    );
    object.scale.multiplyScalar(
      modelSilhouetteScale(url ?? `d${die.shape}`, object, poses, restingSilhouette(20)),
    );
    const textureUrl =
      (die.role === "tens" ? models.tensTextureUrl : undefined) ?? models.textureUrls?.[die.shape];
    if (textureUrl) {
      const texture = await loadThemeTexture(textureUrl);
      if (texture) applyTexture(object, texture);
    }
    return { object, final: new Quaternion(tuple[0], tuple[1], tuple[2], tuple[3]) };
  }

  /** Themed coin model, or null when the theme has none. */
  async function resolveCoinObject(
    outcome: "heads" | "tails",
  ): Promise<{ object: Object3D; final: Quaternion } | null> {
    if (!coinModel) return null;
    const model = await loadDieModel(coinModel.url);
    if (!model) return null;
    const object = instantiateDieModel(model);
    for (const slot of ["heads", "tails", "rim"] as const) {
      const url = coinModel.textures?.[slot];
      if (!url) continue;
      const texture = await loadThemeTexture(url);
      // Material names come from the model, e.g. "forge_coin_heads".
      if (texture) applyTexture(object, texture, (name) => name.endsWith(slot));
    }
    const tuple = coinModel.rotations[outcome === "heads" ? 0 : 1];
    return { object, final: new Quaternion(tuple[0], tuple[1], tuple[2], tuple[3]) };
  }

  return {
    async presentDice(dice, context) {
      // Resolve models (network) before touching the scene so the previous
      // result stays visible until the new roll is ready to animate.
      const resolved = await Promise.all(dice.map((die) => resolveDieObject(die)));
      // A theme that cannot draw every die is not usable for this roll: the
      // presenter falls back wholesale rather than mixing art styles or, worse,
      // leaving a resolved die off the table.
      if (resolved.some((entry) => entry === null)) return false;
      clearDice();
      const entries = resolved.map((entry, index) =>
        toEntry(
          (entry as { object: Object3D }).object,
          (entry as { final: Quaternion }).final,
          index,
          dice.length,
          dice[index]?.kept ?? true,
        ),
      );
      // A d4 shows its value on the side, so only an all-d4 roll gets the low
      // angled view; anything else is read from above.
      elevationDeg = dice.every((die) => die.shape === 4) ? ANGLED_ELEVATION : TOP_DOWN_ELEVATION;
      framedRadius =
        entries.reduce(
          (max, entry) =>
            Math.max(max, Math.hypot(entry.restingPosition.x, entry.restingPosition.z)),
          0,
        ) + DIE_RADIUS;
      frameCamera();
      await animate(entries, context);
      return true;
    },
    async presentCoin(coin, context) {
      const themed = await resolveCoinObject(coin.outcome);
      if (!themed) return false;
      clearDice();
      // Start resting heads-up and choose the number of half turns by parity, so
      // the toss lands on the resolved face without correcting mid-air.
      const heads = new Quaternion(...(coinModel?.rotations[0] ?? [0, 0, 0, 1]));
      const wholeTurns = 4 + 2 * Math.floor(Math.random() * 2);
      const turns = coin.outcome === "heads" ? wholeTurns : wholeTurns + 1;
      elevationDeg = TOP_DOWN_ELEVATION;
      framedRadius = DIE_RADIUS;
      frameCamera();
      await animate([toEntry(themed.object, themed.final, 0, 1, true, { heads, turns })], context);
      return true;
    },
    setVisible(visible: boolean) {
      renderer.domElement.style.display = visible ? "block" : "none";
    },
    dispose() {
      cancelActive?.();
      globalThis.removeEventListener?.("resize", handleResize);
      clearDice();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
