import { useEffect, useRef } from 'react';
import { RARITY_CLASS, RARITY_LABEL_KEYS, SLOT_ICON, SLOT_LABEL_KEYS } from './EquipmentPanel';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';
import { sfxManager } from '../audio/SfxManager';
import type { EquipmentRarity } from '../data/equipmentConfig';

// Same "genuinely rare" boundary GachaPanel's CELEBRATION_RARITIES uses -
// gold+ drops get a richer two-tone chime instead of the plain ding.
const RARE_EQUIPMENT_RARITIES: EquipmentRarity[] = ['gold', 'red', 'rainbow'];

// Stacked "found X" toasts for EquipmentSystem.rollEquipmentDrop - the feed
// itself already ages/prunes each entry in the engine (see
// EquipmentSystem.tickEquipmentDropFeed), so this just renders whatever's
// currently in state.equipmentDropFeed; no timers of its own.
function EquipmentDropToast() {
  const feed = useGameStore((state) => state.equipmentDropFeed);
  // Tracks ids already played a sfx for - the feed array itself is a sliding
  // window (new entries pushed, old ones aged out), so "new since last
  // render" has to be diffed against something that outlives any single
  // entry's lifetime rather than just comparing array length/reference.
  const playedIds = useRef(new Set<number>());

  useEffect(() => {
    for (const event of feed) {
      if (playedIds.current.has(event.id)) {
        continue;
      }
      playedIds.current.add(event.id);
      sfxManager.playEquipmentDrop(RARE_EQUIPMENT_RARITIES.includes(event.rarity));
    }
    // Bound the tracking set itself so a very long session doesn't leak
    // memory one id at a time - only entries currently in the feed need to
    // stay excluded from re-triggering.
    const liveIds = new Set(feed.map((event) => event.id));
    for (const id of playedIds.current) {
      if (!liveIds.has(id)) {
        playedIds.current.delete(id);
      }
    }
  }, [feed]);

  if (feed.length === 0) {
    return null;
  }

  return (
    <div className="drop-toast-stack">
      {feed.map((event) => {
        const SlotIcon = SLOT_ICON[event.slot];
        return (
          <div key={event.id} className={`drop-toast ${RARITY_CLASS[event.rarity]}`}>
            <SlotIcon /> {t('equipment.dropToast')} {t(RARITY_LABEL_KEYS[event.rarity])}
            {t(SLOT_LABEL_KEYS[event.slot])}
          </div>
        );
      })}
    </div>
  );
}

export default EquipmentDropToast;
