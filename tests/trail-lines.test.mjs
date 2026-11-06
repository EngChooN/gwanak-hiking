// 즐길거리 말풍선 문구·효과음 표(src/trail-lines.js): 열 가지 모두 문구가 있고, 첫 문구는 승인 시안 그대로, 길이·소리 파일 확인.
import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {TRAIL_LINES,TRAIL_SFX,pickLine} from '../src/trail-lines.js';

test('말풍선: 역기·거꾸리·허리돌리기·철봉·벤치 영혼·초콜릿·다람쥐·고양이·까치·에어건 모두 문구가 있다', ()=>{
 for(const p of ['gym-lift','gym-hang','gym-twist','gym-bar','bench','choco','squirrel','cat','magpie','airgun'])
  assert.ok(Object.keys(TRAIL_LINES).some(k=>k.startsWith(p+'.')),p);
});
test('말풍선: 첫 문구는 승인 시안과 같다(웃음 세기 = 시안)', ()=>{
 const want={'gym-lift.start':'팔이… 짧아서… 머리로 들었다','gym-hang.start':'피가 머리로 쏠린다… 원래 머리가 몸 절반인데…','choco.eat':'당 충전!! 슝—','bench.soul':'후우… (영혼 휴식 중)','airgun.blast':'치이이익—!!!','airgun.hat':'내 모자!!','squirrel.hat':'여기 내 자리','squirrel.heavy':'…무거워','gym-lift.strain':'부들부들'};
 for(const [k,v] of Object.entries(want))assert.equal(TRAIL_LINES[k].lines[0],v,k);
});
test('말풍선: 말은 28자, 소리 글자는 10자 이내이고 종류·시간이 정해져 있다', ()=>{
 for(const [k,e] of Object.entries(TRAIL_LINES)){
  assert.ok(['','sfx','tag'].includes(e.kind),k);assert.ok(e.seconds>=1&&e.seconds<=2.8,k);assert.ok(e.lines.length>=1,k);
  for(const l of e.lines)assert.ok([...l].length<=(e.kind==='sfx'?10:28),`${k}: ${l}`);
 }
});
test('말풍선: 같은 자리에서 바로 전 문구를 다시 고르지 않는다', ()=>{
 const a=pickLine('gym-twist.dizzy',()=>0),b=pickLine('gym-twist.dizzy',()=>0);
 assert.notEqual(a.text,b.text);assert.equal(pickLine('없는-자리'),null);
});
test('효과음: 표의 파일이 모두 있고, 자체 합성 출처가 남아 있다', ()=>{
 for(const [k,s] of Object.entries(TRAIL_SFX)){const f=`public/sounds/trail/${s.file}`;assert.ok(existsSync(f),f);
  const b=readFileSync(f);assert.equal(b.toString('ascii',0,4),'RIFF',k);assert.ok(b.length<400*1024,`${k} 400KB 이하`);}
 assert.equal(TRAIL_SFX.radio.loop,true);
 const credits=readFileSync('assets/출처-라이선스.md','utf8');
 for(const s of Object.values(TRAIL_SFX))assert.ok(credits.includes(s.file),`출처 문서에 ${s.file}`);
 const table=readFileSync('data/자료-출처-이용조건-기록표.md','utf8');
 for(const k of ['pant','zap','scream','roll'])assert.ok(TRAIL_SFX[k]&&table.includes(TRAIL_SFX[k].file.replace('.wav','')),`⑥ ${k} 효과음과 기록표`);
});
