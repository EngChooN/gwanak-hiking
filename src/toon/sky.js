import * as THREE from 'three';
import {skyFor,bearingDir,TOON,hexToRgb} from './palette.js';
// 애니풍 하늘 돔: 낮 청량 그라데이션+뭉게구름, 노을 「너의 이름은」 4단(청남→보라→분홍→살구)과 빛 받은 구름,
// 밤 청록 남색 + 둥근 별 + 은하수 + 도심 쪽 라벤더 빛무리(HDR 별은 블룸을 받는다).
// 카메라를 따라다니며 가장 먼저(renderOrder -1000, 깊이 무시) 그려 30km 원경 도시도 가리지 않는다.
// 색은 팔레트 값 그대로 보이도록 노출 배수를 skyGain으로 되돌린다(밤 노출이 하늘을 밝은 파랑으로 띄우지 않게).
const VERT=`
varying vec3 vSkyDir;
void main(){
 vSkyDir=normalize(position);
 vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
 gl_Position=p.xyww;
}`;
const S=TOON.sky.stars;
const FRAG=`
uniform vec3 skyZenith,skyMid,skyPink,skyHorizon,skyCity,skyCityDir,skyCloud,skyCloudShade,skyCloudLit,skySun,skyMoon,skySunColor,skyMilkyN,skyMilkyColor,skyMilkyDust;
uniform float skyStars,skyMilky,skyCityGlow,skyCover,skyTime,skySunVis,skyMoonVis,skyGain,skySunset,skyNight;
uniform vec3 skyBands;
varying vec3 vSkyDir;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
// 둥근 별 한 겹: 방향 격자 칸마다 하나, 화면 픽셀 크기(px)로 그린 둥근 점. 반환은 밝기.
float starLayer(vec2 uv,float cells,float share,float px,float seed){
 vec2 g=uv*cells,cell=floor(g),f=fract(g)-.5;float h=hash(cell+seed);
 if(h>share)return 0.;
 vec2 c=(vec2(hash(cell+seed+.3),hash(cell+seed+.7))-.5)*.6;
 float pix=max(fwidth(g.x),fwidth(g.y));
 float d=length(f-c)/max(pix,1e-5);
 // 또렷한 원(가장자리 1px만 풀림) + 아주 옅은 후광.
 return (1.-smoothstep(px-.6,px+.6,d))+.12*exp(-d*d/(px*px*6.));
}
void main(){
 vec3 d=normalize(vSkyDir);float y=max(d.y,0.);
 // 4단 그라데이션: 지평선 → 분홍 → 보라 → 천정.
 vec3 col=skyHorizon;
 col=mix(col,skyPink,smoothstep(0.,skyBands.x,y));
 col=mix(col,skyMid,smoothstep(skyBands.x,skyBands.y,y));
 col=mix(col,skyZenith,smoothstep(skyBands.y,skyBands.z,y));
 vec2 hz=normalize(d.xz+1e-5);
 // 노을: 해 쪽 지평선은 더 밝은 크림, 반대쪽은 보라가 내려온다.
 float toSun=dot(hz,normalize(skySun.xz+1e-5))*.5+.5;
 col=mix(col,mix(col,skyMid,.35*(1.-smoothstep(0.,.3,y))),skySunset*(1.-toSun));
 // 밤: 도심 쪽 지평선 라벤더 빛무리.
 float city=pow(max(dot(hz,normalize(skyCityDir.xz+1e-5)),0.),2.5)*(1.-smoothstep(0.,${TOON.sky.cityGlow.height.toFixed(2)},y));
 col=mix(col,skyCity,clamp(city*skyCityGlow,0.,1.));
 if(d.y<0.)col=mix(col,col*.82,smoothstep(0.,-.25,d.y));
 // 해 원반·후광(HDR). 노을에는 원반을 작게, 후광을 넓고 부드럽게.
 float sd=max(dot(d,skySun),0.);
 col+=skySunColor*(pow(sd,mix(8.,5.,skySunset))*mix(.35,.22,skySunset)+pow(sd,90.)*mix(.6,.3,skySunset))*skySunVis;
 col+=skySunColor*smoothstep(.9994,.9997,sd)*mix(6.,3.,skySunset)*skySunVis;
 float md=max(dot(d,skyMoon),0.);
 col+=vec3(.9,.94,1.)*(smoothstep(.99965,.9998,md)*3.5+pow(md,200.)*.25)*skyMoonVis;
 vec3 a=abs(d);vec2 uv=a.x>a.y&&a.x>a.z?d.yz/a.x:a.y>a.z?d.xz/a.y:d.xy/a.z;
 float faceSeed=sign(d.x)*3.+sign(d.y)*7.+sign(d.z)*11.;
 // 은하수: 기울어진 큰 원을 따라 옅은 빛 띠 + 어두운 먼지 줄 + 띠 안 별 더 촘촘히.
 float mw=0.;
 if(skyMilky>.001){
  float off=dot(d,skyMilkyN);
  vec2 mp=uv*5.+faceSeed;
  float band=exp(-off*off/${(TOON.sky.milky.width**2).toFixed(4)})*(.55+.75*fbm(mp*1.7));
  float dust=exp(-pow(off-.025+.03*(fbm(mp*2.3)-.5),2.)/.0012)*smoothstep(.45,.7,fbm(mp*3.1+4.));
  mw=band*smoothstep(0.,.12,d.y);
  col=mix(col,skyMilkyColor,clamp(mw*skyMilky,0.,.6));
  col=mix(col,skyMilkyDust,clamp(dust*mw*skyMilky*1.2,0.,.5));
 }
 // 둥근 별: 작은 별 + 드문 밝은 별. 지평선 근처·도심 빛무리 안은 옅게.
 if(skyStars>.001){
  float boost=1.+mw*${S.milkyBoost.toFixed(2)};
  float small=starLayer(uv,${S.cells.toFixed(1)},${S.share.toFixed(3)}*boost,${S.smallPx.toFixed(2)},faceSeed);
  float big=starLayer(uv,${(S.cells/3).toFixed(1)},${S.bright.toFixed(3)},${S.brightPx.toFixed(2)},faceSeed+19.);
  float h=hash(floor(uv*${S.cells.toFixed(1)})+faceSeed);
  float tw=.75+.25*sin(skyTime*(1.5+h*4.)+h*40.);
  vec3 tint=mix(vec3(.85,.9,1.),vec3(1.,.93,.82),step(.7,fract(h*13.)));
  col+=tint*(small*${S.small.toFixed(2)}+big*${S.big.toFixed(2)})*tw*skyStars*smoothstep(.02,.22,d.y)*(1.-city*skyCityGlow*.8);
 }
 // 구름: 하늘 평면에 투영한 fbm을 단으로 끊는다(밝은 면/그늘 면). 노을은 지평선 가까이 가로로 길게 뜨고, 해 쪽 가장자리가 빛을 받는다.
 if(d.y>.01){
  vec2 p=d.xz/(d.y+.12)*1.4+vec2(skyTime*.004,skyTime*.0015);
  p*=mix(vec2(1.),vec2(.45,1.6),skySunset);
  float n=fbm(p)+fbm(p*2.7+3.1)*.35;
  float edge=1.12-skyCover*.55;
  // 노을 구름은 낮은 하늘 띠(분홍~보라)에 모인다.
  edge+=skySunset*.3*smoothstep(.1,.24,d.y);
  float body=smoothstep(edge,edge+.04,n);
  float lit=smoothstep(edge+.1,edge+.14,n+fbm(p*1.9-vec2(.04,.08))*.18);
  vec3 cloud=mix(skyCloudShade,skyCloud,lit);
  // 빛 받은 가장자리: 구름 바깥 테두리(몸통 경계 안쪽 띠). 해를 향할수록 넓고 밝다.
  float rim=body*(1.-smoothstep(edge+.02,edge+.07+.06*toSun,n));
  // 노을: 해 쪽 구름만 가장자리가 밝다(반대쪽 흰 획이 혜성처럼 보이지 않게).
  cloud=mix(cloud,skyCloudLit,rim*mix(.4+.6*toSun,smoothstep(.55,.9,toSun),skySunset)*(skySunset+skyNight*.6+(1.-skySunset-skyNight)*.3));
  col=mix(col,cloud,body*smoothstep(.01,.12,d.y));
 }
 gl_FragColor=vec4(col*skyGain,1.);
}`;

