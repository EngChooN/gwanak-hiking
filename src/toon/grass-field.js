import * as THREE from 'three';
import {indexRoute} from '../../assets/realistic/geo.js';
import {groundCoverMask} from '../../assets/realistic/ground-cover-mask.js';
import {waterClearance} from '../../assets/realistic/water-clearance.js';
import {grassGround} from '../../assets/realistic/generated/nature/forest-layers.js';
// 카툰 풀밭(3단계, 산풍경): 「야생의 숨결」처럼 땅이 보이지 않게 덮는 풀 다발을 카메라 둘레에만 깐다.
// - 16m 타일마다 고정 난수로 다발 자리를 한 번 정해 두고(카메라가 움직여도 풀이 미끄러지지 않는다), 반경 안 타일만 그린다.
// - 길(흙길 포함)·포장·계단·데크·광장·물·구간 시설 자리, 급경사(암벽), 정상 암반은 비운다.
// - 바깥 테두리는 셰이더가 다발을 줄여 사라지게 한다(뚝 끊기는 경계 없음). 그 너머는 지형의 평평한 연두 풀밭 면.
// 실사 모드에서는 만들지 않는다.
export const GRASS_FIELD={tile:16,step:.62,radius:[14,22,30],capacity:[1400,3800,7200],slopeMax:.24,heightMax:596,pathMargin:.35,reach:.32};

export function createGrassField({landscape,geometry,material,scene}){
 const route=landscape.route,nearest=indexRoute(route),water=waterClearance(route);
 const sites=()=>[...(landscape.status.sectionScenery?.sites??[]),...(landscape.status.interactionProps?.clearSites??[]),...(landscape.status.summitFacilities?.sites??[]).map(s=>({x:s.x,z:s.z,supportRadius:s.supportRadius??3}))];
 let mask=null;
 const capacity=GRASS_FIELD.capacity[2];
 const mesh=new THREE.InstancedMesh(geometry,material,capacity);
 mesh.name='카툰 풀밭';mesh.count=0;mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;
 mesh.userData.metricKind='하층 식생';mesh.userData.toonGroundCover='field';mesh.matrixAutoUpdate=false;
 scene.add(mesh);
 const tiles=new Map(),status={tiles:0,clumps:0,rebuilds:0,radius:0};
 const height=(x,z)=>grassGround(landscape.floorHeight,x,z);
 function slopeAt(x,z){
  const e=1.5,dx=(height(x+e,z)-height(x-e,z))/(2*e),dz=(height(x,z+e)-height(x,z-e))/(2*e);
  // 1-법선y(지형 셰이더의 slope와 같은 척도).
  return 1-1/Math.sqrt(1+dx*dx+dz*dz);
 }
 function tile(tx,tz){
  const key=`${tx},${tz}`;if(tiles.has(key))return tiles.get(key);
  mask??=groundCoverMask(route,{nearest,sites:sites(),water});
  let seed=(Math.imul(tx,73856093)^Math.imul(tz,19349663)^0x5bd1e995)>>>0;const r=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const T=GRASS_FIELD.tile,S=GRASS_FIELD.step,n=Math.round(T/S),list=[];
  for(let j=0;j<n;j++)for(let i=0;i<n;i++){
   const x=tx*T+(i+.1+r()*.8)*S,z=tz*T+(j+.1+r()*.8)*S,yaw=r()*6.283,scale=.75+r()*.5;
   const y=height(x,z);if(!Number.isFinite(y)||y>GRASS_FIELD.heightMax)continue;
   const h=nearest(x,z);if(h.distance<h.width/2+GRASS_FIELD.pathMargin)continue;
   if(mask.blocked(x,z,GRASS_FIELD.reach))continue;
   if(slopeAt(x,z)>GRASS_FIELD.slopeMax)continue;
   list.push(x,y-.02,z,yaw,scale);
  }
  const data=new Float32Array(list);tiles.set(key,data);status.tiles=tiles.size;
  // 오래된 타일은 버린다(메모리 상한).
  if(tiles.size>400)tiles.delete(tiles.keys().next().value);
  return data;
 }
 const dummy=new THREE.Object3D();let last=null;
 function update(camera,quality=1){
  const q=Math.max(0,Math.min(2,quality|0)),R=GRASS_FIELD.radius[q],cap=GRASS_FIELD.capacity[q],p=camera.position;
  if(last&&last.q===q&&Math.hypot(p.x-last.x,p.z-last.z)<3)return;
  last={x:p.x,z:p.z,q};status.radius=R;
  material.userData.fieldUniforms&&(material.userData.fieldUniforms.tgFieldRadius.value=R);
  const T=GRASS_FIELD.tile,reach=R+3,t0x=Math.floor((p.x-reach)/T),t1x=Math.floor((p.x+reach)/T),t0z=Math.floor((p.z-reach)/T),t1z=Math.floor((p.z+reach)/T);
  // 가까운 타일부터 채운다(상한에 걸리면 먼 쪽이 빠진다).
  const order=[];for(let tz=t0z;tz<=t1z;tz++)for(let tx=t0x;tx<=t1x;tx++){const cx=(tx+.5)*T-p.x,cz=(tz+.5)*T-p.z;if(Math.hypot(cx,cz)<reach+T*.71)order.push([Math.hypot(cx,cz),tx,tz]);}
  order.sort((a,b)=>a[0]-b[0]);
  let k=0;const arr=mesh.instanceMatrix.array;
  for(const [,tx,tz] of order){
   const d=tile(tx,tz);
   for(let i=0;i<d.length&&k<cap;i+=5){
    const dx=d[i]-p.x,dz=d[i+2]-p.z;if(dx*dx+dz*dz>reach*reach)continue;
    dummy.position.set(d[i],d[i+1],d[i+2]);dummy.rotation.set(0,d[i+3],0);dummy.scale.setScalar(d[i+4]);dummy.updateMatrix();
    dummy.matrix.toArray(arr,k*16);k++;
   }
   if(k>=cap)break;
  }
  mesh.count=k;mesh.instanceMatrix.needsUpdate=true;status.clumps=k;status.rebuilds++;
 }
 function dispose(){scene.remove(mesh);mesh.dispose();tiles.clear();}
 return {mesh,update,dispose,status};
}
