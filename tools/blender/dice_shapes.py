"""Exact polyhedra for the DiceForge die set.

The vertex/face math mirrors `packages/renderer-web/src/math/geometry.ts`, which
is covered by unit tests (planarity, distinct outward normals, face-up
orientation). Keeping one definition of each solid means the generated models
and the built-in procedural dice are the same shapes.

Pure Python: no bpy import, so it can be unit-checked outside Blender.
"""

from __future__ import annotations

import math

Vec3 = tuple[float, float, float]
PHI = (1.0 + math.sqrt(5.0)) / 2.0


def _sub(a: Vec3, b: Vec3) -> Vec3:
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a: Vec3, b: Vec3) -> Vec3:
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _dot(a: Vec3, b: Vec3) -> float:
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _scale(a: Vec3, k: float) -> Vec3:
    return (a[0] * k, a[1] * k, a[2] * k)


def _normalize(a: Vec3) -> Vec3:
    length = math.sqrt(_dot(a, a))
    if length == 0:
        raise ValueError("cannot normalize a zero-length vector")
    return _scale(a, 1.0 / length)


def centroid(vertices: list[Vec3], face: list[int]) -> Vec3:
    total: Vec3 = (0.0, 0.0, 0.0)
    for index in face:
        vertex = vertices[index]
        total = (total[0] + vertex[0], total[1] + vertex[1], total[2] + vertex[2])
    return _scale(total, 1.0 / len(face))


def face_normal(vertices: list[Vec3], face: list[int]) -> Vec3:
    """Outward unit normal via Newell's method, flipped outward by the centroid."""
    normal: Vec3 = (0.0, 0.0, 0.0)
    for i, index in enumerate(face):
        current = vertices[index]
        following = vertices[face[(i + 1) % len(face)]]
        normal = (
            normal[0] + (current[1] - following[1]) * (current[2] + following[2]),
            normal[1] + (current[2] - following[2]) * (current[0] + following[0]),
            normal[2] + (current[0] - following[0]) * (current[1] + following[1]),
        )
    unit = _normalize(normal)
    return unit if _dot(unit, centroid(vertices, face)) >= 0 else _scale(unit, -1.0)


def wind_outward(vertices: list[Vec3], faces: list[list[int]]) -> list[list[int]]:
    """Reverses any face whose corner order runs clockwise seen from outside."""
    wound: list[list[int]] = []
    for face in faces:
        outward = face_normal(vertices, face)
        a, b, c = vertices[face[0]], vertices[face[1]], vertices[face[2]]
        if _dot(_cross(_sub(b, a), _sub(c, a)), outward) < 0:
            wound.append(list(reversed(face)))
        else:
            wound.append(list(face))
    return wound


def tetrahedron() -> tuple[list[Vec3], list[list[int]]]:
    vertices: list[Vec3] = [(1, 1, 1), (1, -1, -1), (-1, 1, -1), (-1, -1, 1)]
    faces = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]]
    return vertices, faces


