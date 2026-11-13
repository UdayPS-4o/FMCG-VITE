"""
Original background track for the promo — upbeat, happy, energetic.
Synthesised from scratch (no samples, no third-party music → no licence issues).
124 BPM, C major, I–V–vi–IV: four-on-the-floor kick, claps, hats, pumping bass,
bright chord stabs and a marimba-style arpeggio hook.

    python music.py [seconds]   → audio/music.wav
"""
import sys, wave
from pathlib import Path
import numpy as np

SR = 44100
BPM = 124
BEAT = 60 / BPM
BAR = 4 * BEAT
E8 = BEAT / 2                      # eighth note
SECONDS = float(sys.argv[1]) if len(sys.argv) > 1 else 140
BARS = int(np.ceil(SECONDS / BAR)) + 1
N = int((BARS * BAR + 4) * SR)
L = np.zeros(N); R = np.zeros(N)
rng = np.random.default_rng(7)


def hz(midi): return 440.0 * 2 ** ((midi - 69) / 12)


def put(sig, t, gain=1.0, pan=0.0):
    i = int(t * SR)
    if i >= N: return
    sig = sig[: N - i] * gain
    L[i:i + len(sig)] += sig * (1 - max(0, pan))
    R[i:i + len(sig)] += sig * (1 + min(0, pan))


def env(n, attack, decay):
    t = np.arange(n) / SR
    return np.minimum(1, t / attack) * np.exp(-t / decay)


def kick():
    n = int(0.32 * SR); t = np.arange(n) / SR
    f = 48 + 110 * np.exp(-t / 0.035)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.11) + 0.25 * rng.standard_normal(n) * np.exp(-t / 0.004)


def hp(x):                           # cheap high-pass for noise percussion
    return np.diff(x, prepend=0)


def clap():
    n = int(0.22 * SR); t = np.arange(n) / SR
    burst = sum(np.exp(-np.maximum(0, t - d) / 0.012) * (t >= d) for d in (0, 0.011, 0.023)) / 3 + 0.6 * np.exp(-t / 0.07)
    return hp(rng.standard_normal(n)) * burst * 0.6


def hat(decay=0.03):
    n = int(0.12 * SR); t = np.arange(n) / SR
    return hp(hp(rng.standard_normal(n))) * np.exp(-t / decay) * 0.3


def shaker():
    n = int(0.07 * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n)) * np.sin(np.pi * t / 0.07) ** 2 * 0.25


def bass(midi, dur):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(midi)
    w = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(4 * np.pi * f * t) + 0.18 * np.sin(6 * np.pi * f * t)
    return w * np.minimum(1, t / 0.006) * np.exp(-t / (dur * 0.9)) * np.minimum(1, (dur - t) / 0.01)


def stab(midis, dur=0.42):           # bright, slightly detuned chord pluck
    n = int(dur * SR); t = np.arange(n) / SR; out = np.zeros(n)
    for m in midis:
        f = hz(m)
        for det in (-0.004, 0.004):
            ff = f * (1 + det)
            out += sum(np.sin(2 * np.pi * ff * k * t) / k ** 1.3 for k in (1, 2, 3, 4, 5))
    return out * env(n, 0.004, 0.13) / (len(midis) * 2.5)


def marimba(midi, dur=0.5):          # the hook: warm mallet with a bright attack
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(midi)
    return (np.sin(2 * np.pi * f * t) * np.exp(-t / 0.16)
            + 0.35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / 0.035)
            + 0.12 * np.sin(2 * np.pi * 10 * f * t) * np.exp(-t / 0.012)) * np.minimum(1, t / 0.002)


def pad(midis, dur):                 # soft warmth under everything
    n = int(dur * SR); t = np.arange(n) / SR
    out = sum(np.sin(2 * np.pi * hz(m) * t + i) + 0.3 * np.sin(4 * np.pi * hz(m) * t) for i, m in enumerate(midis))
    return out / len(midis) * np.minimum(1, t / 0.25) * np.minimum(1, (dur - t) / 0.3)


