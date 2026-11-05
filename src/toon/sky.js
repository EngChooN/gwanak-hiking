import * as THREE from 'three';
import {skyFor} from './palette.js';
// 애니풍 하늘 돔: 낮 청량 그라데이션+뭉게구름, 노을 앰버·보라, 밤 네이비+쏟아지는 별(HDR로 블룸을 받는다).
// 카메라를 따라다니며 가장 먼저(renderOrder -1000, 깊이 무시) 그려 30km 원경 도시도 가리지 않는다.
const VERT=`
varying vec3 vSkyDir;
void main(){
 vSkyDir=normalize(position);
 vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);
 gl_Position=p.xyww;
}`;
const FRAG=`
uniform vec3 skyZenith,skyHorizon,skyCloud,skyCloudShade,skySun,skyMoon,skySunColor;
uniform float skyStars,skyCover,skyTime,skySunVis,skyMoonVis;
varying vec3 vSkyDir;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){
 vec3 d=normalize(vSkyDir);float up=max(d.y,0.);
 // 지평선 쪽이 넓게 밝은 애니풍 그라데이션.
 vec3 col=mix(skyHorizon,skyZenith,pow(smoothstep(-.02,.75,d.y),.6));
 if(d.y<0.)col=mix(skyHorizon,skyHorizon*.82,smoothstep(0.,-.25,d.y));
 // 해 원반·후광(HDR), 달.
 float sd=max(dot(d,skySun),0.);
 col+=skySunColor*(pow(sd,8.)*.35+pow(sd,90.)*.6)*skySunVis;
 col+=skySunColor*smoothstep(.9994,.9997,sd)*6.*skySunVis;
 float md=max(dot(d,skyMoon),0.);
 col+=vec3(.9,.94,1.)*(smoothstep(.99965,.9998,md)*3.5+pow(md,200.)*.25)*skyMoonVis;
 // 별: 방향 격자 칸마다 하나, 깜빡임. 지평선 근처는 옅게.
 if(skyStars>.001){
  vec3 a=abs(d);vec2 uv=a.x>a.y&&a.x>a.z?d.yz/a.x:a.y>a.z?d.xz/a.y:d.xy/a.z;
  vec2 cell=floor(uv*260.),f=fract(uv*260.)-.5;float h=hash(cell+sign(d.x)*3.+sign(d.y)*7.+sign(d.z)*11.);
  float star=step(.965,h)*smoothstep(.13,0.,length(f-vec2(hash(cell+.3),hash(cell+.7))*.4+.2));
  float tw=.65+.35*sin(skyTime*(2.+h*5.)+h*40.);
  col+=vec3(.85,.9,1.)*star*tw*skyStars*mix(.6,1.6,fract(h*37.))*smoothstep(.02,.25,d.y);
 }
 // 뭉게구름: 하늘 평면에 투영한 fbm을 두 단으로 끊는다(밝은 면/그늘 면). 바람에 천천히 흐른다.
 if(d.y>.01){
  vec2 p=d.xz/(d.y+.12)*1.4+vec2(skyTime*.004,skyTime*.0015);
  float n=fbm(p)+fbm(p*2.7+3.1)*.35;
  float edge=1.12-skyCover*.55;
  float body=smoothstep(edge,edge+.04,n);
  float lit=smoothstep(edge+.1,edge+.14,n+fbm(p*1.9-vec2(.04,.08))*.18);
  vec3 cloud=mix(skyCloudShade,skyCloud,lit);
  col=mix(col,cloud,body*smoothstep(.01,.12,d.y));
 }
 gl_FragColor=vec4(col,1.);
}`;

export function createToonSky({radius=20000}={}){
 const uniforms={
  skyZenith:{value:new THREE.Color()},skyHorizon:{value:new THREE.Color()},skyCloud:{value:new THREE.Color()},skyCloudShade:{value:new THREE.Color()},
  skySun:{value:new THREE.Vector3(0,1,0)},skyMoon:{value:new THREE.Vector3(0,-1,0)},skySunColor:{value:new THREE.Color(1,.95,.85)},
  skyStars:{value:0},skyCover:{value:.4},skyTime:{value:0},skySunVis:{value:1},skyMoonVis:{value:0},
 };
 const material=new THREE.ShaderMaterial({name:'toon-sky',uniforms,vertexShader:VERT,fragmentShader:FRAG,side:THREE.BackSide,depthWrite:false,depthTest:false,fog:false});
 const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,48,24),material);
 mesh.name='카툰 하늘';mesh.renderOrder=-1000;mesh.frustumCulled=false;mesh.userData.toonSky=true;
 mesh.onBeforeRender=(_r,_s,camera)=>{mesh.position.copy(camera.position);mesh.updateMatrixWorld();};
 let last={};
 function update(env={},sunVector,moonVector,dt=0){
  const s=skyFor(env),set=(u,rgb)=>u.value.setRGB(...rgb,THREE.SRGBColorSpace);
  set(uniforms.skyZenith,s.zenith);set(uniforms.skyHorizon,s.horizon);set(uniforms.skyCloud,s.cloud);set(uniforms.skyCloudShade,s.cloudShade);
  if(sunVector)uniforms.skySun.value.copy(sunVector).normalize();
  if(moonVector)uniforms.skyMoon.value.copy(moonVector).normalize();
  // 해 색은 노을일수록 앰버.
  uniforms.skySunColor.value.setRGB(1,.95-.25*s.weights.sunset,.85-.45*s.weights.sunset,THREE.SRGBColorSpace);
  uniforms.skySunVis.value=(1-s.weights.night)*(1-(env.gray??0)*.8)*(uniforms.skySun.value.y>-.05?1:0);
  uniforms.skyMoonVis.value=env.moon?.visible??s.weights.night;
  uniforms.skyStars.value=s.stars;uniforms.skyCover.value=s.cloudCover;uniforms.skyTime.value+=dt;
  last=s;return s;
 }
 return {mesh,uniforms,update,get palette(){return last;},dispose(){mesh.geometry.dispose();material.dispose();}};
}
