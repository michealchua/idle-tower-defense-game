import { useState } from 'react';
import { gachaPullConfig, gachaRarityConfig, type GachaRarity } from '../data/gachaConfig';
import { diamondExchangeConfig } from '../data/diamondConfig';
import { gachaPityConfig, type PityPoolId } from '../data/pityConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import type { GachaPullResult } from '../engine/systems/GachaSystem';

const RARITY_LABEL_KEYS: Record<GachaRarity, string> = {
  white: 'rarity.white',
  green: 'rarity.green',
  blue: 'rarity.blue',
  purple: 'rarity.purple',
  gold: 'rarity.gold',
  red: 'rarity.red',
  rainbow: 'rarity.rainbow',
};

// Best to worst, used to order the multi-pull rarity breakdown.
const RARITY_DISPLAY_ORDER: GachaRarity[] = ['rainbow', 'red', 'gold', 'purple', 'blue', 'green', 'white'];

function formatPitySuffix(pityHits: number): string {
  return pityHits > 0 ? ` (${t('gacha.pityTriggered')}${pityHits > 1 ? ` ×${pityHits}` : ''})` : '';
}

// Roster ids are `<rarity>-<n>` (see heroRosterConfig.ts/petRosterConfig.ts) -
// this renders as e.g. "白12" instead of the raw id, matching HeroPanel/
// PetPanel/CodexPanel's display convention.
function formatRosterLabel(rarity: GachaRarity, id: string): string {
  return `${t(RARITY_LABEL_KEYS[rarity])}${id.split('-')[1]}`;
}

function formatResult(result: GachaPullResult): string {
  const label = formatRosterLabel(result.rarity, result.id);
  const pitySuffix = formatPitySuffix(result.pityTriggered ? 1 : 0);
  if (result.isNewUnlock) {
    return `${t('gacha.lastResultNew')} ${label}!${pitySuffix}`;
  }
  const shards = gachaRarityConfig[result.rarity].shardsPerDuplicate;
  return `${label} ${t('gacha.lastResultDuplicate')} ${shards} ${t('gacha.shardsUnit')}${pitySuffix}`;
}

function formatMultiResult(results: GachaPullResult[]): string {
  const counts: Record<GachaRarity, number> = { white: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0, rainbow: 0 };
  const newUnlockLabels: string[] = [];
  let pityHits = 0;
  for (const result of results) {
    counts[result.rarity] += 1;
    if (result.isNewUnlock) {
      newUnlockLabels.push(formatRosterLabel(result.rarity, result.id));
    }
    if (result.pityTriggered) {
      pityHits += 1;
    }
  }

  const breakdown = RARITY_DISPLAY_ORDER.filter((rarity) => counts[rarity] > 0)
    .map((rarity) => `${t(RARITY_LABEL_KEYS[rarity])}×${counts[rarity]}`)
    .join(' ');
  const newLabel =
    newUnlockLabels.length > 0 ? `${t('gacha.multiResultNew')}: ${newUnlockLabels.join(', ')}` : t('gacha.multiResultNone');

  return `${breakdown} · ${newLabel}${formatPitySuffix(pityHits)}`;
}

// Shared by the gold-cost and diamond-premium rows for both hero/pet pools -
// same x1/x10/x100 shape, only the currency balance/cost/pull functions and
// pity pool differ (see gachaConfig.ts pullCostGold vs pullCostDiamonds,
// pityConfig.ts for the pool's own guarantee threshold).
function PullRow({
  label,
  costPerPull,
  currencyLabel,
  balance,
  pullOne,
  pullMulti,
  onResult,
  pityPoolId,
  pityCurrent,
}: {
  label: string;
  costPerPull: number;
  currencyLabel: string;
  balance: number;
  pullOne: () => GachaPullResult | null;
  pullMulti: (count: number) => GachaPullResult[];
  onResult: (text: string) => void;
  pityPoolId: PityPoolId;
  pityCurrent: number;
}) {
  const canAfford = (count: number) => balance >= costPerPull * count;
  const pityRule = gachaPityConfig[pityPoolId];
  const pityRarityLabel = t(RARITY_LABEL_KEYS[pityRule.rarities[0]]);

  return (
    <>
      <div className="item-detail" style={{ marginTop: 8 }}>
        {label}
      </div>
      <div className="text-faint">
        {t('gacha.pityProgress')}: {pityCurrent}/{pityRule.pullsUntilGuarantee} ({pityRarityLabel}
        {t('gacha.pityOrAbove')})
      </div>
      <div className="item-actions">
        <button
          className="btn btn-primary"
          disabled={!canAfford(1)}
          onClick={() => {
            const result = pullOne();
            if (result) {
              onResult(formatResult(result));
            }
          }}
        >
          x1 ({costPerPull} {currencyLabel})
        </button>
        <button
          className="btn btn-primary"
          disabled={!canAfford(10)}
          onClick={() => {
            const results = pullMulti(10);
            if (results.length > 0) {
              onResult(formatMultiResult(results));
            }
          }}
        >
          x10 ({costPerPull * 10} {currencyLabel})
        </button>
        {canAfford(100) && (
          <button
            className="btn btn-primary"
            onClick={() => {
              const results = pullMulti(100);
              if (results.length > 0) {
                onResult(formatMultiResult(results));
              }
            }}
          >
            x100 ({costPerPull * 100} {currencyLabel})
          </button>
        )}
      </div>
    </>
  );
}

