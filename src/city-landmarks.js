import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {CITY_TYPES,setFacadeAttributes} from './city-facade.js';

// 서울 랜드마크 3곳 전용 모델(산풍경). 높이·방위·거리는 산리서치 data/reference/landmarks.csv.
// 모양은 공개 사진을 보고 만든 근사다(평면 회전·세부 비례는 추정). 외관은 도시 공용 셰이더(창 줄·밤 불빛·대기색)를 쓴다.
const C=hex=>new THREE.Color(hex);

function attach(geometry,type,base,height,color,seed=.5,roof=color){
 const g=geometry.index?geometry.toNonIndexed():geometry;if(g!==geometry)geometry.dispose();
 if(!g.attributes.normal)g.computeVertexNormals();
 for(const name of Object.keys(g.attributes))if(!['position','normal'].includes(name))g.deleteAttribute(name);
 return setFacadeAttributes(g,{type,seed,base,height,color:C(color),roof:C(roof)});
}
function cylinder(r0,r1,y0,y1,segments,type,color,ground,seed){
 const g=new THREE.CylinderGeometry(r1,r0,y1-y0,segments,1).translate(0,(y0+y1)/2,0);
 return attach(g,type,ground+y0,y1-y0,color,seed);
}
function beacon(x,y,z,ground,size=1.6){
 return attach(new THREE.BoxGeometry(size,size,size).translate(x,y,z),CITY_TYPES.beacon,ground+y,size,0xff2a1a,.31);
}

// 63빌딩: 폭 약 50m·깊이 약 30m의 금빛 유리 판상 타워. 위쪽 22%가 양옆에서 비스듬히 좁아지고, 꼭대기에 274m 안테나.
export function building63(p){
 const H=p.height,W=p.width??50,D=p.depth??32,parts=[];
 const shape=new THREE.Shape([[-W/2,0],[W/2,0],[W/2,H*.78],[W*.18,H*.985],[-W*.18,H*.985],[-W/2,H*.78]].map(([x,y])=>new THREE.Vector2(x,y)));
 const body=new THREE.ExtrudeGeometry(shape,{depth:D,bevelEnabled:false}).translate(0,0,-D/2);
 parts.push(attach(body,CITY_TYPES.goldGlass,p.ground,H,0xc8a557,.63));
 // 옥상 기계층(어두운 띠)과 안테나·항공장애등.
 parts.push(attach(new THREE.BoxGeometry(W*.34,H*.015,D*.7).translate(0,H*.9925,0),CITY_TYPES.equipment,p.ground+H*.985,H*.015,0x6f6a60));
 parts.push(cylinder(.9,.35,H,274-0,6,CITY_TYPES.equipment,0xd8d8d2,p.ground,.2));
 parts.push(beacon(0,274,0,p.ground,1.4));
 // 저층부(아래 4층) 짙은 유리 기단.
 parts.push(attach(new THREE.BoxGeometry(W*1.25,14,D*1.6).translate(0,7,0),CITY_TYPES.office,p.ground,14,0x6f7478,.2));
 return {parts,rotation:p.rotation??.25};
}

