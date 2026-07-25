import {
  AmbientLight,
  BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from "three";
import type { PresentContext, PresenterBackend, VisualCoin, VisualDie } from "../backend.js";
import { dieGeometry, dot, subtract } from "../math/geometry.js";
import { faceBasis, faceUpQuaternion } from "../math/orientation.js";
import type { DieModelSet } from "../theme.js";
import { hasCalibratedModel } from "../theme.js";
import { instantiateDieModel, loadDieModel } from "./models.js";

export type WebglBackendOptions = {
  readonly container: HTMLElement;
  readonly dieColor: string;
  readonly labelColor: string;
  /** Optional theme models; shapes without a calibrated model render procedurally. */
  readonly models?: DieModelSet | undefined;
};

const TUMBLE_PORTION = 0.6;
const BASE_DURATION_MS = 1100;
const STAGGER_MS = 90;
const DIE_SPACING = 2.6;
const DICE_PER_ROW = 6;

function easeOutCubic(t: number): number {
  return 1 - (1 - t) ** 3;
}

function abortError(): Error {
  const error = new Error("presentation aborted");
  error.name = "AbortError";
  return error;
}

function labelTexture(text: string, dieColor: string, labelColor: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = dieColor;
    ctx.fillRect(0, 0, 256, 256);
    ctx.fillStyle = labelColor;
    ctx.font = "bold 96px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 128, 128);
    if (text === "6" || text === "9") {
      // Underline distinguishes 6 from 9 on tumbling dice.
      ctx.fillRect(96, 196, 64, 10);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Builds a die mesh from the shared polyhedron data: one material group per
 * face, each mapped to a numbered canvas texture, with UVs projected onto the
 * face plane so labels sit centered on their faces.
 */
function buildDieMesh(die: VisualDie, dieColor: string, labelColor: string): Mesh {
  const data = dieGeometry(die.shape);
  const positions: number[] = [];
  const uvs: number[] = [];
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
    const uMin = Math.min(...projected.map((p) => p.u));
    const uMax = Math.max(...projected.map((p) => p.u));
    const vMin = Math.min(...projected.map((p) => p.v));
    const vMax = Math.max(...projected.map((p) => p.v));
    const span = Math.max(uMax - uMin, vMax - vMin) || 1;
    // Shrink toward the face center so the label stays inside the face.
    const toUv = (p: { u: number; v: number }): [number, number] => [
      0.5 + (0.7 * (p.u - (uMin + uMax) / 2)) / span,
      0.5 + (0.7 * (p.v - (vMin + vMax) / 2)) / span,
    ];
    const triangleCount = face.length - 2;
    for (let i = 0; i < triangleCount; i++) {
      for (const cornerIndex of [0, i + 1, i + 2]) {
        const corner = corners[cornerIndex];
        const uv = toUv(projected[cornerIndex] ?? { u: 0, v: 0 });
        if (corner) positions.push(...corner);
        uvs.push(...uv);
      }
    }
    geometry.addGroup(vertexCursor, triangleCount * 3, faceIndex);
    vertexCursor += triangleCount * 3;
  });
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  const materials = data.faces.map(
    (_, faceIndex) =>
      new MeshStandardMaterial({
        map: labelTexture(die.labels[faceIndex] ?? "", dieColor, labelColor),
        roughness: 0.4,
        metalness: 0.1,
        side: DoubleSide,
        transparent: !die.kept,
        opacity: die.kept ? 1 : 0.35,
      }),
  );
  return new Mesh(geometry, materials);
}

function buildCoinMesh(coin: VisualCoin, dieColor: string, labelColor: string): Mesh {
  const geometry = new CylinderGeometry(1.3, 1.3, 0.22, 48);
  const side = new MeshStandardMaterial({ color: dieColor, roughness: 0.35, metalness: 0.4 });
  const heads = new MeshStandardMaterial({
    map: labelTexture("H", dieColor, labelColor),
    roughness: 0.35,
    metalness: 0.4,
  });
  const tails = new MeshStandardMaterial({
    map: labelTexture("T", dieColor, labelColor),
    roughness: 0.35,
    metalness: 0.4,
  });
  // CylinderGeometry material order: side, top, bottom.
  const mesh = new Mesh(geometry, [side, heads, tails]);
  mesh.userData.finalOrientation =
    coin.outcome === "heads"
      ? new Quaternion()
      : new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI);
  return mesh;
}

