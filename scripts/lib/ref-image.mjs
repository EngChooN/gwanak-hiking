// 카툰 참고 사진 도구 공용(이미지 라이브러리 없이 headless Chrome 캔버스로 처리).
// 참고 사진은 design/ref-cartoon/(커밋 금지)에 있고, 이 모듈로 만든 결과 중 참고 사진이 들어간 이미지도 커밋하지 않는다.
import {chromium} from '@playwright/test';
import {readFileSync,readdirSync,existsSync} from 'node:fs';
import {join,extname} from 'node:path';

export const REF_DIR='design/ref-cartoon';
const MIME={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};

// '04/04_03.jpg'·'04_03.jpg'·'04_03' → 실제 경로. 폴더 번호는 파일명 앞 두 자리로 찾는다.
export function refPath(name){
 if(existsSync(name))return name;
 const base=name.split('/').pop(),file=extname(base)?base:`${base}.jpg`,num=file.slice(0,2);
 const folder=readdirSync(REF_DIR).find(d=>d.startsWith(`${num}_`));
 if(!folder)throw new Error(`참고 폴더 없음: ${name}`);
 const p=join(REF_DIR,folder,file);if(!existsSync(p))throw new Error(`참고 사진 없음: ${p}`);return p;
}
export const refFolders=()=>readdirSync(REF_DIR).filter(d=>/^\d\d_/.test(d)).sort();
export const refFiles=folder=>readdirSync(join(REF_DIR,folder)).filter(f=>/^\d\d_\d\d\.(jpg|jpeg|png|webp)$/i.test(f)).sort();
export const dataUrl=p=>`data:${MIME[extname(p).toLowerCase()]??'image/png'};base64,${readFileSync(p).toString('base64')}`;

// 캔버스 작업용 빈 페이지 하나를 연다. fn(page)가 끝나면 닫는다.
export async function withCanvasPage(fn,browser){
 const own=!browser;browser??=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage();
 try{await page.setContent('<html><body></body></html>');return await fn(page);}finally{await page.close();if(own)await browser.close();}
}

// 사각 영역들의 색 통계. boxes=[[x,y,w,h],…] 0~1 비율 좌표. 영역마다 중앙값·평균·밝기 하위/상위 10% 평균(dark/light), 상위 2% 평균(peak, 창 불빛), 별 밀도(stars)를 돌려준다.
export async function sampleBoxes(page,path,boxes){
 return page.evaluate(async ({src,boxes})=>{
  const img=new Image();img.src=src;await img.decode();
  const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
  const g=c.getContext('2d',{willReadFrequently:true});g.drawImage(img,0,0);
  return boxes.map(([x,y,w,h])=>{
   const X=Math.round(x*c.width),Y=Math.round(y*c.height),W=Math.max(1,Math.round(w*c.width)),H=Math.max(1,Math.round(h*c.height));
   const d=g.getImageData(X,Y,W,H).data,px=[];
   for(let i=0;i<d.length;i+=4)px.push([d[i],d[i+1],d[i+2],.2126*d[i]+.7152*d[i+1]+.0722*d[i+2]]);
   const med=k=>{const a=px.map(p=>p[k]).sort((p,q)=>p-q);return a[a.length>>1];};
   const mean=a=>[0,1,2].map(k=>Math.round(a.reduce((s,p)=>s+p[k],0)/a.length));
   // 별: 밝기가 주변 5×5 최댓값이고 영역 중앙값보다 40 이상 밝은 점(10만 픽셀당 개수).
   const L=(i,j)=>{const k=(j*W+i)*4;return .2126*d[k]+.7152*d[k+1]+.0722*d[k+2];};const bg=(()=>{const a=px.map(p=>p[3]).sort((p,q)=>p-q);return a[a.length>>1];})();let stars=0;
   for(let j=2;j<H-2;j++)for(let i=2;i<W-2;i++){const v=L(i,j);if(v<bg+40)continue;let top=true;for(let b=-2;b<=2&&top;b++)for(let a=-2;a<=2;a++)if((a||b)&&L(i+a,j+b)>v){top=false;break;}if(top)stars++;}
   px.sort((p,q)=>p[3]-q[3]);const n=Math.max(1,Math.floor(px.length*.1)),m=Math.max(1,Math.floor(px.length*.02));
   return {median:[med(0),med(1),med(2)],mean:mean(px),dark:mean(px.slice(0,n)),light:mean(px.slice(-n)),peak:mean(px.slice(-m)),stars:Math.round(stars/px.length*1e5),pixels:px.length,size:[c.width,c.height]};
  });
 },{src:dataUrl(path),boxes});
}

