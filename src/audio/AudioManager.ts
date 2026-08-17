// 12 genuinely distinct tracks now exist (scripts/pixel_music.py -
// procedurally synthesized chiptune loops, see its own doc comment for why
// this is chiptune-tier rather than commercial-quality) - previously this
// was off because every file was the same placeholder tone copied under 12
// names, which was legitimately more annoying than silence.
const BGM_ENABLED = true;

// Thin wrapper around a single looping <audio> element for the biome BGM.
// Plain class (not store state) because playback is imperative browser
// state, not app state - React only ever needs to call methods on it and,
// for the mute button, read isMuted() into local state to re-render an icon.
class AudioManager {
  private audioEl: HTMLAudioElement | null = null;
  private audioCtx: AudioContext | null = null;
  private currentTrack: string | null = null;
  private muted = false;
  // Separate from `muted` (the player's own mute toggle) - App.tsx sets this
  // from window blur/visibilitychange and stealth-mode, so backgrounding the
  // app silences BGM without touching (or being confused with) the player's
  // manual preference. Effective mute is muted || backgroundMuted; leaving
  // the background window/stealth mode restores whatever `muted` already was
  // instead of unconditionally unmuting.
  private backgroundMuted = false;
  private unlocked = false;
  private volume = 0.4;

  private applyMuted(): void {
    if (this.audioEl) {
      this.audioEl.muted = this.muted || this.backgroundMuted;
    }
  }

  private ensureElement(): HTMLAudioElement {
    if (!this.audioEl) {
      this.audioEl = new Audio();
      this.audioEl.loop = true;
      this.audioEl.volume = this.volume;
      this.audioEl.muted = this.muted || this.backgroundMuted;
      this.setupFilterGraph(this.audioEl);
    }
    return this.audioEl;
  }

  // Routes the element's output through a gentle lowpass filter instead of
  // straight to the speakers - the tracks themselves (scripts/pixel_music.py,
  // offline-rendered) lean on square/sawtooth oscillators for several biomes
  // (boss/volcano/demon-abyss pair square+saw specifically), which read as
  // harsh/piercing at any volume. This softens whatever's actually playing
  // without needing to re-render the source files (this project has no
  // Python available at runtime to do that anyway). createMediaElementSource
  // can only ever be called once per <audio> element, hence tying this to
  // ensureElement's one-time creation rather than calling it per track.
  private setupFilterGraph(el: HTMLAudioElement): void {
    if (typeof AudioContext === 'undefined') {
      return;
    }
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaElementSource(el);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 3400;
      filter.Q.value = 0.4;
      source.connect(filter);
      filter.connect(ctx.destination);
      this.audioCtx = ctx;
    } catch {
      // Some environments may not support routing a media element through
      // Web Audio at all - BGM just plays unfiltered in that case, same as
      // before this existed.
    }
  }

  setBackgroundMuted(muted: boolean): void {
    this.backgroundMuted = muted;
    this.applyMuted();
  }

  // Applies immediately to the live element (not just future ones) - the
  // settings-panel slider calls this on every drag tick, so the volume
  // change is heard live rather than only on the next track switch.
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.audioEl) {
      this.audioEl.volume = this.volume;
    }
  }

  getVolume(): number {
    return this.volume;
  }

  // Switches the loop target. No-ops if it's already the current track, so
  // re-entering the same biome's waves doesn't restart the loop from 0.
  setTrack(src: string): void {
    if (!BGM_ENABLED || this.currentTrack === src) {
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
    if (!BGM_ENABLED || this.unlocked) {
      return;
    }
    this.unlocked = true;
    // The filter graph's AudioContext starts suspended until a user gesture,
    // same browser policy as playback itself - resume it here alongside
    // el.play() below, or the element would play into a suspended graph and
    // stay silent despite `unlocked` being true.
    if (this.audioCtx?.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    if (this.currentTrack && !this.muted) {
      this.ensureElement().play().catch(() => {});
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    const el = this.ensureElement();
    this.applyMuted();
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
