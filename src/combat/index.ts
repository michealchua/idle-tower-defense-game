export * from './SkillAction';
export * from './BattleHero';
export * from './BattleEnemy';
export * from './Projectile';
export * from './CombatEngine';
export * from './EnemyFactory';
export * from './WaveConfig';
export * from './WaveManager';
export * from './sampleLevelConfig';
export * from './GameManager';
export * from './heroCatalog';
export * from './heroEvolution';
export * from './gridConfig';
export * from './ThemeManager';
export * from './AudioManager';
export * from './activeBiome';
export * from './biomeMechanicsCatalog';
export * from './TalentManager';
export * from './MetaProgression';
// Named (not `export *`) - SaveManager.getMemoryFragments/addMemoryFragments/
// spendMemoryFragments intentionally share their names with
// MetaProgression's own thin wrappers around them (see that file's doc
// comment); a wildcard re-export here would collide. Everything else is
// SaveManager-only.
export {
  type SaveData,
  load,
  save,
  getSaveDataSnapshot,
  getLastSaveTime,
  recordSaveNow,
  getHighestStageCleared,
  recordStageCleared,
  getTalentLevel,
  setTalentLevel,
  getHeirloomEquipment,
  addHeirloomEquipment,
  getEternitySparks,
  addEternitySparks,
  clearInMemorySnapshotForTesting,
} from './SaveManager';
export * from './OfflineManager';
export * from './persistentStore';
export * from './ParticleManager';
export * from './PrestigeManager';
export * from './AffixManager';
