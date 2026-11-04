import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshBasicMaterial,DoubleSide} from 'three';
import {gridMesh,ribbon,densifyRoute} from '../assets/realistic/load-landscape.js';
import {stairTerrainClearance} from '../assets/realistic/terrain-clearance.js';
import {surfaceIndex} from '../assets/realistic/surface-index.js';
import {stairSteps,createStairBase,stairGapReport,STAIR_GAP_LIMIT,STAIR_LIFT} from '../assets/realistic/stair-base.js';
import {assignSurfaceRoute,isStairSurface,SURFACE_SECTIONS} from '../src/route-surfaces.js';

// 실제 코스(route.json)와 같은 노면 배정·세분. 지형은 경로 높이에 성토(경로보다 낮음)·절토(높음)를 섞은 합성 지형이다.
const routeSource=JSON.parse(readFileSync(new URL('../assets/realistic/generated/route.json',import.meta.url)));
const points=densifyRoute(assignSurfaceRoute(routeSource));
const material=new MeshBasicMaterial({side:DoubleSide});
function nearestY(x,z){let best=Infinity,y=0;for(let i=0;i<points.length;i+=4){const p=points[i],d=(p.x-x)**2+(p.z-z)**2;if(d<best){best=d;y=p.y;}}return y;}
// 앱의 2m 청크(gridMesh + 계단 회랑 보정)를 같은 방식으로 만들어 삼각형 높이를 조회한다.
function terrainModel(offset){
 const clear=stairTerrainClearance(points),cache=new Map();
 return (x,z)=>{const cx=Math.floor(x/64)*64,cz=Math.floor(z/64)*64,key=`${cx},${cz}`;
  if(!cache.has(key)){const mesh=gridMesh(cx,cz,64,2,(x,z)=>nearestY(x,z)+offset(x,z),material,1);clear(mesh.geometry);cache.set(key,surfaceIndex(mesh));}
  return cache.get(key)(x,z);};
}
const terrains={
 '성토 1.2m':(x,z)=>-1.2+.3*Math.sin(x*.7)*Math.cos(z*.5),
 '절토 2m':(x,z)=>2+.6*Math.sin(x*.31+z*.17),
 '굴곡 ±1.5m':(x,z)=>1.5*Math.sin(x*.9)*Math.sin(z*.8),
};

test('정상 계단 제거: 7구간(정상 직전)에 계단 노면이 없고 바위·흙 맨 지면이다',()=>{
 const summit=SURFACE_SECTIONS.find(s=>s.id===7);
 assert.ok(summit.shares.every(([m])=>!isStairSurface(m)));
 assert.ok(summit.shares.every(([m])=>['ridge','rock','soil'].includes(m)));
 const end=points.at(-1).s;
 assert.ok(points.filter(p=>isStairSurface(p.material)).every(p=>p.s<end-150),'정상 150m 안에 계단 단이 없다');
});

test('모든 계단 구간: 측벽·끝면 아래 끝과 지면 사이 틈 0.05m 이하, 지형이 디딤판을 뚫지 않는다',()=>{
 const steps=stairSteps(points),bandCount=new Set(steps.map(s=>s.band)).size;
 assert.ok(steps.length>2000&&bandCount>=3);
 for(const [name,offset] of Object.entries(terrains)){
  const ground=terrainModel(offset),{group,layout}=createStairBase(points,ground,{stairs:material,deck_stairs:material});
  const r=stairGapReport(layout,ground);
  assert.equal(r.bands,bandCount);assert.equal(r.steps,steps.length);assert.equal(r.missing,0,name);
  assert.ok(r.maxGap<=STAIR_GAP_LIMIT,`${name}: 틈 ${r.maxGap.toFixed(3)}m @ ${JSON.stringify(r.worstGap)}`);
  assert.ok(r.maxPoke<=.005,`${name}: 지형 솟음 ${r.maxPoke.toFixed(3)}m @ ${JSON.stringify(r.worstPoke)}`);
  // 측벽은 디딤판 위로 올라오지 않는다(걷는 면을 가리지 않음).
  const wall=surfaceIndex(group);
  for(const s of steps.filter((_,i)=>i%7===0)){const x=(s.a.x+s.b.x)/2,z=(s.a.z+s.b.z)/2,h=wall(x,z);assert.ok(h===undefined||h<=s.top+1e-4);}
  group.traverse(o=>o.geometry?.dispose());
 }
});

test('걷는 높이(노면 띠)는 계단 디딤판 높이와 같다',()=>{
 const path=ribbon(points,material,1),road=surfaceIndex(path),steps=stairSteps(points);
 let worst=0;
 for(const s of steps)for(const t of [.2,.5,.8]){
  const x=s.a.x+(s.b.x-s.a.x)*t,z=s.a.z+(s.b.z-s.a.z)*t,h=road(x,z,s.top+1,3);
  assert.ok(Number.isFinite(h));worst=Math.max(worst,Math.abs(h-s.top));
 }
 assert.ok(worst<.01,`디딤판과 걷는 면 차이 ${worst}`);
 assert.equal(STAIR_LIFT,.015);
 path.traverse(o=>o.geometry?.dispose());
});
