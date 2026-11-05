import * as THREE from 'three';
import {EffectComposer} from 'three/addons/postprocessing/EffectComposer.js';
import {RenderPass} from 'three/addons/postprocessing/RenderPass.js';
import {ShaderPass} from 'three/addons/postprocessing/ShaderPass.js';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {Pass,FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import {TOON,bloomFor,gradeFor,outlineFor,outlineWidth,phaseWeights} from './palette.js';
// 카툰 후처리: RenderPass → 외곽선(화면 공간 깊이+법선) → UnrealBloom → 색보정 → Output(톤매핑·sRGB).
// 낮은 화질(0)·모바일은 외곽선 가장자리 버퍼와 블룸을 절반 해상도로 돌린다.

// 깊이 5점으로 시선 공간 위치를 복원해 ① 깊이 단절(실루엣) ② 네 사분면 법선 차이(접힌 모서리)를 함께 잡는다.
// 법선 버퍼를 따로 그리지 않아 장면을 한 번만 렌더한다.
const EDGE_SHADER={
 uniforms:{tDepth:{value:null},tColor:{value:null},cameraNear:{value:.1},cameraFar:{value:30000},projInv:{value:new THREE.Matrix4()},texStep:{value:new THREE.Vector2(1/1024,1/1024)},
  depthEdge:{value:TOON.outline.depthEdge},normalEdge:{value:TOON.outline.normalEdge},fadeNear:{value:TOON.outline.fadeNear},fadeFar:{value:TOON.outline.fadeFar}},
 vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
 fragmentShader:`#include <packing>
 uniform sampler2D tDepth,tColor;uniform float cameraNear,cameraFar,depthEdge,normalEdge,fadeNear,fadeFar;uniform mat4 projInv;uniform vec2 texStep;varying vec2 vUv;
 vec3 viewPos(vec2 uv){float d=texture2D(tDepth,uv).x;vec4 p=projInv*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
 void main(){
  float dc=texture2D(tDepth,vUv).x;
  if(dc>=.99999){gl_FragColor=vec4(0.);return;}
  vec3 c=viewPos(vUv),r=viewPos(vUv+vec2(texStep.x,0.)),l=viewPos(vUv-vec2(texStep.x,0.)),u=viewPos(vUv+vec2(0.,texStep.y)),d=viewPos(vUv-vec2(0.,texStep.y));
  float z=max(-c.z,1e-3);
  // ① 실루엣: 이웃과의 최대 깊이 차를 거리로 나눠 원근에 무관하게.
  float jump=max(max(abs(r.z-c.z),abs(l.z-c.z)),max(abs(u.z-c.z),abs(d.z-c.z)))/z;
  float silhouette=smoothstep(depthEdge,depthEdge*2.5,jump);
  // ② 접힌 모서리: 마주 보는 사분면 법선 각도 차.
  vec3 n1=normalize(cross(r-c,u-c)),n2=normalize(cross(u-c,l-c)),n3=normalize(cross(l-c,d-c)),n4=normalize(cross(d-c,r-c));
  float bend=1.-min(dot(n1,n3),dot(n2,n4));
  float crease=smoothstep(normalEdge,normalEdge+.3,bend)*(1.-smoothstep(.05,.2,jump));
  float edge=max(silhouette,crease*.75);
  // 외곽선 제외 표시(알파 < .75: 풀잎·물). 자신이나 이웃이 표시돼 있으면 선을 긋지 않는다(풀밭이 검은 잡음으로 덮이지 않게).
  float keep=min(texture2D(tColor,vUv).a,min(min(texture2D(tColor,vUv+vec2(texStep.x,0.)).a,texture2D(tColor,vUv-vec2(texStep.x,0.)).a),min(texture2D(tColor,vUv+vec2(0.,texStep.y)).a,texture2D(tColor,vUv-vec2(0.,texStep.y)).a)));
  edge*=step(.75,keep);
  // 원경으로 갈수록 0(산 능선이 검은 선으로 뒤덮이지 않게).
  edge*=1.-smoothstep(fadeNear,fadeFar,z);
  gl_FragColor=vec4(edge,0.,0.,1.);
 }`,
};
const COMPOSITE_SHADER={
 uniforms:{tDiffuse:{value:null},tEdge:{value:null},outlineColor:{value:new THREE.Color()},outlineStrength:{value:1}},
 vertexShader:EDGE_SHADER.vertexShader,
 fragmentShader:`uniform sampler2D tDiffuse,tEdge;uniform vec3 outlineColor;uniform float outlineStrength;varying vec2 vUv;
 void main(){vec4 c=texture2D(tDiffuse,vUv);float e=texture2D(tEdge,vUv).r*outlineStrength;gl_FragColor=vec4(mix(c.rgb,outlineColor,clamp(e,0.,1.)),1.);}`,
};

export class ToonOutlinePass extends Pass{
 constructor(camera){
  super();this.camera=camera;this.scale=1;this.width=1;this.size=new THREE.Vector2(1,1);
  this.edgeTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:false});this.edgeTarget.texture.name='toon-outline-edges';
  this.edgeMaterial=new THREE.ShaderMaterial({...EDGE_SHADER,uniforms:THREE.UniformsUtils.clone(EDGE_SHADER.uniforms),depthTest:false,depthWrite:false});
  this.compositeMaterial=new THREE.ShaderMaterial({...COMPOSITE_SHADER,uniforms:THREE.UniformsUtils.clone(COMPOSITE_SHADER.uniforms),depthTest:false,depthWrite:false});
  this.compositeMaterial.uniforms.tEdge.value=this.edgeTarget.texture;
  this.quad=new FullScreenQuad(this.edgeMaterial);
 }
 setScale(scale,width){this.scale=scale;this.width=width;this.setSize(this.size.x,this.size.y);}
 setSize(w,h){
  this.size.set(w,h);this.edgeTarget.setSize(Math.max(1,Math.round(w*this.scale)),Math.max(1,Math.round(h*this.scale)));
  // 두께는 최종 화면 픽셀 기준(1px, 고화질 1.5px).
  this.edgeMaterial.uniforms.texStep.value.set(this.width/Math.max(1,w),this.width/Math.max(1,h));
 }
 render(renderer,writeBuffer,readBuffer){
  const u=this.edgeMaterial.uniforms;
  u.tDepth.value=readBuffer.depthTexture;u.tColor.value=readBuffer.texture;u.cameraNear.value=this.camera.near;u.cameraFar.value=this.camera.far;u.projInv.value.copy(this.camera.projectionMatrixInverse);
  this.quad.material=this.edgeMaterial;renderer.setRenderTarget(this.edgeTarget);this.quad.render(renderer);
  this.compositeMaterial.uniforms.tDiffuse.value=readBuffer.texture;this.quad.material=this.compositeMaterial;
  renderer.setRenderTarget(this.renderToScreen?null:writeBuffer);this.quad.render(renderer);
 }
 dispose(){this.edgeTarget.dispose();this.edgeMaterial.dispose();this.compositeMaterial.dispose();this.quad.dispose();}
}

