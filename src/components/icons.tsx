// Self-drawn flat-silhouette icon set replacing the system emoji that used to
// stand in for every nav/HUD/stat glyph in this UI (🏰🌟💎📖🏆🎰🐾✨🎒⚔️💰🔇🔊💾
// etc.) - emoji render inconsistently across OS/font and read as a
// placeholder rather than a designed game UI. Every icon here is built from
// plain rect/circle/path primitives (no external icon library, no font
// dependency) sized to a shared 24x24 grid and colored via currentColor, so
// they inherit whatever color/opacity their surrounding text already has
// (gold currency text, muted labels, etc.) instead of carrying their own
// fixed color.
//
// Deliberately flat/filled silhouettes (not thin-stroke line icons) - see
// index.css's own "Flat color-block fills - no gradients, matching the
// high-contrast/flat art direction" comment on .bar-fill; this keeps the
// icon set consistent with that existing direction instead of introducing a
// second, thinner visual language. A handful (mute waves, wind, bow string)
// mix in thin stroke accents where a pure silhouette can't read correctly at
// 16-18px.
import type { SVGProps } from 'react';

export interface IconProps {
  size?: number | string;
  className?: string;
}

// Shared svg shell - every icon just supplies its children. `1em` default
// lets an icon inherit whatever font-size its surrounding text/button
// already uses instead of every call site needing an explicit size.
function Base({ size = '1em', className, children }: IconProps & { children: SVGProps<SVGSVGElement>['children'] }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: '-0.15em', flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

// --- Nav / HUD -----------------------------------------------------------

// Four-point sparkle rather than a five-point star - stays crisp at small
// HUD sizes where a five-point star tends to blur into a blob. Shared by
// every "star/sparkle" context (ascension nav, special class, evolve
// decoration) rather than a separate near-duplicate glyph per context.
export function IconStar(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2L14 10L22 12L14 14L12 22L10 14L2 12L10 10Z" />
    </Base>
  );
}

export function IconDiamond(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2L19 9L12 22L5 9Z" />
    </Base>
  );
}

export function IconBook(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="4" width="7.3" height="17" rx="1" />
      <rect x="12.7" y="4" width="7.3" height="17" rx="1" />
    </Base>
  );
}

export function IconTrophy(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 3H17L15.5 13H8.5Z" />
      <rect x="11" y="13" width="2" height="4" />
      <rect x="8" y="17" width="8" height="2" rx="0.5" />
      <rect x="9" y="19" width="6" height="2" rx="0.5" />
    </Base>
  );
}

export function IconGiftBox(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="4" y="10" width="16" height="11" rx="0.5" />
      <rect x="3" y="6.5" width="18" height="4" rx="0.5" />
      <rect x="11" y="6.5" width="2" height="14.5" opacity="0.6" />
    </Base>
  );
}

export function IconPaw(props: IconProps) {
  return (
    <Base {...props}>
      <ellipse cx="12" cy="16.5" rx="5" ry="4.2" />
      <circle cx="5.8" cy="9.5" r="2.1" />
      <circle cx="10.2" cy="6.3" r="2.1" />
      <circle cx="14.8" cy="6.3" r="2.1" />
      <circle cx="18.2" cy="9.5" r="2.1" />
    </Base>
  );
}

export function IconBag(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="9" width="14" height="12" rx="2" />
      <rect x="7" y="5" width="10" height="6" rx="1.5" />
      <rect x="7" y="2.5" width="2" height="4" rx="1" />
      <rect x="15" y="2.5" width="2" height="4" rx="1" />
      <rect x="9.5" y="13" width="5" height="3" rx="0.5" opacity="0.5" />
    </Base>
  );
}

export function IconSword(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2L13.8 6H10.2Z" />
      <rect x="10.2" y="6" width="3.6" height="9" />
      <rect x="7" y="15" width="10" height="2" />
      <rect x="11" y="17" width="2" height="4.5" />
      <circle cx="12" cy="22" r="1.3" />
    </Base>
  );
}

export function IconDagger(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 3L13.4 9H10.6Z" />
      <rect x="10.6" y="9" width="2.8" height="4" />
      <path d="M7 13L17 13L12 16Z" />
      <rect x="11" y="16" width="2" height="5.5" />
    </Base>
  );
}

// Ring/donut built from two full-circle arc paths under evenodd - a coin
// silhouette reads unambiguously as currency, where a plain filled dot could
// be mistaken for any other bullet/status dot in the UI.
export function IconCoin(props: IconProps) {
  return (
    <Base {...props}>
      <path fillRule="evenodd" clipRule="evenodd" d="M12 3A9 9 0 1 0 12 21A9 9 0 1 0 12 3ZM12 8A4 4 0 1 0 12 16A4 4 0 1 0 12 8Z" />
    </Base>
  );
}


