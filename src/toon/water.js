import * as THREE from 'three';
import {STREAM_HALF_WIDTH,STREAM_ROCK_CELL,STREAM_LEDGE_CELL,streamRock,ledgeRaise} from '../stream-water.js';
import {waterFor,TOON} from './palette.js';
// 카툰 계곡 물(4단계, 기준값 §1-1 물 #3e8878·얕은 물 #8bc6af, 참고 06_07·06_17·04_14·06_13).
// 실사 물 셰이더(stream-water.js)는 MeshBasic+onBeforeCompile이라 toonify가 단색 MeshToon으로 바꾸면 크림색 판이 된다.
// 그래서 카툰에서는 같은 기하(aStream·aFrame 속성)를 읽는 전용 ShaderMaterial로 바꿔 끼운다.
//  - 물: 맑은 청록 2단(얕은 가장자리 밝게, 가운데 짙게) + 흐름 방향 밝은 물결 줄 + 반짝임(해 쪽일수록 많이).
//  - 흰 물결선: 물가를 따라 끊어지는 흰 선, 물속 바위 둘레 고리(하류 쪽으로 길게 끌림, 바깥 고리는 퍼져 나간다).
//  - 낙수: 흰·옅은 청록 세로 줄 막 + 아래 웅덩이 흰 거품 덩어리 + 물보라 점(Points).
// 바위·턱 자리는 stream-water.js의 streamRock·streamLedge와 같은 해시라 돌 모델과 고리가 겹친다.
// 조명 영향을 받지 않는 재질이라 시간대 색은 waterFor(env)로 직접 넣는다(낮 청록 / 노을 분홍 은빛 / 밤 짙은 청회).