// 여러 이미지를 격자로 붙여 PNG 버퍼로 돌려준다. tiles=[{path,label,boxes?:[[x,y,w,h,label]]}]
// cols 열, 칸 너비 cellW, 칸 높이는 16:9. 라벨은 칸 아래 띠에 쓴다. boxes를 주면 샘플 영역을 테두리로 표시한다.
// swatches=[{label,hex}]를 주면 맨 아래에 기준색 띠를 붙인다.
export async function composeGrid(page,tiles,{cols=3,cellW=640,title='',aspect=9/16,swatches=[]}={}){
 const cellH=Math.round(cellW*aspect),band=34,head=title?44:0,rows=Math.ceil(tiles.length/cols),foot=swatches.length?70:0;
 const payload=tiles.map(t=>({src:t.path?dataUrl(t.path):null,label:t.label??'',boxes:t.boxes??[]}));
 const b64=await page.evaluate(async ({payload,cols,cellW,cellH,band,head,rows,title,foot,swatches})=>{
  const c=document.createElement('canvas');c.width=cols*cellW;c.height=head+rows*(cellH+band)+foot;
  const g=c.getContext('2d');g.fillStyle='#1b1d22';g.fillRect(0,0,c.width,c.height);
  if(title){g.fillStyle='#fff';g.font='bold 22px -apple-system,"Apple SD Gothic Neo",sans-serif';g.textBaseline='middle';g.fillText(title,14,head/2);}
  for(let i=0;i<payload.length;i++){
   const t=payload[i],x=(i%cols)*cellW,y=head+Math.floor(i/cols)*(cellH+band);
   if(t.src){const img=new Image();img.src=t.src;await img.decode();
    // 칸을 꽉 채우도록 가운데 기준 잘라 넣는다(cover).
    const s=Math.max(cellW/img.naturalWidth,cellH/img.naturalHeight),w=img.naturalWidth*s,h=img.naturalHeight*s,ox=x+(cellW-w)/2,oy=y+(cellH-h)/2;
    g.save();g.beginPath();g.rect(x,y,cellW,cellH);g.clip();g.drawImage(img,ox,oy,w,h);
    for(const [bx,by,bw,bh,bl] of t.boxes){g.lineWidth=3;g.strokeStyle='#ff2bd6';g.strokeRect(ox+bx*w,oy+by*h,bw*w,bh*h);
     if(bl){g.font='bold 15px -apple-system,"Apple SD Gothic Neo",sans-serif';g.fillStyle='#ff2bd6';g.fillText(bl,ox+bx*w+4,oy+by*h+16);}}
    g.restore();}
   g.fillStyle='#111';g.fillRect(x,y+cellH,cellW,band);g.fillStyle='#e8e8e8';g.font='17px -apple-system,"Apple SD Gothic Neo",sans-serif';g.textBaseline='middle';
   g.fillText(t.label,x+10,y+cellH+band/2,cellW-20);
   g.strokeStyle='#1b1d22';g.lineWidth=2;g.strokeRect(x,y,cellW,cellH+band);
  }
  if(foot){const y0=c.height-foot,w=c.width/swatches.length;g.font='15px -apple-system,"Apple SD Gothic Neo",sans-serif';g.textBaseline='middle';
   swatches.forEach((s,i)=>{g.fillStyle=s.hex;g.fillRect(i*w+6,y0+6,w-12,foot-30);const n=parseInt(s.hex.slice(1),16),l=.2126*(n>>16)+.7152*(n>>8&255)+.0722*(n&255);
    g.fillStyle=l>140?'#111':'#fff';g.fillText(s.hex,i*w+14,y0+6+(foot-30)/2);g.fillStyle='#e8e8e8';g.fillText(s.label,i*w+8,y0+foot-12,w-16);});}
  return c.toDataURL('image/png').split(',')[1];
 },{payload,cols,cellW,cellH,band,head,rows,title,foot,swatches});
 return Buffer.from(b64,'base64');
}
