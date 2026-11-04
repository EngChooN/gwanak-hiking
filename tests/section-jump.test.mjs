import test from 'node:test';
import assert from 'node:assert/strict';
import {jumpTargets,summitSpot,sectionJumpEnabled,SECTION_JUMP_ENABLED} from '../src/section-jump.js';
import {initialState,setPlayerPosition,playerPosition} from '../src/movement.js';
import {checkpoints,route} from '../src/route.js';
import {SUMMIT_CENTER,ROUTE_END,insideSummit} from '../src/summit.js';
const marker={id:'marker',x:SUMMIT_CENTER.x+6,z:SUMMIT_CENTER.z+4};
test('목록: 입구 광장·일주문·체크포인트·정상 구역(4~8곳 + 정상)',()=>{
 const t=jumpTargets({summit:summitSpot([marker],ROUTE_END)});
 assert.deepEqual(t.map(x=>x.id),['plaza','gate',...checkpoints.map(c=>c.id),'summit']);
 assert.ok(checkpoints.length>=4&&checkpoints.length<=8);
});
test('정상석 위치가 없으면 정상 구역은 목록에서 빠진다',()=>{
 assert.equal(summitSpot([],ROUTE_END),null);
 assert.ok(!jumpTargets({summit:null}).some(x=>x.id==='summit'));
});
test('모든 목적지로 이동하면 해당 구역 상태가 되고 서로 꼬이지 않는다',()=>{
 const spot=summitSpot([marker],ROUTE_END);assert.ok(insideSummit(spot.x,spot.z));
 const state=initialState({start:'plaza'});
 for(const t of jumpTargets({summit:spot})){
  assert.equal(setPlayerPosition(state,t.pos,{}),true,t.id);
  assert.equal(state.zone,t.pos.zone,t.id);
  assert.equal(state.zone==='plaza'?state.plaza!==null:state.plaza===null,true,t.id);
  assert.equal(state.zone==='summit'?state.summit!==null:state.summit===null,true,t.id);
  assert.ok(state.s<=route.length,t.id);
 }
 assert.equal(playerPosition(state,{}).zone,'summit');
});
test('설정값 하나로 끄고, 주소 ?jump=off 로 접속별로 숨긴다',()=>{
 assert.equal(SECTION_JUMP_ENABLED,true);
 assert.equal(sectionJumpEnabled(''),true);
 assert.equal(sectionJumpEnabled('?jump=off'),false);
});
