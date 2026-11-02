import {Document,NodeIO} from '@gltf-transform/core';
import {KHRMaterialsUnlit} from '@gltf-transform/extensions';
import {readFileSync,writeFileSync} from 'node:fs';
import {inventory} from '../inventory.mjs';
import {gridHeight,nearestRoute,cutHeight,mix} from '../geo.js';
const folder=new URL('../generated/',import.meta.url),nature=new URL('nature/',folder),io=new NodeIO().registerExtensions([KHRMaterialsUnlit]);
const photos=JSON.parse(readFileSync(new URL('impostor-audit.json',nature)));
for(const [id,meta] of Object.entries(photos))for(const [level,planes] of [[1,4],[2,2]]){
 const doc=new Document(),buffer=doc.createBuffer(),s=meta.size/2,c=meta.center;
 const texture=doc.createTexture().setImage(new Uint8Array(readFileSync(new URL(`${id}-impostor.png`,nature)))).setMimeType('image/png');
 const material=doc.createMaterial().setBaseColorTexture(texture).setAlphaMode('MASK').setAlphaCutoff(.3).setDoubleSided(true).setExtension('KHR_materials_unlit',doc.createExtension(KHRMaterialsUnlit).createUnlit());
 const pos=[],uv=[],ix=[];
 for(let i=0;i<planes;i++){const a=i*Math.PI/planes,x=Math.cos(a)*s,z=Math.sin(a)*s;pos.push(-x,c-s,-z,x,c-s,z,-x,c+s,-z,x,c+s,z);uv.push(0,1,1,1,0,0,1,0);const k=i*4;ix.push(k,k+1,k+2,k+1,k+3,k+2);}
 const accessor=(type,array)=>doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);
 const prim=doc.createPrimitive().setAttribute('POSITION',accessor('VEC3',new Float32Array(pos))).setAttribute('TEXCOORD_0',accessor('VEC2',new Float32Array(uv))).setIndices(accessor('SCALAR',new Uint16Array(ix))).setMaterial(material);
 doc.getRoot().setDefaultScene(doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim))));await io.write(new URL(`${id}-lod${level}.glb`,nature).pathname,doc);
}
const meta=inventory().near,bytes=readFileSync(new URL('near.f32',folder)),grid={...meta,values:new Float32Array(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))},route=JSON.parse(readFileSync(new URL('route.json',folder)));
const h=(x,z)=>gridHeight(grid,x,z);
const floor=(x,z)=>{const hit=nearestRoute(route,x,z),a=route[hit.index],b=route[hit.index+1];return cutHeight(h(x,z)+mix(a.elevationCorrection??0,b.elevationCorrection??0,hit.t)*Math.exp(-((hit.distance/300)**2)),hit);};
let seed=9327;const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
const trees=Object.keys(photos),rocks=['rock_09','boulder_01'],groups=new Map(),cells=[],counts={trees:0,rocks:0};
function add(id,p,kind){p.y=+floor(p.x,p.z).toFixed(3);const key=`${id}:${Math.floor(p.x/128)}:${Math.floor(p.z/128)}`;if(!groups.has(key))groups.set(key,{id,kind,levels:[0,1,2].map((i)=>({url:`${id}-lod${i}.glb`,distance:[0,kind==='tree'?40:90,kind==='tree'?120:240][i]})),placements:[]});groups.get(key).placements.push(p);counts[kind==='tree'?'trees':'rocks']++;}
for(let z=meta.z0+32;z<meta.z0+(meta.height-1)*8-32;z+=16)for(let x=meta.x0+32;x<meta.x0+(meta.width-1)*8-32;x+=16){
 const y=h(x,z),slope=Math.atan(Math.hypot((h(x+8,z)-h(x-8,z))/16,(h(x,z+8)-h(x,z-8))/16))*180/Math.PI,hit=nearestRoute(route,x,z);
 const density=y<80? .38:Math.max(.08,.76*(1-Math.max(0,slope-20)/42)*(1-Math.max(0,y-430)/260));
 cells.push({x,z,elevation:+y.toFixed(2),slope:+slope.toFixed(2),density:+density.toFixed(3),canopyHeight:null});
 if(hit.distance>850)continue;
 const px=x+(rand()-.5)*12,pz=z+(rand()-.5)*12,near=nearestRoute(route,px,pz);
 if(near.distance>7&&rand()<density*(near.distance<150?1:.23)&&counts.trees<10000){const id=trees[rand()<(y>400?.65:.4)?Math.floor(rand()*2):2+Math.floor(rand()*2)];add(id,{x:+px.toFixed(2),z:+pz.toFixed(2),y:+floor(px,pz).toFixed(3),scale:+(.75+rand()*.5).toFixed(3),yaw:rand()*Math.PI*2},'tree');}
 if(slope>31&&y>220&&near.distance>12&&rand()<.11&&counts.rocks<450){const id=rocks[Math.floor(rand()*rocks.length)];add(id,{x:+px.toFixed(2),z:+pz.toFixed(2),y:+floor(px,pz).toFixed(3),scale:+(1.1+rand()*1.8).toFixed(3),yaw:rand()*Math.PI*2,embed:.22},'rock');}
}
const index={version:1,library:[...trees,'rock_09','rock_face_01','rock_face_02','boulder_01','mountainside'].map(id=>({id,levels:[0,1,2].map(i=>`${id}-lod${i}.glb`)})),seed:9327,coordinateSystem:'+X east, -Z north, Y up, metres',heightContract:'y=보정 floorHeight; 앱은 동일 함수로 재접지. embed는 scale 적용 전 미터.',canopySource:null,canopyNote:'DSM은 표면 고도이며 DTM·CHM이 없어 수관 높이를 산출하지 않았다. 밀도는 경사·표고 기반 시각화 가정이다.',budget:{totalTrees:counts.trees,totalRocks:counts.rocks,visibleDistance:950,lodDistances:[0,40,120],chunkSize:128,description:'30fps 검증 대상은 본 생성 개수·1440×900 데스크톱 Chrome. 상향은 재측정 필요.'},counts,instances:[...groups.values()]};
writeFileSync(new URL('index.json',nature),JSON.stringify(index));writeFileSync(new URL('forest-density.json',nature),JSON.stringify({version:1,spacing:16,canopySource:null,cells}));console.log(counts,'청크',groups.size,'밀도 셀',cells.length);
