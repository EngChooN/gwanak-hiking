import * as THREE from 'three';
import {LIGHT_FX,FX_OFF} from './light-fx.js';

// 계곡 물(산디자인). 하늘색 판 대신: 흐름 방향으로 움직이는 법선 물결, 프레넬 반사(하늘·숲 색), 얕은 곳 바닥 비침(굴절·물속 자갈),
// 바위·턱 주변 흰 거품, 가장자리의 젖은 돌. 구조·수치는 추정이며 실제 계곡 지형이 아니다(폭 ~1.5m 얕은 물).
// 물줄기 좌표계: across(m, 가운데 0), along(m, 상류로 갈수록 +, 칸마다 누적). 물은 along이 줄어드는 쪽으로 흐른다.
export const STREAM_HALF_WIDTH=1.5;   // 물+젖은 둑 전체 반폭(m)
export const STREAM_ROCK_CELL=6.5;    // 물속 바위 한 칸 길이(m). 셰이더와 같은 값.
export const STREAM_LEDGE_CELL=18;    // 턱(작은 낙차) 간격(m). 셰이더와 같은 값.
const hash=n=>{n=(n*.1031)%1;n*=n+33.33;n*=n+n;return n-Math.floor(n);};
// 칸 번호 c의 물속 바위. 셰이더(sH)와 같은 식이라 돌 모델과 거품 고리가 같은 자리에 겹친다. 없는 칸은 null.
export function streamRock(c){
 if(hash(c*3.1+1)>.72)return null;
 return {across:(hash(c*7.3+2)-.5)*1.0,along:(c+.15+.7*hash(c*5.7+3))*STREAM_ROCK_CELL,radius:.2+.22*hash(c*11.9+4)};
}

