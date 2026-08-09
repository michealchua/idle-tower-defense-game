// BGM controller for the src/combat/* engine - wraps the HTML5 Audio API
// with crossfaded track switching, global volume/mute, and a boss-track
// override stack (see GameManager's onWaveStart/handleEnemyDefeated hooks).
// A separate class from src/audio/AudioManager.ts, which drives the older
// useGameStore/BattleScreen system - the two run independent audio graphs
// and are never both mounted at once, but keeping them decoupled avoids
// this system needing to reach into that one's singleton.

/** Duration of a track crossfade (setTrack) or the fade portion of stop(), in ms. */
const DEFAULT_FADE_MS = 900;
/** How often the fade ramp updates, in ms - smooth enough to not click/step audibly without scheduling an interval tick per animation frame. */
const FADE_STEP_MS = 40;

/**
 * `new Audio()` (and the global `Audio`/`window` it needs) doesn't exist
 * under Node - GameManager unconditionally owns an AudioManager, and
 * GameManager is also constructed directly in test-run.ts's headless
 * simulation (no browser, no jsdom), so this can't assume a DOM is always
 * present. Falls back to a tiny inert stand-in exposing just the subset of
 * HTMLAudioElement this file actually touches (src/volume/loop/muted,
 * play/pause/load) - every fade/crossfade still runs its full logic against
 * it, it just never produces real sound.
 */
function createAudioElement(): HTMLAudioElement {
  if (typeof Audio !== 'undefined') {
    return new Audio();
  }
  const stub = {
    src: '',
    volume: 0,
    loop: false,
    muted: false,
    play: () => Promise.resolve(),
    pause: () => {},
    removeAttribute: () => {},
    load: () => {},
  };
  return stub as unknown as HTMLAudioElement;
}

class TrackSlot {
  readonly el: HTMLAudioElement;
  // ReturnType<typeof setInterval>, not a hardcoded `number` - @types/node is
  // present in this project (test-run.ts runs under Node/tsx), so the
  // ambient `setInterval` TypeScript resolves against here is Node's
  // (returning a Timeout object), not the DOM lib's, even though "DOM" is
  // in tsconfig's lib array for browser code elsewhere in this file.
  private fadeIntervalId: ReturnType<typeof setInterval> | undefined;

  constructor() {
    this.el = createAudioElement();
    this.el.loop = true;
    this.el.volume = 0;
  }

  /** Cancels any in-flight fade on this slot - always call before starting a new one so two overlapping fades never fight over the same element's volume (the "多重播放/内存泄漏" failure mode the spec calls out). */
  private clearFade(): void {
    if (this.fadeIntervalId !== undefined) {
      clearInterval(this.fadeIntervalId);
      this.fadeIntervalId = undefined;
    }
  }

  fadeTo(targetVolume: number, durationMs: number, onDone?: () => void): void {
    this.clearFade();
    const startVolume = this.el.volume;
    const steps = Math.max(1, Math.round(durationMs / FADE_STEP_MS));
    let step = 0;

    if (steps <= 1) {
      this.el.volume = targetVolume;
      onDone?.();
      return;
    }

    this.fadeIntervalId = setInterval(() => {
      step += 1;
      const t = Math.min(1, step / steps);
      this.el.volume = startVolume + (targetVolume - startVolume) * t;
      if (t >= 1) {
        this.clearFade();
        onDone?.();
      }
    }, FADE_STEP_MS);
  }

  dispose(): void {
    this.clearFade();
    this.el.pause();
    this.el.removeAttribute('src');
    this.el.load();
  }
}

/**
 * Owns two <audio> elements ping-ponged as "active"/"inactive" so switching
 * tracks (setTrack) can fade the old one out while fading the new one in at
 * the same time, instead of a hard cut or a gap. Only one instance is ever
 * playing above volume 0 once a fade settles, so there's no risk of two
 * tracks audibly overlapping past the crossfade window itself.
 */
export class AudioManager {
  private slots: [TrackSlot, TrackSlot] = [new TrackSlot(), new TrackSlot()];
  private activeIndex = 0;
  private currentSrc: string | null = null;
  private masterVolume = 0.5;
  /** Step 29's separate SFX slider - only ever read by playChime, distinct from masterVolume (which drives the BGM crossfade above). */
  private sfxVolume = 0.5;
  private muted = false;
  private unlocked = false;
  /** Lazily-created, shared AudioContext for playChime - one per AudioManager instance, not one per chime (a fresh context per call would eventually hit the browser's concurrent-context limit under a burst of rapid chimes, see ParticleManager's arrival callback in step 26). */
  private chimeContext: AudioContext | undefined;

