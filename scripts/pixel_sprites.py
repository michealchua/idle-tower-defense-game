"""Procedural stylized-2D character-art generator for tataKAI.

v2 rewrite: same chibi humanoid / slime / pet / castle pose geometry as the
original flat-color generator (identical logical-grid anchors, so every
silhouette and animation pose reads exactly the same), but every shape is now
rendered with layered shading instead of a single flat fill - vertical
gradients, rim/ambient light, specular sheen on metal, cloth folds, soft
contact-shadow AO at limb joints, face detail (brows/eyes/blush/mouth),
layered hair, weapon detail (gradient blade + tip glint + hilt wraps), and a
soft anti-aliased outline (dilation-based, not the old hard 1px neighbor
ring).

Resolution strategy: every pose is drawn ONCE at a ~2048px-long-edge "master"
resolution (all the shading above is generated at that resolution so detail
and AA quality is baked in), then that single master buffer is downsampled
with Lanczos resampling to every other tier - no re-drawing per tier.

  - art/sprite_master/<same path>.png   2048-class long edge, NOT shipped
    (not under public/, vite never bundles it) - the actual "source art",
    kept locally for reference/future re-export at other sizes.
  - public/sprites/<same path>.png      ~320px-long-edge "production" tier -
    what CanvasRenderer.ts actually loads. Deliberately sized several times
    larger than any on-screen entity radius (see CanvasRenderer's
    HERO_RADIUS/ENEMY_RADIUS/PET_RADIUS - max on-screen size is roughly
    100-120px even for a 3.5x boss) for HiDPI headroom, while staying well
    outside isFrameSheet's width[64,384]-AND-height[64,192] frame-sheet
    detection range (long edge 320 > 192 keeps every one of these safely
    treated as a static illustration, never mis-sliced as an animation
    sheet).
  - art/sprite_variants/{256,128,64}/<same path>.png  optional smaller
    export tiers, NOT wired into the renderer today (this project has no
    multi-resolution/mipmap asset selection) - kept as available downsized
    assets for a possible future low-quality/mobile mode. 128 and 64 in
    particular MUST NOT be dropped into public/sprites/ as-is: those long
    edges land inside isFrameSheet's frame-sheet detection window and would
    get mis-sliced as a 32x32 animation sheet by CanvasRenderer.

Run: python scripts/pixel_sprites.py
"""

import os
import random
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SPRITES = os.path.join(ROOT, "public", "sprites")
MASTER_DIR = os.path.join(ROOT, "art", "sprite_master")
VARIANTS_DIR = os.path.join(ROOT, "art", "sprite_variants")

MASTER_LONG_EDGE = 2048
PRODUCTION_LONG_EDGE = 320
VARIANT_LONG_EDGES = (256, 128, 64)

OUTLINE = (18, 14, 20, 255)

# Deterministic noise/texture across runs - a re-run of this script should
# reproduce byte-identical output, not shuffle every file's grain pattern.
random.seed(20260818)


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


def with_alpha(color, alpha):
    return (color[0], color[1], color[2], alpha)


# --- low-level rendering primitives -----------------------------------------

_mask_cache = {}


def _rounded_mask(w, h, radius_frac):
    key = (w, h, round(radius_frac, 3))
    cached = _mask_cache.get(key)
    if cached is not None:
        return cached
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    radius = max(0, int(min(w, h) * radius_frac))
    md.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=255)
    _mask_cache[key] = mask
    return mask


def _vgradient(w, h, top, bottom, steps=None):
    """Smooth vertical gradient of size (w, h) - built as a tiny N-row strip
    and stretched with a fast C-side resize instead of a per-row Python
    loop, so this stays cheap even at master (2048px-class) resolution."""
    steps = steps or max(2, min(48, h))
    strip = Image.new("RGBA", (1, steps))
    for i in range(steps):
        t = i / (steps - 1) if steps > 1 else 0.0
        strip.putpixel((0, i), tuple(int(top[k] + (bottom[k] - top[k]) * t) for k in range(4)))
    return strip.resize((max(1, w), max(1, h)), Image.BILINEAR)


def _noise_tile(w, h, base_alpha):
    """Small random speckle tile stretched to size - cheap stand-in for
    fabric/stone grain ("材质区分"/"局部纹理") without a per-pixel Python
    loop at full resolution."""
    tw, th = 24, 24
    tile = Image.new("L", (tw, th))
    px = tile.load()
    for y in range(th):
        for x in range(tw):
            px[x, y] = base_alpha + random.randint(-base_alpha, base_alpha)
    return tile.resize((max(1, w), max(1, h)), Image.BILINEAR)


