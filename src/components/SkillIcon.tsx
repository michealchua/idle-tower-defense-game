import {
  IconFireball,
  IconMeteor,
  IconFlameRing,
  IconIceCrystal,
  IconEarthquake,
  IconNovaBurst,
  IconLightningBolt,
  IconArrowRain,
  IconChainBlade,
  IconThornVine,
  IconSpiritLink,
  IconVoidChain,
  IconRadiantCross,
  IconLeaf,
  IconSanctuaryDome,
  IconDroplet,
  IconPulseRings,
  IconPhoenixWing,
  IconOrb,
  type IconProps,
} from './icons';

// One icon per skillConfig.ts entry - kept out of skillConfig.ts itself
// (deliberately "pure data, no engine imports" per its own doc comment) so
// this file, not the data file, owns the React/JSX dependency. Every UI
// spot that shows a skill (HeroPanel's skill bag, GachaPanel's reveal
// cards, CodexPanel's skill tab) reads through getSkillIcon instead of each
// picking their own fallback.
const SKILL_ICON: Record<string, (props: IconProps) => JSX.Element> = {
  'skill-fireball': IconFireball,
  'skill-meteor': IconMeteor,
  'skill-flameNova': IconFlameRing,
  'skill-iceBurst': IconIceCrystal,
  'skill-earthquake': IconEarthquake,
  'skill-novaBlast': IconNovaBurst,
  'skill-lightning': IconLightningBolt,
  'skill-arrowRain': IconArrowRain,
  'skill-chainBlade': IconChainBlade,
  'skill-thornWhip': IconThornVine,
  'skill-spiritLink': IconSpiritLink,
  'skill-voidChain': IconVoidChain,
  'skill-healingLight': IconRadiantCross,
  'skill-natureBlessing': IconLeaf,
  'skill-sanctuary': IconSanctuaryDome,
  'skill-lifeSpring': IconDroplet,
  'skill-guardianPulse': IconPulseRings,
  'skill-phoenixGrace': IconPhoenixWing,
};

// Falls back to the old generic orb for any id not in the table above -
// should never happen for a real skillConfig.ts entry, but keeps callers
// from needing their own guard for an unrecognized id.
export function getSkillIcon(skillId: string): (props: IconProps) => JSX.Element {
  return SKILL_ICON[skillId] ?? IconOrb;
}
