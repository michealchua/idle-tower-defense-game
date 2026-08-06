import {
  getTalentCost,
  getTalentFlatBonus,
  getTalentLevel,
  getTalentMultiplier,
  isTalentMaxed,
  skillPointGainConfig,
  talentConfig,
  type TalentId,
} from '../data/talentConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

const TALENT_ORDER: TalentId[] = [
  'goldGain',
  'expGain',
  'spGainSpeed',
  'attackDamage',
  'maxHp',
  'criticalChance',
  'damageReduction',
  'aoeDamage',
];

const TALENT_LABEL_KEYS: Record<TalentId, string> = {
  goldGain: 'talent.goldGain',
  expGain: 'talent.expGain',
  spGainSpeed: 'talent.spGainSpeed',
  attackDamage: 'talent.attackDamageBonus',
  maxHp: 'talent.maxHpBonus',
  damageReduction: 'talent.damageReduction',
  criticalChance: 'talent.criticalChanceBonus',
  aoeDamage: 'talent.aoeDamage',
};

// criticalChance/damageReduction are flat +X per level (see
// talentConfig.getTalentFlatBonus); everything else is a "+X%" multiplier.
const FLAT_TALENT_IDS = new Set<TalentId>(['criticalChance', 'damageReduction']);

function formatTalentBonus(id: TalentId, talentLevels: Record<string, number>): string {
  if (FLAT_TALENT_IDS.has(id)) {
    return `+${Math.round(getTalentFlatBonus(talentLevels, id) * 100)}%`;
  }
  return `+${Math.round((getTalentMultiplier(talentLevels, id) - 1) * 100)}%`;
}

function TalentPanel() {
  const talentLevels = useGameStore((state) => state.talentLevels);
  const skillPoints = useGameStore((state) => state.skillPoints);
  const skillPointAccumulator = useGameStore((state) => state.skillPointAccumulator);
  const upgradeTalent = useGameStore((state) => state.upgradeTalent);

  const nextPointRatio = Math.min(1, skillPointAccumulator / skillPointGainConfig.secondsPerPoint);

  return (
    <div className="card">
      <div className="card-title">
        {t('talent.title')} · {t('talent.points')}: {skillPoints}
      </div>
      <div className="card-subtitle">
        {t('talent.nextPoint')}: {Math.ceil(skillPointGainConfig.secondsPerPoint - skillPointAccumulator)}s
      </div>
      <div className="bar-track" style={{ marginBottom: 10 }}>
        <div className="bar-fill bar-fill-exp" style={{ width: `${nextPointRatio * 100}%` }} />
      </div>
      <div className="list">
        {TALENT_ORDER.map((id) => {
          const level = getTalentLevel(talentLevels, id);
          const maxed = isTalentMaxed(talentLevels, id);
          const cost = getTalentCost(id, level);
          const canUpgrade = !maxed && skillPoints >= cost;

          return (
            <div key={id} className="item-card">
              <div className="item-name">
                {t(TALENT_LABEL_KEYS[id])} Lv.{level}/{talentConfig[id].maxLevel}
              </div>
              <div className="item-detail">{formatTalentBonus(id, talentLevels)}</div>
              <div className="item-actions">
                <button className="btn btn-sm" disabled={!canUpgrade} onClick={() => upgradeTalent(id)}>
                  {maxed ? t('star.maxed') : `${t('talent.upgrade')} (${cost} ${t('talent.points')})`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default TalentPanel;
