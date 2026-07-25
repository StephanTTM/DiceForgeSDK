import { Box3, Group, type Material, Mesh, type Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Largest dimension of a normalized die model, matching the procedural dice. */
const TARGET_SIZE = 2.1;

const cache = new Map<string, Promise<Object3D | null>>();

/**
 * Loads and normalizes a die model: recentered on the origin and uniformly
 * scaled so themes and procedural dice share one coordinate system (the
 * calibrated face rotations assume this normalization). Resolves null on any
 * failure so callers can fall back to procedural dice — a broken asset must
 * never break presentation.
 */
export function loadDieModel(url: string): Promise<Object3D | null> {
  let pending = cache.get(url);
  if (!pending) {
    pending = new GLTFLoader()
      .loadAsync(url)
      .then((gltf) => {
        const model = gltf.scene;
        const box = new Box3().setFromObject(model);
        const size = box.getSize(new Vector3());
        const center = box.getCenter(new Vector3());
        const scale = TARGET_SIZE / Math.max(size.x, size.y, size.z, 1e-6);
        const wrapper = new Group();
        model.position.sub(center);
        wrapper.add(model);
        wrapper.scale.setScalar(scale);
        return wrapper as Object3D;
      })
      .catch(() => null);
    cache.set(url, pending);
  }
  return pending;
}

/**
 * Clones a normalized model for one presentation. Materials are cloned so the
 * dropped-die dimming never leaks into the cached original.
 */
export function instantiateDieModel(model: Object3D, kept: boolean): Object3D {
  const instance = model.clone(true);
  if (!kept) {
    const clones: Material[] = [];
    instance.traverse((child) => {
      if (child instanceof Mesh) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        const dimmed = materials.map((material: Material) => {
          const copy = material.clone();
          copy.transparent = true;
          copy.opacity = 0.35;
          clones.push(copy);
          return copy;
        });
        child.material = Array.isArray(child.material) ? dimmed : (dimmed[0] ?? child.material);
      }
    });
    // The scene disposes these clones on clear; cached originals stay intact.
    instance.userData.disposeMaterials = clones;
  }
  return instance;
}
