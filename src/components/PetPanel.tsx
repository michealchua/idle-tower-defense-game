import { useState } from 'react';
import { petRosterConfig, type PetDefinition } from '../data/petRosterConfig';
import type { UpgradeableStat } from '../data/heroConfig';
import { MAX_STAR_LEVEL, gachaRarityConfig, getStarUpCost, type GachaRarity } from '../data/gachaConfig';
import type { PetState } from '../engine/types';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

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

function petLabel(definition: PetDefinition): string {
  return `${t(RARITY_LABEL_KEYS[definition.rarity])}${definition.id.split('-')[1]}`;
}

interface Materials {
  epicSourceStone: number;
  legendarySourceStone: number;
  diamonds: number;
}

function PetDetail({ definition, gold, materials }: { definition: PetDefinition; gold: number; materials: Materials }) {
  const starUpPet = useGameStore((state) => state.starUpPet);
  const currentStar = useGameStore((state) => state.petStars[definition.id] ?? 0);
  const shards = useGameStore((state) => state.petShards[definition.id] ?? 0);
  const nextCost = getStarUpCost(definition.rarity, currentStar);
  const materialKey = gachaRarityConfig[definition.rarity].breakthroughMaterial;
  const canStarUp =
    !!nextCost &&
    shards >= nextCost.shards &&
    gold >= nextCost.gold &&
    (!nextCost.material || (materialKey !== undefined && materials[materialKey] >= nextCost.material));
  const passiveEntries = Object.entries(definition.passiveBonus) as [UpgradeableStat, number][];

  return (
    <div className={`detail-card ${RARITY_BORDER_CLASS[definition.rarity]}`}>
      <div className={`detail-title ${RARITY_CLASS[definition.rarity]}`}>
        {petLabel(definition)} <span className="text-faint">★{currentStar}/{MAX_STAR_LEVEL}</span>
      </div>
      <div className="item-detail">{t('petRoster.active')}</div>

      <div className="stat-grid">
        {passiveEntries.map(([stat, value]) => (
          <div className="stat-tile" key={stat}>
            <div className="stat-tile-label">{t(STAT_LABEL_KEYS[stat])}</div>
            <div className="stat-tile-value">{formatBonusValue(stat, value ?? 0)}</div>
          </div>
        ))}
      </div>

      <div className="item-actions" style={{ alignItems: 'center' }}>
        <span className="text-faint">
          {t('star.shards')} {shards}
          {nextCost ? `/${nextCost.shards}` : ''}
        </span>
        <button className="btn btn-sm btn-primary" onClick={() => starUpPet(definition.id)} disabled={!nextCost || !canStarUp}>
          {nextCost
            ? `${t('star.upgrade')} (${nextCost.shards}${t('star.shards')} + ${nextCost.gold}${t('battle.gold')}${
                nextCost.material && materialKey ? ` + ${nextCost.material}${t(MATERIAL_LABEL_KEYS[materialKey])}` : ''
              })`
            : t('star.maxed')}
        </button>
      </div>
    </div>
  );
}

// Every owned pet is always active (see PetSystem.ts/HeroStatsSystem
// .computePetPassiveBonuses) - no deploy/undeploy toggle, no squad-slot
// count, unlike HeroPanel. Still uses the same master-detail shape so the
// roster reads consistently across panels.
function PetPanel() {
  const pets = useGameStore((state) => state.pets);
  const unlockedPetIds = useGameStore((state) => state.unlockedPetIds);
  const petStars = useGameStore((state) => state.petStars);
  const gold = useGameStore((state) => state.gold);
  const epicSourceStone = useGameStore((state) => state.epicSourceStone);
  const legendarySourceStone = useGameStore((state) => state.legendarySourceStone);
  const diamonds = useGameStore((state) => state.diamonds);
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null);

  const materials: Materials = { epicSourceStone, legendarySourceStone, diamonds };
  const ownedPets = petRosterConfig.filter((definition) => unlockedPetIds.includes(definition.id));

  const effectiveSelectedId =
    selectedPetId && ownedPets.some((d) => d.id === selectedPetId) ? selectedPetId : ownedPets[0]?.id ?? null;
  const selectedDefinition = ownedPets.find((d) => d.id === effectiveSelectedId);

  function petByDefinition(definition: PetDefinition): PetState | undefined {
    return pets.find((candidate) => candidate.id === definition.id);
  }

  return (
    <div className="card">
      <div className="card-title">
        {t('petRoster.title')} ({ownedPets.length})
      </div>
      {ownedPets.length === 0 ? (
        <div className="empty-state">{t('petRoster.empty')}</div>
      ) : (
        <div className="master-detail">
          <div className="master-list">
            {ownedPets.map((definition) => {
              if (!petByDefinition(definition)) {
                return null;
              }
              const isSelected = definition.id === effectiveSelectedId;
              return (
                <button
                  key={definition.id}
                  type="button"
                  className={`mini-card selectable ${RARITY_BORDER_CLASS[definition.rarity]}${isSelected ? ' active' : ''}`}
                  onClick={() => setSelectedPetId(definition.id)}
                >
                  <div className={`mini-card-name ${RARITY_CLASS[definition.rarity]}`}>{petLabel(definition)}</div>
                  <div className="mini-card-sub">★{petStars[definition.id] ?? 0}/{MAX_STAR_LEVEL}</div>
                </button>
              );
            })}
          </div>
          <div className="detail-pane">
            {selectedDefinition ? (
              <PetDetail definition={selectedDefinition} gold={gold} materials={materials} />
            ) : (
              <div className="empty-state">{t('battle.selectPanel')}</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default PetPanel;
