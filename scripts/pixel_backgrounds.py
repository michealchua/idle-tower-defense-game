"""Procedural pixel-art background generator for tataKAI - matches the
character/enemy/pet/castle style from pixel_sprites.py, so the whole game
reads as one consistent art direction instead of pixel characters standing
in front of photo-realistic scenery.

Drawn on a small logical grid (168x96, same 1.75:1 aspect as the old
forest.jpg it replaces) and upscaled with nearest-neighbor, same convention
as pixel_sprites.py. Saved as PNG (not JPEG) even for biomes whose old file
was a .jpg - JPEG's lossy compression smears the crisp pixel edges pixel art
depends on; see biomeConfig.ts/index.css for the matching path updates.

Run: python scripts/pixel_backgrounds.py
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKGROUNDS = os.path.join(ROOT, "public", "backgrounds")

GW, GH = 168, 96
SCALE = 8


def new_canvas():
    return Image.new("RGB", (GW, GH), (0, 0, 0))


def save(img, filename):
    full = os.path.join(BACKGROUNDS, filename)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    big = img.resize((GW * SCALE, GH * SCALE), Image.NEAREST)
    big.save(full)
    print("wrote", filename, big.size)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def vgradient(draw, y0, y1, top_color, bottom_color, x0=0, x1=GW):
    height = max(1, y1 - y0)
    for i in range(y1 - y0):
        t = i / height
        draw.line([(x0, y0 + i), (x1, y0 + i)], fill=lerp(top_color, bottom_color, t))


def shade(color, amount):
    target = (0, 0, 0) if amount < 0 else (255, 255, 255)
    p = min(1.0, abs(amount))
    return lerp(color, target, p)


def triangle(draw, apex, half_width, base_y, color):
    x, y = apex
    draw.polygon([(x, y), (x - half_width, base_y), (x + half_width, base_y)], fill=color)


def tree(draw, x, base_y, trunk_color, leaf_color, size=1.0):
    trunk_h = int(6 * size)
    trunk_w = max(1, int(2 * size))
    draw.rectangle([x - trunk_w // 2, base_y - trunk_h, x + trunk_w // 2, base_y], fill=trunk_color)
    leaf_r = int(6 * size)
    top = base_y - trunk_h
    draw.ellipse([x - leaf_r, top - leaf_r * 2 + 3, x + leaf_r, top + 3], fill=leaf_color)
    draw.ellipse([x - leaf_r, top - leaf_r * 2 + 3, x - 1, top + 1], fill=shade(leaf_color, 0.15))


def dead_tree(draw, x, base_y, color, size=1.0):
    h = int(14 * size)
    draw.line([(x, base_y), (x, base_y - h)], fill=color, width=1)
    draw.line([(x, base_y - h * 0.6), (x - 4 * size, base_y - h * 0.8)], fill=color, width=1)
    draw.line([(x, base_y - h * 0.7), (x + 3 * size, base_y - h * 0.95)], fill=color, width=1)


def cactus(draw, x, base_y, color):
    draw.rectangle([x - 1, base_y - 12, x + 1, base_y], fill=color)
    draw.rectangle([x - 4, base_y - 9, x - 2, base_y - 5], fill=color)
    draw.rectangle([x + 2, base_y - 8, x + 4, base_y - 4], fill=color)


def cloud(draw, x, y, color, scale=1.0):
    for dx, dy, r in [(0, 0, 6), (-6, 2, 5), (6, 1, 5), (-2, -2, 4), (4, -3, 4)]:
        rr = int(r * scale)
        draw.ellipse([x + dx * scale - rr, y + dy * scale - rr, x + dx * scale + rr, y + dy * scale + rr], fill=color)


def stalactite(draw, x, tip_y, base_y, half_width, color):
    draw.polygon([(x - half_width, base_y), (x + half_width, base_y), (x, tip_y)], fill=color)


def pillar(draw, x, base_y, top_y, width, color, broken=True):
    draw.rectangle([x - width // 2, top_y, x + width // 2, base_y], fill=color)
    draw.rectangle([x - width // 2 - 1, top_y, x + width // 2 + 1, top_y + 2], fill=shade(color, 0.2))
    if broken:
        draw.polygon([(x - width // 2, top_y), (x + width // 2, top_y), (x + 2, top_y - 4)], fill=color)


def floating_island(draw, x, y, w, top_color, under_color):
    draw.ellipse([x - w // 2, y - 4, x + w // 2, y + 6], fill=under_color)
    draw.ellipse([x - w // 2, y - 7, x + w // 2, y + 2], fill=top_color)


def crack_glow(draw, x0, y0, x1, y1, color, width=1):
    draw.line([(x0, y0), (x1, y1)], fill=color, width=width)


def star(draw, x, y, color):
    draw.point((x, y), fill=color)
    draw.point((x - 1, y), fill=shade(color, -0.3))
    draw.point((x + 1, y), fill=shade(color, -0.3))
    draw.point((x, y - 1), fill=shade(color, -0.3))
    draw.point((x, y + 1), fill=shade(color, -0.3))


# --- Biomes ------------------------------------------------------------

def forest():
    img = new_canvas()
    d = ImageDraw.Draw(img)
    horizon = 52
    vgradient(d, 0, horizon, (120, 190, 230), (200, 230, 210))
    vgradient(d, horizon, GH, (86, 150, 70), (60, 110, 50))
    # distant hazy hills
    for cx, r in [(20, 22), (70, 28), (120, 24), (155, 20)]:
        d.ellipse([cx - r, horizon - r * 0.5, cx + r, horizon + 4], fill=(110, 175, 110))
    for x, size in [(14, 1.1), (34, 0.8), (58, 1.3), (82, 0.9), (104, 1.1), (128, 0.8), (150, 1.2), (10, 0.7), (163, 0.9)]:
        tree(d, x, horizon + 20 + (hash((x, size)) % 20), (74, 50, 34), (54, 130, 60), size)
    save(img, "forest.png")


def desert():
    img = new_canvas()
    d = ImageDraw.Draw(img)
    horizon = 50
    vgradient(d, 0, horizon, (255, 200, 120), (255, 225, 160))
    d.ellipse([128, 10, 152, 34], fill=(255, 235, 170))
    vgradient(d, horizon, GH, (230, 190, 120), (200, 150, 80))
    for cx, r, c in [(30, 30, (225, 180, 110)), (100, 40, (215, 170, 100)), (150, 26, (225, 180, 110))]:
        d.ellipse([cx - r, horizon - 6, cx + r, horizon + 14], fill=c)
    for x in [12, 46, 78, 96, 122, 140, 160]:
        cactus(d, x, horizon + 24 + (x % 15), (70, 120, 60))
    save(img, "desert.png")


def ocean():
    img = new_canvas()
    d = ImageDraw.Draw(img)
    horizon = 46
    vgradient(d, 0, horizon, (150, 210, 235), (210, 235, 235))
    d.ellipse([135, 8, 155, 28], fill=(255, 250, 210))
    vgradient(d, horizon, GH, (60, 140, 190), (20, 70, 120))
    for row, alpha_shift in enumerate(range(horizon + 3, GH, 4)):
        tone = shade((60, 150, 200), -0.1 * (row % 3))
        for x in range(0, GW, 10):
            d.line([(x, alpha_shift), (x + 5, alpha_shift)], fill=shade(tone, 0.2), width=1)
    d.ellipse([40, horizon - 3, 60, horizon + 2], fill=(90, 80, 70))
    save(img, "ocean.png")


def snow_mountain():
    img = new_canvas()
    d = ImageDraw.Draw(img)
    horizon = 54
    vgradient(d, 0, horizon, (170, 190, 210), (220, 225, 230))
    for cx, r, h in [(30, 34, 30), (85, 42, 38), (140, 30, 26)]:
        triangle(d, (cx, horizon - h), r, horizon, (150, 160, 175))
        triangle(d, (cx, horizon - h), int(r * 0.5), horizon - int(h * 0.55), (245, 248, 250))
    vgradient(d, horizon, GH, (235, 240, 245), (200, 210, 220))
    for i in range(40):
        x = (i * 37) % GW
        y = (i * 53) % (GH - horizon) + horizon
        d.point((x, y), fill=(255, 255, 255))
    save(img, "snow-mountain.png")


def poison_swamp():
    img = new_canvas()
    d = ImageDraw.Draw(img)
    horizon = 56
    vgradient(d, 0, horizon, (110, 130, 90), (150, 160, 120))
    vgradient(d, horizon, GH, (70, 90, 55), (40, 55, 35))
    for cx, r in [(25, 18), (90, 24), (145, 16)]:
        d.ellipse([cx - r, horizon - 3, cx + r, horizon + 8], fill=(60, 80, 50))
    for x in [16, 40, 64, 88, 112, 136, 156]:
        dead_tree(d, x, horizon + 18 + (x % 12), (35, 40, 30), 1.0)
    for cx, cy, r in [(40, 40, 14), (110, 30, 18), (150, 45, 12)]:
        d.ellipse([cx - r, cy - r // 3, cx + r, cy + r // 3], fill=(180, 200, 160))
    save(img, "poison-swamp.png")


def dark_cave():
    img = new_canvas()
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, GW, GH], fill=(18, 16, 26))
    vgradient(d, GH - 30, GH, (30, 26, 40), (14, 12, 20))
    for x in [10, 28, 46, 66, 86, 104, 122, 140, 158]:
        stalactite(d, x, 0, 10 + (x % 14), 6, (40, 36, 50))
        stalactite(d, x + 8, GH, GH - (8 + (x % 10)), 5, (34, 30, 44))
    for x, y in [(30, 50), (70, 60), (110, 40), (140, 65), (50, 70), (150, 30)]:
        star(d, x, y, (140, 220, 230))
    save(img, "dark-cave.png")


def ancient_ruins():
    img = new_canvas()
    d = ImageDraw.Draw(img)
    horizon = 52
    vgradient(d, 0, horizon, (235, 190, 140), (245, 215, 170))
    vgradient(d, horizon, GH, (200, 175, 130), (160, 135, 95))
    for x, h in [(20, 26), (48, 34), (82, 22), (110, 30), (140, 24), (160, 18)]:
        pillar(d, x, horizon + 20, horizon + 20 - h, 6, (210, 195, 165))
    # A fallen pillar lying on the ground - flush against base_y (not
    # floating mid-air like the first attempt at this) with a darker
    # underside edge so it reads as a solid cylinder lying down, not a
    # flat stray rectangle.
    d.rectangle([62, horizon + 16, 98, horizon + 20], fill=(200, 182, 150))
    d.rectangle([62, horizon + 19, 98, horizon + 20], fill=shade((200, 182, 150), -0.2))
    save(img, "ancient-ruins.png")


def volcano():
    img = new_canvas()
    d = ImageDraw.Draw(img)
    horizon = 50
    vgradient(d, 0, horizon, (60, 20, 20), (140, 60, 30))
    triangle(d, (90, horizon - 40), 50, horizon, (40, 25, 25))
    d.polygon([(90, horizon - 40), (80, horizon - 20), (100, horizon - 20)], fill=(255, 120, 30))
    vgradient(d, horizon, GH, (35, 22, 22), (16, 10, 10))
    for x0, y0, x1, y1 in [(20, 70, 40, 90), (60, 60, 90, 85), (110, 75, 150, 60), (130, 90, 160, 70)]:
        crack_glow(d, x0, y0, x1, y1, (255, 110, 30), width=1)
    save(img, "volcano.png")


def sky_realm():
    img = new_canvas()
    d = ImageDraw.Draw(img)
    vgradient(d, 0, GH, (150, 220, 245), (225, 245, 250))
    for x, y in [(20, 20), (60, 12), (100, 24), (140, 16)]:
        cloud(d, x, y, (255, 255, 255), scale=1.1)
    floating_island(d, 40, 60, 34, (110, 190, 100), (140, 120, 95))
    floating_island(d, 110, 45, 44, (110, 190, 100), (140, 120, 95))
    floating_island(d, 150, 72, 26, (110, 190, 100), (140, 120, 95))
    save(img, "sky-realm.png")


def demon_abyss():
    img = new_canvas()
    d = ImageDraw.Draw(img)
    horizon = 54
    vgradient(d, 0, horizon, (50, 10, 15), (110, 25, 20))
    vgradient(d, horizon, GH, (25, 8, 10), (10, 4, 6))
    for x, half, h in [(15, 5, 14), (35, 7, 20), (60, 4, 10), (95, 6, 16), (125, 5, 12), (150, 8, 22)]:
        triangle(d, (x, horizon - h), half, horizon, (18, 6, 8))
    for x0, y0, x1, y1 in [(10, 80, 30, 65), (60, 90, 85, 75), (100, 70, 130, 88), (140, 60, 160, 80)]:
        crack_glow(d, x0, y0, x1, y1, (230, 40, 30), width=1)
    save(img, "demon-abyss.png")


if __name__ == "__main__":
    forest()
    desert()
    ocean()
    snow_mountain()
    poison_swamp()
    dark_cave()
    ancient_ruins()
    volcano()
    sky_realm()
    demon_abyss()