// 색보정(톤매핑 전 선형 HDR): 채도·대비, 밝은 곳 시간대 틴트(청량/앰버/네이비), 그늘 청록(노을엔 보라 섞임).
export const GRADE_SHADER={
 name:'ToonGrade',
 uniforms:{tDiffuse:{value:null},saturation:{value:1},contrast:{value:1},lift:{value:0},shadowGain:{value:0},highlight:{value:new THREE.Color(1,1,1)},highlightAmount:{value:0},shadow:{value:new THREE.Color(1,1,1)},shadowAmount:{value:0}},
 vertexShader:EDGE_SHADER.vertexShader,
 fragmentShader:`uniform sampler2D tDiffuse;uniform float saturation,contrast,lift,shadowGain,highlightAmount,shadowAmount;uniform vec3 highlight,shadow;varying vec2 vUv;
 float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
 // 색상만 남긴 단위 밝기 색. 짙은 남색처럼 밝기가 낮은 색도 채널이 튀지 않게 2배로 묶고 다시 밝기 1로 맞춘다.
 vec3 hue(vec3 c){vec3 h=min(c/max(luma(c),1e-3),vec3(2.));return h/max(luma(h),1e-3);}
 void main(){
  vec4 t=texture2D(tDiffuse,vUv);vec3 c=t.rgb;float l=luma(c);
  c=mix(vec3(l),c,saturation);
  // 그늘 바닥 올림: 아주 어두운 면일수록 크게(최대 1+shadowGain배), 중간톤부터는 그대로.
  c*=1.+shadowGain*(1.-smoothstep(.01,.16,l));
  c=max(vec3(0.),.18+(c-.18)*contrast);
  float hi=smoothstep(.2,1.,l),sh=1.-smoothstep(.015,.22,l);
  c*=mix(vec3(1.),hue(highlight),highlightAmount*(.35+.65*hi));
  c=mix(c,max(l,.002)*hue(shadow),sh*shadowAmount);
  c+=lift*hue(highlight)*(1.-hi);
  gl_FragColor=vec4(c,t.a);
 }`,
};

