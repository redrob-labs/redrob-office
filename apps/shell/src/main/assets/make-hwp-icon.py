#!/usr/bin/env python3
"""Generate the .hwp file-type icon in the shapes the shell already uses.

Design language, from the existing assets/file-*.svg: a 240x240 rounded square
(rx=48) in one flat brand colour with a flat white glyph. Colours already taken:
#3276CD docx, #4FA16B xlsx, #D33922 pptx, #EF4444 pdf, #8B5CF6 md. Teal is the
only hue band far from all five, so .hwp takes #0E7C86.

The glyph is the jamo ㅎ drawn as geometry, not as SVG <text>: text would need a
Korean font present at render time and the icon must draw the same on a machine
that has none.

Each raster size gets its OWN geometry, in whole device pixels. Scaling one
240-unit drawing down to 16px put the ring's stroke below one pixel and the
result was a blob — at 16px every limb of ㅎ is one or two pixels, so the
geometry has to be authored there rather than derived. The 240-unit SVG is for
the renderer, where it is drawn at 30px and up.

PNGs are written here instead of rasterised from the SVG: ImageMagick's SVG
support needs a librsvg delegate that may be absent, and a silently poor render
is worse than none.
"""

import struct
import zlib
from pathlib import Path

BRAND = (0x0E, 0x7C, 0x86)
SS = 16  # supersampling per axis


def rrect(x, y, x0, y0, x1, y1, r):
    """Is point (x, y) inside the rounded rect [x0,y0]-[x1,y1] with radius r?"""
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    if x0 + r <= x <= x1 - r or y0 + r <= y <= y1 - r:
        return True
    cx = x0 + r if x < x0 + r else x1 - r
    cy = y0 + r if y < y0 + r else y1 - r
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r


class Geometry:
    """ㅎ plus its plate, in one size's own pixel units."""

    def __init__(self, size, plate_radius, top, main, ring, bar_r):
        self.size = float(size)
        self.plate_radius = plate_radius
        self.top = top          # (x0, y0, x1, y1)
        self.main = main        # (x0, y0, x1, y1)
        self.ring = ring        # (cx, cy, outer_r, stroke)
        self.bar_r = bar_r

    def plate(self, x, y):
        return rrect(x, y, 0.0, 0.0, self.size, self.size, self.plate_radius)

    def glyph(self, x, y):
        if rrect(x, y, *self.top, self.bar_r):
            return True
        if rrect(x, y, *self.main, self.bar_r):
            return True
        cx, cy, outer, stroke = self.ring
        d2 = (x - cx) ** 2 + (y - cy) ** 2
        inner = outer - stroke
        return inner * inner <= d2 <= outer * outer


# 16px: 1px limbs, a 2px-wide ring hole, one clear pixel of gap between bars.
# Nothing here is fractional on purpose.
G16 = Geometry(
    size=16,
    plate_radius=3.5,
    top=(6.0, 3.0, 10.0, 4.0),
    main=(3.0, 5.0, 13.0, 6.0),
    ring=(8.0, 10.5, 3.5, 1.0),
    bar_r=0.5,
)

# 32px: room for 2px limbs and a 4px hole.
G32 = Geometry(
    size=32,
    plate_radius=7.0,
    top=(12.0, 6.0, 20.0, 8.0),
    main=(6.0, 10.0, 26.0, 12.0),
    ring=(16.0, 21.0, 7.0, 2.0),
    bar_r=1.0,
)


def render(geo, px):
    scale = geo.size / px
    rows = []
    for py in range(px):
        row = bytearray()
        for pxi in range(px):
            plate = glyph = 0
            for sy in range(SS):
                for sx in range(SS):
                    x = (pxi + (sx + 0.5) / SS) * scale
                    y = (py + (sy + 0.5) / SS) * scale
                    if geo.plate(x, y):
                        plate += 1
                        if geo.glyph(x, y):
                            glyph += 1
            total = SS * SS
            if plate == 0:
                row += b"\x00\x00\x00\x00"
                continue
            a = plate / total
            g = glyph / plate
            row += bytes(
                (
                    round(BRAND[0] * (1 - g) + 255 * g),
                    round(BRAND[1] * (1 - g) + 255 * g),
                    round(BRAND[2] * (1 - g) + 255 * g),
                    round(a * 255),
                )
            )
        rows.append(bytes(row))
    return rows


def write_png(path, geo, px):
    raw = b"".join(b"\x00" + r for r in render(geo, px))

    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", px, px, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    Path(path).write_bytes(png)
    print(f"{path}: {px}x{px}, {len(png)} bytes")


# The renderer draws this at 30px and up, so it keeps the 240-unit proportions
# of its siblings.
SVG = """<svg width="240" height="240" viewBox="0 0 240 240" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="240" height="240" rx="48" fill="#0E7C86"/>
<rect x="96" y="50" width="48" height="18" rx="9" fill="white"/>
<rect x="50" y="84" width="140" height="18" rx="9" fill="white"/>
<circle cx="120" cy="156" r="38" stroke="white" stroke-width="20"/>
</svg>
"""

if __name__ == "__main__":
    import sys

    root = Path(sys.argv[1])
    write_png(root / "apps/shell/src/main/assets/menu-hwp.png", G16, 16)
    write_png(root / "apps/shell/src/main/assets/menu-hwp@2x.png", G32, 32)
    svg = root / "apps/shell/src/renderer/src/assets/file-hwp.svg"
    svg.write_text(SVG, encoding="utf-8")
    print(f"{svg}: {len(SVG)} bytes")
