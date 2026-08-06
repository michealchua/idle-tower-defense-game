import { getMaxDeployedTowers } from '../data/castleConfig';
import { getTowerUpgradeCost, towerConfig, towerIds, type TowerId } from '../data/towerConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

const TOWER_NAME_KEYS: Record<TowerId, string> = {
  cannonTower: 'tower.cannonTower',
  frostTower: 'tower.frostTower',
  lightningTower: 'tower.lightningTower',
  goldTower: 'tower.goldTower',
};

const TOWER_DESC_KEYS: Record<TowerId, string> = {
  cannonTower: 'tower.cannonTowerDesc',
  frostTower: 'tower.frostTowerDesc',
  lightningTower: 'tower.lightningTowerDesc',
  goldTower: 'tower.goldTowerDesc',
};

function TowerPanel() {
  const towers = useGameStore((state) => state.towers);
  const unlockedTowerIds = useGameStore((state) => state.unlockedTowerIds);
  const deployedTowerIds = useGameStore((state) => state.deployedTowerIds);
  const castleLevel = useGameStore((state) => state.castleLevel);
  const gold = useGameStore((state) => state.gold);
  const buildTower = useGameStore((state) => state.buildTower);
  const deployTower = useGameStore((state) => state.deployTower);
  const undeployTower = useGameStore((state) => state.undeployTower);
  const upgradeTower = useGameStore((state) => state.upgradeTower);

  const maxDeployedTowers = getMaxDeployedTowers(castleLevel);
  const squadFull = deployedTowerIds.length >= maxDeployedTowers;

  return (
    <div className="card">
      <div className="card-title">
        {t('tower.title')} ({deployedTowerIds.length}/{maxDeployedTowers})
      </div>
      <div className="list">
        {towerIds.map((towerId) => {
          const def = towerConfig[towerId];
          const isUnlocked = unlockedTowerIds.includes(towerId);
          const tower = towers.find((candidate) => candidate.id === towerId);

          if (!isUnlocked || !tower) {
            return (
              <div key={towerId} className="item-card locked">
                <div className="item-name">{t(TOWER_NAME_KEYS[towerId])}</div>
                <div className="item-detail">{t(TOWER_DESC_KEYS[towerId])}</div>
                <div className="item-actions">
                  <button className="btn btn-sm" disabled={gold < def.buildCost} onClick={() => buildTower(towerId)}>
                    {t('tower.build')} ({def.buildCost} {t('battle.gold')})
                  </button>
                </div>
              </div>
            );
          }

          const isDeployed = deployedTowerIds.includes(towerId);
          const upgradeCost = getTowerUpgradeCost(towerId, tower.level);
          const canUpgrade = gold >= upgradeCost;

          return (
            <div key={towerId} className={`item-card${isDeployed ? '' : ' locked'}`}>
              <div className="item-name">
                {t(TOWER_NAME_KEYS[towerId])} Lv.{tower.level}
              </div>
              <div className="item-detail">{t(TOWER_DESC_KEYS[towerId])}</div>
              <div className="item-detail">
                {def.kind === 'economy' ? (
                  <>
                    {t('tower.goldPerSecond')} {tower.goldPerSecond.toFixed(1)}
                  </>
                ) : (
                  <>
                    {t('tower.damage')} {Math.round(tower.attackDamage)} · {t('tower.speed')} {tower.attackSpeed.toFixed(2)} ·{' '}
                    {t('tower.range')} {Math.round(tower.attackRange)}
                    {def.kind === 'cannon' && def.splashRadius ? ` · ${t('tower.splash')} ${def.splashRadius}` : ''}
                    {def.kind === 'lightning' && def.chainCount ? ` · ${t('tower.chain')} ${def.chainCount}` : ''}
                    {def.kind === 'frost' && def.slowMultiplier
                      ? ` · ${t('tower.slow')} ${Math.round((1 - def.slowMultiplier) * 100)}%`
                      : ''}
                  </>
                )}
              </div>
              <div className="item-actions">
                <button className="btn btn-sm" onClick={() => upgradeTower(towerId)} disabled={!canUpgrade}>
                  {t('tower.upgrade')} ({upgradeCost} {t('battle.gold')})
                </button>
                {isDeployed ? (
                  <button className="btn btn-sm" onClick={() => undeployTower(towerId)}>
                    {t('squad.deployed')} → {t('squad.undeploy')}
                  </button>
                ) : (
                  <button className="btn btn-sm" disabled={squadFull} onClick={() => deployTower(towerId)}>
                    {squadFull ? t('squad.full') : t('squad.deploy')}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TowerPanel;
