// Maintainer-only calibration tool. Deliberately self-contained (its own
// three.js usage, no renderer-web imports) so it can be deleted without
// touching the public API. See packages/renderer-web/src/theme.ts for where
// the calibrated tables live.

import { createDiceEngine, createSeededRandomSource } from "@diceforge-sdk/core";
import {
  createDicePresenter,
  type ForgeColor,
  forgeTheme,
  KAYKIT_FACE_ROTATIONS,
  KAYKIT_PIP_D6_ROTATIONS,
  type KayKitColor,
  type KayKitD6Style,
  kayKitTheme,
} from "@diceforge-sdk/renderer-web";
import {
  AmbientLight,
  Box3,
  type BufferAttribute,
  DirectionalLight,
  Group,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

const params = new URLSearchParams(location.search);
const shape = Number(params.get("shape") ?? "20");
const color = params.get("color") ?? "red";
const mode = params.get("mode") ?? "face";
const d6 = params.get("d6") ?? "C";
const fileName = shape === 6 ? `D6_${d6}_${color}.gltf` : `D${shape}_${color}.gltf`;

const CELL = Number(params.get("cell") ?? "150");
const COLS = 5;

function faceClusters(root: Object3D, expected: number): Vector3[] {
  root.updateMatrixWorld(true);
  const clusters: { sum: Vector3; area: number }[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const position = obj.geometry.getAttribute("position") as BufferAttribute;
    const index = obj.geometry.getIndex();
    const a = new Vector3();
    const b = new Vector3();
    const c = new Vector3();
    const triangles = (index ? index.count : position.count) / 3;
    for (let t = 0; t < triangles; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(position, i0).applyMatrix4(obj.matrixWorld);
      b.fromBufferAttribute(position, i1).applyMatrix4(obj.matrixWorld);
      c.fromBufferAttribute(position, i2).applyMatrix4(obj.matrixWorld);
      const crossProduct = b.clone().sub(a).cross(c.clone().sub(a));
      const area = crossProduct.length() / 2;
      if (area < 1e-8) continue;
      const normal = crossProduct.normalize();
      let cluster = clusters.find(
        (candidate) => candidate.sum.clone().normalize().dot(normal) > 0.985,
      );
      if (!cluster) {
        cluster = { sum: new Vector3(), area: 0 };
        clusters.push(cluster);
      }
      cluster.sum.add(normal.clone().multiplyScalar(area));
      cluster.area += area;
    }
  });
  console.log(`clusters found: ${clusters.length} (expected ${expected})`);
  clusters.sort((x, y) => y.area - x.area);
  const top = clusters.slice(0, expected).map((cluster) => cluster.sum.clone().normalize());
  top.sort(
    (p, q) =>
      Math.round(p.x * 100) - Math.round(q.x * 100) ||
      Math.round(p.y * 100) - Math.round(q.y * 100) ||
      Math.round(p.z * 100) - Math.round(q.z * 100),
  );
  return top;
}

/** d4 fallback: orientations that put each apex up (apex-numbered dice). */
function vertexDirections(root: Object3D, expected: number): Vector3[] {
  root.updateMatrixWorld(true);
  const directions: { sum: Vector3; count: number }[] = [];
  root.traverse((obj) => {
    if (!(obj instanceof Mesh)) return;
    const position = obj.geometry.getAttribute("position") as BufferAttribute;
    const vertex = new Vector3();
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(obj.matrixWorld);
      if (vertex.length() < 1e-6) continue;
      const normal = vertex.clone().normalize();
      let bucket = directions.find(
        (candidate) => candidate.sum.clone().normalize().dot(normal) > 0.99,
      );
      if (!bucket) {
        bucket = { sum: new Vector3(), count: 0 };
        directions.push(bucket);
      }
      bucket.sum.add(normal);
      bucket.count += 1;
    }
  });
  directions.sort((x, y) => y.count - x.count);
  const top = directions.slice(0, expected).map((bucket) => bucket.sum.clone().normalize());
  top.sort(
    (p, q) =>
      Math.round(p.x * 100) - Math.round(q.x * 100) ||
      Math.round(p.y * 100) - Math.round(q.y * 100) ||
      Math.round(p.z * 100) - Math.round(q.z * 100),
  );
  return top;
}

