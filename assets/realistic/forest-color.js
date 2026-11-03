import {Color,MathUtils} from 'three';

// 11월 초 잎 색(sRGB). 현장 수종·단풍 비율이 아닌 시각 보정(⚠️ 일반 지식, docs/식생밀도-분위기-참고-2026-11-04.md).
// 활엽: 갈색·황갈 약 65%(신갈·상수리), 노랑 약 23%(아까시 등), 붉은·주황 약 12%(당단풍·팥배). 소나무는 상록.
// 잎 재질 셰이더(foliage-shader.js)가 이 색을 잎 텍스처 명도에 입힌다. 줄기는 물들이지 않는다.
// 같은 좌표는 모든 LOD에서 같은 색을 쓰고, 완만한 공간 변화를 겹쳐 무작위 점무늬가 되지 않게 한다.
const broadleaf=[
 [.30,[0x7f5530,0x93623a]],// 갈색
 [.35,[0xa57a40,0x8f8046]],// 황갈·덜 든 올리브
 [.23,[0xc29a3c,0xd2ad4c]],// 노랑
 [.12,[0xbe6a2c,0xa4442c]],// 주황·붉은
];
const pine=[[1,[0x4c6338,0x5f7546,0x6d7c4e]]];
function pick(palette,u,v){
 let acc=0;
 for(const [weight,colors] of palette){
  acc+=weight;if(u>acc&&palette.at(-1)[1]!==colors)continue;
  const t=v*(colors.length-1),i=Math.min(colors.length-2,Math.floor(t));
  return colors.length===1?new Color(colors[0]):new Color(colors[i]).lerp(new Color(colors[i+1]),t-i);
 }
}
export function treeTint(id,x,z){
 const palette=id.startsWith('pine')?pine:broadleaf;
 const patch=.5+.25*Math.sin(x*.035+z*.021)+.25*Math.sin(z*.049-x*.013);
 const hash=Math.sin(x*12.9898+z*78.233)*43758.5453,individual=hash-Math.floor(hash);
 const hash2=Math.sin(x*39.3467+z*11.135)*24634.6345,shade=hash2-Math.floor(hash2);
 const u=MathUtils.clamp(patch*.55+individual*.45,0,.9999);
 // 개체별 명도 ±8%로 같은 색 띠 안에서도 그루마다 다르게 보이게 한다.
 return pick(palette,u,shade).multiplyScalar(.92+individual*.16).getHex();
}

export function colorForestEntries(entries){
 return entries.map(entry=>entry.kind==='tree'?{...entry,placements:entry.placements.map(p=>({...p,forestTint:treeTint(entry.id,p.x,p.z)}))}:entry);
}
