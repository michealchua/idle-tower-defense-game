import { useState, type CSSProperties } from 'react';
import { enemyArchetypes, type EnemyArchetypeId } from '../data/enemyArchetypes';
import {
  debugForceAscend,
  debugForceClearWave,
  debugForceFailWave,
  debugGrantAscensionPoints,
  debugGrantDiamonds,
  debugGrantGold,
  debugGrantMaterials,
  debugGrantReforgeDust,
  debugGrantSkillPoints,
  debugKillAllEnemies,
  debugPause,
  debugPullHeroMany,
  debugPullPetMany,
  debugResume,
  debugSetSpeed,
  debugSpawnArchetype,
  debugSpawnEnemy,
  debugSpawnEquipment,
  debugSpawnMany,
  debugUnlockAllHeroes,
  debugUnlockAllPets,
  debugUnlockAllSkills,
  useGameStore,
} from '../store/useGameStore';

const SPEED_OPTIONS = [1, 2, 5, 10];
const ARCHETYPE_IDS = Object.keys(enemyArchetypes) as EnemyArchetypeId[];

const buttonRowStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  marginTop: 8,
};

const sectionLabelStyle: CSSProperties = {
  marginTop: 8,
  opacity: 0.7,
};

const archetypeGridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  gap: 4,
};

function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const heroes = useGameStore((state) => state.heroes);
  const gold = useGameStore((state) => state.gold);
  const ascensionLevel = useGameStore((state) => state.ascensionLevel);
  const difficultyScore = useGameStore((state) => state.difficultyScore);
  const wave = useGameStore((state) => state.wave);
  const isPaused = useGameStore((state) => state.isPaused);
  const speedMultiplier = useGameStore((state) => state.speedMultiplier);
  const pendingStoryId = useGameStore((state) => state.pendingStoryId);

  if (!isOpen) {
    return (
      <button className="debug-toggle" onClick={() => setIsOpen(true)}>
        DEBUG
      </button>
    );
  }

  return (
    <div className="debug-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontWeight: 'bold' }}>DEBUG</span>
        <button className="debug-toggle" style={{ position: 'static' }} onClick={() => setIsOpen(false)}>
          close
        </button>
      </div>
      <div>Heroes: {heroes.map((hero) => `${hero.id}:Lv${hero.level}`).join(' ')}</div>
      <div>Gold: {gold}</div>
      <div>Story: {pendingStoryId ?? 'none'}</div>
      <div>Ascension: {ascensionLevel}</div>
      <div>Difficulty: {difficultyScore.toFixed(2)}</div>
      <div>
        Wave: {wave.chapter}-{wave.waveInChapter}
        {wave.isBossWave ? ` (${wave.bossKind}, t=${wave.timeRemaining?.toFixed(1)})` : ` (${wave.enemiesRemainingToSpawn} left to spawn)`}
      </div>
      <div style={buttonRowStyle}>
        <button onClick={() => debugSpawnEnemy()}>Spawn Enemy (random)</button>
        <button onClick={() => debugSpawnMany(10)}>Spawn x10</button>
        <div style={sectionLabelStyle}>Spawn archetype:</div>
        <div style={archetypeGridStyle}>
          {ARCHETYPE_IDS.map((archetypeId) => (
            <button key={archetypeId} onClick={() => debugSpawnArchetype(archetypeId)}>
              {archetypeId}
            </button>
          ))}
        </div>
        <button onClick={() => debugUnlockAllSkills()}>Unlock Skill</button>
        <button onClick={() => debugSpawnEquipment()}>Force Drop Equipment</button>
        <button onClick={() => debugUnlockAllHeroes()}>Unlock All Heroes</button>
        <button onClick={() => debugUnlockAllPets()}>Unlock All Pets</button>
        <button onClick={() => debugForceAscend()}>Force Ascend</button>
        <button onClick={() => debugGrantGold(1000)}>+1000 Gold</button>
        <button onClick={() => debugGrantGold(100000)}>+100000 Gold</button>
        <button onClick={() => debugGrantMaterials()}>+20 Materials</button>
        <button onClick={() => debugGrantSkillPoints(10)}>+10 Skill Points</button>
        <button onClick={() => debugGrantAscensionPoints(10)}>+10 Ascension Points</button>
        <button onClick={() => debugGrantDiamonds(100)}>+100 Diamonds</button>
        <button onClick={() => debugGrantReforgeDust(500)}>+500 Reforge Dust</button>
        <button onClick={() => debugPullHeroMany(10)}>Pull Hero x10</button>
        <button onClick={() => debugPullPetMany(10)}>Pull Pet x10</button>
        <button onClick={() => debugKillAllEnemies()}>Kill All</button>
        <button onClick={() => debugForceClearWave()}>Force Clear Wave</button>
        <button onClick={() => debugForceFailWave()}>Force Fail Wave</button>
        <button onClick={() => (isPaused ? debugResume() : debugPause())}>{isPaused ? 'Resume' : 'Pause'}</button>
        <div style={{ display: 'flex', gap: 4 }}>
          {SPEED_OPTIONS.map((speed) => (
            <button key={speed} onClick={() => debugSetSpeed(speed)} disabled={speedMultiplier === speed}>
              x{speed}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default DebugPanel;
