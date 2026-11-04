import * as THREE from 'three';
import {Sky} from 'three/addons/objects/Sky.js';
// 물리 기반(Preetham) 맑은 하늘. 천정은 푸르고 지평선은 밝은 하늘색이며, 옅은 권운을 얹는다.
const CLOUD_FRAGMENT=`
 {
  vec3 cd=normalize(vWorldPosition-cameraPosition);
  float up=max(cd.y,0.0);
  vec2 q=cd.xz/(up+0.22)*1.7+vec2(3.1,7.4);
  float n=0.0,amp=0.5;
  for(int i=0;i<4;i++){vec2 f=fract(q),i0=floor(q);
   float a=fract(sin(dot(i0,vec2(127.1,311.7)))*43758.5453),b=fract(sin(dot(i0+vec2(1.0,0.0),vec2(127.1,311.7)))*43758.5453);
   float c=fract(sin(dot(i0+vec2(0.0,1.0),vec2(127.1,311.7)))*43758.5453),d=fract(sin(dot(i0+vec2(1.0,1.0),vec2(127.1,311.7)))*43758.5453);
   vec2 u=f*f*(3.0-2.0*f);n+=amp*mix(mix(a,b,u.x),mix(c,d,u.x),u.y);q=q*2.03+vec2(1.7,9.2);amp*=0.5;}
  float cover=smoothstep(mix(0.52,0.05,cloudCover),mix(0.78,0.42,cloudCover),n)*smoothstep(mix(0.06,0.0,cloudCover),mix(0.3,0.12,cloudCover),up)*mix(0.62,0.97,cloudCover);
  retColor=mix(retColor,cloudColor*max(retColor.b,0.62),cover);
 }
`;
// 밤하늘: 별(방향 해시), 달 원반·달무리, 서울 쪽 지평선 불빛 번짐(노을로 읽히지 않게 푸른 회색).
// 별은 방향 공간의 정육면체 칸(1/300rad) 안 구이라 어느 배율·화면비에서도 둥글다. 도시 불빛 알갱이는 도시 모형이 그린다.
const NIGHT_FRAGMENT=`
  if(nightAmt>0.002){
   float horizonFade=smoothstep(0.0,0.08,gd.y);
   vec3 sp=gd*300.0,ip=floor(sp),fp=fract(sp)-0.5;
   float h=fract(sin(dot(ip,vec3(12.9898,78.233,37.719)))*43758.5453);
   float star=step(0.9965,h)*smoothstep(0.38,0.0,length(fp))*(0.45+0.9*fract(h*91.7));
   base+=vec3(0.82,0.88,1.0)*star*starAmt*horizonFade*2.2;
   float md=dot(gd,moonDir);
   float disc=smoothstep(0.99982,0.99988,md);
   base+=vec3(1.0,0.96,0.86)*moonAmt*(disc*5.0+0.35*pow(max(md,0.0),220.0)+0.05*pow(max(md,0.0),24.0));
   float az=atan(gd.x,-gd.z),da=abs(mod(az-0.35+3.14159265,6.2831853)-3.14159265);
   float mask=smoothstep(1.4,0.25,da);
   float glow=exp(-max(gd.y,0.0)*16.0)*step(-0.03,gd.y);
   base+=vec3(0.46,0.52,0.78)*0.07*mask*glow*cityAmt;
   // 지평선의 먼 불빛 알갱이(가로 1/900·세로 1/320rad 칸)는 뺐다. 쌍안경으로 보면 북쪽 먼 산 위 하늘에 세로로 늘어진 타원 '별'로 보였다.
   // 서울 불빛은 도시 모형의 창·가로등이 맡고, 하늘 셰이더는 지평선 번짐만 그린다.
  }`;
