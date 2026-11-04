import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {facilitySites} from './summit-config.js';

// 4차(실사진 대조 S1·S2): 응진전 붉은 벽·초록 난간·막돌 석축·붉은 등, 레이더 면 분할 돔·바위 무늬 원통 받침·격자 철탑.
// 사진은 비교용으로만 봤고 텍스처는 캔버스로 직접 그린다(사진 텍스처 없음).
const palette=[0xedece5,0x999488,0x454b50,0x8b4335,0x82221c,0x2f6a50,0xb4aea2,0xffffff,0xd3271d,0x8e9497,0xf1f1ec];
const RUBBLE=6,ROCK=7,LANTERN=8,STEEL=9,DOME=10,RED=4,GREEN=5;
// 캔버스 무늬. 브라우저 밖(테스트)에서는 null.
function painted(w,h,draw){
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;map.wrapS=map.wrapT=THREE.RepeatWrapping;map.anisotropy=4;return map;
}
const rnd=seed=>()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
// 막돌 석축: 줄눈 위에 크기가 다른 모난 돌. 한 장 = 2m×2m.
const rubbleMap=()=>painted(256,256,(g,w,h)=>{const r=rnd(7);g.fillStyle='#57524a';g.fillRect(0,0,w,h);
 for(let y=-8;y<h;y+=26+r()*8)for(let x=-10+r()*20;x<w;x+=30+r()*22){
  const sw=24+r()*20,sh=18+r()*10,tone=110+r()*60|0;g.fillStyle=`rgb(${tone+6},${tone+4},${tone})`;g.beginPath();
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2+r()*.5;g.lineTo(x+sw/2+Math.cos(a)*sw*(.4+r()*.15),y+sh/2+Math.sin(a)*sh*(.4+r()*.15));}
  g.closePath();g.fill();g.fillStyle='rgba(255,250,235,.12)';g.fillRect(x+sw*.3,y+sh*.25,sw*.3,2);
 }});
// 받침 바위 무늬: 세로 절리 줄과 얼룩. 가로는 둘레를 세 번 감는다.
const rockMap=()=>painted(256,512,(g,w,h)=>{const r=rnd(19);g.fillStyle='#8f897d';g.fillRect(0,0,w,h);
 for(let i=0;i<260;i++){const tone=100+r()*70|0;g.fillStyle=`rgba(${tone+8},${tone+4},${tone-4},.35)`;g.fillRect(r()*w,r()*h,6+r()*30,20+r()*80);}
 for(let i=0;i<9;i++){let x=r()*w;g.strokeStyle=`rgba(45,42,38,${.45+r()*.3})`;g.lineWidth=2+r()*3;g.beginPath();g.moveTo(x,0);
  for(let y=0;y<=h;y+=32){x+=(r()-.5)*8;g.lineTo(x,y);}g.stroke();}
 g.fillStyle='rgba(70,90,60,.25)';for(let i=0;i<30;i++)g.fillRect(r()*w,h*.6+r()*h*.4,10+r()*20,6+r()*14);
});
const shared=palette.map((color,i)=>new THREE.MeshStandardMaterial({color,roughness:i===DOME?.6:.95,flatShading:i===DOME,
 ...(i===RUBBLE?{map:rubbleMap()}:i===ROCK?{map:rockMap()}:i===LANTERN?{emissive:0x5a0b06,roughness:.55}:i===STEEL?{metalness:.4,roughness:.6}:{})}));
const seamMaterial=new THREE.LineBasicMaterial({color:0x7c8281});
// 석축 상자처럼 면마다 늘어나지 않게 실제 m 기준 UV를 다시 준다.
function planarUV(g,size){const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
 for(let i=0;i<p.count;i++)uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/size,p.getY(i)/size);return g;}