/**
 * Final die orientation: the resolved face up, then yawed so its label reads
 * upright from the default camera position.
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

type AnimatedMesh = {
  readonly mesh: Object3D;
  readonly finalOrientation: Quaternion;
  readonly restingPosition: Vector3;
  readonly startQuaternion: Quaternion;
  readonly tumbleAxis: Vector3;
  readonly tumbleSpeed: number;
  readonly delayMs: number;
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

export function createWebglBackend(options: WebglBackendOptions): PresenterBackend {
  const { container, dieColor, labelColor } = options;
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
  const width = container.clientWidth || 640;
  const height = container.clientHeight || 360;
  renderer.setSize(width, height);
  renderer.domElement.dataset.diceforge = "webgl-presenter";
  container.append(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 8.5, 8.5);
  camera.lookAt(0, 0, 0);
  scene.add(new AmbientLight(0xffffff, 0.9));
  const keyLight = new DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(4, 9, 6);
  scene.add(keyLight);
  const diceGroup = new Group();
  scene.add(diceGroup);

  const handleResize = (): void => {
    const nextWidth = container.clientWidth || width;
    const nextHeight = container.clientHeight || height;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight);
    renderer.render(scene, camera);
  };
  globalThis.addEventListener?.("resize", handleResize);

  let activeFrame = 0;
  let cancelActive: (() => void) | undefined;

  function clearDice(): void {
    for (const child of [...diceGroup.children]) {
      diceGroup.remove(child);
      // Model instances share geometry/materials with the loader cache; only
      // dispose resources this scene owns (procedural meshes and the dimmed
      // material clones created for dropped dice).
      const dimmed = child.userData.disposeMaterials as Material[] | undefined;
      if (dimmed) {
        for (const material of dimmed) material.dispose();
        continue;
      }
      if (child instanceof Mesh) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        for (const material of materials) {
          if (material instanceof MeshStandardMaterial) material.map?.dispose();
          material.dispose();
        }
      }
    }
  }

  function animate(animated: readonly AnimatedMesh[], context: PresentContext): Promise<void> {
    cancelActive?.();
    if (context.signal?.aborted) return Promise.reject(abortError());
    if (context.motion === "reduce") {
      for (const entry of animated) {
        entry.mesh.quaternion.copy(entry.finalOrientation);
        entry.mesh.position.copy(entry.restingPosition);
      }
      renderer.render(scene, camera);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const started = performance.now();
      const totalMs = BASE_DURATION_MS + STAGGER_MS * Math.max(0, animated.length - 1) + 150;
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
        for (const entry of animated) {
          const local = Math.min(Math.max((elapsed - entry.delayMs) / BASE_DURATION_MS, 0), 1);
          entry.mesh.position.copy(entry.restingPosition);
          entry.mesh.position.y = entry.restingPosition.y + 5 * (1 - easeOutCubic(local));
          if (local < TUMBLE_PORTION) {
            const spin = new Quaternion().setFromAxisAngle(
              entry.tumbleAxis,
              entry.tumbleSpeed * local,
            );
            entry.mesh.quaternion.copy(spin.multiply(entry.startQuaternion));
          } else {
            if (!entry.handoff) entry.handoff = entry.mesh.quaternion.clone();
            const settle = easeOutCubic((local - TUMBLE_PORTION) / (1 - TUMBLE_PORTION));
            entry.mesh.quaternion.copy(entry.handoff.clone().slerp(entry.finalOrientation, settle));
          }
        }
        renderer.render(scene, camera);
        if (elapsed >= totalMs) {
          for (const entry of animated) {
            entry.mesh.quaternion.copy(entry.finalOrientation);
            entry.mesh.position.copy(entry.restingPosition);
          }
          renderer.render(scene, camera);
          finish();
          return;
        }
        activeFrame = requestAnimationFrame(frame);
      };
      activeFrame = requestAnimationFrame(frame);
    });
  }

  function toAnimated(mesh: Object3D, finalOrientation: Quaternion, index: number, total: number) {
    const restingPosition = layoutPosition(index, total);
    mesh.position.copy(restingPosition);
    diceGroup.add(mesh);
    return {
      mesh,
      finalOrientation,
      restingPosition,
      startQuaternion: new Quaternion().setFromAxisAngle(
        randomUnitVector(),
        Math.random() * Math.PI * 2,
      ),
      tumbleAxis: randomUnitVector(),
      tumbleSpeed: 9 + Math.random() * 5,
      delayMs: index * STAGGER_MS,
    } satisfies AnimatedMesh;
  }

  const { models } = options;

  async function resolveDieObject(
    die: VisualDie,
  ): Promise<{ object: Object3D; final: Quaternion }> {
    if (hasCalibratedModel(models, die.shape)) {
      const url = models.urls[die.shape];
      const tuple = models.faceRotations[die.shape]?.[die.face - 1];
      const model = url ? await loadDieModel(url) : null;
      if (model && tuple) {
        return {
          object: instantiateDieModel(model, die.kept),
          final: new Quaternion(tuple[0], tuple[1], tuple[2], tuple[3]),
        };
      }
    }
    return { object: buildDieMesh(die, dieColor, labelColor), final: finalDieOrientation(die) };
  }

  return {
    async presentDice(dice, context) {
      // Resolve models (network) before touching the scene so the previous
      // result stays visible until the new roll is ready to animate.
      const resolved = await Promise.all(dice.map((die) => resolveDieObject(die)));
      clearDice();
      const animated = resolved.map((entry, index) =>
        toAnimated(entry.object, entry.final, index, dice.length),
      );
      return animate(animated, context);
    },
    presentCoin(coin, context) {
      clearDice();
      const mesh = buildCoinMesh(coin, dieColor, labelColor);
      const finalOrientation = mesh.userData.finalOrientation as Quaternion;
      return animate([toAnimated(mesh, finalOrientation, 0, 1)], context);
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