// 블룸 밝기 추출에 상한을 둔다(점광원 옆 면이 화면 전체로 번쩍이는 것 방지, rendering.js capBloomInput과 같은 방식).
function capBloom(bloom,cap=6){
 const m=bloom.materialHighPassFilter,anchor='vec4 texel = texture2D( tDiffuse, vUv );';
 if(!m?.fragmentShader?.includes(anchor))return false;
 m.fragmentShader=m.fragmentShader.replace(anchor,`${anchor}\nif(any(isnan(texel))||any(isinf(texel)))texel=vec4(0.);\ntexel.rgb*=min(1.,${cap.toFixed(2)}/max(luminance(texel.rgb),1e-4));`);
 m.needsUpdate=true;return true;
}

export function createToonPipeline({renderer,scene,camera,mobile=false}){
 const size=renderer.getDrawingBufferSize(new THREE.Vector2());
 const target=new THREE.WebGLRenderTarget(Math.max(1,size.x),Math.max(1,size.y),{type:THREE.HalfFloatType});
 target.depthTexture=new THREE.DepthTexture(Math.max(1,size.x),Math.max(1,size.y));target.depthTexture.type=THREE.UnsignedIntType;
 const composer=new EffectComposer(renderer,target);
 const renderPass=new RenderPass(scene,camera),outline=new ToonOutlinePass(camera);
 const bloom=new UnrealBloomPass(new THREE.Vector2(size.x,size.y),TOON.bloom.day.strength,TOON.bloom.day.radius,TOON.bloom.day.threshold);
 capBloom(bloom);
 let bloomScale=1;const bloomSetSize=bloom.setSize.bind(bloom);
 bloom.setSize=(w,h)=>bloomSetSize(Math.max(1,Math.round(w*bloomScale)),Math.max(1,Math.round(h*bloomScale)));
 const grade=new ShaderPass(GRADE_SHADER),output=new OutputPass();
 for(const pass of [renderPass,outline,bloom,grade,output])composer.addPass(pass);
 const status={quality:null,mobile,half:false,outline:{enabled:true,scale:1,width:1,color:TOON.outline.day},bloom:{...TOON.bloom.day,scale:1},grade:null,phase:null,passes:['RenderPass','ToonOutline','UnrealBloom','ToonGrade','Output']};
 const hex=c=>'#'+c.getHexString();
 function resize(quality=1,w=innerWidth,h=innerHeight,dpr=1){
  const half=mobile||quality===0;bloomScale=half?.5:1;
  outline.setScale(half?.5:1,outlineWidth(quality));
  composer.setPixelRatio(dpr);composer.setSize(w,h);
  Object.assign(status,{quality,half});Object.assign(status.outline,{scale:outline.scale,width:outline.width});status.bloom.scale=bloomScale;
 }
 function update(env={}){
  const w=phaseWeights(env),b=bloomFor(env),g=gradeFor(env),o=outlineFor(env);
  bloom.threshold=b.threshold;bloom.strength=b.strength;bloom.radius=b.radius;
  const u=grade.uniforms;u.saturation.value=g.saturation;u.contrast.value=g.contrast;u.lift.value=g.lift;u.shadowGain.value=g.shadowGain;
  u.highlight.value.setRGB(...g.highlight,THREE.SRGBColorSpace);u.highlightAmount.value=g.highlightAmount;
  u.shadow.value.setRGB(...g.shadow,THREE.SRGBColorSpace);u.shadowAmount.value=g.shadowAmount;
  outline.compositeMaterial.uniforms.outlineColor.value.setRGB(...o.color,THREE.SRGBColorSpace);
  Object.assign(status.bloom,b);status.outline.color=hex(outline.compositeMaterial.uniforms.outlineColor.value);
  status.grade=g;status.phase=w;
  return status;
 }
 function render(dt){composer.render(dt);}
 function dispose(){outline.dispose();bloom.dispose();grade.material.dispose();output.dispose?.();composer.dispose();target.depthTexture?.dispose();}
 return {composer,passes:{renderPass,outline,bloom,grade,output},resize,update,render,dispose,status};
}
