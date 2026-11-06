// 자동 걷기로 광장 출발점부터 코스 끝까지 가면서 프레임마다 카메라·몸 방향(yaw) 변화량을 기록한다.
// 이동(advance)은 시점과 무관하므로 한 번 걸으면서 고치기 전(before) 방식과 고친 뒤(after) 방식을 함께 계산한다.
// before = main.js의 예전 방식: 카메라 = baseHeading()+look.yaw(구역 전환 때만 보존), 몸 = 실제 이동 방향을 0.05초로 따라감.
// after  = src/auto-view.js: 평활 길 방향 + 임계 감쇠 스프링 + 최대 회전 속도, 몸은 평활 길 방향을 따라감.
import {initialState,advance,positionAt} from '../../src/movement.js';
import {route,sample} from '../../src/route.js';
import {movementHeading,followHeading,headingDelta} from '../../src/hiker-facing.js';
import {createAutoView,startAutoView,absorbUserYaw,stepAutoView,pathHeading,wrapAngle} from '../../src/auto-view.js';

const DEG=180/Math.PI;
const baseHeading=state=>state.zone==='plaza'?state.plaza.heading:state.zone==='summit'?state.summit.heading:sample(state.s).heading;
const world=state=>state.zone==='route'?positionAt(state.s,state.lateral):[state[state.zone].x,0,state[state.zone].z];
export const autoTargetHeading=state=>state.zone==='route'?pathHeading(state.s,sample):baseHeading(state);

// userTurns: [{at:초, yaw:라디안}] 그 시각에 마우스로 돌린 양(look.yaw에 더함). maxSeconds: 시뮬레이션 상한.
export function simulateAutoWalk({fps=60,start='plaza',userTurns=[],maxSeconds=4*3600,track=null}={}){
 const dt=1/fps,state=initialState({start});state.auto=true;
 const look={yaw:0},oldLook={yaw:0},view=createAutoView();
 let bodyOld=baseHeading(state),bodyNew=bodyOld,camOld=baseHeading(state),camNew=camOld,t=0;
 const rec={camOld:[],camNew:[],bodyOld:[],bodyNew:[],s:[]};
 const turns=[...userTurns].sort((a,b)=>a.at-b.at);
 while(state.auto&&t<maxSeconds){
  t+=dt;
  while(turns.length&&turns[0].at<=t)look.yaw+=turns.shift().yaw;
  if(!view.active)startAutoView(view,baseHeading(state),look.yaw);else absorbUserYaw(view,look);
  const before=world(state),zoneBefore=state.zone,camBeforeOld=baseHeading(state)+oldLook.yaw,camBeforeNew=baseHeading(state)+look.yaw;
  const speed=advance(state,{forward:0,side:0},dt);
  if(state.zone!==zoneBefore){oldLook.yaw=wrapAngle(camBeforeOld-baseHeading(state));look.yaw=wrapAngle(camBeforeNew-baseHeading(state));}
  if(state.auto)look.yaw=stepAutoView(view,{target:autoTargetHeading(state),base:baseHeading(state),dt});
  const after=world(state),moving=speed>0;
  const co=baseHeading(state)+oldLook.yaw,cn=baseHeading(state)+look.yaw;
  const bo=moving?followHeading(bodyOld,movementHeading(before,after,bodyOld),dt):bodyOld;
  const bn=moving?followHeading(bodyNew,view.heading,dt):bodyNew;
  rec.camOld.push(headingDelta(camOld,co)*DEG);rec.camNew.push(headingDelta(camNew,cn)*DEG);
  rec.bodyOld.push(headingDelta(bodyOld,bo)*DEG);rec.bodyNew.push(headingDelta(bodyNew,bn)*DEG);
  rec.s.push(state.zone==='plaza'?null:state.s);
  track?.({t,state,camera:cn,offset:view.offset,heading:view.heading});
  camOld=co;camNew=cn;bodyOld=bo;bodyNew=bn;
 }
 return {fps,seconds:t,frames:rec.s.length,finalS:state.s,routeLength:route.length,reachedEnd:state.s>=route.length-1e-6,rec};
}

const BINS=[.25,.5,1,2,5,10,30,180];
export function yawStats(values,s=[]){
 const abs=values.map(Math.abs),sorted=[...abs].sort((a,b)=>a-b),q=p=>sorted[Math.min(sorted.length-1,Math.floor(p*sorted.length))];
 const histogram={};let lo=0;for(const hi of BINS){histogram[`${lo}~${hi}°`]=abs.filter(v=>v>lo&&v<=hi).length;lo=hi;}
 histogram['0°']=abs.filter(v=>v===0).length;
 const top=abs.map((v,i)=>({deg:+v.toFixed(3),frame:i,s:s[i]===null||s[i]===undefined?null:+s[i].toFixed(1)})).sort((a,b)=>b.deg-a.deg).slice(0,5);
 return {frames:abs.length,maxDeg:+sorted.at(-1).toFixed(3),p50:+q(.5).toFixed(4),p95:+q(.95).toFixed(4),p99:+q(.99).toFixed(4),p999:+q(.999).toFixed(4),over1:abs.filter(v=>v>1).length,over2:abs.filter(v=>v>2).length,over5:abs.filter(v=>v>5).length,histogram,top};
}
