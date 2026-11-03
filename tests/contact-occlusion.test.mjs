import test from 'node:test';
import assert from 'node:assert/strict';
import {MeshStandardMaterial} from 'three';
import {createContactOcclusion} from '../src/contact-occlusion.js';
test('배치 접촉 지도는 가까운 지점만 어둡게 하며 중첩·경계를 제한한다',()=>{
 const field=createContactOcclusion({x0:0,z0:0,width:17,height:17,spacing:1},{size:16});
 field.stamp(8.5,8.5,3,.7);const data=field.texture.image.data;
 assert.equal(data[0],255);assert.ok(data[8*16+8]>=163&&data[8*16+8]<180);
 const center=data[8*16+8];field.stamp(8.5,8.5,3,.7);assert.equal(data[8*16+8],center);
 field.stamp(-100,0,1,.7);assert.equal(data[0],255);
 field.setEnabled(false);assert.equal(field.status.enabled,false);field.dispose();
});
test('재질의 기존 hook 보존·직사 확산광 적용·재컴파일 없는 토글',()=>{
 const field=createContactOcclusion({x0:0,z0:0,width:17,height:17,spacing:1},{size:16});
 const material=new MeshStandardMaterial();let previousCalled=false;
 material.onBeforeCompile=()=>{previousCalled=true;};field.apply(material);
 const shader={uniforms:{},vertexShader:'#include <common>\n#include <worldpos_vertex>',fragmentShader:'#include <common>\n#include <aomap_fragment>'};
 material.onBeforeCompile(shader);assert.ok(previousCalled);
 assert.match(shader.fragmentShader,/reflectedLight.indirectDiffuse\*=contactAO/);
 assert.match(shader.fragmentShader,/reflectedLight\.directDiffuse\*=contactAO/);
 assert.doesNotMatch(shader.fragmentShader,/reflectedLight\.directSpecular\*=/);
 assert.equal(shader.uniforms.contactStrength.value,1);field.setEnabled(false);assert.equal(shader.uniforms.contactStrength.value,0);
 material.dispose();field.dispose();
});
test('지역 지도 해상도와 노면 보호·중첩 차폐 상한',()=>{
 const route=[{x:0,z:0,width:2},{x:10,z:0,width:2}];
 const field=createContactOcclusion({}, {route});
 assert.ok(field.status.metresPerTexel.every(v=>v<=.25));
 field.stamp(5,0,5,1);field.stamp(5,0,5,1);field.commit();
 const {data,width,height}=field.texture.image;
 assert.ok(Math.min(...data)>=163);
 // 경로 상자: x=-24..34, z=-24..24
 const sample=(x,z)=>data[Math.floor((z+24)/48*height)*width+Math.floor((x+24)/58*width)];
 assert.equal(sample(5,0),255);assert.ok(sample(5,3)<255);
 // 이전 보호 폭(노폭/2 + 2텍셀 + .35m)은 이 길가 지점도 지워 버렸다.
 assert.ok(sample(5,1.6)<255);assert.equal(field.status.routeMargin,.15);
 field.dispose();
});
test('0.36m 텍셀의 작은 바위는 텍셀 사이에서도 중심 차폐가 유지된다',()=>{
 // 선형 필터를 CPU에서 재현해 텍셀 위상에 따른 중심 소실을 검사한다.
 for(const phase of [0,.25,.5,.75]){
  const field=createContactOcclusion({x0:0,z0:0,width:17,height:17,spacing:.36},{size:16});
  const x=(7.5+phase)*.36,z=(7.5+phase)*.36;
  field.stamp(x,z,.45,.36);
  const {data}=field.texture.image,u=x/.36-.5,v=z/.36-.5,i=Math.floor(u),j=Math.floor(v),fx=u-i,fz=v-j;
  const value=data[j*16+i]*(1-fx)*(1-fz)+data[j*16+i+1]*fx*(1-fz)+data[(j+1)*16+i]*(1-fx)*fz+data[(j+1)*16+i+1]*fx*fz;
  assert.ok(1-value/255>.23);field.dispose();
 }
});
test('경로 지도는 GPU가 허용한 해상도 상한을 따른다',()=>{
 const field=createContactOcclusion({}, {route:[{x:0,z:0},{x:100,z:200}],maxMapSize:128});
 assert.equal(field.status.resolutionLimit,128);
 assert.ok(field.status.resolution.every(v=>v<=128));field.dispose();
});