export const TOON_WATER_UNIFORMS={
 twTime:{value:0},
 twDeep:{value:new THREE.Color()},twShallow:{value:new THREE.Color()},twFoam:{value:new THREE.Color()},twStreak:{value:new THREE.Color()},
 twSparkle:{value:0},twGain:{value:1},twSun:{value:new THREE.Vector3(0,1,0)},twOpacity:{value:TOON.stream.opacity},
};
const COMMON=`
uniform float twTime,twSparkle,twOpacity,twGain;uniform vec3 twDeep,twShallow,twFoam,twStreak,twSun;
float twH(float n){n=fract(n*.1031);n*=n+33.33;n*=n+n;return fract(n);}
float twHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float twN(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(twHash(i),twHash(i+vec2(1,0)),f.x),mix(twHash(i+vec2(0,1)),twHash(i+vec2(1,1)),f.x),f.y);}
// 픽셀 폭으로 부드럽게 끊는 계단(카툰 경계가 계단 무늬로 깨지지 않게).
float twStep(float e,float x){float w=max(fwidth(x),1e-4);return smoothstep(e-w,e+w,x);}
`;
const STREAM_VERT=`
attribute vec2 aStream;attribute vec4 aFrame;
varying vec2 vS;varying vec3 vW;varying vec3 vV;
void main(){
 vS=aStream;vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;vV=cameraPosition-w.xyz;
 gl_Position=projectionMatrix*viewMatrix*w;
}`;
const STREAM_FRAG=`
${COMMON}
varying vec2 vS;varying vec3 vW;varying vec3 vV;
void main(){
 #ifdef TW_POND
 float across=vS.x*TW_SPAN;float halfW=TW_SPAN*(.9+.04*twN(vW.xz*.5));float dW=halfW-across;
 vec2 flow=vW.xz*vec2(1.,1.)+vec2(twTime*.08,-twTime*.05);float along=0.;
 vec2 curl=flow;float cut=1.;
 #else
 float across=vS.x*${STREAM_HALF_WIDTH.toFixed(2)};float along=vS.y;
 // 실사와 같은 물 폭(반폭 .62~.84m). 그 밖은 암반 홈이 보이도록 버린다.
 float halfW=.62+.22*twN(vec2(along*.28,3.1));float dW=halfW-abs(across);
 float q=along+twTime*.9;vec2 flow=vec2(across*2.4,q*1.1);
 // 물결 결 좌표(curl): 옆으로 완만하게 휘고(월드 잡음으로 굽이마다 다르게), cut으로 2~4m마다 끊는다.
 // 물줄기 기준 좌표를 그대로 쓰면 물길이 꺾이는 자리에서 결이 직각 지그재그로 이어진다(final3 계곡).
 vec2 curl=flow+vec2(2.4*(.16*sin(q*.8+across*1.6+twN(vW.xz*.22)*6.2832)+.08*sin(q*2.3)),0.);
 float cut=twStep(.45,twN(vec2(across*1.1+5.,q*.42)));
 #endif
 if(dW<-.02)discard;
 float dist=length(vV);
 // 색 2단: 가장자리 얕은 물은 밝은 청록, 가운데는 짙은 청록(경계는 살짝 일렁인다).
 // 얕은 띠 폭: 물줄기를 따라 0~.2m로 달라지고 군데군데 끊긴다(같은 폭 테두리로 읽히지 않게).
 float bandW=.2*smoothstep(.3,.8,twN(vec2(along*.25,across*.3+7.)))+.04*twN(flow*1.3+3.);
 float deep=twStep(bandW,dW);
 vec3 col=mix(twShallow,twDeep,deep);
 // 흐름 방향 밝은 물결 줄(「야생의 숨결」 물 표면의 옅은 결).
 float streak=twN(curl*vec2(1.3,.3)+vec2(0.,twTime*.1))*.6+twN(curl*vec2(2.8,.6)+5.)*.4;
 float near=1.-smoothstep(30.,110.,dist);
 col=mix(col,twStreak,twStep(.66,streak)*.55*near);
 // 잔물결 하이라이트: 짧고 가는 밝은 결(흐름 방향으로 조금 길고, 둥글게 휘며 끊어진다).
 float rip=twN(curl*vec2(4.,.9)+vec2(3.,-twTime*.4));
 col=mix(col,mix(twStreak,twFoam,.5),(1.-twStep(.05,abs(rip-.72)))*.45*near*cut);
 // 반짝임: 작은 칸마다 하나, 해 쪽을 볼수록·물결 꼭대기일수록 자주 켜지는 흰 점.
 vec2 sp=vec2(across*3.,(along+twTime*.9)*1.4);
 #ifdef TW_POND
 sp=vW.xz*2.2+vec2(twTime*.05,0.);
 #endif
 vec2 cell=floor(sp),f=fract(sp)-.5;float h=twHash(cell+7.1);
 vec3 V=normalize(vV);vec3 R=reflect(-V,vec3(0.,1.,0.));
 float sunFace=pow(max(dot(R,twSun),0.),3.);
 float on=step(1.-(.16+.4*sunFace),h)*(.5+.5*sin(twTime*(3.+h*6.)+h*40.));
 float dotSize=.13*(.6+.6*fract(h*13.));
 float sparkle=on*(1.-twStep(dotSize,length(f-(vec2(twHash(cell+.3),twHash(cell+.7))-.5)*.5)))*twSparkle*(1.-smoothstep(20.,70.,dist));
 // 흰 물결선: 물가를 따라(끊어지는 선) + 바위 둘레 고리 + 낙수 아래 거품.
 float foam=0.;
 #ifdef TW_POND
 float edgeLine=(1.-twStep(.08,abs(dW-.12-.05*sin(atan(vW.z,vW.x)*9.+twTime))));
 foam=max(foam,edgeLine*twStep(.35,twN(vW.xz*1.5+twTime*.1)));
 #else
 // 물가 흰 선은 물이 부딪히는 곳(드문 조각)에만. 끊김 없는 테두리는 두지 않는다(낮 배경 외곽선 0, 기준값 §2-6).
 float edgeLine=1.-twStep(.035,abs(dW-.06-.03*sin(q*2.1+across)));
 foam=max(foam,edgeLine*twStep(.72,twN(vec2(across*2.,q*.35)))*.8);
 // 낙수 바로 아래: 둥근 흰 거품 덩어리가 하류로 2~4m 흩어진다.
 float lc=floor(along/${STREAM_LEDGE_CELL.toFixed(1)}+.5);
 float lx=along-(lc*${STREAM_LEDGE_CELL.toFixed(1)}+(twH(lc*2.3+7.)-.5)*5.);
 if(twH(lc*5.1+1.)>=.4&&lx<.4&&lx>-3.5){
  float k=smoothstep(-.2,-3.,lx);
  float blob=twN(vec2(across*2.6,(along+twTime*1.4)*1.8))*.7+twN(vec2(across*6.,(along+twTime*1.4)*4.))*.3;
  foam=max(foam,twStep(.5+.42*k,blob));
  // 떨어지는 가장자리 바로 위(고인 단 끝) 흰 띠.
  foam=max(foam,(1.-twStep(.18,abs(lx-.2)))*twStep(.3,twN(vec2(across*4.,twTime))));
 }
 #endif
 col=mix(col,twFoam,clamp(foam,0.,1.));
 col+=twFoam*sparkle*1.6;
 // 알파: 가장자리는 픽셀 폭으로 녹이고, 몸통은 약간 비친다(외곽선 패스는 알파 .75 미만을 건너뛴다).
 float a=twStep(0.,dW)*mix(twOpacity,1.,max(foam,deep*.6));
 gl_FragColor=vec4(col*twGain,a);
}`;