class Canvas:
    """Draws in *logical* grid units (the same 26x34/22x20/etc. coordinate
    space the original flat generator used) against a backing image sized at
    `scale` pixels per logical unit. Every existing pose's hand-tuned anchor
    numbers keep working unchanged - only the fill primitives changed."""

    def __init__(self, logical_w, logical_h, scale):
        self.lw, self.lh = logical_w, logical_h
        self.scale = scale
        self.w = max(1, round(logical_w * scale))
        self.h = max(1, round(logical_h * scale))
        self.img = Image.new("RGBA", (self.w, self.h), (0, 0, 0, 0))
        self.draw = ImageDraw.Draw(self.img, "RGBA")

    def _rect_px(self, x, y, w, h):
        x0 = int(round(x * self.scale))
        y0 = int(round(y * self.scale))
        x1 = int(round((x + w) * self.scale))
        y1 = int(round((y + h) * self.scale))
        return x0, y0, max(x0 + 1, x1), max(y0 + 1, y1)

    def panel(self, x, y, w, h, color, mode="body", radius_frac=0.22, light_amount=0.32, dark_amount=-0.30):
        """Gradient-filled rounded panel with rim light and an optional
        material pass (cloth folds / metal sheen). Replaces the old flat
        px() rectangle - this is the single workhorse every body part,
        garment, and armor plate is built from."""
        x0, y0, x1, y1 = self._rect_px(x, y, w, h)
        ww, hh = x1 - x0, y1 - y0
        top = shade(color, light_amount)
        bottom = shade(color, dark_amount)
        grad = _vgradient(ww, hh, top, bottom)
        mask = _rounded_mask(ww, hh, radius_frac)
        self.img.paste(grad, (x0, y0), mask)

        if mode == "cloth":
            self._texture(x0, y0, ww, hh, mask, alpha=14)
            self._folds(x0, y0, ww, hh, color)
        elif mode == "metal":
            self._texture(x0, y0, ww, hh, mask, alpha=8)
            self._sheen(x0, y0, ww, hh)
        elif mode == "skin":
            pass
        elif mode == "stone":
            self._texture(x0, y0, ww, hh, mask, alpha=20)

        self._rim(x0, y0, ww, hh, color, mask)
        self._seam(x0, y0, x1 - 1, y1 - 1, radius_frac)
        return x0, y0, ww, hh

    def _seam(self, x0, y0, x1, y1, radius_frac):
        """Thin dark stroke around every panel's own boundary - the old flat
        generator got part-to-part separation for free from hard-edged flat
        colors; gradient-shaded panels need an explicit seam so an arm
        overlapping a torso (etc.) still reads as two distinct pieces
        instead of blurring into one shape."""
        radius = max(0, int(min(x1 - x0, y1 - y0) * radius_frac))
        self.draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, outline=with_alpha(OUTLINE, 150), width=max(1, int(min(x1 - x0, y1 - y0) * 0.025)))

    def _rim(self, x0, y0, w, h, base_color, mask):
        """Soft light-source streak along the upper-left inner edge -
        cheap stand-in for ambient/rim lighting on every panel."""
        rim_color = shade(base_color, 0.6)
        band = max(1, int(min(w, h) * 0.16))
        overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        od = ImageDraw.Draw(overlay, "RGBA")
        od.rounded_rectangle([0, 0, w - 1, band], radius=max(1, band // 2), fill=with_alpha(rim_color, 95))
        od.rounded_rectangle([0, 0, band, h - 1], radius=max(1, band // 2), fill=with_alpha(rim_color, 55))
        overlay.putalpha(ImageChops.multiply(overlay.split()[3], mask))
        self.img.paste(overlay, (x0, y0), overlay)

    def _texture(self, x0, y0, w, h, mask, alpha):
        tile = _noise_tile(w, h, alpha)
        tile = ImageChops.multiply(tile, mask)
        layer = Image.new("RGBA", (w, h), (0, 0, 0, 255))
        layer.putalpha(tile)
        self.img.paste(layer, (x0, y0), layer)

    def _folds(self, x0, y0, w, h, base_color):
        fold_color = with_alpha(shade(base_color, -0.4), 80)
        width = max(1, int(min(w, h) * 0.035))
        for i in (1, 2):
            yy = y0 + int(h * (i / 3.0))
            self.draw.line(
                [(x0 + w * 0.14, yy), (x0 + w * 0.82, yy + h * 0.08)],
                fill=fold_color,
                width=width,
            )

    def _sheen(self, x0, y0, w, h):
        sheen = with_alpha((255, 255, 255, 255), 45)
        width = max(1, int(w * 0.09))
        self.draw.line(
            [(x0 + w * 0.24, y0 + h * 0.12), (x0 + w * 0.36, y0 + h * 0.5)],
            fill=sheen,
            width=width,
        )

    def rivets(self, x, y, w, h, color, count=2):
        rivet_color = shade(color, -0.5)
        x0, y0, x1, y1 = self._rect_px(x, y, w, h)
        ww = x1 - x0
        r = max(1, int(min(x1 - x0, y1 - y0) * 0.08))
        for i in range(count):
            cx = x0 + int(ww * (i + 1) / (count + 1))
            cy = y0 + int((y1 - y0) * 0.5)
            self.draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=rivet_color)
            self.draw.ellipse([cx - r // 2, cy - r // 2, cx + 1, cy + 1], fill=shade(color, 0.4))

    def blob(self, x, y, w, h, color, mode="skin"):
        return self.panel(x, y, w, h, color, mode=mode, radius_frac=0.5, light_amount=0.28, dark_amount=-0.22)

    def soft_shadow(self, x, y, w, h, alpha=90):
        """Soft translucent contact-shadow ellipse - used at limb/torso
        joints for ambient occlusion ("深度和立体感") instead of a hard
        seam line."""
        x0, y0, x1, y1 = self._rect_px(x, y, w, h)
        layer = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer, "RGBA")
        ld.ellipse([x0, y0, x1, y1], fill=(0, 0, 0, alpha))
        blur_radius = max(1, int((x1 - x0) * 0.35))
        layer = layer.filter(ImageFilter.GaussianBlur(radius=blur_radius))
        self.img.paste(layer, (0, 0), layer)

    def glow(self, x, y, r, color, alpha=140):
        x0, y0, x1, y1 = self._rect_px(x - r, y - r, r * 2, r * 2)
        layer = Image.new("RGBA", self.img.size, (0, 0, 0, 0))
        ld = ImageDraw.Draw(layer, "RGBA")
        ld.ellipse([x0, y0, x1, y1], fill=with_alpha(color, alpha))
        blur_radius = max(1, int((x1 - x0) * 0.3))
        layer = layer.filter(ImageFilter.GaussianBlur(radius=blur_radius))
        self.img.paste(layer, (0, 0), layer)
        core_r = max(1, int((x1 - x0) * 0.28))
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        self.draw.ellipse([cx - core_r, cy - core_r, cx + core_r, cy + core_r], fill=shade(color, 0.5))

    def line(self, x0, y0, x1, y1, color, width_frac=0.05, alpha=255):
        _, _, w_px, h_px = self._rect_px(0, 0, self.lw, self.lh)
        width = max(1, int(min(w_px, h_px) * width_frac / max(self.lw, self.lh)))
        sx0, sy0 = x0 * self.scale, y0 * self.scale
        sx1, sy1 = x1 * self.scale, y1 * self.scale
        self.draw.line([(sx0, sy0), (sx1, sy1)], fill=with_alpha(color, alpha), width=width)

    def dot(self, x, y, w, h, color, alpha=255):
        x0, y0, x1, y1 = self._rect_px(x, y, w, h)
        self.draw.ellipse([x0, y0, x1, y1], fill=with_alpha(color, alpha))

    def apply_outline(self, thickness_frac=0.006):
        """Dilation-based outline: fast (C-side MaxFilter, not a per-pixel
        Python loop) regardless of master resolution, and reads as smoothly
        anti-aliased once the whole image is later Lanczos-downsampled to
        production size - no explicit AA math needed here."""
        thickness = max(2, int(max(self.w, self.h) * thickness_frac))
        if thickness % 2 == 0:
            thickness += 1
        alpha = self.img.split()[3]
        dilated = alpha.filter(ImageFilter.MaxFilter(thickness))
        ring = ImageChops.subtract(dilated, alpha)
        layer = Image.new("RGBA", self.img.size, OUTLINE)
        layer.putalpha(ring)
        self.img = Image.alpha_composite(layer, self.img)
        self.draw = ImageDraw.Draw(self.img, "RGBA")


# --- multi-tier export -------------------------------------------------------

def _resize_long_edge(img, target_long_edge):
    w, h = img.size
    scale = target_long_edge / max(w, h)
    nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
    return img.resize((nw, nh), Image.LANCZOS)


def _save_png(img, full_path, optimize=False):
    os.makedirs(os.path.dirname(full_path), exist_ok=True)
    img.save(full_path, optimize=optimize)


def save_all_tiers(master_img, relpath):
    # optimize=True only for the production tier (what actually ships in
    # public/sprites and affects repo/bundle size) - master/variants are
    # local build artifacts, not worth the extra compression-search time.
    _save_png(master_img, os.path.join(MASTER_DIR, relpath))

    production = _resize_long_edge(master_img, PRODUCTION_LONG_EDGE)
    _save_png(production, os.path.join(SPRITES, relpath), optimize=True)

    for edge in VARIANT_LONG_EDGES:
        variant = _resize_long_edge(master_img, edge)
        _save_png(variant, os.path.join(VARIANTS_DIR, str(edge), relpath))

    print("wrote", relpath, "master", master_img.size, "prod", production.size, flush=True)


def master_scale(logical_w, logical_h):
    return MASTER_LONG_EDGE / max(logical_w, logical_h)


# --- Humanoid template ----------------------------------------------------
# Same 26 wide x 34 tall logical grid and chibi proportions as the original
# generator - every anchor number below is unchanged, only the fill calls are
# richer.
GW, GH = 26, 34


def hair_color_for(pal):
    """No hero palette hand-authors a hair color - derive one from the
    existing trim/body_dark tones so every class/evolution automatically
    gets a plausible, thematically-matching hair tone instead of needing 24
    new palette entries."""
    base = pal.get("trim") or pal["body_dark"]
    return shade(base, -0.35)


def draw_face(c, hx, hy, pal, hurting):
    """Eyebrows, eyes (iris + glint), blush, mouth - all cheap single draws
    layered on top of the head panel."""
    brow_color = shade(pal["skin"], -0.55)
    if hurting:
        c.line(hx + 1, hy + 3, hx + 2.4, hy + 3, brow_color, width_frac=0.14, alpha=220)
        c.line(hx + 5, hy + 3, hx + 6.4, hy + 3, brow_color, width_frac=0.14, alpha=220)
        c.dot(hx + 3.4, hy + 5.4, 1.2, 0.5, shade(pal["skin"], -0.4), alpha=200)
        return

    c.line(hx + 1, hy + 2.3, hx + 2.6, hy + 2, brow_color, width_frac=0.12, alpha=210)
    c.line(hx + 5.4, hy + 2, hx + 7, hy + 2.3, brow_color, width_frac=0.12, alpha=210)

    eye_dark = (32, 24, 30, 255)
    c.dot(hx + 1, hy + 3, 1.4, 1.4, eye_dark)
    c.dot(hx + 5.6, hy + 3, 1.4, 1.4, eye_dark)
    c.dot(hx + 1.5, hy + 3.1, 0.5, 0.5, (255, 255, 255, 230))
    c.dot(hx + 6.1, hy + 3.1, 0.5, 0.5, (255, 255, 255, 230))

    blush = with_alpha(shade(pal["skin"], -0.15), 90)
    c.dot(hx + 0.4, hy + 4.6, 1.3, 0.8, blush, alpha=90)
    c.dot(hx + 6.3, hy + 4.6, 1.3, 0.8, blush, alpha=90)

    c.line(hx + 3.2, hy + 5.6, hx + 4.8, hy + 5.6, shade(pal["skin"], -0.35), width_frac=0.08, alpha=160)


def draw_hair(c, hx, hy, pal, headwear):
    """Layered hair patch drawn before headwear - fully covered by
    hood/helmet, peeks out for cap/halo/horns/no-headwear so every class
    still reads as having actual hair, not a bald color block."""
    hair = hair_color_for(pal)
    if headwear in ("hood", "helmet"):
        return
    c.panel(hx - 0.6, hy - 1.2, 9.2, 3.2, hair, mode="body", radius_frac=0.55, light_amount=0.22, dark_amount=-0.3)
    c.panel(hx - 1.1, hy + 0.5, 1.8, 3.4, hair, mode="body", radius_frac=0.6, light_amount=0.15, dark_amount=-0.25)
    c.panel(hx + 7.3, hy + 0.5, 1.8, 3.4, hair, mode="body", radius_frac=0.6, light_amount=0.15, dark_amount=-0.25)
    c.line(hx + 0.6, hy - 0.6, hx + 2.6, hy - 1.0, shade(hair, 0.4), width_frac=0.05, alpha=140)


def draw_humanoid(pal, pose, weapon, headwear, cape=False, armored=False):
    """pal: dict with keys body, body_dark, skin, trim, weapon, weapon_dark.
    pose/weapon/headwear/cape: identical contract to the original generator
    (see git history) - 'walk'/'attack'/'hurt'/'cast'/'victory'/'idle2'.
    armored: True paints torso/arms/legs with the 'metal' material pass
    (sheen + rivets) instead of 'cloth' (folds) - derived by callers from
    headwear='helmet' rather than a new palette key, so no palette table
    needed edits."""
    scale = master_scale(GW, GH)
    c = Canvas(GW, GH, scale)

    attacking = pose == "attack"
    hurting = pose == "hurt"
    casting = pose == "cast"
    celebrating = pose == "victory"
    lean = 1 if attacking else (-1 if hurting else 0)
    body_mode = "metal" if armored else "cloth"

    if cape:
        cape_color = pal["body_dark"]
        c.panel(7 - lean, 12, 12, 11, cape_color, mode="cloth", radius_frac=0.12)

    # Legs + boots.
    leg_y = 23
    c.panel(9 + lean, leg_y, 4, 9, pal["body_dark"], mode=body_mode, radius_frac=0.28)
    c.panel(13 - lean, leg_y, 4, 9, pal["body_dark"], mode=body_mode, radius_frac=0.28)
    c.panel(9 + lean, leg_y + 7, 4, 2, (30, 26, 24, 255), mode="metal", radius_frac=0.3)
    c.panel(13 - lean, leg_y + 7, 4, 2, (30, 26, 24, 255), mode="metal", radius_frac=0.3)
    c.soft_shadow(9 + lean, leg_y - 1, 8 - 2 * lean, 2.4, alpha=70)

    # Torso.
    tx = 8 + lean
    c.panel(tx, 12, 10, 11, pal["body"], mode=body_mode, radius_frac=0.22)
    if pal.get("trim"):
        c.panel(tx, 20, 10, 2, pal["trim"], mode="metal", radius_frac=0.3)
    if armored:
        c.rivets(tx + 1, 14, 8, 1, pal["trim"] or pal["body"], count=3)
    c.soft_shadow(tx + 1, 20.5, 8, 2, alpha=55)

    # Off-hand arm.
    if hurting:
        c.panel(4 - lean, 6, 3, 8, pal["body_dark"], mode=body_mode, radius_frac=0.4)
        c.blob(4 - lean, 4, 3, 3, pal["skin"])
    elif casting:
        c.panel(5 - lean, 6, 3, 8, pal["body_dark"], mode=body_mode, radius_frac=0.4)
        c.blob(5 - lean, 3, 3, 3, pal["skin"])
        spark_color = pal.get("trim") or pal["weapon"]
        c.glow(6.5 - lean, 1, 1.6, spark_color, alpha=170)
    elif celebrating:
        c.panel(5 - lean, 6, 3, 8, pal["body_dark"], mode=body_mode, radius_frac=0.4)
        c.blob(5 - lean, 3, 3, 3, pal["skin"])
    else:
        c.panel(5 - lean, 13, 3, 8, pal["body_dark"], mode=body_mode, radius_frac=0.4)
        c.blob(5 - lean, 20, 3, 2, pal["skin"])

    # Weapon arm.
    if attacking:
        c.panel(tx + 8, 9, 3, 7, pal["body_dark"], mode=body_mode, radius_frac=0.4)
        c.blob(tx + 8, 9, 3, 2, pal["skin"])
        draw_weapon(c, weapon, (tx + 9, 3), pal, True)
    elif celebrating:
        c.panel(tx + 8, 6, 3, 8, pal["body_dark"], mode=body_mode, radius_frac=0.4)
        c.blob(tx + 8, 3, 3, 3, pal["skin"])
        draw_weapon(c, weapon, (tx + 9, 0), pal, True)
    else:
        c.panel(tx + 8, 13, 3, 8, pal["body_dark"], mode=body_mode, radius_frac=0.4)
        c.blob(tx + 8, 20, 3, 2, pal["skin"])
        draw_weapon(c, weapon, (tx + 8, 18), pal, False)

    # Head.
    head_lift = 1 if pose == "idle2" else 0
    hx, hy = 9 + lean, 2 - head_lift
    draw_hair(c, hx, hy, pal, headwear)
    c.blob(hx, hy, 8, 8, pal["skin"], mode="skin")
    draw_face(c, hx, hy, pal, hurting)
    draw_headwear(c, headwear, hx, hy, pal)

    c.apply_outline()
    return c.img


def draw_humanoid_down(pal, headwear, cape=False, armored=False):
    """Collapsed/kneeling pose for a downed hero - structurally distinct
    silhouette (bent legs, slumped torso, lowered head), no weapon drawn."""
    scale = master_scale(GW, GH)
    c = Canvas(GW, GH, scale)
    body_mode = "metal" if armored else "cloth"

    leg_y = 27
    c.panel(6, leg_y, 6, 5, pal["body_dark"], mode=body_mode, radius_frac=0.3)
    c.panel(15, leg_y, 6, 5, pal["body_dark"], mode=body_mode, radius_frac=0.3)
    c.panel(6, leg_y + 4, 6, 2, (30, 26, 24, 255), mode="metal", radius_frac=0.3)
    c.panel(15, leg_y + 4, 6, 2, (30, 26, 24, 255), mode="metal", radius_frac=0.3)

    if cape:
        c.panel(6, 16, 14, 10, pal["body_dark"], mode="cloth", radius_frac=0.12)

    c.panel(7, 16, 12, 10, pal["body"], mode=body_mode, radius_frac=0.2, dark_amount=-0.4)
    if pal.get("trim"):
        c.panel(7, 23, 12, 2, pal["trim"], mode="metal", radius_frac=0.3)
    c.soft_shadow(9, 25.5, 8, 2.2, alpha=80)

    c.panel(4, 18, 3, 8, pal["body_dark"], mode=body_mode, radius_frac=0.4)
    c.panel(19, 18, 3, 8, pal["body_dark"], mode=body_mode, radius_frac=0.4)
    c.blob(4, 25, 3, 2, pal["skin"])
    c.blob(19, 25, 3, 2, pal["skin"])

    hx, hy = 9, 8
    draw_hair(c, hx, hy, pal, headwear)
    c.blob(hx, hy, 8, 8, pal["skin"], mode="skin")
    eye_dark = (40, 30, 30, 255)
    c.line(hx + 1, hy + 4, hx + 2.4, hy + 4, eye_dark, width_frac=0.1, alpha=220)
    c.line(hx + 5, hy + 4, hx + 6.4, hy + 4, eye_dark, width_frac=0.1, alpha=220)
    draw_headwear(c, headwear, hx, hy, pal)

    c.apply_outline()
    return c.img


def draw_weapon(c, kind, anchor, pal, attacking):
    if kind is None:
        return
    ax, ay = anchor
    wcol = pal["weapon"]
    wdark = pal.get("weapon_dark", shade(wcol, -0.3))

    if kind == "sword":
        length = 14 if attacking else 11
        c.panel(ax, ay, 2, length, wcol, mode="metal", radius_frac=0.15)
        c.panel(ax, ay + length, 2, 2, wdark, mode="metal", radius_frac=0.15)
        c.panel(ax - 2, ay + length, 6, 1, wdark, mode="metal", radius_frac=0.4)
        c.panel(ax, ay + length + 1, 2, 3, (60, 45, 30, 255), mode="body", radius_frac=0.2)
        c.dot(ax + 0.6, ay - 0.6, 0.7, 0.7, (255, 255, 255, 255), alpha=200)
    elif kind == "dagger":
        length = 8 if attacking else 6
        c.panel(ax, ay, 2, length, wcol, mode="metal", radius_frac=0.2)
        c.panel(ax - 1, ay + length, 4, 1, wdark, mode="metal", radius_frac=0.4)
        c.panel(ax, ay + length + 1, 2, 2, (60, 45, 30, 255), mode="body", radius_frac=0.2)
    elif kind == "staff":
        c.panel(ax, ay - 2, 2, 20, wdark, mode="metal", radius_frac=0.4)
        c.blob(ax - 2, ay - 5, 6, 6, wcol)
        c.glow(ax + 1, ay - 2, 1.6, shade(wcol, 0.3), alpha=150)
    elif kind == "bow":
        pts = []
        for i in range(15):
            offset = 3 * abs((i - 7) / 7)
            pts.append((ax + 3 - offset, ay - 3 + i))
        for i in range(len(pts) - 1):
            c.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], wcol, width_frac=0.09)
        c.line(ax + 1.5, ay - 2, ax + 1.5, ay + 12, (230, 230, 230, 255), width_frac=0.03, alpha=220)
    elif kind == "holy_symbol":
        c.panel(ax - 1, ay, 2, 12, wdark, mode="metal", radius_frac=0.3)
        c.panel(ax - 3, ay + 3, 6, 2, wdark, mode="metal", radius_frac=0.3)
        c.glow(ax, ay - 1, 2.2, wcol, alpha=160)
    elif kind == "orb":
        c.panel(ax - 2, ay, 2, 12, wdark, mode="metal", radius_frac=0.3)
        c.glow(ax - 1, ay - 2, 1.9, wcol, alpha=130)


def draw_headwear(c, kind, hx, hy, pal):
    if kind == "helmet":
        c.panel(hx - 1, hy - 1, 10, 4, pal["trim"], mode="metal", radius_frac=0.35)
        c.rivets(hx, hy + 1, 8, 1, pal["trim"], count=2)
    elif kind == "hood":
        c.panel(hx - 1, hy - 2, 10, 5, pal["body"], mode="cloth", radius_frac=0.4)
        c.panel(hx, hy + 1, 8, 4, (10, 8, 12, 255), mode="body", radius_frac=0.3, light_amount=0.05, dark_amount=-0.15)
    elif kind == "wizard_hat":
        c.panel(hx + 1, hy - 8, 6, 8, pal["trim"], mode="cloth", radius_frac=0.25)
        c.panel(hx - 2, hy - 1, 12, 2, pal["trim"], mode="metal", radius_frac=0.4)
    elif kind == "halo":
        c.glow(hx + 4, hy - 1.5, 4.5, pal["weapon"], alpha=150)
        c.panel(hx - 2, hy - 2, 12, 1.4, shade(pal["weapon"], 0.3), mode="metal", radius_frac=0.5)
    elif kind == "horns":
        c.panel(hx - 2, hy - 1, 2, 4, pal["trim"], mode="metal", radius_frac=0.3)
        c.panel(hx + 8, hy - 1, 2, 4, pal["trim"], mode="metal", radius_frac=0.3)
    elif kind == "cap":
        c.panel(hx - 1, hy - 2, 10, 3, pal["trim"], mode="cloth", radius_frac=0.4)


# --- Slime template --------------------------------------------------------
SW, SH = 22, 20


def draw_slime(pal):
    scale = master_scale(SW, SH)
    c = Canvas(SW, SH, scale)
    c.panel(3, 6, 16, 12, pal["body"], mode="body", radius_frac=0.5, light_amount=0.15)
    c.panel(5, 4, 12, 3, pal["body"], mode="body", radius_frac=0.6, light_amount=0.15)
    c.panel(14, 14, 5, 4, pal["body_dark"], mode="body", radius_frac=0.5)
    c.glow(7.5, 8.5, 2, (255, 255, 255, 255), alpha=90)
    c.dot(8, 12, 1, 1, pal["body_dark"])
    c.dot(13, 12, 1, 1, pal["body_dark"])
    c.soft_shadow(6, 15, 12, 2, alpha=50)
    c.apply_outline()
    return c.img


def draw_slime_hurt(pal):
    scale = master_scale(SW, SH)
    c = Canvas(SW, SH, scale)
    c.panel(1, 10, 20, 8, pal["body"], mode="body", radius_frac=0.45, light_amount=0.15)
    c.panel(4, 8, 14, 3, pal["body"], mode="body", radius_frac=0.55, light_amount=0.15)
    c.panel(16, 16, 5, 3, pal["body_dark"], mode="body", radius_frac=0.5)
    c.glow(6.5, 12.5, 1.7, (255, 255, 255, 255), alpha=90)
    c.line(7, 15, 8.4, 15, pal["body_dark"], width_frac=0.14, alpha=220)
    c.line(13, 15, 14.4, 15, pal["body_dark"], width_frac=0.14, alpha=220)
    c.apply_outline()
    return c.img


# --- Pet (small creature) template -----------------------------------------
PW, PH = 20, 20


def draw_pet(pal, ears="round"):
    scale = master_scale(PW, PH)
    c = Canvas(PW, PH, scale)

    c.panel(15, 14, 4, 3, pal["body"], mode="body", radius_frac=0.4)
    c.panel(17, 12, 3, 3, pal["body"], mode="body", radius_frac=0.4)
    c.panel(3, 15, 3, 2, pal["body_dark"], mode="body", radius_frac=0.4)
    c.panel(5, 8, 11, 9, pal["body"], mode="body", radius_frac=0.42, light_amount=0.2)

    if ears == "round":
        c.blob(4, 4, 4, 5, pal["body"])
        c.blob(13, 4, 4, 5, pal["body"])
    elif ears == "pointy":
        c.panel(4, 3, 3, 6, pal["body"], mode="body", radius_frac=0.3)
        c.panel(14, 3, 3, 6, pal["body"], mode="body", radius_frac=0.3)
    elif ears == "wing":
        c.panel(1, 8, 4, 6, pal["trim"], mode="metal", radius_frac=0.35)
        c.panel(16, 8, 4, 6, pal["trim"], mode="metal", radius_frac=0.35)
        c.panel(2, 7, 2, 2, pal["trim"], mode="metal", radius_frac=0.4)
        c.panel(17, 7, 2, 2, pal["trim"], mode="metal", radius_frac=0.4)
    elif ears == "none":
        pass

    c.dot(7, 12, 2, 2, (20, 16, 24, 255))
    c.dot(12, 12, 2, 2, (20, 16, 24, 255))
    c.dot(7.5, 12.3, 0.6, 0.6, (255, 255, 255, 220))
    c.dot(12.5, 12.3, 0.6, 0.6, (255, 255, 255, 220))
    c.panel(15, 10, 3, 3, pal["trim"], mode="metal", radius_frac=0.4)
    c.soft_shadow(6, 15.5, 9, 1.6, alpha=50)
    c.apply_outline()
    return c.img


# --- Castle template ---------------------------------------------------
CW, CH = 32, 30


def draw_castle():
    scale = master_scale(CW, CH)
    c = Canvas(CW, CH, scale)
    stone = (150, 145, 138, 255)
    roof = (150, 40, 40, 255)

    c.panel(4, 12, 24, 16, stone, mode="stone", radius_frac=0.06)
    for ty in range(13, 27, 3):
        c.line(4, ty, 28, ty, shade(stone, -0.3), width_frac=0.015, alpha=140)

    for tower_x in (2, 24):
        c.panel(tower_x, 6, 6, 22, stone, mode="stone", radius_frac=0.08)
        c.panel(tower_x - 1, 2, 8, 5, roof, mode="metal", radius_frac=0.2)
        c.dot(tower_x + 2.5, 1, 1, 3, (230, 230, 230, 255))

    c.panel(10, 8, 12, 4, stone, mode="stone", radius_frac=0.1)
    c.panel(12, 4, 2, 5, (120, 30, 30, 255), mode="metal", radius_frac=0.2)
    c.panel(18, 4, 2, 5, (120, 30, 30, 255), mode="metal", radius_frac=0.2)

    c.panel(12, 19, 8, 9, (60, 45, 35, 255), mode="cloth", radius_frac=0.1)
    c.panel(13, 21, 6, 7, (30, 22, 18, 255), mode="body", radius_frac=0.1, light_amount=0.05, dark_amount=-0.15)

    c.soft_shadow(8, 27, 18, 2, alpha=70)
    c.apply_outline()
    return c.img


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

# --- Evolution branches: single protagonist's 3-tier tree (see
# heroRosterConfig.ts's protagonistEvolutionTree - keys here must match its
# HeroEvolutionBranch.id values exactly, since getHeroEvolvedSpriteSrc in
# assetLoader.ts builds the sprite filename straight from that id) ----------
EVOLUTION_BRANCHES = {
    # --- Tier 1 (off base warrior) ---
    "warrior-berserker": dict(base="warrior", body=(190, 60, 30, 255), body_dark=(80, 40, 30, 255),
                                trim=(255, 120, 30, 255), weapon=(230, 230, 230, 255), weapon_kind="sword", headwear="horns"),
    "warrior-guardian": dict(base="warrior", body=(60, 90, 150, 255), body_dark=(50, 60, 80, 255),
                               trim=(190, 200, 220, 255), weapon=(210, 210, 220, 255), weapon_kind="sword", headwear="helmet", cape=True),

    # --- Tier 2 ---
    "berserker-warlord": dict(base="warrior", body=(140, 30, 20, 255), body_dark=(60, 20, 18, 255),
                                trim=(255, 90, 20, 255), weapon=(220, 200, 160, 255), weapon_kind="sword", headwear="horns", cape=True),
    "berserker-bloodmage": dict(base="mage", body=(120, 20, 30, 255), body_dark=(60, 15, 22, 255),
                                  trim=(230, 60, 80, 255), weapon=(230, 80, 90, 255), weapon_kind="orb", headwear="horns"),
    "guardian-paladin": dict(base="paladin", body=(210, 220, 235, 255), body_dark=(140, 155, 180, 255),
                               trim=(230, 200, 90, 255), weapon=(230, 200, 90, 255), weapon_kind="holy_symbol", headwear="helmet", cape=True),
    "guardian-sentinel": dict(base="special", body=(60, 120, 150, 255), body_dark=(35, 75, 95, 255),
                                trim=(180, 220, 230, 255), weapon=(200, 220, 230, 255), weapon_kind="orb", headwear="helmet"),

    # --- Tier 3 (capstones) ---
    "warlord-titan": dict(base="warrior", body=(90, 20, 15, 255), body_dark=(40, 12, 12, 255),
                            trim=(255, 150, 30, 255), weapon=(255, 200, 90, 255), weapon_kind="sword", headwear="horns", cape=True),
    "bloodmage-archmage": dict(base="mage", body=(70, 15, 60, 255), body_dark=(35, 10, 30, 255),
                                 trim=(220, 60, 160, 255), weapon=(240, 100, 200, 255), weapon_kind="orb", headwear="wizard_hat"),
    "paladin-highlord": dict(base="paladin", body=(255, 245, 215, 255), body_dark=(220, 190, 110, 255),
                               trim=(255, 220, 90, 255), weapon=(255, 235, 150, 255), weapon_kind="holy_symbol", headwear="halo", cape=True),
    "sentinel-warden": dict(base="special", body=(40, 150, 110, 255), body_dark=(25, 95, 70, 255),
                              trim=(160, 230, 190, 255), weapon=(190, 230, 210, 255), weapon_kind="staff", headwear="halo"),
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
    armored = pal["headwear"] == "helmet"
    return draw_humanoid(
        {k: pal[k] for k in ("body", "body_dark", "skin", "trim", "weapon") if k in pal},
        pose,
        pal["weapon_kind"],
        pal["headwear"],
        cape=pal.get("cape", False),
        armored=armored,
    )


def hero_down_frame(pal):
    armored = pal["headwear"] == "helmet"
    return draw_humanoid_down(
        {k: pal[k] for k in ("body", "body_dark", "skin", "trim", "weapon") if k in pal},
        pal["headwear"],
        cape=pal.get("cape", False),
        armored=armored,
    )


HERO_POSES = ["walk", "attack", "hurt", "idle2", "cast", "victory"]


def main():
    for class_id, pal in HERO_CLASSES.items():
        for pose in HERO_POSES:
            save_all_tiers(hero_frame(pal, pose), f"heroes/{class_id}_{pose}.png")
        save_all_tiers(hero_down_frame(pal), f"heroes/{class_id}_down.png")

    for branch_id, overrides in EVOLUTION_BRANCHES.items():
        pal = dict(HERO_CLASSES[overrides["base"]])
        pal.update(overrides)
        file_id = branch_id.replace("-", "_")
        for pose in HERO_POSES:
            save_all_tiers(hero_frame(pal, pose), f"heroes/evolved/{file_id}_{pose}.png")
        save_all_tiers(hero_down_frame(pal), f"heroes/evolved/{file_id}_down.png")

    save_all_tiers(draw_humanoid(GOBLIN_PAL, "walk", "dagger", "cap"), "enemies/goblin.png")
    save_all_tiers(draw_humanoid(GOBLIN_PAL, "hurt", "dagger", "cap"), "enemies/goblin_hurt.png")
    slime_pal = dict(body=(90, 200, 140, 255), body_dark=(50, 150, 100, 255))
    save_all_tiers(draw_slime(slime_pal), "enemies/slime.png")
    save_all_tiers(draw_slime_hurt(slime_pal), "enemies/slime_hurt.png")
    save_all_tiers(draw_humanoid(ZOMBIE_PAL, "attack", None, None), "enemies/zombie.png")
    save_all_tiers(draw_humanoid(ZOMBIE_PAL, "hurt", None, None), "enemies/zombie_hurt.png")
    save_all_tiers(draw_humanoid(WITCH_PAL, "walk", "staff", "wizard_hat"), "enemies/witch.png")
    save_all_tiers(draw_humanoid(WITCH_PAL, "hurt", "staff", "wizard_hat"), "enemies/witch_hurt.png")
    save_all_tiers(draw_humanoid(BOSS_PAL, "attack", "sword", "horns", armored=True), "enemies/demon_boss.png")
    save_all_tiers(draw_humanoid(BOSS_PAL, "hurt", "sword", "horns", armored=True), "enemies/demon_boss_hurt.png")

    for pet_id, pal in PETS.items():
        save_all_tiers(draw_pet(pal, ears=pal["ears"]), f"pets/{pet_id}.png")

    save_all_tiers(draw_castle(), "towers/castle.png")


if __name__ == "__main__":
    main()
