// Maintainer tooling, not part of the SDK's public surface.
//
//   ?preview=1  render one roll through the real presenter and expose the
//               frame, which is what the visual regression suite captures
//   ?forge=d20  check a shipped model against its exported rotation table
//
// Both modes publish their result on `window.__diceforge` once ready, so a
// script can wait for it rather than guessing at timings.

import type { ForgeShape } from "@diceforge-sdk/assets-forge";
import {
  FORGE_COIN_URL,
  FORGE_FACE_ROTATIONS_URL,
  FORGE_MODEL_URLS,
  forgeAssets,
} from "@diceforge-sdk/assets-forge";
import { createDiceEngine, createSeededRandomSource } from "@diceforge-sdk/core";
import { createDicePresenter, type ForgeColor, forgeTheme } from "@diceforge-sdk/renderer-web";
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
const CELL = Number(params.get("cell") ?? "150");
const COLS = 5;

type Result = Record<string, unknown> & { dataUrl: string | null };

function publish(result: Result): void {
  (window as { __diceforge?: Result }).__diceforge = result;
  console.log("diceforge devtools ready");
}

/**
 * Renders one roll through the real presenter and captures the canvas. Reduced
 * motion makes the presenter draw synchronously, which is what allows the frame
 * to be read back before the browser clears the drawing buffer.
 */
async function preview(): Promise<void> {
  const host = document.querySelector("#out");
  if (!host) throw new Error("no #out");
  const stage = document.createElement("div");
  stage.style.width = `${Number(params.get("w") ?? "760")}px`;
  stage.style.height = `${Number(params.get("h") ?? "420")}px`;
  host.append(stage);

  const forgeColor = params.get("theme") as ForgeColor | null;
  const presenter = createDicePresenter({
    container: stage,
    renderMode: (params.get("render") ?? "webgl") as "auto" | "webgl" | "dom",
    reducedMotion: "reduce",
    ...(forgeColor ? { theme: forgeTheme(forgeAssets({ color: forgeColor })) } : {}),
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
  publish({
    mode: presenter.mode,
    expression: event.kind === "roll" ? event.expression : "coin",
    dice:
      event.kind === "roll"
        ? event.groups.flatMap((g) => g.dice.map((d) => `${d.value}${d.kept ? "" : " (dropped)"}`))
        : [event.outcome],
    // PNG keeps the alpha channel, so a die's exact silhouette is measurable.
    dataUrl: canvas?.toDataURL("image/png") ?? null,
  });
}

/** Clusters a mesh's triangles into its real faces by normal, largest first. */
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
  clusters.sort((x, y) => y.area - x.area);
  return clusters.slice(0, expected).map((cluster) => cluster.sum.clone().normalize());
}

/**
 * Checks a generated model against its exported rotation table: every value
 * must bring a different face to the top, and together they must cover every
 * face exactly once. This validates the shipped .glb rather than trusting the
 * generator's arithmetic.
 */
async function forgeCheck(): Promise<void> {
  const name = params.get("forge") ?? "d20";
  const manifest = await (await fetch(FORGE_FACE_ROTATIONS_URL)).json();
  const entry = manifest[name];
  const url =
    name === "coin" ? FORGE_COIN_URL : FORGE_MODEL_URLS[Number(name.slice(1)) as ForgeShape];
  if (!url) throw new Error(`no model for ${name}`);
  const gltf = await new GLTFLoader().loadAsync(url);
  const model = gltf.scene;
  const box = new Box3().setFromObject(model);
  const size = box.getSize(new Vector3());
  const centre = box.getCenter(new Vector3());
  const wrapper = new Group();
  model.position.sub(centre);
  wrapper.add(model);
  wrapper.scale.setScalar(2.1 / Math.max(size.x, size.y, size.z));

  const faceCount = entry.faces as number;
  // Bevels add small chamfer faces; keep only the largest clusters.
  const normals = faceClusters(wrapper, faceCount);
  const rotations = entry.rotations as number[][];
  const winners = rotations.map((q) => {
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
    return best;
  });

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
  sheet.width = COLS * CELL;
  sheet.height = Math.ceil(rotations.length / COLS) * CELL;
  const ctx = sheet.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#dddddd";
    ctx.fillRect(0, 0, sheet.width, sheet.height);
    rotations.forEach((q, index) => {
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
  publish({
    forge: name,
    faces: faceCount,
    clusters: normals.length,
    distinctTopFaces: new Set(winners).size,
    pass: new Set(winners).size === faceCount && normals.length === faceCount,
    dataUrl: sheet.toDataURL("image/png"),
  });
}

void (params.get("forge") ? forgeCheck() : preview());
