import { Box3, Group, type Material, Mesh, type Object3D, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import { DIE_SIZE } from "../math/geometry.js";

/** Largest dimension of a normalized die model, matching the procedural dice. */
const TARGET_SIZE = DIE_SIZE;

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
 * Clones a normalized model for one presentation. When the die may later be
 * dimmed (a dropped die), its materials are cloned up front and exposed on
 * `userData.dimMaterials` so recoloring never leaks into the cached original.
 * The clone starts identical to a kept die: the reveal happens after landing.
 */
export function instantiateDieModel(model: Object3D, dimmable: boolean): Object3D {
  const instance = model.clone(true);
  if (!dimmable) return instance;
  const clones: Material[] = [];
  instance.traverse((child) => {
    if (child instanceof Mesh) {
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      const copies = materials.map((material: Material) => {
        const copy = material.clone();
        clones.push(copy);
        return copy;
      });
      child.material = Array.isArray(child.material) ? copies : (copies[0] ?? child.material);
    }
  });
  // The scene disposes these clones on clear; cached originals stay intact.
  instance.userData.dimMaterials = clones;
  return instance;
}