function GachaPanel() {
  const gold = useGameStore((state) => state.gold);
  const diamonds = useGameStore((state) => state.diamonds);
  const pityCounters = useGameStore((state) => state.pityCounters);
  const pullHero = useGameStore((state) => state.pullHero);
  const pullPet = useGameStore((state) => state.pullPet);
  const pullHeroMulti = useGameStore((state) => state.pullHeroMulti);
  const pullPetMulti = useGameStore((state) => state.pullPetMulti);
  const pullHeroPremium = useGameStore((state) => state.pullHeroPremium);
  const pullPetPremium = useGameStore((state) => state.pullPetPremium);
  const pullHeroPremiumMulti = useGameStore((state) => state.pullHeroPremiumMulti);
  const pullPetPremiumMulti = useGameStore((state) => state.pullPetPremiumMulti);
  const exchangeDiamondsForGold = useGameStore((state) => state.exchangeDiamondsForGold);
  const [lastResult, setLastResult] = useState<string | null>(null);

  return (
    <div className="card">
      <div className="card-title">{t('gacha.title')}</div>

      <PullRow
        label={t('gacha.pullHero')}
        costPerPull={gachaPullConfig.pullCostGold}
        currencyLabel={t('battle.gold')}
        balance={gold}
        pullOne={pullHero}
        pullMulti={pullHeroMulti}
        onResult={setLastResult}
        pityPoolId="heroGold"
        pityCurrent={pityCounters.heroGold}
      />
      <PullRow
        label={t('gacha.pullPet')}
        costPerPull={gachaPullConfig.pullCostGold}
        currencyLabel={t('battle.gold')}
        balance={gold}
        pullOne={pullPet}
        pullMulti={pullPetMulti}
        onResult={setLastResult}
        pityPoolId="petGold"
        pityCurrent={pityCounters.petGold}
      />

      <div className="card-subtitle" style={{ marginTop: 10 }}>
        {t('gacha.premiumHint')}
      </div>
      <PullRow
        label={t('gacha.pullHeroPremium')}
        costPerPull={gachaPullConfig.pullCostDiamonds}
        currencyLabel={t('battle.diamonds')}
        balance={diamonds}
        pullOne={pullHeroPremium}
        pullMulti={pullHeroPremiumMulti}
        onResult={setLastResult}
        pityPoolId="heroPremium"
        pityCurrent={pityCounters.heroPremium}
      />
      <PullRow
        label={t('gacha.pullPetPremium')}
        costPerPull={gachaPullConfig.pullCostDiamonds}
        currencyLabel={t('battle.diamonds')}
        balance={diamonds}
        pullOne={pullPetPremium}
        pullMulti={pullPetPremiumMulti}
        onResult={setLastResult}
        pityPoolId="petPremium"
        pityCurrent={pityCounters.petPremium}
      />

      {lastResult && (
        <div className="text-faint" style={{ marginTop: 8 }}>
          {lastResult}
        </div>
      )}

      <div className="card-subtitle" style={{ marginTop: 10 }}>
        {t('gacha.exchangeHint')}
      </div>
      <div className="item-actions">
        <button
          className="btn"
          disabled={diamonds < diamondExchangeConfig.diamondsPerExchange}
          onClick={() => exchangeDiamondsForGold()}
        >
          {t('gacha.exchange')} ({diamondExchangeConfig.diamondsPerExchange} {t('battle.diamonds')} → {diamondExchangeConfig.goldPerExchange}{' '}
          {t('battle.gold')})
        </button>
      </div>
    </div>
  );
}

export default GachaPanel;