def riser(dur):
    n = int(dur * SR); t = np.arange(n) / SR
    return hp(rng.standard_normal(n)) * (t / dur) ** 2 * 0.35


# I – V – vi – IV   (root for bass, triad voiced around middle C, arpeggio notes for the hook)
CHORDS = [
    dict(root=36, triad=(60, 64, 67), arp=(72, 76, 79, 84)),   # C
    dict(root=43, triad=(59, 62, 67), arp=(74, 79, 83, 86)),   # G
    dict(root=45, triad=(60, 64, 69), arp=(72, 76, 81, 84)),   # Am
    dict(root=41, triad=(60, 65, 69), arp=(72, 77, 81, 84)),   # F
]
STAB_RHYTHM = (0, 3, 6)                       # the classic 3-3-2 push — instant "feel-good"
HOOK_A = (0, 1, 2, 1, 3, 2, 1, 2)             # eighth-note arpeggio shapes (index into arp)
HOOK_B = (3, 2, 1, 2, 0, 1, 2, 3)
KICK, CLAP, HAT, OHAT, SHK = kick(), clap(), hat(), hat(0.09), shaker()

for b in range(BARS):
    t0 = b * BAR
    ch = CHORDS[b % 4]
    intro = b < 4                             # first 4 bars: no kick, builds up
    fill = b % 16 == 15                       # last bar of each 16: drop + roll into the next section
    lift = (b // 16) % 2 == 1                 # every other section adds an octave sparkle

    put(pad(ch['triad'], BAR), t0, 0.10)
    for e in STAB_RHYTHM:
        put(stab(ch['triad']), t0 + e * E8, 0.34, pan=-0.25)
    if b >= 2:
        hook = HOOK_B if b % 4 == 3 else HOOK_A
        for e, idx in enumerate(hook):
            if fill and e > 3: break
            put(marimba(ch['arp'][idx]), t0 + e * E8, 0.30 if e % 2 == 0 else 0.22, pan=0.25)
            if lift and e % 4 == 0:
                put(marimba(ch['arp'][idx] + 12, 0.3), t0 + e * E8 + E8 / 2, 0.10, pan=0.4)
    for e in range(8):
        put(SHK, t0 + e * E8 + E8 / 2, 0.22 if not intro else 0.14, pan=0.15)
        if e % 2 == 1:
            put(OHAT if e == 7 else HAT, t0 + e * E8, 0.38, pan=-0.1)
    if not intro and not fill:
        for q in range(4):
            put(KICK, t0 + q * BEAT, 0.95)
            put(bass(ch['root'], E8 * 0.95), t0 + q * BEAT + E8, 0.50)      # off-beat bass = bounce
        put(bass(ch['root'] + 12, E8 * 0.6), t0 + 3 * BEAT + E8 * 1.5, 0.30)
    if not intro:
        for q in (1, 3):
            put(CLAP, t0 + q * BEAT, 0.5)
    if fill or b == 3:                        # build-up: riser + accelerating claps
        put(riser(BAR), t0, 0.28)
        for k in range(8):
            put(CLAP, t0 + 2 * BEAT + k * E8 / 2, 0.12 + 0.04 * k)

# trim to length and finish on a bright C chord
end = int(SECONDS * SR)
L, R = L[:end], R[:end]
mix = np.stack([L, R], axis=1)
mix = np.tanh(mix * 1.1)                                             # gentle glue / soft limit
fade = int(2.5 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 1.5
mix[: int(0.03 * SR)] *= np.linspace(0, 1, int(0.03 * SR))[:, None]
mix = mix / np.abs(mix).max() * 0.89

out = Path(__file__).parent / "audio" / "music.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(f"{out.name}: {SECONDS:.0f}s, {BPM} BPM, {BARS} bars")
