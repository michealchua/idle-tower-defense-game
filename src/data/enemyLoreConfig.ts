import type { EnemyArchetypeId } from './enemyArchetypes';

// Flavor-only codex content (CodexPanel.tsx's enemy tab) - a name + one-line
// lore blurb per archetype, same "world flavor, not mechanical detail" role
// storyConfig.ts's biome narration already plays elsewhere. Every archetype
// is always visible in the codex (no per-archetype "seen it yet" tracking -
// out of scope for what was asked, and this game has no such state to hook
// into today).
export interface EnemyLoreEntry {
  nameKey: string;
  descriptionKey: string;
}

export const enemyLoreConfig: Record<EnemyArchetypeId, EnemyLoreEntry> = {
  normal: { nameKey: 'enemyLore.normal.name', descriptionKey: 'enemyLore.normal.description' },
  fast: { nameKey: 'enemyLore.fast.name', descriptionKey: 'enemyLore.fast.description' },
  tank: { nameKey: 'enemyLore.tank.name', descriptionKey: 'enemyLore.tank.description' },
  elite: { nameKey: 'enemyLore.elite.name', descriptionKey: 'enemyLore.elite.description' },
  swarm: { nameKey: 'enemyLore.swarm.name', descriptionKey: 'enemyLore.swarm.description' },
  brute: { nameKey: 'enemyLore.brute.name', descriptionKey: 'enemyLore.brute.description' },
  giant: { nameKey: 'enemyLore.giant.name', descriptionKey: 'enemyLore.giant.description' },
  berserker: { nameKey: 'enemyLore.berserker.name', descriptionKey: 'enemyLore.berserker.description' },
  healer: { nameKey: 'enemyLore.healer.name', descriptionKey: 'enemyLore.healer.description' },
  shield: { nameKey: 'enemyLore.shield.name', descriptionKey: 'enemyLore.shield.description' },
  zombie: { nameKey: 'enemyLore.zombie.name', descriptionKey: 'enemyLore.zombie.description' },
  witch: { nameKey: 'enemyLore.witch.name', descriptionKey: 'enemyLore.witch.description' },
  miniboss: { nameKey: 'enemyLore.miniboss.name', descriptionKey: 'enemyLore.miniboss.description' },
  boss: { nameKey: 'enemyLore.boss.name', descriptionKey: 'enemyLore.boss.description' },
};
