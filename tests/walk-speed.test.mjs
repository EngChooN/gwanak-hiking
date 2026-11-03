import test from 'node:test';import assert from 'node:assert/strict';
import {route,sample,speedFor,strideFor,gaitFor,isStairs,STAIR_WALK_CADENCE,MATERIALS} from '../src/route.js';
import {initialState,advance,strideAt,BACKWARD_MULTIPLIER} from '../src/movement.js';
const stairSpeed=speedFor(0,'stairs');
test('일반 구간은 어떤 경사·노면에서도 계단보다 느리지 않다(속도·걸음 빈도)',()=>{
 for(const material of Object.keys(MATERIALS).filter(m=>!isStairs(m)))for(let g=-.6;g<=.6;g+=.05)for(const d of [-1,1]){
  const {stride,cadence}=gaitFor(g,material,d);assert.ok(speedFor(g,material,d)>=stairSpeed,`${material} ${g}`);assert.ok(cadence>=STAIR_WALK_CADENCE,`${material} ${g} cadence`);assert.ok(stride>=.36&&stride<=.72);}
 for(const seg of route.segments)if(!isStairs(seg.material))assert.ok(speedFor(seg.slope,seg.material)>=stairSpeed);
});
test('평지는 계단보다 빠르고, 오르막 감속은 단조롭고 완만하다',()=>{
 assert.ok(speedFor(0,'soil')>2*stairSpeed&&speedFor(0,'soil')<1.5);
 let prev=Infinity;for(let g=0;g<=.5;g+=.05){const v=speedFor(g,'soil');assert.ok(v<=prev+1e-12);prev=v;}
 assert.ok(speedFor(.5,'soil')/speedFor(0,'soil')>.4,'50% 경사도 평지의 40% 이상');
});
test('이동 루프의 걸음 빈도가 걸음 모델과 같다(애니메이션은 걸음 수에 맞춰 재생)',()=>{
 for(const seg of [route.segments.find(s=>!isStairs(s.material)&&s.slope>.2&&s.length>3),route.segments.find(s=>!isStairs(s.material)&&Math.abs(s.slope)<.03&&s.length>3)]){
  const st=initialState();st.s=seg.start+.05;advance(st,{forward:1},.02);const p=sample(st.s);
  assert.ok(Math.abs((st.steps+st.stepPhase)/st.elapsed-gaitFor(p.slope,p.material).cadence)<.05,JSON.stringify({slope:seg.slope}));
  assert.equal(strideAt({seg:p}),strideFor(p));
 }
});
test('뒷걸음은 보폭도 줄여 걸음 빈도가 지나치게 느려지지 않는다',()=>{
 const p=sample(1000);assert.ok(BACKWARD_MULTIPLIER/ (strideAt({seg:p,backward:true})/strideAt({seg:p}))>.75);
});
