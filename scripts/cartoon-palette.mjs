// 참고 사진에서 카툰 팔레트를 찍는다. 영역 정의는 scripts/cartoon-palette-samples.json.
// 사용: node scripts/cartoon-palette.mjs
//  → docs/카툰-팔레트.json(시간대·대상별 hex와 근거 파일, 커밋 가능)
//  → artifacts/cartoon-compare/palette-check/<시간대>-<대상>.png(찍은 영역 표시, 참고 사진 포함이라 커밋 금지)
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {refPath,withCanvasPage,sampleBoxes,composeGrid} from './lib/ref-image.mjs';
const samples=JSON.parse(readFileSync('scripts/cartoon-palette-samples.json','utf8'));
const checkDir='artifacts/cartoon-compare/palette-check';mkdirSync(checkDir,{recursive:true});
const hex=c=>'#'+c.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
const median=a=>{const s=[...a].sort((p,q)=>p-q);return s.length%2?s[s.length>>1]:(s[s.length/2-1]+s[s.length/2])/2;};
const luma=c=>.2126*c[0]+.7152*c[1]+.0722*c[2];
const out={_설명:'node scripts/cartoon-palette.mjs 결과. color=근거 영역 색의 채널별 중앙값(sRGB). samples에 근거 파일·영역·개별 색.'};
await withCanvasPage(async page=>{
 for(const [phase,keys] of Object.entries(samples)){
  if(phase.startsWith('_'))continue;out[phase]={};
  for(const [key,list] of Object.entries(keys)){
   const rows=[];
   for(const s of list){
    const [r]=await sampleBoxes(page,refPath(s.file),[s.box]);
    const stat=s.stat??'median';
    if(stat==='stars'){rows.push({file:s.file,box:s.box,stat,note:s.note,stars:r.stars,hex:`별 ${r.stars}`,rgb:r.peak});continue;}
    const c=r[stat];rows.push({file:s.file,box:s.box,stat,note:s.note,hex:hex(c),rgb:c,spread:Math.round(luma(r.light)-luma(r.dark))});
   }
   const color=[0,1,2].map(k=>median(rows.map(r=>r.rgb[k])));
   out[phase][key]=rows[0].stat==='stars'?{starsPer100k:median(rows.map(r=>r.stars)),starColor:hex(color),samples:rows.map(({rgb,...r})=>r)}
    :{hex:hex(color),luma:Math.round(luma(color)),samples:rows.map(({rgb,...r})=>r)};
   console.log(phase.padEnd(7),key.padEnd(16),hex(color),rows.map(r=>`${r.file}:${r.hex}`).join(' '));
   // 확인용: 같은 사진의 영역은 한 칸에 모아 그린다.
   const byFile=new Map();list.forEach((s,i)=>{if(!byFile.has(s.file))byFile.set(s.file,[]);byFile.get(s.file).push([...s.box,rows[i].hex]);});
   const tiles=[...byFile].map(([f,boxes])=>({path:refPath(f),label:`${f}  ${boxes.map(b=>b[4]).join(' ')}`,boxes}));
   writeFileSync(`${checkDir}/${phase}-${key}.png`,await composeGrid(page,tiles,{cols:Math.min(3,tiles.length),cellW:560,title:`${phase} ${key} → ${hex(color)}`}));
  }
 }
});
writeFileSync('docs/카툰-팔레트.json',JSON.stringify(out,null,1));
