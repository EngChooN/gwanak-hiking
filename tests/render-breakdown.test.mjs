import test from 'node:test';
import assert from 'node:assert/strict';
import {installRenderBreakdown} from '../src/render-breakdown.js';
import {createFrameMetrics} from '../src/performance-metrics.js';
test('실제 제출량을 종류·패스별로 분해하고 프레임 평균에서 없는 항목은 0으로 센다',()=>{
 const renderer={info:{render:{calls:0,triangles:0}},renderBufferDirect(camera,scene,geometry){this.info.render.calls+=geometry.calls;this.info.render.triangles+=geometry.triangles;}};
 const breakdown=installRenderBreakdown(renderer),root={userData:{metricKind:'등산객'}},mesh={parent:root};
 renderer.renderBufferDirect(null,{}, {calls:2,triangles:24},{},mesh);
 renderer.renderBufferDirect(null,null,{calls:1,triangles:12},{isMeshDepthMaterial:true},mesh);
 renderer.renderBufferDirect(null,{overrideMaterial:{}},{calls:1,triangles:12},{},mesh);
 const rows=breakdown.snapshot();assert.equal(Object.values(rows).reduce((s,r)=>s+r.triangles,0),renderer.info.render.triangles);
 assert.equal(rows['등산객/그림자'].triangles,12);assert.equal(rows['등산객/SSAO 깊이·법선'].drawCalls,1);
 const metrics=createFrameMetrics();metrics.frame(16,{breakdown:rows});breakdown.reset();metrics.frame(16,{breakdown:breakdown.snapshot()});
 assert.equal(metrics.report().breakdown['등산객/기본·후처리'].triangles,12);
 assert.equal(metrics.report().breakdown['등산객/그림자'].maxTriangles,12);assert.deepEqual(breakdown.snapshot(),{});
 assert.equal(metrics.report().categories['등산객'].maxTriangles,48);assert.equal(metrics.report().categories['등산객'].triangles,24);assert.equal(metrics.report().categories['등산객'].maxDrawCalls,4);
});
