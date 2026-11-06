// 카툰 시안 공용 형상 도우미 + 동동이 시안 모형. mascot-concepts.js(캐릭터 시안)와 props-concepts.js(오브젝트·상호작용 시안)가 함께 쓴다.
import * as THREE from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';

const {Vector3,Quaternion}=THREE;
const v=(x=0,y=0,z=0)=>new Vector3(x,y,z);

// ── 형상 도우미. 앞 +Z, 왼쪽(캐릭터 기준) +X, 단위 m.
const smoothGeo=g=>{g.deleteAttribute('uv');g.deleteAttribute('normal');g=mergeVertices(g);g.computeVertexNormals();return g;};
function ell(r,{w=28,h=20,shape=null}={}){
 const g=new THREE.SphereGeometry(1,w,h),p=g.attributes.position,V=v();
 for(let i=0;i<p.count;i++){V.fromBufferAttribute(p,i);if(shape)shape(V);V.multiply(r);p.setXYZ(i,V.x,V.y,V.z);}
 return smoothGeo(g);
}
const box=(px=.5,pz=.7)=>V=>{V.x=Math.sign(V.x)*Math.abs(V.x)**px;V.y=Math.sign(V.y)*Math.abs(V.y)**px;V.z=Math.sign(V.z)*Math.abs(V.z)**pz;};
function capsule(a,b,r,radial=16){
 const d=b.clone().sub(a),len=d.length(),g=new THREE.CapsuleGeometry(r,len,6,radial);
 g.applyQuaternion(new Quaternion().setFromUnitVectors(v(0,1,0),d.normalize()));const m=a.clone().add(b).multiplyScalar(.5);g.translate(m.x,m.y,m.z);return smoothGeo(g);
}
const noodle=(pts,r)=>smoothGeo(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,r,10,false));
// 곡선을 따라 반지름 radius(u)로 휩쓴 관(꼬리처럼 굵기가 변하는 한 덩어리)
function sweep(pts,radius,{radial=16,rings=48}={}){
 const curve=new THREE.CatmullRomCurve3(pts),fr=curve.computeFrenetFrames(rings,false),pos=[],idx=[];
 for(let i=0;i<=rings;i++){const u=i/rings,P=curve.getPointAt(u),N=fr.normals[i],B=fr.binormals[i],r=radius(u);
  for(let k=0;k<=radial;k++){const a=k/radial*Math.PI*2,c=Math.cos(a)*r,s=Math.sin(a)*r;pos.push(P.x+c*N.x+s*B.x,P.y+c*N.y+s*B.y,P.z+c*N.z+s*B.z);}}
 for(let i=0;i<rings;i++)for(let k=0;k<radial;k++){const a=i*(radial+1)+k,b=a+radial+1;idx.push(a,a+1,b,a+1,b+1,b);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);return smoothGeo(g);
}
const at=(g,p)=>{g.translate(p.x,p.y,p.z);return g;};

