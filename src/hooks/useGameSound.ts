import { useCallback, useSyncExternalStore } from 'react';
import { soundManager, type GameSoundKey } from '@/services/soundManager';

const subscribe = (listener: () => void) => soundManager.subscribe(listener);
const getSnapshot = () => soundManager.getEnabled();

export function useGameSound() {
  const soundEnabled = useSyncExternalStore(subscribe, getSnapshot, () => true);

  const toggleSound = useCallback(() => soundManager.toggle(), []);

  const playSound = useCallback((key: GameSoundKey) => {
    soundManager.play(key);
  }, []);

  return {
    soundEnabled,
    toggleSound,
    playSound,
  };
}
