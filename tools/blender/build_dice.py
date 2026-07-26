"""Builds the DiceForge die set in Blender and exports it for the web renderer.

Run headlessly from the repository root:

    blender --background --factory-startup --python tools/blender/build_dice.py

Produces, under `assets/forge/`:
  * `<name>.glb`          one model per die and the coin
  * `face-rotations.json` the face-up orientation table plus UV atlas metadata

Why part script and part geometry nodes: Blender has no bevel geometry node,
and no primitive for a dodecahedron or the pentagonal trapezohedron used by a
d10, so those solids cannot be authored in a node graph. The exact solids come
from `dice_shapes.py` (the same math the renderer's built-in dice use), and the
shared "DiceForge Finish" node group handles size normalization so every die
lands at a common scale no matter which solid it came from.

Because the numbering is assigned here rather than measured afterwards, the
face-up rotation table is exact by construction — no manual calibration.
"""

from __future__ import annotations

import json
import math
import os
import sys

import bpy

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import dice_shapes as ds  # noqa: E402

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT_DIR = os.path.join(REPO, "assets", "forge")
BLEND_PATH = os.path.join(REPO, "tools", "blender", "diceforge-dice.blend")

DIE_SIZE = 2.1
BEVEL_WIDTH = 0.055
BEVEL_SEGMENTS = 3


# --------------------------------------------------------------------------
# Geometry node group
# --------------------------------------------------------------------------
def build_finish_group() -> bpy.types.NodeTree:
    """Node group that scales any die to a common longest-axis size.

    Every solid is authored at its natural proportions, so without this a d20
    and a d6 would arrive at different sizes. Doing it in nodes keeps it live:
    add a new shape and it is normalized on the way through.
    """
    existing = bpy.data.node_groups.get("DiceForge Finish")
    if existing:
        bpy.data.node_groups.remove(existing)
    group = bpy.data.node_groups.new("DiceForge Finish", "GeometryNodeTree")

    group.interface.new_socket("Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    size_socket = group.interface.new_socket(
        "Target Size", in_out="INPUT", socket_type="NodeSocketFloat"
    )
    size_socket.default_value = DIE_SIZE
    size_socket.min_value = 0.01
    group.interface.new_socket("Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")

    nodes, links = group.nodes, group.links
    group_in = nodes.new("NodeGroupInput")
    group_in.location = (-600, 0)
    group_out = nodes.new("NodeGroupOutput")
    group_out.location = (600, 0)

    bounds = nodes.new("GeometryNodeBoundBox")
    bounds.location = (-400, -150)

    span = nodes.new("ShaderNodeVectorMath")
    span.operation = "SUBTRACT"
    span.location = (-220, -150)

    separate = nodes.new("ShaderNodeSeparateXYZ")
    separate.location = (-60, -150)

    max_xy = nodes.new("ShaderNodeMath")
    max_xy.operation = "MAXIMUM"
    max_xy.location = (100, -220)

    max_xyz = nodes.new("ShaderNodeMath")
    max_xyz.operation = "MAXIMUM"
    max_xyz.location = (260, -220)

    factor = nodes.new("ShaderNodeMath")
    factor.operation = "DIVIDE"
    factor.location = (400, -100)

    uniform = nodes.new("ShaderNodeCombineXYZ")
    uniform.location = (400, -260)

    transform = nodes.new("GeometryNodeTransform")
    transform.location = (420, 60)

    links.new(group_in.outputs["Geometry"], bounds.inputs["Geometry"])
    links.new(bounds.outputs["Max"], span.inputs[0])
    links.new(bounds.outputs["Min"], span.inputs[1])
    links.new(span.outputs["Vector"], separate.inputs["Vector"])
    links.new(separate.outputs["X"], max_xy.inputs[0])
    links.new(separate.outputs["Y"], max_xy.inputs[1])
    links.new(max_xy.outputs["Value"], max_xyz.inputs[0])
    links.new(separate.outputs["Z"], max_xyz.inputs[1])
    links.new(group_in.outputs["Target Size"], factor.inputs[0])
    links.new(max_xyz.outputs["Value"], factor.inputs[1])
    links.new(factor.outputs["Value"], uniform.inputs["X"])
    links.new(factor.outputs["Value"], uniform.inputs["Y"])
    links.new(factor.outputs["Value"], uniform.inputs["Z"])
    links.new(group_in.outputs["Geometry"], transform.inputs["Geometry"])
    links.new(uniform.outputs["Vector"], transform.inputs["Scale"])
    links.new(transform.outputs["Geometry"], group_out.inputs["Geometry"])
    return group


