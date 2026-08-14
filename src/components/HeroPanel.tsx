import { useState } from 'react';
import { heroRosterConfig, type HeroDefinition } from '../data/heroRosterConfig';
import { skillDefinitions } from '../data/skillConfig';
import { heroUpgradeConfig, type HeroClass, type UpgradeableStat } from '../data/heroConfig';
import { MAX_STAR_LEVEL, gachaRarityConfig, getStarUpCost, type GachaRarity } from '../data/gachaConfig';
import { isHeroUpgradeMaxed, previewHeroUpgradeBulk } from '../engine/systems/UpgradeSystem';
import { canEvolveHero, getAvailableEvolutionBranches, getEffectiveHeroClass, MAX_EQUIPPED_SKILLS } from '../engine/systems/HeroSystem';
import { formatBigNumber } from '../utils/scaling';
import type { HeroState } from '../engine/types';
import { t } from '../locales/i18n';
import { upgradeableStats, useGameStore } from '../store/useGameStore';
import Accordion from './Accordion';
import PanelHeader from './PanelHeader';
import StatTile from './StatTile';
import SpriteAvatar from './SpriteAvatar';
import { getHeroSpriteSrc, getHeroEvolvedSpriteSrc } from '../render/assetLoader';
import { ItemCard, SLOT_ICON, SLOT_IDS, SLOT_LABEL_KEYS } from './EquipmentPanel';
import { getActiveSetBonuses, type EquipmentSlot } from '../data/equipmentConfig';
import {
  IconSword,
  IconOrb,
  IconBow,
  IconShield,
  IconStar,
  IconDagger,
  IconGhost,
  IconHeal,
  type IconProps,
} from './icons';

const STAT_LABEL_KEYS: Record<UpgradeableStat, string> = {
  attackDamage: 'hero.attackDamage',
  attackSpeed: 'hero.attackSpeed',
  maxHp: 'hero.maxHp',
  criticalChance: 'hero.criticalChance',
};

// Plan section 24: "升级按钮 +1/+10/+100/+1000" / "资源不足10次时隐藏+10" -
// +1 always renders (even disabled, it's the baseline action); +10/+100/
// +1000 only render once affordable, so the row doesn't clutter with
// buttons the player can't use yet (see the .filter below).
const BULK_COUNTS = [1, 10, 100, 1000];

function formatBonusValue(stat: UpgradeableStat, value: number): string {
  if (stat === 'criticalChance') {
    return `+${Math.round(value * 100)}%`;
  }
  if (stat === 'attackSpeed') {
    return `+${value.toFixed(2)}`;
  }
  return `+${Math.round(value)}`;
}

