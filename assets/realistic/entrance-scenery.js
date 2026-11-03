// 산풍경 자체 모델. 첨부 사진의 정면 비례만 참고; 치수·후면·시설 위치는 실측 전 추정.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {entranceConfig,GATE_PILLAR_X,BARRICADE_X,BARRICADE_Z} from '../../src/entrance-config.js';
import {project} from './geo.js';
import {createPlazaGround,plazaFacilities,plazaFootprint,HEDGES} from './entrance-plaza.js';
const palette={roof:0x55595a,eave:0x474b4c,tile:0x818582,red:0x913d33,green:0x277563,blue:0x336c83,cream:0xd5c5a2,stone:0xa19f94,soil:0x514634,yellow:0xf2c32c,orange:0xdd692e,leaf:0x406339,flower:0xd78fbd,paving:0x3d3f3d,water:0x607d78,wood:0x75543b};
const materials=new Map(Object.entries(palette).map(([k,color])=>[k,new THREE.MeshStandardMaterial({color,roughness:k==='water'?.28:.88})]));
materials.get('roof').side=THREE.DoubleSide;
function builder(){
 const buckets=new Map();
 function add(g,k,x=0,y=0,z=0){g.translate(x,y,z);if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(g);}
 const box=(k,x,y,z,w,h,d)=>add(new THREE.BoxGeometry(w,h,d),k,x,y,z);
 function beam(k,a,b,r=.04,n=6){const v=new THREE.Vector3(...b).sub(new THREE.Vector3(...a)),g=new THREE.CylinderGeometry(r,r,v.length(),n);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.normalize()));add(g,k,...a.map((x,i)=>(x+b[i])/2));}
 function finish(){const root=new THREE.Group();for(const [key,parts]of buckets){const all=parts.map(g=>g.index?g.toNonIndexed():g),g=mergeGeometries(all,false);new Set([...parts,...all]).forEach(p=>p.dispose());g.computeBoundingBox();g.computeBoundingSphere();const mesh=new THREE.Mesh(g,materials.get(key));mesh.receiveShadow=true;root.add(mesh);}return root;}
 return {add,box,beam,finish};
}
// 팔작지붕: 좁은 용마루에서 사면으로 벌어지고, 처마 끝과 귀가 들린다.
function roof(b,y,w,d,simple){
 const steps=simple?3:10;
 // 사진 대조(2026-11-03): 지붕면은 용마루 쪽이 가파르고 처마 쪽이 눕는 오목 곡선, 네 귀(추녀)는 크게 들린다.
 const point=(u,t,side)=>{const x=u*(w*.36+t*w*.14),z=side*t*d*.5,au=Math.abs(u);return [x,y+1.75*Math.pow(1-t,1.55)+.12*t*t+.62*Math.pow(au,5)*t*t+.2*Math.pow(au,3)*Math.pow(t,6),z];};
 for(const side of [-1,1]){
  const v=[];for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){
   const a=point(-1+2*i/steps,j/steps,side),c=point(-1+2*(i+1)/steps,j/steps,side),d0=point(-1+2*i/steps,(j+1)/steps,side),e=point(-1+2*(i+1)/steps,(j+1)/steps,side);
   v.push(...(side===1?[a,d0,c,c,d0,e]:[a,c,d0,c,e,d0]).flat());
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(v,3));g.computeVertexNormals();b.add(g,'roof');
  if(!simple)for(let i=0;i<=40;i++){const u=-1+i/20;for(let j=0;j<5;j++)b.beam('tile',point(u,j/5,side),point(u,(j+1)/5,side),.028,4);}
  for(let i=0;i<steps;i++)b.beam('tile',point(-1+2*i/steps,1,side),point(-1+2*(i+1)/steps,1,side),.075);
 }
 // 양쪽 합각면과 내림마루. 속이 빈 지붕 단면을 막는다.
 for(const s of [-1,1]){const a=point(s,0,1),c=point(s,1,1),d0=point(s,1,-1);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...c,...d0,...a,...d0,...c],3));g.computeVertexNormals();b.add(g,'roof');b.beam('tile',a,c,.065);b.beam('tile',a,d0,.065);}
 b.beam('tile',[-w*.36,y+1.79,0],[w*.36,y+1.79,0],.12);
 // 처마 두께: 처마 끝선 아래로 연함·부연 띠를 내려 납작한 판처럼 보이지 않게 한다.
 if(!simple)for(const side of [-1,1])for(let i=0;i<steps;i++){const a=point(-1+2*i/steps,1,side),c=point(-1+2*(i+1)/steps,1,side);b.beam('eave',[a[0],a[1]-.16,a[2]],[c[0],c[1]-.16,c[2]],.15,5);}
}
export function textPanel(text,w,h,{background='#194f70',color='#ffffff'}={}){
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=1024;c.height=256;const ctx=c.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,1024,256);ctx.strokeStyle='#a5b5a4';ctx.lineWidth=12;ctx.strokeRect(12,12,1000,232);ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 140px "Noto Serif KR", "AppleMyungjo", serif';ctx.fillText(text,512,132,940);
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;return new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map}));
}
export function gateModel(simple=false){
 const b=builder();
 for(const x of [-GATE_PILLAR_X,GATE_PILLAR_X]){
  b.add(new THREE.CylinderGeometry(.48,.56,.5,8),'stone',x,.25,0);
  b.add(new THREE.CylinderGeometry(.34,.38,3.15,simple?8:12),'red',x,2.075,0);
  b.box('green',x,3.65,0,1.15,.26,1.1);
  for(const s of [-1,1]){b.box('blue',x+s*.35,3.9,0,.24,.27,1.5);b.box('green',x+s*.45,4.1,0,.62,.16,1.8);}
 }
 b.box('red',0,3.45,0,6.5,.24,.44);b.box('green',0,3.83,0,7.9,.35,.65);b.box('blue',0,4.12,0,8.4,.23,.85);
 for(const z of [-.6,.6]){b.box('green',0,4.25,z,9.4,.14,.18);if(!simple)for(let i=0;i<43;i++){const x=-4.6+i*9.2/42;b.beam(i%2?'green':'cream',[x,4.18,z],[x,4.35,z*2.1],.047);}}
 if(!simple)for(let i=0;i<27;i++){
  const x=-3.9+i*.3;for(const z of [-.44,.44]){b.box('cream',x,4.1,z,.06,.12,.02);b.box(i%2?'red':'blue',x,3.87,z*.76,.15,.12,.025);}
 }
 // 지붕:기둥 비례를 사진처럼 지붕 쪽으로 키운다(폭 11.4m·깊이 4.6m·높이 약 1.9m, 추정).
 roof(b,4.27,11.4,4.6,simple); // 본 처마
 if(!simple)roof(b,4.12,11.8,4.95,true); // 겹처마의 하단 선
 const root=b.finish(),sign=textPanel('관악산공원',3.25,.65);
 if(sign){sign.position.set(0,3.72,.48);root.add(sign);}
 root.name='관악산공원 · 두 기둥 겹처마 자체 모델';return root;
}
function planter(b,x,z,simple){
 b.add(new THREE.CylinderGeometry(.62,.46,.18,12),'stone',x,.2,z);
 b.add(new THREE.CylinderGeometry(.86,.58,.53,simple?8:16,1,true),'stone',x,.53,z);
 const rim=new THREE.TorusGeometry(.85,.07,4,simple?12:20);rim.rotateX(Math.PI/2);b.add(rim,'stone',x,.8,z);
 b.add(new THREE.CylinderGeometry(.78,.78,.04,12),'soil',x,.71,z);
 for(let i=0;i<(simple?6:20);i++){const a=i*2.4,r=.65*Math.sqrt(i/(simple?6:20)),px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r;b.beam('leaf',[px,.73,pz],[px,.99,pz],.022);b.add(new THREE.IcosahedronGeometry(.13,0),i%3?'flower':'cream',px,1.01,pz);}
}
function forecourt(simple){
 const b=builder();for(const [i,x]of BARRICADE_X.entries()){
  // 중앙 보행 통로 1.1m 확보. 접지·GPX 진행선과 겹치지 않는다.
  const k=i%2?'orange':'yellow',z=BARRICADE_Z;b.box(k,x,.6,z,.64,1.1,.16);for(const s of [-1,1]){b.box(k,x+s*.29,.52,z,.08,1,.32);b.box(k,x+s*.27,.1,z,.26,.15,.7);}b.box('cream',x,.76,z+.09,.45,.12,.02);
 }
 for(const [x,z]of [[-4.1,3.2],[-5.2,6.2],[4.2,3.4]])planter(b,x,z,simple);
 return b.finish();
}
export function entranceFrame(route){const p=project(entranceConfig.gate.lat,entranceConfig.gate.lon);return {...p,y:route[0].y,yaw:-entranceConfig.startPoint.facingDeg*Math.PI/180};}
export function entranceLocal(route,x,z){const a=entranceFrame(route),dx=x-a.x,dz=z-a.z,c=Math.cos(a.yaw),s=Math.sin(a.yaw);return {x:c*dx-s*dz,z:s*dx+c*dz};}
// 포장·경계석·화단 자리와 그 둘레(나무 2.5m, 그 밖 0.6m)의 숲·바위·풀을 비운다. 입구 전용 나무(entranceSpecimen)는 그대로 둔다.
export function clearEntranceEntries(entries,route){
 const frame=entranceFrame(route),c=Math.cos(frame.yaw),s=Math.sin(frame.yaw);
 const hedgeAt=(q,m)=>HEDGES.some(h=>Math.abs(q.x-h.x)<h.depth/2+.6+m&&q.z>h.from-m&&q.z<h.to+m);
 return entries.map(e=>e.entranceSpecimen||e.keepAtEntrance?e:({...e,placements:e.placements.filter(p=>{const dx=p.x-frame.x,dz=p.z-frame.z,q={x:c*dx-s*dz,z:s*dx+c*dz},m=e.kind==='tree'?2.5:.6;return !plazaFootprint(q.x,q.z,m)&&!hedgeAt(q,m);})})).filter(e=>e.placements.length);
}
export function createEntrance(route,height){
 const a=entranceFrame(route),root=new THREE.Group(),lod=new THREE.LOD(),facilityLod=new THREE.LOD();root.name='입구 일주문·광장';root.userData.metricKind='입구 시설';lod.autoUpdate=facilityLod.autoUpdate=false;
 for(const simple of [false,true]){const g=new THREE.Group();g.add(gateModel(simple),forecourt(simple));lod.addLevel(g,simple?45:0,.1);}lod.addLevel(new THREE.Group(),150,.1);
 // 광장 시설·화단(entrance-plaza.js). 같은 일주문 좌표, 노면 높이 = 문 높이(광장 평탄화 범위 안).
 facilityLod.name='광장 시설';for(const simple of [false,true])facilityLod.addLevel(plazaFacilities(simple),simple?60:0,.1);facilityLod.addLevel(new THREE.Group(),170,.1);
 for(const l of [lod,facilityLod]){l.position.set(a.x,a.y,a.z);l.rotation.y=a.yaw;root.add(l);}
 // 바닥: 문 앞 아스팔트(흰 차선)·블록 보도·으뜸공원형 블록 광장·경계석. 지형 높이를 따라 2cm 띄운다.
 const ground=createPlazaGround(a,height);root.add(ground);
 const pick=(d,near,far)=>d<near?0:d<far?1:2;
 root.updateMatrixWorld(true);return {group:root,items:[lod,facilityLod],frame:a,ground,update(camera){const d=camera.position.distanceTo(lod.position);lod.levels.forEach((l,i)=>{l.object.visible=i===pick(d,45,150);});facilityLod.levels.forEach((l,i)=>{l.object.visible=i===pick(d,60,170);});ground.visible=d<220;}};
}
export {builder,roof,materials};

