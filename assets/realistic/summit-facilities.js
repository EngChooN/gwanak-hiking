import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {facilitySites} from './summit-config.js';

const palette=[0xedece5,0x999488,0x454b50,0x8b4335];
// 공유 재질 4개, 시설별 32m 이내. 사진 텍스처 없음.
const shared=palette.map(color=>new THREE.MeshStandardMaterial({color,roughness:.95}));
function shape(id,level){
 const buckets=palette.map(()=>[]),root=new THREE.Group();
 const add=(g,k,x,y,z,rx=0,rz=0)=>{g.rotateX(rx);g.rotateZ(rz);g.translate(x,y,z);buckets[k].push(g);};
 const box=(k,x,y,z,w,h,d,rx=0,rz=0)=>add(new THREE.BoxGeometry(w,h,d),k,x,y,z,rx,rz);
 if(id==='radar'){
  box(0,0,3,0,9,6,7);
  add(new THREE.IcosahedronGeometry(5,level===0?2:level===1?1:0),0,0,10,0);
  if(level<2)for(const x of [-3,0,3])box(2,x,3,3.51,1,1.3,.04);
 }else if(id==='eungjinjeon'){
  // 석축 상면에 건물 바닥을 맞춘다.
  box(1,0,2.5,0,7,5,6);box(0,0,6.4,0,6,2.8,5);
  for(const side of [-1,1])box(2,0,8.1,side*1.5,7,.2,3.5,side*.3);
  box(2,0,8.65,0,7,.2,.22);
  if(level<2){
   for(const x of [-2.7,-.9,.9,2.7])box(3,x,6.4,2.53,.16,2.8,.12);
   for(const x of [-1.8,0,1.8])box(2,x,6.3,2.55,1.35,2,.05);
   if(level===0)for(let row=1;row<5;row++)box(2,0,row,3.015,7,.035,.035);
   // 연등 줄은 가는 직육면체, 연등은 저면수 구체. 자체 색상.
   box(3,0,7.5,3.2,8,.025,.025);
   for(let i=0;i<9;i++){
    box(3,-3.6+i*.9,7.28,3.2,.018,.4,.018);
    add(new THREE.SphereGeometry(.19,6,4),i%2?0:3,-3.6+i*.9,7,3.2);
   }
  }
 }else if(id==='marker'){
  add(new THREE.CylinderGeometry(1.1,1.2,.24,8),1,0,.12,0);
  box(1,0,1.24,0,1.4,2,.65);
 }else if(id==='helipad'){
  add(new THREE.CylinderGeometry(8,8,.16,level===0?32:16),1,0,0,0);
  const ring=new THREE.RingGeometry(6.8,7.05,level===0?32:16);add(ring,0,0,.09,0,-Math.PI/2);
  for(const x of [-1.5,1.5])box(0,x,.1,0,.5,.02,4);
  box(0,0,.1,0,3,.02,.5);
 }else if(id==='fork'){
  // 판 앞면(+Z)의 글자보다 기둥 앞면이 9cm 뒤에 있다.
  box(3,0,1.15,-.2,.14,2.3,.14);box(3,0,2.05,0,2,.65,.08);
 }
 for(const [i,parts]of buckets.entries())if(parts.length){
  // 정이십면체는 인덱스가 없어 상자·원기둥과 섞이면 병합이 실패한다. 섞인 묶음만 인덱스를 푼다.
  const mixed=parts.some(p=>p.index)&&parts.some(p=>!p.index),merged=mixed?parts.map(p=>p.index?p.toNonIndexed():p):parts;
  const geometry=mergeGeometries(merged,false);new Set([...parts,...merged]).forEach(p=>p.dispose());
  const mesh=new THREE.Mesh(geometry,shared[i]);mesh.receiveShadow=true;root.add(mesh);
 }
 return root;
}
function label(text,width,height){
 if(typeof document==='undefined')return null;
 const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;
 const ctx=canvas.getContext('2d');ctx.fillStyle='#343934';ctx.fillRect(0,0,512,128);
 ctx.fillStyle='#fff5dc';ctx.textAlign='center';ctx.font='bold 33px sans-serif';
 text.split('\n').forEach((line,i)=>ctx.fillText(line,256,48+i*49));
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;
 const mesh=new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshBasicMaterial({map}));
 return mesh;
}
export function createSummitFacilities(route,height,sites=facilitySites(route,height)){
 const root=new THREE.Group();root.name='정상 시설 · 추정 위치·치수';root.userData.metricKind='정상부 시설';
 const items=[];
 for(const spec of sites){
  const {x,z}=spec;
  const lod=new THREE.LOD();lod.autoUpdate=false;lod.name=`${spec.id} · 추정`;
  for(const [level,distance]of [0,40,120,400].entries()){
   const object=level===3?new THREE.Group():shape(spec.id,level);
   // 400m 밖: 연주대·레이더만 최소 실루엣 유지.
   if(level===3&&['radar','eungjinjeon'].includes(spec.id))object.add(shape(spec.id,2));
   lod.addLevel(object,distance,.1);
  }
  const text=spec.id==='marker'?'관악산 629m\n위치·치수 추정':spec.id==='fork'?'← 암릉 / 헬기장 우회 →\n위치·치수 추정':null;
  if(text){const mesh=label(text,spec.id==='marker'?1.3:1.94,spec.id==='marker'?.48:.6);
   if(mesh){mesh.position.set(0,spec.id==='marker'?1.54:2.05,spec.id==='marker'?.331:.045);lod.levels[0].object.add(mesh);}}
  lod.position.set(x,spec.y,z);lod.rotation.y=spec.yaw;
  lod.userData={...spec,status:'추정(후기 근거, 현장 확인 전)',position:[x,lod.position.y,z],collision:false};
  root.add(lod);items.push(lod);
 }
 root.updateMatrixWorld(true);
 const bounds=new Map(items.map(lod=>[lod,new THREE.Box3().setFromObject(lod)]));
 return {group:root,items,update(camera){for(const lod of items){
  // AABB까지 거리 기준, 히스테리시스 10%.
  const d=bounds.get(lod).distanceToPoint(camera.position);let index=0;
  for(let i=1;i<lod.levels.length;i++)if(d>=lod.levels[i].distance*(lod.levels[i].object.visible?.9:1))index=i;
  lod.levels.forEach((l,i)=>{l.object.visible=i===index;});
 }}};
}
export function facilityTriangleCounts(items){
 return items.map(lod=>({id:lod.userData.id,levels:lod.levels.map(l=>{
  let triangles=0,meshes=0;l.object.traverse(o=>{if(o.isMesh){triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;meshes++;}});
  return {distance:l.distance,triangles,meshes};
 })}));
}
