import {
  getTalentCost,
  getTalentFlatBonus,
  getTalentLevel,
  getTalentMultiplier,
  isTalentMaxed,
  talentConfig,
  type TalentId,
} from '../data/talentConfig';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

const TALENT_ORDER: TalentId[] = ['goldGain', 'expGain', 'attackDamage', 'maxHp', 'criticalChance', 'damageReduction'];

const TALENT_LABEL_KEYS: Record<TalentId, string> = {
  goldGain: 'talent.goldGain',
  expGain: 'talent.expGain',
  attackDamage: 'talent.attackDamageBonus',
  maxHp: 'talent.maxHpBonus',
  damageReduction: 'talent.damageReduction',
  criticalChance: 'talent.criticalChanceBonus',
};

const TALENT_ICON: Record<TalentId, string> = {
  goldGain: '💰',
  expGain: '⭐',
  attackDamage: '⚔️',
  maxHp: '❤️',
  damageReduction: '🛡️',
  criticalChance: '🎯',
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
  const upgradeTalent = useGameStore((state) => state.upgradeTalent);

  return (
    <div className="card">
      <div className="card-title">
        {t('talent.title')} · {t('talent.points')}: {skillPoints}
      </div>
      <div className="card-subtitle">{t('talent.bossHint')}</div>
      <div className="card-grid">
        {TALENT_ORDER.map((id) => {
          const level = getTalentLevel(talentLevels, id);
          const maxed = isTalentMaxed(talentLevels, id);
          const cost = getTalentCost(id, level);
          const canUpgrade = !maxed && skillPoints >= cost;

          return (
            <div key={id} className="mini-card">
              <div className="mini-card-name">
                <span>{TALENT_ICON[id]} {t(TALENT_LABEL_KEYS[id])}</span>
                <span className="text-faint">Lv.{level}/{talentConfig[id].maxLevel}</span>
              </div>
              <div className="mini-card-sub">{formatTalentBonus(id, talentLevels)}</div>
              <div className="item-actions" style={{ marginTop: 6 }}>
                <button className="btn btn-sm btn-primary" disabled={!canUpgrade} onClick={() => upgradeTalent(id)}>
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