// 입구 양옆은 활엽수로 관찰됨. 기존 CC0 활엽 GLB·LOD를 공유하며 개체 수는 늘리지 않는다.
export function entranceBroadleafEntries(entries,route){
 const a=route[0];return entries.flatMap(e=>{
  if(e.kind!=='tree'||!e.id?.startsWith('pine_'))return [e];
  const near=[],far=[];for(const p of e.placements)(Math.hypot(p.x-a.x,p.z-a.z)<65?near:far).push(p);
  return [...(far.length?[{...e,placements:far}]:[]),...(near.length?[{...e,id:'tree_small_02',crossboard:null,impostor:null,placements:near,levels:[0,1,2].map(i=>({url:`tree_small_02-lod${i}.glb`,distance:[0,48,120][i]}))}]:[])];
 });
}

// 광장 지면을 수평으로 접합한다. 중심 GPX 고도는 유지하고 외곽 10m에서 원지형으로 복귀한다.
// 먼 쪽은 블록 광장 끝(41m)+경계석까지 평평하게 두고(42m) 그 뒤 10m에서 복귀한다.
export function createEntranceGround(route){
 const a=entranceFrame(route),c=Math.cos(a.yaw),s=Math.sin(a.yaw);
 return (x,z,base)=>{const dx=x-a.x,dz=z-a.z,lx=c*dx-s*dz,lz=s*dx+c*dz;
  const d=Math.max(Math.abs(lx)-13,-2-lz,lz-42,0),t=Math.min(1,d/10),w=1-t*t*(3-2*t);
  return base+(a.y-base)*w;
 };
}
