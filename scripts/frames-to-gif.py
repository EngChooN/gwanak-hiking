# 캡처 프레임 폴더를 GIF로 묶는다(ffmpeg 없이 Pillow). 사용: python3 scripts/frames-to-gif.py <폴더> <출력.gif> [fps]
import sys,glob
from PIL import Image
folder,out=sys.argv[1],sys.argv[2];fps=int(sys.argv[3]) if len(sys.argv)>3 else 30
frames=[Image.open(f).convert('RGB').resize((450,450)) for f in sorted(glob.glob(folder+'/*.png'))]
frames[0].save(out,save_all=True,append_images=frames[1:],duration=int(1000/fps),loop=0,optimize=True)
print(out,len(frames))