// Per-hero upgrade rows - one per UpgradeableStat, each with +1/+10/+100
// bulk-buy buttons (see UpgradeSystem.applyHeroUpgrade, which buys as many
// of the requested count as gold/maxValue allow instead of all-or-nothing).
// Tucked inside an Accordion in the detail pane - a 4-stat x 3-button grid
// is exactly the "secondary complex data" progressive disclosure hides.
function HeroUpgradeSection({ hero, gold }: { hero: HeroState; gold: number }) {
  const upgradeHeroStat = useGameStore((state) => state.upgradeHeroStat);

  return (
    <div>
      {upgradeableStats.map((stat) => {
        const maxed = isHeroUpgradeMaxed(hero, stat);
        const currentBonus = hero.upgrades[stat] * heroUpgradeConfig[stat].valuePerLevel;

        return (
          <div key={stat} className="item-actions" style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="text-faint">
              {t(STAT_LABEL_KEYS[stat])} {formatBonusValue(stat, currentBonus)}
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              {maxed ? (
                <span className="text-faint">{t('star.maxed')}</span>
              ) : (
                BULK_COUNTS.map((count) => {
                  const preview = previewHeroUpgradeBulk(hero, stat, count);
                  const canAfford = preview.levels > 0 && gold >= preview.cost;
                  if (count > 1 && !canAfford) {
                    return null;
                  }
                  return (
                    <button
                      key={count}
                      className="btn btn-sm"
                      disabled={!canAfford}
                      onClick={() => upgradeHeroStat(hero.id, stat, count)}
                    >
                      +{count} ({preview.cost}{t('battle.gold')})
                    </button>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Skill bag/equip UI - replaces the old "level-gated list" (skills used to
// unlock automatically at fixed hero levels and cast the moment they did).
// Now every skill comes from the skill gacha (or an evolution branch) into
// hero.ownedSkillIds, and only the up-to-MAX_EQUIPPED_SKILLS subset in
// hero.equippedSkillIds actually casts (see SkillSystem.tickHeroSkills) -
// this lists both groups with an equip/unequip button each, same pattern
// HeroEquipmentSection already uses for gear.
function SkillBagSection({ hero }: { hero: HeroState }) {
  const equipSkill = useGameStore((state) => state.equipSkill);
  const unequipSkill = useGameStore((state) => state.unequipSkill);

  const equippedIds = hero.equippedSkillIds;
  const bagIds = hero.ownedSkillIds.filter((skillId) => !equippedIds.includes(skillId));
  const equipFull = equippedIds.length >= MAX_EQUIPPED_SKILLS;

  function renderSkillRow(skillId: string, equipped: boolean) {
    const skillDef = skillDefinitions[skillId];
    if (!skillDef) {
      return null;
    }
    const cooldownRemaining = hero.skills[skillId]?.cooldownRemaining ?? 0;
    return (
      <div key={skillId} className="item-actions" style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <span className="text-faint" style={{ color: skillDef.color }}>
          {t(skillDef.nameKey)}
          {equipped && (
            <span className="text-faint">
              {' '}· {cooldownRemaining > 0 ? `${cooldownRemaining.toFixed(1)}s` : t('skill.ready')}
            </span>
          )}
        </span>
        {equipped ? (
          <button className="btn btn-sm" onClick={() => unequipSkill(hero.id, skillId)}>
            {t('skill.unequip')}
          </button>
        ) : (
          <button className="btn btn-sm btn-primary" disabled={equipFull} onClick={() => equipSkill(hero.id, skillId)}>
            {t('skill.equip')}
          </button>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="text-faint">{t('skill.equippedSection')}</div>
      {equippedIds.length === 0 && <div className="text-faint" style={{ marginTop: 4 }}>{t('skill.noneEquipped')}</div>}
      {equippedIds.map((skillId) => renderSkillRow(skillId, true))}
      <div className="text-faint" style={{ marginTop: 10 }}>{t('skill.bagSection')}</div>
      {bagIds.length === 0 && <div className="text-faint" style={{ marginTop: 4 }}>{t('skill.bagEmpty')}</div>}
      {bagIds.map((skillId) => renderSkillRow(skillId, false))}
    </div>
  );
}

const CLASS_LABEL_KEYS: Record<HeroClass, string> = {
  warrior: 'class.warrior',
  mage: 'class.mage',
  paladin: 'class.paladin',
  summoner: 'class.summoner',
  archer: 'class.archer',
  assassin: 'class.assassin',
  priest: 'class.priest',
  special: 'class.special',
};

// Distinct from BOND_ICON above - class and bond are independent axes (see
// heroRosterConfig.ts's HeroDefinition doc comments), each gets its own
// glyph so the two never read as the same thing at a glance.
const CLASS_ICON: Record<HeroClass, (props: IconProps) => JSX.Element> = {
  warrior: IconSword,
  mage: IconOrb,
  paladin: IconShield,
  summoner: IconGhost,
  archer: IconBow,
  assassin: IconDagger,
  priest: IconHeal,
  special: IconStar,
};

const RARITY_LABEL_KEYS: Record<GachaRarity, string> = {
  white: 'rarity.white',
  green: 'rarity.green',
  blue: 'rarity.blue',
  purple: 'rarity.purple',
  gold: 'rarity.gold',
  red: 'rarity.red',
  rainbow: 'rarity.rainbow',
};

const RARITY_CLASS: Record<GachaRarity, string> = {
  white: 'rarity-white',
  green: 'rarity-green',
  blue: 'rarity-blue',
  purple: 'rarity-purple',
  gold: 'rarity-gold',
  red: 'rarity-red',
  rainbow: 'rarity-rainbow',
};

const RARITY_BORDER_CLASS: Record<GachaRarity, string> = {
  white: 'border-rarity-white',
  green: 'border-rarity-green',
  blue: 'border-rarity-blue',
  purple: 'border-rarity-purple',
  gold: 'border-rarity-gold',
  red: 'border-rarity-red',
  rainbow: 'border-rarity-rainbow',
};

const MATERIAL_LABEL_KEYS = {
  epicSourceStone: 'material.epicSourceStone',
  legendarySourceStone: 'material.legendarySourceStone',
  diamonds: 'material.diamonds',
} as const;

// Avatar granularity is per-class/per-evolution-branch, not per individual
// hero - same sprites CanvasRenderer.drawHero draws on the field (see
// assetLoader.getHeroSpriteSrc's doc comment on why: 100 roster entries
// share just 8 base-class + 16 evolution-branch sprites, not one portrait
// each). Two same-class, non-evolved heroes will show the same avatar.
function heroAvatarSrc(effectiveClass: HeroClass, evolutionBranchId: string | null | undefined): string {
  return evolutionBranchId ? getHeroEvolvedSpriteSrc(evolutionBranchId) : getHeroSpriteSrc(effectiveClass);
}

// Per-hero gear (see HeroState.equipment) - 4 slots (weapon/armor/trinket/
// boots), each either showing the equipped ItemCard (same card
// EquipmentPanel's inventory list uses, with an unequip action instead of
// sell) or, if empty, a dropdown of same-slot inventory items to equip
// directly without leaving the hero's detail pane. Active set bonuses (see
// equipmentConfig.getActiveSetBonuses) are listed below the slots.
function HeroEquipmentSection({ heroId }: { heroId: string }) {
  const hero = useGameStore((state) => state.heroes.find((candidate) => candidate.id === heroId));
  const inventory = useGameStore((state) => state.inventory);
  const equipItemToHero = useGameStore((state) => state.equipItemToHero);
  const unequipHeroSlot = useGameStore((state) => state.unequipHeroSlot);
  const equipStrongestForHero = useGameStore((state) => state.equipStrongestForHero);
  const unequipAllForHero = useGameStore((state) => state.unequipAllForHero);

  if (!hero) {
    return null;
  }

  const activeSetBonuses = getActiveSetBonuses(hero.equipment);
  const hasAnyEquipped = SLOT_IDS.some((slot) => hero.equipment[slot]);

  return (
    <div>
      <div className="item-actions" style={{ marginBottom: 8 }}>
        <button className="btn btn-sm btn-primary" onClick={() => equipStrongestForHero(heroId)} disabled={inventory.length === 0}>
          {t('equipment.equipStrongest')}
        </button>
        <button className="btn btn-sm" onClick={() => unequipAllForHero(heroId)} disabled={!hasAnyEquipped}>
          {t('equipment.unequipAll')}
        </button>
      </div>
      <div className="card-grid-sm">
        {SLOT_IDS.map((slot: EquipmentSlot) => {
          const item = hero.equipment[slot];
          const slotInventory = inventory.filter((candidate) => candidate.slot === slot);

          if (item) {
            return (
              <ItemCard
                key={slot}
                item={item}
                labelPrefix={`${t(SLOT_LABEL_KEYS[slot])}: `}
                actions={
                  <button className="btn btn-sm" onClick={() => unequipHeroSlot(heroId, slot)}>
                    {t('equipment.unequip')}
                  </button>
                }
              />
            );
          }

          const SlotIcon = SLOT_ICON[slot];

          return (
            <div key={slot} className="mini-card">
              <div className="mini-card-name">
                <SlotIcon /> {t(SLOT_LABEL_KEYS[slot])}
              </div>
              <div className="mini-card-sub">{t('equipment.empty')}</div>
              {slotInventory.length > 0 && (
                <select
                  className="select"
                  style={{ marginTop: 6 }}
                  value=""
                  onChange={(e) => {
                    const instanceId = Number(e.target.value);
                    if (instanceId) {
                      equipItemToHero(heroId, instanceId);
                    }
                  }}
                >
                  <option value="" disabled>
                    {t('equipment.equip')}
                  </option>
                  {slotInventory.map((candidate) => (
                    <option key={candidate.instanceId} value={candidate.instanceId}>
                      {t(RARITY_LABEL_KEYS[candidate.rarity])} ★{candidate.starLevel}/{MAX_STAR_LEVEL}
                    </option>
                  ))}
                </select>
              )}
            </div>
          );
        })}
      </div>

      {activeSetBonuses.length > 0 && (
        <div style={{ marginTop: 8 }}>
          {activeSetBonuses.map(({ set, count, activeBonuses }) => (
            <div key={set.id} style={{ marginTop: 4 }}>
              <div className="text-faint">
                {t(set.nameKey)} ({count}/4)
              </div>
              {activeBonuses.map((bonus) => (
                <div key={bonus.count} className="item-detail">
                  {bonus.count}
                  {t('equipment.setPieceSuffix')}:{' '}
                  {(Object.entries(bonus.statBonuses) as [UpgradeableStat, number][])
                    .map(([stat, value]) => `${t(STAT_LABEL_KEYS[stat])} ${formatBonusValue(stat, value)}`)
                    .join(' · ')}
                  {bonus.specialEffectLabelKey && ` · ${t(bonus.specialEffectLabelKey)}`}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Materials {
  epicSourceStone: number;
  legendarySourceStone: number;
  diamonds: number;
}

// 分支进化 - locked hint below unlockLevel, a flashy one-tap-away confirm
// once eligible, a plain readout once the hero has already committed to a
// branch. Picking is two steps (pick a card, then confirm) so a stray tap
// can't burn this permanent, one-shot choice (HeroSystem.evolveHero).
function HeroEvolutionSection({ definition, hero }: { definition: HeroDefinition; hero: HeroState }) {
  const evolveHero = useGameStore((state) => state.evolveHero);
  const [choosing, setChoosing] = useState(false);
  const [pendingBranchId, setPendingBranchId] = useState<string | null>(null);

  // History breadcrumb - every tier already committed to, oldest first (see
  // HeroState.evolutionPath's doc comment). Shown above whatever the next
  // tier's status is (locked/ready/maxed), not instead of it - unlike the
  // old flat one-shot tree, reaching tier 1 doesn't end the section anymore.
  const chosenBranches = hero.evolutionPath
    .map((branchId) => definition.evolutionBranches.find((candidate) => candidate.id === branchId))
    .filter((branch): branch is (typeof definition.evolutionBranches)[number] => !!branch);

  const nextBranches = getAvailableEvolutionBranches(hero);
  const reachedMaxTier = nextBranches.length === 0;
  const nextTierReady = canEvolveHero(hero);
  const nextTierUnlockLevel = nextBranches.length > 0 ? Math.min(...nextBranches.map((branch) => branch.unlockLevel)) : null;

  return (
    <div>
      {chosenBranches.length > 0 && (
        <div className="item-detail" style={{ marginTop: 8 }}>
          <IconStar /> {t('hero.evolved')}: {chosenBranches.map((branch) => t(branch.nameKey)).join(' → ')}
        </div>
      )}

      {reachedMaxTier ? (
        chosenBranches.length > 0 && (
          <div className="text-faint" style={{ marginTop: 8 }}>
            {t('hero.evolutionMaxed')}
          </div>
        )
      ) : !nextTierReady ? (
        <div className="text-faint" style={{ marginTop: 8 }}>
          {t('hero.evolutionLocked')} Lv.{nextTierUnlockLevel}
        </div>
      ) : !choosing ? (
        <button type="button" className="btn btn-evolve btn-block" style={{ marginTop: 8 }} onClick={() => setChoosing(true)}>
          <IconStar /> {t('hero.evolveButton')} <IconStar />
        </button>
      ) : (
        <div className="evolve-picker">
          <div className="evolve-picker-title">{t('hero.evolveButton')}</div>
          <div className="card-grid-sm">
            {nextBranches
              .filter((branch) => hero.level >= branch.unlockLevel)
              .map((branch) => {
                const BranchIcon = CLASS_ICON[branch.resultClass];
                return (
                  <button
                    key={branch.id}
                    type="button"
                    className={`mini-card selectable${pendingBranchId === branch.id ? ' active' : ''}`}
                    onClick={() => setPendingBranchId(branch.id)}
                  >
                    <div className="mini-card-name">
                      <BranchIcon /> {t(branch.nameKey)}
                    </div>
                    <div className="mini-card-sub">{t(CLASS_LABEL_KEYS[branch.resultClass])}</div>
                    <div className="mini-card-sub">
                      {t('hero.attackDamage')} ×{branch.statMultiplier.attackDamage} · {t('hero.maxHp')} ×{branch.statMultiplier.maxHp}
                    </div>
                  </button>
                );
              })}
          </div>
          <div className="item-actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => {
                setChoosing(false);
                setPendingBranchId(null);
              }}
            >
              {t('hero.evolveCancel')}
            </button>
            <button
              type="button"
              className="btn btn-sm btn-evolve"
              disabled={!pendingBranchId}
              onClick={() => {
                if (pendingBranchId && evolveHero(definition.id, pendingBranchId)) {
                  setChoosing(false);
                  setPendingBranchId(null);
                }
              }}
            >
              {t('hero.evolveConfirm')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Single-protagonist redesign: this is the whole panel's content now, not
// one card in a roster - there's only ever the one hero (heroRosterConfig.
// PROTAGONIST_ID), always deployed, so the old master-detail split (pick a
// hero from a grid, see its stats on the side) and the deploy/undeploy
// action both stopped meaning anything and are gone.
function HeroDetail({
  definition,
  hero,
  gold,
  materials,
}: {
  definition: HeroDefinition;
  hero: HeroState;
  gold: number;
  materials: Materials;
}) {
  const starUpHero = useGameStore((state) => state.starUpHero);

  const expRatio = Math.min(1, hero.exp / hero.expToNextLevel);
  const currentStar = useGameStore((state) => state.heroStars[definition.id] ?? 0);
  const shards = useGameStore((state) => state.heroShards[definition.id] ?? 0);
  const nextCost = getStarUpCost(definition.rarity, currentStar);
  const materialKey = gachaRarityConfig[definition.rarity].breakthroughMaterial;
  const canStarUp =
    !!nextCost &&
    shards >= nextCost.shards &&
    gold >= nextCost.gold &&
    (!nextCost.material || (materialKey !== undefined && materials[materialKey] >= nextCost.material));

  const effectiveClass = getEffectiveHeroClass(hero);
  const HeroClassIcon = CLASS_ICON[effectiveClass];

  return (
    <div className={`detail-card ${RARITY_BORDER_CLASS[definition.rarity]}`}>
      <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SpriteAvatar
          src={heroAvatarSrc(effectiveClass, hero.evolutionPath[hero.evolutionPath.length - 1] ?? null)}
          size={48}
          fallback={<HeroClassIcon />}
        />
        <span>
          {hero.name}{' '}
          <span className="text-faint">Lv.{hero.level} · ★{currentStar}/{MAX_STAR_LEVEL}</span>
        </span>
      </div>
      <div className="item-detail">
        <HeroClassIcon /> {t(CLASS_LABEL_KEYS[effectiveClass])}
      </div>

      <div className="bar-track">
        <div className="bar-fill bar-fill-hp" style={{ width: `${Math.max(0, hero.currentHp / hero.maxHp) * 100}%` }} />
      </div>
      <div className="item-detail">
        {t('hero.hp')} {formatBigNumber(hero.currentHp)}/{formatBigNumber(hero.maxHp)}
      </div>
      <div className="bar-track" style={{ marginTop: 4 }}>
        <div className="bar-fill bar-fill-exp" style={{ width: `${expRatio * 100}%` }} />
      </div>
      <div className="item-detail">
        {t('hero.exp')} {hero.exp}/{hero.expToNextLevel}
      </div>

      <div className="stat-grid">
        <StatTile label={t('hero.attackDamage')} value={formatBigNumber(hero.attackDamage)} />
      </div>

      <HeroEvolutionSection definition={definition} hero={hero} />

      <div className="item-actions" style={{ marginTop: 8, alignItems: 'center' }}>
        <span className="text-faint">
          {t('star.shards')} {shards}
          {nextCost ? `/${nextCost.shards}` : ''}
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => starUpHero(definition.id)} disabled={!nextCost || !canStarUp}>
          {nextCost
            ? `${t('star.upgrade')} (${nextCost.shards}${t('star.shards')} + ${nextCost.gold}${t('battle.gold')}${
                nextCost.material && materialKey ? ` + ${nextCost.material}${t(MATERIAL_LABEL_KEYS[materialKey])}` : ''
              })`
            : t('star.maxed')}
        </button>
      </div>

      <Accordion title={t('equipment.heroSection')}>
        <HeroEquipmentSection heroId={definition.id} />
      </Accordion>

      <Accordion title={`${t('hero.skillsSection')} (${hero.equippedSkillIds.length}/${MAX_EQUIPPED_SKILLS})`}>
        <SkillBagSection hero={hero} />
      </Accordion>

      <Accordion title={t('hero.upgradeSection')}>
        <HeroUpgradeSection hero={hero} gold={gold} />
      </Accordion>
    </div>
  );
}

function HeroPanel() {
  // Full-fidelity, unshallowed - the detail pane needs hero.currentHp/exp to
  // actually tick up live during combat, so this deliberately keeps
  // re-rendering every GameLoop tick.
  const heroes = useGameStore((state) => state.heroes);
  const gold = useGameStore((state) => state.gold);
  const epicSourceStone = useGameStore((state) => state.epicSourceStone);
  const legendarySourceStone = useGameStore((state) => state.legendarySourceStone);
  const diamonds = useGameStore((state) => state.diamonds);

  const materials: Materials = { epicSourceStone, legendarySourceStone, diamonds };
  const definition = heroRosterConfig[0];
  const hero = heroes[0];

  return (
    <div className="card">
      <PanelHeader title={t('heroRoster.title')} />
      {definition && hero ? (
        <HeroDetail definition={definition} hero={hero} gold={gold} materials={materials} />
      ) : (
        <div className="empty-state">{t('battle.selectPanel')}</div>
      )}
    </div>
  );
}

export default HeroPanel;
