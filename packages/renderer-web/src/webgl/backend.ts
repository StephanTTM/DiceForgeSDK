import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Float32BufferAttribute,
  FrontSide,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  type Object3D,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type { PresentContext, PresenterBackend, VisualCoin, VisualDie } from "../backend.js";
import { dieGeometry, dot, subtract } from "../math/geometry.js";
import { faceBasis, faceTriangles, faceUpQuaternion } from "../math/orientation.js";
import type { CoinModel, DieModelSet } from "../theme.js";
import { hasCalibratedModel } from "../theme.js";
import { applyTexture, instantiateDieModel, loadDieModel, loadThemeTexture } from "./models.js";

export type WebglBackendOptions = {
  readonly container: HTMLElement;
  readonly dieColor: string;
  readonly labelColor: string;
  /** Optional theme models; shapes without a calibrated model render procedurally. */
  readonly models?: DieModelSet | undefined;
  /** Optional themed coin; without one the built-in cylinder is used. */
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

const textureCache = new Map<string, CanvasTexture>();

/**
 * Numeral on a die face. Textures are cached across dice and never disposed:
 * the set of labels is small and bounded, and sharing keeps a 20-face die from
 * allocating twenty canvases per roll.
 */
function labelTexture(
  text: string,
  dieColor: string,
  labelColor: string,
  fit: number,
): CanvasTexture {
  const key = `${text}|${dieColor}|${labelColor}|${fit.toFixed(2)}`;
  const cached = textureCache.get(key);
  if (cached) return cached;
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    // Soft vertical gradient reads as a curved, moulded face rather than a decal.
    const base = new Color(dieColor);
    const light = base.clone().lerp(new Color("#ffffff"), 0.1);
    const dark = base.clone().lerp(new Color("#000000"), 0.12);
    const gradient = ctx.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, `#${light.getHexString()}`);
    gradient.addColorStop(1, `#${dark.getHexString()}`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);

    const centre = size / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    // UVs map a face's corner distance to 0.5, so its inscribed circle has
    // radius `0.5 * fit`. Keep the numeral inside that circle: triangles get a
    // smaller numeral than squares, and it never spills over an edge.
    const room = size * fit;
    const fontSize = text.length > 1 ? room * 0.6 : room * 0.85;
    ctx.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillStyle = labelColor;
    ctx.fillText(text, centre, centre);
    if (text === "6" || text === "9") {
      ctx.fillRect(
        centre - fontSize * 0.28,
        centre + fontSize * 0.44,
        fontSize * 0.56,
        size * 0.02,
      );
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  textureCache.set(key, texture);
  return texture;
}

function dieMaterial(map: CanvasTexture): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    map,
    roughness: 0.42,
    metalness: 0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.35,
    // Faces are wound outward, so back faces can be culled: a die is a closed
    // solid and should never show its own interior.
    side: FrontSide,
  });
}

/**
 * Builds a die mesh from the shared polyhedron data: one material group per
 * face, each mapped to a numbered texture, with UVs projected onto the face
 * plane so labels sit centered on their faces.
 */
type Point2 = { u: number; v: number };

/** Distance from a point to a line segment, used to find a face's inradius. */
function distanceToEdge(point: Point2, a: Point2, b: Point2): number {
  const edgeU = b.u - a.u;
  const edgeV = b.v - a.v;
  const lengthSq = edgeU * edgeU + edgeV * edgeV;
  const t =
    lengthSq === 0
      ? 0
      : Math.min(1, Math.max(0, ((point.u - a.u) * edgeU + (point.v - a.v) * edgeV) / lengthSq));
  return Math.hypot(a.u + t * edgeU - point.u, a.v + t * edgeV - point.v);
}

function buildDieMesh(die: VisualDie, dieColor: string, labelColor: string): Mesh {
  const data = dieGeometry(die.shape);
  const positions: number[] = [];
  const uvs: number[] = [];
  const fits: number[] = [];
  const geometry = new BufferGeometry();
  let vertexCursor = 0;
  data.faces.forEach((face, faceIndex) => {
    const basis = faceBasis(data, faceIndex);
    const corners = face.map((vertexIndex) => data.vertices[vertexIndex]);
    const origin = corners[0];
    if (!origin || corners.some((corner) => corner === undefined)) return;
    const projected = corners.map((corner) => {
      const offset = subtract(corner as [number, number, number], origin);
      return { u: dot(offset, basis.u), v: dot(offset, basis.v) };
    });
    // Centre on the polygon's centroid, not its bounding box: on a triangle
    // those differ, and the numeral would drift off the face.
    const centroid: Point2 = {
      u: projected.reduce((sum, p) => sum + p.u, 0) / projected.length,
      v: projected.reduce((sum, p) => sum + p.v, 0) / projected.length,
    };
    const radius =
      Math.max(...projected.map((p) => Math.hypot(p.u - centroid.u, p.v - centroid.v))) || 1;
    const inradius = Math.min(
      ...projected.map((p, index) =>
        distanceToEdge(centroid, p, projected[(index + 1) % projected.length] ?? p),
      ),
    );
    fits[faceIndex] = Math.min(1, Math.max(0.25, inradius / radius));
    const toUv = (p: Point2): [number, number] => [
      0.5 + (0.5 * (p.u - centroid.u)) / radius,
      0.5 + (0.5 * (p.v - centroid.v)) / radius,
    ];
    // Look corners up by vertex index, since triangles come back wound outward
    // rather than in the polygon's original corner order.
    const byVertex = new Map(face.map((vertexIndex, corner) => [vertexIndex, corner]));
    const triangles = faceTriangles(data, faceIndex);
    for (const triangle of triangles) {
      for (const vertexIndex of triangle) {
        const corner = byVertex.get(vertexIndex) ?? 0;
        const position = corners[corner];
        const uv = toUv(projected[corner] ?? centroid);
        if (position) positions.push(...position);
        uvs.push(...uv);
      }
    }
    geometry.addGroup(vertexCursor, triangles.length * 3, faceIndex);
    vertexCursor += triangles.length * 3;
  });
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const materials = data.faces.map((_, faceIndex) =>
    dieMaterial(
      labelTexture(die.labels[faceIndex] ?? "", dieColor, labelColor, fits[faceIndex] ?? 0.7),
    ),
  );
  const mesh = new Mesh(geometry, materials);
  mesh.castShadow = true;
  mesh.userData.ownsGeometry = true;
  return mesh;
}

