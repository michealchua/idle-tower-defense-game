import { useEffect, useState } from 'react';
import { gachaPullConfig, gachaRarityConfig, type GachaRarity } from '../data/gachaConfig';
import { diamondExchangeConfig } from '../data/diamondConfig';
import { gachaPityConfig, type PityPoolId } from '../data/pityConfig';
import { isPanelUnlocked, panelUnlockWave } from '../data/unlockConditionConfig';
import { getGlobalWaveNumber } from '../engine/systems/WaveSystem';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import type { GachaPullResult } from '../engine/systems/GachaSystem';
import { IconSword, IconPaw, IconDiamond, type IconProps } from './icons';
import SpriteAvatar from './SpriteAvatar';
import { getHeroSpriteSrc, getPetSpriteSrc } from '../render/assetLoader';
import { sfxManager } from '../audio/SfxManager';
import { heroRosterConfig } from '../data/heroRosterConfig';
import { petRosterConfig } from '../data/petRosterConfig';

// A pull result's id is unique to exactly one roster (hero ids are
// `<rarity>-N`, pet ids are `pet-N` - see heroRosterConfig.ts/
// petRosterConfig.ts's generators, no overlap) - GachaPullResult itself
// carries no hero/pet tag, so this tries the hero roster first and falls
// back to pet.
function gachaResultAvatarSrc(result: GachaPullResult): string {
  const heroDefinition = heroRosterConfig.find((hero) => hero.id === result.id);
  if (heroDefinition) {
    return getHeroSpriteSrc(heroDefinition.class);
  }
  const petDefinition = petRosterConfig.find((pet) => pet.id === result.id);
  return getPetSpriteSrc(petDefinition?.spriteId ?? petDefinition?.id ?? result.id);
}

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

