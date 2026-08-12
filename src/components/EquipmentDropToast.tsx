import { RARITY_CLASS, RARITY_LABEL_KEYS, SLOT_ICON, SLOT_LABEL_KEYS } from './EquipmentPanel';
import { t } from '../locales/i18n';
import { useGameStore } from '../store/useGameStore';

// Stacked "found X" toasts for EquipmentSystem.rollEquipmentDrop - the feed
// itself already ages/prunes each entry in the engine (see
// EquipmentSystem.tickEquipmentDropFeed), so this just renders whatever's
// currently in state.equipmentDropFeed; no timers of its own.
function EquipmentDropToast() {
  const feed = useGameStore((state) => state.equipmentDropFeed);

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