/**
 * Renders one roll through the real presenter and captures the canvas, so the
 * shipped look can be reviewed without watching the demo by hand. Reduced
 * motion makes the presenter draw synchronously, which is what lets the frame
 * be read back.
 */
async function preview(): Promise<void> {
  const host = document.querySelector("#out");
  if (!host) throw new Error("no #out");
  const stage = document.createElement("div");
  stage.style.width = `${Number(params.get("w") ?? "760")}px`;
  stage.style.height = `${Number(params.get("h") ?? "420")}px`;
  host.append(stage);

  const themeColor = params.get("theme") as KayKitColor | null;
  const forgeColor = params.get("forgeTheme") as ForgeColor | null;
  const theme = forgeColor
    ? forgeTheme({ baseUrl: "/forge", color: forgeColor })
    : themeColor
      ? kayKitTheme({
          baseUrl: "/",
          color: themeColor,
          d6Style: (params.get("d6style") ?? "numerals") as KayKitD6Style,
        })
      : undefined;
  const presenter = createDicePresenter({
    container: stage,
    renderMode: "webgl",
    reducedMotion: "reduce",
    ...(theme ? { theme } : {}),
  });
  const engine = createDiceEngine({
    random: createSeededRandomSource(params.get("seed") ?? "table-42"),
  });
  const event =
    params.get("flip") === "1"
      ? engine.flipCoin()
      : engine.roll(params.get("notation") ?? "4d6dl1");
  await presenter.present(event);
  const canvas = stage.querySelector("canvas");
  (window as { __calibration?: unknown }).__calibration = {
    preview: true,
    expression: event.kind === "roll" ? event.expression : "coin",
    dice:
      event.kind === "roll"
        ? event.groups.flatMap((g) => g.dice.map((d) => `${d.value}${d.kept ? "" : " (dropped)"}`))
        : [event.outcome],
    total: event.kind === "roll" ? event.total : 0,
    count: 0,
    // Read back immediately: the drawing buffer is cleared once composited.
    dataUrl: canvas?.toDataURL("image/jpeg", 0.88) ?? null,
  };
  console.log("preview ready");
}

/**
 * Checks a generated DiceForge model against its exported rotation table: for
 * every value, the table must bring a different face to the top, and together
 * they must cover every face exactly once. This validates the shipped .glb
 * rather than trusting the generator's arithmetic.
 */
async function forgeCheck(): Promise<void> {
  const name = params.get("forge") ?? "d20";
  const manifest = await (await fetch("/forge/face-rotations.json")).json();
  const entry = manifest[name];
  const gltf = await new GLTFLoader().loadAsync(`/forge/${name}.glb`);
  const model = gltf.scene;
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const wrapper = new Group();
  model.position.sub(centre);
  wrapper.add(model);
  wrapper.scale.setScalar(2.1 / Math.max(size.x, size.y, size.z));

  const faceCount = entry.faces as number;
  // Bevels add small chamfer faces; keep only the largest clusters, which are
  // the real die faces.
  const normals = faceClusters(wrapper, faceCount);
  const winners: number[] = [];
  for (const q of entry.rotations as number[][]) {
    const quaternion = new Quaternion(q[0], q[1], q[2], q[3]);
    let best = -1;
    let bestY = Number.NEGATIVE_INFINITY;
    normals.forEach((normal, index) => {
      const y = normal.clone().applyQuaternion(quaternion).y;
      if (y > bestY) {
        bestY = y;
        best = index;
      }
    });
    winners.push(best);
  }
  const unique = new Set(winners);
  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.3));
  const light = new DirectionalLight(0xffffff, 1.7);
  light.position.set(2, 8, 3);
  scene.add(light);
  scene.add(wrapper);
  const camera = new PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 6.5, 0.75);
  camera.lookAt(0, 0, 0);
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(CELL, CELL);
  const sheet = document.createElement("canvas");
  const rows = Math.ceil((entry.rotations as number[][]).length / COLS);
  sheet.width = COLS * CELL;
  sheet.height = rows * CELL;
  const ctx = sheet.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#dddddd";
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    (entry.rotations as number[][]).forEach((q, index) => {
      wrapper.quaternion.set(q[0] ?? 0, q[1] ?? 0, q[2] ?? 0, q[3] ?? 1);
      renderer.render(scene, camera);
      const x = (index % COLS) * CELL;
      const y = Math.floor(index / COLS) * CELL;
      ctx.drawImage(renderer.domElement, x, y, CELL, CELL);
      ctx.fillStyle = "#c22";
      ctx.font = "bold 16px system-ui";
      ctx.fillText(`v${index + 1} → face ${winners[index]}`, x + 6, y + 18);
      ctx.strokeStyle = "#999";
      ctx.strokeRect(x, y, CELL, CELL);
    });
    document.querySelector("#out")?.append(sheet);
  }
  (window as { __calibration?: unknown }).__calibration = {
    forge: name,
    faces: faceCount,
    clusters: normals.length,
    distinctTopFaces: unique.size,
    pass: unique.size === faceCount && normals.length === faceCount,
    dataUrl: sheet.toDataURL("image/jpeg", 0.86),
    count: 0,
  };
  console.log("forge check ready");
}

