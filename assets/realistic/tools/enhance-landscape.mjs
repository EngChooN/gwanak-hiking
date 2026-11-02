// 기존 CC0 사진판·암반을 재사용하는 재현 가능한 보완 배치. 개체 실측 위치가 아니다.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {gridHeight,nearestRoute,cutHeight,mix} from '../geo.js';
const root=new URL('../generated/',import.meta.url),base=new URL('nature/',root),backup=new URL('index-before-enhancement.json',base);
if(!existsSync(backup))writeFileSync(backup,readFileSync(new URL('index.json',base)));
const index=JSON.parse(readFileSync(backup)),meta=JSON.parse(readFileSync(new URL('manifest.json',root))).near,bytes=readFileSync(new URL('near.f32',root)),grid={...meta,values:new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))},route=JSON.parse(readFileSync(new URL('route.json',root)));
const h=(x,z)=>gridHeight(grid,x,z),floor=(x,z)=>{const hit=nearestRoute(route,x,z),a=route[hit.index],b=route[hit.index+1];return cutHeight(h(x,z)+mix(a.elevationCorrection??0,b.elevationCorrection??0,hit.t)*Math.exp(-((hit.distance/300)**2)),hit);};
let seed=20261102;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),groups=new Map();
// rock_09 원본의 높이는 3.3cm. 기존 1~3배 배치는 보이지 않아 미터 크기로 수정.
for(const e of index.instances)if(e.id==='rock_09')for(const p of e.placements){p.scale*=65;p.embed=.004;}
function add(id,x,z,scale,kind='tree',extra={}){const key=`${id}:${kind}:${Math.floor(x/128)}:${Math.floor(z/128)}`;if(!groups.has(key))groups.set(key,{id,kind,levels:[0,1,2].map((i)=>({url:`${id}-lod${kind==='rock'?i:2}.glb`,distance:[0,90,240][i]})),placements:[]});groups.get(key).placements.push({x,z,y:+floor(x,z).toFixed(3),scale,yaw:rand()*Math.PI*2,...extra});}
let forest=0,understory=0,rock=0;
for(let z=meta.z0+20;z<meta.z0+(meta.height-1)*8-20;z+=10)for(let x=meta.x0+20;x<meta.x0+(meta.width-1)*8-20;x+=10){
 const px=x+(rand()-.5)*8,pz=z+(rand()-.5)*8,y=h(px,pz),hit=nearestRoute(route,px,pz),slope=Math.hypot((h(px+8,pz)-h(px-8,pz))/16,(h(px,pz+8)-h(px,pz-8))/16);
 if(hit.distance<8||hit.distance>1550||y<20||y>585)continue;
 const density=(y<420?.88:.65)*(1-Math.max(0,y-500)/110)*(1-Math.min(.8,Math.max(0,slope-.7)));
 if(rand()<density){add(rand()<.22?'pine_tree_01':rand()<.5?'island_tree_01':'tree_small_02',px,pz,.9+rand()*.65);forest++;}
 if(hit.distance<95&&slope<.9&&rand()<.6){add('pine_sapling_medium',px+2,pz+2,.12+rand()*.18,'understory');understory++;}
}
// 길 어깨는 기존 CC0 묘목 사진판을 축소해 덮는다.
for(let i=0;i<route.length-1;i+=1){const a=route[i],b=route[i+1],n=Math.hypot(b.x-a.x,b.z-a.z)||1;for(let t=0;t<1;t+=.25)for(const side of [-1,1]){const d=3.8+rand()*16,x=mix(a.x,b.x,t)-(b.z-a.z)/n*d*side,z=mix(a.z,b.z,t)+(b.x-a.x)/n*d*side;if(nearestRoute(route,x,z).distance<3)continue;add('pine_sapling_medium',x,z,.10+rand()*.17,'understory');understory++;}}
const summit=route.at(-1);
// 정상 주변과 상부 능선: 절단면을 지면에 묻고 수평 암반/암릉으로 배치.
for(let z=summit.z-300;z<summit.z+260;z+=17)for(let x=summit.x-300;x<summit.x+300;x+=17){
 const px=x+(rand()-.5)*12,pz=z+(rand()-.5)*12,hit=nearestRoute(route,px,pz),y=floor(px,pz),d=Math.hypot(px-summit.x,pz-summit.z);
 if(hit.distance<13||y<475||d>300||rand()>.68)continue;
 const id=['rock_face_01','rock_face_02','mountainside','boulder_01'][Math.floor(rand()*4)],scale=id==='mountainside'?1.1+rand()*.7:2+rand()*3;
 add(id,px,pz,scale,'rock',{embed:id==='mountainside'?5.8:id==='rock_face_01'?1.9:id==='rock_face_02'?1.3:.15,pitch:id==='mountainside'?-.4:0,stretch:[scale*(1.1+rand()),scale*.65,scale*(1.1+rand())]});rock++;
}
// 정상의 경로 평탄화 어깨 위에 낮은 암반을 넣어 경사 아래로 가려지는 것을 막는다.
for(let dz=-24;dz<=12;dz+=7)for(let dx=-25;dx<=30;dx+=7){const x=summit.x+dx,z=summit.z+dz,hit=nearestRoute(route,x,z);if(hit.distance<5||hit.distance>29)continue;const scale=Math.min(2.8,(hit.distance-2)/3);add((dx+dz)%3===0?'boulder_01':'rock_face_02',x,z,scale,'rock',{embed:(dx+dz)%3===0?.15:1.3,stretch:[scale*1.5,scale*.65,scale*1.5]});rock++;}
for(let a=0;a<Math.PI*2;a+=Math.PI/5){const x=summit.x+Math.sin(a)*11,z=summit.z-Math.cos(a)*11;if(nearestRoute(route,x,z).distance<5)continue;add('boulder_01',x,z,2.8,'rock',{embed:.18});rock++;}
index.instances.push(...groups.values());index.counts={trees:index.instances.filter(e=>e.kind==='tree').reduce((n,e)=>n+e.placements.length,0),rocks:index.instances.filter(e=>e.kind==='rock').reduce((n,e)=>n+e.placements.length,0),understory};index.enhancement={seed:20261102,addedForest:forest,addedRocks:rock,understory,notes:'10m 격자 사진판 숲·축소 묘목 관목. 표고·경사 가정이며 현장 개체 배치 미검증.'};// 넓은 스캔의 발자국 아래 최저 지형까지 내려 절벽 위 공중 돌출을 줄인다.
for(const e of index.instances)if(e.kind==='rock')for(const p of e.placements){const radii={rock_09:.075,boulder_01:.95,rock_face_01:2.6,rock_face_02:1.5,mountainside:6};const r=(radii[e.id]||1)*Math.max(...(p.stretch??[p.scale,p.scale,p.scale]));let low=floor(p.x,p.z);for(const dx of [-r,0,r])for(const dz of [-r,0,r])low=Math.min(low,floor(p.x+dx,p.z+dz));p.supportDrop=+(floor(p.x,p.z)-low).toFixed(3);}
index.budget={...index.budget,totalTrees:index.counts.trees,totalRocks:index.counts.rocks,visibleDistance:1400,description:'추가 숲·관목은 LOD2 사진판만 사용. 기존 근경 LOD 유지. 현재 캡처 검증 수치를 참조.'};writeFileSync(new URL('index.json',base),JSON.stringify(index));console.log(index.counts,index.enhancement);
