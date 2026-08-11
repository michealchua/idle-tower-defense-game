"""Procedural pixel-art sprite generator for tataKAI.

Draws every character/creature/structure sprite on a small logical pixel
grid (chibi-proportioned humanoid template + separate creature/structure
templates), then upscales with nearest-neighbor to keep hard pixel edges.
Output dimensions are deliberately kept outside CanvasRenderer's frame-sheet
size heuristic (see SPRITE_SHEET_CONFIG in src/render/CanvasRenderer.ts -
width 32-384 AND height 32-192 both in range means "treat as an animated
sheet") so every file here is drawn as a single static pose, matching how
the existing hand-illustrated sprites already work - no renderer code needs
to change for these to "just work" once dropped into public/sprites/.

Run: python scripts/pixel_sprites.py
"""

import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, "public", "sprites")

SCALE = 10
OUTLINE = (20, 16, 24, 255)


def new_grid(w, h):
    return Image.new("RGBA", (w, h), (0, 0, 0, 0))


def px(draw, x, y, color, w=1, h=1):
    """Fill a w x h block of *grid* pixels starting at (x, y)."""
    if color is None:
        return
    draw.rectangle([x, y, x + w - 1, y + h - 1], fill=color)


def save(img, path):
    full = os.path.join(SPRITES, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    big = img.resize((img.width * SCALE, img.height * SCALE), Image.NEAREST)
    big.save(full)
    print("wrote", path, big.size)


def shade(color, amount):
    """amount<0 darkens toward black, amount>0 lightens toward white."""
    r, g, b, a = color
    target = 0 if amount < 0 else 255
    p = min(1.0, abs(amount))
    return (
        int(r + (target - r) * p),
        int(g + (target - g) * p),
        int(b + (target - b) * p),
        a,
    )


# --- Humanoid template ----------------------------------------------------
# 26 wide x 34 tall logical grid. Chibi proportions (big head, short body) -
# forgiving to draw well by hand-placed rectangles and reads clearly at
# small on-screen sizes.
GW, GH = 26, 34


def draw_humanoid(pal, pose, weapon, headwear, cape=False):
    """pal: dict with keys body, body_dark, skin, trim, weapon, weapon_dark,
    hair. pose: 'walk' or 'attack'."""
    img = new_grid(GW, GH)
    d = ImageDraw.Draw(img)

    attacking = pose == "attack"
    lean = 1 if attacking else 0

    # Cape (drawn first, behind everything else) - derived from body_dark
    # rather than a separate palette entry, so callers just pass cape=True
    # without needing to also supply a dedicated cape color.
    if cape:
        cape_color = pal["body_dark"]
        px(d, 7 - lean, 12, cape_color, 12, 11)
        px(d, 7 - lean, 12, shade(cape_color, -0.3), 2, 11)

    # Legs.
    leg_y = 23
    px(d, 9 + lean, leg_y, pal["body_dark"], 4, 9)
    px(d, 13 - lean, leg_y, pal["body_dark"], 4, 9)
    px(d, 9 + lean, leg_y + 7, (30, 26, 24, 255), 4, 2)
    px(d, 13 - lean, leg_y + 7, (30, 26, 24, 255), 4, 2)

    # Torso.
    tx = 8 + lean
    px(d, tx, 12, pal["body"], 10, 11)
    px(d, tx, 12, shade(pal["body"], 0.25), 10, 2)
    px(d, tx + 7, 14, pal["body_dark"], 3, 9)
    if pal.get("trim"):
        px(d, tx, 20, pal["trim"], 10, 2)

    # Off-hand arm (left, static).
    px(d, 5 - lean, 13, pal["body_dark"], 3, 8)
    px(d, 5 - lean, 20, pal["skin"], 3, 2)

    # Weapon arm (right) - repositioned for attack pose.
    if attacking:
        px(d, tx + 8, 9, pal["body_dark"], 3, 7)
        px(d, tx + 8, 9, pal["skin"], 3, 2)
        weapon_anchor = (tx + 9, 3)
    else:
        px(d, tx + 8, 13, pal["body_dark"], 3, 8)
        px(d, tx + 8, 20, pal["skin"], 3, 2)
        weapon_anchor = (tx + 8, 18)

    draw_weapon(d, weapon, weapon_anchor, pal, attacking)

    # Head.
    hx, hy = 9 + lean, 2
    px(d, hx, hy, pal["skin"], 8, 8)
    px(d, hx, hy, shade(pal["skin"], 0.2), 8, 2)
    px(d, hx + 1, hy + 3, (40, 30, 30, 255), 1, 1)
    px(d, hx + 6, hy + 3, (40, 30, 30, 255), 1, 1)

    draw_headwear(d, headwear, hx, hy, pal)

    outline(img)
    return img


def draw_weapon(d, kind, anchor, pal, attacking):
    ax, ay = anchor
    wcol = pal["weapon"]
    wdark = pal.get("weapon_dark", shade(wcol, -0.3))

    if kind == "sword":
        length = 14 if attacking else 11
        px(d, ax, ay, wcol, 2, length)
        px(d, ax, ay + length, wdark, 2, 2)
        px(d, ax - 2, ay + length, wdark, 6, 1)
        px(d, ax, ay + length + 1, (60, 45, 30, 255), 2, 3)
    elif kind == "dagger":
        length = 8 if attacking else 6
        px(d, ax, ay, wcol, 2, length)
        px(d, ax - 1, ay + length, wdark, 4, 1)
        px(d, ax, ay + length + 1, (60, 45, 30, 255), 2, 2)
    elif kind == "staff":
        px(d, ax, ay - 2, wdark, 2, 20)
        px(d, ax - 2, ay - 5, wcol, 6, 6)
        px(d, ax - 1, ay - 4, shade(wcol, 0.3), 4, 2)
    elif kind == "bow":
        for i in range(14):
            offset = int(3 * abs((i - 6.5) / 6.5))
            px(d, ax + 3 - offset, ay - 3 + i, wcol, 2, 1)
        px(d, ax + 1, ay - 2, (230, 230, 230, 255), 1, 16)
    elif kind == "holy_symbol":
        px(d, ax - 1, ay, wdark, 2, 12)
        px(d, ax - 3, ay + 3, wdark, 6, 2)
        px(d, ax - 2, ay - 2, wcol, 4, 4)
    elif kind == "orb":
        px(d, ax - 2, ay, wdark, 2, 12)
        px(d, ax - 4, ay - 5, wcol, 6, 6)
        px(d, ax - 3, ay - 4, shade(wcol, 0.35), 3, 2)


def draw_headwear(d, kind, hx, hy, pal):
    if kind == "helmet":
        px(d, hx - 1, hy - 1, pal["trim"], 10, 4)
        px(d, hx - 1, hy - 1, shade(pal["trim"], 0.3), 10, 1)
    elif kind == "hood":
        px(d, hx - 1, hy - 2, pal["body"], 10, 5)
        px(d, hx, hy + 1, (10, 8, 12, 255), 8, 4)
    elif kind == "wizard_hat":
        px(d, hx + 1, hy - 8, pal["trim"], 6, 8)
        px(d, hx - 2, hy - 1, pal["trim"], 12, 2)
    elif kind == "halo":
        # hy is already near the canvas's top edge (head starts at y=2) -
        # a halo floating further above it would clip off-canvas entirely,
        # so this sits directly on the head's top edge instead of hovering.
        px(d, hx - 2, hy - 2, pal["weapon"], 12, 2)
    elif kind == "horns":
        px(d, hx - 2, hy - 1, pal["trim"], 2, 4)
        px(d, hx + 8, hy - 1, pal["trim"], 2, 4)
    elif kind == "cap":
        px(d, hx - 1, hy - 2, pal["trim"], 10, 3)


def outline(img):
    """1px dark outline around every opaque region - the single detail that
    makes flat color blocks read as "pixel art" instead of "blocky shapes"."""
    w, h = img.size
    src = img.load()
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            if src[x, y][3] == 0:
                continue
            dst[x, y] = src[x, y]
    for y in range(h):
        for x in range(w):
            if src[x, y][3] != 0:
                continue
            neighbors = [(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)]
            if any(0 <= nx < w and 0 <= ny < h and src[nx, ny][3] != 0 for nx, ny in neighbors):
                dst[x, y] = OUTLINE
    img.paste(out, (0, 0))


# --- Slime template --------------------------------------------------------
SW, SH = 22, 20


def draw_slime(pal):
    img = new_grid(SW, SH)
    d = ImageDraw.Draw(img)
    px(d, 3, 6, pal["body"], 16, 12)
    px(d, 5, 4, pal["body"], 12, 3)
    px(d, 3, 6, shade(pal["body"], 0.3), 5, 4)
    px(d, 14, 14, pal["body_dark"], 5, 4)
    px(d, 6, 8, (255, 255, 255, 160), 3, 2)
    px(d, 8, 12, pal["body_dark"], 1, 1)
    px(d, 13, 12, pal["body_dark"], 1, 1)
    outline(img)
    return img


# --- Pet (small creature) template -----------------------------------------
PW, PH = 20, 20


def draw_pet(pal, ears="round"):
    img = new_grid(PW, PH)
    d = ImageDraw.Draw(img)
    px(d, 15, 14, pal["body"], 4, 3)
    px(d, 17, 12, pal["body"], 3, 3)
    px(d, 3, 15, pal["body_dark"], 3, 2)
    px(d, 5, 8, pal["body"], 11, 9)
    px(d, 5, 8, shade(pal["body"], 0.3), 11, 2)
    if ears == "round":
        px(d, 4, 4, pal["body"], 4, 5)
        px(d, 13, 4, pal["body"], 4, 5)
    elif ears == "pointy":
        px(d, 4, 3, pal["body"], 3, 6)
        px(d, 14, 3, pal["body"], 3, 6)
    elif ears == "wing":
        px(d, 1, 8, pal["trim"], 4, 6)
        px(d, 16, 8, pal["trim"], 4, 6)
        px(d, 2, 7, pal["trim"], 2, 2)
        px(d, 17, 7, pal["trim"], 2, 2)
    elif ears == "none":
        pass
    px(d, 7, 12, (20, 16, 24, 255), 2, 2)
    px(d, 12, 12, (20, 16, 24, 255), 2, 2)
    px(d, 15, 10, pal["trim"], 3, 3)
    outline(img)
    return img


# --- Castle template ---------------------------------------------------
CW, CH = 32, 30


def draw_castle():
    img = new_grid(CW, CH)
    d = ImageDraw.Draw(img)
    stone = (150, 145, 138, 255)
    stone_dark = shade(stone, -0.35)
    stone_light = shade(stone, 0.2)
    roof = (150, 40, 40, 255)

    px(d, 4, 12, stone, 24, 16)
    for ty in range(13, 27, 3):
        px(d, 4, ty, stone_dark, 24, 1)

    for tower_x in (2, 24):
        px(d, tower_x, 6, stone, 6, 22)
        px(d, tower_x, 6, stone_light, 6, 2)
        px(d, tower_x - 1, 2, roof, 8, 5)
        px(d, tower_x + 2, 0, (230, 230, 230, 255), 1, 3)

    px(d, 10, 8, stone, 12, 4)
    px(d, 10, 8, stone_light, 12, 1)
    px(d, 12, 4, (120, 30, 30, 255), 2, 5)
    px(d, 18, 4, (120, 30, 30, 255), 2, 5)

    px(d, 12, 19, (60, 45, 35, 255), 8, 9)
    px(d, 13, 21, (30, 22, 18, 255), 6, 7)

    outline(img)
    return img


SKIN_HUMAN = (235, 190, 150, 255)
SKIN_PALE = (215, 210, 205, 255)

# --- Hero classes (base) ----------------------------------------------------
HERO_CLASSES = {
    "warrior": dict(body=(150, 40, 40, 255), body_dark=(60, 60, 68, 255), skin=SKIN_HUMAN,
                     trim=(200, 170, 60, 255), weapon=(210, 210, 220, 255), weapon_kind="sword", headwear="helmet"),
    "mage": dict(body=(90, 60, 160, 255), body_dark=(50, 35, 100, 255), skin=SKIN_HUMAN,
                  trim=(180, 150, 230, 255), weapon=(190, 140, 230, 255), weapon_kind="orb", headwear="wizard_hat"),
    "paladin": dict(body=(225, 220, 200, 255), body_dark=(170, 165, 140, 255), skin=SKIN_HUMAN,
                     trim=(230, 190, 70, 255), weapon=(230, 190, 70, 255), weapon_kind="holy_symbol", headwear="helmet"),
    "summoner": dict(body=(45, 30, 60, 255), body_dark=(25, 18, 38, 255), skin=SKIN_PALE,
                       trim=(140, 90, 200, 255), weapon=(160, 100, 220, 255), weapon_kind="orb", headwear="hood"),
    "archer": dict(body=(70, 110, 60, 255), body_dark=(60, 45, 35, 255), skin=SKIN_HUMAN,
                    trim=(120, 90, 55, 255), weapon=(140, 100, 60, 255), weapon_kind="bow", headwear="cap"),
    "assassin": dict(body=(45, 45, 55, 255), body_dark=(25, 25, 32, 255), skin=SKIN_HUMAN,
                       trim=(140, 30, 40, 255), weapon=(200, 200, 210, 255), weapon_kind="dagger", headwear="hood"),
    "priest": dict(body=(235, 235, 240, 255), body_dark=(180, 195, 210, 255), skin=SKIN_HUMAN,
                    trim=(110, 190, 200, 255), weapon=(230, 210, 130, 255), weapon_kind="holy_symbol", headwear="cap"),
    "special": dict(body=(30, 110, 110, 255), body_dark=(20, 70, 75, 255), skin=SKIN_PALE,
                      trim=(230, 190, 70, 255), weapon=(230, 190, 70, 255), weapon_kind="orb", headwear="halo"),
}

# --- Evolution branches (2 per class) ---------------------------------------
EVOLUTION_BRANCHES = {
    "warrior-berserker": dict(base="warrior", body=(190, 60, 30, 255), body_dark=(80, 40, 30, 255),
                                trim=(255, 120, 30, 255), weapon=(230, 230, 230, 255), weapon_kind="sword", headwear="horns"),
    "warrior-guardian": dict(base="warrior", body=(60, 90, 150, 255), body_dark=(50, 60, 80, 255),
                               trim=(190, 200, 220, 255), weapon=(210, 210, 220, 255), weapon_kind="sword", headwear="helmet", cape=True),
    "mage-pyromancer": dict(base="mage", body=(180, 60, 30, 255), body_dark=(90, 30, 20, 255),
                              trim=(255, 150, 40, 255), weapon=(255, 140, 40, 255), weapon_kind="orb", headwear="wizard_hat"),
    "mage-cryomancer": dict(base="mage", body=(60, 130, 200, 255), body_dark=(35, 80, 130, 255),
                              trim=(190, 230, 250, 255), weapon=(150, 220, 250, 255), weapon_kind="orb", headwear="wizard_hat"),
    "paladin-lightbringer": dict(base="paladin", body=(250, 240, 210, 255), body_dark=(230, 200, 100, 255),
                                   trim=(255, 215, 90, 255), weapon=(255, 235, 150, 255), weapon_kind="holy_symbol", headwear="halo"),
    "paladin-inquisitor": dict(base="paladin", body=(70, 30, 35, 255), body_dark=(35, 18, 20, 255),
                                 trim=(160, 30, 40, 255), weapon=(210, 210, 220, 255), weapon_kind="sword", headwear="helmet"),
    "summoner-soul": dict(base="summoner", body=(35, 55, 45, 255), body_dark=(20, 35, 28, 255),
                            trim=(120, 220, 170, 255), weapon=(140, 230, 190, 255), weapon_kind="orb", headwear="hood"),
    "summoner-elemental": dict(base="summoner", body=(150, 70, 30, 255), body_dark=(80, 45, 25, 255),
                                 trim=(250, 160, 60, 255), weapon=(250, 170, 60, 255), weapon_kind="orb", headwear="horns"),
    "archer-windrunner": dict(base="archer", body=(40, 140, 130, 255), body_dark=(30, 90, 85, 255),
                                trim=(160, 230, 220, 255), weapon=(140, 100, 60, 255), weapon_kind="bow", headwear="cap", cape=True),
    "archer-deadeye": dict(base="archer", body=(60, 40, 40, 255), body_dark=(35, 22, 22, 255),
                             trim=(160, 30, 40, 255), weapon=(90, 70, 45, 255), weapon_kind="bow", headwear="cap"),
    "assassin-shadowfang": dict(base="assassin", body=(30, 20, 45, 255), body_dark=(18, 12, 28, 255),
                                  trim=(140, 60, 200, 255), weapon=(190, 150, 230, 255), weapon_kind="dagger", headwear="hood"),
    "assassin-executioner": dict(base="assassin", body=(30, 25, 28, 255), body_dark=(15, 12, 14, 255),
                                   trim=(160, 20, 30, 255), weapon=(210, 210, 210, 255), weapon_kind="dagger", headwear="hood", cape=True),
    "priest-lightweaver": dict(base="priest", body=(255, 245, 220, 255), body_dark=(230, 200, 110, 255),
                                 trim=(255, 215, 100, 255), weapon=(255, 230, 140, 255), weapon_kind="holy_symbol", headwear="halo"),
    "priest-oracle": dict(base="priest", body=(80, 60, 120, 255), body_dark=(50, 35, 80, 255),
                            trim=(120, 200, 210, 255), weapon=(150, 220, 220, 255), weapon_kind="holy_symbol", headwear="hood"),
    "special-warden": dict(base="special", body=(90, 100, 95, 255), body_dark=(55, 65, 60, 255),
                             trim=(150, 200, 160, 255), weapon=(180, 190, 200, 255), weapon_kind="staff", headwear="helmet"),
    "special-arbiter": dict(base="special", body=(80, 40, 110, 255), body_dark=(45, 22, 65, 255),
                              trim=(230, 190, 70, 255), weapon=(230, 190, 90, 255), weapon_kind="staff", headwear="halo"),
}

# --- Enemies -----------------------------------------------------------
GOBLIN_PAL = dict(body=(90, 130, 60, 255), body_dark=(70, 60, 50, 255), skin=(110, 150, 70, 255),
                    trim=(120, 90, 50, 255), weapon=(150, 110, 60, 255))
ZOMBIE_PAL = dict(body=(70, 80, 60, 255), body_dark=(45, 40, 45, 255), skin=(140, 155, 130, 255),
                    trim=None, weapon=(150, 110, 60, 255))
WITCH_PAL = dict(body=(70, 40, 90, 255), body_dark=(40, 22, 55, 255), skin=(200, 190, 210, 255),
                   trim=(150, 100, 190, 255), weapon=(120, 200, 140, 255))
BOSS_PAL = dict(body=(60, 15, 20, 255), body_dark=(25, 8, 10, 255), skin=(150, 40, 40, 255),
                  trim=(255, 100, 30, 255), weapon=(80, 80, 90, 255))

# --- Pets ----------------------------------------------------------------
PETS = {
    "baby_dragon": dict(body=(230, 210, 90, 255), body_dark=(200, 170, 50, 255), trim=(255, 240, 150, 255), ears="wing"),
    "vine_sprite": dict(body=(90, 170, 80, 255), body_dark=(55, 120, 55, 255), trim=(190, 230, 130, 255), ears="round"),
    "frost_kit": dict(body=(150, 210, 235, 255), body_dark=(100, 170, 210, 255), trim=(230, 250, 255, 255), ears="pointy"),
    "sun_phoenix_chick": dict(body=(250, 170, 60, 255), body_dark=(220, 110, 30, 255), trim=(255, 220, 120, 255), ears="wing"),
    "shadow_wisp": dict(body=(70, 45, 100, 255), body_dark=(40, 25, 65, 255), trim=(170, 130, 230, 255), ears="none"),
    "ember_hound": dict(body=(210, 70, 40, 255), body_dark=(160, 40, 25, 255), trim=(255, 170, 60, 255), ears="pointy"),
    "star_wyrmling": dict(body=(120, 90, 210, 255), body_dark=(80, 60, 160, 255), trim=(255, 210, 250, 255), ears="wing"),
}


def hero_frame(pal, pose):
    return draw_humanoid(
        {k: pal[k] for k in ("body", "body_dark", "skin", "trim", "weapon") if k in pal},
        pose,
        pal["weapon_kind"],
        pal["headwear"],
        cape=pal.get("cape", False),
    )


def main():
    # Base hero classes.
    for class_id, pal in HERO_CLASSES.items():
        save(hero_frame(pal, "walk"), f"heroes/{class_id}_walk.png")
        save(hero_frame(pal, "attack"), f"heroes/{class_id}_attack.png")

    # Evolution branches - inherit any key not overridden from their base class.
    for branch_id, overrides in EVOLUTION_BRANCHES.items():
        pal = dict(HERO_CLASSES[overrides["base"]])
        pal.update(overrides)
        file_id = branch_id.replace("-", "_")
        save(hero_frame(pal, "walk"), f"heroes/evolved/{file_id}_walk.png")
        save(hero_frame(pal, "attack"), f"heroes/evolved/{file_id}_attack.png")

    # Enemies.
    save(draw_humanoid(GOBLIN_PAL, "walk", "dagger", "cap"), "enemies/goblin.png")
    save(draw_slime(dict(body=(90, 200, 140, 255), body_dark=(50, 150, 100, 255))), "enemies/slime.png")
    save(draw_humanoid(ZOMBIE_PAL, "attack", None, None), "enemies/zombie.png")
    save(draw_humanoid(WITCH_PAL, "walk", "staff", "wizard_hat"), "enemies/witch.png")
    save(draw_humanoid(BOSS_PAL, "attack", "sword", "horns"), "enemies/demon_boss.png")

    # Pets.
    for pet_id, pal in PETS.items():
        save(draw_pet(pal, ears=pal["ears"]), f"pets/{pet_id}.png")

    # Castle.
    save(draw_castle(), "towers/castle.png")


if __name__ == "__main__":
    main()
