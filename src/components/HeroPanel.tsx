import { useEffect, useState, type RefObject } from 'react';
import { heroRosterConfig, type HeroDefinition } from '../data/heroRosterConfig';
import { skillDefinitions } from '../data/skillConfig';
import { getMaxDeployedHeroes } from '../data/castleConfig';
import { heroEvolutionConfig, heroUpgradeConfig, type HeroClass, type UpgradeableStat } from '../data/heroConfig';
import { MAX_STAR_LEVEL, gachaRarityConfig, getStarUpCost, type GachaRarity } from '../data/gachaConfig';
import { getActiveBondCounts, type BondId } from '../data/bondConfig';
import { isHeroUpgradeMaxed, previewHeroUpgradeBulk } from '../engine/systems/UpgradeSystem';
import { canEvolveHero, getEffectiveHeroClass } from '../engine/systems/HeroSystem';
import { formatBigNumber } from '../data/scaling';
import type { HeroState } from '../engine/types';
import { t } from '../locales/i18n';
import { upgradeableStats, useGameStore } from '../store/useGameStore';
import { useDeploySlotDrag } from './useDeploySlotDrag';
import Accordion from './Accordion';
import { ItemCard, SLOT_ICON, SLOT_IDS, SLOT_LABEL_KEYS } from './EquipmentPanel';
import { getActiveSetBonuses, type EquipmentSlot } from '../data/equipmentConfig';

const STAT_LABEL_KEYS: Record<UpgradeableStat, string> = {
  attackDamage: 'hero.attackDamage',
  attackSpeed: 'hero.attackSpeed',
  maxHp: 'hero.maxHp',
  criticalChance: 'hero.criticalChance',
};

const BULK_COUNTS = [1, 10, 100];

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

const BOND_LABEL_KEYS: Record<BondId, string> = {
  warrior: 'bond.warrior',
  mage: 'bond.mage',
  archer: 'bond.archer',
  guardian: 'bond.guardian',
  support: 'bond.support',
  assassin: 'bond.assassin',
};

// Quick-scan glyph per bond archetype - lets the compact roster row read at
// a glance instead of relying on the rarity color alone.
const BOND_ICON: Record<BondId, string> = {
  warrior: '⚔️',
  mage: '🔮',
  archer: '🏹',
  guardian: '🛡️',
  support: '✨',
  assassin: '🗡️',
};

const CLASS_LABEL_KEYS: Record<HeroClass, string> = {
  warrior: 'class.warrior',
  mage: 'class.mage',
  paladin: 'class.paladin',
  summoner: 'class.summoner',
};