  private get activeSlot(): TrackSlot {
    return this.slots[this.activeIndex];
  }

  private get inactiveSlot(): TrackSlot {
    return this.slots[1 - this.activeIndex];
  }

  private effectiveVolume(): number {
    return this.muted ? 0 : this.masterVolume;
  }

  /**
   * Crossfades from whatever's currently playing to `src` over `fadeMs`.
   * No-ops if `src` is already the current track (re-entering the same
   * theme/wave shouldn't restart its loop from 0 or double-trigger a fade).
   * Streamed, not preloaded - setting .src and calling play() lets the
   * browser buffer progressively rather than blocking on a full download.
   */
  playTrack(src: string, fadeMs = DEFAULT_FADE_MS): void {
    if (this.currentSrc === src) {
      return;
    }
    this.currentSrc = src;

    const outgoing = this.activeSlot;
    const incoming = this.inactiveSlot;
    this.activeIndex = 1 - this.activeIndex;

    incoming.el.src = src;
    incoming.el.volume = 0;
    if (this.unlocked && this.effectiveVolume() > 0) {
      incoming.el.play().catch(() => {
        // Autoplay rejected (no user gesture yet, file missing, etc.) -
        // nothing actionable; unlock() retries once a gesture happens.
      });
    }
    incoming.fadeTo(this.effectiveVolume(), fadeMs);

    // Fade the old track out, then actually pause it - pausing immediately
    // would cut its tail off audibly, and leaving it playing at volume 0
    // forever would leak a running <audio> element for no reason.
    outgoing.fadeTo(0, fadeMs, () => outgoing.el.pause());
  }

  /** Fades the current track to silence and stops it - used when leaving combat entirely, distinct from playTrack (which always crossfades into a replacement). */
  stop(fadeMs = DEFAULT_FADE_MS): void {
    this.currentSrc = null;
    for (const slot of this.slots) {
      slot.fadeTo(0, fadeMs, () => slot.el.pause());
    }
  }

  /** Browsers block audio.play() before a user gesture happens anywhere on the page - call this from the first pointerdown/click; retries playback of whatever track is already loaded. */
  unlock(): void {
    if (this.unlocked) {
      return;
    }
    this.unlocked = true;
    if (this.effectiveVolume() > 0) {
      this.activeSlot.el.play().catch(() => {});
    }
  }

  /** 0..1 global BGM volume - re-applied as the active slot's fade target immediately (not just for the next crossfade), so a mid-track volume drag is heard right away. */
  setVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (!this.muted) {
      this.activeSlot.fadeTo(this.masterVolume, FADE_STEP_MS * 2);
    }
  }

  getVolume(): number {
    return this.masterVolume;
  }

  /** 0..1 global SFX volume (step 29) - only used by playChime today, kept separate from setVolume's BGM volume so the settings panel's two sliders are genuinely independent. */
  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  getSfxVolume(): number {
    return this.sfxVolume;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.activeSlot.fadeTo(this.effectiveVolume(), FADE_STEP_MS * 2);
    if (!this.muted && this.unlocked) {
      this.activeSlot.el.play().catch(() => {});
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  /**
   * One-shot "叮" chime (step 26's particle-arrival sync, see
   * ParticleManager.onArrived) - synthesized via the Web Audio API rather
   * than a bundled sound asset (none exists under public/audio for this),
   * so it works the instant it's called with zero new files. A short sine
   * blip that ramps up in pitch and fades out over ~150ms. No-op before
   * unlock() has run (same autoplay-gesture-gating every other playback
   * here follows) or under a headless/Node environment with no
   * AudioContext global at all (test-run.ts's simulation, which never
   * calls this anyway, but it should still be safe to call defensively).
   */
  playChime(): void {
    if (!this.unlocked || this.muted || this.sfxVolume <= 0) {
      return;
    }
    const ctx = this.ensureChimeContext();
    if (!ctx) {
      return;
    }

    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(880, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(this.sfxVolume * 0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.15);
  }

  private ensureChimeContext(): AudioContext | undefined {
    if (this.chimeContext) {
      return this.chimeContext;
    }
    if (typeof AudioContext === 'undefined') {
      return undefined;
    }
    this.chimeContext = new AudioContext();
    return this.chimeContext;
  }

  /** Releases both underlying <audio> elements and the chime AudioContext (if one was ever created) - call on final teardown (e.g. leaving combat-test.html's session) to guarantee nothing keeps decoding/running in the background. */
  dispose(): void {
    for (const slot of this.slots) {
      slot.dispose();
    }
    this.currentSrc = null;
    void this.chimeContext?.close();
    this.chimeContext = undefined;
  }
}