// Preetham 모델은 태양 방향·대기 감쇠의 기준으로 두고, 화면에 나오는 색은 목표색(천정·지평선) 그라데이션으로 맞춘다.
// 모델 출력만 쓰면 Neutral 톤매핑 뒤 회청색으로 바래기 때문이다.
export function createSkyDome(profile,sunDirection,{sunGlow=true,clouds=true}={}){
  const nightLayer=sunGlow;
  const sky=new Sky();sky.scale.setScalar(30000);sky.frustumCulled=false;sky.renderOrder=-1000;sky.name='ClearSky';
  const u=sky.material.uniforms,p=profile.sky;
  u.turbidity.value=p.turbidity;u.rayleigh.value=p.rayleigh;u.mieCoefficient.value=p.mieCoefficient;u.mieDirectionalG.value=p.mieDirectionalG;
  u.sunPosition.value.fromArray(sunDirection).multiplyScalar(450000);
  u.skyGain={value:1};u.cloudCover={value:.05};u.cloudColor={value:new THREE.Color(.97,.98,1)};u.nightAmt={value:0};u.starAmt={value:0};u.moonAmt={value:0};u.moonDir={value:new THREE.Vector3(0,-1,0)};u.cityAmt={value:0};u.glowAmt={value:1};u.zenithColor={value:new THREE.Color(profile.zenith)};u.horizonColor={value:new THREE.Color(profile.horizon)};u.sunDir={value:new THREE.Vector3().fromArray(sunDirection)};
  sky.material.onBeforeCompile=shader=>{
    for(const key of ['skyGain','zenithColor','horizonColor','sunDir','cloudCover','cloudColor','nightAmt','starAmt','moonAmt','moonDir','cityAmt','glowAmt'])shader.uniforms[key]=u[key];
    const gradient=`
 {
  vec3 gd=normalize(vWorldPosition-cameraPosition);
  float gu=clamp(gd.y,0.0,1.0);
  vec3 base=mix(horizonColor,zenithColor,pow(gu,0.42));
  ${sunGlow?'float sa=max(dot(gd,sunDir),0.0);base+=glowAmt*(vec3(1.0,0.86,0.62)*(0.22*pow(sa,24.0)+0.10*pow(sa,6.0))+vec3(1.0,0.97,0.9)*(6.0*smoothstep(0.99985,0.99995,sa)));':''}
  if(gd.y<0.0)base=mix(horizonColor,horizonColor*0.55,clamp(-gd.y*4.0,0.0,1.0));
  ${nightLayer?NIGHT_FRAGMENT:''}
  retColor=base;
 }
${clouds?CLOUD_FRAGMENT:''}
 gl_FragColor = vec4( retColor*skyGain, 1.0 );`;
    shader.fragmentShader=shader.fragmentShader.replace('void main()','uniform float skyGain,cloudCover,nightAmt,starAmt,moonAmt,cityAmt,glowAmt;uniform vec3 zenithColor,horizonColor,sunDir,cloudColor,moonDir;\nvoid main()')
      .replace('gl_FragColor = vec4( retColor, 1.0 );',gradient);
  };
  sky.material.customProgramCacheKey=()=>`clear-sky-v4-${sunGlow}-${clouds}`;
  return sky;
}
// 환경광 전용: 하늘 + 낮은 채도의 땅색 반구를 PMREM으로 구워 푸른 천공광과 따뜻한 지면 반사광을 만든다.
export function bakeSkyEnvironment(renderer,profile,sunDirection,groundColor){
  const scene=new THREE.Scene(),sky=createSkyDome(profile,sunDirection,{sunGlow:false,clouds:false});sky.scale.setScalar(900);scene.add(sky);
  const ground=new THREE.Mesh(new THREE.SphereGeometry(800,32,8,0,Math.PI*2,Math.PI/2,Math.PI/2),new THREE.MeshBasicMaterial({color:groundColor,side:THREE.BackSide,toneMapped:false}));scene.add(ground);
  const gain=sky.material.uniforms.skyGain;gain.value=1/Math.max(.05,renderer.toneMappingExposure);
  const pmrem=new THREE.PMREMGenerator(renderer),target=pmrem.fromScene(scene,0,1,2000);
  pmrem.dispose();sky.material.dispose();sky.geometry.dispose();ground.material.dispose();ground.geometry.dispose();
  return target.texture;
}

// 시각·날씨(daytime.composeEnvironment 결과)를 하늘 셰이더에 반영한다. 셰이더 재컴파일 없이 uniform만 바꾼다.
export function updateSky(sky,env,sunVector,moonVector){
  const u=sky.material.uniforms;
  u.zenithColor.value.setRGB(...env.zenith,THREE.SRGBColorSpace);u.horizonColor.value.setRGB(...env.horizon,THREE.SRGBColorSpace);
  u.sunDir.value.copy(sunVector);u.moonDir.value.copy(moonVector);
  u.cloudCover.value=env.cloud;u.cloudColor.value.setRGB(...env.cloudColor);
  u.nightAmt.value=env.night;u.starAmt.value=env.stars;u.moonAmt.value=env.moon.visible*(.35+.65*env.moon.illumination);u.cityAmt.value=env.city;u.glowAmt.value=env.sunGlow;
}
