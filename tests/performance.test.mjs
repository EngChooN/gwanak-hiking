import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MeshStandardMaterial,Raycaster,Vector3} from 'three';
import {ribbon,densifyRoute} from '../assets/realistic/load-landscape.js';
import {surfaceIndex} from '../assets/realistic/surface-index.js';
import {indexRoute,nearestRoute} from '../assets/realistic/geo.js';
import {createFrameMetrics} from '../src/performance-metrics.js';
const route=JSON.parse(readFileSync(new URL('../assets/realistic/generated/route.json',import.meta.url)));

test('공간 색인 최근접 경로는 전 구간·노면 밖에서 기존 전수 검사와 같다',()=>{
 const indexed=indexRoute(route);
 for(const p of route)for(const offset of [-500,-25,-1,0,1,25,500]){
  const x=p.x+offset,z=p.z-offset*.731;
  assert.deepEqual(indexed(x,z),nearestRoute(route,x,z));
 }
});
test('발 높이 색인은 실제 등산로 삼각형 raycast와 전 구간에서 일치한다',()=>{
 const mesh=ribbon(densifyRoute(route),new MeshStandardMaterial(),1);
 mesh.updateMatrixWorld(true);
 const height=surfaceIndex(mesh),ray=new Raycaster();
 let queries=0;
 for(let i=0;i<route.length-1;i++){
  const a=route[i],b=route[i+1],dx=b.x-a.x,dz=b.z-a.z,n=Math.hypot(dx,dz)||1;
  for(const t of [.1,.3,.6,.9])for(const side of [-2,-.8,0,.8,2]){
   const x=a.x+dx*t-dz/n*side,z=a.z+dz*t+dx/n*side,y=a.y+(b.y-a.y)*t+10;
   ray.set(new Vector3(x,y,z),new Vector3(0,-1,0));ray.far=20;
   const expected=ray.intersectObject(mesh)[0]?.point.y,actual=height(x,z,y,20);
   if(expected===undefined)assert.equal(actual,undefined);
   else assert.ok(Math.abs(actual-expected)<1e-6,`${i}: ${actual} / ${expected}`);
   queries++;
  }
 }
 console.log(`실제 노면 ${queries}점 색인/raycast 높이 비교`);
 mesh.traverse(o=>o.geometry?.dispose());mesh.children[0].material.dispose();
});
test('프레임 통계는 끊김·백분위·프레임 예산을 기록하고 초기화한다',()=>{
 const m=createFrameMetrics(4);
 for(const ms of [16,16,20,60]){m.stage('contact',()=>42);m.frame(ms,{drawCalls:100,triangles:2000,textures:12});}
 const report=m.report();assert.equal(report.frames,4);assert.equal(report.over50ms,1);assert.equal(report.p95Ms,60);assert.equal(report.fps,1000/28);assert.equal(report.drawCalls,100);assert.ok(report.cpuMs.contact>=0);
 m.frame(10,{});assert.equal(m.report().frames,4);m.reset();assert.equal(m.report().frames,0);assert.equal(m.report().fps,0);
});