const mats=new Map();
function mat(color,glow=false){
 const k=`${color}|${glow}`;
 if(!mats.has(k))mats.set(k,new THREE.MeshStandardMaterial({color:color??0xffffff,vertexColors:color==null,roughness:1,metalness:0,...(glow?{emissive:color,emissiveIntensity:.9}:{})}));
 return mats.get(k);
}
// 부위 하나. color가 함수면 꼭짓점 색. line: 외곽선 두께 배율(얼굴 부품은 0).
function part(parent,geo,color,{line=1,glow=false,shadow=true}={}){
 if(typeof color==='function'){const p=geo.attributes.position,c=new THREE.Color(),V=v(),cols=[];for(let i=0;i<p.count;i++){V.fromBufferAttribute(p,i);c.set(color(V));cols.push(c.r,c.g,c.b);}geo.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));}
 const m=new THREE.Mesh(geo,mat(typeof color==='function'?null:color,glow));
 m.userData.line=line;m.castShadow=shadow&&line>0;m.receiveShadow=false;parent.add(m);return m;
}
// 타원체(가운데 c, 반지름 r) 표면 위 yaw·pitch 자리에 앞(+Z)을 보는 형상을 법선 방향으로 붙인다.
function surf(parent,c,r,yaw,pitch,geo,color,{lift=0,roll=0,line=0,glow=false}={}){
 const d=v(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch));
 const p=c.clone().add(d.clone().multiply(r)),n=v(d.x/r.x,d.y/r.y,d.z/r.z).normalize();
 // 위쪽이 화면 위를 보도록: 앞 → 법선으로 돌린 뒤 기울기(roll)
 const qq=new Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(v(),n.clone().negate(),v(0,1,0)));
 if(roll)qq.multiply(new Quaternion().setFromAxisAngle(v(0,0,1),roll));
 const m=part(parent,geo,color,{line,glow,shadow:false});m.position.copy(p.addScaledVector(n,lift));m.quaternion.copy(qq);return m;
}
const decal=(parent,c,r,yaw,pitch,size,color,o={})=>surf(parent,c,r,yaw,pitch,ell(size,{w:16,h:12}),color,{lift:-size.z*.3,...o});
// 반짝이는 큰 눈: 짙은 타원 + 하이라이트 둘(보는 사람 기준 왼쪽 위). 깜빡임은 eye.scale.y.
function eye(parent,c,r,yaw,pitch,size,{color='#2a2321',shine=1,glow=false}={}){
 const e=decal(parent,c,r,yaw,pitch,size,color,{glow});
 if(shine){part(e,at(ell(v(size.x*.36,size.y*.3,size.z*.5),{w:10,h:8}),v(-size.x*.3,size.y*.38,size.z*.75)),'#ffffff',{line:0,shadow:false});
  part(e,at(ell(v(size.x*.17,size.y*.14,size.z*.5),{w:8,h:6}),v(size.x*.32,-size.y*.4,size.z*.75)),'#ffffff',{line:0,shadow:false});}
 return e;
}
// 웃는 입(아래로 둥근 호)
const smile=(rad,tube,arc=Math.PI*.8)=>{const g=new THREE.TorusGeometry(rad,tube,6,18,arc);g.rotateZ(-Math.PI/2-arc/2);g.translate(0,rad*.5,0);return g;};
const omega=(rad,tube)=>{const a=smile(rad,tube,Math.PI*.9),b=a.clone();a.translate(-rad*.95,0,0);b.translate(rad*.95,0,0);const g=new THREE.BufferGeometry();
 const pa=[...a.attributes.position.array,...b.attributes.position.array],ia=[...a.index.array,...[...b.index.array].map(i=>i+a.attributes.position.count)];
 g.setAttribute('position',new THREE.Float32BufferAttribute(pa,3));g.setIndex(ia);g.computeVertexNormals();return g;};
const grp=(parent,p=v())=>{const g=new THREE.Group();g.position.copy(p);parent.add(g);return g;};
const blink=(eyes,t,seed=0)=>{const k=(t+seed)%3.7,s=k<.13?Math.max(.08,Math.abs(k-.065)/.065):1;for(const e of eyes)e.scale.y=s;};

