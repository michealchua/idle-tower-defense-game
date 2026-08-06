import { useEffect, type RefObject } from 'react';
import { petRosterConfig } from '../data/petRosterConfig';
import { getMaxDeployedPets } from '../data/castleConfig';
import type { UpgradeableStat } from '../data/heroConfig';
import { MAX_STAR_LEVEL, gachaRarityConfig, getStarUpCost, type GachaRarity } from '../data/gachaConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import { useDeploySlotDrag } from './useDeploySlotDrag';

const STAT_LABEL_KEYS: Record<UpgradeableStat, string> = {
  attackDamage: 'hero.attackDamage',
  attackSpeed: 'hero.attackSpeed',
  maxHp: 'hero.maxHp',
  criticalChance: 'hero.criticalChance',
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

function formatBonusValue(stat: UpgradeableStat, value: number): string {
  if (stat === 'criticalChance') {
    return `+${Math.round(value * 100)}%`;
  }
  if (stat === 'attackSpeed') {
    return `+${value.toFixed(2)}`;
  }
  return `+${value}`;
}

function formatPassiveBonus(passiveBonus: Partial<Record<UpgradeableStat, number>>): string {
  return Object.entries(passiveBonus)
    .map(([stat, value]) => `${t(STAT_LABEL_KEYS[stat as UpgradeableStat])} ${formatBonusValue(stat as UpgradeableStat, value ?? 0)}`)
    .join(', ');
}

function PetPanel({ gameScreenRef }: { gameScreenRef: RefObject<HTMLDivElement> }) {
  const pets = useGameStore((state) => state.pets);
  const unlockedPetIds = useGameStore((state) => state.unlockedPetIds);
  const deployedPetIds = useGameStore((state) => state.deployedPetIds);
  const castleLevel = useGameStore((state) => state.castleLevel);
  const petShards = useGameStore((state) => state.petShards);
  const petStars = useGameStore((state) => state.petStars);
  const gold = useGameStore((state) => state.gold);
  const epicSourceStone = useGameStore((state) => state.epicSourceStone);
  const legendarySourceStone = useGameStore((state) => state.legendarySourceStone);
  const diamonds = useGameStore((state) => state.diamonds);
  const starUpPet = useGameStore((state) => state.starUpPet);
  const deployPet = useGameStore((state) => state.deployPet);
  const undeployPet = useGameStore((state) => state.undeployPet);
  const setDragPreviewKind = useGameStore((state) => state.setDragPreviewKind);

  const materials = { epicSourceStone, legendarySourceStone, diamonds };
  const maxDeployedPets = getMaxDeployedPets(castleLevel);
  const squadFull = deployedPetIds.length >= maxDeployedPets;
  const ownedPets = petRosterConfig.filter((definition) => unlockedPetIds.includes(definition.id));

  const { drag, registerGameScreen, handlePointerDown, handlePointerMove, handlePointerUp, handlePointerCancel } = useDeploySlotDrag({
    onToggle: (id) => {
      if (deployedPetIds.includes(id)) {
        undeployPet(id);
      } else {
        deployPet(id);
      }
    },
    onDeploy: (id) => {
      if (!deployedPetIds.includes(id)) {
        deployPet(id);
      }
    },
  });

  useEffect(() => {
    registerGameScreen(gameScreenRef.current);
  }, [gameScreenRef, registerGameScreen]);

  // See HeroPanel's identical effect - lets BattleScreen draw the deploy-slot
  // grid only while a pet card is actually being dragged.
  useEffect(() => {
    setDragPreviewKind(drag.draggingId ? 'pet' : null);
    return () => setDragPreviewKind(null);
  }, [drag.draggingId, setDragPreviewKind]);

  const draggingDefinition = drag.draggingId ? petRosterConfig.find((d) => d.id === drag.draggingId) : undefined;

  return (
    <div className="card">
      <div className="card-title">
        {t('petRoster.title')} ({deployedPetIds.length}/{maxDeployedPets})
      </div>
      {ownedPets.length === 0 ? (
        <div className="empty-state">{t('petRoster.empty')}</div>
      ) : (
        <>
          <div className="card-subtitle">{t('squad.dragHint')}</div>
          <div className="list">
            {ownedPets.map((definition) => {
              const pet = pets.find((candidate) => candidate.id === definition.id);
              if (!pet) {
                return null;
              }
              const bonusLabel = formatPassiveBonus(definition.passiveBonus);
              const rarityLabel = t(RARITY_LABEL_KEYS[definition.rarity]);
              const isDeployed = deployedPetIds.includes(definition.id);
              const currentStar = petStars[definition.id] ?? 0;
              const shards = petShards[definition.id] ?? 0;
              const nextCost = getStarUpCost(definition.rarity, currentStar);
              const materialKey = gachaRarityConfig[definition.rarity].breakthroughMaterial;
              const canStarUp =
                !!nextCost &&
                shards >= nextCost.shards &&
                gold >= nextCost.gold &&
                (!nextCost.material || (materialKey !== undefined && materials[materialKey] >= nextCost.material));

              return (
                <div
                  key={definition.id}
                  className={`item-card drag-handle ${RARITY_BORDER_CLASS[definition.rarity]}${isDeployed ? '' : ' locked'}`}
                  onPointerDown={handlePointerDown(definition.id)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerCancel}
                >
                  <div className={`item-name ${RARITY_CLASS[definition.rarity]}`}>
                    ⠿ {rarityLabel}·{definition.id} ★{currentStar}/{MAX_STAR_LEVEL}
                  </div>
                  <div className="item-detail">
                    {t('petRoster.passiveBonus')}: {bonusLabel}
                  </div>
                  <div className="item-detail">
                    {isDeployed ? t('squad.deployed') : squadFull ? t('squad.full') : t('squad.tapToDeploy')}
                  </div>
                  <div className="item-actions" style={{ alignItems: 'center' }}>
                    <span className="text-faint">
                      {t('star.shards')} {shards}
                      {nextCost ? `/${nextCost.shards}` : ''}
                    </span>
                    <button
                      className="btn btn-sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        starUpPet(definition.id);
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      disabled={!nextCost || !canStarUp}
                    >
                      {nextCost
                        ? `${t('star.upgrade')} (${nextCost.shards}${t('star.shards')} + ${nextCost.gold}${t('battle.gold')}${
                            nextCost.material && materialKey ? ` + ${nextCost.material}${t(MATERIAL_LABEL_KEYS[materialKey])}` : ''
                          })`
                        : t('star.maxed')}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {draggingDefinition && (
        <div className="drag-ghost" style={{ left: drag.pointerX, top: drag.pointerY }}>
          {t(RARITY_LABEL_KEYS[draggingDefinition.rarity])}·{draggingDefinition.id}
        </div>
      )}
    </div>
  );
}

export default PetPanel;
