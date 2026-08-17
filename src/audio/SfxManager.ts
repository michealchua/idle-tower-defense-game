import type { SfxEventId } from '../engine/types';

// Synthesized sound effects - oscillator + gain-envelope tones generated at
// playback time, no audio files at all. Deliberately separate from
// AudioManager.ts (which plays a single looping BGM <audio> element, still
// BGM_ENABLED = false pending real tracks) - short percussive/melodic blips
// are the one category of "real music" this project doesn't have a
// composer for that a plain oscillator can still pull off convincingly, so
// this ships now instead of waiting on that.
class SfxManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  // Separate from `muted` (the player's own mute toggle) - see
  // AudioManager.ts's backgroundMuted doc comment for the same rationale,
  // set from the same App.tsx listener (window blur/visibilitychange/
  // stealth-mode).
  private backgroundMuted = false;
  private unlocked = false;
  private volume = 0.7;

  setBackgroundMuted(muted: boolean): void {
    this.backgroundMuted = muted;
  }

  // Every tone() routes through this single master gain node instead of
  // straight to ctx.destination, so setVolume can scale every sfx at once
  // (live, mid-playback) without touching each tone's own peakGain.
  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
      return null;
    }
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume;
    }
  }

  getVolume(): number {
    return this.volume;
  }

  // Browsers block audio.start() before a user gesture happens anywhere on
  // the page - call this from the very first pointerdown/keydown in the app
  // (TitleScreen's click-anywhere-to-start / space handler). Resuming an
  // already-constructed suspended context is enough; nothing needs to be
  // re-created.
  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }
    this.unlocked = true;
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  // One short envelope-shaped tone. peakGain/attack/decay are tuned per call
  // site below rather than exposed as a big options bag - every sfx in this
  // file is built from one to three of these stacked at small offsets.
  //
  // Every tone routes through a lowpass filter now (osc -> filter -> gain),
  // not straight into the gain node - square/sawtooth waves are harmonically
  // rich (odd/all harmonics up to Nyquist), which read as harsh/piercing
  // once played through a bare envelope with no filtering at all, especially
  // playClick since it fires on every single button press. filterFreq
  // defaults to a fairly gentle 2400Hz; individual calls can raise it for
  // sfx that still want some bite (crits, boss kill).
  private tone(
    freq: number,
    startOffsetSeconds: number,
    durationSeconds: number,
    options: { type?: OscillatorType; peakGain?: number; freqEnd?: number; filterFreq?: number } = {},
  ): void {
    if (this.muted || this.backgroundMuted || !this.unlocked) {
      return;
    }
    const ctx = this.ensureContext();
    if (!ctx) {
      return;
    }
    const startAt = ctx.currentTime + startOffsetSeconds;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gainNode = ctx.createGain();
    osc.type = options.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(1, freq), startAt);
    if (options.freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, options.freqEnd), startAt + durationSeconds);
    }
    filter.type = 'lowpass';
    filter.frequency.value = options.filterFreq ?? 2400;
    filter.Q.value = 0.5;
    const peak = options.peakGain ?? 0.2;
    // exponentialRamp can't start from/target exactly 0 - a tiny non-zero
    // floor is the standard trick for a click-free attack/release envelope.
    // Attack floor raised from 0.02 to 0.035s - a slightly softer onset than
    // the near-instant snap the old value gave every tone, which read as
    // part of the overall harshness alongside the missing filter above.
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.exponentialRampToValueAtTime(peak, startAt + Math.min(0.035, durationSeconds * 0.35));
    gainNode.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSeconds);
    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(this.masterGain ?? ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + durationSeconds + 0.02);
  }

  private playHit(): void {
    // square -> triangle: this fires on nearly every attack (the game's most
    // frequent sfx by far), so it's the one where harshness compounds the
    // fastest - triangle keeps the percussive downward-pitch character
    // without square's harsh odd-harmonic buzz.
    this.tone(220, 0, 0.06, { type: 'triangle', peakGain: 0.13, freqEnd: 90 });
  }

  private playCrit(): void {
    this.tone(760, 0, 0.09, { type: 'square', peakGain: 0.17, freqEnd: 240, filterFreq: 3200 });
    this.tone(1140, 0.02, 0.06, { type: 'triangle', peakGain: 0.13 });
  }

  private playEnemyDeath(): void {
    this.tone(200, 0, 0.14, { type: 'sawtooth', peakGain: 0.13, freqEnd: 45, filterFreq: 1800 });
  }

  private playBossKill(): void {
    this.tone(90, 0, 0.5, { type: 'sawtooth', peakGain: 0.26, freqEnd: 30, filterFreq: 1600 });
    this.tone(660, 0.02, 0.2, { type: 'triangle', peakGain: 0.15, freqEnd: 200 });
  }

  private playHeroDown(): void {
    this.tone(180, 0, 0.32, { type: 'sine', peakGain: 0.22, freqEnd: 55 });
    this.tone(90, 0.06, 0.4, { type: 'sine', peakGain: 0.18, freqEnd: 35 });
  }

  private playLevelUp(): void {
    this.tone(523, 0, 0.1, { type: 'triangle', peakGain: 0.16 });
    this.tone(659, 0.09, 0.1, { type: 'triangle', peakGain: 0.16 });
    this.tone(784, 0.18, 0.16, { type: 'triangle', peakGain: 0.18 });
  }

  private playWaveClear(): void {
    this.tone(523, 0, 0.12, { type: 'triangle', peakGain: 0.15 });
    this.tone(659, 0.1, 0.12, { type: 'triangle', peakGain: 0.15 });
    this.tone(880, 0.2, 0.24, { type: 'triangle', peakGain: 0.2 });
  }

  private playBossIntro(): void {
    this.tone(65, 0, 0.55, { type: 'sawtooth', peakGain: 0.26, freqEnd: 45 });
    this.tone(48, 0.1, 0.65, { type: 'sine', peakGain: 0.22, freqEnd: 35 });
  }

  // Dispatcher for GameState.pendingSfxEvents - the only entry point the
  // engine-facing queue needs (see App.tsx's consuming effect).
  play(event: SfxEventId): void {
    switch (event) {
      case 'hit':
        return this.playHit();
      case 'crit':
        return this.playCrit();
      case 'enemyDeath':
        return this.playEnemyDeath();
      case 'bossKill':
        return this.playBossKill();
      case 'heroDown':
        return this.playHeroDown();
      case 'levelUp':
        return this.playLevelUp();
      case 'waveClear':
        return this.playWaveClear();
      case 'bossIntro':
        return this.playBossIntro();
    }
  }

  // Below: sfx triggered directly from React components that already have
  // the relevant result data client-side (gacha rarity, equipment rarity),
  // rather than round-tripping through pendingSfxEvents - see GachaPanel.tsx/
  // EquipmentDropToast.tsx.
  playGachaWhoosh(): void {
    this.tone(300, 0, 0.18, { type: 'sine', peakGain: 0.1, freqEnd: 900 });
  }

  playGachaChime(): void {
    this.tone(880, 0, 0.12, { type: 'sine', peakGain: 0.14 });
  }

  playGachaRareChime(): void {
    this.tone(880, 0, 0.14, { type: 'triangle', peakGain: 0.18 });
    this.tone(1174, 0.08, 0.14, { type: 'triangle', peakGain: 0.16 });
    this.tone(1568, 0.16, 0.22, { type: 'triangle', peakGain: 0.18 });
  }

  playEquipmentDrop(rare: boolean): void {
    this.tone(880, 0, 0.08, { type: 'triangle', peakGain: 0.13 });
    if (rare) {
      this.tone(1318, 0.06, 0.14, { type: 'triangle', peakGain: 0.15 });
    }
  }

  playClick(): void {
    // Every .btn/.hud-btn click in the whole app routes through this (see
    // App.tsx's global click listener) - square at 600Hz was the single
    // most-repeated harsh sound in the game. sine has none of square's
    // extra harmonics, so this is now just a soft, low blip.
    this.tone(520, 0, 0.03, { type: 'sine', peakGain: 0.045 });
  }
}

export const sfxManager = new SfxManager();
