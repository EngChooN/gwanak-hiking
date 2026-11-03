// 비·눈 입자: 카메라 주변 상자 안에서 GPU가 위치를 감아 돌린다(CPU 갱신 없음, 드로콜 1개).
// 양(0~1)은 보이는 입자 수 비율이다. 비는 낙하 방향으로 늘어진 선, 눈은 점이다.
import * as THREE from 'three';
export const RAIN_MAX=7000,SNOW_MAX=4500,BOX=[40,24,40];
export const RAIN_SPEED=8.5,SNOW_SPEED=1.1;
function seeds(count,seed=1){let s=seed;const r=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};const a=new Float32Array(count*4);for(let i=0;i<count;i++){a[i*4]=r();a[i*4+1]=r();a[i*4+2]=r();a[i*4+3]=(i+.5)/count;}return a;}
const COMMON=`
uniform float uTime,uAmount;uniform vec3 uCam,uBox;uniform vec3 uVel;
attribute vec4 aSeed;
vec3 rel(vec4 sd){vec3 o=sd.xyz*uBox+uVel*uTime;return mod(o-uCam+uBox*0.5,uBox)-uBox*0.5;}
`;
function rainMaterial(){
 return new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{uTime:{value:0},uAmount:{value:0},uCam:{value:new THREE.Vector3()},uBox:{value:new THREE.Vector3(...BOX)},uVel:{value:new THREE.Vector3(1,-RAIN_SPEED,0)},uColor:{value:new THREE.Color(.75,.8,.9)},uAlpha:{value:.32},uLen:{value:.55}},
  vertexShader:COMMON+`attribute float aEnd;uniform float uLen;varying float vA;
void main(){vec3 p=rel(aSeed);float on=step(aSeed.w,uAmount);vec3 dir=normalize(uVel);p-=dir*uLen*aEnd;
 vec4 mv=viewMatrix*vec4(uCam+p,1.0);gl_Position=projectionMatrix*mv;if(on<0.5)gl_Position=vec4(2.0,2.0,2.0,1.0);
 vA=(1.0-aEnd*0.8)*smoothstep(1.0,6.0,-mv.z);}`,
  fragmentShader:`uniform vec3 uColor;uniform float uAlpha;varying float vA;void main(){gl_FragColor=vec4(uColor,uAlpha*vA);}`});
}
function snowMaterial(){
 return new THREE.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{uTime:{value:0},uAmount:{value:0},uCam:{value:new THREE.Vector3()},uBox:{value:new THREE.Vector3(...BOX)},uVel:{value:new THREE.Vector3(.4,-SNOW_SPEED,0)},uColor:{value:new THREE.Color(.95,.97,1)},uScale:{value:600}},
  vertexShader:COMMON+`uniform float uScale;varying float vA;
void main(){vec3 p=rel(aSeed);p.x+=sin(uTime*0.9+aSeed.y*40.0)*0.35;p.z+=cos(uTime*0.7+aSeed.x*40.0)*0.35;float on=step(aSeed.w,uAmount);
 vec4 mv=viewMatrix*vec4(uCam+p,1.0);gl_Position=projectionMatrix*mv;if(on<0.5)gl_Position=vec4(2.0,2.0,2.0,1.0);
 gl_PointSize=clamp(uScale*(0.03+0.03*aSeed.z)/max(-mv.z,0.5),1.2,9.0);vA=smoothstep(0.8,4.0,-mv.z);}`,
  fragmentShader:`uniform vec3 uColor;varying float vA;void main(){float d=length(gl_PointCoord-0.5)*2.0;float a=smoothstep(1.0,0.2,d);gl_FragColor=vec4(uColor,0.85*a*vA);}`});
}
export function createPrecipitation(){
 const group=new THREE.Group();group.name='Precipitation';
 const rg=new THREE.BufferGeometry(),n=RAIN_MAX,sd=seeds(n,7),pos=new Float32Array(n*2*3),seed2=new Float32Array(n*2*4),end=new Float32Array(n*2);
 for(let i=0;i<n;i++)for(let k=0;k<2;k++){seed2.set(sd.subarray(i*4,i*4+4),(i*2+k)*4);end[i*2+k]=k;}
 rg.setAttribute('position',new THREE.BufferAttribute(pos,3));rg.setAttribute('aSeed',new THREE.BufferAttribute(seed2,4));rg.setAttribute('aEnd',new THREE.BufferAttribute(end,1));
 const rain=new THREE.LineSegments(rg,rainMaterial());rain.frustumCulled=false;rain.renderOrder=900;rain.visible=false;rain.name='Rain';
 const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.BufferAttribute(new Float32Array(SNOW_MAX*3),3));sg.setAttribute('aSeed',new THREE.BufferAttribute(seeds(SNOW_MAX,13),4));
 const snow=new THREE.Points(sg,snowMaterial());snow.frustumCulled=false;snow.renderOrder=901;snow.visible=false;snow.name='Snow';
 group.add(rain,snow);
 // 양과 풍속(m/s, 비에 기울기를 준다)을 받아 매 프레임 갱신한다.
 function update({time,camera,rain:r=0,snow:s=0,wind=0,viewHeight=900,fov=65}){
  rain.visible=r>.01;snow.visible=s>.01;
  const tilt=Math.min(6,wind)*.6;
  if(rain.visible){const u=rain.material.uniforms;u.uTime.value=time;u.uAmount.value=r;u.uCam.value.copy(camera.position);u.uVel.value.set(tilt,-RAIN_SPEED,tilt*.4);}
  if(snow.visible){const u=snow.material.uniforms;u.uTime.value=time;u.uAmount.value=s;u.uCam.value.copy(camera.position);u.uVel.value.set(tilt*.5,-SNOW_SPEED,tilt*.2);u.uScale.value=viewHeight/(2*Math.tan(fov*Math.PI/360))*.9;}
 }
 const dispose=()=>{rain.geometry.dispose();rain.material.dispose();snow.geometry.dispose();snow.material.dispose();};
 return {group,rain,snow,update,dispose};
}