// 결정적 잡음으로 꼭짓점을 밀어 둥글고 울퉁불퉁한 돌을 만든다. 같은 위치는 같은 변위라 틈이 생기지 않는다.
export function markerStone(level,h,w,top,d,seed,flatFront=Infinity){
 const g=new THREE.IcosahedronGeometry(1,level===0?3:level===1?2:1),p=g.attributes.position,v=new THREE.Vector3();
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i);
  const n=1+.07*Math.sin(v.x*3.1+seed)*Math.cos(v.y*2.3-seed*.7)+.05*Math.sin(v.z*4.7+v.y*1.9+seed*1.3);
  const y=(v.y+1)/2,taper=mix(1,top,y);
  // 글자를 새긴 앞면은 평평하게 깎는다(실물 정상석처럼).
  p.setXYZ(i,v.x*w*taper*n,y*h*2*(1+.03*Math.sin(v.x*5+seed)),Math.min(flatFront,v.z*d*taper*n));
 }
 g.computeVertexNormals();return g;
}
const mix=(a,b,t)=>a+(b-a)*t;
export const MARKER_FACE_Z=.38;
// 새긴 글자: 투명 바탕에 어두운 홈과 아래쪽 밝은 테두리로 음각처럼 보이게 한다.
function carved(lines,width,height){
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=256;c.height=640;const ctx=c.getContext('2d');
 ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 168px "Noto Serif CJK KR","AppleMyungjo","Songti SC",serif';
 lines.forEach((ch,i)=>{const y=110+i*205;ctx.fillStyle='rgba(235,232,222,.55)';ctx.fillText(ch,131,y+5);ctx.fillStyle='#2a2925';ctx.fillText(ch,128,y);});
 const map=new THREE.CanvasTexture(c);map.colorSpace=THREE.SRGBColorSpace;
 return new THREE.Mesh(new THREE.PlaneGeometry(width,height),new THREE.MeshStandardMaterial({map,transparent:true,alphaTest:.35,roughness:.95,depthWrite:false}));
}
function shape(id,level){
 const buckets=palette.map(()=>[]),root=new THREE.Group();
 const add=(g,k,x,y,z,rx=0,rz=0)=>{g.rotateX(rx);g.rotateZ(rz);g.translate(x,y,z);buckets[k].push(g);};
 const box=(k,x,y,z,w,h,d,rx=0,rz=0)=>add(new THREE.BoxGeometry(w,h,d),k,x,y,z,rx,rz);
 const beam=(k,a,b,r,sides=4)=>{const s=new THREE.Vector3(...a),e=new THREE.Vector3(...b),d=e.clone().sub(s);
  const g=new THREE.CylinderGeometry(r,r,d.length(),sides,1,true);g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));
  const c=s.add(e).multiplyScalar(.5);add(g,k,c.x,c.y,c.z);};
 if(id==='radar'){
  // P4·P5: 바위 무늬 원통 받침(겉을 바위처럼 꾸민 탑) 위 둘레길, 삼각 면으로 나뉜 흰 돔, 옆에 돔보다 높은 격자 철탑.
  // 높이는 사진 비례 추정(돔 지름 10m 기준 받침 약 1.3배). 경사면에서 뜨지 않게 3m 묻는다.
  const top=13,radial=level===0?28:level===1?14:8;
  const rock=new THREE.CylinderGeometry(4.1,4.6,top+3,radial,level===0?6:1);
  if(level<2){const p=rock.attributes.position,uv=rock.attributes.uv;
   for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),a=Math.atan2(x,z),y=p.getY(i);
    const k=1+.055*Math.sin(a*9+1.3)+.035*Math.sin(a*17+y*.4)+.02*Math.sin(a*31);p.setXYZ(i,x*k,y,z*k);uv.setXY(i,uv.getX(i)*3,uv.getY(i)*2);}
   rock.computeVertexNormals();}
  add(rock,ROCK,0,(top-3)/2,0);
  // P4의 작은 어두운 창
  if(level<2)for(const [a,y]of [[.3,9.5],[1.2,9.5],[2.4,7],[3.6,9.5],[4.6,6.5],[5.5,9.5]]){const g=new THREE.BoxGeometry(.7,.45,.12);g.rotateY(a);add(g,2,Math.sin(a)*4.38,y,Math.cos(a)*4.38);}
  // 둘레길 바닥판과 난간(기둥·윗난간)
  add(new THREE.CylinderGeometry(5.5,5.2,.35,radial),STEEL,0,top,0);
  if(level<2){const n=level===0?24:12;
   for(let i=0;i<n;i++){const a=i/n*Math.PI*2,b=(i+1)/n*Math.PI*2;
    beam(STEEL,[Math.sin(a)*5.4,top,Math.cos(a)*5.4],[Math.sin(a)*5.4,top+1.1,Math.cos(a)*5.4],.03);
    beam(STEEL,[Math.sin(a)*5.4,top+1.1,Math.cos(a)*5.4],[Math.sin(b)*5.4,top+1.1,Math.cos(b)*5.4],.035);
    if(level===0)beam(STEEL,[Math.sin(a)*5.4,top+.55,Math.cos(a)*5.4],[Math.sin(b)*5.4,top+.55,Math.cos(b)*5.4],.02);}}
  add(new THREE.IcosahedronGeometry(5,level===0?3:level===1?2:0),DOME,0,top+3.2,0);
  // 격자 철탑: 다리 4개가 위로 좁아지고, 3m마다 가로대와 X자 가새. 받침 동쪽에 붙여 세운다.
  const tx=5.9,tz=-1.2,h=30,w0=1.1,w1=.35,step=level===0?3:level===1?6:h;
  const wAt=y=>w0+(w1-w0)*Math.max(0,y)/h,legs=[[-1,-1],[1,-1],[1,1],[-1,1]];
  for(const [sx,sz]of legs)beam(STEEL,[tx+sx*w0,-3,tz+sz*w0],[tx+sx*w1,h,tz+sz*w1],level===0?.07:.1);
  if(level<2)for(let y=0;y<h;y+=step){const y2=Math.min(h,y+step),a=wAt(y),b=wAt(y2);
   for(let i=0;i<4;i++){const [ax,az]=legs[i],[bx,bz]=legs[(i+1)%4];
    beam(STEEL,[tx+ax*b,y2,tz+az*b],[tx+bx*b,y2,tz+bz*b],.035);
    beam(STEEL,[tx+ax*a,y,tz+az*a],[tx+bx*b,y2,tz+bz*b],.025);
    if(level===0)beam(STEEL,[tx+bx*a,y,tz+bz*a],[tx+ax*b,y2,tz+az*b],.025);}}
  beam(STEEL,[tx,h,tz],[tx,h+5,tz],.05);
  if(level<2)for(const y of [h-4,h-9])box(0,tx+w1+.2,y,tz,.25,1.6,.5);
 }else if(id==='eungjinjeon'){
  // P1~P4: 막돌 석축 위 붉은 벽 기와집 한 채, 앞마당 둘레 초록 난간, 처마 밑과 난간 앞 붉은 등 줄. 앞(+Z)이 등 줄 쪽.
  // 석축 상면(5m)에 건물 바닥을 맞춘다. 경사면에서 뜨지 않게 1.5m 묻는다.
  add(planarUV(new THREE.BoxGeometry(7,6.5,6),2),RUBBLE,0,1.75,0);
  box(1,0,5.06,0,7.2,.14,6.2);
  const bz=-.9,bw=5.2,bd=3.6,wallTop=7.6;
  box(RED,0,5+(wallTop-5)/2,bz,bw,wallTop-5,bd);
  // 처마: 앞뒤 경사 지붕, 용마루, 박공(붉은 삼각 벽)
  for(const side of [-1,1])box(2,0,8.08,bz+side*1.35,6.6,.18,3.3,side*.36);
  box(2,0,8.62,bz,6.7,.24,.26);
  const gable=new THREE.CylinderGeometry(1,1,bw,3);gable.rotateZ(Math.PI/2);gable.rotateX(-Math.PI/2);gable.scale(1,.55,1.95);
  add(gable,RED,0,wallTop+.28,bz);
  if(level<2){
   // 앞면 기둥·문살 판·처마 밑 초록 단청 띠
   for(const x of [-2.5,-.85,.85,2.5])box(3,x,6.3,bz+bd/2+.03,.18,2.6,.12);
   for(const x of [-1.68,0,1.68])box(RED,x,6.2,bz+bd/2+.04,1.4,2,.04);
   box(GREEN,0,wallTop-.12,bz+bd/2+.08,bw+.2,.22,.1);
   for(const s of [-1,1])box(GREEN,s*(bw/2+.08),wallTop-.12,bz,.1,.22,bd+.2);
   // 초록 난간: 앞마당 앞과 양옆
   const rx=3.35,zf=2.85,zb=bz-bd/2,posts=level===0?.8:1.6;
   for(let x=-rx;x<=rx+1e-6;x+=rx*2/Math.round(rx*2/posts))box(GREEN,x,5.6,zf,.07,1.1,.07);
   for(const s of [-1,1])for(let z=zb;z<zf;z+=posts)box(GREEN,s*rx,5.6,z,.07,1.1,.07);
   for(const y of level===0?[5.65,6.12]:[6.12]){box(GREEN,0,y,zf,rx*2,.06,.06);for(const s of [-1,1])box(GREEN,s*rx,y,(zb+zf)/2,.06,.06,zf-zb);}
   // 붉은 등 줄: 처마 끝(앞·양옆)과 난간 앞을 가로지르는 줄. 등은 세로로 조금 긴 저면수 구체.
   // 4차 재대조: 등이 크고 촘촘하면 비스듬히 볼 때 겹쳐 굵은 소시지처럼 보인다. 지름 20cm로 줄이고 등 사이를 띄운다.
   const lantern=(x,y,z)=>{const g=new THREE.SphereGeometry(.1,level===0?7:5,level===0?5:3);g.scale(1,1.25,1);add(g,LANTERN,x,y,z);};
   const eave=bz+bd/2+.95,gap=level===0?.55:.8,drop=(t,d)=>d*Math.sin(t*Math.PI);
   box(2,0,7.45,eave,6.4,.015,.015);
   for(let x=-3.05;x<=3.05+1e-6;x+=gap)lantern(x,7.24-drop((x+3.05)/6.1,.08),eave);
   // 옆 줄은 처마 끝 기둥에서 처마 앞까지만 걸고, 등을 성기게 달아 옆에서 볼 때도 알알이 보이게 한다.
   if(level===0)for(const s of [-1,1]){const z0=bz-bd/2+.2,z1=eave-.3;box(2,s*3.15,7.45,(z0+z1)/2,.015,.015,z1-z0);for(let z=z0;z<=z1+1e-6;z+=.75)lantern(s*3.15,7.24-drop((z-z0)/(z1-z0),.06),z);}
   // 난간 앞 줄은 기둥 사이로 늘어진다.
   for(let x=-3.1;x<=3.1+1e-6;x+=gap){const sag=.18*Math.cos(x/3.1*Math.PI/2);lantern(x,6.82-sag,zf+.12);}
   box(2,0,6.98,zf+.12,6.4,.015,.015);
  }
 }else if(id==='marker'){
  // 실경 비교(미디어허브 2001344 사진 대조): '冠岳山'을 새긴 둥근 자연석. 크기·모양은 사진 비례로 추정.
  add(markerStone(level,.25,1.25,1.1,.7,11),1,0,-.2,0); // 받침돌은 20cm 묻어 경사면에서 뜨지 않게 한다.
  add(markerStone(level,1,.8,1.05,.52,3,MARKER_FACE_Z),1,0,.22,0);
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
 // 돔의 삼각 면 이음선(P4). 근경에서만 그린다.
 if(id==='radar'&&level===0){const edges=new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(5.03,3),1);edges.translate(0,16.2,0);
  const seams=new THREE.LineSegments(edges,seamMaterial);seams.name='레이더 돔 이음선';root.add(seams);}
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
  if(text){const mesh=label(text,spec.id==='marker'?.62:1.94,spec.id==='marker'?.23:.6);
   // 표지석 안내판은 받침돌 앞에 낮게 둔다. 본 글자는 돌 앞면에 새긴다.
   if(mesh){mesh.position.set(0,spec.id==='marker'?.12:2.05,spec.id==='marker'?.8:.045);if(spec.id==='marker')mesh.rotation.x=-.35;lod.levels[0].object.add(mesh);}}
  if(spec.id==='marker')for(const level of [0,1]){const mesh=carved(['冠','岳','山'],.44,1.1);if(mesh){mesh.position.set(0,1.24,MARKER_FACE_Z+.004);lod.levels[level].object.add(mesh);}}
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
