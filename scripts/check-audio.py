#!/usr/bin/env python3
"""Spectral/tonality + level report for shipped audio. Usage: python3 scripts/check-audio.py [key ...]
Tonal metric: Welch PSD (8192-pt, 2.7 Hz bins); peak-to-median = max over 60 Hz-8 kHz of PSD / local median
PSD in a +-1/3-octave window (>= 400 Hz wide). Noise-like sound is ~ 3-8 dB here (Welch scatter);
a tonal hum/whistle is > 15 dB."""
import sys, subprocess, json, os
import numpy as np
D = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'public', 'assets', 'audio')
def load(k):
    raw = subprocess.run(['ffmpeg','-v','error','-i',os.path.join(D,k+'.ogg'),'-f','f32le','-ac','1','-ar','22050','-'],capture_output=True,check=True).stdout
    return np.frombuffer(raw,dtype=np.float32)
def tonal(x, sr=22050, n=8192):
    if len(x) < n*2: n = 1 << int(np.log2(len(x)//2))
    w = np.hanning(n); hop = n//2; ps = []
    for s in range(0, len(x)-n, hop): ps.append(np.abs(np.fft.rfft(x[s:s+n]*w))**2)
    p = np.mean(ps,axis=0); f = np.fft.rfftfreq(n,1/sr); best = (0,0)
    for i in range(int(60/(sr/n)), int(8000/(sr/n))):
        half = max(int(f[i]*0.26/(sr/n)), int(200/(sr/n)))
        if p[i] < 1e-5*p.max(): continue
        med = np.median(p[max(0,i-half):i+half]); r = p[i]/med
        if r > best[0]: best = (r, f[i])
    return 10*np.log10(best[0]), best[1]
keys = sys.argv[1:] or ['amb_wind','amb_rain']
for k in keys:
    x = load(k); db, fr = tonal(x)
    print(f'{k}: dur {len(x)/22050:.1f}s peak {np.abs(x).max():.2f} rms {np.sqrt((x**2).mean()):.3f} tonal peak/median {db:.1f} dB ({10**(db/10):.1f}x) at {fr:.0f} Hz')
