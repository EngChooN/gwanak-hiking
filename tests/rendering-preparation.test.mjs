import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {warmRenderingPaths} from '../src/rendering-preparation.js';

test('로딩 중 그림자·직접 출력·AO 경로를 준비하고 선택 설정을 복원한다',async()=>{
 const events=[];let mode;
 await warmRenderingPaths({
  apply:(quality,ao)=>{mode={quality,ao};},
  compile:async()=>events.push(['compile',mode.quality,mode.ao]),
  render:()=>events.push(['render',mode.quality,mode.ao]),
  restore:()=>events.push(['restore'])
 });
 assert.deepEqual(events,[['compile',0,false],['render',0,false],['compile',1,false],['render',1,false],['compile',2,false],['render',2,false],['render',2,true],['restore']]);
});
test('모바일은 AO를 준비하지 않고 실패해도 설정을 복원한다',async()=>{
 const modes=[];let restored=0;
 const options={mobile:true,apply:(q,ao)=>modes.push([q,ao]),compile:async()=>{},render:()=>{},restore:()=>restored++};
 await warmRenderingPaths(options);assert.ok(modes.every(([,ao])=>!ao));assert.equal(restored,1);
 await assert.rejects(warmRenderingPaths({...options,compile:async()=>{throw new Error('준비 실패');}}),/준비 실패/);
 assert.equal(restored,2);
});
test('보행·리사이즈에는 컴파일 경로가 없고 첫 rAF 전에만 준비한다',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 const rendering=readFileSync(new URL('../src/rendering.js',import.meta.url),'utf8');
 const resize=main.slice(main.indexOf('function resize()'),main.indexOf('function suspend()'));
 const frame=main.slice(main.indexOf('function frame(now'),main.indexOf('updateUI();save();'));
 assert.doesNotMatch(resize+frame,/prepare|compile|shaderReady|shaderJobs/);
 assert.equal((main.match(/lighting\.prepare\(/g)||[]).length,1);
 assert.match(main,/await lighting\.prepare\(\);last=performance\.now\(\);requestAnimationFrame\(frame\)/);
 assert.doesNotMatch(rendering.slice(rendering.indexOf('function resize('),rendering.indexOf('async function prepare(')),/compileAsync|\.compile\(/);
 assert.equal((rendering.match(/renderer\.compileAsync\(/g)||[]).length,1);
 assert.match(frame,/const workStarted=performance\.now\(\)/);
 assert.match(frame,/adaptiveQuality\.sample\(frameSeconds\*1000,!document\.hidden&&cameraReady,performance\.now\(\)-workStarted,lighting\.status\.ao\)/);
});