// 롯데월드타워: 둥근 모서리 정사각 평면이 위로 갈수록 곡선으로 좁아지고, 각 면 가운데에 세로 이음선(골)이 있다.
// 꼭대기 약 1/8은 격자 왕관(밤에 밝게 켜짐).
export function lotteTower(p){
 const H=p.height,base=p.halfWidth??36,rings=40,around=64,positions=[],index=[];
 const halfAt=t=>base*(1-.74*Math.pow(t,1.55));
 const radius=(theta,hw)=>{const c=Math.abs(Math.cos(theta)),s=Math.abs(Math.sin(theta)),n=5;let r=hw/Math.pow(Math.pow(c,n)+Math.pow(s,n),1/n);
  const d=Math.abs(((theta%(Math.PI/2))+Math.PI/2)%(Math.PI/2)-0);const face=Math.min(d,Math.PI/2-d);return r*(1-.045*Math.exp(-Math.pow(face/.05,2)));};
 const crown=.875;
 for(let i=0;i<=rings;i++){const t=Math.pow(i/rings,.85)*crown,hw=halfAt(t);for(let j=0;j<around;j++){const th=j/around*Math.PI*2,r=radius(th,hw);positions.push(Math.cos(th)*r,t*H,Math.sin(th)*r);}}
 for(let i=0;i<rings;i++)for(let j=0;j<around;j++){const a=i*around+j,b=i*around+(j+1)%around,c=a+around,d=b+around;index.push(a,c,b,b,c,d);}
 const body=new THREE.BufferGeometry();body.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));body.setIndex(index);body.computeVertexNormals();
 const parts=[attach(body,CITY_TYPES.silverGlass,p.ground,H*crown,0xb7c3c8,.41)];
 // 왕관: 네 갈래로 갈라져 올라가는 격자. 각 면 가운데 골을 따라 벌어진 네 조각으로 근사한다.
 const hw0=halfAt(crown);
 for(let k=0;k<4;k++){
  const th=k*Math.PI/2+Math.PI/4,shape=new THREE.Shape([[-hw0*.62,0],[hw0*.62,0],[hw0*.05,H*(1-crown)],[-hw0*.05,H*(1-crown)]].map(([x,y])=>new THREE.Vector2(x,y)));
  const g=new THREE.ExtrudeGeometry(shape,{depth:hw0*.5,bevelEnabled:false}).translate(0,0,-hw0*.25).rotateY(-th+Math.PI/2).translate(Math.cos(th)*hw0*.62,H*crown,Math.sin(th)*hw0*.62);
  // 왕관 조각을 중심 쪽으로 기울여 끝이 모이게 한다.
  const pos=g.attributes.position;for(let i=0;i<pos.count;i++){const y=pos.getY(i),f=(y-H*crown)/(H*(1-crown));pos.setX(i,pos.getX(i)*(1-f*.72));pos.setZ(i,pos.getZ(i)*(1-f*.72));}
  g.computeVertexNormals();parts.push(attach(g,CITY_TYPES.deckGlass,p.ground+H*crown,H*(1-crown),0xd3dade,.77));
 }
 parts.push(beacon(0,H-.5,0,p.ground,1.8));
 // 기단 쇼핑몰(롯데월드몰) 일부. OSM 저층 건물과 겹치지 않게 낮게 둔다.
 return {parts,rotation:p.rotation??.33};
}

// N서울타워: 남산 정상(해발 243m)의 흰 콘크리트 기둥, 4층 전망대, 빨강·흰 띠의 송신 철탑. 전체 236.7m.
export function namsanTower(p){
 const H=p.height,g=p.ground,parts=[];
 parts.push(cylinder(12,11,0,9,16,CITY_TYPES.concrete,0xd9d6cf,g,.1));
 parts.push(cylinder(5.2,4.0,9,104,12,CITY_TYPES.concrete,0xe6e3dc,g,.12));
 parts.push(cylinder(9.5,13.5,104,109,24,CITY_TYPES.concrete,0xdedad2,g,.14));
 parts.push(cylinder(13.5,15.5,109,116,24,CITY_TYPES.deckGlass,0x8e9aa2,g,.52));
 parts.push(cylinder(15.5,15,116,122,24,CITY_TYPES.deckGlass,0x8a969e,g,.57));
 parts.push(cylinder(14.5,12,122,127,24,CITY_TYPES.deckGlass,0x929ea5,g,.61));
 parts.push(cylinder(11,6,127,131,20,CITY_TYPES.concrete,0xd4d0c7,g,.15));
 parts.push(cylinder(3.2,2.6,131,141,10,CITY_TYPES.concrete,0xd8d4cc,g,.16));
 // 송신 철탑: 10m 마다 빨강·흰 띠.
 const top=H,steps=Math.ceil((top-141)/10);
 for(let i=0;i<steps;i++){const y0=141+i*(top-141)/steps,y1=141+(i+1)*(top-141)/steps,t0=(y0-141)/(top-141),t1=(y1-141)/(top-141);
  parts.push(cylinder(1.9-1.4*t0,1.9-1.4*t1,y0,y1,8,CITY_TYPES.equipment,i%2?0xf0eeea:0xc8352b,g,.18));}
 parts.push(beacon(0,top+.6,0,g,1.4),beacon(0,131.5,13,g,1.2),beacon(0,131.5,-13,g,1.2));
 return {parts,rotation:0};
}

const BUILDERS={box:building63,taper:lotteTower,tower:namsanTower};
// 랜드마크 하나 → 단일 Mesh(제출 1회). 위치는 기존 createSeoulLandmark와 같은 그룹 원점(p.x,p.ground,p.z) 기준이 아니라
// 셰이더가 밑동 높이(월드 y)를 쓰므로 월드 좌표로 굽는다.
export function landmarkGeometry(p){
 const build=BUILDERS[p.shape];if(!build)return null;
 const {parts,rotation}=build(p),m=new THREE.Matrix4().makeRotationY(rotation).setPosition(p.x,p.ground,p.z);
 for(const part of parts)part.applyMatrix4(m);
 const merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
 if(!merged)throw new Error(`${p.name} 모델 병합 실패`);
 // 셰이더 밑동(seoulInfo.y)은 부품 기준 지면 높이 그대로다(월드 y = 원래 y + ground).
 merged.computeBoundingSphere();merged.computeBoundingBox();return merged;
}