// Distinct from BOND_ICON above - class and bond are independent axes (see
// heroRosterConfig.ts's HeroDefinition doc comments), each gets its own
// glyph so the two never read as the same thing at a glance.
const CLASS_ICON: Record<HeroClass, string> = {
  warrior: '⚔️',
  mage: '🔥',
  paladin: '🛐',
  summoner: '👻',
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

  if (!hero) {
    return null;
  }

  const activeSetBonuses = getActiveSetBonuses(hero.equipment);

  return (
    <div>
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

          return (
            <div key={slot} className="mini-card">
              <div className="mini-card-name">
                {SLOT_ICON[slot]} {t(SLOT_LABEL_KEYS[slot])}
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
        ✨ {t('hero.evolved')}: {branch ? t(branch.nameKey) : hero.evolutionBranchId}
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
        ✨ {t('hero.evolveButton')} ✨
      </button>
    );
  }

  return (
    <div className="evolve-picker">
      <div className="evolve-picker-title">{t('hero.evolveButton')}</div>
      <div className="card-grid-sm">
        {definition.evolutionBranches.map((branch) => (
          <button
            key={branch.id}
            type="button"
            className={`mini-card selectable${pendingBranchId === branch.id ? ' active' : ''}`}
            onClick={() => setPendingBranchId(branch.id)}
          >
            <div className="mini-card-name">
              {CLASS_ICON[branch.resultClass]} {t(branch.nameKey)}
            </div>
            <div className="mini-card-sub">{t(CLASS_LABEL_KEYS[branch.resultClass])}</div>
            <div className="mini-card-sub">
              {t('hero.attackDamage')} ×{branch.statMultiplier.attackDamage} · {t('hero.maxHp')} ×{branch.statMultiplier.maxHp}
            </div>
          </button>
        ))}
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

  return (
    <div className={`detail-card ${RARITY_BORDER_CLASS[definition.rarity]}`}>
      <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`}>
        {BOND_ICON[definition.bondId]} {hero.name}{' '}
        <span className="text-faint">Lv.{hero.level} · ★{currentStar}/{MAX_STAR_LEVEL}</span>
      </div>
      <div className="item-detail">
        {CLASS_ICON[effectiveClass]} {t(CLASS_LABEL_KEYS[effectiveClass])}
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
        <div className="stat-tile">
          <div className="stat-tile-label">{t('hero.attackDamage')}</div>
          <div className="stat-tile-value">{formatBigNumber(hero.attackDamage)}</div>
        </div>
        <div className="stat-tile">
          <div className="stat-tile-label">{t('hero.bond')}</div>
          <div className="stat-tile-value">
            {t(BOND_LABEL_KEYS[definition.bondId])} ({activeBondCounts[definition.bondId] ?? 0})
          </div>
        </div>
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
                ✨ {t(skillDef.nameKey)} ({t('hero.evolveButton')}):{' '}
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

function HeroPanel({ gameScreenRef }: { gameScreenRef: RefObject<HTMLDivElement> }) {
  const heroes = useGameStore((state) => state.heroes);
  const unlockedHeroIds = useGameStore((state) => state.unlockedHeroIds);
  const deployedHeroIds = useGameStore((state) => state.deployedHeroIds);
  const castleLevel = useGameStore((state) => state.castleLevel);
  const heroStars = useGameStore((state) => state.heroStars);
  const gold = useGameStore((state) => state.gold);
  const epicSourceStone = useGameStore((state) => state.epicSourceStone);
  const legendarySourceStone = useGameStore((state) => state.legendarySourceStone);
  const diamonds = useGameStore((state) => state.diamonds);
  const deployHero = useGameStore((state) => state.deployHero);
  const undeployHero = useGameStore((state) => state.undeployHero);
  const setDragPreviewKind = useGameStore((state) => state.setDragPreviewKind);
  const [selectedHeroId, setSelectedHeroId] = useState<string | null>(null);

  const materials: Materials = { epicSourceStone, legendarySourceStone, diamonds };
  const maxDeployedHeroes = getMaxDeployedHeroes(castleLevel);
  const squadFull = deployedHeroIds.length >= maxDeployedHeroes;
  const ownedHeroes = heroRosterConfig.filter((definition) => unlockedHeroIds.includes(definition.id));
  const activeBondCounts = getActiveBondCounts(deployedHeroIds);

  const { drag, registerGameScreen, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDeploySlotDrag({
    // A plain tap now selects the hero into the detail pane instead of
    // toggling deploy - deploy/undeploy moved to an explicit button in
    // HeroDetail (the master-detail pattern's "primary action" lives with
    // the detail, not the compact row). Dragging onto the canvas still
    // deploys directly via onDeploy below, unchanged.
    onToggle: (id) => setSelectedHeroId(id),
    onDeploy: (id) => {
      if (!deployedHeroIds.includes(id)) {
        deployHero(id);
      }
    },
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
      <div className="card-title">
        {t('heroRoster.title')} ({deployedHeroIds.length}/{maxDeployedHeroes})
      </div>
      {ownedHeroes.length === 0 ? (
        <div className="empty-state">{t('heroRoster.empty')}</div>
      ) : (
        <>
          <div className="card-subtitle">{t('squad.dragHint')}</div>
          <div className="master-detail">
            <div className="master-list">
              {ownedHeroes.map((definition) => {
                const hero = heroes.find((candidate) => candidate.id === definition.id);
                if (!hero) {
                  return null;
                }
                const isDeployed = deployedHeroIds.includes(definition.id);
                const isSelected = definition.id === effectiveSelectedId;
                return (
                  <div
                    key={definition.id}
                    className={`mini-card drag-handle selectable ${RARITY_BORDER_CLASS[definition.rarity]}${
                      isSelected ? ' active' : ''
                    }`}
                    onPointerDown={handlePointerDown(definition.id)}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerCancel}
                  >
                    <div className={`mini-card-name ${RARITY_CLASS[definition.rarity]}`}>
                      <span>
                        {BOND_ICON[definition.bondId]}
                        {CLASS_ICON[getEffectiveHeroClass(hero)]} {hero.name}
                        {hero.evolutionBranchId ? ' ✨' : ''}
                      </span>
                      <span className={`status-dot${isDeployed ? ' on' : ''}`} title={isDeployed ? t('squad.deployed') : t('squad.benched')} />
                    </div>
                    <div className="mini-card-sub">
                      Lv.{hero.level} · ★{heroStars[definition.id] ?? 0}
                    </div>
                    <div className="mini-card-sub">
                      {t('hero.attackDamage')} {formatBigNumber(hero.attackDamage)}
                    </div>
                  </div>
                );
              })}
            </div>
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
          {BOND_ICON[draggingDefinition.bondId]} {heroes.find((h) => h.id === draggingDefinition.id)?.name ?? heroLabel(draggingDefinition)}
        </div>
      )}
    </div>
  );
}

export default HeroPanel;
