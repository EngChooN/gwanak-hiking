// 첫 로딩 단계별 시간 기록. performance.mark('load:<이름>')만 남기고 동작은 바꾸지 않는다.
// scripts/measure-first-load.mjs가 마크와 GLB 파싱 합계를 읽어 단계 표를 만든다.
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const glb={count:0,ms:0,maxMs:0};
export function markLoad(name){try{performance.mark(`load:${name}`);}catch{}}

// GLTFLoader.parse를 한 번만 감싸 파싱(+내장 텍스처 디코드) 시간을 더한다. 여러 파일이 겹쳐 돌면 합계가 실제 경과보다 길 수 있다.
export function installGlbTiming(){
 const proto=GLTFLoader.prototype;if(proto.__timed)return;proto.__timed=true;
 const parse=proto.parse;
 proto.parse=function(data,path,onLoad,onError){
  const t=performance.now();
  return parse.call(this,data,path,gltf=>{const ms=performance.now()-t;glb.count++;glb.ms+=ms;glb.maxMs=Math.max(glb.maxMs,ms);onLoad(gltf);},onError);
 };
}
export function loadTiming(){
 const marks=Object.fromEntries(performance.getEntriesByType('mark').filter(m=>m.name.startsWith('load:')).map(m=>[m.name.slice(5),Math.round(m.startTime)]));
 return {marks,glb:{count:glb.count,ms:Math.round(glb.ms),maxMs:Math.round(glb.maxMs)}};
}