// Heroes have a real deterministic name (HeroDefinition.name, see
// heroRosterConfig.ts's doc comment) already shown everywhere else a hero
// appears (HeroPanel, CodexPanel) - this used to show "白12"-style rarity+
// number placeholders here instead, the one place in the whole app that
// didn't use the real name. Pets have no equivalent name field yet (see
// PetDefinition - only a cosmetic spriteId), so they keep the rarity+number
// fallback until pets get real names of their own.
function formatRosterLabel(rarity: GachaRarity, id: string): string {
  const heroDefinition = heroRosterConfig.find((hero) => hero.id === id);
  if (heroDefinition) {
    return heroDefinition.name;
  }
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

// Actual best rarity in the batch, not just celebration-tier - used to color
// GachaSummonOverlay's ring so it always reflects what was actually pulled
// instead of a fixed color regardless of outcome.
function getBestRarity(results: GachaPullResult[]): GachaRarity {
  const counts = countByRarity(results);
  return RARITY_DISPLAY_ORDER.find((rarity) => counts[rarity] > 0) ?? 'white';
}

// Solid accent color per rarity for the reveal card's front-face border/glow
// - CSS var references (not raw hex) so this stays in sync with whatever
// index.css's :root rarity palette is. Rainbow has no single solid color
// (see .rarity-rainbow's gradient text treatment), so it borrows its
// brightest gradient stop as a stand-in solid accent.
const RARITY_ACCENT_VAR: Record<GachaRarity, string> = {
  white: 'var(--rarity-white)',
  green: 'var(--rarity-green)',
  blue: 'var(--rarity-blue)',
  purple: 'var(--rarity-purple)',
  gold: 'var(--rarity-gold)',
  red: 'var(--rarity-red)',
  rainbow: 'var(--rarity-rainbow-3)',
};

// Whole reveal sequence never takes longer than this to finish flipping
// every card on its own, regardless of how many were pulled (x100 still
// finishes in ~3s, not 100x the per-card delay) - the skip button exists for
// anyone who doesn't want to wait even that long.
const REVEAL_TOTAL_BUDGET_MS = 3200;
const REVEAL_STAGGER_MS_MIN = 90;
const REVEAL_STAGGER_MS_MAX = 400;

// Matches index.css's gacha-summon-grow/-flash animation durations (1.1s) -
// kept as one named constant instead of duplicating the literal, so the JS
// auto-advance timer and the CSS animation that has to finish playing before
// it fires never drift out of sync if either changes later.
const SUMMON_ANIMATION_MS = 1100;

// "开蛋/召唤阵" process animation shown between pressing a pull button and
// GachaRevealOverlay's card flips starting - two counter-spinning rings that
// grow/fade plus a flash pulse (index.css's gacha-summon-* classes/keyframes),
// same for every pull regardless of size or rarity (the rarity-specific
// payoff is GachaCelebration below, after the cards are actually revealed).
// Purely a timed pass-through: nothing here is interactive, it just calls
// onDone once the animation's had time to play.
function GachaSummonOverlay({ onDone, accentColor }: { onDone: () => void; accentColor: string }) {
  useEffect(() => {
    const timer = setTimeout(onDone, SUMMON_ANIMATION_MS);
    return () => clearTimeout(timer);
    // Deliberately mount-once, not [onDone] - GachaPanel re-renders ~10x/sec
    // (it selects state.wave, which snapshotGameState spreads into a fresh
    // object every game tick regardless of whether wave data actually
    // changed), which redefines the handleSummonDone closure passed in as
    // onDone on every single one of those renders. Depending on it here
    // would tear down and reschedule this setTimeout before it ever had a
    // chance to fire - the animation would play its CSS loop forever and
    // never actually hand off to the reveal overlay. onDone only needs to
    // fire once, whichever reference happened to be current when this
    // component mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="gacha-summon-backdrop">
      <div className="gacha-summon-grow">
        <div className="gacha-summon-circle" />
        {/* Outer ring's color reflects the actual best rarity in this pull
            (see getBestRarity) instead of a fixed hardcoded color - a
            purple ring every time regardless of outcome was misleading. The
            pull result is already determined by this point (results exist,
            just not yet flipped face-up), so coloring the ring doesn't
            reveal anything the reveal-card flip sequence wouldn't anyway. */}
        <div className="gacha-summon-circle gacha-summon-circle-outer" style={{ borderTopColor: accentColor, borderLeftColor: accentColor }} />
      </div>
      <div className="gacha-summon-flash" />
    </div>
  );
}

// Full card-by-card reveal sequence shown before a pull's result text/
// celebration flash - each result starts face-down and flips over on its own
// stagger, tap-anywhere/skip button instantly reveals the rest, and the
// confirm button (only enabled once every card is face-up) hands control
// back to GachaPanel via onDone.
function GachaRevealOverlay({ results, onDone }: { results: GachaPullResult[]; onDone: () => void }) {
  const [revealedCount, setRevealedCount] = useState(0);
  const staggerMs = Math.min(REVEAL_STAGGER_MS_MAX, Math.max(REVEAL_STAGGER_MS_MIN, REVEAL_TOTAL_BUDGET_MS / results.length));
  const allRevealed = revealedCount >= results.length;

  useEffect(() => {
    if (allRevealed) {
      return;
    }
    const timer = setTimeout(() => setRevealedCount((count) => count + 1), staggerMs);
    return () => clearTimeout(timer);
  }, [revealedCount, allRevealed, staggerMs]);

  return (
    <div className="gacha-reveal-backdrop" onClick={() => !allRevealed && setRevealedCount(results.length)}>
      <div className="gacha-reveal-grid">
        {results.map((result, index) => {
          const accent = RARITY_ACCENT_VAR[result.rarity];
          return (
            <div key={index} className={`gacha-reveal-card${index < revealedCount ? ' is-revealed' : ''}`}>
              <div className="gacha-reveal-card-inner">
                <div className="gacha-reveal-card-back">?</div>
                <div className="gacha-reveal-card-front" style={{ borderColor: accent, boxShadow: `0 0 10px ${accent}` }}>
                  <SpriteAvatar src={gachaResultAvatarSrc(result)} size={32} />
                  <div className={`gacha-reveal-card-label rarity-${result.rarity}`}>{formatRosterLabel(result.rarity, result.id)}</div>
                  {result.isNewUnlock && <div className="gacha-reveal-card-new">{t('gacha.multiResultNew')}</div>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="gacha-reveal-actions">
        {allRevealed ? (
          <button className="btn btn-primary" onClick={onDone}>
            {t('gacha.revealConfirm')}
          </button>
        ) : (
          <button className="btn btn-sm" onClick={() => setRevealedCount(results.length)}>
            {t('gacha.revealSkip')}
          </button>
        )}
      </div>
    </div>
  );
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
  kind,
  isPremium = false,
  label,
  costPerPull,
  currencyLabel,
  balance,
  pullOne,
  pullMulti,
  onResults,
  pityPoolId,
  pityCurrent,
  showFirstTenPullBadge,
  weightField,
}: {
  kind: 'hero' | 'pet';
  isPremium?: boolean;
  label: string;
  costPerPull: number;
  currencyLabel: string;
  balance: number;
  pullOne: () => GachaPullResult | null;
  pullMulti: (count: number) => GachaPullResult[];
  onResults: (results: GachaPullResult[]) => void;
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
  const KindIcon: (props: IconProps) => JSX.Element = kind === 'hero' ? IconSword : IconPaw;

  return (
    <div className="mini-card">
      <div className="mini-card-name">
        <span>
          {isPremium && <IconDiamond />} <KindIcon /> {label}
        </span>
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
              onResults([result]);
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
              onResults(results);
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
                onResults(results);
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

// Placeholder shown in place of the pet pull cards until the Pet panel
// itself unlocks (panelUnlockWave.pet) - without this, a player could pull
// (and own) pets from wave 20 (Gacha unlocks) through wave 50 with no Pet
// panel yet in existence to view or manage what they'd gotten.
function PetGachaLockedCard({ requiredWave }: { requiredWave: number }) {
  return (
    <div className="mini-card">
      <div className="mini-card-name">
        <IconPaw /> {t('gacha.pullPet')}
      </div>
      <div className="mini-card-sub text-faint">
        {t('gacha.petLocked')} {requiredWave}
      </div>
    </div>
  );
}

function GachaPanel() {
  const gold = useGameStore((state) => state.gold);
  const diamonds = useGameStore((state) => state.diamonds);
  const wave = useGameStore((state) => state.wave);
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
  // Holds the raw pull results while GachaSummonOverlay's process animation
  // plays out - handleSummonDone hands them off to pendingReveal once that
  // finishes, so the card-flip sequence never starts before the summon
  // animation has had its moment.
  const [summonResults, setSummonResults] = useState<GachaPullResult[] | null>(null);
  // Holds the raw pull results while GachaRevealOverlay plays out its
  // card-by-card flip sequence - lastResult/celebration only get set once
  // that finishes (see handleRevealDone), so the flash/text never appear
  // before the player has actually seen every card revealed.
  const [pendingReveal, setPendingReveal] = useState<GachaPullResult[] | null>(null);
  const petRequiredWave = panelUnlockWave.pet ?? 0;
  const petUnlocked = isPanelUnlocked('pet', getGlobalWaveNumber(wave));

  // Auto-dismiss the celebration overlay - no explicit close action needed,
  // it's a brief flourish, not a modal the player has to acknowledge.
  useEffect(() => {
    if (!celebration) {
      return;
    }
    const timer = setTimeout(() => setCelebration(null), 1800);
    return () => clearTimeout(timer);
  }, [celebration]);

  function handlePullResults(results: GachaPullResult[]): void {
    sfxManager.playGachaWhoosh();
    setSummonResults(results);
  }

  function handleSummonDone(): void {
    if (!summonResults) {
      return;
    }
    setPendingReveal(summonResults);
    setSummonResults(null);
  }

  function handleRevealDone(): void {
    if (!pendingReveal) {
      return;
    }
    const text = pendingReveal.length === 1 ? formatResult(pendingReveal[0]) : formatMultiResult(pendingReveal);
    setLastResult(text);
    const bestRarity = getBestCelebrationRarity(pendingReveal);
    if (bestRarity) {
      setCelebration({ rarity: bestRarity, key: Date.now() });
      sfxManager.playGachaRareChime();
    } else {
      sfxManager.playGachaChime();
    }
    setPendingReveal(null);
  }

  return (
    <div className="card">
      <div className="card-title">{t('gacha.title')}</div>

      {summonResults && <GachaSummonOverlay onDone={handleSummonDone} accentColor={RARITY_ACCENT_VAR[getBestRarity(summonResults)]} />}

      {pendingReveal && <GachaRevealOverlay results={pendingReveal} onDone={handleRevealDone} />}

      {/* The single gold/red/rainbow character pop (the old
          .gacha-celebration-label child) was cut per user feedback - the
          rarity-tinted glow/ring/aurora flourish on this div itself (its
          ::before/::after, keyed by the rarity-specific class) stays. */}
      {celebration && <div key={celebration.key} className={`gacha-celebration gacha-celebration-${celebration.rarity}`} />}

      <div className="card-grid">
        <PullCard
          kind="hero"
          label={t('gacha.pullHero')}
          costPerPull={gachaPullConfig.pullCostGold}
          currencyLabel={t('battle.gold')}
          balance={gold}
          pullOne={pullHero}
          pullMulti={pullHeroMulti}
          onResults={handlePullResults}
          pityPoolId="heroGold"
          pityCurrent={pityCounters.heroGold}
          showFirstTenPullBadge={false}
          weightField="pullWeight"
        />
        {petUnlocked ? (
          <PullCard
            kind="pet"
            label={t('gacha.pullPet')}
            costPerPull={gachaPullConfig.pullCostGold}
            currencyLabel={t('battle.gold')}
            balance={gold}
            pullOne={pullPet}
            pullMulti={pullPetMulti}
            onResults={handlePullResults}
            pityPoolId="petGold"
            pityCurrent={pityCounters.petGold}
            showFirstTenPullBadge={false}
            weightField="pullWeight"
          />
        ) : (
          <PetGachaLockedCard requiredWave={petRequiredWave} />
        )}
      </div>

      <div className="card-subtitle" style={{ marginTop: 10 }}>
        {t('gacha.premiumHint')}
      </div>
      <div className="card-grid">
        <PullCard
          kind="hero"
          isPremium
          label={t('gacha.pullHeroPremium')}
          costPerPull={gachaPullConfig.pullCostDiamonds}
          currencyLabel={t('battle.diamonds')}
          balance={diamonds}
          pullOne={pullHeroPremium}
          pullMulti={pullHeroPremiumMulti}
          onResults={handlePullResults}
          pityPoolId="heroPremium"
          pityCurrent={pityCounters.heroPremium}
          showFirstTenPullBadge={!isFirstTenPullDone}
          weightField="premiumPullWeight"
        />
        {petUnlocked ? (
          <PullCard
            kind="pet"
            isPremium
            label={t('gacha.pullPetPremium')}
            costPerPull={gachaPullConfig.pullCostDiamonds}
            currencyLabel={t('battle.diamonds')}
            balance={diamonds}
            pullOne={pullPetPremium}
            pullMulti={pullPetPremiumMulti}
            onResults={handlePullResults}
            pityPoolId="petPremium"
            pityCurrent={pityCounters.petPremium}
            showFirstTenPullBadge={!isFirstTenPullDone}
            weightField="premiumPullWeight"
          />
        ) : (
          <PetGachaLockedCard requiredWave={petRequiredWave} />
        )}
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
