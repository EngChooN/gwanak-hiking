// 구간 특징표에 따른 시각 배치. 위치·형태는 캡션과 GPX 구간 기반 추정이며 현장 개체가 아니다.
import * as THREE from 'three';
import {builder,roof,textPanel,materials} from './entrance-scenery.js';
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
 // 계곡: 하류 쪽 80m 청크, 폭 1.5m의 얕은 물과 둥근 바닥돌. 지면을 따라가며 물이 길을 가로지르지 않는다.
 for(let start=800;start<2560;start+=80){const points=[];const b=builder();for(let m=start;m<=Math.min(start+80,2595);m+=5){const p=sectionPoint(route,m,-6);points.push(p);for(const side of [-1,1]){const a=sectionPoint(route,m,-6+side*(1.1+.2*Math.sin(m)));const g=new THREE.IcosahedronGeometry(.35+.18*Math.abs(Math.sin(m)),0);g.scale(1,.55,1);b.add(g,'stone',a.x,height(a.x,a.z)+.04,a.z);}}
  const g=b.finish();g.add(groundRibbon(points,1.5,height,'water'));g.userData.stream=true;g.userData.centre=points[Math.floor(points.length/2)];root.add(g);
 }
 // 호수의 수면도 지면을 따라가도록 생성. 실제 수위·윤곽을 뜻하지 않는 10m 규모 시안.
 const lake=sectionPoint(route,740,-19),g=new THREE.CircleGeometry(5,24);g.rotateX(-Math.PI/2);const pos=g.attributes.position;for(let i=0;i<pos.count;i++){const x=lake.x+pos.getX(i),z=lake.z+pos.getZ(i);pos.setXYZ(i,x,height(x,z)+.04,z);}g.computeVertexNormals();const pond=new THREE.Mesh(g,materials.get('water'));root.add(pond);
 root.updateMatrixWorld(true);
 return {group:root,items,update(camera){for(const lod of items){const d=camera.position.distanceTo(lod.position);lod.levels.forEach((l,i)=>{l.object.visible=i===(d<40?0:d<120?1:2);});}for(const g of root.children)if(g.userData.stream){const p=g.userData.centre;g.visible=Math.hypot(camera.position.x-p.x,camera.position.z-p.z)<150;}pond.visible=Math.hypot(camera.position.x-lake.x,camera.position.z-lake.z)<150;}};
}