// 중심선(점 배열 {x,z})을 1m 간격으로 다시 찍고 폭 방향 7열의 띠를 만든다. along0은 이 조각 시작의 누적 거리.
// points는 상류 쪽으로 갈수록 뒤에 온다. 반환: {mesh, samples, alongEnd}. samples[i]={x,z,along,dir:[x,z],side:[x,z]}
export function buildStreamGeometry(points,height,along0=0,step=1){
 const lens=[0];for(let i=1;i<points.length;i++)lens.push(lens[i-1]+Math.hypot(points[i].x-points[i-1].x,points[i].z-points[i-1].z));
 const total=lens.at(-1),count=Math.max(2,Math.round(total/step)+1),samples=[];
 for(let k=0;k<count;k++){
  const d=total*k/(count-1);let i=1;while(i<points.length-1&&lens[i]<d)i++;
  const t=(d-lens[i-1])/Math.max(1e-6,lens[i]-lens[i-1]);
  samples.push({x:points[i-1].x+(points[i].x-points[i-1].x)*t,z:points[i-1].z+(points[i].z-points[i-1].z)*t,along:along0+d});
 }
 for(let k=0;k<count;k++){
  const a=samples[Math.max(0,k-1)],b=samples[Math.min(count-1,k+1)],n=Math.hypot(b.x-a.x,b.z-a.z)||1;
  // 하류 방향 = 상류(+) 반대
  samples[k].dir=[(a.x-b.x)/n,(a.z-b.z)/n];samples[k].side=[-(b.z-a.z)/n*-1,(b.x-a.x)/n*-1];
  // side = (dir.z,-dir.x)을 쓰되 위 식과 같은 방향이 되도록 정규화.
  const dx=samples[k].dir[0],dz=samples[k].dir[1];samples[k].side=[dz,-dx];
 }
 const cols=[-1,-.62,-.3,0,.3,.62,1],pos=[],stream=[],frame=[],idx=[];
 for(let k=0;k<count;k++){const s=samples[k];for(const u of cols){
  const x=s.x+s.side[0]*u*STREAM_HALF_WIDTH,z=s.z+s.side[1]*u*STREAM_HALF_WIDTH;
  pos.push(x,height(x,z)+.035,z);stream.push(u,s.along);frame.push(s.dir[0],s.dir[1],s.side[0],s.side[1]);
  }if(k){const j=k*cols.length,p=j-cols.length;for(let c=0;c<cols.length-1;c++)idx.push(p+c,p+c+1,j+c,p+c+1,j+c+1,j+c);}}
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aStream',new THREE.Float32BufferAttribute(stream,2));g.setAttribute('aFrame',new THREE.Float32BufferAttribute(frame,4));
 g.setIndex(idx);g.computeVertexNormals();g.computeBoundingSphere();
 return {geometry:g,samples,alongEnd:samples.at(-1).along};
}
// 연못(호수): 같은 물 재질을 쓰되 흐르지 않고 가장자리만 젖은 돌로 녹인다. 원판의 정점마다 aStream=(반지름/반경,0)을 넣는다.
export function buildPondGeometry(cx,cz,radius,height,segments=28){
 const pos=[],stream=[],frame=[],idx=[],rings=[0,.35,.62,.82,.94,1.0,1.3];
 pos.push(cx,height(cx,cz)+.04,cz);stream.push(0,0);frame.push(0,-1,1,0);
 for(const r of rings.slice(1))for(let i=0;i<segments;i++){const a=i/segments*Math.PI*2,x=cx+Math.cos(a)*radius*r,z=cz+Math.sin(a)*radius*r;pos.push(x,height(x,z)+.04,z);stream.push(r,0);frame.push(0,-1,1,0);}
 for(let i=0;i<segments;i++)idx.push(0,1+(i+1)%segments,1+i);
 for(let r=0;r<rings.length-2;r++)for(let i=0;i<segments;i++){const a=1+r*segments+i,b=1+r*segments+(i+1)%segments,c=a+segments,d=b+segments;idx.push(a,b,c,b,d,c);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('aStream',new THREE.Float32BufferAttribute(stream,2));g.setAttribute('aFrame',new THREE.Float32BufferAttribute(frame,4));g.setIndex(idx);g.computeVertexNormals();g.computeBoundingSphere();
 return g;
}

const FRAGMENT_PARS=`
varying vec2 sStream;varying vec4 sFrame;varying vec3 sWorld;
uniform float fxTime;uniform float fxSunVis;uniform float fxLowSun;uniform float fxQuality;uniform float fxRain;uniform vec3 fxSun;
float sH(float n){n=fract(n*.1031);n*=n+33.33;n*=n+n;return fract(n);}
float sHash(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
float sV(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(sHash(i),sHash(i+vec2(1,0)),f.x),mix(sHash(i+vec2(0,1)),sHash(i+vec2(1,1)),f.x),f.y);}
// 흐름 방향으로 길쭉한 잔물결 높이. p=(across, along+흐름 이동). 가로로 촘촘하고 세로(흐름 방향)로 길다.
float sRip(vec2 p,float lite){
 float h=sV(p*vec2(3.4,1.15))*.55+sV(p*vec2(7.3,2.5)+9.)*.3;
 if(lite<.5)h+=sV(p*vec2(15.,5.2)+4.)*.15;else h+=.075;
 return h;
}
// 물속 자갈 색: 틈은 어둡고 돌마다 회갈색·황갈색·청회색이 섞인다.
vec3 sPebble(vec2 p){
 float n=sV(p*5.)*.6+sV(p*11.+3.)*.4;
 float tone=sV(p*2.1+7.);
 vec3 stone=mix(mix(vec3(.30,.29,.26),vec3(.47,.39,.29),smoothstep(.25,.6,tone)),vec3(.3,.33,.35),smoothstep(.6,.9,tone));
 return mix(vec3(.05,.045,.04),stone,smoothstep(.34,.52,n))*(.78+.4*sV(p*23.));
}
`;
const FRAGMENT_BODY=`
{
 float level=clamp(dot(diffuseColor.rgb,vec3(.3333)),0.,1.);   // applyBasic이 밤·흐림에 곱해 주는 밝기
 vec3 Vv=cameraPosition-sWorld;float dist=length(Vv);vec3 V=Vv/max(dist,1e-4);
 float lite=fxQuality<.5?1.:0.;
 float fade=1.-smoothstep(28.,120.,dist);
 #ifdef STREAM_POND
 float across=sStream.x*SPAN;float along=0.;
 vec2 pw=sWorld.xz;
 float q=fxTime*.05;
 float halfW=SPAN*(.9+.04*sV(sWorld.xz*.5));
 float dW=halfW-across;
 vec2 flowP=pw*1.1+vec2(q,-q*.7);
 float tail=0.;
 #else
 float across=sStream.x*${STREAM_HALF_WIDTH.toFixed(2)};float along=sStream.y;
 float speed=.85+.4*fxRain;
 float q=along+fxTime*speed;
 float halfW=.62+.22*sV(vec2(along*.28,3.1));
 float dW=halfW-abs(across);
 vec2 flowP=vec2(across,q);
 // 턱(작은 낙차): 18m마다 물이 한 번 떨어지고 그 아래로 거품이 하류로 길게 흩어진다.
 float lc=floor(along/${STREAM_LEDGE_CELL.toFixed(1)}+.5);
 float ledgeOn=step(.4,sH(lc*5.1+1.));
 float lx=along-(lc*${STREAM_LEDGE_CELL.toFixed(1)}+(sH(lc*2.3+7.)-.5)*5.);
 float lip=exp(-lx*lx/.12)*ledgeOn;
 float tail=ledgeOn*smoothstep(-4.,-.2,lx)*(1.-smoothstep(-.2,.25,lx));
 #endif
 float inside=smoothstep(-.04,.06,dW);
 float depth=(.035+.2*smoothstep(0.,.6,dW))*(.8+.4*sV(vec2(along*.5,across*.8)+1.));

 // 법선: 흐름 방향 잔물결의 기울기를 세계 좌표 축으로 옮긴다.
 vec2 e=vec2(.05,0.);
 float h0=sRip(flowP,lite),hx=sRip(flowP+e.xy,lite),hy=sRip(flowP+e.yx,lite);
 vec2 sl=vec2(hx-h0,hy-h0)/.05*fade;
 #ifdef STREAM_POND
 sl*=.12;
 vec2 nxz=-sl*.55;
 #else
 sl*=(.2+.12*fxRain+.35*tail);
 vec2 dirW=sFrame.xy,sideW=sFrame.zw;
 // along이 늘어나는 쪽은 하류의 반대(-dir)다.
 vec2 nxz=-(sl.x*sideW-sl.y*dirW);
 #endif
 vec3 N=normalize(vec3(nxz.x,1.,nxz.y));
 float cosV=max(dot(N,V),0.);

 // 얕은 곳 바닥: 법선만큼 밀려 보이는(굴절) 자갈과 햇살 그물무늬.
 vec2 refr=sl*depth*1.4;
 #ifdef STREAM_POND
 vec2 pb=pw+refr;
 #else
 vec2 pb=vec2(across,along)+refr;
 #endif
 vec3 bed=sPebble(pb)*level*vec3(.9,.98,.95);
 float caustic=0.;
 if(lite<.5){float c1=sV(pb*6.+vec2(0.,fxTime*.7)),c2=sV(pb*8.2-vec2(fxTime*.5,0.)+5.);caustic=pow(1.-abs(c1-c2),7.)*fxSunVis*.55*(1.-smoothstep(.1,.3,depth));}
 float transmit=exp(-depth*4.4);
 vec3 body=vec3(.045,.1,.085)*(.35+.65*level);
 vec3 under=mix(body,bed+caustic*vec3(.9,1.,.8)*level,transmit);

 // 반사: 가까운 쪽은 숲(가을 잎·어두운 줄기), 위쪽 나뭇잎 틈은 하늘.
 vec3 R=reflect(-V,N);
 float fres=.025+.975*pow(1.-cosV,5.);
 vec3 skyC=fogColor;
 vec3 sky=mix(skyC,skyC*vec3(.72,.86,1.1),clamp(R.y*2.5,0.,1.));
 vec2 rp=R.xz/(abs(R.y)+.2)*3.5+sWorld.xz*.02;
 vec3 forest=mix(vec3(.03,.055,.022),vec3(.2,.125,.04),sV(rp));
 forest*=(.3+.9*level)*(.75+.5*fxSunVis);
 float gap=smoothstep(.3,.9,R.y+(sV(rp*1.7+4.)-.5)*.55);
 vec3 refl=mix(forest,sky*(.55+.45*level),gap);

 // 해 반짝임(숲 그늘에서는 잎 사이로 드문드문).
 float glint=pow(max(dot(R,fxSun),0.),240.)*fxSunVis*(.35+.65*sV(pb*9.+vec2(fxTime*1.6,0.)))*(1.-lite*.5)*fade;

 vec3 col=mix(under,refl,clamp(fres,0.,.78));
 col+=glint*vec3(1.1,.95,.7);

 // 거품: 바위 둘레(하류 쪽으로 길게), 턱 아래, 물가 가는 띠.
 float foam=0.;
 #ifndef STREAM_POND
 float rc=floor(along/${STREAM_ROCK_CELL.toFixed(1)});
 for(int i=-1;i<=1;i++){
  float c=rc+float(i);
  if(sH(c*3.1+1.)<=.72){
   vec2 rr=vec2((sH(c*7.3+2.)-.5)*1.,(c+.15+.7*sH(c*5.7+3.))*${STREAM_ROCK_CELL.toFixed(1)});
   float rad=.2+.22*sH(c*11.9+4.);
   vec2 d=vec2(across-rr.x,along-rr.y);
   // 하류(along 감소) 쪽은 늘이고 상류는 짧게: 거리를 비등방으로 잰다.
   d.y*=d.y<0.?.42:1.5;
   float dd=length(d);
   foam=max(foam,(1.-smoothstep(rad*.9,rad+.5,dd))*(.65+.35*(1.-smoothstep(rad,rad+.5,dd))));
  }
 }
 foam=max(foam,lip*.95);
 foam=max(foam,tail*.55*sV(vec2(across*3.,q*.8)));
 #endif
 float edgeF=(1.-smoothstep(0.,.14,abs(dW)))*.38*step(0.,dW+.04);
 foam=max(foam,edgeF);
 float ft=sV(vec2(across*5.,q*2.2))*.6+sV(vec2(across*11.,q*4.7)+3.)*.4;
 float foamMask=smoothstep(.22,.55,foam*(.45+1.1*ft)-.06)*inside;
 vec3 foamC=vec3(.9,.93,.94)*(.2+.8*level)*(.9+.2*fxSunVis);
 col=mix(col,foamC,foamMask);

 // 젖은 돌 둑: 물가 0.6m는 어두운 젖은 자갈에서 마른 지면으로 녹아든다.
 float bank=smoothstep(-.7,-.04,dW)*(1.-inside);
 vec3 wet=sPebble(vec2(across,along)*1.15+vec2(3.,1.))*.5*level;
 wet*=.7+.3*smoothstep(-.7,0.,dW);
 col=mix(wet,col,inside);
 float aWater=inside*mix(.62,.97,1.-transmit*.85);
 float a=max(bank*.88,aWater);a=max(a,foamMask*.92);
 diffuseColor=vec4(col,a*smoothstep(0.,.02,a));
}
`;

// 물 재질. 광원 영향 없이(MeshBasic) 직접 색을 계산한다. 밝기(level)는 rendering.js의 applyBasic이 밤·흐림에 곱한 color를 읽는다.
export function streamWaterMaterial({pond=false,pondRadius=5}={}){
 const material=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 material.userData.fxWater=true;
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,{fxTime:LIGHT_FX.fxTime,fxSunVis:LIGHT_FX.fxSunVis,fxLowSun:LIGHT_FX.fxLowSun,fxQuality:LIGHT_FX.fxQuality,fxRain:LIGHT_FX.fxRain,fxSun:LIGHT_FX.fxSun});
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nattribute vec2 aStream;attribute vec4 aFrame;varying vec2 sStream;varying vec4 sFrame;varying vec3 sWorld;')
   .replace('#include <begin_vertex>','#include <begin_vertex>\nsStream=aStream;sFrame=aFrame;sWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  const defs=pond?`#define STREAM_POND\n#define SPAN ${pondRadius.toFixed(2)}\n`:'';
  // 전후 비교용(?fx=off): 예전 하늘색 단색 띠(폭 1.5m, 색 0x607d78).
  const legacy='{float la=sStream.x*'+STREAM_HALF_WIDTH.toFixed(2)+';diffuseColor=vec4(vec3(.13,.36,.5)*diffuseColor.rgb,step(abs(la),.75));}';
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',defs+'#include <common>\n'+FRAGMENT_PARS).replace('#include <color_fragment>','#include <color_fragment>\n'+(FX_OFF&&!pond?legacy:FRAGMENT_BODY));
 };
 material.customProgramCacheKey=()=>`stream-water-v1-${pond?'pond':'stream'}-${pondRadius}-${FX_OFF?'off':'on'}`;
 return material;
}

// 물가 가까이 걸을수록 큰 물소리를 내기 위한 가장 가까운 물줄기 거리(m). 중심선 조각(samples)과 점의 수평 거리.
export function distanceToStream(samples,x,z){
 let best=Infinity;
 for(let i=0;i<samples.length;i+=2){const s=samples[i],d=Math.hypot(s.x-x,s.z-z);if(d<best)best=d;}
 return best;
}