export function createToonSky({radius=20000}={}){
 const color=()=>({value:new THREE.Color()});
 const uniforms={
  skyZenith:color(),skyMid:color(),skyPink:color(),skyHorizon:color(),skyCity:color(),skyCloud:color(),skyCloudShade:color(),skyCloudLit:color(),
  skyMilkyColor:{value:new THREE.Color().setRGB(...hexToRgb(TOON.sky.milky.color),THREE.SRGBColorSpace)},skyMilkyDust:{value:new THREE.Color().setRGB(...hexToRgb(TOON.sky.milky.dust),THREE.SRGBColorSpace)},
  skySun:{value:new THREE.Vector3(0,1,0)},skyMoon:{value:new THREE.Vector3(0,-1,0)},skySunColor:{value:new THREE.Color(1,.95,.85)},
  skyCityDir:{value:new THREE.Vector3(...bearingDir(TOON.sky.cityGlow.bearing))},
  skyMilkyN:{value:new THREE.Vector3().crossVectors(new THREE.Vector3(...bearingDir(...TOON.sky.milky.from)),new THREE.Vector3(...bearingDir(...TOON.sky.milky.to))).normalize()},
  skyBands:{value:new THREE.Vector3(...TOON.sky.bands)},
  skyStars:{value:0},skyMilky:{value:0},skyCityGlow:{value:0},skyCover:{value:.4},skyTime:{value:0},skySunVis:{value:1},skyMoonVis:{value:0},skyGain:{value:1},skySunset:{value:0},skyNight:{value:0},
 };
 const material=new THREE.ShaderMaterial({name:'toon-sky',uniforms,vertexShader:VERT,fragmentShader:FRAG,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false});
 material.extensions={derivatives:true};
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,48,24),material);
 mesh.name='카툰 하늘';mesh.renderOrder=-1000;mesh.frustumCulled=false;mesh.userData.toonSky=true;
 mesh.onBeforeRender=(_r,_s,camera)=>{mesh.position.copy(camera.position);mesh.updateMatrixWorld();};
 let last={};
 // exposure: renderer.toneMappingExposure. 하늘 색이 팔레트 값으로 보이도록 나눠 준다.
 function update(env={},sunVector,moonVector,dt=0,exposure=1){
  const s=skyFor(env),set=(u,rgb)=>u.value.setRGB(...rgb,THREE.SRGBColorSpace);
  for(const k of ['Zenith','Mid','Pink','Horizon','City','Cloud','CloudShade','CloudLit'])set(uniforms[`sky${k}`],s[k[0].toLowerCase()+k.slice(1)]);
  if(sunVector)uniforms.skySun.value.copy(sunVector).normalize();
  if(moonVector)uniforms.skyMoon.value.copy(moonVector).normalize();
  // 해 색은 노을일수록 살구빛(주황을 덜어 기준 지평선 #fadfca 쪽).
  uniforms.skySunColor.value.setRGB(1,.95-.12*s.weights.sunset,.85-.2*s.weights.sunset,THREE.SRGBColorSpace);
  uniforms.skySunVis.value=(1-s.weights.night)*(1-(env.gray??0)*.8)*(uniforms.skySun.value.y>-.05?1:0);
  uniforms.skyMoonVis.value=env.moon?.visible??s.weights.night;
  uniforms.skyStars.value=s.stars;uniforms.skyMilky.value=s.milky;uniforms.skyCityGlow.value=s.cityGlow;
  uniforms.skyCover.value=s.cloudCover;uniforms.skyTime.value+=dt;
  uniforms.skySunset.value=s.weights.sunset;uniforms.skyNight.value=s.weights.night;
  uniforms.skyGain.value=1/Math.max(.05,exposure);
  last=s;return s;
 }
 return {mesh,uniforms,update,get palette(){return last;},dispose(){mesh.geometry.dispose();material.dispose();}};
}
