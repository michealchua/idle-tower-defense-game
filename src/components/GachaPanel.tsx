import { useState } from 'react';
import { gachaPullConfig, gachaRarityConfig, type GachaRarity } from '../data/gachaConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import type { GachaPullResult } from '../engine/systems/GachaSystem';

const RARITY_LABEL_KEYS: Record<GachaRarity, string> = {
  white: 'rarity.white',
  green: 'rarity.green',
  blue: 'rarity.blue',
  purple: 'rarity.purple',
  gold: 'rarity.gold',
};

// Best to worst, used to order the multi-pull rarity breakdown.
const RARITY_DISPLAY_ORDER: GachaRarity[] = ['gold', 'purple', 'blue', 'green', 'white'];

function formatResult(result: GachaPullResult): string {
  const rarityLabel = t(RARITY_LABEL_KEYS[result.rarity]);
  if (result.isNewUnlock) {
    return `${t('gacha.lastResultNew')} ${rarityLabel}·${result.id}!`;
  }
  const shards = gachaRarityConfig[result.rarity].shardsPerDuplicate;
  return `${rarityLabel}·${result.id} ${t('gacha.lastResultDuplicate')} ${shards} ${t('gacha.shardsUnit')}`;
}

function formatMultiResult(results: GachaPullResult[]): string {
  const counts: Record<GachaRarity, number> = { white: 0, green: 0, blue: 0, purple: 0, gold: 0 };
  const newUnlockIds: string[] = [];
  for (const result of results) {
    counts[result.rarity] += 1;
    if (result.isNewUnlock) {
      newUnlockIds.push(result.id);
    }
  }

  const breakdown = RARITY_DISPLAY_ORDER.filter((rarity) => counts[rarity] > 0)
    .map((rarity) => `${t(RARITY_LABEL_KEYS[rarity])}×${counts[rarity]}`)
    .join(' ');
  const newLabel =
    newUnlockIds.length > 0 ? `${t('gacha.multiResultNew')}: ${newUnlockIds.join(', ')}` : t('gacha.multiResultNone');

  return `${breakdown} · ${newLabel}`;
}

function GachaPanel() {
  const gold = useGameStore((state) => state.gold);
  const pullHero = useGameStore((state) => state.pullHero);
  const pullPet = useGameStore((state) => state.pullPet);
  const pullHeroMulti = useGameStore((state) => state.pullHeroMulti);
  const pullPetMulti = useGameStore((state) => state.pullPetMulti);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const canAfford = (count: number) => gold >= gachaPullConfig.pullCostGold * count;

  return (
    <div className="card">
      <div className="card-title">{t('gacha.title')}</div>

      <div className="item-detail" style={{ marginTop: 4 }}>
        {t('gacha.pullHero')}
      </div>
      <div className="item-actions">
        <button
          className="btn btn-primary"
          disabled={!canAfford(1)}
          onClick={() => {
            const result = pullHero();
            if (result) {
              setLastResult(formatResult(result));
            }
          }}
        >
          x1 ({gachaPullConfig.pullCostGold} {t('battle.gold')})
        </button>
        <button
          className="btn btn-primary"
          disabled={!canAfford(10)}
          onClick={() => {
            const results = pullHeroMulti(10);
            if (results.length > 0) {
              setLastResult(formatMultiResult(results));
            }
          }}
        >
          x10 ({gachaPullConfig.pullCostGold * 10} {t('battle.gold')})
        </button>
        {canAfford(100) && (
          <button
            className="btn btn-primary"
            onClick={() => {
              const results = pullHeroMulti(100);
              if (results.length > 0) {
                setLastResult(formatMultiResult(results));
              }
            }}
          >
            x100 ({gachaPullConfig.pullCostGold * 100} {t('battle.gold')})
          </button>
        )}
      </div>

      <div className="item-detail" style={{ marginTop: 8 }}>
        {t('gacha.pullPet')}
      </div>
      <div className="item-actions">
        <button
          className="btn btn-primary"
          disabled={!canAfford(1)}
          onClick={() => {
            const result = pullPet();
            if (result) {
              setLastResult(formatResult(result));
            }
          }}
        >
          x1 ({gachaPullConfig.pullCostGold} {t('battle.gold')})
        </button>
        <button
          className="btn btn-primary"
          disabled={!canAfford(10)}
          onClick={() => {
            const results = pullPetMulti(10);
            if (results.length > 0) {
              setLastResult(formatMultiResult(results));
            }
          }}
        >
          x10 ({gachaPullConfig.pullCostGold * 10} {t('battle.gold')})
        </button>
        {canAfford(100) && (
          <button
            className="btn btn-primary"
            onClick={() => {
              const results = pullPetMulti(100);
              if (results.length > 0) {
                setLastResult(formatMultiResult(results));
              }
            }}
          >
            x100 ({gachaPullConfig.pullCostGold * 100} {t('battle.gold')})
          </button>
        )}
      </div>

      {lastResult && (
        <div className="text-faint" style={{ marginTop: 8 }}>
          {lastResult}
        </div>
      )}
    </div>
  );
}

export default GachaPanel;
