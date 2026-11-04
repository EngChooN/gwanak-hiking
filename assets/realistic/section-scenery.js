// 구간 특징표에 따른 시각 배치. 위치·형태는 캡션과 GPX 구간 기반 추정이며 현장 개체가 아니다.
import * as THREE from 'three';
import {builder,roof,textPanel,materials} from './entrance-scenery.js';
import {streamWaterMaterial,buildStreamGeometry,buildPondGeometry,buildBedGeometry,buildFallGeometry,bedRockMaterial,fallWaterMaterial,ledgeRaise,streamRock,distanceToStream,STREAM_ROCK_CELL,STREAM_BED_HALF} from '../../src/stream-water.js';
import {setStreamDistance} from '../../src/ambient-config.js';
export const SCENERY_SITES=[
 {id:'lake',metres:740,side:-12,kind:'호수공원·자하정',source:'실경-구간별-참고사진.md §2'},
 {id:'junction',metres:1070,side:4.8,kind:'제1광장 갈림·쉼터',source:'실경-구간별-참고사진.md §4'},
 {id:'stairs-rest',metres:4312,side:3,kind:'깔딱고개 중간 벤치',source:'실경-구간별-참고사진.md §5'},
 {id:'yeonjuam',metres:4540,side:15,kind:'연주암 사찰 표현',source:'실경-구간별-참고사진.md §6'},
];
export function sectionPoint(route,metres,side=0){
 const found=route.findIndex(p=>(p.referenceMetres??p.s)>=metres),i=found<0?route.length-1:Math.max(1,found),a=route[i-1],b=route[i],t=THREE.MathUtils.clamp((metres-(a.referenceMetres??a.s))/((b.referenceMetres??b.s)-(a.referenceMetres??a.s)||1),0,1),dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz)||1;
 return {x:THREE.MathUtils.lerp(a.x,b.x,t)-dz/n*side,z:THREE.MathUtils.lerp(a.z,b.z,t)+dx/n*side,yaw:Math.atan2(-dx,-dz)};
}
// 계곡 물줄기 중심선의 옆 위치(길 기준 왼쪽 m): 길과 나란히 6m 떨어진 선을 가운데로 두고 좌우로 굽이친다(굽이 폭 ±2.7m, 마루 간격 약 26m·60m).
export const streamSide=m=>-6.2+1.9*Math.sin(m/4.1+.7)+.8*Math.sin(m/9.3+2.1);
export const STREAM_POINT_STEP=2;
// 회색 판 암반 조각: 납작한 상자를 꼭짓점마다 흔들어 모난 판으로 만든다. 가로 w·두께 h·세로 d(m), seed로 결정적.
export function slabGeometry(w,h,d,seed){
 const g=new THREE.BoxGeometry(w,h,d),p=g.attributes.position,j=(i,k)=>{const n=Math.sin((seed*13.7+i*7.9+k*3.3))*43758.5453;return n-Math.floor(n)-.5;};
 // 윗면을 안쪽으로 좁혀(×.55) 가장자리가 비스듬히 누운 판으로 만들고, 윗면 높낮이를 흔든다.
 for(let i=0;i<p.count;i++){const top=p.getY(i)>0,k=top?.55:1;p.setXYZ(i,p.getX(i)*k+j(i,1)*w*.1,p.getY(i)+(top?j(i,2)*h*.5:0),p.getZ(i)*k+j(i,3)*d*.1);}
 g.rotateY(seed*1.9);g.computeVertexNormals();return g;
}
materials.set('slab',new THREE.MeshStandardMaterial({color:0x66655f,emissive:0x3a3935,roughness:.96,flatShading:true}));
materials.set('slabDark',new THREE.MeshStandardMaterial({color:0x55544f,emissive:0x32312d,roughness:.96,flatShading:true}));
function bench(b,x=0,z=0){b.box('wood',x,.48,z,1.8,.13,.5);b.box('wood',x,.9,z-.23,1.8,.55,.08);for(const s of [-1,1])b.box('stone',x+s*.64,.23,z,.15,.46,.4);}
function siteModel(id,simple){
 const b=builder();
 if(id==='lake'){
  b.add(new THREE.CylinderGeometry(2.4,2.6,.3,8),'stone',0,.15,0);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;b.beam('red',[Math.cos(a)*1.8,.3,Math.sin(a)*1.8],[Math.cos(a)*1.8,2.8,Math.sin(a)*1.8],.1);}
  b.box('green',0,2.75,0,4,.22,3.8);roof(b,2.8,5.2,4.9,simple);bench(b,0,0);
 }else if(id==='junction'){
  bench(b,1.6,1.7);bench(b,-1.2,1.7);
  b.beam('wood',[0,0,0],[0,2.8,0],.09);b.box('wood',0,2.5,0,2.6,.4,.1);b.box('wood',0,2,0,2.1,.35,.1);
 }else if(id==='stairs-rest')bench(b);
 else if(id==='yeonjuam'){
  b.box('stone',0,.35,0,7,.7,5);b.box('cream',0,1.9,0,6.2,2.4,4.2);
  for(const x of [-2.9,-1.45,0,1.45,2.9]){b.box('red',x,1.9,2.13,.13,2.5,.13);if(x<2.9)b.box('wood',x+.7,1.8,2.16,1.05,1.8,.03);}
  b.box('green',0,3.2,0,6.8,.3,4.5);roof(b,3.35,8.2,6,simple);
 }
 const root=b.finish(),text=id==='junction'?'← 호수공원 · 삼성산 →':id==='lake'?'자하정':id==='yeonjuam'?'연주암':null;
 if(text){const sign=textPanel(text,id==='junction'?2.5:1.6,id==='junction'?.32:.42,{background:'#484637',color:'#fff2cf'});if(sign){sign.position.set(0,id==='junction'?2.5:id==='lake'?2.72:3.1,id==='junction'?.061:id==='lake'?1.92:2.3);root.add(sign);}}
 return root;
}
function groundRibbon(points,width,height,key){
 const v=[],idx=[];
 for(let i=0;i<points.length;i++){const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)],n=Math.hypot(b.x-a.x,b.z-a.z)||1;for(const s of [-1,1]){const x=points[i].x-(b.z-a.z)/n*width/2*s,z=points[i].z+(b.x-a.x)/n*width/2*s;v.push(x,height(x,z)+.035,z);}if(i){const j=i*2;idx.push(j-2,j-1,j,j-1,j+1,j);}}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.setIndex(idx);g.computeVertexNormals();const mesh=new THREE.Mesh(g,materials.get(key));mesh.receiveShadow=true;return mesh;
}
export function scenerySites(route,height){
 return [...SCENERY_SITES.map(spec=>{const p=sectionPoint(route,spec.metres,spec.side);return {...spec,...p,y:height(p.x,p.z),supportRadius:spec.id==='lake'?2.7:spec.id==='yeonjuam'?4.5:2.5};}),
  {...sectionPoint(route,740,-19),id:'lake-water',supportRadius:5.5}].map(p=>({...p,y:p.y??height(p.x,p.z)}));
}
export function clearSceneryPlacements(placements,sites,margin=1){return placements.filter(p=>sites.every(s=>Math.hypot(p.x-s.x,p.z-s.z)>s.supportRadius+margin));}
export function createSectionScenery(route,height){
 const root=new THREE.Group(),items=[];root.name='구간별 참고 특징 보정';root.userData.metricKind='구간별 시설';
 for(const spec of SCENERY_SITES){const p=sectionPoint(route,spec.metres,spec.side),lod=new THREE.LOD();lod.autoUpdate=false;lod.position.set(p.x,height(p.x,p.z)+.03,p.z);lod.rotation.y=p.yaw;lod.userData={...spec,status:'위치·치수 추정'};
  lod.addLevel(siteModel(spec.id,false),0,.1);lod.addLevel(siteModel(spec.id,true),40,.1);lod.addLevel(new THREE.Group(),120,.1);root.add(lod);items.push(lod);
 }
 // 계곡: 80m 청크마다 물 띠(src/stream-water.js: 흐름 물결·반사·바닥 비침·거품·젖은 돌 가장자리)와 바닥돌, 물속 바위.
 // 물 재질은 청크가 함께 쓴다. 길이 방향 좌표(along)를 청크마다 이어 받아 바위·턱 거품 자리가 청크 경계에서 끊기지 않는다.
 const streamMaterial=streamWaterMaterial(),bedMaterial=bedRockMaterial(),fallMaterial=fallWaterMaterial(),streamSamples=[];let alongAcc=0;
 for(let start=800;start<2560;start+=80){const points=[];const b=builder();for(let m=start;m<=Math.min(start+80,2595);m+=STREAM_POINT_STEP)points.push(sectionPoint(route,m,streamSide(m)));
  const built=buildStreamGeometry(points,height,alongAcc,1,ledgeRaise);streamSamples.push(...built.samples);
  // 물가 판 암반 조각(바깥쪽에 모난 덩어리를 겹쳐 쌓는다)과 물속 납작한 바위. 모두 어두운 회색.
  for(let k=0;k<built.samples.length;k+=4){const s=built.samples[k],r=ledgeRaise(s.along);if(r>0)continue;const n=Math.round(s.along*3.1);
   for(const side of [-1,1]){const h=(i)=>{const v=Math.sin(n*12.9+side*78.2+i*4.1)*43758.5453;return v-Math.floor(v);};if(h(0)<.3)continue;
    const a=side*(STREAM_BED_HALF*(.95+.3*h(1))),x=s.x+s.side[0]*a,z=s.z+s.side[1]*a,w=1.3+1.5*h(2),t=.18+.2*h(3),dd=1.2+1.2*h(4);
    b.add(slabGeometry(w,t,dd,n+side*3+h(5)),h(6)<.3?'slabDark':'slab',x,height(x,z)+t*.2,z);
    if(h(7)<.3){const c=.6+.5*h(8);b.add(slabGeometry(c*1.8,c*.4,c*1.3,n*1.3+side),'slab',x+(h(9)-.5),height(x,z)+t+c*.1,z+(h(10)-.5));}}}
  for(let c=Math.floor(alongAcc/STREAM_ROCK_CELL);c<=Math.floor(built.alongEnd/STREAM_ROCK_CELL);c++){const r=streamRock(c);if(!r||r.along<alongAcc||r.along>=built.alongEnd||ledgeRaise(r.along)>0)continue;
   const s=built.samples.reduce((best,q)=>Math.abs(q.along-r.along)<Math.abs(best.along-r.along)?q:best),x=s.x+s.side[0]*r.across,z=s.z+s.side[1]*r.across;
   b.add(slabGeometry(r.radius*3.4,r.radius*.7,r.radius*2.6,c),'slabDark',x,height(x,z)+r.radius*.1,z);}
  alongAcc=built.alongEnd;
  const g=b.finish(),bed=new THREE.Mesh(buildBedGeometry(built.samples,height,ledgeRaise),bedMaterial),water=new THREE.Mesh(built.geometry,streamMaterial);bed.name='계곡 암반';bed.receiveShadow=true;water.renderOrder=2;water.name='계곡 물';g.add(bed,water);
  const fallGeometry=buildFallGeometry(built.samples,height);if(fallGeometry){const fall=new THREE.Mesh(fallGeometry,fallMaterial);fall.renderOrder=3;fall.name='계곡 낙수';g.add(fall);}
  g.userData.stream=true;g.userData.centre=points[Math.floor(points.length/2)];root.add(g);
 }
 // 호수의 수면도 지면을 따라가도록 생성. 실제 수위·윤곽을 뜻하지 않는 10m 규모 시안. 계곡과 같은 물 재질(흐름 없음).
 const lake=sectionPoint(route,740,-19),pond=new THREE.Mesh(buildPondGeometry(lake.x,lake.z,5,height),streamWaterMaterial({pond:true,pondRadius:5}));pond.renderOrder=2;pond.name='호수 수면';root.add(pond);
 root.updateMatrixWorld(true);
 return {group:root,items,update(camera){for(const lod of items){const d=camera.position.distanceTo(lod.position);lod.levels.forEach((l,i)=>{l.object.visible=i===(d<40?0:d<120?1:2);});}for(const g of root.children)if(g.userData.stream){const p=g.userData.centre;g.visible=Math.hypot(camera.position.x-p.x,camera.position.z-p.z)<150;}pond.visible=Math.hypot(camera.position.x-lake.x,camera.position.z-lake.z)<150;
  // 물소리: 눈에 보이는 물줄기와 같은 거리로 맞춘다(물이 없는 구간은 구간표 값을 쓴다).
  const near=distanceToStream(streamSamples,camera.position.x,camera.position.z);setStreamDistance(near<90?Math.max(near,2):null);}};
}
