// 카툰 모드 전용 등산객 「동동이」: 키 1.0m·2.1등신 꼬마 등산객(대표 선택 시안 ①, src/toon/mascot-concepts.js의 dongdong()).
// 큰 머리(반지름 0.25m)·목 없음·큰 눈·볼터치·벙거지·빨간 목도리·주황 바람막이·남색 바지·갈색 등산화·빨간 벙어리장갑·돗자리 얹은 청록 큰 배낭.
// 뼈대는 카툰용 Hiker.glb의 Mixamo 뼈대를 복제해 뼈 길이만 동동이 비율로 줄여 쓰고(BONE_SCALE·HIPS_SCALE),
// 서기·걷기·뛰기·계단·바위 동작은 짧은 다리에 맞춰 여기서 만든다(한 걸음에 한 번 통통 튀는 걸음).
// 결과는 glTF와 같은 {scene,animations}라 createRealisticHiker(앉기·쌍안경·휴대폰·스틱·IK·접지)를 그대로 쓴다.
// 파일 이름은 이전 링크 비율 캐릭터 때 그대로 둔다(main.js·multi-client.js가 이 경로를 읽는다).
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {legTargets} from '../hiker-ik.js';
import {createRealisticHiker} from '../realistic-hiker.js';

const {Vector3,Quaternion,Color}=THREE;
// 시안 치수(m, 발바닥 0 기준). 머리는 반지름 0.25m 타원체(가운데 0.73m), 큰 눈은 얼굴(턱~정수리) 높이의 42% 자리.
export const DONGDONG=Object.freeze({height:1.0,headRatio:2.1,headCenter:.73,headRadius:Object.freeze([.25,.225,.23]),eyeAt:.42,hip:.2,shoulder:.45,crotch:.16});
// 걷기 속도(평지 0.72m×1.9걸음/s≈1.37m/s)는 그대로 두고 보폭만 짧은 다리(엉덩이 관절 0.2m)에 맞춘다:
// 걷기 0.22m → 6.2걸음/s(한 주기 0.32초), 뛰기(걷기의 1.55배 ≈2.1m/s, 7.6km/h) 0.30m → 7걸음/s(한 주기 0.29초).
// 계단은 보폭 배율 1: 한 걸음(0.35m, 디딤판 0.30m·높이 0.18m)이 계단 한 칸이라 한 칸에 한 발씩 통통 뛰어오른다.
export const TOON_STRIDE=Object.freeze({walk:.22/.72,run:.30/.72,stairs:1});
export const TOON_RUN_SPEED=1.55; // 평지 1.37m/s×1.55≈2.1m/s≈7.6km/h
// 뼈 길이 배율(부모 기준 오프셋). 원본 등산객(1.7m 사람 비율) → 동동이.
// 엉덩이 관절 0.198m·무릎 0.133m·발목 0.071m, 어깨 관절 0.443m(너비 ±0.14m), 목 0.485m·머리 뼈 0.505m.
// 팔은 시안(어깨~장갑 가운데 0.25m)보다 조금 길게(위팔 0.115m·아래팔 0.11m) 두어 쌍안경·차 컵을 얼굴 앞까지 들 수 있게 한다.
const BONE_SCALE={UpLeg:.7,Leg:.153,Foot:.152,ToeBase:.49,Spine:.5,Spine1:.5,Spine2:.5,Neck:.5,Head:.5,Shoulder:.683,Arm:.82,ForeArm:.458,Hand:.435,finger:.42};
const HIPS_SCALE=.2455; // 골반 높이 0.949 → 0.233m
const LINE_COLOR='#2e2420',LINE_WIDTH=.0062;
const PALETTE={jacket:'#f08a3c',zip:'#c9652a',skin:'#f7d9b8',hair:'#5a3a26',pants:'#3b4a7a',boot:'#8d5c35',sole:'#3a2a20',pack:'#2fa39a',packDark:'#23827a',mat:'#f2c14e',hat:'#c9b07a',band:'#d9473e',scarf:'#d9473e',mitten:'#e5484d',blush:'#f3a08f',mouth:'#8a3f33',eye:'#2a2321',white:'#ffffff',strap:'#2b3a40'};

const boneScale=name=>{
 const n=name.replace('mixamorig','').replace(/^(Left|Right)/,'');
 if(/^Hand(Thumb|Index|Middle|Ring|Pinky)/.test(n))return BONE_SCALE.finger;
 return BONE_SCALE[n]??1;
};

