import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshStandardMaterial,DoubleSide,Raycaster,Vector3} from 'three';
import {SURFACE_SECTIONS,SURFACE_BANDS,SURFACE_REFERENCE_METRES,assignSurfaceRoute} from '../src/route-surfaces.js';
import {route,durationBetween,speedFor,STAIR_SECONDS,NONSTAIR_BASE_SECONDS,SPEED_CALIBRATION,MATERIALS} from '../src/route.js';
import {footstepMaterial,FootstepSelector,SOUND_BANKS} from '../src/footstep-audio.js';
import {ribbon,densifyRoute} from '../assets/realistic/load-landscape.js';
test('구간 1~7 추정 배정은 CSV 수평 누적 거리와 기획 비율을 따른다',()=>{
 const csv=readFileSync(new URL('../data/구간표-서울대-연주대.csv',import.meta.url),'utf8').split(/\r?\n/).filter(l=>l.startsWith('A_')&&/^\d$/.test(l.split(',')[1]));
 assert.deepEqual(SURFACE_SECTIONS.map(r=>r.metres),csv.map(l=>Number(l.split(',')[3])));
 assert.equal(SURFACE_REFERENCE_METRES,4962);
 assert.deepEqual(SURFACE_SECTIONS.map(r=>r.shares),[[['paved',70],['soil',30]],[['soil',60],['rock',40]],[['soil',40],['rock',30],['stairs',30]],[['soil',15],['rock',25],['deck_stairs',60]],[['deck_stairs',60],['rock',25],['soil',15]],[['stairs',40],['rock',30],['ridge',30]],[['ridge',60],['rock',40]]]);
 const assigned=assignSurfaceRoute(route.points);
 for(const band of SURFACE_BANDS){
  const actual=assigned.slice(0,-1).reduce((sum,p,i)=>sum+(p.section===band.section&&p.material===band.material?assigned[i+1].referenceMetres-p.referenceMetres:0),0);
  assert.ok(Math.abs(actual-(band.end-band.start))<1e-7);
 }
 assert.equal(route.points.length,337);
});
test('ETA 전장은 계단·일반 구간 걸음 모델 시간의 합이고 구간 합과 같다',()=>{
 assert.ok(STAIR_SECONDS>0&&STAIR_SECONDS<9000);assert.equal(SPEED_CALIBRATION,1);
 const total=STAIR_SECONDS+NONSTAIR_BASE_SECONDS;assert.ok(Math.abs(durationBetween(0,route.length)-total)<1e-6);
 const bySection=Array.from({length:7},()=>0);
 for(const seg of route.segments)bySection[seg.a.section-1]+=seg.length/speedFor(seg.slope,seg.material);
 assert.ok(Math.abs(bySection.reduce((a,b)=>a+b,0)-total)<1e-6);assert.ok(bySection.every(n=>n>0));
 assert.equal(MATERIALS.paved.factor,MATERIALS.rock.factor);assert.equal(speedFor(.2,'paved'),speedFor(.2,'rock'));
 assert.equal(footstepMaterial('paved'),'rock');assert.ok(SOUND_BANKS.rock.includes(new FootstepSelector().next('paved',1).file));
});
test('20~25% 경사 디딤판은 수평이고 30cm 이하 폭·18cm 이하 단차로 raycast 접지된다',()=>{
 for(const grade of [.20,.25,-.20,-.25]){
  const material=new MeshStandardMaterial({side:DoubleSide});
  const points=densifyRoute([{x:0,z:0,y:100,s:0,width:2,material:'stairs'},{x:0,z:3,y:100+3*grade,s:Math.hypot(3,3*grade),width:2,material:'stairs'}]);
  const group=ribbon(points,material,1);group.updateMatrixWorld(true);
  const ray=new Raycaster();
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1];assert.ok(b.z-a.z<=.3+1e-9);assert.ok(Math.abs(b.y-a.y)<=.18+1e-9);
   const heights=[];for(const t of [.2,.8]){ray.set(new Vector3(0,110,a.z+(b.z-a.z)*t),new Vector3(0,-1,0));heights.push(ray.intersectObject(group)[0]?.point.y);}
   assert.ok(heights.every(Number.isFinite));assert.ok(Math.abs(heights[0]-heights[1])<1e-6);assert.ok(Math.abs(heights[0]-(Math.max(a.y,b.y)+.015))<1e-5);
  }
  group.traverse(o=>o.geometry?.dispose());material.dispose();
 }
});
