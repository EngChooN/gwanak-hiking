import test from 'node:test';
import assert from 'node:assert/strict';
import {BoxGeometry,Mesh,MeshBasicMaterial,PerspectiveCamera,Vector3,DoubleSide} from 'three';
import {initialState,advance,restore} from '../src/movement.js';
import {route,sample,speedFor,isStairs,STAIR_CADENCE,durationBetween} from '../src/route.js';
import {createLook,turnLook,faceForward,updateLook} from '../src/view.js';
import {retractCamera} from '../src/rendering.js';
test('걸으며 뒤를 봐도 yaw·pitch 유지, W의 진행은 경로 앞쪽',()=>{
 const state=initialState(),look=createLook();turnLook(look,Math.PI/.004,100);const angle={yaw:look.yaw,pitch:look.pitch},start=state.s;
 for(let i=0;i<60;i++){advance(state,{forward:1},.1);updateLook(look,.1);}
 assert.ok(state.s>start);assert.equal(look.yaw,angle.yaw);assert.equal(look.pitch,angle.pitch);
});
test('정면 복귀는 F 명령 이후 0.4초, 사용자 회전 시 중단',()=>{
 const look=createLook();turnLook(look,1100,100);faceForward(look);updateLook(look,.2);assert.notEqual(look.yaw,0);updateLook(look,.2);assert.equal(look.yaw,0);assert.equal(look.pitch,-.04);
 turnLook(look,100,0);faceForward(look);updateLook(look,.1);turnLook(look,50,0);const yaw=look.yaw;updateLook(look,1);assert.equal(look.yaw,yaw);
});
test('3인칭 직접·자동·계단 이동 및 마지막 시점 이어하기',()=>{
 const state=initialState();state.s=route.segments.find(s=>isStairs(s.material)).start+.1;state.view='third';const start=state.s;
 advance(state,{forward:1},.1);state.auto=true;advance(state,{},.1);assert.ok(state.s>start);assert.equal(state.view,'third');assert.equal(restore(JSON.stringify(state)).view,'third');
});
test('계단·데크 계단 20% 상향, 초당 1.44걸음, 전체 ETA는 노면별 걸음 모델의 합',()=>{
 for(const material of ['stairs','deck_stairs'])for(const grade of [-4,-.5,0,.5,4])for(const direction of [-1,1])assert.ok(speedFor(grade,material,direction)>=.35*1.2&&speedFor(grade,material,direction)<=.5*1.2);
 const state=initialState(),seg=route.segments.find(s=>isStairs(s.material)&&s.length>10);state.s=seg.start+.1;
 for(let i=0;i<100;i++)advance(state,{forward:1},.1);
 assert.ok(Math.abs((state.steps+state.stepPhase)/state.elapsed-STAIR_CADENCE*1.2)<1e-8);assert.equal(sample(state.s).material,'stairs');
 const minutes=durationBetween(0,route.length)/60;assert.ok(minutes>85&&minutes<110,String(minutes));
});
test('3인칭 카메라 붐: 지형·계단 벽 앞에서 당김, 장애물 없으면 거리 유지',()=>{
 const target=new Vector3(0,1,0),desired=new Vector3(0,1,5),camera=new PerspectiveCamera(65,1,.08,100);
 const wall=new Mesh(new BoxGeometry(10,10,.5),new MeshBasicMaterial({side:DoubleSide}));wall.position.z=3;wall.updateMatrixWorld(true);
 const safe=retractCamera(target,desired,[wall],camera);assert.ok(safe.z<2.75&&safe.z>2);assert.deepEqual(retractCamera(target,desired,[],camera).toArray(),desired.toArray());
});
test('?start=summit은 정상 10m 앞 코스에서 멈추지 않은 채 시작한다',()=>{
 const s=initialState({start:'summit'});
 assert.equal(s.zone,'route');assert.equal(s.s,route.length-10);assert.equal('paused' in s,false);
});