def cube() -> tuple[list[Vec3], list[list[int]]]:
    vertices: list[Vec3] = [
        (-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
        (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1),
    ]
    faces = [
        [7, 6, 2, 3], [4, 5, 6, 7], [1, 2, 6, 5],
        [0, 4, 7, 3], [0, 3, 2, 1], [0, 1, 5, 4],
    ]
    return vertices, faces


def octahedron() -> tuple[list[Vec3], list[list[int]]]:
    vertices: list[Vec3] = [(1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)]
    faces = [
        [0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4],
        [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5],
    ]
    return vertices, faces


def pentagonal_trapezohedron() -> tuple[list[Vec3], list[list[int]]]:
    """The d10. Ring offset is derived from apex height so every kite is planar."""
    apex_height = 1.05
    delta = (apex_height * (1 - math.cos(math.pi / 5))) / (1 + math.cos(math.pi / 5))
    upper: list[Vec3] = []
    lower: list[Vec3] = []
    for k in range(5):
        upper_angle = 2 * math.pi * k / 5
        lower_angle = upper_angle + math.pi / 5
        upper.append((math.cos(upper_angle), delta, math.sin(upper_angle)))
        lower.append((math.cos(lower_angle), -delta, math.sin(lower_angle)))
    vertices: list[Vec3] = [(0, apex_height, 0), (0, -apex_height, 0)] + upper + lower

    def up(k: int) -> int:
        return 2 + (k % 5)

    def low(k: int) -> int:
        return 7 + (k % 5)

    faces = [[0, up(k), low(k), up(k + 1)] for k in range(5)]
    faces += [[1, low(k), up(k + 1), low(k + 1)] for k in range(5)]
    return vertices, faces


def icosahedron() -> tuple[list[Vec3], list[list[int]]]:
    t = PHI
    vertices: list[Vec3] = [
        (-1, t, 0), (1, t, 0), (-1, -t, 0), (1, -t, 0),
        (0, -1, t), (0, 1, t), (0, -1, -t), (0, 1, -t),
        (t, 0, -1), (t, 0, 1), (-t, 0, -1), (-t, 0, 1),
    ]
    faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
        [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
        [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ]
    return vertices, faces


def dodecahedron() -> tuple[list[Vec3], list[list[int]]]:
    """Dual of the icosahedron: one vertex per icosahedron face, one pentagon
    per icosahedron vertex, corners ordered by angle around that vertex."""
    ico_vertices, ico_faces = icosahedron()
    centroids = [centroid(ico_vertices, face) for face in ico_faces]
    faces: list[list[int]] = []
    for vertex_index, vertex in enumerate(ico_vertices):
        adjacent = [i for i, face in enumerate(ico_faces) if vertex_index in face]
        axis = _normalize(vertex)
        first = centroids[adjacent[0]]
        reference = _normalize(_sub(first, _scale(axis, _dot(first, axis))))
        orthogonal = _cross(axis, reference)
        adjacent.sort(
            key=lambda i: math.atan2(_dot(centroids[i], orthogonal), _dot(centroids[i], reference))
        )
        faces.append(adjacent)
    return centroids, faces


def coin(segments: int = 48, radius: float = 1.0, thickness: float = 0.22):
    """A coin: a flat cylinder whose two faces are separate n-gons, so heads and
    tails can carry different materials and textures."""
    vertices: list[Vec3] = []
    for k in range(segments):
        angle = 2 * math.pi * k / segments
        vertices.append((radius * math.cos(angle), thickness / 2, radius * math.sin(angle)))
    for k in range(segments):
        angle = 2 * math.pi * k / segments
        vertices.append((radius * math.cos(angle), -thickness / 2, radius * math.sin(angle)))
    top = list(range(segments))
    bottom = list(reversed(range(segments, 2 * segments)))
    sides = [
        [k, segments + k, segments + (k + 1) % segments, (k + 1) % segments]
        for k in range(segments)
    ]
    return vertices, [top, bottom] + sides


def normalize_size(vertices: list[Vec3], target: float = 2.1) -> list[Vec3]:
    """Scales a solid so its longest bounding-box axis measures `target`."""
    extent = max(max(abs(v[axis]) for v in vertices) for axis in range(3))
    factor = target / (2 * extent)
    return [_scale(v, factor) for v in vertices]


def number_faces(vertices: list[Vec3], faces: list[list[int]]) -> list[int]:
    """Assigns die values so opposite faces sum to N+1, the standard layout.

    Pairs each face with the one whose normal points most opposite to it. A
    tetrahedron has no antipodal faces, so it simply numbers 1..4.
    """
    count = len(faces)
    normals = [face_normal(vertices, face) for face in faces]
    values = [0] * count
    if count == 4:
        return [1, 2, 3, 4]
    taken = [False] * count
    next_low = 1
    for i in range(count):
        if taken[i]:
            continue
        opposite = min(
            (j for j in range(count) if j != i and not taken[j]),
            key=lambda j: _dot(normals[i], normals[j]),
        )
        if _dot(normals[i], normals[opposite]) > -0.9:
            raise ValueError(f"face {i} has no antipodal partner; cannot number this solid")
        taken[i] = taken[opposite] = True
        values[i] = next_low
        values[opposite] = count + 1 - next_low
        next_low += 1
    return values


SHAPES = {
    "d4": tetrahedron,
    "d6": cube,
    "d8": octahedron,
    "d10": pentagonal_trapezohedron,
    "d12": dodecahedron,
    "d20": icosahedron,
}