// Six-tooth gearwheel silhouette (hollow center via evenodd) - standard
// "settings" glyph, matches the flat-silhouette treatment every other icon
// here uses instead of a thin-stroke cog.
export function IconGear(props: IconProps) {
  return (
    <Base {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.5 2H13.5L14 4.6C14.6 4.8 15.2 5.1 15.7 5.4L18.1 4.3L20.4 6.6L19.3 9C19.6 9.5 19.9 10.1 20.1 10.7L22.7 11.2V14.2L20.1 14.7C19.9 15.3 19.6 15.9 19.3 16.4L20.4 18.8L18.1 21.1L15.7 20C15.2 20.3 14.6 20.6 14 20.8L13.5 23.4H10.5L10 20.8C9.4 20.6 8.8 20.3 8.3 20L5.9 21.1L3.6 18.8L4.7 16.4C4.4 15.9 4.1 15.3 3.9 14.7L1.3 14.2V11.2L3.9 10.7C4.1 10.1 4.4 9.5 4.7 9L3.6 6.6L5.9 4.3L8.3 5.4C8.8 5.1 9.4 4.8 10 4.6L10.5 2ZM12 8.7C10.2 8.7 8.7 10.2 8.7 12S10.2 15.3 12 15.3S15.3 13.8 15.3 12S13.8 8.7 12 8.7Z"
      />
    </Base>
  );
}

// Classic lens-shaped eye - App.tsx's stealth-mode toggle button uses this
// (visible) plus IconEyeOff (stealth active) as a matched pair, same "the
// icon shows what one more click does" convention IconMute* used to.
export function IconEye(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5C6.5 5 2.7 8.6 1 12C2.7 15.4 6.5 19 12 19S21.3 15.4 23 12C21.3 8.6 17.5 5 12 5ZM12 16.5A4.5 4.5 0 1 1 12 7.5A4.5 4.5 0 0 1 12 16.5Z" />
      <circle cx="12" cy="12" r="2.5" />
    </Base>
  );
}

export function IconEyeOff(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 5C6.5 5 2.7 8.6 1 12C1.8 13.7 3 15.2 4.5 16.4L2.6 18.3L4 19.7L20 3.7L18.6 2.3L15.8 5.1C14.6 4.7 13.3 5 12 5ZM12 16.5C11.1 16.5 10.3 16.2 9.7 15.7L15.7 9.7C16.2 10.3 16.5 11.1 16.5 12A4.5 4.5 0 0 1 12 16.5Z" />
      <path d="M23 12C22.1 10.2 20.7 8.6 19 7.4L13.4 13C13.9 13.6 14.6 14 15.5 14C15.7 14 15.9 14 16 13.9L11 18.9C11.3 18.9 11.6 19 12 19C17.5 19 21.3 15.4 23 12Z" opacity="0.55" />
    </Base>
  );
}

// Floppy-disk silhouette - still the universal "save" glyph despite the
// literal object being long obsolete. Two punched-out "windows" (write-
// protect tab, label area) via evenodd holes rather than a second color, so
// it stays a single currentColor shape like every other icon here.
export function IconSave(props: IconProps) {
  return (
    <Base {...props}>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M4 4H16L20 8V20H4Z M8 5H14V9H8Z M7 13H17V20H7Z"
      />
    </Base>
  );
}

// --- Classes / roles ---------------------------------------------------

export function IconOrb(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="10" r="7" />
      <path d="M8 18H16L18 21H6Z" />
    </Base>
  );
}

export function IconBow(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M7 2A17 17 0 0 0 7 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M7 2V22" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 12H19M19 12L15 9M19 12L15 15" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Base>
  );
}

export function IconShield(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M12 2L20 5V12L12 22L4 12V5Z" />
    </Base>
  );
}

export function IconGhost(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 21V10A6 6 0 0 1 18 10V21L15 18L12 21L9 18Z" />
      <circle cx="9.5" cy="10.5" r="1" fill="var(--bg, #0f1117)" />
      <circle cx="14.5" cy="10.5" r="1" fill="var(--bg, #0f1117)" />
    </Base>
  );
}

export function IconHeal(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="10" y="4" width="4" height="16" rx="1" />
      <rect x="4" y="10" width="16" height="4" rx="1" />
    </Base>
  );
}

// --- Equipment / talent / quest misc ------------------------------------

export function IconBoots(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M8 3H14V13H19V16H15V19H6V16H8Z" />
    </Base>
  );
}

export function IconFlag(props: IconProps) {
  return (
    <Base {...props}>
      <rect x="5" y="2" width="2" height="20" />
      <path d="M7 3H19L16 7L19 11H7Z" />
    </Base>
  );
}

export function IconTarget(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="1.4" />
    </Base>
  );
}

// Hooded-robe bust for the story dialog's narrator portrait (currently
// always "城堡管家"/the steward - see storyConfig.ts) - a shadowed-face
// silhouette reads as "mysterious advisor" without needing an actual
// illustrated portrait.
export function IconSteward(props: IconProps) {
  return (
    <Base {...props}>
      <path d="M6 12V8.5A6 6 0 0 1 18 8.5V12Z" />
      <path d="M4 22L8 13H16L20 22Z" />
      <ellipse cx="12" cy="9.7" rx="2.6" ry="3" fill="var(--bg, #0f1117)" opacity="0.55" />
    </Base>
  );
}

export function IconHeart(props: IconProps) {
  return (
    <Base {...props}>
      <circle cx="8.5" cy="9" r="4.5" />
      <circle cx="15.5" cy="9" r="4.5" />
      <path d="M4.2 10L12 21L19.8 10Z" />
    </Base>
  );
}
