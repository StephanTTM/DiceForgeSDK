import {
  Box3,
  Group,
  type Material,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  SRGBColorSpace,
  type Texture,
  TextureLoader,
  Vector3,
} from "three";
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

const textureCache = new Map<string, Promise<Texture | null>>();

/**
 * Loads a theme texture. Resolves null on failure so a missing atlas leaves the
 * model's own material intact rather than breaking the presentation.
 */
export function loadThemeTexture(url: string): Promise<Texture | null> {
  let pending = textureCache.get(url);
  if (!pending) {
    pending = new TextureLoader()
      .loadAsync(url)
      .then((texture) => {
        texture.colorSpace = SRGBColorSpace;
        texture.flipY = false; // glTF UVs have their origin at the top left
        texture.anisotropy = 4;
        return texture;
      })
      .catch(() => null);
    textureCache.set(url, pending);
  }
  return pending;
}

/**
 * Paints a texture onto a model's materials. `match` picks which materials to
 * touch by name, so a coin can texture heads, tails and rim independently.
 */
export function applyTexture(
  object: Object3D,
  texture: Texture,
  match: (materialName: string) => boolean = () => true,
): void {
  object.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial && match(material.name)) {
        material.map = texture;
        material.needsUpdate = true;
      }
    }
  });
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
