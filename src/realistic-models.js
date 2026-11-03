import {entranceBroadleafEntries,entranceFrame} from '../assets/realistic/entrance-scenery.js';
import {entranceSpecimenEntries} from '../assets/realistic/entrance-plaza.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {AnimationMixer,Box3} from 'three';
import {forestLayers,mossGround} from '../assets/realistic/generated/nature/forest-layers.js';
import {nearDetailPlacements} from '../assets/realistic/near-detail.js';
import {mixForestEntries,FOREST_CONFIG} from '../assets/realistic/summit-config.js';
import {colorForestEntries} from '../assets/realistic/forest-color.js';
import {structureForestEntries} from '../assets/realistic/forest-structure.js';
// 산풍경이 전달할 경량 GLB와 배치/LOD 목록. 원본 models-raw는 요청하거나 배포하지 않는다.
// models/index.json: {instances:[{levels:[{url,distance}],placements:[{x,z,scale,yaw}]}]}
export async function loadOptionalModels(landscape,base,onProgress=()=>{}){
 const response=await fetch(base+'index.json');if(!response.ok||!response.headers.get('content-type')?.includes('json'))return [];
 const config=await response.json(),result=[];landscape.status.natureReady=false;landscape.status.natureCounts=config.counts;
 const detail=nearDetailPlacements(landscape.route);
 const entries=[...(config.instances??[]).map(entry=>entry.kind==='understory'?{...entry,placements:entry.placements.map(p=>({...p,scale:Math.max(.28,p.scale),embed:.035})),levels:[0,1,2].map(i=>({url:`${entry.id}-lod${i}.glb`,distance:[0,48,110][i]}))}:entry),...detail.entries];
 landscape.addGrass(detail.grass);
 let sliceStart=performance.now();
 mossGround(landscape);
 // 입구 광장 가까운 나무(줄기·수관이 보이는 거리)는 숲 혼합·색 보정 뒤에 붙인다. natureReady에 함께 포함된다.
 const mixedEntries=[...entranceSpecimenEntries(entranceFrame(landscape.route)),...colorForestEntries(structureForestEntries(entranceBroadleafEntries([...mixForestEntries(entries,landscape.floorHeight),...forestLayers(landscape)],landscape.route),landscape.route))];
 const treeHeights=mixedEntries.filter(e=>e.kind==='tree').flatMap(e=>e.placements.map(p=>p.visualHeight).filter(Number.isFinite));
 landscape.status.treeStructure={status:'시각 높이 분포 · 현장 실측 아님',small:[4,7],medium:[8,13],tall:[16,22],tallCount:treeHeights.filter(h=>h>=16).length,maxHeight:treeHeights.reduce((max,h)=>Math.max(max,h),0)};
 landscape.status.forestMix={...FOREST_CONFIG,counts:mixedEntries.reduce((counts,e)=>{if(e.kind==='tree'){const key=FOREST_CONFIG.broadleafIds.includes(e.id)?'broadleaf':'pine';counts[key]+=e.placements.length;}return counts;},{broadleaf:0,pine:0})};
 // 로딩 화면 진행률: 실제로 인스턴스를 만든 항목 수 / 전체 항목 수.
 for(const [index,entry] of mixedEntries.entries()){
  // 미수령 시 기존 LOD 유지. 추가 자산도 동일 인스턴싱·Y-up·밑동 계약을 따른다.
  const distant=[entry.crossboard&&{...entry.crossboard,representation:'crossboard',distance:120},entry.id==='pine_tree_01'?{url:'pine-impostor-atlas-v1.png',representation:'impostor',distance:400}:entry.impostor&&{...entry.impostor,representation:'impostor',distance:400}].filter(Boolean);
  result.push(await landscape.addInstances({...entry,levels:[...entry.levels,...distant].map(l=>({...l,url:base+l.url}))}));
  // GLB 공유 캐시는 유지하되 인스턴스 행렬 생성 24청크가 한 작업에 몰리지 않게 한다.
  onProgress((index+1)/mixedEntries.length);
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
