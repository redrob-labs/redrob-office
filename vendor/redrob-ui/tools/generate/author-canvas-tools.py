#!/usr/bin/env python3
"""Author canvas tool glyphs to 45-icons.md: 24px box, 20px live area (2..22), 2px stroke, butt caps,
miter joins, directional diagonals at 40 degrees. Angles are computed, never eyeballed.

Writes:  glyphs.json (name -> list of (tag, attrs))  and  sheet.svg (contact sheet for review).
"""
import json, math, sys

R = 40.0  # the rake


def pt(x, y, deg, d):
    """Point d from (x, y) heading `deg` degrees (0 = right, 90 = down; y grows down)."""
    a = math.radians(deg)
    return (round(x + d * math.cos(a), 2), round(y + d * math.sin(a), 2))


def rot(points, cx, cy, deg):
    a = math.radians(deg)
    c, s = math.cos(a), math.sin(a)
    return [(round(cx + (x - cx) * c - (y - cy) * s, 2), round(cy + (x - cx) * s + (y - cy) * c, 2)) for x, y in points]


def pts(points):
    return " ".join(f"{x} {y}" for x, y in points)


def dot(cx, cy):
    """45-icons.md: a dot is a 2x2 filled square."""
    return ("rect", {"x": round(cx - 1, 2), "y": round(cy - 1, 2), "width": 2, "height": 2, "fill": "currentColor", "stroke": "none"})


G = {}

# brush: a handle on the rake, a ferrule, and a tapered tip that has just laid a short mark. The taper
# legs are not on the rake: 45-icons.md lets a taper take its angle from the thing depicted, and the
# arrowhead-rule tip (legs 40 degrees off the shaft) was tried and read as an arrow, not a brush.
h0 = (20, 4)
h1 = pt(*h0, 140, 7.5)
f1 = pt(*h1, 140, 2.5)
n = 50
fa, fb = pt(*h1, n, 1.6), pt(*h1, n + 180, 1.6)
ga, gb = pt(*f1, n, 1.6), pt(*f1, n + 180, 1.6)
tip = pt(*f1, 140, 4.5)
G["brush"] = [
    ("line", {"x1": h0[0], "y1": h0[1], "x2": h1[0], "y2": h1[1]}),
    ("polygon", {"points": pts([fa, ga, tip, gb, fb])}),
    ("line", {"x1": 3, "y1": 21, "x2": 8, "y2": 21}),
]

# fill: a drop. Its flanks leave the apex at 40 degrees from the vertical, so the apex height follows
# from the radius instead of being chosen: d = r / sin(40).
r, cx, cy = 5.5, 12, 14.5
d = r / math.sin(math.radians(R))
apex = (cx, round(cy - d, 2))
left = pt(cx, cy, 180 + R, r)       # tangent points sit at 90 - 40 = 50 degrees off the axis
right = pt(cx, cy, -R, r)
G["fill"] = [("path", {"d": f"M{apex[0]} {apex[1]} L{right[0]} {right[1]} A{r} {r} 0 1 1 {left[0]} {left[1]} Z"})]

# rectangle: the house rectangle (square top-left, 2px radius on the other three), landscape.
G["rectangle"] = [("path", {"d": "M3.5 6.5H18.5A2 2 0 0 1 20.5 8.5V15.5A2 2 0 0 1 18.5 17.5H5.5A2 2 0 0 1 3.5 15.5Z"})]

# ellipse: a ring that IS the thing, so it stays closed.
G["ellipse"] = [("path", {"d": "M3.5 12A8.5 6 0 1 1 20.5 12A8.5 6 0 1 1 3.5 12"})]

# shape (vector path): one curve with its two anchors as dots.
G["shape"] = [
    ("path", {"d": "M5 18C7 6 17 6 19 18"}),
    dot(5, 19.5),
    dot(19, 19.5),
]

# gradient: a ramp. The rise is set so the slope is the 40 degree rake: h = run * tan(40).
run = 17
rise = round(run * math.tan(math.radians(R)), 2)
G["gradient"] = [("polygon", {"points": pts([(3.5, 20.5), (20.5, 20.5), (20.5, round(20.5 - rise, 2))])})]

# transform: a selection frame held by four corner handles, the sides broken at the handles.
c = [(5, 5), (19, 5), (19, 19), (5, 19)]
G["transform"] = [dot(*p) for p in c] + [
    ("line", {"x1": 7.5, "y1": 5, "x2": 16.5, "y2": 5}),
    ("line", {"x1": 19, "y1": 7.5, "x2": 19, "y2": 16.5}),
    ("line", {"x1": 16.5, "y1": 19, "x2": 7.5, "y2": 19}),
    ("line", {"x1": 5, "y1": 16.5, "x2": 5, "y2": 7.5}),
]

# eyedropper: a pipette on the rake -- bulb, collar across it, glass stem, and the sampled drop.
c0 = (15.5, 8.5)                      # collar centre
bulb = pt(*c0, -R, 5)                 # up-right, back along the rake
stem = pt(*c0, 180 - R, 9.5)          # down-left
ca, cb = pt(*c0, 90 - R, 3.2), pt(*c0, 270 - R, 3.2)
G["eyedropper"] = [
    ("line", {"x1": c0[0], "y1": c0[1], "x2": bulb[0], "y2": bulb[1]}),
    ("line", {"x1": ca[0], "y1": ca[1], "x2": cb[0], "y2": cb[1]}),
    ("line", {"x1": c0[0], "y1": c0[1], "x2": stem[0], "y2": stem[1]}),
    dot(*pt(*stem, 180 - R, 2.3)),
]


def svg_el(tag, attrs):
    a = " ".join(f'{k.replace("strokeWidth", "stroke-width")}="{v}"' for k, v in attrs.items())
    return f"<{tag} {a}/>"


cells = []
for i, (name, kids) in enumerate(G.items()):
    x = (i % 4) * 120
    y = (i // 4) * 140
    body = "".join(svg_el(t, a) for t, a in kids)
    cells.append(
        f'<g transform="translate({x+12},{y+12}) scale(4)"><rect width="24" height="24" fill="none" stroke="#ddd" stroke-width="0.25"/>'
        f'<g fill="none" stroke="#111" stroke-width="2" stroke-linecap="butt" stroke-linejoin="miter" stroke-miterlimit="3">{body}</g></g>'
        f'<text x="{x+60}" y="{y+128}" font-size="13" text-anchor="middle" font-family="sans-serif">{name}</text>'
    )
rows = (len(G) + 3) // 4
open("sheet.svg", "w").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" width="480" height="{rows*140}"><rect width="100%" height="100%" fill="#fff"/>{"".join(cells)}</svg>'
)
json.dump(G, open("glyphs.json", "w"), indent=1)
print(len(G), "glyphs:", ", ".join(G))
