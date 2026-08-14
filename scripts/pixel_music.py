"""Procedural chiptune BGM generator for tataKAI.

Pure stdlib (wave/struct/math/random) - no numpy/Pillow needed. Synthesizes
a short looping melody per biome/boss-tier by picking a scale/root/tempo/
oscillator-timbre per track and walking a seeded random path through scale
degrees, layered with a sustained bass drone (and a simple kick/hihat
rhythm for the two boss tracks). This is deliberately chiptune-tier, not
commercial-quality composition - see ART_ASSET_CHECKLIST.md's BGM section
for why (no realistic way to reach "real" music without a human composer or
a paid AI tool) - the goal here is just "12 tracks that are genuinely
different and listenable" instead of one placeholder tone copy-pasted 12
times under different filenames.

Run: python scripts/pixel_music.py
"""

import math
import os
import random
import struct
import wave

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO_DIR = os.path.join(ROOT, "public", "audio")

SAMPLE_RATE = 44100

SCALES = {
    "major": [0, 2, 4, 5, 7, 9, 11],
    "minor": [0, 2, 3, 5, 7, 8, 10],
    "minor_pent": [0, 3, 5, 7, 10],
    "phrygian": [0, 1, 3, 5, 7, 8, 10],
    "whole_tone": [0, 2, 4, 6, 8, 10],
    "harmonic_minor": [0, 2, 3, 5, 7, 8, 11],
    "dorian": [0, 2, 3, 5, 7, 9, 10],
}


def note_freq(semitones_from_a4):
    return 440.0 * (2 ** (semitones_from_a4 / 12.0))


def oscillator(kind, freq, t):
    phase = (t * freq) % 1.0
    if kind == "sine":
        return math.sin(2 * math.pi * freq * t)
    if kind == "square":
        return 1.0 if phase < 0.5 else -1.0
    if kind == "triangle":
        return 4 * abs(phase - 0.5) - 1
    if kind == "saw":
        return 2 * phase - 1
    return 0.0


def envelope(t, duration, attack, release):
    if t < attack:
        return t / attack
    if t > duration - release:
        return max(0.0, (duration - t) / release)
    return 1.0


class Track:
    """Accumulates float samples in [-1, 1] via additive mixing - simple and
    plenty fast enough for a 10-20s clip at this sample rate in pure Python
    (a few hundred thousand samples, not millions)."""

    def __init__(self, duration_seconds):
        self.n = int(SAMPLE_RATE * duration_seconds)
        self.samples = [0.0] * self.n

    def add_note(self, freq, start_seconds, duration_seconds, kind, volume, attack=0.015, release=0.05):
        start_i = int(start_seconds * SAMPLE_RATE)
        count = int(duration_seconds * SAMPLE_RATE)
        for i in range(count):
            idx = start_i + i
            if idx < 0 or idx >= self.n:
                continue
            t = i / SAMPLE_RATE
            env = envelope(t, duration_seconds, attack, release)
            self.samples[idx] += oscillator(kind, freq, t) * env * volume

    def add_noise_hit(self, start_seconds, duration_seconds, volume, low=True):
        """Short filtered-noise burst - crude kick (low=True, heavily
        smoothed toward a thump) or hihat (low=False, closer to raw hiss).
        Just enough percussive texture for the two boss tracks without a
        real synthesis/DSP library."""
        start_i = int(start_seconds * SAMPLE_RATE)
        count = int(duration_seconds * SAMPLE_RATE)
        prev = 0.0
        smoothing = 0.9 if low else 0.1
        for i in range(count):
            idx = start_i + i
            if idx < 0 or idx >= self.n:
                continue
            t = i / SAMPLE_RATE
            env = max(0.0, 1 - t / duration_seconds)
            raw = random.uniform(-1, 1)
            prev = prev * smoothing + raw * (1 - smoothing)
            self.samples[idx] += prev * env * volume

    def fade_edges(self, fade_seconds=0.012):
        """Tiny fade in/out on the whole buffer so the loop seam
        (<audio loop> hard-cuts back to sample 0) doesn't click - a real
        crossfade isn't possible with a plain looping <audio> element, this
        is the cheap mitigation."""
        fade_n = int(SAMPLE_RATE * fade_seconds)
        for i in range(min(fade_n, self.n)):
            self.samples[i] *= i / fade_n
            self.samples[self.n - 1 - i] *= i / fade_n

    def write_wav(self, path):
        peak = max(0.0001, max(abs(s) for s in self.samples))
        # Normalize toward, not to, full scale - leaves headroom so no track
        # clips even if a particular note pattern happened to stack loud.
        gain = 0.9 / peak
        frames = bytearray()
        for s in self.samples:
            v = max(-1.0, min(1.0, s * gain))
            frames += struct.pack("<h", int(v * 32767))
        with wave.open(path, "w") as f:
            f.setnchannels(1)
            f.setsampwidth(2)
            f.setframerate(SAMPLE_RATE)
            f.writeframes(bytes(frames))
        print("wrote", os.path.relpath(path, ROOT), f"({self.n / SAMPLE_RATE:.1f}s)")