function streamMaterial({pond=false,span=5}={}){
 const m=new THREE.ShaderMaterial({name:pond?'toon-pond':'toon-stream',uniforms:TOON_WATER_UNIFORMS,vertexShader:STREAM_VERT,fragmentShader:STREAM_FRAG,
  transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,
  defines:pond?{TW_POND:'',TW_SPAN:span.toFixed(2)}:{}});
 m.extensions={derivatives:true};m.userData.shared=true;m.userData.toonWater=true;return m;
}

// 낙수 막: 위에서 아래로 흐르는 흰 세로 줄. 가운데는 거의 하얗고 가장자리는 옅은 청록으로 풀린다.
const FALL_VERT='varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';
const FALL_FRAG=`
${COMMON}
varying vec2 vUv;
void main(){
 float lane=floor(vUv.x*14.),r=twH(lane+3.);
 float flow=fract(vUv.y*1.2-twTime*(1.3+r*.8)+r*7.);
 // 세로 줄: 칸 안에서 가운데가 굵은 둥근 줄(네모 블록처럼 보이지 않게).
 float lx=abs(fract(vUv.x*14.)-.5);
 float white=twStep(.35,flow)*(1.-twStep(.32,lx))*step(.25,twH(lane+11.));
 vec3 col=mix(mix(twShallow,twFoam,.55),twFoam,white);
 float side=1.-smoothstep(.36,.5,abs(vUv.x-.5));
 float a=side*smoothstep(0.,.06,vUv.y)*(.72+.25*white)*(1.-.35*smoothstep(.75,1.,vUv.y));
 gl_FragColor=vec4(col*twGain,a);
}`;
function fallMaterial(){
 const m=new THREE.ShaderMaterial({name:'toon-fall',uniforms:TOON_WATER_UNIFORMS,vertexShader:FALL_VERT,fragmentShader:FALL_FRAG,transparent:true,depthWrite:false,side:THREE.DoubleSide});
 m.extensions={derivatives:true};m.userData.shared=true;m.userData.toonWater=true;return m;
}

