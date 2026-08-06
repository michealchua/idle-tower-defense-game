import { petRosterConfig } from '../data/petRosterConfig';
import type { UpgradeableStat } from '../data/heroConfig';
import { MAX_STAR_LEVEL, gachaRarityConfig, getStarUpCost, type GachaRarity } from '../data/gachaConfig';
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

function formatPassiveBonus(passiveBonus: Partial<Record<UpgradeableStat, number>>): string {
  return Object.entries(passiveBonus)
    .map(([stat, value]) => `${t(STAT_LABEL_KEYS[stat as UpgradeableStat])} ${formatBonusValue(stat as UpgradeableStat, value ?? 0)}`)
    .join(', ');
}

// Every owned pet is always active (see PetSystem.ts/HeroStatsSystem
// .computePetPassiveBonuses) - no deploy/undeploy toggle, no squad-slot
// count, unlike HeroPanel.
function PetPanel() {
  const pets = useGameStore((state) => state.pets);
  const unlockedPetIds = useGameStore((state) => state.unlockedPetIds);
  const petShards = useGameStore((state) => state.petShards);
  const petStars = useGameStore((state) => state.petStars);
  const gold = useGameStore((state) => state.gold);
  const epicSourceStone = useGameStore((state) => state.epicSourceStone);
  const legendarySourceStone = useGameStore((state) => state.legendarySourceStone);
  const diamonds = useGameStore((state) => state.diamonds);
  const starUpPet = useGameStore((state) => state.starUpPet);

  const materials = { epicSourceStone, legendarySourceStone, diamonds };
  const ownedPets = petRosterConfig.filter((definition) => unlockedPetIds.includes(definition.id));

  return (
    <div className="card">
      <div className="card-title">
        {t('petRoster.title')} ({ownedPets.length})
      </div>
      {ownedPets.length === 0 ? (
        <div className="empty-state">{t('petRoster.empty')}</div>
      ) : (
        <div className="list">
          {ownedPets.map((definition) => {
            const pet = pets.find((candidate) => candidate.id === definition.id);
            if (!pet) {
              return null;
            }
            const bonusLabel = formatPassiveBonus(definition.passiveBonus);
            const rarityLabel = t(RARITY_LABEL_KEYS[definition.rarity]);
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
              <div key={definition.id} className={`item-card ${RARITY_BORDER_CLASS[definition.rarity]}`}>
                <div className={`item-name ${RARITY_CLASS[definition.rarity]}`}>
                  {rarityLabel}
                  {definition.id.split('-')[1]} ★{currentStar}/{MAX_STAR_LEVEL}
                </div>
                <div className="item-detail">
                  {t('petRoster.passiveBonus')}: {bonusLabel}
                </div>
                <div className="item-detail">{t('petRoster.active')}</div>
                <div className="item-actions" style={{ alignItems: 'center' }}>
                  <span className="text-faint">
                    {t('star.shards')} {shards}
                    {nextCost ? `/${nextCost.shards}` : ''}
                  </span>
                  <button
                    className="btn btn-sm"
                    onClick={() => starUpPet(definition.id)}
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
      )}
    </div>
  );
}

export default PetPanel;
