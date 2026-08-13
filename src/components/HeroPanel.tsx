import { memo, useCallback, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { heroRosterConfig, type HeroDefinition } from '../data/heroRosterConfig';
import { skillDefinitions } from '../data/skillConfig';
import { getMaxDeployedHeroes } from '../data/squadConfig';
import { getGlobalWaveNumber } from '../engine/systems/WaveSystem';
import { heroEvolutionConfig, heroUpgradeConfig, type HeroClass, type UpgradeableStat } from '../data/heroConfig';
import { MAX_STAR_LEVEL, gachaRarityConfig, getStarUpCost, type GachaRarity } from '../data/gachaConfig';
import { getActiveBondCounts, type BondId } from '../data/bondConfig';
import { isHeroUpgradeMaxed, previewHeroUpgradeBulk } from '../engine/systems/UpgradeSystem';
import { canEvolveHero, getEffectiveHeroClass } from '../engine/systems/HeroSystem';
import { formatBigNumber } from '../utils/scaling';
import type { HeroState } from '../engine/types';
import { t } from '../locales/i18n';
import { upgradeableStats, useGameStore } from '../store/useGameStore';
import { useDeploySlotDrag } from './useDeploySlotDrag';
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

// Plan section 14's "羁绊不应只有+Attack" - each bond boosts a different
// mechanic (see bondConfig.ts's BondEffectId), surfaced here as a tooltip so
// the difference is actually visible, not just under-the-hood math.
const BOND_EFFECT_LABEL_KEYS: Record<BondId, string> = {
  warrior: 'bondEffect.warrior',
  guardian: 'bondEffect.guardian',
  mage: 'bondEffect.mage',
  archer: 'bondEffect.archer',
  assassin: 'bondEffect.assassin',
  support: 'bondEffect.support',
  summoner: 'bondEffect.summoner',
  special: 'bondEffect.special',
};

const BOND_LABEL_KEYS: Record<BondId, string> = {
  warrior: 'bond.warrior',
  mage: 'bond.mage',
  archer: 'bond.archer',
  guardian: 'bond.guardian',
  support: 'bond.support',
  assassin: 'bond.assassin',
  summoner: 'bond.summoner',
  special: 'bond.special',
};

// Quick-scan glyph per bond archetype - lets the compact roster row read at
// a glance instead of relying on the rarity color alone.
const BOND_ICON: Record<BondId, (props: IconProps) => JSX.Element> = {
  warrior: IconSword,
  mage: IconOrb,
  archer: IconBow,
  guardian: IconShield,
  support: IconStar,
  assassin: IconDagger,
  summoner: IconGhost,
  special: IconStar,
};

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

function heroLabel(definition: HeroDefinition): string {
  return `${t(RARITY_LABEL_KEYS[definition.rarity])}${definition.id.split('-')[1]}`;
}

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

  if (hero.evolutionBranchId) {
    const branch = definition.evolutionBranches.find((candidate) => candidate.id === hero.evolutionBranchId);
    return (
      <div className="item-detail" style={{ marginTop: 8 }}>
        <IconStar /> {t('hero.evolved')}: {branch ? t(branch.nameKey) : hero.evolutionBranchId}
      </div>
    );
  }

  if (!canEvolveHero(hero)) {
    return (
      <div className="text-faint" style={{ marginTop: 8 }}>
        {t('hero.evolutionLocked')} Lv.{heroEvolutionConfig.unlockLevel}
      </div>
    );
  }

  if (!choosing) {
    return (
      <button type="button" className="btn btn-evolve btn-block" style={{ marginTop: 8 }} onClick={() => setChoosing(true)}>
        <IconStar /> {t('hero.evolveButton')} <IconStar />
      </button>
    );
  }

  return (
    <div className="evolve-picker">
      <div className="evolve-picker-title">{t('hero.evolveButton')}</div>
      <div className="card-grid-sm">
        {definition.evolutionBranches.map((branch) => {
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
  );
}

// Everything that was previously always-visible in the item-card now lives
// in the detail pane for whichever hero is selected in the master list -
// full stats, bond count, skill readiness, and the star-up/deploy actions.
function HeroDetail({
  definition,
  hero,
  isDeployed,
  squadFull,
  gold,
  materials,
  activeBondCounts,
  onToggleDeploy,
}: {
  definition: HeroDefinition;
  hero: HeroState;
  isDeployed: boolean;
  squadFull: boolean;
  gold: number;
  materials: Materials;
  activeBondCounts: Partial<Record<BondId, number>>;
  onToggleDeploy: (id: string) => void;
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
  const BondIcon = BOND_ICON[definition.bondId];
  const HeroClassIcon = CLASS_ICON[effectiveClass];

  return (
    <div className={`detail-card ${RARITY_BORDER_CLASS[definition.rarity]}`}>
      <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SpriteAvatar
          src={heroAvatarSrc(effectiveClass, hero.evolutionBranchId)}
          size={48}
          fallback={<HeroClassIcon />}
        />
        <span>
          <BondIcon /> {hero.name}{' '}
          <span className="text-faint">Lv.{hero.level} · ★{currentStar}/{MAX_STAR_LEVEL}</span>
        </span>
      </div>
      <div className="item-detail">
        <HeroClassIcon /> {t(CLASS_LABEL_KEYS[effectiveClass])}
        <span className="text-faint"> · {heroLabel(definition)}</span>
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
        <StatTile
          label={t('hero.bond')}
          value={`${t(BOND_LABEL_KEYS[definition.bondId])} (${activeBondCounts[definition.bondId] ?? 0})`}
          tooltip={t(BOND_EFFECT_LABEL_KEYS[definition.bondId])}
        />
      </div>

      <button
        className="btn btn-primary btn-block"
        onClick={() => onToggleDeploy(definition.id)}
        disabled={!isDeployed && squadFull}
      >
        {isDeployed ? t('squad.undeploy') : squadFull ? t('squad.full') : t('squad.deploy')}
      </button>

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

      <Accordion title={t('hero.skillsSection')}>
        {definition.skillUnlocks.map((unlock) => {
          const skillDef = skillDefinitions[unlock.skillId];
          const isUnlocked = hero.unlockedSkillIds.includes(unlock.skillId);
          const cooldownRemaining = hero.skills[unlock.skillId]?.cooldownRemaining ?? 0;
          return (
            <div key={unlock.skillId} className="text-faint" style={{ marginTop: 2 }}>
              {isUnlocked
                ? `${t(skillDef.nameKey)}: ${cooldownRemaining > 0 ? `${cooldownRemaining.toFixed(1)}s` : t('skill.ready')}`
                : `${t(skillDef.nameKey)} (Lv.${unlock.level})`}
            </div>
          );
        })}
        {hero.evolutionBranchId &&
          (() => {
            const branch = definition.evolutionBranches.find((candidate) => candidate.id === hero.evolutionBranchId);
            if (!branch) {
              return null;
            }
            const skillDef = skillDefinitions[branch.skillUnlock.skillId];
            const cooldownRemaining = hero.skills[branch.skillUnlock.skillId]?.cooldownRemaining ?? 0;
            return (
              <div className="text-faint" style={{ marginTop: 2 }}>
                <IconStar /> {t(skillDef.nameKey)} ({t('hero.evolveButton')}):{' '}
                {cooldownRemaining > 0 ? `${cooldownRemaining.toFixed(1)}s` : t('skill.ready')}
              </div>
            );
          })()}
      </Accordion>

      <Accordion title={t('hero.upgradeSection')}>
        <HeroUpgradeSection hero={hero} gold={gold} />
      </Accordion>
    </div>
  );
}

interface HeroRosterListProps {
  ownedHeroes: HeroDefinition[];
  deployedHeroIds: string[];
  effectiveSelectedId: string | null;
  onPointerDown: (id: string) => (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancel: () => void;
}

// Split out of HeroPanel so the compact roster rows (which only need
// level/attackDamage/name/evolution/star - never live HP or exp) don't
// re-render 10x/sec purely because HeroPanel's own `heroes` selector does
// (see that selector's comment - it deliberately stays full-fidelity for the
// detail pane). React.memo here only pays off because every prop above is
// now stable across HeroPanel's frequent re-renders: ownedHeroes is
// useMemo'd, deployedHeroIds/effectiveSelectedId are primitives-or-shallow,
// and the pointer handlers are useCallback'd/stable - see HeroPanel's own
// comments on each. Without that prep work this memo would silently never
// hit (new prop references every render look "changed" to memo's shallow
// compare regardless of whether the underlying data actually did).
const HeroRosterList = memo(function HeroRosterList({
  ownedHeroes,
  deployedHeroIds,
  effectiveSelectedId,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
}: HeroRosterListProps) {
  const ownedHeroIds = useMemo(() => ownedHeroes.map((definition) => definition.id), [ownedHeroes]);

  // One string per owned hero ("level|attackDamage|name|evolutionBranchId|
  // star") instead of selecting the raw HeroState objects - useShallow
  // compares each array element with Object.is, which only does what you'd
  // want (value equality) when the elements are primitives. An array of
  // freshly-cloned hero *objects* (which is what a plain `state.heroes`
  // selector would hand back every tick, per snapshotGameState) would fail
  // that same Object.is check every time even when nothing about the hero
  // actually changed, since it's never the same object reference twice.
  // Encoding straight to a string sidesteps that entirely.
  const rosterSignatures = useGameStore(
    useShallow((state) =>
      ownedHeroIds.map((id) => {
        const hero = state.heroes.find((candidate) => candidate.id === id);
        if (!hero) {
          return '';
        }
        const star = state.heroStars[id] ?? 0;
        return `${hero.level}|${Math.round(hero.attackDamage)}|${hero.name}|${hero.evolutionBranchId ?? ''}|${star}`;
      }),
    ),
  );

  return (
    <div className="master-list">
      {ownedHeroes.map((definition, index) => {
        const signature = rosterSignatures[index];
        if (!signature) {
          return null;
        }
        const [levelStr, attackDamageStr, name, evolutionBranchId, starStr] = signature.split('|');
        const effectiveClass = evolutionBranchId
          ? (definition.evolutionBranches.find((branch) => branch.id === evolutionBranchId)?.resultClass ?? definition.class)
          : definition.class;
        const isDeployed = deployedHeroIds.includes(definition.id);
        const isSelected = definition.id === effectiveSelectedId;
        const RowBondIcon = BOND_ICON[definition.bondId];
        const RowClassIcon = CLASS_ICON[effectiveClass];
        return (
          <div
            key={definition.id}
            className={`mini-card drag-handle selectable ${RARITY_BORDER_CLASS[definition.rarity]}${isSelected ? ' active' : ''}`}
            onPointerDown={onPointerDown(definition.id)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
          >
            <div className={`mini-card-name ${RARITY_CLASS[definition.rarity]}`}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SpriteAvatar
                  src={heroAvatarSrc(effectiveClass, evolutionBranchId)}
                  size={28}
                  fallback={<RowClassIcon />}
                />
                <span>
                  <RowBondIcon />
                  <RowClassIcon /> {name}
                  {evolutionBranchId ? <IconStar /> : ''}
                </span>
              </span>
              <span className={`status-dot${isDeployed ? ' on' : ''}`} title={isDeployed ? t('squad.deployed') : t('squad.benched')} />
            </div>
            <div className="mini-card-sub">
              Lv.{levelStr} · ★{starStr}
            </div>
            <div className="mini-card-sub">
              {t('hero.attackDamage')} {formatBigNumber(Number(attackDamageStr))}
            </div>
          </div>
        );
      })}
    </div>
  );
});

function HeroPanel({ gameScreenRef }: { gameScreenRef: RefObject<HTMLDivElement> }) {
  // Full-fidelity, unshallowed - the detail pane below needs hero.currentHp/
  // exp to actually tick up live during combat, so this one deliberately
  // keeps re-rendering HeroPanel every GameLoop tick. useShallow wouldn't
  // help here even if applied (its per-element comparison only pays off when
  // elements are primitives - see HeroRosterList below, which selects a
  // string-encoded summary specifically so it *can* use it).
  const heroes = useGameStore((state) => state.heroes);
  // These two are arrays of *primitive* ids - useShallow's element-wise
  // comparison means HeroPanel only re-renders when one of them actually
  // changes (unlock, deploy/undeploy), not on every 10Hz snapshot tick the
  // way a plain selector would (snapshotGameState always spreads these into
  // a fresh array reference even when their contents are identical to the
  // last tick). heroStars isn't read directly here anymore - HeroDetail and
  // HeroRosterList below each select just their own slice of it.
  const unlockedHeroIds = useGameStore(useShallow((state) => state.unlockedHeroIds));
  const deployedHeroIds = useGameStore(useShallow((state) => state.deployedHeroIds));
  const wave = useGameStore((state) => state.wave);
  const gold = useGameStore((state) => state.gold);
  const epicSourceStone = useGameStore((state) => state.epicSourceStone);
  const legendarySourceStone = useGameStore((state) => state.legendarySourceStone);
  const diamonds = useGameStore((state) => state.diamonds);
  const deployHero = useGameStore((state) => state.deployHero);
  const undeployHero = useGameStore((state) => state.undeployHero);
  const setDragPreviewKind = useGameStore((state) => state.setDragPreviewKind);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);

  const materials: Materials = { epicSourceStone, legendarySourceStone, diamonds };
  const maxDeployedHeroes = getMaxDeployedHeroes(getGlobalWaveNumber(wave));
  const squadFull = deployedHeroIds.length >= maxDeployedHeroes;
  // Memoized on unlockedHeroIds alone (now stable-by-value via useShallow
  // above) rather than recomputed every render - heroRosterConfig.filter
  // would otherwise hand HeroRosterList a fresh array every tick and defeat
  // its React.memo below regardless of how stable its other props are.
  const ownedHeroes = useMemo(
    () => heroRosterConfig.filter((definition) => unlockedHeroIds.includes(definition.id)),
    [unlockedHeroIds],
  );
  const activeBondCounts = getActiveBondCounts(deployedHeroIds);

  // useCallback so these stay referentially stable across HeroPanel's own
  // frequent re-renders (see the `heroes` comment above) - handlePointerUp
  // depends on both (see useDeploySlotDrag.ts), so an inline arrow here
  // would silently make *that* unstable too, cascading into HeroRosterList's
  // memo below never actually skipping a re-render.
  const handleToggleSelect = useCallback((id: string) => setSelectedHeroId(id), []);
  const handleDeployDrop = useCallback(
    (id: string) => {
      if (!deployedHeroIds.includes(id)) {
        deployHero(id);
      }
    },
    [deployedHeroIds, deployHero],
  );

  const { drag, registerGameScreen, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDeploySlotDrag({
    // A plain tap now selects the hero into the detail pane instead of
    // toggling deploy - deploy/undeploy moved to an explicit button in
    // HeroDetail (the master-detail pattern's "primary action" lives with
    // the detail, not the compact row). Dragging onto the canvas still
    // deploys directly via onDeploy below, unchanged.
    onToggle: handleToggleSelect,
    onDeploy: handleDeployDrop,
  });

  useEffect(() => {
    registerGameScreen(gameScreenRef.current);
  }, [gameScreenRef, registerGameScreen]);

  // Lets BattleScreen draw the deploy-slot grid over the canvas while (and
  // only while) a hero card is actually being dragged. Cleanup covers the
  // panel closing mid-drag, which would otherwise leave the grid stuck on.
  useEffect(() => {
    setDragPreviewKind(drag.draggingId ? 'hero' : null);
    return () => setDragPreviewKind(null);
  }, [drag.draggingId, setDragPreviewKind]);

  const draggingDefinition = drag.draggingId ? heroRosterConfig.find((d) => d.id === drag.draggingId) : undefined;

  // Default selection - no blank detail pane on first open. Prefers the
  // currently-selected hero if still owned, otherwise the first deployed
  // hero (most relevant), otherwise just the first owned hero.
  const effectiveSelectedId =
    selectedHeroId && ownedHeroes.some((d) => d.id === selectedHeroId)
      ? selectedHeroId
      : ownedHeroes.find((d) => deployedHeroIds.includes(d.id))?.id ?? ownedHeroes[0]?.id ?? null;
  const selectedDefinition = ownedHeroes.find((d) => d.id === effectiveSelectedId);
  const selectedHero = selectedDefinition ? heroes.find((h) => h.id === selectedDefinition.id) : undefined;

  function toggleDeploy(id: string) {
    if (deployedHeroIds.includes(id)) {
      undeployHero(id);
    } else {
      deployHero(id);
    }
  }

  return (
    <div className="card">
      <PanelHeader title={t('heroRoster.title')} trailing={`${deployedHeroIds.length}/${maxDeployedHeroes}`} />
      {ownedHeroes.length === 0 ? (
        <div className="empty-state">{t('heroRoster.empty')}</div>
      ) : (
        <>
          <div className="card-subtitle">{t('squad.dragHint')}</div>
          <div className="master-detail">
            <HeroRosterList
              ownedHeroes={ownedHeroes}
              deployedHeroIds={deployedHeroIds}
              effectiveSelectedId={effectiveSelectedId}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
            />
            <div className="detail-pane">
              {selectedDefinition && selectedHero ? (
                <HeroDetail
                  definition={selectedDefinition}
                  hero={selectedHero}
                  isDeployed={deployedHeroIds.includes(selectedDefinition.id)}
                  squadFull={squadFull}
                  gold={gold}
                  materials={materials}
                  activeBondCounts={activeBondCounts}
                  onToggleDeploy={toggleDeploy}
                />
              ) : (
                <div className="empty-state">{t('battle.selectPanel')}</div>
              )}
            </div>
          </div>
        </>
      )}

      {draggingDefinition && (
        <div className="drag-ghost" style={{ left: drag.pointerX, top: drag.pointerY }}>
          {(() => {
            const DragBondIcon = BOND_ICON[draggingDefinition.bondId];
            return <DragBondIcon />;
          })()}{' '}
          {heroes.find((h) => h.id === draggingDefinition.id)?.name ?? heroLabel(draggingDefinition)}
        </div>
      )}
    </div>
  );
}

export default HeroPanel;
