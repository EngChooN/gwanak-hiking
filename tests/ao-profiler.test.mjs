import test from 'node:test';
import assert from 'node:assert/strict';
import {createAOProfiler} from '../src/ao-profiler.js';
test('GPU 진단은 완료된 질의만 읽고 disjoint 표본을 폐기한다',()=>{
 let ready=false,disjoint=false,read=0,deleted=0;
 const ext={TIME_ELAPSED_EXT:1,GPU_DISJOINT_EXT:2};
 const gl={QUERY_RESULT_AVAILABLE:3,QUERY_RESULT:4,getExtension:()=>ext,createQuery:()=>({}),beginQuery(){},endQuery(){},
  getParameter:()=>disjoint,getQueryParameter:(query,key)=>{if(key===3)return ready;read++;return 2000000;},deleteQuery(){deleted++;}};
 const profiler=createAOProfiler({getContext:()=>gl},true);
 assert.equal(profiler.measure('법선',()=>42),42);profiler.poll();assert.equal(read,0);
 ready=true;profiler.poll();assert.equal(profiler.status.rows['법선'].gpuMeanMs,2);
 profiler.measure('법선',()=>{});disjoint=true;profiler.poll();assert.equal(read,1);assert.equal(deleted,2);
 assert.equal(profiler.status.gpuDisjointSamples,1);
});
test('확장이 없거나 일반 실행이면 GPU 질의를 하지 않는다',()=>{
 const gl={getExtension:()=>null};const renderer={getContext:()=>gl};
 const profiler=createAOProfiler(renderer,true);assert.equal(profiler.status.gpuSupported,false);
 profiler.measure('기본',()=>{});profiler.poll();assert.equal(profiler.status.rows['기본'].gpuMeanMs,null);
 const disabled=createAOProfiler(renderer,false);disabled.measure('기본',()=>{});assert.deepEqual(disabled.status.rows,{});
});
