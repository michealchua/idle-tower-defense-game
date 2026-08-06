// Thin wrapper around a single looping <audio> element for the biome BGM.
// Plain class (not store state) because playback is imperative browser
// state, not app state - React only ever needs to call methods on it and,
// for the mute button, read isMuted() into local state to re-render an icon.
class AudioManager {
  private audioEl: HTMLAudioElement | null = null;
  private currentTrack: string | null = null;
  private muted = false;
  private unlocked = false;

  private ensureElement(): HTMLAudioElement {
    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.loop = true;
      this.audioEl.volume = 0.4;
      this.audioEl.muted = this.muted;
    }
    return this.audioEl;
  }

  // Switches the loop target. No-ops if it's already the current track, so
  // re-entering the same biome's waves doesn't restart the loop from 0.
  setTrack(src: string): void {
    if (this.currentTrack === src) {
      return;
    }
    this.currentTrack = src;
    const el = this.ensureElement();
    el.src = src;
    if (this.unlocked && !this.muted) {
      // Browsers reject play() for all sorts of reasons (file missing until
      // the real assets are dropped in, autoplay policy edge cases) -
      // swallow it, there's nothing actionable to do here.
      el.play().catch(() => {});
    }
  }

  // Browsers block audio.play() before a user gesture happens anywhere on
  // the page - call this from the first pointerdown/click and it retries
  // playback of whatever track is already set.
  unlock(): void {
    if (this.unlocked) {
      return;
    }
    this.unlocked = true;
    if (this.currentTrack && !this.muted) {
      this.ensureElement().play().catch(() => {});
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    const el = this.ensureElement();
    el.muted = this.muted;
    if (!this.muted && this.unlocked && this.currentTrack) {
      el.play().catch(() => {});
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }
}

export const audioManager = new AudioManager();