async function main(): Promise<void> {
  if (params.get("forge")) return forgeCheck();
  if (params.get("preview") === "1") return preview();
  const gltf = await new GLTFLoader().loadAsync(`/${fileName}`);
  const model = gltf.scene;
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const center = box.getCenter(new Vector3());
  const wrapper = new Group();
  model.position.sub(center);
  wrapper.add(model);
  wrapper.scale.setScalar(2.1 / Math.max(size.x, size.y, size.z));

  const up = new Vector3(0, 1, 0);
  // verify=1 renders straight from the shipped table in value order, so cell #k
  // must show face value k + 1. That is the proof the table is correct.
  const verify = params.get("verify") === "1";
  // values=3,1,6,2 renders just those faces, in order — used to picture a real
  // resolved roll with the shipped table.
  const values = (params.get("values") ?? "")
    .split(",")
    .filter(Boolean)
    .map((entry) => Number(entry));
  const source =
    shape === 6 && d6 !== "C"
      ? KAYKIT_PIP_D6_ROTATIONS
      : (KAYKIT_FACE_ROTATIONS[shape as 4 | 6 | 8 | 20] ?? []);
  const table = source.map((q) => new Quaternion(q[0], q[1], q[2], q[3]));
  const quaternions = values.length
    ? values.map((value) => table[value - 1] ?? new Quaternion())
    : verify
      ? table
      : (mode === "vertex" ? vertexDirections(wrapper, shape) : faceClusters(wrapper, shape)).map(
          (normal) => new Quaternion().setFromUnitVectors(normal, up),
        );

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.4));
  const light = new DirectionalLight(0xffffff, 1.6);
  light.position.set(2, 8, 3);
  scene.add(light);
  scene.add(wrapper);
  const camera = new PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 6.5, 0.75);
  camera.lookAt(0, 0, 0);

  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(CELL, CELL);

  const sheet = document.createElement("canvas");
  const rows = Math.ceil(quaternions.length / COLS);
  sheet.width = COLS * CELL;
  sheet.height = rows * CELL;
  const ctx = sheet.getContext("2d");
  if (!ctx) throw new Error("no 2d context");
  ctx.fillStyle = "#dddddd";
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  quaternions.forEach((quaternion, cellIndex) => {
    wrapper.quaternion.copy(quaternion);
    renderer.render(scene, camera);
    const x = (cellIndex % COLS) * CELL;
    const y = Math.floor(cellIndex / COLS) * CELL;
    ctx.drawImage(renderer.domElement, x, y, CELL, CELL);
    ctx.fillStyle = "#c22";
    ctx.font = "bold 18px system-ui";
    const label = values.length
      ? `rolled ${values[cellIndex]}`
      : verify
        ? `expect ${cellIndex + 1}`
        : `#${cellIndex}`;
    ctx.fillText(label, x + 6, y + 20);
    ctx.strokeStyle = "#999";
    ctx.strokeRect(x, y, CELL, CELL);
  });

  document.querySelector("#out")?.append(sheet);
  (window as { __calibration?: unknown }).__calibration = {
    shape,
    fileName,
    mode,
    count: quaternions.length,
    quaternions: quaternions.map((q) => [q.x, q.y, q.z, q.w]),
    dataUrl: sheet.toDataURL("image/png"),
  };
  console.log("calibration ready");
}

void main();
