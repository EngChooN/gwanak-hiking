"""계단 발소리 변형 생성: 한 걸음 CC0 음원 -> 앞발 체중이 실린 짧은 계단 소리.
사용: python -I make_stairs.py <sounds 폴더>   (numpy, scipy, soundfile 필요)
"""
import sys, os, json
import numpy as np, soundfile as sf
from scipy.signal import resample_poly, butter, sosfilt

root = sys.argv[1]
SR = 44100

def load(p):
    x, sr = sf.read(p, always_2d=True); x = x.mean(1)
    assert sr == SR, (p, sr)
    return x

def lowshelf(x, gain_db, fc=220):
    # 저역을 gain_db 만큼 올림: x + (g-1)*lowpass(x)
    g = 10 ** (gain_db / 20)
    sos = butter(2, fc, 'low', fs=SR, output='sos')
    return x + (g - 1) * sosfilt(sos, x)

def pitch(x, ratio):  # ratio<1: 낮고 무거워짐(길이는 늘어남)
    from fractions import Fraction
    f = Fraction(ratio).limit_denominator(100)
    return resample_poly(x, f.denominator, f.numerator)

def make(x, max_len, shelf_db, ratio, fade_ms=45):
    x = x - x.mean()
    x = pitch(x, ratio)
    # 시작 직전 무음 제거(첫 소리까지 3ms 남김)
    thr = 0.1 * np.abs(x).max()
    on = max(0, int(np.argmax(np.abs(x) > thr)) - int(0.003 * SR))
    x = x[on:]
    x = lowshelf(x, shelf_db)
    n = int(max_len * SR); x = x[:n]
    f = int(fade_ms / 1000 * SR); x[-f:] *= np.linspace(1, 0, f) ** 2
    x = x / np.sqrt(np.mean(x[:int(0.12 * SR)] ** 2)) * 0.12  # 초반 0.12초 RMS 맞춤
    pk = np.abs(x).max()
    if pk > 0.7: x *= 0.7 / pk  # -3dBFS 상한
    return x.astype(np.float32)

jobs = []
for k, fn in enumerate(['StoneL1', 'StoneR1', 'StoneL2', 'StoneR2', 'StoneL3', 'StoneR3']):
    jobs.append(('stone', f'stone/Fantozzi-{fn}.ogg', f'stairs/stone-stair-{k+1:02d}.ogg',
                 0.28, 4.0, [0.94, 0.90, 0.96, 0.92, 0.97, 0.93][k]))
# 통나무 계단: 두꺼운 나무판 소리 3개(데크, 피치 -12%) + 실내 나무 계단 클립에서 오른 걸음 4개(피치 -5%)
w = 0
for fn in ['wood01', 'wood02', 'wood03']:
    w += 1
    jobs.append(('log', f'deck/{fn}.ogg', f'stairs/log-stair-{w:02d}.ogg', 0.30, 5.0, 0.88))
CLIP = 'stairs/bigsoundbank-0180-wooden-stairs.ogg'
for t in (0.22, 2.02, 4.43, 7.52):   # 클립 안의 걸음 시작 시각(초)
    w += 1
    jobs.append(('log', (CLIP, t), f'stairs/log-stair-{w:02d}.ogg', 0.30, 5.0, 0.95))

meta = []
for kind, src, dst, mlen, sh, ratio in jobs:
    if isinstance(src, tuple):
        x = load(os.path.join(root, src[0])); t = int((src[1] - 0.02) * SR)
        x = x[t:t + int(0.45 * SR)]; src = f'{src[0]}@{src[1]}s'
    else:
        x = load(os.path.join(root, src))
    y = make(x, mlen, sh, ratio)
    sf.write(os.path.join(root, dst), y, SR, format='OGG', subtype='VORBIS')
    meta.append(dict(kind=kind, src=src, dst=dst, dur=round(len(y)/SR, 3),
                     peak_db=round(float(20*np.log10(np.abs(y).max())), 1)))
print(json.dumps(meta, ensure_ascii=False, indent=1))
