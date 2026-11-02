"""design/sounds-check.html 생성: 템플릿에 소리 파일을 base64로 내장(file:// 에서 fetch가 막힐 때 대비).
사용: python -I build_sounds_check.py <design 폴더>"""
import sys, os, glob, base64, json
d = sys.argv[1]; s = os.path.join(d, 'sounds'); emb = {}
for sub in ('stairs', 'dirt', 'stone', 'deck', 'rock'):
    for p in sorted(glob.glob(os.path.join(s, sub, '*'))):
        n = os.path.basename(p)
        if sub == 'stairs' and '-stair-' not in n: continue
        emb[f'{sub}/{n}'] = base64.b64encode(open(p, 'rb').read()).decode()
t = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sounds-check.template.html'), encoding='utf-8').read()
open(os.path.join(d, 'sounds-check.html'), 'w', encoding='utf-8').write(t.replace('__DATA__', json.dumps(emb)))
print(len(emb), 'files')
