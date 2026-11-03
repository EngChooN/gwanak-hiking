import {Color,MathUtils} from 'three';

// 현장 수종·단풍 비율이 아닌 시각 보정. 같은 좌표는 모든 LOD에서 같은 색을 쓴다.
// 개체별 차이 위에 완만한 공간 변화를 겹쳐 색이 무작위 점무늬가 되지 않게 한다.
const broadleaf=[0x82956c,0xa9af79,0xc8b775,0xb99b62,0xb4865c,0x947951];
const pine=[0x819373,0x98a781,0xb0b491];
export function treeTint(id,x,z){
 const palette=id.startsWith('pine')?pine:broadleaf;
 const patch=.5+.25*Math.sin(x*.035+z*.021)+.25*Math.sin(z*.049-x*.013);
 const hash=Math.sin(x*12.9898+z*78.233)*43758.5453,individual=hash-Math.floor(hash);
 const position=MathUtils.clamp(patch*.72+individual*.28,0,1)*(palette.length-1);
 return new Color(palette[Math.floor(position)]).lerp(new Color(palette[Math.min(palette.length-1,Math.floor(position)+1)]),position%1).getHex();
}

export function colorForestEntries(entries){
 return entries.map(entry=>entry.kind==='tree'?{...entry,placements:entry.placements.map(p=>({...p,forestTint:treeTint(entry.id,p.x,p.z)}))}:entry);
}
