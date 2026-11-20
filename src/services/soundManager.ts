export type GameSoundKey =
  | 'gameStart'
  | 'countdownTick'
  | 'answerSelect'
  | 'correct'
  | 'wrong'
  | 'scoreGain'
  | 'questionEnd'
  | 'podiumCelebration';

const SOUND_PATHS: Record<GameSoundKey, string> = {
  gameStart: '/sounds/game-start.wav',
  countdownTick: '/sounds/countdown-tick.wav',
  answerSelect: '/sounds/answer-select.wav',
  correct: '/sounds/correct.wav',
  wrong: '/sounds/wrong.wav',
  scoreGain: '/sounds/score-gain.wav',
  questionEnd: '/sounds/question-end.wav',
  podiumCelebration: '/sounds/podium-celebration.wav',
};

const STORAGE_KEY = 'quizora:sound-enabled';
const WINDOW_STORAGE_PREFIX = 'quizora:sound-enabled:';
const DEFAULT_VOLUME = 0.35;

type Listener = () => void;

class SoundManager {
  private enabled: boolean;
  private windowScope: string | null = null;
  private unlocked = false;
  private listeners = new Set<Listener>();
  private audioPool = new Map<GameSoundKey, HTMLAudioElement>();
  private unlockInitialized = false;

  constructor() {
    this.enabled = this.readInitialPreference();
    this.setupAutoplayUnlock();
  }

  private getActiveStorageKey(): string {
    return this.windowScope
      ? `${WINDOW_STORAGE_PREFIX}${this.windowScope}`
      : STORAGE_KEY;
  }

  setWindowScope(scope: string | null, defaultEnabled = true): void {
    this.windowScope = scope;
    this.enabled = this.readInitialPreference(defaultEnabled);
    this.notify();
  }

  private readInitialPreference(defaultEnabled = true): boolean {
    if (typeof window === 'undefined') return defaultEnabled;
    try {
      const key = this.getActiveStorageKey();
      const stored =
        this.windowScope !== null
          ? window.sessionStorage.getItem(key)
          : window.localStorage.getItem(key);
      if (stored === 'false') return false;
      if (stored === 'true') return true;
      return defaultEnabled;
    } catch {
      return defaultEnabled;
    }
  }

  private setupAutoplayUnlock(): void {
    if (typeof window === 'undefined' || this.unlockInitialized) return;
    this.unlockInitialized = true;

    const markUnlocked = () => {
      this.unlocked = true;
      window.removeEventListener('pointerdown', markUnlocked, true);
      window.removeEventListener('keydown', markUnlocked, true);
      window.removeEventListener('click', markUnlocked, true);
    };

    window.addEventListener('pointerdown', markUnlocked, { capture: true, passive: true });
    window.addEventListener('keydown', markUnlocked, { capture: true, passive: true });
    window.addEventListener('click', markUnlocked, { capture: true, passive: true });
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }

  private getOrCreateAudio(key: GameSoundKey): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') {
      return null;
    }
    let audio = this.audioPool.get(key);
    if (!audio) {
      audio = new Audio(SOUND_PATHS[key]);
      audio.preload = 'auto';
      audio.volume = DEFAULT_VOLUME;
      this.audioPool.set(key, audio);
    }
    return audio;
  }

  getEnabled(): boolean {
    return this.enabled;
  }

  setEnabled(next: boolean): void {
    if (this.enabled === next) return;
    this.enabled = next;
    if (typeof window !== 'undefined') {
      try {
        const key = this.getActiveStorageKey();
        if (this.windowScope !== null) {
          window.sessionStorage.setItem(key, next ? 'true' : 'false');
        } else {
          window.localStorage.setItem(key, next ? 'true' : 'false');
        }
      } catch {
        // ignore storage restrictions
      }
    }
    if (next) {
      this.unlocked = true;
    }
    this.notify();
  }

  toggle(): boolean {
    const next = !this.enabled;
    this.setEnabled(next);
    return next;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  play(key: GameSoundKey): void {
    if (!this.enabled || typeof window === 'undefined') return;

    const userActivated =
      this.unlocked ||
      Boolean(
        (navigator as Navigator & { userActivation?: { hasBeenActive?: boolean } })
          .userActivation?.hasBeenActive,
      );

    if (!userActivated) return;

    const audio = this.getOrCreateAudio(key);
    if (!audio) return;

    try {
      audio.volume = DEFAULT_VOLUME;
      audio.currentTime = 0;
      const playPromise = audio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => undefined);
      }
    } catch {
      // Autoplay/browser ses politikası kısıtlarında sessiz kal
    }
  }
}

export const soundManager = new SoundManager();