# --------------------------------------------------------------------------
# UV atlas
# --------------------------------------------------------------------------
def face_uv_layout(vertices, faces):
    """Maps every face into its own square tile of an atlas grid.

    Each face is centred on its tile and scaled by its circumradius, so the
    polygon always fits and never bleeds into a neighbour. `fit` records
    inradius/circumradius per face, which tells a texture generator how large a
    numeral may be drawn before it crosses an edge. The per-face texture-up
    axis is returned as well, because the export has to yaw each die so its
    numeral reads upright once that face is on top.
    """
    count = len(faces)
    columns = math.ceil(math.sqrt(count))
    rows = math.ceil(count / columns)
    tile = 1.0 / max(columns, rows)
    per_face_uv: list[list[tuple[float, float]]] = []
    fits: list[float] = []
    up_axes: list[Vec3] = []

    for index, face in enumerate(faces):
        normal = ds.face_normal(vertices, face)
        centre = ds.centroid(vertices, face)
        # Align to the face's first edge, not to a corner: a numeral then sits
        # parallel to an edge, so a d6 lands square to the viewer rather than
        # as a diamond, and triangular faces read like real dice.
        axis_u = ds._normalize(ds._sub(vertices[face[1]], vertices[face[0]]))
        axis_v = ds._cross(normal, axis_u)
        up_axes.append(axis_v)
        planar = [
            (ds._dot(ds._sub(vertices[i], centre), axis_u), ds._dot(ds._sub(vertices[i], centre), axis_v))
            for i in face
        ]
        circumradius = max(math.hypot(u, v) for u, v in planar) or 1.0
        inradius = min(
            _distance_to_edge((0.0, 0.0), planar[i], planar[(i + 1) % len(planar)])
            for i in range(len(planar))
        )
        fits.append(min(1.0, max(0.2, inradius / circumradius)))
        column, row = index % columns, index // columns
        tile_centre = ((column + 0.5) * tile, 1.0 - (row + 0.5) * tile)
        per_face_uv.append(
            [
                (
                    tile_centre[0] + 0.5 * tile * (u / circumradius),
                    tile_centre[1] + 0.5 * tile * (v / circumradius),
                )
                for u, v in planar
            ]
        )
    return per_face_uv, fits, columns, rows, up_axes


def coin_uv_layout(vertices, faces):
    """The coin's two flat faces each own a whole texture, so heads and tails
    can carry full-resolution art. The rim strip is mapped separately."""
    per_face_uv: list[list[tuple[float, float]]] = []
    radius = max(math.hypot(v[0], v[2]) for v in vertices) or 1.0
    for index, face in enumerate(faces):
        if index < 2:  # top, then bottom
            flip = 1.0 if index == 0 else -1.0
            per_face_uv.append(
                [
                    (0.5 + 0.5 * flip * vertices[i][0] / radius, 0.5 + 0.5 * vertices[i][2] / radius)
                    for i in face
                ]
            )
        else:
            per_face_uv.append([(0.0, 0.0), (0.0, 1.0), (1.0, 1.0), (1.0, 0.0)][: len(face)])
    return per_face_uv


def _distance_to_edge(point, a, b) -> float:
    edge = (b[0] - a[0], b[1] - a[1])
    length_sq = edge[0] ** 2 + edge[1] ** 2
    if length_sq == 0:
        return math.hypot(point[0] - a[0], point[1] - a[1])
    t = max(0.0, min(1.0, ((point[0] - a[0]) * edge[0] + (point[1] - a[1]) * edge[1]) / length_sq))
    return math.hypot(a[0] + t * edge[0] - point[0], a[1] + t * edge[1] - point[1])


# --------------------------------------------------------------------------
# Orientation table
# --------------------------------------------------------------------------
def _quat_rotate(q, v):
    qx, qy, qz, qw = q
    t = (2 * (qy * v[2] - qz * v[1]), 2 * (qz * v[0] - qx * v[2]), 2 * (qx * v[1] - qy * v[0]))
    return (
        v[0] + qw * t[0] + qy * t[2] - qz * t[1],
        v[1] + qw * t[1] + qz * t[0] - qx * t[2],
        v[2] + qw * t[2] + qx * t[1] - qy * t[0],
    )


def _quat_mul(a, b):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def to_gltf(vector) -> tuple[float, float, float]:
    """Blender is Z-up, glTF is Y-up: (x, y, z) -> (x, z, -y)."""
    return (vector[0], vector[2], -vector[1])


def gltf_face_up_quaternion(normal_blender) -> list[float]:
    """Quaternion (x, y, z, w) that turns a face's normal to +Y in glTF space.

    The exporter converts Blender's Z-up coordinates to glTF's Y-up as
    (x, y, z) -> (x, z, -y), so the normal is converted before solving.
    """
    normal = to_gltf(normal_blender)
    up = (0.0, 1.0, 0.0)
    dot = ds._dot(normal, up)
    if dot > 0.999999:
        return [0.0, 0.0, 0.0, 1.0]
    if dot < -0.999999:
        return [1.0, 0.0, 0.0, 0.0]  # 180 degrees about X
    axis = ds._cross(normal, up)
    quaternion = [axis[0], axis[1], axis[2], 1.0 + dot]
    length = math.sqrt(sum(component * component for component in quaternion))
    return [component / length for component in quaternion]


