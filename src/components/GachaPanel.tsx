import { useEffect, useState } from 'react';
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

function countByRarity(results: GachaPullResult[]): Record<GachaRarity, number> {
  const counts: Record<GachaRarity, number> = { white: 0, green: 0, blue: 0, purple: 0, gold: 0, red: 0, rainbow: 0 };
  for (const result of results) {
    counts[result.rarity] += 1;
  }
  return counts;
}

function formatMultiResult(results: GachaPullResult[]): string {
  const counts = countByRarity(results);
  const newUnlockLabels: string[] = [];
  let pityHits = 0;
  for (const result of results) {
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

// Plan section 17's "高品质抽卡拥有独特演出" - only gold/red/rainbow hits
// (single pull or anywhere in a multi-pull batch) earn the full-screen
// celebration overlay (see GachaCelebration below); everything below that
// stays as the plain result line, so the flashy moment reads as genuinely
// rare instead of firing on every pull.
const CELEBRATION_RARITIES: GachaRarity[] = ['rainbow', 'red', 'gold'];

function getBestCelebrationRarity(results: GachaPullResult[]): GachaRarity | null {
  const counts = countByRarity(results);
  return CELEBRATION_RARITIES.find((rarity) => counts[rarity] > 0) ?? null;
}

// Odds actually used by the given pool (gold pool = pullWeight, premium pool
// = premiumPullWeight - see gachaConfig.ts) as player-facing percentages -
// plan section 17's "显示概率明细". Normalizes against the sum of every
// rarity's weight for that field rather than assuming it's pre-summed to
// 100 (premiumPullWeight isn't).
function getOddsBreakdown(weightField: 'pullWeight' | 'premiumPullWeight'): { rarity: GachaRarity; pct: number }[] {
  const total = RARITY_DISPLAY_ORDER.reduce((sum, rarity) => sum + gachaRarityConfig[rarity][weightField], 0);
  return RARITY_DISPLAY_ORDER.map((rarity) => ({
    rarity,
    pct: total > 0 ? (gachaRarityConfig[rarity][weightField] / total) * 100 : 0,
  }));
}

function formatOddsPct(pct: number): string {
  return pct >= 0.1 ? `${pct.toFixed(1)}%` : `${pct.toFixed(3)}%`;
}

// Shared by the gold-cost and diamond-premium cards for both hero/pet pools -
// same x1/x10/x100 shape, only the currency balance/cost/pull functions and
// pity pool differ (see gachaConfig.ts pullCostGold vs pullCostDiamonds,
// pityConfig.ts for the pool's own guarantee threshold). The full pity rule
// sentence lives in a tooltip - the bar + fraction is enough for the default
// view.
function PullCard({
  icon,
  label,
  costPerPull,
  currencyLabel,
  balance,
  pullOne,
  pullMulti,
  onResult,
  pityPoolId,
  pityCurrent,
  showFirstTenPullBadge,
  weightField,
}: {
  icon: string;
  label: string;
  costPerPull: number;
  currencyLabel: string;
  balance: number;
  pullOne: () => GachaPullResult | null;
  pullMulti: (count: number) => GachaPullResult[];
  onResult: (text: string, results: GachaPullResult[]) => void;
  pityPoolId: PityPoolId;
  pityCurrent: number;
  // "新手绝对福利" - true until the player's very first ever 10-pull (on
  // any of the four pools) resolves, see GameState.isFirstTenPullDone.
  // Purely cosmetic here (the guarantee itself lives in GachaSystem.
  // pullMulti) - just tells the player which x10 button is the guaranteed
  // one before they click it.
  showFirstTenPullBadge: boolean;
  weightField: 'pullWeight' | 'premiumPullWeight';
}) {
  const [showOdds, setShowOdds] = useState(false);
  const canAfford = (count: number) => balance >= costPerPull * count;
  const pityRule = gachaPityConfig[pityPoolId];
  const pityRarityLabel = t(RARITY_LABEL_KEYS[pityRule.rarities[0]]);
  const pityRatio = Math.min(1, pityCurrent / pityRule.pullsUntilGuarantee);
  const oddsBreakdown = getOddsBreakdown(weightField);

  return (
    <div className="mini-card">
      <div className="mini-card-name">
        <span>{icon} {label}</span>
      </div>
      <div
        className="mini-card-sub"
        data-tooltip={`${t('gacha.pityProgress')}: ${pityCurrent}/${pityRule.pullsUntilGuarantee} (${pityRarityLabel}${t('gacha.pityOrAbove')})`}
      >
        {t('gacha.pityProgress')} {pityCurrent}/{pityRule.pullsUntilGuarantee}
      </div>
      <div className="bar-track" style={{ marginTop: 4 }}>
        <div className="bar-fill bar-fill-exp" style={{ width: `${pityRatio * 100}%` }} />
      </div>
      <button className="gacha-odds-toggle" onClick={() => setShowOdds((open) => !open)}>
        {showOdds ? '▾' : '▸'} {t('gacha.oddsDetail')}
      </button>
      {showOdds && (
        <div className="gacha-odds-list">
          {oddsBreakdown.map(({ rarity, pct }) => (
            <div key={rarity} className={`gacha-odds-row ${RARITY_LABEL_KEYS[rarity] ? `rarity-${rarity}` : ''}`}>
              <span>{t(RARITY_LABEL_KEYS[rarity])}</span>
              <span>{formatOddsPct(pct)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="item-actions" style={{ marginTop: 8 }}>
        <button
          className="btn btn-primary btn-sm"
          disabled={!canAfford(1)}
          onClick={() => {
            const result = pullOne();
            if (result) {
              onResult(formatResult(result), [result]);
            }
          }}
        >
          x1 ({costPerPull} {currencyLabel})
        </button>
        <button
          className={`btn btn-sm${showFirstTenPullBadge ? ' btn-primary first-ten-pull-highlight' : ''}`}
          disabled={!canAfford(10)}
          onClick={() => {
            const results = pullMulti(10);
            if (results.length > 0) {
              onResult(formatMultiResult(results), results);
            }
          }}
        >
          x10
          {showFirstTenPullBadge && <span className="badge badge-highlight"> {t('gacha.firstTenPullBadge')}</span>}
        </button>
        {canAfford(100) && (
          <button
            className="btn btn-sm"
            onClick={() => {
              const results = pullMulti(100);
              if (results.length > 0) {
                onResult(formatMultiResult(results), results);
              }
            }}
          >
            x100
          </button>
        )}
      </div>
    </div>
  );
}

function GachaPanel() {
  const gold = useGameStore((state) => state.gold);
  const diamonds = useGameStore((state) => state.diamonds);
  const pityCounters = useGameStore((state) => state.pityCounters);
  const isFirstTenPullDone = useGameStore((state) => state.isFirstTenPullDone);
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
  const [celebration, setCelebration] = useState<{ rarity: GachaRarity; key: number } | null>(null);

  // Auto-dismiss the celebration overlay - no explicit close action needed,
  // it's a brief flourish, not a modal the player has to acknowledge.
  useEffect(() => {
    if (!celebration) {
      return;
    }
    const timer = setTimeout(() => setCelebration(null), 1800);
    return () => clearTimeout(timer);
  }, [celebration]);

  function handleResult(text: string, results: GachaPullResult[]): void {
    setLastResult(text);
    const bestRarity = getBestCelebrationRarity(results);
    if (bestRarity) {
      setCelebration({ rarity: bestRarity, key: Date.now() });
    }
  }

  return (
    <div className="card">
      <div className="card-title">{t('gacha.title')}</div>

      {celebration && (
        <div key={celebration.key} className={`gacha-celebration gacha-celebration-${celebration.rarity}`}>
          <div className="gacha-celebration-label">{t(RARITY_LABEL_KEYS[celebration.rarity])}</div>
        </div>
      )}

      <div className="card-grid">
        <PullCard
          icon="🦸"
          label={t('gacha.pullHero')}
          costPerPull={gachaPullConfig.pullCostGold}
          currencyLabel={t('battle.gold')}
          balance={gold}
          pullOne={pullHero}
          pullMulti={pullHeroMulti}
          onResult={handleResult}
          pityPoolId="heroGold"
          pityCurrent={pityCounters.heroGold}
          showFirstTenPullBadge={!isFirstTenPullDone}
          weightField="pullWeight"
        />
        <PullCard
          icon="🐾"
          label={t('gacha.pullPet')}
          costPerPull={gachaPullConfig.pullCostGold}
          currencyLabel={t('battle.gold')}
          balance={gold}
          pullOne={pullPet}
          pullMulti={pullPetMulti}
          onResult={handleResult}
          pityPoolId="petGold"
          pityCurrent={pityCounters.petGold}
          showFirstTenPullBadge={!isFirstTenPullDone}
          weightField="pullWeight"
        />
      </div>

      <div className="card-subtitle" style={{ marginTop: 10 }}>
        {t('gacha.premiumHint')}
      </div>
      <div className="card-grid">
        <PullCard
          icon="💎🦸"
          label={t('gacha.pullHeroPremium')}
          costPerPull={gachaPullConfig.pullCostDiamonds}
          currencyLabel={t('battle.diamonds')}
          balance={diamonds}
          pullOne={pullHeroPremium}
          pullMulti={pullHeroPremiumMulti}
          onResult={handleResult}
          pityPoolId="heroPremium"
          pityCurrent={pityCounters.heroPremium}
          showFirstTenPullBadge={!isFirstTenPullDone}
          weightField="premiumPullWeight"
        />
        <PullCard
          icon="💎🐾"
          label={t('gacha.pullPetPremium')}
          costPerPull={gachaPullConfig.pullCostDiamonds}
          currencyLabel={t('battle.diamonds')}
          balance={diamonds}
          pullOne={pullPetPremium}
          pullMulti={pullPetPremiumMulti}
          onResult={handleResult}
          pityPoolId="petPremium"
          pityCurrent={pityCounters.petPremium}
          showFirstTenPullBadge={!isFirstTenPullDone}
          weightField="premiumPullWeight"
        />
      </div>

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
