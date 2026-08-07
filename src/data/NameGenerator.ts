// Procedural flavor names - prefix + title sampled independently, so the
// combination space (prefixes.length * titles.length) covers every hero/
// named-monster spawn without hand-authoring a name per one. Heroes and
// monsters share the same prefix pool but draw titles from separate pools
// tuned to opposite tones ("先知" reads heroic, "噬魂者" reads monstrous),
// so the same prefix can still produce a very different-feeling result
// depending on which generator called it.

const namePrefixes = [
  '苍穹的', '暗影', '爆炎', '神圣', '寒冰', '雷霆', '幽冥', '烈日',
  '荒野', '深渊', '血色', '星辰', '不朽', '狂暴', '永夜', '破晓',
];

// Drawn by Hero.ts's createHero for every hero (starter hero and every
// gacha-unlocked one) - see HeroState.name.
const heroTitles = [
  '守护者', '先知', '游侠', '斩溃者', '圣裁官', '破军', '流星', '战魂',
  '御风者', '铁壁', '影刃', '战歌', '光辉使徒', '不屈者',
];

// Drawn by Enemy.ts's createEnemy, but only for archetypes with a genuine
// special mechanic (heal/summon/revive/shield/berserker - see
// isNamedArchetype) - a plain stat-multiplier mob (normal/fast/tank/...)
// stays nameless so a name reliably signals "this one's different" instead
// of becoming background noise in a 10-enemy horde.
const monsterTitles = [
  '噬魂者', '凶兽', '尸王', '毒牙', '深渊领主', '腐蚀者', '嗜血魔', '骨爪',
  '哭嚎者', '瘟疫使者', '夜行者', '碎骨',
];

function pickRandom<T>(pool: T[]): T {
  return pool[Math.floor(Math.random() * pool.length)];
}

export function generateHeroName(): string {
  return `${pickRandom(namePrefixes)}${pickRandom(heroTitles)}`;
}

export function generateMonsterName(): string {
  return `${pickRandom(namePrefixes)}${pickRandom(monsterTitles)}`;
}
