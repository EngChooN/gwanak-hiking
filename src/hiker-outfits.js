// 등산객 복장 4종 적용. Hiker.glb의 기존 메시·뼈대·동작(팔 IK·걷기·스틱 잡기)은 그대로 두고
//  1) 상의·바지·모자 재질을 복장별 색 영역 셰이더로 바꾸고(옆판·가운데 판·지퍼 띠·가슴 패치·팔토시·꽃무늬·바지 로고)
//  2) 선글라스·안경·캡·두건·반다나·스카프·벨트·허리 선글라스·가슴 끈·휴대폰을 뼈에 붙인다(바인드 공간 → 뼈 좌표).
// 사진은 텍스처로 쓰지 않는다. 무늬는 셰이더 잡음과 절차 CanvasTexture다. 치수는 모델 바인드 형상에서 잰다.
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshStandardMaterial,BoxGeometry,SphereGeometry,CylinderGeometry,TorusGeometry,ConeGeometry,TubeGeometry,CatmullRomCurve3,CanvasTexture,SRGBColorSpace,RepeatWrapping,Vector3,Color,Matrix4,DoubleSide} from 'three';
import {OUTFITS,outfitById,DEFAULT_OUTFIT} from './outfit-config.js';
const V=new Vector3(),W=new Vector3();
const col=hex=>new Color(hex);
function bindPoints(mesh){const p=mesh.geometry.attributes.position,out=new Array(p.count);for(let i=0;i<p.count;i++)out[i]=new Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.bindMatrix);return out;}
function bounds(points){const min=new Vector3(Infinity,Infinity,Infinity),max=new Vector3(-Infinity,-Infinity,-Infinity);for(const p of points){min.min(p);max.max(p);}return {min,max,center:min.clone().add(max).multiplyScalar(.5),size:max.clone().sub(min)};}
function meanLuminance(texture){
 try{const img=texture?.image;if(!img)return .5;const c=document.createElement('canvas');c.width=c.height=32;const g=c.getContext('2d');g.drawImage(img,0,0,32,32);const d=g.getImageData(0,0,32,32).data;let s=0;for(let i=0;i<d.length;i+=4)s+=(.299*d[i]+.587*d[i+1]+.114*d[i+2])/255;return Math.max(.08,s/(d.length/4));}catch{return .5;}
}
// 절차 무늬 텍스처: 파란 페이즐리(두건), 자주 체크(스카프).
function canvasTexture(draw,size=256){const c=document.createElement('canvas');c.width=c.height=size;draw(c.getContext('2d'),size);const t=new CanvasTexture(c);t.colorSpace=SRGBColorSpace;t.wrapS=t.wrapT=RepeatWrapping;t.anisotropy=4;return t;}
export function paisleyTexture(base='#2f86c9',accent='#9fd6f2'){
 return canvasTexture((g,n)=>{g.fillStyle=base;g.fillRect(0,0,n,n);let seed=7;const rnd=()=>(seed=(seed*16807)%2147483647)/2147483647;
  for(let i=0;i<26;i++){const x=rnd()*n,y=rnd()*n,r=10+rnd()*16,a=rnd()*Math.PI*2;g.save();g.translate(x,y);g.rotate(a);
   g.fillStyle=i%3?accent:'#1d4f86';g.beginPath();g.moveTo(0,-r);g.bezierCurveTo(r*1.1,-r*.6,r*.8,r*.9,0,r);g.bezierCurveTo(-r*.55,r*.55,-r*.35,-r*.2,r*.15,-r*.25);g.closePath();g.fill();
   g.fillStyle='#ffffff';g.beginPath();g.arc(r*.12,r*.25,r*.18,0,Math.PI*2);g.fill();g.strokeStyle='#ffffff';g.lineWidth=1.5;g.beginPath();g.arc(0,r*.1,r*.62,-.6,2.2);g.stroke();g.restore();}
  g.fillStyle='#e8f6ff';for(let i=0;i<160;i++){g.beginPath();g.arc(rnd()*n,rnd()*n,1+rnd()*1.6,0,Math.PI*2);g.fill();}});
}
export function checkTexture(base='#8c4c78'){
 return canvasTexture((g,n)=>{g.fillStyle=base;g.fillRect(0,0,n,n);const step=n/8;
  for(let i=0;i<8;i++){g.fillStyle=i%2?'rgba(60,20,50,.45)':'rgba(230,200,220,.35)';g.fillRect(i*step,0,step*.45,n);g.fillRect(0,i*step,n,step*.45);}
  g.strokeStyle='rgba(255,240,250,.55)';g.lineWidth=1;for(let i=0;i<16;i++){g.beginPath();g.moveTo(i*n/16+2,0);g.lineTo(i*n/16+2,n);g.stroke();g.beginPath();g.moveTo(0,i*n/16+2);g.lineTo(n,i*n/16+2);g.stroke();}});
}
const TOP_GLSL=`
uniform vec3 uBase,uSideL,uSideR,uCenter,uArmSleeve,uZip,uLogo,uLogo2,uLogo3,uAccent,uSkin;
uniform float uLogoShape,uPlacket,uHemY,uPanel,uHem,uArmOn,uZipOn,uLogoOn,uLogoU,uLogoY,uLogoW,uLogoH,uPattern,uNeckY,uWaistY,uHalfW,uMeanLum,uUnit;
varying vec4 vOutfit;
float oHash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float oNoise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(oHash(i),oHash(i+vec3(1,0,0)),f.x),mix(oHash(i+vec3(0,1,0)),oHash(i+vec3(1,1,0)),f.x),f.y),mix(mix(oHash(i+vec3(0,0,1)),oHash(i+vec3(1,0,1)),f.x),mix(oHash(i+vec3(0,1,1)),oHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
vec3 outfitColor(vec4 o){
 float armT=o.x,u=o.y/uUnit,y=o.z/uUnit,f=o.w/uUnit,h=clamp((y-uWaistY)/max(.01,uNeckY-uWaistY),0.,1.),au=abs(u)/uHalfW;
 vec3 c=uBase;bool sleeveOff=armT>uHem;
 if(armT<0.){
  if(uPanel>.5&&uPanel<1.5){if(au>.48)c=u>0.?uSideL:uSideR;}
  else if(uPanel>1.5){float w=.17+.62*pow(h,1.7);if(au<w)c=uCenter;else if(au>.6&&h<.66)c=u>0.?uSideL:uSideR;}
  if(uZipOn>.5&&f>0.&&abs(u)<.011&&h>.52)c=uZip;
  if(uPlacket>.5&&f>0.&&abs(u)<.013&&y>uNeckY-.15&&y<uNeckY-.02)c=uBase*(abs(u)>.0105?.72:.9);
  if(uLogoOn>.5&&f>0.){vec2 dd=vec2(u-uLogoU,y-uLogoY),d=abs(dd);float lx=dd.x/uLogoW,ly=dd.y/uLogoH;
   if(uLogoShape<.5){if(d.x<uLogoW&&d.y<uLogoH){c=uLogo;if(d.x<uLogoW*.62&&d.y<uLogoH*.62)c=uLogo2;}}
   else if(uLogoShape<1.5){if(d.x<uLogoW&&d.y<uLogoH){c=uLogo;if(d.x<uLogoW*.8&&d.y<uLogoH*.8){c=uLogo2;if(ly>-.5&&abs(lx)<(.55-ly*.8)*.9)c=uLogo3;if(ly<-.55&&ly>-.7&&abs(lx)<.6)c=uLogo3;}}}
   else if(uLogoShape<2.5){float hw=ly>.15?1.:clamp(1.+(ly-.15)*1.05,0.,1.);if(ly>-1.&&ly<1.&&abs(lx)<hw){c=uLogo;if(abs(lx)<hw*.55&&ly<.55&&ly>-.55)c=uLogo2;}}
   else if(lx*lx+ly*ly<1.)c=uLogo;}
 }else if(uPanel>1.5&&armT<.08)c=uSideL;
 if(sleeveOff)c=uArmOn>.5?uArmSleeve:uSkin;
 else if(uPattern>.5){vec3 p=vec3(u,y,f)*16.;float n=oNoise(p*2.8)*.6+oNoise(p*6.1+7.)*.4,v=oNoise(p*1.2+3.);
  c=mix(c,mix(uAccent,vec3(.82,.88,.97),.55),smoothstep(.5,.54,n)*(.55+.45*v));c=mix(c,uAccent,smoothstep(.64,.67,n));c=mix(c,uAccent*.8,(1.-smoothstep(.0,.012,abs(n-.58)))*.8);}
 return c;
}`;
const PANTS_GLSL=`
uniform vec3 uPants,uPLogo;uniform float uPLogoOn,uMeanLum,uUnit;varying vec4 vOutfit;`;
function patch(material,{uniforms,fragHead,fragBody,key}){
 material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,uniforms);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 aOutfit;\nvarying vec4 vOutfit;').replace('#include <begin_vertex>','#include <begin_vertex>\nvOutfit=aOutfit;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>\n${fragHead}`).replace('#include <map_fragment>',`#include <map_fragment>\n${fragBody}`);};
 material.customProgramCacheKey=()=>key;material.needsUpdate=true;
}
export function createOutfitSystem(root){
 const meshes={};root.traverse(o=>{if(!o.isSkinnedMesh)return;const n=o.name.toLowerCase();for(const [key,re] of Object.entries({jacket:/jacket/,collar:/collar/,zipper:/zipper/,pants:/pants/,hat:/hat/,pack:/backpack/,straps:/straps/,hair:/short02/,body:/^human$|^base$/,eyes:/low-poly/}))if(re.test(n)&&!meshes[key])meshes[key]=o;});
 const skeleton=meshes.jacket?.skeleton??meshes.body?.skeleton;if(!skeleton)throw new Error('등산객 뼈대 없음');
 const names=skeleton.bones.map(b=>b.name.replace(/^mixamorig:?/,''));
 const boneIndex=n=>names.indexOf(n),bindOf=n=>new Vector3().setFromMatrixPosition(skeleton.boneInverses[boneIndex(n)].clone().invert());
 // 바인드 공간 단위(모델 신장 1.7m 기준)와 앞 방향(+Z/−Z)
 const bodyBounds=bounds(bindPoints(meshes.body??meshes.jacket)),unit=bodyBounds.size.y/1.7;
 const eyes=meshes.eyes?bindPoints(meshes.eyes):[];const head=bindOf('Head');
 const eyeL=eyes.filter(p=>p.x>head.x),eyeR=eyes.filter(p=>p.x<=head.x),avg=list=>list.reduce((a,p)=>a.add(p),new Vector3()).multiplyScalar(1/Math.max(1,list.length));
 const eyeLeft=eyeL.length?avg(eyeL):head.clone().add(new Vector3(.032*unit,.07*unit,.08*unit)),eyeRight=eyeR.length?avg(eyeR):head.clone().add(new Vector3(-.032*unit,.07*unit,.08*unit));
 const front=Math.sign((eyeLeft.z+eyeRight.z)/2-head.z)||1;
 const hairBounds=meshes.hair?bounds(bindPoints(meshes.hair)):{center:head.clone().add(new Vector3(0,.09*unit,0)),size:new Vector3(.17,.2,.21).multiplyScalar(unit),min:head.clone(),max:head.clone().add(new Vector3(0,.2*unit,0))};
 const neck=bindOf('Neck'),hips=bindOf('Hips'),spine2=bindOf('Spine2');
 const info={unit,front,headTop:hairBounds.max.y,eyeLeft:eyeLeft.toArray(),eyeRight:eyeRight.toArray()};
 // 상의 영역 속성: x=팔 위치 t(어깨 0 → 손목 1, 팔 아니면 -1), y=몸 중심 기준 좌우, z=높이, w=앞뒤(앞 +)
 const jacketPts=meshes.jacket?bindPoints(meshes.jacket):[],jacketBounds=bounds(jacketPts.length?jacketPts:[hips,neck]);
 const torsoPts=jacketPts.filter(p=>Math.abs(p.x-hips.x)<.25*unit&&p.y<neck.y&&p.y>jacketBounds.min.y+.05*unit);
 const halfW=torsoPts.length?Math.max(...torsoPts.map(p=>Math.abs(p.x-hips.x)))/unit:.2;
 const arms=['Left','Right'].map(side=>({ids:['Arm','ForeArm','Hand','Shoulder'].map(b=>boneIndex(side+b)).filter(i=>i>=0),a:bindOf(side+'Arm'),b:bindOf(side+'Hand')}));
 function regionAttribute(mesh,points){
  const si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight,out=new Float32Array(points.length*4);
  points.forEach((p,i)=>{let armT=-1;for(const arm of arms){let w=0;for(let k=0;k<4;k++)if(arm.ids.includes(si.getComponent(i,k)))w+=sw.getComponent(i,k);
    if(w>=.5){W.subVectors(arm.b,arm.a);armT=Math.max(0,Math.min(1,V.subVectors(p,arm.a).dot(W)/W.lengthSq()));}}
   out.set([armT,(p.x-hips.x)*front,p.y-hips.y+hips.y,(p.z-hips.z)*front],i*4);});
  return out;
 }
 const {BufferAttribute}=meshes.jacket?.geometry.attributes.position.constructor?{BufferAttribute:meshes.jacket.geometry.attributes.position.constructor}:{};
 const neckY=neck.y/unit,waistY=jacketBounds.min.y/unit;
 const topUniforms={uBase:{value:col('#ffffff')},uSideL:{value:col('#ffffff')},uSideR:{value:col('#ffffff')},uCenter:{value:col('#ffffff')},uArmSleeve:{value:col('#ffffff')},uZip:{value:col('#000000')},uLogo:{value:col('#000000')},uLogo2:{value:col('#000000')},uLogo3:{value:col('#000000')},uLogoShape:{value:0},uPlacket:{value:0},uAccent:{value:col('#3f63b8')},uSkin:{value:col('#c99c82')},
  uHemY:{value:-1},uPanel:{value:0},uHem:{value:2},uArmOn:{value:0},uZipOn:{value:0},uLogoOn:{value:0},uLogoU:{value:.08},uLogoY:{value:neckY-.14},uLogoW:{value:.03},uLogoH:{value:.02},uPattern:{value:0},uNeckY:{value:neckY},uWaistY:{value:waistY},uHalfW:{value:halfW},uMeanLum:{value:.5},uUnit:{value:unit}};
 const topMaterials=[];
 for(const key of ['jacket','collar']){const mesh=meshes[key];if(!mesh)continue;
  mesh.geometry.setAttribute('aOutfit',new BufferAttribute(regionAttribute(mesh,bindPoints(mesh)),4));
  const m=mesh.material.clone();topUniforms.uMeanLum.value=meanLuminance(mesh.material.map);m.color.set('#ffffff');
  patch(m,{uniforms:topUniforms,fragHead:TOP_GLSL,key:'gwanak-outfit-top-v2',fragBody:'{if(vOutfit.x<0.&&vOutfit.z/uUnit<uHemY)discard;float l=dot(diffuseColor.rgb,vec3(.299,.587,.114));diffuseColor.rgb=outfitColor(vOutfit)*clamp(.62+.38*l/uMeanLum,.45,1.25);}'});
  mesh.material=m;topMaterials.push(m);}
 // 바지: 다리 위치 t(엉덩이 0 → 발목 1), 다리 중심선 기준 좌우·앞뒤. 3번 무릎 아래 로고.
 const pantsUniforms={uPants:{value:col('#151517')},uPLogo:{value:col('#d33a2c')},uPLogoOn:{value:0},uMeanLum:{value:.5},uUnit:{value:unit}};
 const legs=['Left','Right'].map(side=>({side,ids:['UpLeg','Leg','Foot'].map(b=>boneIndex(side+b)),a:bindOf(side+'UpLeg'),b:bindOf(side+'Foot')}));
 let pantsMaterial=null;
 if(meshes.pants){const mesh=meshes.pants,pts=bindPoints(mesh),si=mesh.geometry.attributes.skinIndex,sw=mesh.geometry.attributes.skinWeight,out=new Float32Array(pts.length*4);
  pts.forEach((p,i)=>{let best=null,bw=0;for(const leg of legs){let w=0;for(let k=0;k<4;k++)if(leg.ids.includes(si.getComponent(i,k)))w+=sw.getComponent(i,k);if(w>bw){bw=w;best=leg;}}
   if(!best||bw<.4){out.set([-1,0,p.y,0],i*4);return;}W.subVectors(best.b,best.a);const t=Math.max(0,Math.min(1,V.subVectors(p,best.a).dot(W)/W.lengthSq())),c=best.a.clone().addScaledVector(W,t);
   out.set([t,(best.side==='Left'?1:-1)+(p.x-c.x)*front/unit,p.y,(p.z-c.z)*front/unit],i*4);});
  mesh.geometry.setAttribute('aOutfit',new BufferAttribute(out,4));
  pantsMaterial=mesh.material.clone();pantsUniforms.uMeanLum.value=meanLuminance(mesh.material.map);pantsMaterial.color.set('#ffffff');
  patch(pantsMaterial,{uniforms:pantsUniforms,fragHead:PANTS_GLSL,key:'gwanak-outfit-pants-v1',fragBody:'{float l=dot(diffuseColor.rgb,vec3(.299,.587,.114));vec3 c=uPants*clamp(.7+.5*l/uMeanLum,.5,1.4);vec4 o=vOutfit;float lat=o.y-sign(o.y);if(uPLogoOn>.5&&o.x>.6&&o.x<.67&&o.y>0.&&o.w>0.&&abs(lat)<.028)c=abs(lat)<.016&&o.x>.615&&o.x<.655?vec3(.96):uPLogo;diffuseColor.rgb=c;}'});
  mesh.material=pantsMaterial;}
 // 모자: 파나마는 기존 챙모자 형상을 흰 밀짚색 + 검정 띠로. 띠 = 챙 바로 위 크라운 둘레.
 let hatMaterial=null,hatInfo=null;
 if(meshes.hat){const pts=bindPoints(meshes.hat),b=bounds(pts),cx=b.center.x,cz=b.center.z,crownR=Math.max(...pts.filter(p=>p.y>b.min.y+.05*unit).map(p=>Math.hypot(p.x-cx,p.z-cz)));
  hatInfo={minY:b.min.y,crownR,cx,cz};const attr=new Float32Array(pts.length*4);pts.forEach((p,i)=>attr.set([(p.y-b.min.y)/unit,Math.hypot(p.x-cx,p.z-cz)/crownR,0,0],i*4));
  meshes.hat.geometry.setAttribute('aOutfit',new BufferAttribute(attr,4));hatMaterial=meshes.hat.material.clone();hatMaterial.color.set('#ffffff');
  const u={uHat:{value:col('#f3f1ea')},uBand:{value:col('#1b1c1f')},uBandOn:{value:1}};
  patch(hatMaterial,{uniforms:u,fragHead:'uniform vec3 uHat,uBand;uniform float uBandOn;varying vec4 vOutfit;',key:'gwanak-outfit-hat-v1',fragBody:'{float l=dot(diffuseColor.rgb,vec3(.299,.587,.114));vec3 c=uHat*clamp(.75+.4*l,.6,1.1);if(uBandOn>.5&&vOutfit.x>.012&&vOutfit.x<.04&&vOutfit.y<1.08)c=uBand;diffuseColor.rgb=c;}'});
  hatMaterial.userData.uniforms=u;meshes.hat.material=hatMaterial;}
 // 뼈에 붙이는 착용품. place(bone, mesh): mesh는 바인드 공간 좌표로 놓는다.
 const groups={};
 function place(boneName,object){const i=boneIndex(boneName);if(i<0)return;const holder=new Group();holder.matrixAutoUpdate=false;holder.matrix.copy(skeleton.boneInverses[i]);holder.name=`outfit:${object.name}`;holder.add(object);skeleton.bones[i].add(holder);holder.visible=false;(groups[object.name]??=[]).push(holder);object.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});}
 const mat=(color,o={})=>new MeshStandardMaterial({color,roughness:.6,metalness:0,...o});
 const m=s=>s*unit,fz=s=>s*unit*front;
 const eyeMid=eyeLeft.clone().add(eyeRight).multiplyScalar(.5),eyeHalf=Math.max(m(.026),eyeLeft.distanceTo(eyeRight)/2);
 const headHalfW=Math.max(m(.072),hairBounds.size.x/2),lensZ=eyeMid.z+fz(.017);
 function eyewear(name,{kind,lens='#111',frame='#222',tint=.85}){
  const g=new Group();g.name=name;const frameM=mat(frame,{roughness:.35,metalness:.3}),lensM=kind==='glasses'?mat('#dfe8ef',{roughness:.05,metalness:.1,transparent:true,opacity:.16,depthWrite:false}):mat(lens,{roughness:.08,metalness:.55,envMapIntensity:1.2});
  // 스포츠 선글라스: 크고 살짝 감싸는 두 렌즈 + 위쪽 일자 테
  if(kind==='sport'){for(const sgn of [-1,1]){const e=sgn>0?eyeLeft:eyeRight,l=new Mesh(new SphereGeometry(m(.03),18,10,0,Math.PI*2,0,Math.PI*.32),lensM);l.rotation.x=front*Math.PI/2;l.scale.set(1.12,1,.72);l.position.set(e.x+sgn*m(.004),eyeMid.y-m(.002),lensZ-fz(.022));l.rotation.z=-sgn*.12;g.add(l);}
   const bar=new Mesh(new BoxGeometry(eyeHalf*2+m(.06),m(.007),m(.006)),frameM);bar.position.set(eyeMid.x,eyeMid.y+m(.02),lensZ+fz(.002));g.add(bar);}
  else{for(const e of [eyeLeft,eyeRight]){const rim=new Mesh(new TorusGeometry(m(kind==='glasses'?.021:.024),m(kind==='glasses'?.0018:.0032),6,20),frameM);rim.scale.y=kind==='glasses'?.78:.82;rim.position.set(e.x,eyeMid.y,lensZ);g.add(rim);
    const lensMesh=new Mesh(new CylinderGeometry(m(.023),m(.023),m(.002),20),lensM);lensMesh.rotation.x=Math.PI/2;lensMesh.scale.z=kind==='glasses'?.78:.82;lensMesh.position.set(e.x,eyeMid.y,lensZ);g.add(lensMesh);}
   const bridge=new Mesh(new BoxGeometry(Math.max(m(.012),eyeHalf*2-m(.046)),m(.004),m(.004)),frameM);bridge.position.set(eyeMid.x,eyeMid.y+m(.006),lensZ);g.add(bridge);}
  // 안경다리: 렌즈 바깥 끝 → 머리 옆(귀 위)으로 비스듬히
  const outer=eyeHalf+m(kind==='sport'?.03:.024);
  for(const s of [-1,1]){const S=new Vector3(eyeMid.x+s*outer,eyeMid.y+m(.008),lensZ),E=new Vector3(head.x+s*(headHalfW+m(.003)),eyeMid.y+m(.004),head.z-fz(.035));
   const d=E.clone().sub(S),t=new Mesh(new BoxGeometry(m(.003),m(.004),d.length()),frameM);t.position.copy(S).add(E).multiplyScalar(.5);t.rotation.y=Math.atan2(d.x,d.z);g.add(t);}
  return g;
 }
 const hairTop=hairBounds.max.y,hairC=hairBounds.center,hairSize=hairBounds.size;
 function cap(name,color,accent){const g=new Group();g.name=name;const cm=mat(color,{roughness:.8});
  const crown=new Mesh(new SphereGeometry(1,24,12,0,Math.PI*2,0,Math.PI/2),cm);crown.scale.set(hairSize.x/2*1.1,(hairTop-eyeMid.y-m(.035))*1.02,hairSize.z/2*1.08);crown.position.set(hairC.x,eyeMid.y+m(.035),hairC.z);g.add(crown);
  const brim=new Mesh(new CylinderGeometry(1,1,m(.006),20,1,false,-Math.PI/2,Math.PI),cm);brim.scale.set(hairSize.x/2*.95,1,m(.085));brim.rotation.y=front>0?0:Math.PI;brim.rotation.x=front*.12;brim.position.set(hairC.x,eyeMid.y+m(.04),hairC.z+fz(hairSize.z/2*.9));g.add(brim);
  const tab=new Mesh(new BoxGeometry(m(.004),m(.02),m(.03)),mat(accent));tab.position.set(hairC.x+hairSize.x/2*1.08,eyeMid.y+m(.07),hairC.z);g.add(tab);
  const button=new Mesh(new SphereGeometry(m(.008),8,6),cm);button.position.set(hairC.x,hairTop+m(.006),hairC.z);g.add(button);return g;}

 // 챙모자(4번): 챙 양옆이 위로 말린 흰 밀짚 챙모자 + 검정 띠. 기존 납작한 파나마 메시는 숨기고 머리뼈에 붙인다.
 function wideHat(name,color,band){const g=new Group();g.name=name;const hm=mat(color,{roughness:.92,side:DoubleSide}),bm=mat(band,{roughness:.7});
  const rx=hairSize.x/2*1.1,rz=hairSize.z/2*1.1,baseY=eyeMid.y+m(.052),ch=m(.082),cx=hairC.x,cz=hairC.z;
  const crown=new Mesh(new CylinderGeometry(1,1.04,ch,32,1,true),hm);crown.scale.set(rx*.97,1,rz*.97);crown.position.set(cx,baseY+ch/2,cz);g.add(crown);
  const top=new Mesh(new SphereGeometry(1,28,8,0,Math.PI*2,0,Math.PI/2),hm);top.scale.set(rx*.97,m(.03),rz*.97);top.position.set(cx,baseY+ch,cz);g.add(top);
  const bandM=new Mesh(new CylinderGeometry(1.012,1.052,m(.022),32,1,true),bm);bandM.material.side=DoubleSide;bandM.scale.set(rx*.97,1,rz*.97);bandM.position.set(cx,baseY+m(.016),cz);g.add(bandM);
  const outer=m(.085),segs=48,rings=5,pos=[],idx=[];
  for(let j=0;j<=rings;j++)for(let i=0;i<=segs;i++){const a=i/segs*Math.PI*2,k=j/rings;const px=Math.cos(a)*(rx+outer*k),pz=Math.sin(a)*(rz+outer*k);
   const sideLift=Math.pow(Math.abs(Math.cos(a)),2)*m(.05)*k*k,frontDip=Math.sin(a)*front*(-1)*m(.012)*k;
   pos.push(px,sideLift+frontDip+m(.004)*(1-k),pz);}
  for(let j=0;j<rings;j++)for(let i=0;i<segs;i++){const a=j*(segs+1)+i,b=a+1,c=a+segs+1,d=c+1;idx.push(a,c,b,b,c,d);}
  const bg=new BufferGeometry();bg.setAttribute('position',new Float32BufferAttribute(pos,3));bg.setIndex(idx);bg.computeVertexNormals();
  const brim=new Mesh(bg,hm);brim.position.set(cx,baseY,cz);g.add(brim);return g;}
 // 연두 카라티: 접힌 카라 두 날개 + 앞섶 단추 3개
 function poloCollar(name,color){const g=new Group();g.name=name;const cm=mat(color,{roughness:.8,side:DoubleSide}),bm=mat('#e9eadf',{roughness:.4});
  const ty=collarTop,nz=neck.z+front*neckR.z;
  for(const s of [-1,1]){const w=new Mesh(new BoxGeometry(m(.062),m(.004),m(.05)),cm);w.position.set(neck.x+s*neckR.x*.62,ty-m(.006),neck.z+front*(neckR.z*.72));w.rotation.set(front*.55,s*front*-.5,s*front*.22);g.add(w);}
  const back=new Mesh(new CylinderGeometry(1,1.08,m(.03),24,1,true),cm);back.material.side=DoubleSide;back.scale.set(neckR.x*1.08,1,neckR.z*1.08);back.position.set(neck.x,ty-m(.012),neck.z);g.add(back);
  const frontZ=y=>{const near=jacketPts.filter(p=>Math.abs(p.y-y)<m(.012)&&Math.abs(p.x-hips.x)<m(.02));return near.length?Math.max(...near.map(p=>(p.z-spine2.z)*front)):m(.1);};
  for(let i=0;i<3;i++){const y=ty-m(.05)-i*m(.042),b=new Mesh(new CylinderGeometry(m(.006),m(.006),m(.004),10),bm);b.rotation.x=Math.PI/2;b.position.set(hips.x,y,spine2.z+front*(frontZ(y)+m(.002)));g.add(b);}
  return g;}
 function headBandana(name,color,accent){const g=new Group();g.name=name;const t=paisleyTexture(color,accent);t.repeat.set(3,1.5);const bm=new MeshStandardMaterial({map:t,roughness:.85});
  const shell=new Mesh(new SphereGeometry(1,28,14,0,Math.PI*2,0,Math.PI*.56),bm);shell.scale.set(hairSize.x/2*1.07,(hairTop-eyeMid.y-m(.045))*1.04,hairSize.z/2*1.06);shell.position.set(hairC.x,eyeMid.y+m(.045),hairC.z);g.add(shell);
  const knotZ=hairC.z-fz(hairSize.z/2*1.02),knot=new Mesh(new SphereGeometry(m(.018),10,8),bm);knot.position.set(hairC.x,eyeMid.y+m(.03),knotZ);g.add(knot);
  for(const s of [-1,1]){const tail=new Mesh(new BoxGeometry(m(.028),m(.075),m(.004)),bm);tail.position.set(hairC.x+s*m(.014),eyeMid.y-m(.012),knotZ-fz(.006));tail.rotation.z=s*.25;g.add(tail);}return g;}
 // 목: 옷깃 위쪽 둘레(타원)에 맞춘 띠 + 앞으로 늘어진 삼각 자락
 const collarPts=meshes.collar?bindPoints(meshes.collar):jacketPts.filter(p=>p.y>neck.y-m(.06));
 const collarTop=collarPts.length?Math.max(...collarPts.map(p=>p.y)):neck.y,ring=collarPts.filter(p=>p.y>collarTop-m(.05));
 const neckR={x:ring.length?Math.max(...ring.map(p=>Math.abs(p.x-neck.x))):m(.07),z:ring.length?Math.max(...ring.map(p=>Math.abs(p.z-neck.z))):m(.07)};
 function neckwear(name,color,pattern){const g=new Group();g.name=name;const texture=pattern==='check'?checkTexture(color):null;if(texture)texture.repeat.set(2,1);const nm=new MeshStandardMaterial({color:texture?'#ffffff':color,map:texture,roughness:.9,side:DoubleSide});
  const band=new Mesh(new CylinderGeometry(1,1.12,m(.045),24,1,true),nm);band.scale.set(neckR.x*1.02,1,neckR.z*1.02);band.position.set(neck.x,collarTop-m(.012),neck.z);g.add(band);
  const len=pattern==='check'?m(.16):m(.12),flap=new Mesh(new ConeGeometry(m(.06),len,3,1,true),nm);flap.rotation.set(Math.PI,front>0?Math.PI/6:-Math.PI/6+Math.PI,0);flap.scale.z=.3;
  flap.position.set(neck.x,collarTop-m(.03)-len/2,neck.z+front*(neckR.z+m(.012)));flap.rotation.x=Math.PI-front*.18;g.add(flap);
  const knot=new Mesh(new SphereGeometry(m(.016),10,8),nm);knot.position.set(neck.x,collarTop-m(.028),neck.z+front*(neckR.z+m(.012)));g.add(knot);
  if(pattern==='check')for(const s of [-1,1]){const end=new Mesh(new BoxGeometry(m(.03),m(.11),m(.004)),nm);end.position.set(neck.x+s*m(.025),collarTop-m(.09),neck.z+front*(neckR.z+m(.018)));end.rotation.z=s*.12;g.add(end);}
  return g;}
 // 허리: 바지 윗단과 상의 밑단 사이에서 바지 둘레에 맞춘 벨트
 const pantsPts=meshes.pants?bindPoints(meshes.pants):[],pantsTop=pantsPts.length?Math.max(...pantsPts.map(p=>p.y)):hips.y+m(.08);
 // 벨트를 보이는 복장(1·2번)은 상의를 벨트 위에서 넣어 입은 것처럼 밑단을 자른다(셰이더 discard). 벨트가 잘린 선을 덮는다.
 const beltY=pantsTop-m(.035),waistBand=pantsPts.filter(p=>Math.abs(p.y-beltY)<m(.02));
 const waist={x:waistBand.length?Math.max(...waistBand.map(p=>Math.abs(p.x-hips.x))):m(.17),zf:waistBand.length?Math.max(...waistBand.map(p=>(p.z-hips.z)*front)):m(.11),zb:waistBand.length?Math.max(...waistBand.map(p=>-(p.z-hips.z)*front)):m(.11)};
 const waistCz=hips.z+front*(waist.zf-waist.zb)/2,waistRz=(waist.zf+waist.zb)/2;
 info.belt={y:beltY,rx:waist.x,rz:waistRz,pantsTop,jacketHem:jacketBounds.min.y};
 function belt(name,color,buckleColor){const g=new Group();g.name=name;const bm=mat(color,{roughness:.55});
  const band=new Mesh(new CylinderGeometry(1,1,m(.04),40,1,true),bm);band.material.side=DoubleSide;band.scale.set(waist.x*1.16,1,waistRz*1.2);band.position.set(hips.x,beltY,waistCz);g.add(band);
  const buckle=new Mesh(new BoxGeometry(m(.05),m(.04),m(.008)),mat(buckleColor,{roughness:.25,metalness:.85}));buckle.position.set(hips.x,beltY,waistCz+front*(waistRz*1.2+m(.004)));g.add(buckle);
  const inner=new Mesh(new BoxGeometry(m(.032),m(.022),m(.004)),bm);inner.position.copy(buckle.position).add(new Vector3(0,0,front*m(.004)));g.add(inner);
  for(const s of [-1,1]){const loop=new Mesh(new BoxGeometry(m(.012),m(.046),m(.006)),bm);loop.position.set(hips.x+s*waist.x*.55,beltY,waistCz+front*(waistRz*1.12+m(.004)));g.add(loop);}return g;}
 function hangingGlasses(name,lens,strap){const g=new Group();g.name=name;const x0=hips.x+waist.x*.42,z0=waistCz+front*(waistRz*1.2+m(.014)),y0=beltY-m(.07);
  const fm=mat('#111214',{roughness:.3,metalness:.3}),lm=mat(lens,{roughness:.08,metalness:.6});
  for(const s of [-1,1]){const l=new Mesh(new CylinderGeometry(m(.022),m(.022),m(.003),18),lm);l.rotation.x=Math.PI/2;l.scale.z=.8;l.position.set(x0+s*m(.026),y0,z0);g.add(l);const r=new Mesh(new TorusGeometry(m(.023),m(.003),6,18),fm);r.scale.y=.8;r.position.copy(l.position);g.add(r);}
  const br=new Mesh(new BoxGeometry(m(.012),m(.004),m(.004)),fm);br.position.set(x0,y0+m(.008),z0);g.add(br);
  const cord=new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(x0-m(.05),y0+m(.004),z0),new Vector3(x0-m(.05),y0+m(.05),z0+front*m(.004)),new Vector3(x0-m(.03),beltY,z0-front*m(.004)),new Vector3(x0+m(.03),beltY+m(.004),z0-front*m(.004)),new Vector3(x0+m(.05),y0+m(.05),z0+front*m(.004)),new Vector3(x0+m(.05),y0+m(.004),z0)]),24,m(.0025),5),mat(strap,{roughness:.9}));g.add(cord);return g;}
 // 가슴 끈(4번 검정 멜빵): 멜빵 메시 앞쪽 두 줄 사이를 가로지른다.
 const strapPts=meshes.straps?bindPoints(meshes.straps).filter(p=>(p.z-spine2.z)*front>0):[];
 const chestY=spine2.y+m(.02),chestStraps=strapPts.filter(p=>Math.abs(p.y-chestY)<m(.04));
 const strapX={l:chestStraps.filter(p=>p.x>hips.x).reduce((a,p)=>Math.min(a,p.x),Infinity),r:chestStraps.filter(p=>p.x<=hips.x).reduce((a,p)=>Math.max(a,p.x),-Infinity)},strapZ=chestStraps.length?Math.max(...chestStraps.map(p=>(p.z-spine2.z)*front)):m(.13);
 if(!Number.isFinite(strapX.l))strapX.l=hips.x+m(.09);if(!Number.isFinite(strapX.r))strapX.r=hips.x-m(.09);
 function sternum(name){const g=new Group();g.name=name;const sm=mat('#121214',{roughness:.85});const w=strapX.l-strapX.r+m(.02);
  const s=new Mesh(new BoxGeometry(w,m(.02),m(.006)),sm);s.position.set((strapX.l+strapX.r)/2,chestY,spine2.z+front*(strapZ+m(.006)));g.add(s);
  const b=new Mesh(new BoxGeometry(m(.04),m(.028),m(.012)),mat('#1d1e21',{roughness:.4}));b.position.copy(s.position);g.add(b);
  for(const x of [strapX.l,strapX.r]){const ad=new Mesh(new BoxGeometry(m(.03),m(.016),m(.008)),mat('#2a2b2f',{roughness:.4}));ad.position.set(x,chestY-m(.11),spine2.z+front*(strapZ+m(.004)));g.add(ad);}return g;}
 function phone(name,color,cord){const g=new Group();g.name=name;const x=strapX.l+m(.005),z=spine2.z+front*(strapZ+m(.02)),y=chestY-m(.2);
  const body=new Mesh(new BoxGeometry(m(.07),m(.14),m(.009)),mat(color,{roughness:.35}));body.position.set(x,y,z);g.add(body);
  const screen=new Mesh(new BoxGeometry(m(.06),m(.12),m(.001)),mat('#0b1020',{roughness:.1,metalness:.3}));screen.position.set(x,y,z-front*m(.005));g.add(screen);
  const ringM=new Mesh(new TorusGeometry(m(.008),m(.0018),6,12),mat('#c9ccd1',{metalness:.9,roughness:.25}));ringM.position.set(x,y+m(.075),z);g.add(ringM);
  const lanyard=new Mesh(new TubeGeometry(new CatmullRomCurve3([new Vector3(x,y+m(.082),z),new Vector3(x+m(.004),y+m(.13),z+front*m(.004)),new Vector3(strapX.l,chestY-m(.06),spine2.z+front*(strapZ+m(.004)))]),12,m(.002),5),mat(cord,{roughness:.9}));g.add(lanyard);return g;}
 // 상의 지퍼 손잡이(2·3번): 지퍼 메시 최상단 앞
 const zipPts=meshes.zipper?bindPoints(meshes.zipper):[],zipTop=zipPts.length?zipPts.reduce((a,p)=>p.y>a.y?p:a):neck.clone();
 function zipPull(name,color){const g=new Group();g.name=name;const pm=mat(color,{roughness:.3,metalness:.6});const tab=new Mesh(new BoxGeometry(m(.012),m(.03),m(.004)),pm);tab.position.set(zipTop.x,zipTop.y-m(.03),zipTop.z+front*m(.007));g.add(tab);
  const slider=new Mesh(new BoxGeometry(m(.014),m(.012),m(.007)),pm);slider.position.set(zipTop.x,zipTop.y-m(.012),zipTop.z+front*m(.004));g.add(slider);return g;}
 const built=new Map();
 const ensure=(key,boneName,make)=>{if(!built.has(key)){const o=make();o.name=key;place(boneName,o);built.set(key,o);}return groups[key];};
 const originals={zipper:meshes.zipper?.material,pack:meshes.pack?.material,straps:meshes.straps?.material};
 const packBlack=meshes.pack?Object.assign(meshes.pack.material.clone(),{}):null;packBlack?.color.set('#2a2b2e');
 const strapsBlack=meshes.straps?meshes.straps.material.clone():null;strapsBlack?.color.set('#1b1c1f');
 let current=null;
 function apply(id){
  const o=outfitById(id)??outfitById(DEFAULT_OUTFIT);current=o.id;const t=o.top,u=topUniforms;
  u.uBase.value.set(t.base);u.uSideL.value.set(t.side?.left??t.base);u.uSideR.value.set(t.side?.right??t.base);u.uCenter.value.set(t.center??t.base);
  u.uPanel.value=t.center?2:t.side?1:0;u.uHemY.value=(o.belt?beltY+m(.012):beltY-m(.045))/unit;u.uHem.value=t.sleeve==='short'?.3:2;u.uArmOn.value=o.armSleeve?1:0;u.uArmSleeve.value.set(o.armSleeve??'#f0f0ee');
  u.uZipOn.value=t.zip?1:0;u.uZip.value.set(t.zip??'#000');u.uPattern.value=t.pattern==='floral'?1:0;u.uAccent.value.set(t.accent??'#3f63b8');
  u.uPlacket.value=t.placket?1:0;
  u.uLogoOn.value=t.logo?1:0;if(t.logo){const L=t.logo,patchLogo=L.size==='patch';u.uLogoShape.value={picture:1,shield:2,oval:3}[L.shape]??0;u.uLogoU.value=(L.side==='left'?1:-1)*halfW*.25;u.uLogoY.value=neckY-(patchLogo?.15:.13);u.uLogoW.value=L.shape==='oval'?.011:L.shape==='shield'?.017:patchLogo?.028:.018;u.uLogoH.value=L.shape==='oval'?.0065:L.shape==='shield'?.021:patchLogo?.032:.012;u.uLogo.value.set(L.color);u.uLogo2.value.set(L.inner??L.color);u.uLogo3.value.set(L.emblem??L.color);}
  if(pantsMaterial){pantsUniforms.uPants.value.set(o.pants.color);pantsMaterial.roughness=o.pants.roughness;pantsMaterial.normalScale?.setScalar(o.pants.fit==='slim'?.55:o.pants.fit==='wide'?.95:.8);pantsUniforms.uPLogoOn.value=o.pants.logo?1:0;if(o.pants.logo)pantsUniforms.uPLogo.value.set(o.pants.logo.color);}
  if(meshes.zipper){meshes.zipper.visible=!!t.zip;if(t.zip){meshes.zipper.material=originals.zipper.clone();meshes.zipper.material.color.set(t.zip);}}
  const hat=o.head.hat;if(meshes.hat){meshes.hat.visible=false;}
  if(meshes.hair)meshes.hair.visible=hat?.kind!=='bandana';
  if(meshes.pack)meshes.pack.material=o.pack==='black-straps'?packBlack:originals.pack;if(meshes.straps)meshes.straps.material=o.pack==='black-straps'?strapsBlack:originals.straps;
  const want=new Set();const need=(key,bone,make)=>{ensure(key,bone,make);want.add(key);};
  if(o.head.eyewear)need(`eyewear-${o.id}`,'Head',()=>eyewear('',o.head.eyewear));
  if(hat?.kind==='cap')need(`cap-${o.id}`,'Head',()=>cap('',hat.color,hat.accent));
  if(hat?.kind==='panama')need(`wide-hat-${o.id}`,'Head',()=>wideHat('',hat.color,hat.band));
  if(o.top.placket)need(`polo-collar-${o.id}`,'Spine2',()=>poloCollar('',t.collar));
  if(hat?.kind==='bandana')need(`head-bandana-${o.id}`,'Head',()=>headBandana('',hat.color,hat.accent));
  if(o.neck)need(`neck-${o.id}`,'Neck',()=>neckwear('',o.neck.color,o.neck.pattern));
  if(o.belt)need(`belt-${o.id}`,'Hips',()=>belt('',o.belt.color,o.belt.buckle));
  if(o.waist)need(`waist-glasses-${o.id}`,'Hips',()=>hangingGlasses('',o.waist.lens,o.waist.strap));
  if(t.zip)need(`zip-pull-${o.id}`,'Spine2',()=>zipPull('',t.zip));
  if(o.pack==='black-straps')need(`sternum-${o.id}`,'Spine2',()=>sternum(''));
  if(o.phone)need(`phone-${o.id}`,'Spine2',()=>phone('',o.phone.color,o.phone.cord));
  for(const [key,holders] of Object.entries(groups))for(const h of holders)h.visible=want.has(key);
  root.userData.outfit=o.id;return o.id;
 }
 return {apply,get current(){return current;},outfits:OUTFITS,info,attachments:()=>Object.fromEntries(Object.entries(groups).map(([k,h])=>[k,h.some(x=>x.visible)])),meshes:Object.fromEntries(Object.entries(meshes).map(([k,v])=>[k,{name:v.name,visible:v.visible}]))};
}
