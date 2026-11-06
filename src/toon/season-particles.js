import * as THREE from 'three';
import {SEASON_UNIFORMS} from './season.js';
// 봄 꽃잎·가을 낙엽이 흩날리는 가벼운 입자(산풍경, 2026-11-06). 카메라 둘레 상자 안에서 GPU가 위치를 감아 돌린다
// (precipitation.js와 같은 방식, CPU 갱신 없음, 드로콜 1개, 텍스처 없음). 잎 모양은 프래그먼트에서 타원으로 그린다.
// 양은 계절 가중치(봄 1, 가을 0.8)를 따르고, 여름·겨울에는 그리지 않는다. 봄 꽃잎은 높은 곳(벚나무가 적은 능선)에서 줄어든다.
export const PETAL_BOX=[34,16,34];
export function createSeasonParticles({mobile=false}={}){
 const count=mobile?140:260,seed=new Float32Array(count*4);let s=97;
 const r=()=>((s=(Math.imul(s,1664525)+1013904223)>>>0)/4294967296);
 for(let i=0;i<count;i++){seed[i*4]=r();seed[i*4+1]=r();seed[i*4+2]=r();seed[i*4+3]=(i+.5)/count;}
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(count*3),3));
 g.setAttribute('aSeed',new THREE.Float32BufferAttribute(seed,4));
 g.boundingSphere=new THREE.Sphere(new THREE.Vector3(),1e7);
 const uniforms={uTime:{value:0},uCam:{value:new THREE.Vector3()},uBox:{value:new THREE.Vector3(...PETAL_BOX)},uScale:{value:600},uLight:{value:1},uSpringHeight:{value:1},tsW:SEASON_UNIFORMS.tsW};
 const material=new THREE.ShaderMaterial({name:'toon-season-particles',transparent:true,depthWrite:false,fog:false,uniforms,
  vertexShader:`
uniform float uTime,uScale,uSpringHeight;uniform vec3 uCam,uBox;uniform vec4 tsW;
attribute vec4 aSeed;varying vec3 vColor;varying float vAlpha,vSpin;
void main(){
 // 봄은 꽃잎(분홍·흰), 가을은 낙엽(빨강·주황·노랑·갈색). 계절이 섞이는 동안은 입자마다 하나를 고른다.
 float spring=tsW.x*uSpringHeight,autumn=tsW.z*.8,amount=spring+autumn,isSpring=step(aSeed.z*(spring+autumn),spring);
 // 낙엽은 꽃잎보다 무겁게 떨어지고 크게 흔들린다.
 float fall=mix(1.15,.7,isSpring),sway=mix(1.1,.8,isSpring);
 vec3 o=aSeed.xyz*uBox+vec3(.55,-fall,.25)*uTime;
 o.x+=sin(uTime*.9+aSeed.y*40.)*sway;o.z+=cos(uTime*.7+aSeed.x*40.)*sway;
 vec3 p=mod(o-uCam+uBox*.5,uBox)-uBox*.5;
 vec4 mv=viewMatrix*vec4(uCam+p,1.);gl_Position=projectionMatrix*mv;
 if(aSeed.w>amount)gl_Position=vec4(2.,2.,2.,1.);
 gl_PointSize=clamp(uScale*mix(.075,.055,isSpring)*(.75+.5*aSeed.z)/max(-mv.z,.5),1.5,22.);
 float k=fract(aSeed.y*7.3);
 vec3 autumnC=k<.35?vec3(.75,.12,.05):k<.6?vec3(.85,.38,.06):k<.85?vec3(.9,.68,.08):vec3(.5,.28,.1);
 vec3 springC=k<.6?vec3(1.,.66,.78):vec3(1.,.88,.92);
 vColor=mix(autumnC,springC,isSpring);
 vAlpha=smoothstep(.6,2.5,-mv.z)*(1.-smoothstep(uBox.x*.35,uBox.x*.5,length(p.xz)));
 vSpin=uTime*(1.3+aSeed.x*2.)+aSeed.z*6.28;
}`,
  fragmentShader:`
uniform float uLight;varying vec3 vColor;varying float vAlpha,vSpin;
void main(){
 // 빙글 도는 작은 타원 잎(가운데가 밝고 가장자리는 조금 어둡다).
 vec2 q=gl_PointCoord-.5;float c=cos(vSpin),s=sin(vSpin);q=mat2(c,-s,s,c)*q;q.y*=1.+.7*abs(sin(vSpin*.7));
 float d=length(q*vec2(1.,1.9))*2.;if(d>1.)discard;
 gl_FragColor=vec4(vColor*uLight*mix(1.,.82,d),vAlpha*.95);
}`});
 const points=new THREE.Points(g,material);points.name='계절 꽃잎·낙엽';points.frustumCulled=false;points.renderOrder=2;
 const status={count,visible:false};
 // light: 낮 1 → 밤 약 0.25(무조명 재질이라 밤에 빛나지 않게). springHeight: 봄 꽃잎 양(높은 곳에서 줄인다).
 function update(dt,camera,{light=1}={}){
  const w=SEASON_UNIFORMS.tsW.value,on=w.x+w.z>.01;points.visible=on;status.visible=on;if(!on||!camera)return;
  uniforms.uTime.value+=Math.min(dt,.1);uniforms.uCam.value.copy(camera.position);uniforms.uLight.value=light;
  uniforms.uSpringHeight.value=1-.65*THREE.MathUtils.smoothstep(camera.position.y,250,450);
 }
 function resize(height,fov){uniforms.uScale.value=height/(2*Math.tan(fov*Math.PI/360));}
 return {points,update,resize,status,dispose(){g.dispose();material.dispose();}};
}
