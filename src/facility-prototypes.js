// 검토용 자체 형상. 실측·사진 매칭 전에는 기본 코스에 배치하지 않는다.
import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const FACILITY_PROVENANCE={status:'추정',coordinates:null,photo:null,source:'docs/실경자료-조사.md §5',unit:'m'};
const colors={wood:0x73523b,stone:0xaaa49b,metal:0x555d60,roof:0x42464a,wall:0xd5c7ab};

// 재질별 병합: 시설 한 개당 최대 5 draw calls, 외부 텍스처 없음.
function builder(){
 const buckets=new Map();
 function add(geometry,key,x,y,z,rx=0,ry=0,rz=0){
  geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1)));
  const list=buckets.get(key)||[];list.push(geometry);buckets.set(key,list);
 }
 const box=(key,x,y,z,w,h,d,rx=0,ry=0,rz=0)=>add(new THREE.BoxGeometry(w,h,d),key,x,y,z,rx,ry,rz);
 function beam(key,a,b,r=.04){
  const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
  const g=new THREE.CylinderGeometry(r,r,delta.length(),6);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()));
  const center=start.add(end).multiplyScalar(.5);add(g,key,center.x,center.y,center.z);
 }
 function finish(){
  const group=new THREE.Group();group.userData={...FACILITY_PROVENANCE};
  for(const [key,parts] of buckets){const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
   const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:colors[key],roughness:.9}));
   mesh.castShadow=false;mesh.receiveShadow=true;group.add(mesh);
  }return group;
 }
 return {add,box,beam,finish};
}

function building(b,{gate=false,simple=false}={}){
 const width=gate?7:5,depth=gate?2:4,height=gate?3.4:2.7;
 for(const x of [-width/2+.3,width/2-.3])for(const z of [-depth/2+.3,depth/2-.3])b.beam('wood',[x,0,z],[x,height,z],.14);
 if(!gate){b.box('stone',0,.15,0,width+.6,.3,depth+.6);b.box('wall',0,1.35,-depth/2+.15,width,2.4,.2);b.box('wall',0,1.35,0,.18,2.4,depth);}
 for(const side of [-1,1])b.box('roof',0,height+.5,side*(depth/4+.2),width+1,.16,depth/2+.8,side*.32);
 b.box('roof',0,height+.9,0,width+1,.22,.22);
 if(!simple)for(const x of [-width/2,width/2])b.box('wood',x,height-.15,0,.18,.28,depth+.7);
}

export const FACILITY_KINDS=['eungjinjeon','radar','transmitter','stairs','deck','gate','shelter','sign'];
export function createFacilityPrototype(kind,{simple=false,count=12,rise=.18,tread=.30,width=2.2}={}){
 if(!FACILITY_KINDS.includes(kind))throw new Error(`알 수 없는 시설: ${kind}`);
 if(!Number.isInteger(count)||count<1||count>64||![rise,tread,width].every(v=>Number.isFinite(v)&&v>0))throw new Error('시설 치수 범위 오류');
 const b=builder(),contacts=[];
 if(kind==='eungjinjeon'){
  // 절벽도 합성 받침 형상: 실제 암벽 윤곽으로 오인하지 않도록 메타데이터 유지.
  b.add(new THREE.CylinderGeometry(3.4,4.5,10,simple?5:9),'stone',0,-5,0);building(b,{simple});
 }else if(kind==='gate')building(b,{gate:true,simple});
 else if(kind==='radar'){
  b.box('wall',0,3,0,7,6,7);b.add(new THREE.SphereGeometry(4,simple?8:16,simple?6:12),'wall',0,9,0);
 }else if(kind==='transmitter'){
  const height=24;for(const x of [-1,1])for(const z of [-1,1])b.beam('metal',[x,0,z],[x*.3,height,z*.3],.08);
  for(let y=0;y<height;y+=simple?8:4){const a=1-.7*y/height,c=1-.7*Math.min(height,y+4)/height;b.beam('metal',[-a,y,a],[c,Math.min(height,y+4),c]);}
  b.beam('metal',[0,height,0],[0,height+4,0],.05);
 }else if(kind==='stairs'||kind==='deck'){
  const n=kind==='deck'?1:count,run=kind==='deck'?3:tread;
  for(let i=0;i<n;i++){
   const top=kind==='deck'?.25:(i+1)*rise,z=(i+.5)*run;
   b.box('wood',0,top-.06,z,width,.12,run);
   contacts.push({minX:-width/2,maxX:width/2,minZ:i*run,maxZ:(i+1)*run,y:top,material:kind==='deck'?'deck':'deck_stairs'});
  }
  const length=n*run,y0=contacts[0].y,y1=contacts[n-1].y;
  for(const side of [-1,1]){
   const x=side*width/2;
   for(let i=0;i<=n;i+=simple?4:2){const z=Math.min(i*run,length),y=contacts[Math.min(n-1,i)].y;b.beam('metal',[x,y,z],[x,y+1.05,z]);}
   b.beam('metal',[x,y0+1.05,0],[x,y1+1.05,length]);
   if(!simple)b.beam('wood',[x,y0+.55,0],[x,y1+.55,length],.018); // 검토용 로프
  }
 }else if(kind==='shelter'){
  b.box('wood',0,.45,0,2,.12,.5);for(const x of [-.8,.8])b.box('wood',x,.2,0,.12,.4,.4);
 }else if(kind==='sign'){
  b.beam('wood',[0,0,0],[0,2.2,0],.08);b.box('wood',0,1.9,0,1.1,.25,.06);
 }
 const group=b.finish();group.name=`추정-${kind}`;group.userData.contacts=contacts;
 group.userData.dimensions={count,rise,tread,width,status:'사진 미확보·설계 가정'};return group;
}

// 충돌은 시각 LOD와 독립. 로컬 좌표 입력, 범위 밖 null. 산개발 통합 전용.
export function facilityContact(contacts,x,z){
 let hit=null;for(const c of contacts)if(x>=c.minX&&x<=c.maxX&&z>=c.minZ&&z<c.maxZ&&(!hit||c.y>hit.y))hit=c;
 return hit;
}

export function createFacilityLod(kind,options={}){
 const lod=new THREE.LOD();lod.addLevel(createFacilityPrototype(kind,options),0);
 lod.addLevel(createFacilityPrototype(kind,{...options,simple:true}),40,.1);
 // 계단·데크는 근경 전용. 원경 랜드마크만 400m 이후에도 보존.
 if(!['eungjinjeon','radar','transmitter','gate'].includes(kind))lod.addLevel(new THREE.Group(),120,.1);
 lod.userData={...FACILITY_PROVENANCE,kind};return lod;
}