def compose_melody(track, scale_name, root_semitone, bpm, lead_kind, bass_kind, lead_volume, bass_volume, bars, seed):
    """Walks a seeded random path through the given scale for `bars` 4-beat
    bars, one note per beat, landing back on the root at the very start and
    end of the loop so the seam resolves musically instead of on a random
    interval. A sustained root-octave-down bass note plays under each bar."""
    rng = random.Random(seed)
    scale = SCALES[scale_name]
    beat_seconds = 60.0 / bpm
    degree = 0  # index into scale, current position - starts on the root.
    t = 0.0

    total_beats = bars * 4
    for beat in range(total_beats):
        is_edge = beat == 0 or beat == total_beats - 1
        if is_edge:
            degree = 0
        else:
            step = rng.choice([-2, -1, -1, 0, 1, 1, 2])
            degree = max(-2, min(len(scale) + 2, degree + step))

        octave, scale_index = divmod(degree, len(scale))
        semitone = root_semitone + scale[scale_index] + octave * 12
        freq = note_freq(semitone)
        # Occasional rest (skip the note but still advance the clock) for
        # a bit of rhythmic breathing room instead of a note on every single
        # beat.
        if rng.random() > 0.12:
            note_len = beat_seconds * rng.choice([0.9, 0.9, 1.8])
            track.add_note(freq, t, min(note_len, beat_seconds * 1.9), lead_kind, lead_volume)
        t += beat_seconds

    # Bass drone - one sustained low note per bar (root, two octaves down),
    # re-triggered each bar rather than one giant continuous tone so it still
    # has a little rhythmic pulse.
    bar_seconds = beat_seconds * 4
    bass_freq = note_freq(root_semitone - 24)
    for bar in range(bars):
        track.add_note(bass_freq, bar * bar_seconds, bar_seconds * 0.92, bass_kind, bass_volume, attack=0.05, release=0.15)


def compose_boss_percussion(track, bpm, bars, kick_volume, hihat_volume):
    beat_seconds = 60.0 / bpm
    for beat in range(bars * 4):
        t = beat * beat_seconds
        if beat % 2 == 0:
            track.add_noise_hit(t, 0.12, kick_volume, low=True)
        track.add_noise_hit(t + beat_seconds * 0.5, 0.05, hihat_volume, low=False)


# Per-track parameters - hand-picked per the mood notes already written down
# in ART_ASSET_CHECKLIST.md (forest=轻快田园, desert=干燥悠远,
# ocean=神秘流动, snow-mountain=寒冷孤寂, poison-swamp=阴森粘稠,
# dark-cave=压抑幽闭, ancient-ruins=古老庄严, volcano=炽热紧张,
# sky-realm=空灵开阔, demon-abyss=邪恶压迫, miniboss/boss=战斗强度递增).
TRACKS = [
    dict(name="forest", scale="major", root=-9, bpm=104, lead="triangle", bass="sine",
         lead_vol=0.16, bass_vol=0.1, bars=8, seed=1, percussion=False),
    dict(name="desert", scale="phrygian", root=-4, bpm=88, lead="saw", bass="sine",
         lead_vol=0.13, bass_vol=0.1, bars=8, seed=2, percussion=False),
    dict(name="ocean", scale="whole_tone", root=-7, bpm=76, lead="sine", bass="sine",
         lead_vol=0.15, bass_vol=0.09, bars=6, seed=3, percussion=False),
    dict(name="snow-mountain", scale="minor", root=-12, bpm=72, lead="sine", bass="triangle",
         lead_vol=0.14, bass_vol=0.11, bars=6, seed=4, percussion=False),
    dict(name="poison-swamp", scale="phrygian", root=-14, bpm=68, lead="square", bass="sine",
         lead_vol=0.1, bass_vol=0.13, bars=6, seed=5, percussion=False),
    dict(name="dark-cave", scale="minor_pent", root=-16, bpm=64, lead="sine", bass="sine",
         lead_vol=0.1, bass_vol=0.12, bars=5, seed=6, percussion=False),
    dict(name="ancient-ruins", scale="dorian", root=-9, bpm=80, lead="triangle", bass="triangle",
         lead_vol=0.14, bass_vol=0.12, bars=7, seed=7, percussion=False),
    dict(name="volcano", scale="harmonic_minor", root=-5, bpm=126, lead="saw", bass="square",
         lead_vol=0.15, bass_vol=0.13, bars=10, seed=8, percussion=True, kick_vol=0.22, hihat_vol=0.05),
    dict(name="sky-realm", scale="major", root=0, bpm=96, lead="sine", bass="sine",
         lead_vol=0.14, bass_vol=0.08, bars=8, seed=9, percussion=False),
    dict(name="demon-abyss", scale="harmonic_minor", root=-17, bpm=90, lead="square", bass="saw",
         lead_vol=0.13, bass_vol=0.15, bars=8, seed=10, percussion=False),
    dict(name="miniboss", scale="harmonic_minor", root=-7, bpm=132, lead="saw", bass="square",
         lead_vol=0.16, bass_vol=0.14, bars=8, seed=11, percussion=True, kick_vol=0.2, hihat_vol=0.06),
    dict(name="boss", scale="harmonic_minor", root=-9, bpm=140, lead="square", bass="saw",
         lead_vol=0.18, bass_vol=0.17, bars=8, seed=12, percussion=True, kick_vol=0.26, hihat_vol=0.07),
]


def main():
    os.makedirs(AUDIO_DIR, exist_ok=True)
    for spec in TRACKS:
        # Exact loop length derived from bars/bpm (not hand-picked) - keeps
        # the melody's last note/bar landing precisely on the buffer edge
        # instead of getting cut off or leaving a silent tail.
        duration_seconds = spec["bars"] * 4 * 60.0 / spec["bpm"]
        track = Track(duration_seconds)
        compose_melody(
            track,
            spec["scale"],
            spec["root"],
            spec["bpm"],
            spec["lead"],
            spec["bass"],
            spec["lead_vol"],
            spec["bass_vol"],
            spec["bars"],
            spec["seed"],
        )
        if spec.get("percussion"):
            compose_boss_percussion(track, spec["bpm"], spec["bars"], spec["kick_vol"], spec["hihat_vol"])
        track.fade_edges()
        track.write_wav(os.path.join(AUDIO_DIR, f"{spec['name']}.wav"))


if __name__ == "__main__":
    main()