function buildCoinMesh(coin: VisualCoin, dieColor: string, labelColor: string): Mesh {
  const geometry = new CylinderGeometry(1.3, 1.3, 0.22, 48);
  const rim = new MeshPhysicalMaterial({
    color: dieColor,
    roughness: 0.35,
    metalness: 0.35,
    clearcoat: 0.5,
  });
  const heads = dieMaterial(labelTexture("H", dieColor, labelColor, 0.7));
  const tails = dieMaterial(labelTexture("T", dieColor, labelColor, 0.7));
  // CylinderGeometry material order: side, top, bottom.
  const mesh = new Mesh(geometry, [rim, heads, tails]);
  mesh.castShadow = true;
  mesh.userData.ownsGeometry = true;
  mesh.userData.finalOrientation =
    coin.outcome === "heads"
      ? new Quaternion()
      : new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
  return mesh;
}

/**
 * Final die orientation: the resolved face up, then yawed so its label reads
 * upright from the camera.
 */
function finalDieOrientation(die: VisualDie): Quaternion {
  const upright = faceUpQuaternion(die.shape, die.face);
  const basis = faceBasis(dieGeometry(die.shape), die.face - 1);
  const labelUp = new Vector3(...basis.v).applyQuaternion(upright);
  labelUp.y = 0;
  if (labelUp.lengthSq() < 1e-9) return upright;
  labelUp.normalize();
  // Rotate the label's up direction to point away from the camera (-Z).
  const yaw = Math.atan2(labelUp.x, labelUp.z) - Math.PI;
  return new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), yaw).multiply(upright);
}

/**
 * A coin toss instead of a die tumble: the coin sits flat, is thrown, spins end
 * over end, and comes down on its result. `turns` counts half turns, so its
 * parity decides which face is up when the arc ends.
 */
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
  const { container, dieColor, labelColor, models, coin: coinModel } = options;
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
  const camera = new PerspectiveCamera(42, width / height, 0.1, 200);
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
  ): Promise<{ object: Object3D; final: Quaternion }> {
    if (hasCalibratedModel(models, die.shape)) {
      const url = models.urls[die.shape];
      const tuple = models.faceRotations[die.shape]?.[die.face - 1];
      const model = url ? await loadDieModel(url) : null;
      if (model && tuple) {
        const object = instantiateDieModel(model);
        const textureUrl = models.textureUrls?.[die.shape];
        if (textureUrl) {
          const texture = await loadThemeTexture(textureUrl);
          if (texture) applyTexture(object, texture);
        }
        return { object, final: new Quaternion(tuple[0], tuple[1], tuple[2], tuple[3]) };
      }
    }
    return { object: buildDieMesh(die, dieColor, labelColor), final: finalDieOrientation(die) };
  }

  /** Themed coin model, or null to fall back to the built-in cylinder. */
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
      clearDice();
      const entries = resolved.map((entry, index) =>
        toEntry(entry.object, entry.final, index, dice.length, dice[index]?.kept ?? true),
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
      return animate(entries, context);
    },
    async presentCoin(coin, context) {
      const themed = await resolveCoinObject(coin.outcome);
      clearDice();
      const mesh = themed?.object ?? buildCoinMesh(coin, dieColor, labelColor);
      const finalOrientation = themed?.final ?? (mesh.userData.finalOrientation as Quaternion);
      // Start resting heads-up and choose the number of half turns by parity, so
      // the toss lands on the resolved face without correcting mid-air.
      const heads = themed
        ? new Quaternion(...(coinModel?.rotations[0] ?? [0, 0, 0, 1]))
        : new Quaternion();
      const wholeTurns = 4 + 2 * Math.floor(Math.random() * 2);
      const turns = coin.outcome === "heads" ? wholeTurns : wholeTurns + 1;
      elevationDeg = TOP_DOWN_ELEVATION;
      framedRadius = DIE_RADIUS;
      frameCamera();
      return animate([toEntry(mesh, finalOrientation, 0, 1, true, { heads, turns })], context);
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