// ── 1안: 꼬마 등산객 「동동이」 2.1등신, 1.0m. 동물의 숲처럼 큰 머리·벙거지·빵빵한 배낭.
function dongdong(){
 const C={jacket:'#f08a3c',zip:'#c9652a',skin:'#f7d9b8',hair:'#5a3a26',pants:'#3b4a7a',boot:'#8d5c35',sole:'#3a2a20',pack:'#2fa39a',packDark:'#23827a',mat:'#f2c14e',hat:'#c9b07a',band:'#d9473e',scarf:'#d9473e',mitten:'#e5484d',blush:'#f3a08f',mouth:'#8a3f33'};
 const root=new THREE.Group(),body=grp(root);
 const legs=[-1,1].map(s=>{const g=grp(body,v(s*.075,.2,0));part(g,capsule(v(0,0,0),v(0,-.11,0),.055),C.pants);
  part(g,at(ell(v(.072,.056,.1),{shape:V=>{if(V.z>0)V.y*=1-.2*V.z;}}),v(0,-.15,.025)),V=>V.y<-.037?C.sole:C.boot);return g;});
 part(body,at(ell(v(.165,.18,.145),{shape:V=>{if(V.y<0){V.x*=1+.08*-V.y;V.z*=1+.05*-V.y;}}}),v(0,.34,0)),C.jacket);
 part(body,at(ell(v(.012,.12,.012)),v(0,.34,.147)),C.zip,{line:0});
 part(body,at(new THREE.TorusGeometry(.105,.04,10,24).rotateX(Math.PI/2),v(0,.5,0)),C.scarf);
 for(const s of [-1,1])part(body,noodle([v(s*.09,.5,.11),v(s*.1,.4,.15),v(s*.1,.27,.14)],.016),'#2b3a40',{line:.5});
 const pack=grp(body,v(0,.38,-.17));
 part(pack,at(ell(v(.17,.19,.11),{shape:box(.55,.7)}),v(0,0,-.03)),C.pack);
 part(pack,at(ell(v(.11,.08,.04),{shape:box(.6,.7)}),v(0,-.07,-.14)),C.packDark);
 part(pack,new THREE.CapsuleGeometry(.056,.26,6,16).rotateZ(Math.PI/2).translate(0,.215,-.02),C.mat);
 const arms=[-1,1].map(s=>{const g=grp(body,v(s*.15,.45,0));g.rotation.z=s*.12;part(g,capsule(v(0,0,0),v(s*.03,-.15,0),.046),C.jacket);part(g,at(ell(v(.056,.056,.056)),v(s*.035,-.2,0)),C.mitten);return g;});
 const head=grp(body,v(0,.5,0)),hc=v(0,.23,0),hr=v(.25,.225,.23);
 part(head,at(ell(hr,{shape:V=>{if(V.y<0)V.x*=1-.08*V.y*V.y;}}),hc),C.skin);
 for(const s of [-1,1])part(head,at(ell(v(.032,.048,.03)),v(s*.247,.215,-.01)),C.skin);
 // 머리카락: 뒤·옆을 덮고 이마는 벙거지가 덮는다
 {const g=new THREE.SphereGeometry(1,28,20),p=g.attributes.position,V=v();const hl=z=>z>.3?.3:THREE.MathUtils.lerp(-.55,.3,Math.max(0,(z+.3)/.6));
  for(let i=0;i<p.count;i++){V.fromBufferAttribute(p,i);const k=V.y>hl(V.z)?1:.85;p.setXYZ(i,V.x*.262*k,V.y*.238*k+.24,V.z*.245*k-.012);}part(head,smoothGeo(g),C.hair);
  [[-.35,.05],[0,.04],[.35,.05]].forEach(([a,dy])=>surf(head,hc,hr,a,.62,ell(v(.07,.05,.03)),C.hair,{lift:-.01,roll:-a*.6,line:1}));}
 const eyes=[-1,1].map(s=>eye(head,hc,hr,s*.32,-.16,v(.036,.05,.016)));
 for(const s of [-1,1])decal(head,hc,hr,s*.56,-.33,v(.042,.022,.01),C.blush);
 surf(head,hc,hr,0,-.36,smile(.017,.0045),C.mouth,{lift:.002});
 // 벙거지
 const hat=grp(head,v(0,.37,0));hat.rotation.x=-.1;
 part(hat,new THREE.CylinderGeometry(.2,.236,.13,32,1,true).translate(0,.065,0),C.hat);part(hat,at(ell(v(.2,.04,.2)),v(0,.13,0)),C.hat);
 part(hat,new THREE.CylinderGeometry(.239,.239,.035,32,1,true).translate(0,.025,0),C.band,{line:.6});
 {const g=new THREE.CylinderGeometry(.34,.34,.022,40,1,false,0),p=g.attributes.position;for(let i=0;i<p.count;i++){const r=Math.hypot(p.getX(i),p.getZ(i));if(r>.2)p.setY(i,p.getY(i)-(r-.2)*.38);}part(hat,smoothGeo(g),C.hat);}
 return {root,h:1.0,w:.7,parts:{body,legs,arms,head,pack,hat,eyes,C,hc,hr},update(t,walk){
  const s=t*Math.PI*2*.95,k=walk;
  legs.forEach((g,i)=>g.rotation.x=k*Math.sin(s+i*Math.PI)*.55);
  arms.forEach((g,i)=>g.rotation.x=-k*Math.sin(s+i*Math.PI)*.7);
  body.position.y=k*Math.abs(Math.sin(s))*.045;body.rotation.z=k*Math.sin(s)*.06;
  head.rotation.z=k*Math.sin(s-.5)*.05+(1-k)*Math.sin(t*1.1)*.035;head.rotation.x=(1-k)*Math.sin(t*2.2)*.02;
  pack.rotation.x=k*Math.sin(2*s-.7)*.09;hat.rotation.z=k*Math.sin(2*s-1)*.05;
  body.scale.set(1,1+(1-k)*Math.sin(t*2.2)*.012,1);blink(eyes,t);
 }};
}

export {v,smoothGeo,ell,box,capsule,noodle,sweep,at,mat,part,surf,decal,eye,smile,omega,grp,blink,dongdong};
