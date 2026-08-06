import { heroRosterConfig } from '../data/heroRosterConfig';
import { skillDefinitions } from '../data/skillConfig';
import { getMaxDeployedHeroes } from '../data/castleConfig';
import { MAX_STAR_LEVEL, gachaRarityConfig, getStarUpCost, type GachaRarity } from '../data/gachaConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

const SKILL_LABEL_KEYS: Record<string, string> = {
  'skill-fireball': 'skill.fireball',
  'skill-meteor': 'skill.meteor',
  'skill-lightning': 'skill.lightning',
};

const RARITY_LABEL_KEYS: Record<GachaRarity, string> = {
  white: 'rarity.white',
  green: 'rarity.green',
  blue: 'rarity.blue',
  purple: 'rarity.purple',
  gold: 'rarity.gold',
};

const RARITY_CLASS: Record<GachaRarity, string> = {
  white: 'rarity-white',
  green: 'rarity-green',
  blue: 'rarity-blue',
  purple: 'rarity-purple',
  gold: 'rarity-gold',
};

const RARITY_BORDER_CLASS: Record<GachaRarity, string> = {
  white: 'border-rarity-white',
  green: 'border-rarity-green',
  blue: 'border-rarity-blue',
  purple: 'border-rarity-purple',
  gold: 'border-rarity-gold',
};

const MATERIAL_LABEL_KEYS = {
  epicSourceStone: 'material.epicSourceStone',
  legendarySourceStone: 'material.legendarySourceStone',
} as const;

function HeroPanel() {
  const heroes = useGameStore((state) => state.heroes);
  const unlockedHeroIds = useGameStore((state) => state.unlockedHeroIds);
  const deployedHeroIds = useGameStore((state) => state.deployedHeroIds);
  const castleLevel = useGameStore((state) => state.castleLevel);
  const heroShards = useGameStore((state) => state.heroShards);
  const heroStars = useGameStore((state) => state.heroStars);
  const gold = useGameStore((state) => state.gold);
  const epicSourceStone = useGameStore((state) => state.epicSourceStone);
  const legendarySourceStone = useGameStore((state) => state.legendarySourceStone);
  const starUpHero = useGameStore((state) => state.starUpHero);
  const deployHero = useGameStore((state) => state.deployHero);
  const undeployHero = useGameStore((state) => state.undeployHero);

  const materials = { epicSourceStone, legendarySourceStone };
  const maxDeployedHeroes = getMaxDeployedHeroes(castleLevel);
  const squadFull = deployedHeroIds.length >= maxDeployedHeroes;
  const ownedHeroes = heroRosterConfig.filter((definition) => unlockedHeroIds.includes(definition.id));

  return (
    <div className="card">
      <div className="card-title">
        {t('heroRoster.title')} ({deployedHeroIds.length}/{maxDeployedHeroes})
      </div>
      {ownedHeroes.length === 0 ? (
        <div className="empty-state">{t('heroRoster.empty')}</div>
      ) : (
        <div className="list">
          {ownedHeroes.map((definition) => {
            const hero = heroes.find((candidate) => candidate.id === definition.id);
            if (!hero) {
              return null;
            }
            const rarityLabel = t(RARITY_LABEL_KEYS[definition.rarity]);
            const isDeployed = deployedHeroIds.includes(definition.id);
            const expRatio = Math.min(1, hero.exp / hero.expToNextLevel);
            const currentStar = heroStars[definition.id] ?? 0;
            const shards = heroShards[definition.id] ?? 0;
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
                className={`item-card ${RARITY_BORDER_CLASS[definition.rarity]}${isDeployed ? '' : ' locked'}`}
              >
                <div className={`item-name ${RARITY_CLASS[definition.rarity]}`}>
                  {rarityLabel}·{definition.id} Lv.{hero.level} ★{currentStar}/{MAX_STAR_LEVEL}
                </div>
                <div className="item-detail">
                  {t('hero.attackDamage')} {Math.round(hero.attackDamage)} · {t('hero.hp')} {Math.round(hero.currentHp)}/
                  {Math.round(hero.maxHp)}
                </div>
                <div className="bar-track" style={{ marginTop: 4 }}>
                  <div className="bar-fill bar-fill-exp" style={{ width: `${expRatio * 100}%` }} />
                </div>
                <div className="item-detail">
                  {t('hero.exp')} {hero.exp}/{hero.expToNextLevel}
                </div>
                <div className="item-actions" style={{ alignItems: 'center' }}>
                  <span className="text-faint">
                    {t('star.shards')} {shards}
                    {nextCost ? `/${nextCost.shards}` : ''}
                  </span>
                  <button className="btn btn-sm" onClick={() => starUpHero(definition.id)} disabled={!nextCost || !canStarUp}>
                    {nextCost
                      ? `${t('star.upgrade')} (${nextCost.shards}${t('star.shards')} + ${nextCost.gold}${t('battle.gold')}${
                          nextCost.material && materialKey ? ` + ${nextCost.material}${t(MATERIAL_LABEL_KEYS[materialKey])}` : ''
                        })`
                      : t('star.maxed')}
                  </button>
                </div>
                <div className="item-actions">
                  {isDeployed ? (
                    <button className="btn btn-sm" onClick={() => undeployHero(definition.id)}>
                      {t('squad.deployed')} → {t('squad.undeploy')}
                    </button>
                  ) : (
                    <button className="btn btn-sm" disabled={squadFull} onClick={() => deployHero(definition.id)}>
                      {squadFull ? t('squad.full') : t('squad.deploy')}
                    </button>
                  )}
                </div>
                {Object.keys(skillDefinitions)
                  .filter((skillId) => hero.unlockedMilestoneIds.includes(skillId))
                  .map((skillId) => {
                    const cooldownRemaining = hero.skills[skillId]?.cooldownRemaining ?? 0;
                    return (
                      <div key={skillId} className="text-faint" style={{ marginTop: 2 }}>
                        {t(SKILL_LABEL_KEYS[skillId])}: {cooldownRemaining > 0 ? `${cooldownRemaining.toFixed(1)}s` : t('skill.ready')}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default HeroPanel;