// 바위 둘레 흰 물결 고리: 물속 바위(section-scenery가 streamRock 자리에 놓은 납작 돌)마다 물 위에 작은 판을 깔고,
// 판 안에서 고리(바위에 붙은 굵은 띠 + 퍼져 나가며 끊기는 가는 선)와 하류 쪽 물살 꼬리를 그린다.
// 돌 위치는 section-scenery와 같은 방식(바위 along에 가장 가까운 물 띠 표본 행 + 옆 r.across)으로 기하에서 다시 구한다.
const RING_VERT=`
attribute vec3 aRing;varying vec3 vR;
void main(){vR=aRing;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const RING_FRAG=`
${COMMON}
varying vec3 vR;
void main(){
 vec2 d=vR.xy;float rr=vR.z,seed=rr*97.;
 // d.x 옆, d.y 상류(+). 하류(-) 쪽은 길게 끌린 꼬리.
 vec2 e=vec2(d.x,d.y*(d.y<0.?.5:1.));
 float ang=atan(e.y,e.x);
 float r=length(e)-rr*1.2-.035*sin(ang*5.+twTime*2.+seed);
 // 안쪽 띠도 끊어진 조각(바위 밑동에 부딪힌 옅은 거품)으로.
 float inner=(1.-twStep(.03,abs(r)))*step(.38,twN(vec2(ang*3.,seed+twTime*.6)));
 float ph=fract(twTime*.5+fract(seed));
 float outer=(1.-twStep(.018,abs(r-.08-ph*.32)))*(1.-ph)*step(.5,twN(vec2(ang*2.,seed)));
 float a=max(inner,outer)*.85;if(a<.01)discard;
 gl_FragColor=vec4(twFoam*twGain,a);
}`;
let ringMaterial=null;
function getRingMaterial(){
 if(!ringMaterial){ringMaterial=new THREE.ShaderMaterial({name:'toon-rock-ring',uniforms:TOON_WATER_UNIFORMS,vertexShader:RING_VERT,fragmentShader:RING_FRAG,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
  ringMaterial.extensions={derivatives:true};ringMaterial.userData.shared=true;ringMaterial.userData.toonWater=true;}
 return ringMaterial;
}
// stream 기하(buildStreamGeometry: 표본마다 7열, 가운데 열 3)에서 바위 고리 판을 만든다. 바위가 없으면 null.
export function buildRingGeometry(streamGeometry){
 const P=streamGeometry.attributes.position,S=streamGeometry.attributes.aStream,F=streamGeometry.attributes.aFrame,cols=7,rows=P.count/cols;
 if(!rows||!S)return null;
 const along=k=>S.getY(k*cols+3),a0=along(0),a1=along(rows-1),lo=Math.min(a0,a1),hi=Math.max(a0,a1);
 const pos=[],ring=[],idx=[];
 for(let c=Math.floor(lo/STREAM_ROCK_CELL);c<=Math.floor(hi/STREAM_ROCK_CELL);c++){
  const r=streamRock(c);if(!r||r.along<lo||r.along>=hi||ledgeRaise(r.along)>0)continue;
  let k=0,best=Infinity;for(let i=0;i<rows;i++){const d=Math.abs(along(i)-r.along);if(d<best){best=d;k=i;}}
  const j=k*cols+3,dx=F.getX(j),dz=F.getY(j),sx=F.getZ(j),sz=F.getW(j);
  const cx=P.getX(j)+sx*r.across,cz=P.getZ(j)+sz*r.across,cy=P.getY(j)+.012;
  // 판: 옆 ±(반경×2), 상류 +반경×2, 하류 -반경×4.5. along(+)은 하류 반대(-dir).
  const w=r.radius*2+.25,up=r.radius*2+.25,down=r.radius*4.5+.3,base=pos.length/3;
  for(const [u,v] of [[-w,-down],[w,-down],[w,up],[-w,up]]){pos.push(cx+sx*u-dx*v,cy,cz+sz*u-dz*v);ring.push(u,v,r.radius);}
  idx.push(base,base+1,base+2,base,base+2,base+3);
 }
 if(!pos.length)return null;
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aRing',new THREE.Float32BufferAttribute(ring,3));g.setIndex(idx);g.computeBoundingSphere();
 return g;
}

// 물보라: 낙수 아래 가장자리마다 점 SPRAY_PER개. 정점 셰이더에서 위·앞으로 튀어 오르며 커지고 사라진다(둥글고 가장자리가 또렷한 흰 점).
export const SPRAY_PER=30;
const SPRAY_VERT=`
uniform float twTime,twPx;attribute vec4 aSeed;varying float vA;varying float vMist;
void main(){
 float ph=fract(twTime*(.55+.35*aSeed.x)+aSeed.y);
 vec3 p=position;
 // aSeed.z: 튀는 방향(수평 각 -π~π), aSeed.w: 튀어 오르는 높이.
 float an=aSeed.z*3.1416;
 p+=vec3(cos(an)*.5*ph,(.5+.7*aSeed.w)*ph*(1.-ph)*1.8,sin(an)*.5*ph)*mix(1.,.35,step(.9,aSeed.x))+vec3(0.,.25*step(.9,aSeed.x),0.);
 vec4 mv=modelViewMatrix*vec4(p,1.);
 gl_Position=projectionMatrix*mv;
 vA=(1.-ph)*smoothstep(0.,.12,ph);
 // 넷 중 하나는 크고 옅은 안개 덩이(물보라 구름), 나머지는 작은 물방울.
 float big=step(.75,aSeed.x);
 // 열에 하나는 떨어지는 자리에 머무는 크고 부드러운 반투명 안개 덩이(06_13). 천천히 부풀며 옅어진다.
 vMist=step(.9,aSeed.x);
 gl_PointSize=twPx*mix((.06+.16*ph)*(.7+.6*aSeed.x)*(1.+2.2*big),.9+.5*ph,vMist)/max(-mv.z,.5);
 vA*=mix(1.-.45*big,.5*(1.-ph*.6),vMist);
}`;
const SPRAY_FRAG=`
uniform vec3 twFoam;uniform float twGain;varying float vA;varying float vMist;
void main(){vec2 c=gl_PointCoord-.5;float d=length(c);if(d>.5)discard;
 if(vMist>.5){gl_FragColor=vec4(twFoam*twGain,vA*smoothstep(.5,.1,d)*.8);return;}
 // 카툰 점: 안은 꽉 차고 가장자리 한 줄만 풀린다.
 float a=vA*(1.-smoothstep(.42,.5,d));gl_FragColor=vec4(twFoam*twGain*(1.-.12*smoothstep(.0,.45,d)),a*.85);}`;
const SPRAY_UNIFORMS={...TOON_WATER_UNIFORMS,twPx:{value:600}};
let sprayMaterial=null;
function getSprayMaterial(){
 sprayMaterial??=new THREE.ShaderMaterial({name:'toon-spray',uniforms:SPRAY_UNIFORMS,vertexShader:SPRAY_VERT,fragmentShader:SPRAY_FRAG,transparent:true,depthWrite:false});
 sprayMaterial.userData.shared=true;sprayMaterial.userData.toonWater=true;return sprayMaterial;
}
// fall 기하(stream-water.js buildFallGeometry: 낙수마다 3행×5열, 맨 아래 행 j=2)에서 아래 가장자리 점을 골라 물보라 점을 만든다.
export function buildSprayGeometry(fallGeometry){
 const p=fallGeometry.attributes.position,per=15,pos=[],seed=[];
 for(let base=0;base+per<=p.count;base+=per){
  for(let k=0;k<SPRAY_PER;k++){
   const t=(k+.5)/SPRAY_PER,i=Math.min(4,Math.floor(t*5)),a=base+10+i,h=n=>{const v=Math.sin((base*7.1+k*13.3+n*3.7))*43758.5453;return v-Math.floor(v);};
   pos.push(p.getX(a),p.getY(a)+.05,p.getZ(a));seed.push(h(1),h(2),(h(3)-.5)*2,h(4));
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aSeed',new THREE.Float32BufferAttribute(seed,4));g.computeBoundingSphere();
 if(g.boundingSphere)g.boundingSphere.radius+=2;
 return g;
}

export function createToonWater({materials}={}){
 const status={streams:0,ponds:0,falls:0,sprays:0,beds:0};
 const stream=streamMaterial(),ponds=new Map(),fall=fallMaterial();
 const bedTint=new THREE.Color().setRGB(...waterFor({}).bedRgb,THREE.SRGBColorSpace).multiplyScalar(1/.1);
 let bed=null;
 const key=m=>m?.customProgramCacheKey?.()??'';
 // toonify 앞에서 부른다. 바꿨으면 true(toonify가 다시 건드리지 않는다: ShaderMaterial·MeshToon은 변환 대상이 아니다).
 function swap(o){
  if(!o.isMesh||Array.isArray(o.material))return false;
  const m=o.material,k=key(m);
  if(m.userData?.fxWater){
   const pond=/-pond-/.test(k);
   if(pond){const span=Number(k.split('-pond-')[1]?.split('-')[0])||5;if(!ponds.has(span))ponds.set(span,streamMaterial({pond:true,span}));o.material=ponds.get(span);status.ponds++;}
   else{
    o.material=stream;status.streams++;
    const rg=!o.userData.toonRings&&buildRingGeometry(o.geometry);
    if(rg){const rm=new THREE.Mesh(rg,getRingMaterial());rm.name='계곡 바위 물결';rm.renderOrder=(o.renderOrder??0)+1;o.add(rm);o.userData.toonRings=rm;status.rings=(status.rings??0)+rg.index.count/6;}
   }
   return true;
  }
  if(/^fall-water-/.test(k)){
   o.material=fall;status.falls++;
   if(!o.userData.toonSpray){const s=new THREE.Points(buildSprayGeometry(o.geometry),getSprayMaterial());s.name='계곡 물보라';s.renderOrder=4;s.frustumCulled=true;o.add(s);o.userData.toonSpray=s;status.sprays++;}
   return true;
  }
  if(/^bed-rock-/.test(k)&&materials){
   // 암반 홈: 정점색(어두운 회색 약 .1) × 바위색/.1 → 해 받는 면 기준 바위색(기준값 §1-1 #a9a892) 언저리. 판 경계 무늬는 버린다.
   // 계곡 암반: 평평한 회갈색 판 대신 둥근 암괴 명암(산풍경, 3단계 바위 재작업). 육각 판처럼 보이지 않게 갈라짐 선은 긋지 않는다.
   bed??=(materials.rock??materials.basic)(bedTint,{vertexColors:true},{cell:[2.4,1.8,2.4],amt:.9,crack:0});o.material=bed;status.beds++;return true;
  }
  return false;
 }
 function update(env={},{sunVector=null,dt=0,pointScale=null,exposure=1}={}){
  const w=waterFor(env),U=TOON_WATER_UNIFORMS,set=(u,rgb)=>u.value.setRGB(...rgb,THREE.SRGBColorSpace);
  set(U.twDeep,w.deep);set(U.twShallow,w.shallow);set(U.twFoam,w.foam);set(U.twStreak,w.streak);
  U.twSparkle.value=w.sparkle;U.twOpacity.value=w.opacity;U.twTime.value+=dt;U.twGain.value=1/Math.max(.05,exposure);
  if(sunVector)U.twSun.value.copy(sunVector).normalize();
  // 물보라 점 크기: 1m 크기가 깊이 1m에서 차지하는 픽셀(화면 높이 / (2·tan(fov/2))).
  if(pointScale)SPRAY_UNIFORMS.twPx.value=pointScale;
  return w;
 }
 return {swap,update,status,materials:{stream,fall,get spray(){return getSprayMaterial();}}};
}