// ── 형상 모으기: 조각마다 색과 뼈 가중치를 붙여 SkinnedMesh 하나로 합친다(그리기 호출을 줄인다).
class Parts{
 constructor(boneIndex){this.boneIndex=boneIndex;this.pos=[];this.nor=[];this.col=[];this.si=[];this.sw=[];this.idx=[];this.line=[];}
 // line: 외곽선 두께 배율(얼굴 부품은 0)
 add(geometry,color,weights,line=1){
  const g=geometry;
  if(!g.attributes.normal)g.computeVertexNormals();
  const p=g.attributes.position,n=g.attributes.normal,base=this.pos.length/3,V=new Vector3(),c=new Color();
  for(let i=0;i<p.count;i++){
   V.fromBufferAttribute(p,i);this.pos.push(V.x,V.y,V.z);this.line.push(line);this.nor.push(n.getX(i),n.getY(i),n.getZ(i));
   c.set(typeof color==='function'?color(V,i):color);this.col.push(c.r,c.g,c.b);
   const w=(typeof weights==='function'?weights(V):weights).filter(([,x])=>x>1e-4).sort((a,b)=>b[1]-a[1]).slice(0,4),sum=w.reduce((s,[,x])=>s+x,0)||1;
   for(let k=0;k<4;k++){const e=w[k];this.si.push(e?this.boneIndex(e[0]):0);this.sw.push(e?e[1]/sum:0);}
  }
  if(g.index)for(let i=0;i<g.index.count;i++)this.idx.push(base+g.index.getX(i));else for(let i=0;i<p.count;i++)this.idx.push(base+i);
  geometry.dispose();
 }
 geometry(){
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(this.pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.nor,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(this.col,3));g.setAttribute('outline',new THREE.Float32BufferAttribute(this.line,1));
  g.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(this.si,4));g.setAttribute('skinWeight',new THREE.Float32BufferAttribute(this.sw,4));
  g.setIndex(this.idx);g.computeBoundingBox();g.computeBoundingSphere();return g;
 }
}
const smooth=(a,b,x)=>{const t=THREE.MathUtils.clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
// 이음매 없는 매끈한 법선(시안과 같은 방식: uv·법선을 지우고 꼭짓점을 합친 뒤 다시 구한다)
const smoothGeo=g=>{g.deleteAttribute('uv');g.deleteAttribute('normal');g=mergeVertices(g);g.computeVertexNormals();return g;};
// 가운데가 center, 반지름 radii인 타원체. q로 돌린다. shape는 단위 구 꼭짓점을 먼저 바꾼다.
function ellipsoid(center,radii,{q=null,w=24,h=16,shape=null}={}){
 const g=new THREE.SphereGeometry(1,w,h),p=g.attributes.position,V=new Vector3();
 for(let i=0;i<p.count;i++){V.fromBufferAttribute(p,i);if(shape)shape(V);V.multiply(radii);if(q)V.applyQuaternion(q);V.add(center);p.setXYZ(i,V.x,V.y,V.z);}
 return smoothGeo(g);
}
// 상자처럼 각진 타원체(배낭)
const boxy=(px=.5,pz=.7)=>V=>{V.x=Math.sign(V.x)*Math.abs(V.x)**px;V.y=Math.sign(V.y)*Math.abs(V.y)**px;V.z=Math.sign(V.z)*Math.abs(V.z)**pz;};
// a→b 원뿔대(끝 반지름 r0·r1). 끝은 열어 두고 관절 구로 덮는다.
function tube(a,b,r0,r1,{radial=14,rings=3}={}){
 const d=b.clone().sub(a),len=d.length(),g=new THREE.CylinderGeometry(r1,r0,len,radial,rings,true);
 g.translate(0,len/2,0);g.applyQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),d.normalize()));g.translate(a.x,a.y,a.z);return g;
}
const noodle=(pts,r)=>smoothGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),16,r,8,false));
// 타원체(가운데 c, 반지름 r) 표면 위 yaw·pitch 자리. 붙일 형상의 +Z가 겉면 법선을 보고 위쪽이 화면 위를 본다(시안 surf와 같다).
export function surfaceFrame(c,r,yaw,pitch,{lift=0,roll=0}={}){
 const d=new Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
 const p=c.clone().add(d.clone().multiply(r)),n=new Vector3(d.x/r.x,d.y/r.y,d.z/r.z).normalize();
 const q=new Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new Vector3(),n.clone().negate(),new Vector3(0,1,0)));
 if(roll)q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0,0,1),roll));
 return {q,p:p.addScaledVector(n,lift)};
}
const place=(g,{q,p})=>{g.applyQuaternion(q);g.translate(p.x,p.y,p.z);return g;};
// 웃는 입(아래로 둥근 호)
const smile=(rad,tube,arc=Math.PI*.8)=>{const g=new THREE.TorusGeometry(rad,tube,6,18,arc);g.rotateZ(-Math.PI/2-arc/2);g.translate(0,rad*.5,0);return g;};

const on=name=>[[name,1]];

