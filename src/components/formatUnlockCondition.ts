import type { UnlockCondition } from '../data/unlockConditionConfig';
import type { UpgradeableStat } from '../data/heroConfig';
import { t } from '../locales/i18n';

const STAT_LABEL_KEYS: Record<UpgradeableStat, string> = {
  attackDamage: 'hero.attackDamage',
  attackSpeed: 'hero.attackSpeed',
  maxHp: 'hero.maxHp',
  criticalChance: 'hero.criticalChance',
  attackRange: 'hero.attackRange',
};

export function formatUnlockCondition(condition: UnlockCondition): string {
  switch (condition.type) {
    case 'requiresHero':
      return `${t('unlock.requiresHero')} ${condition.heroId}`;
    case 'requiresPet':
      return `${t('unlock.requiresPet')} ${condition.petId}`;
    case 'heroLevel':
      return `${condition.heroId} ${t('unlock.heroLevelReq')} ${condition.level}`;
    case 'globalUpgradeLevel':
      return `${t(STAT_LABEL_KEYS[condition.stat])}${t('unlock.globalUpgradeLevelReq')} ${condition.level}`;
    case 'goldSpent':
      return `${t('unlock.goldSpentReq')} ${condition.amount}`;
    case 'ascensionLevel':
      return `${t('unlock.ascensionLevelReq')} ${condition.level}`;
    default:
      return '';
  }
}
