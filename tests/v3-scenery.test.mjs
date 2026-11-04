import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {assignSurfaceRoute} from '../src/route-surfaces.js';
import {forestLayers,summitViewCap,SUMMIT_SIGHT_DEG} from '../assets/realistic/generated/nature/forest-layers.js';
import {scenerySites,sectionPoint,streamSide} from '../assets/realistic/section-scenery.js';
import {waterClearance,STREAM_COURSE,POND} from '../assets/realistic/water-clearance.js';
import {groundCoverMask} from '../assets/realistic/ground-cover-mask.js';
import {FACILITY_LAMPS} from '../src/night-lighting-config.js';

// 실제 코스로 숲 층위를 만든다. 높이는 완만한 가짜 지형.
const route=assignSurfaceRoute(JSON.parse(readFileSync(new URL('../assets/realistic/generated/route.json',import.meta.url))));
const height=(x,z)=>50+x*.01+z*.02;
const landscape={route,floorHeight:height,group:new THREE.Group(),status:{sectionScenery:{sites:scenerySites(route,height)}},update(){}};
forestLayers(landscape);
const instances=name=>{const m=new THREE.Matrix4(),v=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3(),out=[];
 for(const mesh of landscape.group.children.find(g=>g.name===name).children)for(let i=0;i<mesh.count;i++){mesh.getMatrixAt(i,m);m.decompose(v,q,s);out.push({x:v.x,z:v.z,sy:s.y});}
 return out;};
const grass=instances('숲 층위 · 바람 풀'),shrubs=instances('덤불층 · 바람');
const water=waterClearance(route);

test('물줄기 중심선은 계곡 물을 그리는 자리(코스 800~2560m, 왼쪽 6m)와 같다',()=>{
 assert.equal(water.line.length,(STREAM_COURSE.to-STREAM_COURSE.from)/STREAM_COURSE.step+1);
 for(const m of [800,1096,1500,2560]){const p=sectionPoint(route,m,streamSide(m));assert.ok(water.streamDistance(p.x,p.z)<1e-6,`${m}m`);}
 const lake=sectionPoint(route,POND.metres,POND.side);assert.ok(water.inPond(lake.x,lake.z));
 // 1096·1500m 지점의 물 가운데·띠 가장자리 안쪽은 막고, 띠 바깥 물가는 막지 않는다.
 for(const m of [1096,1500]){const c=sectionPoint(route,m,streamSide(m)),inside=sectionPoint(route,m,streamSide(m)+1.3),bank=sectionPoint(route,m,streamSide(m)+3);
  assert.ok(water.blocked(c.x,c.z)&&water.blocked(inside.x,inside.z),`${m}m 띠 안`);assert.ok(!water.blocked(bank.x,bank.z),`${m}m 물가`);}
});

test('계곡 물줄기 띠(폭 3m)·호수 수면 안 풀·덤불은 0개다',()=>{
 assert.ok(grass.length>1e5&&shrubs.length>1000);
 assert.equal(grass.filter(p=>water.inStream(p.x,p.z)).length,0);
 assert.equal(grass.filter(p=>water.inPond(p.x,p.z)).length,0);
 assert.equal(shrubs.filter(p=>water.inStream(p.x,p.z)).length,0);
 assert.equal(shrubs.filter(p=>water.inPond(p.x,p.z)).length,0);
 assert.ok(landscape.status.scenery.waterGrassCleared>0&&landscape.status.scenery.waterShrubsCleared>0);
});

test('물가(띠 바깥 0.5~3m)에는 풀이 남는다',()=>{
 const bank=grass.filter(p=>{const d=water.streamDistance(p.x,p.z);return d>STREAM_COURSE.halfWidth+.5&&d<STREAM_COURSE.halfWidth+3;});
 assert.ok(bank.length>2000,`물가 풀 ${bank.length}`);
});

test('groundCoverMask에 물 자리를 넘기면 띠 안을 막는다',()=>{
 const mask=groundCoverMask(route,{water}),c=sectionPoint(route,1500,streamSide(1500)),bank=sectionPoint(route,1500,streamSide(1500)+4);
 assert.ok(mask.blocked(c.x,c.z));assert.ok(!mask.blocked(bank.x,bank.z));
 assert.ok(!groundCoverMask(route).blocked(c.x,c.z),'물 자리 없이 부르면 이전과 같다');
});

test('정상 주변 덤불 꼭대기는 눈높이에서 아래로 6° 시선보다 낮다',()=>{
 const view=summitViewCap(landscape,route);assert.ok(view.viewers.length>=1);
 const near=shrubs.filter(p=>Number.isFinite(view.maxTop(p.x,p.z)));
 for(const p of near)assert.ok(p.sy*1.12<=view.maxTop(p.x,p.z)+1e-3,`덤불 높이 ${(p.sy*1.12).toFixed(2)} > ${view.maxTop(p.x,p.z).toFixed(2)}`);
 assert.equal(SUMMIT_SIGHT_DEG,6);
});

test('정상 보안등은 정상석 남동쪽(서울 반대편)에 두고 스탬프함·안내판과 떨어진다',()=>{
 const lamp=FACILITY_LAMPS.find(f=>f.id==='summit');assert.equal(lamp.anchor,'marker');
 const [ox,oz]=lamp.offset;assert.ok(oz>0&&ox>=0,'남(+Z)·동(+X)');
 // 정상석 기준 스탬프함(남 2.5m)·안내판(북동 약 2.9m) 대략 자리와 3.5m 이상.
 for(const [x,z] of [[-.2,2.5],[1.7,-2.1]])assert.ok(Math.hypot(ox-x,oz-z)>=3.5);
});

test('하늘 셰이더에는 세로로 늘어진 지평선 불빛 알갱이가 없고 별은 정육면체 칸 안 구다',()=>{
 const src=readFileSync(new URL('../src/sky-dome.js',import.meta.url),'utf8');
 assert.doesNotMatch(src,/gd\.y\*320\.0/);
 assert.doesNotMatch(src,/lampColor/);
 assert.match(src,/vec3 sp=gd\*300\.0,ip=floor\(sp\),fp=fract\(sp\)-0\.5/);
 assert.match(src,/smoothstep\(0\.38,0\.0,length\(fp\)\)/);
});
