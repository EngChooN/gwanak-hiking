import test from 'node:test';
import assert from 'node:assert/strict';
import {PLAZA_LAYOUT,plazaFootprint,HEDGES,PLAZA_FACILITIES,SPECIMEN_TREES,createPlazaGround,plazaFacilities,entranceSpecimenEntries} from '../assets/realistic/entrance-plaza.js';
import {clearEntranceEntries,entranceFrame,createEntranceGround,createEntrance} from '../assets/realistic/entrance-scenery.js';
import {facilityTriangleCounts} from '../assets/realistic/summit-facilities.js';
import {plazaPolygon,toGate,PLAZA_START} from '../src/plaza.js';
import {STAND_STANCE,stanceWeight,standingFoot,standingPoleTip} from '../src/hiker-interactions.js';
const route=[{x:0,y:50,z:0},{x:0,y:51,z:-20}];
const frame={x:3,z:-4,yaw:-2.3};
const world=(gx,gz)=>({x:frame.x+gx*Math.cos(frame.yaw)+gz*Math.sin(frame.yaw),z:frame.z-gx*Math.sin(frame.yaw)+gz*Math.cos(frame.yaw)});

test('자유이동 다각형과 출발점은 모두 포장 위에 있고 높은 경계석·화단은 그 밖에 있다',()=>{
 for(const p of [...plazaPolygon,PLAZA_START]){const g=toGate(p.x,p.z);assert.ok(plazaFootprint(g.gx,g.gz),`${g.gx.toFixed(1)},${g.gz.toFixed(1)}`);}
 const maxX=Math.max(...plazaPolygon.map(p=>Math.abs(toGate(p.x,p.z).gx)));
 assert.ok(PLAZA_LAYOUT.plaza.half-PLAZA_LAYOUT.kerb.width/2>maxX+.25,'높은 경계석은 몸 반경 밖');
 for(const h of HEDGES)assert.ok(Math.abs(h.x)-h.depth/2>maxX+.25);
});

test('시설은 조사 문서의 "넣음" 목록(정자·벤치·안내판·차단봉·가로등)만 쓰고 걷는 길을 막지 않는다',()=>{
 assert.deepEqual([...new Set(PLAZA_FACILITIES.map(f=>f.id))].sort(),['bench','bollard','lamp','pavilion','sign']);
 for(const f of PLAZA_FACILITIES.filter(f=>f.id!=='bollard'))assert.ok(Math.abs(f.x)>5.5,f.name);
 const lod0=plazaFacilities(false),lod1=plazaFacilities(true),tris=o=>{let n=0;o.traverse(m=>{if(m.isMesh)n+=m.geometry.attributes.position.count/3;});return n;};
 assert.ok(tris(lod0)<40000);assert.ok(tris(lod1)<6000);
});

test('바닥은 지형 높이를 따라 2cm 위에 깔리고 블록·아스팔트·차선·경계석으로 나뉜다',()=>{
 const height=(x,z)=>40+x*.01;const ground=createPlazaGround(frame,height);
 const names=ground.children.map(m=>m.name);for(const n of ['블록 포장','아스팔트','흰 차선','경계석'])assert.ok(names.includes(n),n);
 const block=ground.children.find(m=>m.name==='블록 포장').geometry.attributes.position;
 for(let i=0;i<block.count;i+=97)assert.ok(Math.abs(block.getY(i)-(height(block.getX(i),block.getZ(i))+PLAZA_LAYOUT.lift))<1e-4);
});

test('광장 둘레 숲은 비우되 입구 전용 가까운 나무는 남긴다',()=>{
 const a=entranceFrame(route),w=(gx,gz)=>({x:a.x+gx*Math.cos(a.yaw)+gz*Math.sin(a.yaw),z:a.z-gx*Math.sin(a.yaw)+gz*Math.cos(a.yaw)});
 const entries=[{kind:'tree',placements:[w(0,25),w(9,30),w(-5,-10),w(20,20)]},...entranceSpecimenEntries(a)];
 const out=clearEntranceEntries(entries,route);
 assert.equal(out[0].placements.length,1);
 assert.equal(out.slice(1).reduce((n,e)=>n+e.placements.length,0),SPECIMEN_TREES.length);
 for(const t of SPECIMEN_TREES)assert.ok(!plazaFootprint(t.x,t.z,.8),`${t.id} ${t.x},${t.z}`);
 for(const e of entranceSpecimenEntries(a)){assert.equal(e.priority,true);assert.equal(e.levels.length,3);}
});

test('광장 끝 경계석(41m)까지 평평하고 그 뒤 10m에서 원지형으로 돌아간다',()=>{
 const ground=createEntranceGround(route),a=entranceFrame(route),h=(gx,gz,base)=>{const p={x:a.x+gx*Math.cos(a.yaw)+gz*Math.sin(a.yaw),z:a.z-gx*Math.sin(a.yaw)+gz*Math.cos(a.yaw)};return ground(p.x,p.z,base);};
 assert.equal(h(0,41.5,55),50);assert.equal(h(7.7,41,55),50);assert.equal(h(0,53,55),55);assert.ok(h(0,47,55)>50&&h(0,47,55)<55);
});

test('입구는 문·광장 시설 두 LOD를 거리별로 바꾸고 멀리서는 바닥도 숨긴다',()=>{
 const entrance=createEntrance(route,()=>50);assert.equal(entrance.items.length,2);
 const counts=facilityTriangleCounts(entrance.items);assert.ok(counts[1].levels[0].triangles<40000);assert.equal(counts[1].levels[2].triangles,0);
 const at=(d)=>({position:{distanceTo:()=>d}});
 entrance.update(at(10));assert.equal(entrance.items[1].levels[0].object.visible,true);assert.equal(entrance.ground.visible,true);
 entrance.update(at(100));assert.equal(entrance.items[1].levels[1].object.visible,true);
 entrance.update(at(500));assert.equal(entrance.items[1].levels[2].object.visible,true);assert.equal(entrance.ground.visible,false);
});

test('서 있을 때 발은 몸 아래로 모이고 스틱은 발 옆 앞쪽에 짚는다',()=>{
 // 둘러보기 클립 실측 발 위치(루트 기준): 왼발 (-0.226, -0.132), 오른발 (0.17, 0.278).
 const l=standingFoot(-.226,-.132,-1,1,.05),r=standingFoot(.17,.278,1,1,.05);
 assert.ok(Math.abs(r.x-l.x-2*STAND_STANCE.footHalf)<1e-9);assert.ok(Math.abs(r.z-l.z)<.41*STAND_STANCE.stagger+1e-9);
 assert.deepEqual(standingFoot(-.226,-.132,-1,0),{x:-.226,z:-.132});
 const tip=standingPoleTip(-1);assert.ok(tip.x<0&&Math.abs(tip.x)<.3&&tip.z<0);
 let w=0;for(let i=0;i<10;i++)w=stanceWeight(w,true,.05);assert.equal(w,1);
 for(let i=0;i<3;i++)w=stanceWeight(w,false,.05);assert.ok(w<1&&w>0);
 assert.equal(stanceWeight(.5,true,NaN),.5);
});
