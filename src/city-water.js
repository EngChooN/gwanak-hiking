import * as THREE from 'three';
import {CITY_LIGHT} from './city-facade.js';

// 한강 물빛·다리 구조·밤 거리 불빛(산풍경).
// 물: 바람 물결 법선(여러 방향 사인 합) → 프레넬로 하늘(연무색) 반사와 짙은 녹회색 물 몸체를 섞는다. 해 반짝임·노을빛·밤 도시 불빛 일렁임.
// 원경에서 물결이 픽셀보다 작아지면 법선을 평평하게 줄여 반짝임이 지글거리지 않게 한다.
export function seoulWaterMaterial(){
 const material=new THREE.MeshBasicMaterial({color:0xffffff,side:THREE.DoubleSide});
 material.onBeforeCompile=shader=>{
  Object.assign(shader.uniforms,CITY_LIGHT);
  shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 hanWorld;')
   .replace('#include <worldpos_vertex>','#include <worldpos_vertex>\nhanWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 hanWorld;
uniform float cityNight;uniform float cityDusk;uniform float cityTime;uniform float cityDetail;uniform vec3 citySun;
vec3 hanEmit;
float hanHash(vec2 p){p=fract(p*vec2(233.34,851.73));p+=dot(p,p+23.45);return fract(p.x*p.y);}
vec2 hanWave(vec2 p,vec2 d,float k,float speed,float amp){float ph=dot(p,d)*k+cityTime*speed;return d*cos(ph)*k*amp;}`)
   .replace('#include <color_fragment>',`#include <color_fragment>
hanEmit=vec3(0.0);
{
 vec3 V=normalize(cameraPosition-hanWorld);
 float dist=length(cameraPosition-hanWorld);
 #ifdef USE_FOG
 vec3 skyC=fogColor;
 #else
 vec3 skyC=vec3(.78,.84,.9);
 #endif
 // 물결 기울기. 화면에서 한 물결이 2픽셀보다 작으면 그 성분을 줄인다(fwidth = 픽셀당 미터).
 float mpp=max(fwidth(hanWorld.x),fwidth(hanWorld.z));
 vec2 p=hanWorld.xz,slope=vec2(0.0);
 #define HAN_FADE(k) (1.0-smoothstep(.15,.4,mpp*(k)/6.283))
 slope+=hanWave(p,normalize(vec2(.8,.6)),.045,1.1,.9)*HAN_FADE(.045);
 slope+=hanWave(p,normalize(vec2(-.3,.95)),.11,1.7,.55)*HAN_FADE(.11);
 slope+=hanWave(p,normalize(vec2(.95,-.25)),.23,2.3,.30)*HAN_FADE(.23)*cityDetail;
 slope+=hanWave(p,normalize(vec2(-.7,-.7)),.51,3.1,.16)*HAN_FADE(.51)*cityDetail;
 // 바람 얼룩: 수백 m 단위로 물결이 센 곳(어둡고 거침)과 잔잔한 곳(하늘이 또렷이 비침)이 섞인다.
 vec2 wq=hanWorld.xz/420.0+vec2(cityTime*.004,0.0);vec2 wi=floor(wq),wf=fract(wq);wf=wf*wf*(3.0-2.0*wf);
 float hanPatch=mix(mix(hanHash(wi),hanHash(wi+vec2(1,0)),wf.x),mix(hanHash(wi+vec2(0,1)),hanHash(wi+vec2(1,1)),wf.x),wf.y);
 vec2 wq2=hanWorld.xz/130.0+vec2(0.0,cityTime*.01);vec2 wj=floor(wq2),wg=fract(wq2);wg=wg*wg*(3.0-2.0*wg);
 hanPatch=clamp(hanPatch*.7+.3*mix(mix(hanHash(wj+7.0),hanHash(wj+vec2(8,7)),wg.x),mix(hanHash(wj+vec2(7,8)),hanHash(wj+vec2(8,8)),wg.x),wg.y),0.0,1.0);
 slope*=mix(.6,1.5,hanPatch);
 vec3 N=normalize(vec3(-slope.x*.35,1.0,-slope.y*.35));
 float cosV=max(dot(N,V),0.0);
 float fres=(.02+.98*pow(1.0-cosV,5.0))*mix(1.0,.78,hanPatch);
 vec3 R=reflect(-V,N);
 // 하늘 반사: 수평선 근처는 연무색, 위로 갈수록 조금 짙은 푸른색. 노을엔 주황빛.
 vec3 sky=mix(skyC,skyC*vec3(.78,.88,1.06),clamp(R.y*3.0,0.0,1.0));
 sky=mix(sky,sky*vec3(1.3,.86,.6),cityDusk*.7);
 // 맞은편 강변 건물·산이 비치는 어두운 띠(반사 각이 수평선 아래로 내려간 곳).
 sky*=mix(.62,1.0,smoothstep(-.02,.06,R.y));
 vec3 body=vec3(.16,.21,.21)*diffuseColor.rgb;
 diffuseColor.rgb=body*(1.0-fres);
 hanEmit+=sky*fres*mix(.95,.6,hanPatch)*(1.0-cityNight*.75);
 // 해 반짝임(물결마다 흩어진 점).
 float glint=pow(max(dot(R,citySun),0.0),260.0)*step(0.0,citySun.y);
 hanEmit+=glint*vec3(2.4,2.1,1.6)*(1.0-cityNight);
 // 밤: 강변 불빛이 물결에 세로로 늘어진 일렁임.
 if(cityNight>.01){
  vec2 q=vec2(hanWorld.x*.02,hanWorld.z*.02);
  float shimmer=pow(hanHash(floor(q*vec2(1.0,6.0)+vec2(0.0,floor(cityTime*2.0)))),26.0);
  hanEmit+=vec3(1.0,.72,.42)*shimmer*cityNight*.35*fres+vec3(.03,.035,.05)*cityNight*fres;
 }
}`)
   .replace('#include <opaque_fragment>','#include <opaque_fragment>\ngl_FragColor.rgb+=hanEmit;');
 };
 material.customProgramCacheKey=()=> 'seoul-han-water-v1';
 return material;
}

// 교량 구조: 데크 두께(양옆 측판)와 교각. 위 데크는 기존 seoulRoadGeometry가 그린다(높이 규칙 동일).
export function seoulBridgeStructure(roads,heightAt){
 const positions=[],colors=[],side=new THREE.Color(0x77776f),pier=new THREE.Color(0x8d8c84);
 const quad=(a,b,c,d,col)=>{for(const v of [a,c,b,b,c,d]){positions.push(...v);colors.push(col.r,col.g,col.b);}};
 const box=(cx,cz,dx,dz,w,l,y0,y1,col)=>{
  // dx,dz: 길 방향 단위벡터. l: 길 방향 길이, w: 가로 폭.
  const nx=-dz,nz=dx,c=[[-l/2,-w/2],[l/2,-w/2],[l/2,w/2],[-l/2,w/2]].map(([a,b])=>[cx+dx*a+nx*b,cz+dz*a+nz*b]);
  for(let i=0;i<4;i++){const [ax,az]=c[i],[bx,bz]=c[(i+1)%4];quad([ax,y1,az],[bx,y1,bz],[ax,y0,az],[bx,y0,bz],col);}
 };
 for(const road of roads){if(!road.bridge)continue;
  let carry=0;
  for(let i=1;i<road.points.length;i++){
   const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.1)continue;
   const deck=Math.max(24,heightAt(ax,az),heightAt(bx,bz))+2,ux=dx/len,uz=dz/len,w=road.width/2,nx=-uz*w,nz=ux*w;
   // 데크 측판 2.4m(양쪽).
   for(const s of [1,-1])quad([ax+nx*s,deck,az+nz*s],[bx+nx*s,deck,bz+nz*s],[ax+nx*s,deck-2.4,az+nz*s],[bx+nx*s,deck-2.4,bz+nz*s],side);
   // 교각: 약 60m 간격. 지면(수면 아래까지)부터 데크 밑까지.
   for(let t=60-carry;t<len;t+=60){const x=ax+ux*t,z=az+uz*t,g=Math.min(heightAt(x,z),4);if(deck-2.4-g>3)box(x,z,ux,uz,road.width*.72,3,g-1,deck-2.4,pier);}
   carry=(carry+len)%60;
  }
 }
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.computeVertexNormals();return g;
}

// 밤 거리 불빛: 간선도로 가로등(주황·흰빛)과 다리 난간 조명. 점 하나가 화면 몇 픽셀인 Points 1회 제출.
// 순서를 섞어 두어, 가벼운 단계는 drawRange 앞부분만 그려도 고르게 줄어든다.
export function seoulRoadLights(roads,heightAt,{spacing=38,bridgeSpacing=22}={}){
 const items=[];let seed=12345;const rand=()=>(seed=(seed*16807)%2147483647)/2147483647;
 for(const road of roads){
  const bridge=!!road.bridge,step=bridge?bridgeSpacing:spacing,major=/motorway|trunk|primary/.test(road.kind??'')||road.width>=16;
  let carry=rand()*step,side=1;
  for(let i=1;i<road.points.length;i++){
   const [ax,az]=road.points[i-1],[bx,bz]=road.points[i],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);if(len<.1)continue;
   const ux=dx/len,uz=dz/len,w=road.width/2+.5;
   for(let t=step-carry;t<len;t+=step){
    const x=ax+ux*t,z=az+uz*t;
    for(const s of bridge||major?[1,-1]:[side]){
     const px=x-uz*w*s,pz=z+ux*w*s,y=bridge?Math.max(24,heightAt(ax,az),heightAt(bx,bz))+2+1.5:heightAt(px,pz)+9;
     const c=bridge?[.75,.7,.6]:rand()<.55?[1,.62,.28]:[.95,.92,.82];
     items.push([px,y,pz,...c,bridge?1.25:major?1:.8]);
    }
    side=-side;
   }
   carry=(carry+len)%step;
  }
 }
 for(let i=items.length-1;i>0;i--){const j=Math.floor(rand()*(i+1));[items[i],items[j]]=[items[j],items[i]];}
 const positions=new Float32Array(items.length*3),colors=new Float32Array(items.length*3),sizes=new Float32Array(items.length);
 items.forEach((v,i)=>{positions.set(v.slice(0,3),i*3);colors.set(v.slice(3,6),i*3);sizes[i]=v[6];});
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(positions,3));g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.setAttribute('lampSize',new THREE.BufferAttribute(sizes,1));
 const material=new THREE.ShaderMaterial({
  uniforms:{...CITY_LIGHT,pixelRatio:{value:1}},
  vertexShader:`attribute vec3 color;attribute float lampSize;uniform float cityNight;uniform float pixelRatio;varying vec3 vColor;varying float vAlpha;
void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);gl_Position=projectionMatrix*mv;float d=length(mv.xyz);
 // 먼 불빛일수록 연무에 묻혀 흐려진다. 쌍안경(투영 배율↑)에서는 점이 조금 커진다.
 float zoom=clamp(projectionMatrix[1][1]/1.57,1.0,10.0);
 gl_PointSize=clamp(lampSize*(1.6+zoom*.28)*pixelRatio,1.0,7.0);
 vColor=color;vAlpha=cityNight*exp(-d/16000.0)*mix(.75,1.0,lampSize);}`,
  fragmentShader:`varying vec3 vColor;varying float vAlpha;void main(){float r=length(gl_PointCoord-.5)*2.0;float a=smoothstep(1.0,.15,r);if(vAlpha*a<.003)discard;gl_FragColor=vec4(vColor*vAlpha*a*1.15,1.0);}`,
  transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false,
 });
 const points=new THREE.Points(g,material);points.name='서울 밤 거리 불빛';points.frustumCulled=false;points.userData.lampCount=items.length;
 // 낮에는 그리지 않는다(빈 제출 방지). 화질 낮음은 1/3만.
 points.onBeforeRender=renderer=>{material.uniforms.pixelRatio.value=renderer.getPixelRatio();};
 points.userData.update=quality=>{points.visible=CITY_LIGHT.cityNight.value>.02;g.setDrawRange(0,quality===0?Math.floor(items.length/3):items.length);};
 return points;
}
