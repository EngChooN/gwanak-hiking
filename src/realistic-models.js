import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Box3} from 'three';
import {nearDetailPlacements} from '../assets/realistic/near-detail.js';
import {mixForestEntries,FOREST_CONFIG} from '../assets/realistic/summit-config.js';
// 산풍경이 전달할 경량 GLB와 배치/LOD 목록. 원본 models-raw는 요청하거나 배포하지 않는다.
// models/index.json: {instances:[{levels:[{url,distance}],placements:[{x,z,scale,yaw}]}]}
export async function loadOptionalModels(landscape,base){
 const response=await fetch(base+'index.json');if(!response.ok||!response.headers.get('content-type')?.includes('json'))return [];
 const config=await response.json(),result=[];landscape.status.natureReady=false;landscape.status.natureCounts=config.counts;
 const detail=nearDetailPlacements(landscape.route);
 const entries=[...(config.instances??[]).map(entry=>entry.kind==='understory'?{...entry,placements:entry.placements.map(p=>({...p,scale:Math.max(.28,p.scale),embed:.035})),levels:[0,1,2].map(i=>({url:`${entry.id}-lod${i}.glb`,distance:[0,48,110][i]}))}:entry),...detail.entries];
 landscape.addGrass(detail.grass);
 let sliceStart=performance.now();
 const mixedEntries=mixForestEntries(entries);
 landscape.status.forestMix={...FOREST_CONFIG,counts:mixedEntries.reduce((counts,e)=>{if(e.kind==='tree'){const key=FOREST_CONFIG.broadleafIds.includes(e.id)?'broadleaf':'pine';counts[key]+=e.placements.length;}return counts;},{broadleaf:0,pine:0})};
 for(const entry of mixedEntries){
  // 미수령 시 기존 LOD 유지. 추가 자산도 동일 인스턴싱·Y-up·밑동 계약을 따른다.
  const distant=[entry.crossboard&&{...entry.crossboard,representation:'crossboard',distance:120},entry.id==='pine_tree_01'?{url:'pine-impostor-atlas-v1.png',representation:'impostor',distance:400}:entry.impostor&&{...entry.impostor,representation:'impostor',distance:400}].filter(Boolean);
  result.push(await landscape.addInstances({...entry,levels:[...entry.levels,...distant].map(l=>({...l,url:base+l.url}))}));
  // GLB 공유 캐시는 유지하되 인스턴스 행렬 생성 24청크가 한 작업에 몰리지 않게 한다.
  if(performance.now()-sliceStart>=4){await new Promise(r=>setTimeout(r,0));sliceStart=performance.now();}
 }
 landscape.status.nearDetail={instances:detail.entries.reduce((n,e)=>n+e.placements.length,0),grass:detail.grass.length,understoryMinimumScale:.28};
 landscape.finalizeContactOcclusion();
 landscape.status.natureReady=true;landscape.status.natureChunks=result.length;return result;
}
// 실사 등산객 전달 시 사용 가능한 스킨/애니메이션 로더. 동작 이름을 명시적으로 매핑한다.
// ground()는 자산의 IK/접지 계약이 필요하므로 최종 캐릭터 연결자가 제공한다.
export async function loadHikerModel({url,clips={},height=1.7}){
 const gltf=await new GLTFLoader().loadAsync(url),box=new Box3().setFromObject(gltf.scene),scale=height/(box.max.y-box.min.y);
 gltf.scene.scale.setScalar(scale);gltf.scene.position.y=-box.min.y*scale;
 const mixer=new AnimationMixer(gltf.scene),actions=Object.fromEntries(Object.entries(clips).map(([key,name])=>{const clip=gltf.animations.find(c=>c.name===name);if(!clip)throw new Error(`동작 누락: ${name}`);return [key,mixer.clipAction(clip)];}));
 return {scene:gltf.scene,animations:gltf.animations,actions,mixer};
}
