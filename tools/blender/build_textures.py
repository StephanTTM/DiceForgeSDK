"""Draws the texture atlases for the first-party DiceForge die set.

Run from the repository root (plain Python, no Blender needed):

    python tools/blender/build_textures.py

Reads `packages/assets-forge/forge/face-rotations.json` — written by `build_dice.py` — and
paints one atlas per die per colour into `packages/assets-forge/forge/textures/`, plus the
coin's heads, tails and rim.

Each face owns a square tile of the atlas. The manifest's per-face `fit` is the
inradius/circumradius ratio, so `fit x tile` is the widest a centred glyph can
be before it crosses an edge: a numeral on a d20's triangle has to be smaller
than one on a d6's square, and this is what keeps that automatic.
"""

from __future__ import annotations

import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FORGE_DIR = os.path.join(REPO, "packages", "assets-forge", "forge")
TEXTURE_DIR = os.path.join(FORGE_DIR, "textures")
TILE = 256
SUPERSAMPLE = 2  # draw large, downscale: cheap, effective anti-aliasing

# Body and numeral colours per theme.
PALETTE: dict[str, tuple[tuple[int, int, int], tuple[int, int, int]]] = {
    "ivory": ((236, 233, 223), (32, 34, 42)),
    "red": ((166, 60, 60), (247, 236, 236)),
    "blue": ((60, 90, 166), (236, 240, 246)),
    "green": ((60, 122, 76), (236, 244, 238)),
    "yellow": ((185, 134, 46), (250, 244, 232)),
}

# Preferred first: DejaVu is permissively licensed and ships with matplotlib,
# so regenerating gives the same glyphs on any machine that has it.
FONT_CANDIDATES = [
    os.path.join(
        os.path.dirname(sys.modules["matplotlib"].__file__), "mpl-data", "fonts", "ttf",
        "DejaVuSans-Bold.ttf",
    )
    if "matplotlib" in sys.modules
    else "",
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
]


def find_font_path() -> str:
    try:
        import matplotlib

        candidate = os.path.join(
            os.path.dirname(matplotlib.__file__), "mpl-data", "fonts", "ttf", "DejaVuSans-Bold.ttf"
        )
        if os.path.exists(candidate):
            return candidate
    except ImportError:
        pass
    for candidate in FONT_CANDIDATES:
        if candidate and os.path.exists(candidate):
            return candidate
    raise SystemExit("no usable bold TrueType font found; set one in FONT_CANDIDATES")


FONT_PATH = find_font_path()


def fitted_font(text: str, budget: float) -> ImageFont.FreeTypeFont:
    """Largest font size whose glyph box fits inside `budget` pixels."""
    size = max(8, int(budget))
    while size > 8:
        font = ImageFont.truetype(FONT_PATH, size)
        left, top, right, bottom = font.getbbox(text)
        if (right - left) <= budget and (bottom - top) <= budget:
            return font
        size -= 2
    return ImageFont.truetype(FONT_PATH, 8)


def draw_glyph(draw: ImageDraw.ImageDraw, text: str, centre, budget: float, colour) -> None:
    font = fitted_font(text, budget)
    left, top, right, bottom = font.getbbox(text)
    x = centre[0] - (left + right) / 2
    y = centre[1] - (top + bottom) / 2
    draw.text((x, y), text, font=font, fill=colour)
    # 6 and 9 are indistinguishable when a die can land either way up.
    if text in ("6", "9"):
        width = (right - left) * 0.62
        thickness = max(3, int(budget * 0.055))
        base = centre[1] + (bottom - top) / 2 + thickness * 1.6
        draw.rounded_rectangle(
            [centre[0] - width / 2, base, centre[0] + width / 2, base + thickness],
            radius=thickness / 2,
            fill=colour,
        )


def die_label(die: str, value: int) -> str:
    """d10 shows 0-9 like a real percentile die; everything else shows its value.

    `d10_tens` is the tens half of a percentile pair, reading 00-90: the same
    faces as the plain d10 with a nought appended, so face 4 reads "40" and the
    face reading "0" reads "00".
    """
    if die == "d10_tens":
        return f"{value % 10}0"
    if die == "d10":
        return str(value % 10)
    return str(value)


def build_die_atlas(die: str, entry: dict, body, ink) -> Image.Image:
    atlas = entry["atlas"]
    columns, rows = atlas["columns"], atlas["rows"]
    # The UV layout uses tiles of 1/max(columns, rows) in *both* axes, so the
    # canvas has to be square for a UV tile to land on a square block of
    # pixels. A non-square canvas would stretch every glyph.
    grid = max(columns, rows)
    scale = TILE * SUPERSAMPLE
    image = Image.new("RGB", (grid * scale, grid * scale), body)
    draw = ImageDraw.Draw(image)
    # The face spans only this fraction of its tile (a margin keeps bevelled
    # geometry from sampling the neighbour), so glyphs shrink to match.
    fraction = atlas.get("faceFraction", 1.0)
    for value_index, face in enumerate(atlas["faces"]):
        column, row = face["tile"]
        centre = ((column + 0.5) * scale, (row + 0.5) * scale)
        # `fit` spans the inscribed circle's diameter across the face; hold a
        # little back so glyphs never touch a bevelled edge.
        budget = face["fit"] * fraction * scale * 0.78
        draw_glyph(draw, die_label(die, value_index + 1), centre, budget, ink)
    return image.resize((grid * TILE, grid * TILE), Image.LANCZOS)


def build_coin_faces(body, ink) -> dict[str, Image.Image]:
    scale = TILE * 2 * SUPERSAMPLE
    faces: dict[str, Image.Image] = {}
    for name, glyph in (("heads", "H"), ("tails", "T")):
        image = Image.new("RGB", (scale, scale), body)
        draw = ImageDraw.Draw(image)
        inset = scale * 0.16
        draw.ellipse(
            [inset, inset, scale - inset, scale - inset], outline=ink, width=int(scale * 0.02)
        )
        draw_glyph(draw, glyph, (scale / 2, scale / 2), scale * 0.38, ink)
        faces[name] = image.resize((TILE * 2, TILE * 2), Image.LANCZOS)
    rim = Image.new("RGB", (TILE, TILE // 4), body)
    faces["rim"] = rim
    return faces


def main() -> None:
    with open(os.path.join(FORGE_DIR, "face-rotations.json")) as handle:
        manifest = json.load(handle)

    written = 0
    for colour, (body, ink) in PALETTE.items():
        out_dir = os.path.join(TEXTURE_DIR, colour)
        os.makedirs(out_dir, exist_ok=True)
        for die, entry in manifest.items():
            if die == "coin":
                continue
            atlas = build_die_atlas(die, entry, body, ink)
            atlas.save(os.path.join(out_dir, f"{die}.png"), optimize=True)
            written += 1
            if die == "d10":
                # Same model and UV layout, different glyphs: the tens half of a
                # percentile pair.
                tens = build_die_atlas("d10_tens", entry, body, ink)
                tens.save(os.path.join(out_dir, "d10_tens.png"), optimize=True)
                written += 1
        for name, image in build_coin_faces(body, ink).items():
            image.save(os.path.join(out_dir, f"coin_{name}.png"), optimize=True)
            written += 1

    print(f"DICEFORGE_TEXTURES_OK font={os.path.basename(FONT_PATH)} files={written}")


if __name__ == "__main__":
    main()
