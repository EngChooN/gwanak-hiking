from PIL import Image
import colorsys,json,sys
from pathlib import Path
# 수정 전 화면에서 먼저 고정한 ROI. HUD·아바타·계단·하늘을 제외한 같은 화면 좌표를 양쪽에 사용.
regions=[
 ('그늘 사면 왼쪽','shadow',(100,350,300,530)),
 ('그늘 사면 오른쪽','shadow',(920,300,1030,350)),
 ('그늘 바위 왼쪽','shadow',(374,135,400,178)),
 ('그늘 바위 오른쪽','shadow',(1290,260,1335,282)),
 ('양지 사면','sun',(1000,520,1080,560)),
 ('양지 바위','sun',(1275,235,1300,243)),
]
out={'method':'1366×768, Neutral, 수직 FOV 70°, 동일 위치·카메라. sRGB 8비트 고정 ROI. 평균 픽셀 HSV와 평균 RGB의 HSV를 구분. 청색 비율은 S>0.05인 유채색 중 H=200~250° 비율.', 'regions':[]}
for name,kind,box in regions:
 row={'name':name,'kind':kind,'box':box}
 for phase in ['before','after']:
  image=Image.open(f'artifacts/shadow-{phase}.png').convert('RGB');raw=image.crop(box).tobytes();pixels=list(zip(raw[0::3],raw[1::3],raw[2::3]));n=len(pixels)
  rgb=[sum(p[c] for p in pixels)/n for c in range(3)]
  hsv=[colorsys.rgb_to_hsv(*(v/255 for v in p)) for p in pixels]
  mean_s=sum(h[1] for h in hsv)/n;colored=[h for h in hsv if h[1]>.05];blue=sum(200<=h[0]*360<=250 for h in colored)/max(1,len(colored))
  hsv_mean=colorsys.rgb_to_hsv(*(v/255 for v in rgb))
  row[phase]={'rgb':rgb,'meanPixelS':mean_s,'meanRGB_H':hsv_mean[0]*360,'meanRGB_S':hsv_mean[1],'blueFraction':blue,'pixels':n}
 row['passed']=kind!='shadow' or (row['after']['meanPixelS']<=.25 and row['after']['meanRGB_S']<=.25 and row['after']['blueFraction']<=.10)
 out['regions'].append(row)
out['aggregate']={}
for kind in ['shadow','sun']:
 selected=[r for r in out['regions'] if r['kind']==kind];out['aggregate'][kind]={}
 for phase in ['before','after']:
  n=sum(r[phase]['pixels'] for r in selected);rgb=[sum(r[phase]['rgb'][i]*r[phase]['pixels'] for r in selected)/n for i in range(3)]
  h,s,v=colorsys.rgb_to_hsv(*(x/255 for x in rgb))
  out['aggregate'][kind][phase]={'rgb':rgb,'meanPixelS':sum(r[phase]['meanPixelS']*r[phase]['pixels'] for r in selected)/n,'meanRGB_H':h*360,'meanRGB_S':s,'pixels':n}
out['beforeBuildHash']=json.loads(Path('artifacts/shadow-before.json').read_text())['buildHash']
out['afterBuildHash']=json.loads(Path('artifacts/shadow-after.json').read_text())['buildHash']
out['passed']=all(r['passed'] for r in out['regions'])
Path('artifacts/shadow-color-measurements.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
print(json.dumps(out,ensure_ascii=False,indent=2))
if '--assert' in sys.argv and not out['passed']:sys.exit(1)