def upright_face_rotation(normal_blender, texture_up_blender) -> list[float]:
    """Face-up rotation, yawed so the face's numeral reads upright on screen.

    Putting the face on top still leaves the die free to spin about the vertical
    axis, which would leave numerals at arbitrary angles. The renderer views the
    table from above with world -Z appearing as screen-up, so the face's
    texture-up axis is turned to point that way.
    """
    face_up = gltf_face_up_quaternion(normal_blender)
    turned = _quat_rotate(face_up, to_gltf(texture_up_blender))
    angle = math.atan2(turned[0], turned[2])
    yaw = math.pi - angle
    spin = (0.0, math.sin(yaw / 2.0), 0.0, math.cos(yaw / 2.0))
    return list(_quat_mul(spin, tuple(face_up)))


# --------------------------------------------------------------------------
# Object building
# --------------------------------------------------------------------------
def make_object(name: str, vertices, faces, uvs, materials: list[str], material_index) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata([tuple(v) for v in vertices], [], [list(f) for f in faces])
    mesh.validate()

    for material_name in materials:
        material = bpy.data.materials.get(material_name) or bpy.data.materials.new(material_name)
        material.use_nodes = True
        mesh.materials.append(material)
    if len(materials) > 1:
        for polygon in mesh.polygons:
            polygon.material_index = material_index(polygon.index)

    uv_layer = mesh.uv_layers.new(name="UVMap")
    for polygon in mesh.polygons:
        face_uv = uvs[polygon.index]
        for corner, loop_index in enumerate(polygon.loop_indices):
            uv_layer.data[loop_index].uv = face_uv[corner]

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def finish_object(obj: bpy.types.Object, group: bpy.types.NodeTree, bevel: bool) -> None:
    if bevel:
        modifier = obj.modifiers.new("Round", "BEVEL")
        modifier.width = BEVEL_WIDTH
        modifier.segments = BEVEL_SEGMENTS
        modifier.limit_method = "ANGLE"
        modifier.angle_limit = math.radians(20)
        modifier.harden_normals = False
    nodes = obj.modifiers.new("DiceForge Finish", "NODES")
    nodes.node_group = group

    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.shade_auto_smooth(angle=math.radians(25))


def export(obj: bpy.types.Object, path: str) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials="EXPORT",
    )


def main() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    os.makedirs(OUT_DIR, exist_ok=True)
    group = build_finish_group()
    manifest: dict[str, object] = {}

    for name, build in ds.SHAPES.items():
        vertices, faces = build()
        vertices = ds.normalize_size(vertices, DIE_SIZE)
        faces = ds.wind_outward(vertices, faces)
        values = ds.number_faces(vertices, faces)
        uvs, fits, columns, rows, up_axes = face_uv_layout(vertices, faces)

        obj = make_object(name, vertices, faces, uvs, [f"forge_{name}"], lambda _i: 0)
        finish_object(obj, group, bevel=True)
        export(obj, os.path.join(OUT_DIR, f"{name}.glb"))

        # rotations[value - 1] orients the die so that value reads upward.
        rotations: list[list[float]] = [[] for _ in faces]
        atlas: list[dict[str, object]] = [{} for _ in faces]
        for index, face in enumerate(faces):
            value = values[index]
            rotations[value - 1] = upright_face_rotation(
                ds.face_normal(vertices, face), up_axes[index]
            )
            atlas[value - 1] = {
                "tile": [index % columns, index // columns],
                "fit": round(fits[index], 4),
            }
        manifest[name] = {
            "faces": len(faces),
            "atlas": {"columns": columns, "rows": rows, "faces": atlas},
            "rotations": [[round(c, 6) for c in q] for q in rotations],
        }

    coin_vertices, coin_faces = ds.coin()
    coin_uvs = coin_uv_layout(coin_vertices, coin_faces)
    coin_obj = make_object(
        "coin",
        coin_vertices,
        coin_faces,
        coin_uvs,
        ["forge_coin_heads", "forge_coin_tails", "forge_coin_rim"],
        lambda index: 0 if index == 0 else (1 if index == 1 else 2),
    )
    finish_object(coin_obj, group, bevel=True)
    export(coin_obj, os.path.join(OUT_DIR, "coin.glb"))
    manifest["coin"] = {
        "faces": 2,
        "materials": ["forge_coin_heads", "forge_coin_tails", "forge_coin_rim"],
        "rotations": [
            gltf_face_up_quaternion((0.0, 1.0, 0.0)),
            gltf_face_up_quaternion((0.0, -1.0, 0.0)),
        ],
    }

    with open(os.path.join(OUT_DIR, "face-rotations.json"), "w") as handle:
        json.dump(manifest, handle, indent=1)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    print("DICEFORGE_BUILD_OK", json.dumps({k: v["faces"] for k, v in manifest.items()}))


if __name__ == "__main__":
    main()