export function buildToonHikerGltf(base){
 const src=base.scene;src.updateMatrixWorld(true);
 const hips0=src.getObjectByName('mixamorigHips'),rig0=hips0.parent;
 const scene=new THREE.Group();scene.name='ToonHiker';
 const rig=new THREE.Object3D();rig.name='ToonHikerRig';rig.position.copy(rig0.position);rig.quaternion.copy(rig0.quaternion);rig.scale.copy(rig0.scale);
 const hips=hips0.clone(true);rig.add(hips);scene.add(rig);
 const bones=[],byName=new Map();hips.traverse(o=>{if(o.isBone){bones.push(o);byName.set(o.name,o);}});
 // 1) 뼈 길이를 동동이 비율로
 for(const b of bones){if(b===hips)b.position.multiplyScalar(HIPS_SCALE);else b.position.multiplyScalar(boneScale(b.name));}
 const restQ=new Map(bones.map(b=>[b,b.quaternion.clone()])),restP=new Map(bones.map(b=>[b,b.position.clone()]));
 scene.updateMatrixWorld(true);
 const B=n=>byName.get('mixamorig'+n),W=n=>B(n).getWorldPosition(new Vector3());
 const boneIndex=n=>{const i=bones.indexOf(B(n));if(i<0)throw new Error(`뼈 없음: ${n}`);return i;};

 // 2) 몸(바람막이·목도리·배낭·팔·장갑·바지)·머리(얼굴·머리카락·벙거지)·등산화. 바인드 자세 = 지금 뼈 자세(앞 +Z, 왼쪽 +X). 좌표는 시안과 같다.
 const body=new Parts(boneIndex),head=new Parts(boneIndex),boots=new Parts(boneIndex),hat=new Parts(boneIndex),pack=new Parts(boneIndex),C=PALETTE,v=(x=0,y=0,z=0)=>new Vector3(x,y,z);
 const spineChain=['Hips','Spine','Spine1','Spine2'].map(n=>[n,W(n).y]);
 // 높이에 따라 골반~가슴 뼈 사이를 선형으로 나눈다(숙일 때 몸통이 부드럽게 휜다).
 const trunk=y=>{
  if(y>=spineChain[3][1])return [['Spine2',1]];
  for(let i=0;i<3;i++){const [a,ya]=spineChain[i],[b,yb]=spineChain[i+1];if(y<yb){const t=THREE.MathUtils.clamp((y-ya)/(yb-ya),0,1);return [[a,1-t],[b,t]];}}
  return [['Hips',1]];
 };
 // 몸통: 아래가 조금 퍼진 달걀형 바람막이(가운데 0.34m), 앞 지퍼, 빨간 목도리, 어깨끈
 body.add(ellipsoid(v(0,.34,0),v(.165,.18,.145),{w:28,h:20,shape:V=>{if(V.y<0){V.x*=1+.08*-V.y;V.z*=1+.05*-V.y;}}}),C.jacket,V=>trunk(V.y));
 body.add(ellipsoid(v(0,.34,.147),v(.012,.12,.012),{w:10,h:10}),C.zip,V=>trunk(V.y),0);
 body.add(smoothGeo(new THREE.TorusGeometry(.105,.04,10,24).rotateX(Math.PI/2).translate(0,.5,0)),C.scarf,[['Spine2',.6],['Neck',.4]]);
 for(const s of [-1,1])body.add(noodle([v(s*.09,.5,.11),v(s*.1,.4,.15),v(s*.1,.27,.14)],.016),C.strap,V=>trunk(V.y),.5);
 // 큰 배낭(등)과 앞주머니, 위에 얹은 돗자리
 {const packW=V=>{const t=smooth(.3,.45,V.y);return [['Spine1',1-t],['Spine2',t]];};
  // 배낭은 따로 'ToonHiker_Pack' 메시(즐길거리 벤치에서 내려놓을 때 숨기고 같은 모양 소품을 옆에 둔다)
  pack.add(ellipsoid(v(0,.38,-.2),v(.17,.19,.11),{w:20,h:16,shape:boxy(.55,.7)}),C.pack,packW);
  pack.add(ellipsoid(v(0,.31,-.31),v(.11,.08,.04),{w:14,h:10,shape:boxy(.6,.7)}),C.packDark,packW);
  pack.add(smoothGeo(new THREE.CapsuleGeometry(.056,.26,6,16).rotateZ(Math.PI/2).translate(0,.595,-.19)),C.mat,on('Spine2'));}
 // 팔: 바람막이 소매(어깨 공·위팔·팔꿈치·아래팔) → 빨간 벙어리장갑(엄지 따로)
 for(const side of ['Left','Right']){
  const arm=W(side+'Arm'),fore=W(side+'ForeArm'),hand=W(side+'Hand'),mid=W(side+'HandMiddle1'),thumb=W(side+'HandThumb1');
  body.add(ellipsoid(arm,v(.05,.05,.05),{w:14,h:10}),C.jacket,[[side+'Shoulder',.3],[side+'Arm',.7]]);
  body.add(tube(arm,fore,.047,.045),C.jacket,on(side+'Arm'));
  body.add(ellipsoid(fore,v(.045,.045,.045),{w:12,h:8}),C.jacket,[[side+'Arm',.5],[side+'ForeArm',.5]]);
  body.add(tube(fore,hand,.045,.042),C.jacket,on(side+'ForeArm'));
  const dir=mid.clone().sub(hand).normalize(),hq=new Quaternion().setFromUnitVectors(v(0,1,0),dir);
  body.add(ellipsoid(hand.clone().addScaledVector(dir,.03),v(.05,.058,.045),{q:hq,w:16,h:12}),C.mitten,on(side+'Hand'));
  body.add(ellipsoid(thumb.clone().lerp(hand,-.2).addScaledVector(dir,.01),v(.021,.03,.021),{q:hq,w:10,h:8}),C.mitten,on(side+'Hand'));
 }
 // 다리: 남색 바지(짧은 원통) → 갈색 등산화(따로 'Boots' 메시: 등산객 접지 코드가 이 꼭짓점 바닥으로 땅에 붙인다)
 for(const side of ['Left','Right']){
  const up=W(side+'UpLeg'),knee=W(side+'Leg'),ankle=W(side+'Foot');
  body.add(ellipsoid(up.clone().add(v(0,.04,0)),v(.055,.06,.055),{w:14,h:10}),C.pants,[['Hips',.5],[side+'UpLeg',.5]]);
  body.add(tube(up.clone().add(v(0,.04,0)),knee,.055,.055),C.pants,V=>{const t=smooth(knee.y+.02,knee.y-.01,V.y);return [[side+'UpLeg',1-t*.5],[side+'Leg',t*.5]];});
  body.add(ellipsoid(knee,v(.055,.055,.055),{w:14,h:10}),C.pants,[[side+'UpLeg',.5],[side+'Leg',.5]]);
  body.add(tube(knee,ankle.clone().add(v(0,.02,0)),.055,.054),C.pants,on(side+'Leg'));
  // 등산화: 앞이 둥글고 큰 신발(가운데 발목 앞 3cm·높이 5cm), 바닥 아래 띠는 짙은 밑창. 바닥은 평평(y=0).
  const toe=W(side+'ToeBase'),fwd=v(toe.x-ankle.x,0,toe.z-ankle.z).normalize(),fq=new Quaternion().setFromAxisAngle(v(0,1,0),Math.atan2(fwd.x,fwd.z));
  const bc=ankle.clone().addScaledVector(fwd,.033);bc.y=.05;
  boots.add(ellipsoid(bc,v(.072,.056,.1),{q:fq,w:24,h:16,shape:V=>{if(V.z>0)V.y*=1-.2*V.z;}}),V=>V.y<.013?C.sole:C.boot,on(side+'Foot'));
 }
 // 발바닥 평평하게: 0 아래 꼭짓점은 0으로
 for(let i=1;i<boots.pos.length;i+=3)if(boots.pos[i]<0)boots.pos[i]=0;

 // 머리: 머리 뼈(0.505m) 위 큰 타원체. 얼굴·귀·머리카락·벙거지는 'ToonHiker_Head' 메시로 두고 그림자를 받지 않는다(모자챙 그림자가 얼굴을 덮지 않게).
 const headB=W('Head'),hc=v(0,DONGDONG.headCenter,headB.z),hr=v(...DONGDONG.headRadius),H=on('Head');
 head.add(ellipsoid(hc,hr,{w:32,h:24,shape:V=>{if(V.y<0)V.x*=1-.08*V.y*V.y;}}),C.skin,H);
 for(const s of [-1,1])head.add(ellipsoid(hc.clone().add(v(s*.247,-.015,-.01)),v(.032,.048,.03),{w:12,h:10}),C.skin,H);
 // 머리카락: 뒤·옆을 덮고 이마는 벙거지가 덮는다. 머리선 아래 꼭짓점은 머리 안으로 넣는다.
 {const g=new THREE.SphereGeometry(1,28,20),p=g.attributes.position,V=v(),hl=z=>z>.3?.3:THREE.MathUtils.lerp(-.55,.3,Math.max(0,(z+.3)/.6));
  for(let i=0;i<p.count;i++){V.fromBufferAttribute(p,i);const k=V.y>hl(V.z)?1:.85;p.setXYZ(i,hc.x+V.x*.262*k,hc.y+.01+V.y*.238*k,hc.z-.012+V.z*.245*k);}
  head.add(smoothGeo(g),C.hair,H);
  for(const a of [-.35,0,.35])head.add(place(ellipsoid(v(),v(.07,.05,.03)),surfaceFrame(hc,hr,a,.62,{lift:-.01,roll:-a*.6})),C.hair,H);}
 // 큰 눈(짙은 타원 + 하이라이트 둘), 볼터치, 작은 웃는 입. 얼굴 부품은 외곽선을 긋지 않는다.
 const EYE={yaw:.32,pitch:-.16,size:v(.036,.05,.016)},eyeFrames=[-1,1].map(s=>surfaceFrame(hc,hr,s*EYE.yaw,EYE.pitch,{lift:-EYE.size.z*.3}));
 for(const f of eyeFrames){const s=EYE.size;
  head.add(place(ellipsoid(v(),s,{w:16,h:12}),f),C.eye,H,0);
  head.add(place(ellipsoid(v(-s.x*.3,s.y*.38,s.z*.75),v(s.x*.36,s.y*.3,s.z*.5),{w:10,h:8}),f),C.white,H,0);
  head.add(place(ellipsoid(v(s.x*.32,-s.y*.4,s.z*.75),v(s.x*.17,s.y*.14,s.z*.5),{w:8,h:6}),f),C.white,H,0);}
 for(const s of [-1,1])head.add(place(ellipsoid(v(),v(.042,.022,.01),{w:16,h:12}),surfaceFrame(hc,hr,s*.56,-.33,{lift:-.003})),C.blush,H,0);
 const mouthFrame=surfaceFrame(hc,hr,0,-.36,{lift:.002});head.add(place(smile(.017,.0045),mouthFrame),C.mouth,H,0);
 // 벙거지: 머리 위(머리 뼈 기준 시안 자리)에 뒤로 살짝 젖혀 쓴다. 띠는 빨강. 따로 'ToonHiker_Hat' 메시(거꾸리·에어건에서 모자가 떨어지고 날아간다).
 {const hq=new Quaternion().setFromAxisAngle(v(1,0,0),-.1),ho=v(0,hc.y+.14,hc.z),put=g=>{g.applyQuaternion(hq);g.translate(ho.x,ho.y,ho.z);return g;};
  hat.add(put(smoothGeo(new THREE.CylinderGeometry(.2,.236,.13,32,1,true).translate(0,.065,0))),C.hat,H);
  hat.add(put(ellipsoid(v(0,.13,0),v(.2,.04,.2),{w:28,h:12})),C.hat,H);
  hat.add(put(new THREE.CylinderGeometry(.239,.239,.035,32,1,true).translate(0,.025,0)),C.band,H,.6);
  const g=new THREE.CylinderGeometry(.34,.34,.022,40,1,false),p=g.attributes.position;for(let i=0;i<p.count;i++){const r=Math.hypot(p.getX(i),p.getZ(i));if(r>.2)p.setY(i,p.getY(i)-(r-.2)*.38);}
  hat.add(put(smoothGeo(g)),C.hat,H);}

 const skeleton=new THREE.Skeleton(bones);
 const material=(name)=>new THREE.MeshStandardMaterial({name,vertexColors:true,roughness:.85,metalness:0});
 const bodyMesh=new THREE.SkinnedMesh(body.geometry(),material('toon_hiker_body'));bodyMesh.name='ToonHiker_Body';
 const headMesh=new THREE.SkinnedMesh(head.geometry(),material('toon_hiker_head'));headMesh.name='ToonHiker_Head';headMesh.userData.noReceiveShadow=true;
 const bootMesh=new THREE.SkinnedMesh(boots.geometry(),material('toon_hiker_boots'));bootMesh.name='ToonHiker_boots';
 const hatMesh=new THREE.SkinnedMesh(hat.geometry(),material('toon_hiker_hat'));hatMesh.name='ToonHiker_Hat';hatMesh.userData.noReceiveShadow=true;
 const packMesh=new THREE.SkinnedMesh(pack.geometry(),material('toon_hiker_pack'));packMesh.name='ToonHiker_Pack';
 for(const m of [bodyMesh,headMesh,bootMesh,hatMesh,packMesh]){scene.add(m);m.bind(skeleton,new THREE.Matrix4());}
 // 외곽선: 카툰 화면의 낮 외곽선은 꺼져 있어(palette outline.strength.day=0) 캐릭터만 뒤집은 껍질로 얇은 선을 긋는다.
 // 같은 형상·뼈대를 쓰고 바인드 공간 법선 방향으로 밀어낸 뒷면만 그린다. MeshToonMaterial이라 toonify가 바꾸지 않는다.
 const line=new THREE.MeshToonMaterial({name:'toon_hiker_outline',color:LINE_COLOR,side:THREE.BackSide});
 line.onBeforeCompile=sh=>{sh.uniforms.lineWidth={value:LINE_WIDTH};sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float outline;uniform float lineWidth;').replace('#include <begin_vertex>','#include <begin_vertex>\ntransformed+=normalize(normal)*lineWidth*outline;');};
 line.customProgramCacheKey=()=>'toon-hiker-outline-v1';
 for(const [m,name] of [[bodyMesh,'ToonHiker_lineA'],[headMesh,'ToonHiker_lineH'],[bootMesh,'ToonHiker_lineB'],[hatMesh,'ToonHiker_lineHat'],[packMesh,'ToonHiker_linePack']]){const o=new THREE.SkinnedMesh(m.geometry,line);o.name=name;o.userData.outline=true;o.userData.outlineOf=m.name;scene.add(o);o.bind(skeleton,new THREE.Matrix4());}

 // 3) 동작: 서기·걷기·뛰기·계단·바위를 모두 여기서 만든다(원본 사람 동작은 다리가 짧은 몸에 맞지 않는다).
 const pose=createPoser({bones,restQ,restP,B,W,scene});
 const geometry={heel:-.04,ball:.07,ankle:W('LeftFoot').y};
 const clips=[lookClip(pose,geometry),...['Walk','Run','Stairs','Rock'].map(n=>gaitClip(n,pose,GAIT_SHAPE[n.toLowerCase()],geometry))];
 pose.reset();
 // 바인드 자세(뼈 로컬 회전·위치). 즐길거리 동작(src/toon/hiker-acts.js)이 이 자세에서 출발해 몸짓을 만든다.
 scene.userData.restPose=Object.fromEntries(bones.map(b=>[b.name,{q:b.quaternion.toArray(),p:b.position.toArray()}]));
 // 머리 뼈 기준 얼굴 자리(눈 둘·입·볼, 바인드 모델 공간 m). 눈 감기·볼 빨개짐·입가 초콜릿을 붙인다.
 scene.userData.face={hc:hc.toArray(),hr:hr.toArray(),eyes:eyeFrames.map(f=>({p:f.p.toArray(),q:f.q.toArray()})),eye:EYE.size.toArray(),mouth:{p:mouthFrame.p.toArray(),q:mouthFrame.q.toArray()}};
 // 4) 등산객 코드가 쓰는 치수(머리 뼈 기준 눈·입, 가슴 높이, 앉은 자세, 쌍안경·휴대폰 자리)
 const headBone=B('Head');scene.updateMatrixWorld(true);
 const eyeMid=eyeFrames[0].p.clone().add(eyeFrames[1].p).multiplyScalar(.5);
 const eyeLocal=headBone.worldToLocal(eyeMid.clone()),mouthLocal=headBone.worldToLocal(mouthFrame.p.clone().add(v(0,0,-.01)));
 const hipsY=W('Hips').y,seatHip=.09;
 scene.userData.hikerProfile={kind:'toon',height:DONGDONG.height,chestY:.4,chestFront:null,chestMesh:'ToonHiker_Body',eyeLocal:eyeLocal.toArray(),mouthLocal:mouthLocal.toArray(),
  eyeHeight:{stand:+eyeMid.y.toFixed(3),sit:+(eyeMid.y-hipsY+seatHip).toFixed(3)},
  animSteps:{walk:GAIT_SHAPE.walk.step,run:GAIT_SHAPE.run.step,climb:GAIT_SHAPE.stairs.step},gaitStance:{walk:GAIT_SHAPE.walk.stance,run:GAIT_SHAPE.run.stance,climb:GAIT_SHAPE.stairs.stance},stairHop:{lead:GAIT_SHAPE.stairs.step*GAIT_SHAPE.stairs.stance,boot:.033},runStride:1,strideScale:{...TOON_STRIDE},runSpeed:TOON_RUN_SPEED,
  // 앉기: 엉덩이를 땅에 붙이고 다리를 앞으로 쭉 뻗는다(아기처럼). 컵·보온병은 오른쪽 가까이, 스틱은 배낭 왼쪽에 기댄다.
  seat:{hipAbove:seatHip,footX:.085,footZ:-.16,cupRest:[.2,-.1],flask:[.27,-.2],cupChest:[.05,.2,-.2],poles:[{tip:[-.3,.26],lean:[-.2,.36,.2]},{tip:[-.34,.18],lean:[-.22,.36,.15]}]},
  stance:{footHalf:.075,poleX:.2,poleForward:.1},poleStep:{forward:.12,lift:.07},poleLength:.62,
  arm:TOON_ARM,moveSlack:.01,binoLean:4,standSlack:.003,cameraScale:.62,
  // 작은 카툰 쌍안경(hiker-gadgets.js TOON_BINOCULARS_SIZE)은 두 눈 사이 눈높이(binoUp)에서 접안 컵이 얼굴에 닿게(binoEye) 든다.
  // 머리가 커서 얼굴이 어깨보다 한참 앞이다: 쌍안경은 눈 가까이, 휴대폰은 턱 아래 가슴 앞에 들고, 쇄골을 들어 올리고 내밀어 짧은 팔이 닿게 한다.
  gadget:{binoEye:.061,binoUp:.016,binoTorso:[.85,.3],binoShrugUp:70,binoShrugSide:30,binoStyle:'toon',binoDepth:.024,phoneForward:.1,phoneDown:.15,shrug:30,protract:28},
  // 셀카: 팔이 짧아 셀카봉을 뻗는다(상체를 덜 비틀고 오른 어깨를 들어 올린다). 왼손은 뺨 옆에서 흔든다.
  selfieStick:true,selfie:{forward:.75,up:.06,right:.12,twist:THREE.MathUtils.degToRad(10),protract:THREE.MathUtils.degToRad(15),shrug:THREE.MathUtils.degToRad(25),vSide:.27,vFront:-.1,vDrop:.14}};
 return {scene,animations:clips};
}

// 팔 흔들기(루트 기준, linkArmPose 설정). 짧은 팔을 몸통(배) 밖으로 벌리고, 걸을 때는 시안처럼 크게 앞뒤로 흔든다.
// 서기: 팔이 시안보다 3cm 길어(쌍안경·컵을 얼굴까지 들기 위해) 곧게 내리면 장갑이 시안보다 5cm 낮다. 위팔을 조금 뒤로 두고 팔꿈치를 굽혀
// 장갑 가운데를 시안 자리(높이 0.25m·바깥 0.21m, 엉덩이 옆)에 맞춘다. 앞에서 보면 곧은 팔처럼 보이고 옆에서 보면 팔꿈치가 살짝 뒤로 굽는다.
export const TOON_ARM=Object.freeze({upper:.115,fore:.11,
 stand:{mid:-22,amp:0,elbow:72,elbowAmp:0,out:17,inward:0},
 walk:{mid:4,amp:30,elbow:20,elbowAmp:8,out:15,inward:0},
 run:{mid:2,amp:42,elbow:70,elbowAmp:10,out:22,inward:10}});
// 걷기·뛰기·계단·바위 모양(앞 +Z 기준, m·도). step: 이 클립의 한 걸음 길이. stance: 한 발이 땅에 있는 비율.
// 다리(엉덩이 관절~발목 0.127m)가 짧아 디딤 비율을 줄이고 걸음마다 몸을 크게 통통 튀긴다(bob). 뛰기는 공중 구간이 길다.
export const GAIT_SHAPE=Object.freeze({
 walk:{step:.22,stance:.42,strike:10,toeOff:22,lift:.045,kick:0,lean:5,headBack:2,shift:.03,yaw:7,roll:5,bob:.018,crouch:.004,twist:1.1,lowAt:'double'},
 run:{step:.30,stance:.26,reach:.03,back:.03,strike:5,toeOff:30,lift:.05,kick:.06,lean:13,headBack:6,shift:0,yaw:9,roll:4,bob:.022,crouch:.01,twist:1.2,lowAt:'mid'},
 // 계단: 한 걸음 0.35m(디딤판 0.30m·높이 0.18m) = 한 칸. 다리(0.13m)로는 두 칸에 두 발을 함께 디딜 수 없어, 한 발로 디디고 통통 뛰어 다음 칸에 다른 발을 딛는다(뛰기처럼 공중 구간).
 // 디딤 비율 0.24: 디디는 동안 발이 몸 아래 ±8cm만 움직여 다리가 닿는다. 디딜 때 낮아지고 뜰 때 높아진다(bob, lowAt 'mid').
 stairs:{step:.35,stance:.24,reach:.02,back:.02,strike:4,toeOff:20,lift:.04,kick:.02,lean:9,headBack:5,shift:0,yaw:5,roll:3,bob:.03,crouch:.01,twist:1,lowAt:'mid'},
 rock:{step:.2,stance:.5,strike:2,toeOff:10,lift:.095,kick:0,lean:22,headBack:14,shift:.02,yaw:4,roll:3,bob:.01,crouch:.02,twist:.8,lowAt:'double'},
});
function createPoser({bones,restQ,restP,B,W,scene}){
 const q1=new Quaternion(),q2=new Quaternion(),q3=new Quaternion();
 const turn=(b,axis,angle)=>{if(!angle)return;q1.setFromAxisAngle(axis,angle);b.getWorldQuaternion(q2);q2.premultiply(q1);b.parent.getWorldQuaternion(q3);b.quaternion.copy(q3.invert().multiply(q2));b.updateMatrixWorld(true);};
 const aim=(b,from,to)=>{q1.setFromUnitVectors(from.normalize(),to.normalize());b.getWorldQuaternion(q2);q2.premultiply(q1);b.parent.getWorldQuaternion(q3);b.quaternion.copy(q3.invert().multiply(q2));b.updateMatrixWorld(true);};
 const reset=()=>{for(const b of bones){b.quaternion.copy(restQ.get(b));b.position.copy(restP.get(b));}scene.updateMatrixWorld(true);};
 reset();
 const footRest=['Left','Right'].map(s=>B(s+'Foot').getWorldQuaternion(new Quaternion()));
 const hipJoint=['Left','Right'].map(s=>W(s+'UpLeg')),hipsY=W('Hips').y;
 const legLen=W('LeftUpLeg').distanceTo(W('LeftLeg'))+W('LeftLeg').distanceTo(W('LeftFoot'));
 return {bones,B,W,turn,aim,reset,footRest,hipJoint,hipsY,legLen,scene};
}
const X=new Vector3(1,0,0),Y=new Vector3(0,1,0),Z=new Vector3(0,0,1);
// 한 발의 위상 φ(0=뒤꿈치 착지)에서 발목 위치(엉덩이 관절 기준 앞뒤 z, 땅 위 y)와 발 들림각(+는 발끝 위).
function footAt(phi,S,g){
 const T=2*S.step*S.stance,front=T/2-S.shift; // 디딤 동안 뒤꿈치 닿은 점이 몸 기준으로 뒤로 T만큼 밀린다
 const a=g.ankle,heelArm={z:-g.heel,y:a},ballArm={z:-g.ball,y:a}; // 닿는 점 → 발목
 const rot=(arm,deg)=>{const r=THREE.MathUtils.degToRad(deg),c=Math.cos(r),s=Math.sin(r);return {z:arm.z*c-arm.y*s,y:arm.z*s+arm.y*c};}; // +deg: 발끝 위(뒤꿈치 기준 회전)
 const contactPose=(u)=>{ // 디딤 0~1
  const anchor=front-T*u;
  if(u<.14){const k=S.strike*(1-u/.14),p=rot(heelArm,k);return {z:anchor+p.z,y:p.y,pitch:k};}
  const roll=smooth(.62,1,u);if(roll<=0)return {z:anchor+heelArm.z,y:a,pitch:0};
  const pitch=-S.toeOff*roll,p=rot(ballArm,pitch); // 뒤꿈치가 들리면 앞꿈치(anchor+앞꿈치 거리)를 축으로 돈다
  return {z:anchor+g.ball-g.heel+p.z,y:p.y,pitch};
 };
 if(phi<S.stance)return contactPose(phi/S.stance);
 const u=(phi-S.stance)/(1-S.stance),off=contactPose(1),on=contactPose(0);
 const e=u*u*(3-2*u),ez=S.kick?smooth(.18,1,u):e;
 let z=THREE.MathUtils.lerp(off.z,on.z,ez),y=THREE.MathUtils.lerp(off.y,on.y,e)+S.lift*Math.sin(Math.PI*u);
 // 뛰기: 떼고 나서 뒤꿈치가 엉덩이 쪽으로 차오른다(뒤로 조금 더 갔다가 앞으로).
 if(S.kick){const k=Math.sin(Math.PI*Math.min(1,u/.7));y+=S.kick*k*k;z-=(S.back??.06)*Math.sin(Math.PI*Math.min(1,u/.5));
  // 무릎을 앞으로 끌어올려 발을 착지점보다 조금 더 내밀었다가 당겨 디딘다.
  const r=smooth(.45,.8,u)*(1-smooth(.85,1,u));z+=(S.reach??0)*r;y+=.02*r;}
 const pitch=S.kick?THREE.MathUtils.lerp(off.pitch,on.pitch,smooth(.55,1,u))-15*Math.sin(Math.PI*Math.min(1,u/.6)):THREE.MathUtils.lerp(off.pitch,on.pitch,e);
 return {z,y,pitch};
}
function gaitClip(name,P,S,g){
 const N=32,deg=THREE.MathUtils.degToRad;
 // 엉덩이 높이: 기본(살짝 굽힘) + 걸음마다 한 번 통통 튀기, 그리고 디딘 발에 다리가 닿도록 낮춘다. 그다음 주기 평균으로 부드럽게.
 const hipJ=P.hipJoint[0].y,reach=P.legLen*.985,raw=[];
 for(let i=0;i<N;i++){const t=i/N;let y=hipJ-S.crouch+(S.lowAt==='mid'?-S.bob*Math.cos(4*Math.PI*(t-S.stance/2)):S.bob*Math.cos(4*Math.PI*(t-S.stance/2)));
  for(const k of [0,1]){const f=footAt((t+k*.5)%1,S,g);if((t+k*.5)%1<S.stance)y=Math.min(y,f.y+Math.sqrt(Math.max(0,reach*reach-f.z*f.z)));}
  raw.push(y);}
 const hipY=raw.map((_,i)=>(raw[(i+N-1)%N]+2*raw[i]+raw[(i+1)%N])/4);
 return bakeClip(name,1,N,P,(t,i)=>{const yaw=-deg(S.yaw)*Math.cos(2*Math.PI*t);
  return {hipY:hipY[i%N],yaw,roll:deg(S.roll)*Math.sin(2*Math.PI*t),lean:deg(S.lean),twist:-yaw*S.twist,headBack:deg(S.headBack),headYaw:yaw*(S.twist-1)*.8,headRoll:-deg(S.roll)*.6*Math.sin(2*Math.PI*t-.5),feet:[0,1].map(k=>footAt((t+k*.5)%1,S,g))};});
}
// 서기(둘러보기): 곧게 서서 숨 쉬고(4초 주기) 고개를 천천히 좌우로 돌리며 살짝 갸웃한다(7.5초).
function lookClip(P,g){
 const N=60,D=7.5,deg=THREE.MathUtils.degToRad;
 // 선 자세는 무릎을 거의 편다(다리 길이의 99.5%): 엉덩이가 발목 위에 오고 무릎이 앞으로 나오지 않는다.
 const standY=g.ankle+Math.sqrt((P.legLen*.995)**2-.01**2)-.002;
 return bakeClip('Look',D,N,P,t=>{const sec=t*D,breath=Math.sin(2*Math.PI*sec/3.75);
  const look=Math.sin(2*Math.PI*t)*.8+Math.sin(4*Math.PI*t+.6)*.2;
  return {hipY:standY+breath*.0015,yaw:0,roll:0,lean:deg(1)+breath*deg(.8),twist:deg(5)*look,headBack:deg(1)-breath*deg(.6),headYaw:deg(24)*look,headRoll:deg(4)*Math.sin(2*Math.PI*t*2+1),feet:[{z:.005,y:g.ankle,pitch:0},{z:-.01,y:g.ankle,pitch:0}]};});
}
const POSED=['Hips','Spine','Spine1','Spine2','Neck','Head','LeftShoulder','RightShoulder','LeftUpLeg','LeftLeg','LeftFoot','RightUpLeg','RightLeg','RightFoot'];
// 프레임마다 바인드 자세에서 출발해 월드 축 회전을 쌓고(골반 → 상체 → 고개 → 다리 IK) 뼈 로컬 회전을 기록한다.
function bakeClip(name,duration,N,P,specAt){
 const tracks=new Map(),track=(b,kind)=>{const key=`${b.name}.${kind}`;if(!tracks.has(key))tracks.set(key,[]);return tracks.get(key);};
 const posed=POSED.map(P.B),hipJ=P.hipJoint[0].y,deg=THREE.MathUtils.degToRad;
 for(let i=0;i<=N;i++){
  const t=(i%N)/N,S=specAt(t,i);P.reset();
  const hips=P.B('Hips');
  // 골반: 높이·비틀기(내딛는 다리 쪽 엉덩이가 앞으로)·좌우 기울기(뒤뚱)
  const local=hips.parent.worldToLocal(hips.getWorldPosition(new Vector3()).add(new Vector3(0,S.hipY-hipJ,0)));hips.position.copy(local);hips.updateMatrixWorld(true);
  P.turn(hips,Y,S.yaw);P.turn(hips,Z,S.roll);P.turn(hips,X,S.lean*.3);
  // 상체: 앞으로 기울이고(골반 30%·허리 70%) 어깨는 골반과 반대로 비튼다. 고개는 덜 숙여 앞을 보고, 골반 기울기를 조금 되돌려 머리가 덜 흔들린다.
  for(const n of ['Spine','Spine1','Spine2']){const b=P.B(n);P.turn(b,X,S.lean*.7/3);P.turn(b,Y,S.twist/3);}
  P.turn(P.B('Neck'),X,-S.headBack*.4);P.turn(P.B('Head'),X,-S.headBack*.6);P.turn(P.B('Neck'),Y,S.headYaw*.4);P.turn(P.B('Head'),Y,S.headYaw*.6);
  if(S.headRoll)P.turn(P.B('Head'),Z,S.headRoll);
  // 다리: 발목 목표와 발 각도 → 두 관절 IK(무릎은 앞)
  ['Left','Right'].forEach((s,k)=>{const f=S.feet[k],up=P.B(s+'UpLeg'),knee=P.B(s+'Leg'),foot=P.B(s+'Foot');
   const A=up.getWorldPosition(new Vector3()),Kn=knee.getWorldPosition(new Vector3()),F=foot.getWorldPosition(new Vector3());
   const target=new Vector3(P.hipJoint[k].x*.95,f.y,P.hipJoint[k].z+f.z);
   const sol=legTargets(A,target,A.distanceTo(Kn),Kn.distanceTo(F),Z.clone());
   P.aim(up,Kn.clone().sub(A),sol.knee.clone().sub(A));
   const Kn2=knee.getWorldPosition(new Vector3()),F2=foot.getWorldPosition(new Vector3());P.aim(knee,F2.clone().sub(Kn2),sol.foot.clone().sub(Kn2));
   const fq=new Quaternion().setFromAxisAngle(X,-deg(f.pitch)).multiply(P.footRest[k]);foot.parent.getWorldQuaternion(q0);foot.quaternion.copy(q0.invert().multiply(fq));foot.updateMatrixWorld(true);});
  const time=i/N*duration;
  for(const b of posed){track(b,'quaternion').push([time,...b.quaternion.toArray()]);if(b===hips)track(b,'position').push([time,...b.position.toArray()]);}
 }
 const out=[];
 for(const [key,list] of tracks){const times=list.map(r=>r[0]),values=list.flatMap(r=>r.slice(1));
  out.push(key.endsWith('.position')?new THREE.VectorKeyframeTrack(key,times,values):new THREE.QuaternionKeyframeTrack(key,times,values));}
 return new THREE.AnimationClip(name,duration,out);
}
const q0=new Quaternion();

// 카툰 모드 등산객을 불러온다. 원본 GLB는 뼈대만 쓰고 메시·동작은 버린다.
export async function loadToonHiker(url,options){
 return createRealisticHiker(buildToonHikerGltf(await new GLTFLoader().loadAsync(url)),options);
}
// 함께 걷기(멀티) 아바타도 같은 몸을 쓴다.
export const prepareToonHikerGltf=base=>buildToonHikerGltf(base);
