import {route,sample,speedFor,strideFor,checkpoints,DEMO_START,ROUTE_ID,SUMMIT_REFERENCE_ELEVATION,ENTRANCE_MIN_S,entranceLateralBounds} from './route.js';
import {ENTRANCE_HYPOTHESIS} from './entrance-config.js';
import {routeRevision} from './route-revision.js';
import {SUMMIT_ENTER_S,insideSummit,projectToRoute,summitMove,reachedSummit} from './summit.js';
import {GATE_S,PLAZA_START,insidePlaza,routeFromWorld,worldFromGateFrame,segmentHitsGate,autoTarget,toGate,fromGate} from './plaza.js';
const currentRevision=routeRevision(route.points,checkpoints,SUMMIT_REFERENCE_ELEVATION);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const SAVE_KEY='gwanak-hiking:v1';
export const OFF_TRAIL_METRES=8, RUN_MULTIPLIER=1.6, OFF_TRAIL_MULTIPLIER=.7, TEA_SECONDS=3, BACKWARD_MULTIPLIER=.6;
// 길 밖·뒷걸음은 보폭도 줄여, 느려진 속도가 느린 동작(걸음 빈도 저하)으로만 보이지 않게 한다.
export const OFF_TRAIL_STRIDE=.85, BACKWARD_STRIDE=.75;
export function strideAt({plaza=false,seg,direction=1,off=false,backward=false}){return (plaza?strideFor({slope:0,material:'paved'}):strideFor(seg,direction))*(off&&!plaza?OFF_TRAIL_STRIDE:1)*(backward?BACKWARD_STRIDE:1);}
export const lateralLimit=s=>s<0?Math.max(...entranceLateralBounds(s).map(Math.abs)):sample(s).width/2+OFF_TRAIL_METRES;
export const isOffTrail=(s,lateral)=>s>=0&&Math.abs(lateral)>sample(s).width/2;
export function positionAt(s,lateral,ground){const p=sample(s),a=sample(s-2),b=sample(s+2),length=Math.hypot(b.x-a.x,b.z-a.z),nx=s<0?p.nx:-(b.z-a.z)/length,nz=s<0?p.nz:(b.x-a.x)/length,x=p.x+nx*lateral,z=p.z+nz*lateral;return [x,ground?.height(x,z,isOffTrail(s,lateral))??p.y,z];}
// 코스(zone 'route')의 시작은 일주문 아래(GATE_S). 그보다 뒤는 광장(zone 'plaza')의 자유이동이다.
export const ROUTE_MIN_S=GATE_S+1e-6;
export const SUMMIT_START_BACK=10;
const ZONES=['route','plaza','summit'];
// start: 'plaza'(일주문 앞 광장) | 'gate'(일주문 아래 s=GATE_S) | 'demo'(545m 구간) | 'summit'(정상 10m 앞, 도착 화면이 바로 뜨지 않게). entrance:true는 'plaza'와 같다.
export function initialState({entrance=false,start=entrance?'plaza':'demo'}={}){
 const plaza=start==='plaza',s=start==='demo'?DEMO_START:start==='summit'?route.length-SUMMIT_START_BACK:ROUTE_MIN_S;
 return {version:1,routeId:ROUTE_ID,routeRevision:currentRevision,entranceHypothesis:ENTRANCE_HYPOTHESIS,zone:plaza?'plaza':'route',plaza:plaza?{...PLAZA_START}:null,summit:null,summitArrived:false,s,lateral:0,elapsed:0,distance:0,ascent:0,steps:0,stepPhase:0,checkpoints:[],paused:false,auto:false,view:'first',sessions:1,stamina:100,runExhausted:false,running:false,pose:'stand',teaRemaining:0};
}
// 일주문 기준 거리(코스 표시용). 광장은 0m다.
export const courseDistance=state=>state.zone==='plaza'?0:Math.max(0,state.s-GATE_S);
export const COURSE_LENGTH=route.length-GATE_S;
const validSummit=p=>p&&[p.x,p.z,p.heading].every(Number.isFinite)&&insideSummit(p.x,p.z);
const validPlaza=p=>p&&[p.x,p.z,p.heading].every(Number.isFinite)&&insidePlaza(p.x,p.z);
// 멀티 대비 위치 하나: {zone,x,z,heading,s,lateral}. heading은 몸·이동 기준(three.js 회전), 광장에서 s·lateral은 null.
export function playerPosition(state,ground){
 if(state.zone==='plaza'){const {x,z,heading}=state.plaza;return {zone:'plaza',x,z,heading,s:null,lateral:null};}
 if(state.zone==='summit'){const {x,z,heading}=state.summit;return {zone:'summit',x,z,heading,s:state.s,lateral:state.lateral};}
 const [x,,z]=positionAt(state.s,state.lateral,ground);return {zone:'route',x,z,heading:sample(state.s).heading,s:state.s,lateral:state.lateral};
}
export function setPlayerPosition(state,pos,ground){
 if(!pos)return false;
 if(pos.zone==='plaza'){
  const plaza={x:pos.x,z:pos.z,heading:Number.isFinite(pos.heading)?pos.heading:PLAZA_START.heading};if(!validPlaza(plaza))return false;
  Object.assign(state,{zone:'plaza',plaza,s:ROUTE_MIN_S,lateral:0});return true;
 }
 if(pos.zone==='summit'){
  const summit={x:pos.x,z:pos.z,heading:Number.isFinite(pos.heading)?pos.heading:0};if(!validSummit(summit))return false;
  const r=projectToRoute(summit.x,summit.z);if(r.s<SUMMIT_ENTER_S)return false;Object.assign(state,{zone:'summit',plaza:null,summit,s:r.s,lateral:r.lateral});return true;
 }
 if(!Number.isFinite(pos.s))return false;
 const s=clamp(pos.s,ROUTE_MIN_S,route.length),bounds=s<0?entranceLateralBounds(s):[-lateralLimit(s),lateralLimit(s)];
 Object.assign(state,{zone:'route',plaza:null,summit:null,s,lateral:clamp(Number.isFinite(pos.lateral)?pos.lateral:0,...bounds)});return true;
}
export function restore(raw){try{
 const v=JSON.parse(raw);if(v.version!==1||v.routeId!==ROUTE_ID||v.routeRevision!==currentRevision||!['s','lateral','elapsed','distance','steps','stepPhase'].every(k=>Number.isFinite(v[k])))return initialState();
 const plazaSave=v.zone==='plaza'||(!ZONES.includes(v.zone)&&v.s<ROUTE_MIN_S);
 if(plazaSave&&v.entranceHypothesis!==ENTRANCE_HYPOTHESIS)return initialState({entrance:true});
 const stamina=Number.isFinite(v.stamina)?clamp(v.stamina,0,100):100,pose=['stand','sit','tea'].includes(v.pose)?v.pose:'stand';
 const result={...initialState(),elapsed:Math.max(0,v.elapsed),distance:Math.max(0,v.distance),ascent:Number.isFinite(v.ascent)?Math.max(0,v.ascent):0,steps:Math.max(0,Math.floor(v.steps)),stepPhase:clamp(v.stepPhase,0,1-1e-12),checkpoints:Array.isArray(v.checkpoints)?[...new Set(v.checkpoints.filter(x=>checkpoints.some(c=>c.id===x)))]:[],paused:true,auto:false,view:v.view==='third'?'third':'first',sessions:Math.max(1,Number(v.sessions)||1)+1,stamina,runExhausted:stamina===0||(v.runExhausted===true&&stamina<30),running:false,pose,teaRemaining:pose==='tea'?clamp(Number.isFinite(v.teaRemaining)?v.teaRemaining:TEA_SECONDS,.001,TEA_SECONDS):0};
 if(plazaSave){
  // 새 형식은 plaza{x,z,heading}, 예전 형식(s<0 접근로)은 그 자리의 월드 좌표로 옮긴다. 경계 밖이면 출발점.
  let plaza=v.zone==='plaza'?v.plaza:null;
  if(v.zone!=='plaza'){const s=clamp(v.s,ENTRANCE_MIN_S,0),[x,,z]=positionAt(s,clamp(v.lateral,...entranceLateralBounds(s)));plaza={x,z,heading:sample(s).heading};}
  return {...result,zone:'plaza',plaza:validPlaza(plaza)?{x:plaza.x,z:plaza.z,heading:plaza.heading}:{...PLAZA_START},s:ROUTE_MIN_S,lateral:0};
 }
 if(v.zone==='summit'&&validSummit(v.summit)&&projectToRoute(v.summit.x,v.summit.z).s>=SUMMIT_ENTER_S){const r=projectToRoute(v.summit.x,v.summit.z);return {...result,zone:'summit',plaza:null,summit:{x:v.summit.x,z:v.summit.z,heading:v.summit.heading},summitArrived:v.summitArrived===true,s:r.s,lateral:r.lateral};}
 const s=clamp(v.s,ROUTE_MIN_S,route.length),half=sample(s).width/2;
 const lateral=s<0?clamp(v.lateral,...entranceLateralBounds(s)):Math.abs(v.lateral)>lateralLimit(s)?clamp(v.lateral,-half+.25,half-.25):v.lateral;
 return {...result,zone:'route',plaza:null,summitArrived:v.summitArrived===true,s,lateral};
}catch{return initialState();}}
export function setPose(state,pose){
 if(pose==='tea'){if(state.pose!=='sit')return false;state.pose='tea';state.teaRemaining=TEA_SECONDS;}
 else if(pose==='stand'||pose==='sit'){state.pose=pose;state.teaRemaining=0;}else return false;
 state.auto=false;state.running=false;return true;
}
function recover(state,rate,dt){state.stamina=clamp(state.stamina+rate*dt,0,100);if(state.stamina>=30)state.runExhausted=false;}
const wrapAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const PLAZA_TURN_RATE=3;
// 카메라 기준 입력(W 앞·S 뒤·A/D 옆)을 이동 기준 방향(along 앞, right 오른쪽)으로 돌린다. yaw는 카메라가 기준 방향에서 왼쪽으로 돈 각.
export function cameraRelative(forward,side,yaw=0){const c=Math.cos(yaw),s=Math.sin(yaw);return {along:forward*c+side*s,right:side*c-forward*s};}
// 일시정지 중 걷기 입력이 들어오면 바로 이어 걷는다(이어하기·탭 복귀 뒤 첫 입력). 창이 열려 있으면 그대로 둔다.
export function resumeOnInput(state,input,{blocked=false}={}){if(!state.paused||blocked||!(Math.sign(input.forward||0)||Math.sign(input.side||0)))return false;state.paused=false;return true;}
// 광장 한 프레임 이동 후보. 문 통로를 지나 s≥ROUTE_MIN_S가 되면 코스 좌표로 넘긴다.
function planPlaza(state,f,side,budget,ground,yaw=0){
 const P=state.plaza;let dx,dz;
 if(state.auto){const t=autoTarget(P.x,P.z);dx=t.x-P.x;dz=t.z-P.z;const n=Math.hypot(dx,dz)||1;dx/=n;dz/=n;}
 else{const h=P.heading+yaw,n=Math.hypot(f,side);dx=(-Math.sin(h)*f+Math.cos(h)*side)/n;dz=(-Math.cos(h)*f-Math.sin(h)*side)/n;}
 const routeWorld=(s,l)=>positionAt(s,l,ground);
 const resolve=(x,z)=>{
  if(segmentHitsGate(P.x,P.z,x,z))return null;
  const r=routeFromWorld(x,z,routeWorld);
  if(r.s>=ROUTE_MIN_S){const [lo,hi]=entranceLateralBounds(r.s);return r.lateral>=lo&&r.lateral<=hi?{zone:'route',s:r.s,lateral:r.lateral,x,z}:null;}
  return insidePlaza(x,z)?{zone:'plaza',x,z}:null;
 };
 // 막히면 문 기준 좌우(gx)·앞뒤(gz) 중 한 성분만 남겨 경계를 따라 미끄러진다.
 const from=toGate(P.x,P.z),to=toGate(P.x+dx*budget,P.z+dz*budget);
 for(const [gx,gz] of [[to.gx,to.gz],[to.gx,from.gz],[from.gx,to.gz]]){const q=fromGate(gx,gz),hit=resolve(q.x,q.z);if(hit)return {hit,direction:{x:dx,z:dz}};}
 return {hit:null,direction:{x:dx,z:dz}};
}
export function advance(state,input,dt,onStep=()=>{},ground){
 state.running=false;if(state.paused||dt<=0||!Number.isFinite(dt))return 0;dt=Math.min(dt,.1);
 let f=Math.sign(input.forward||0),side=Math.sign(input.side||0);const direct=!!(f||side);
 if(direct&&state.pose!=='stand')setPose(state,'stand');
 if(state.pose!=='stand'){
  recover(state,15,dt);
  if(state.pose==='tea'){state.teaRemaining=Math.max(0,state.teaRemaining-dt);if(state.teaRemaining<=1e-8){recover(state,30,1);state.pose='sit';state.teaRemaining=0;}}
  return 0;
 }
 if(ground?.summit&&state.zone==='route'&&state.s>=SUMMIT_ENTER_S)enterSummit(state);
 if(state.zone==='summit'){state.auto=false;}else if(direct)state.auto=false;else if(state.auto)f=1;
 if(!f&&!side){recover(state,8,dt);return 0;}
 // 직접 입력은 카메라 기준. 뒷걸음(S 포함)은 앞으로 걷는 속도의 0.6배다.
 const yaw=direct&&Number.isFinite(input.yaw)?input.yaw:0,backward=direct&&f<0,{along,right}=cameraRelative(f,side,yaw);
 if(state.zone==='summit')return advanceSummit(state,f,side,direct&&Number.isFinite(input.yaw)?input.yaw:0,!!input.run,dt,onStep,ground);
 const plaza=state.zone==='plaza',p=sample(plaza?ROUTE_MIN_S:state.s),off=!plaza&&isOffTrail(state.s,state.lateral),running=!!input.run&&!state.runExhausted&&state.stamina>0;
 const speed=(plaza?speedFor(0,'paved',1):speedFor(p.slope,p.material,along<0?-1:1))*(running?RUN_MULTIPLIER:1)*(off?OFF_TRAIL_MULTIPLIER:1)*(backward?BACKWARD_MULTIPLIER:1),budget=speed*dt;
 const motionPosition=(s,l)=>{const pos=positionAt(s,l,ground);if(!isOffTrail(s,l))pos[1]=sample(s).y;return pos;};
 const plazaPosition=(x,z)=>[x,ground?.height(x,z,false)??route.points[0].y,z];
 let a,b,distance,allowedBudget=budget,entersOff=false,next;
 if(plaza){
  a=plazaPosition(state.plaza.x,state.plaza.z);
  let step=budget,plan;
  // 지면 높이를 포함한 실제 거리로 속도를 제한한다.
  for(let i=0;i<4;i++){plan=planPlaza(state,f,side,step,ground,yaw);if(!plan.hit)break;b=plazaPosition(plan.hit.x,plan.hit.z);distance=Math.hypot(...a.map((v,j)=>b[j]-v));if(distance<=budget+1e-10)break;step*=budget/distance;}
  if(state.auto){const target=Math.atan2(-plan.direction.x,-plan.direction.z),d=wrapAngle(target-state.plaza.heading);state.plaza.heading=wrapAngle(state.plaza.heading+Math.sign(d)*Math.min(Math.abs(d),PLAZA_TURN_RATE*dt));}
  if(!plan.hit){recover(state,8,dt);return 0;}
  next=plan.hit;b=plazaPosition(next.x,next.z);distance=Math.hypot(...a.map((v,j)=>b[j]-v));
 }else{
  const normal=Math.hypot(along,right)||1,rawS=state.s+budget*along/normal;
  let proposedS=clamp(rawS,ROUTE_MIN_S,route.length);
  let proposedSide=clamp(state.lateral+budget*right/normal,...(proposedS<0?entranceLateralBounds(proposedS):[-lateralLimit(proposedS),lateralLimit(proposedS)]));
  if(state.auto)proposedSide=state.lateral-Math.sign(state.lateral)*Math.min(Math.abs(state.lateral),budget*.6);
  a=motionPosition(state.s,state.lateral);
  // 일주문 아래에서 뒤로 가면 문 선분 좌표계를 그대로 연장해 광장으로 돌아간다.
  if(rawS<ROUTE_MIN_S){
   const w=worldFromGateFrame(rawS,proposedSide),[x0,,z0]=positionAt(state.s,state.lateral);
   if(!segmentHitsGate(x0,z0,w.x,w.z)&&insidePlaza(w.x,w.z)){next={zone:'plaza',x:w.x,z:w.z};b=plazaPosition(w.x,w.z);distance=Math.hypot(...a.map((v,j)=>b[j]-v));}
   else proposedS=Math.max(proposedS,state.s);
  }
  if(!next){
   b=motionPosition(proposedS,proposedSide);distance=Math.hypot(...a.map((v,i)=>b[i]-v));
   entersOff=isOffTrail(proposedS,proposedSide);
   allowedBudget=entersOff&&!off?budget*OFF_TRAIL_MULTIPLIER:budget;
   // 곡선·지면 높이를 포함한 실제 거리로 속도를 제한해 급한 단차를 뛰어넘지 않는다.
   for(let i=0;i<4&&distance>allowedBudget+1e-10;i++){
    const ratio=allowedBudget/distance;proposedS=state.s+(proposedS-state.s)*ratio;proposedSide=state.lateral+(proposedSide-state.lateral)*ratio;
    b=motionPosition(proposedS,proposedSide);distance=Math.hypot(...a.map((v,j)=>b[j]-v));
   }
   // 일주문 기둥·바리케이드: 경로 안팎과 무관하게 막고, 막히면 앞뒤·좌우 중 한 성분만 남겨 미끄러진다.
   const gateHit=(s,l)=>{const q=positionAt(s,l);const [x0,,z0]=positionAt(state.s,state.lateral);return segmentHitsGate(x0,z0,q[0],q[2]);};
   if(gateHit(proposedS,proposedSide)){
    if(!gateHit(proposedS,state.lateral))proposedSide=state.lateral;else if(!gateHit(state.s,proposedSide))proposedS=state.s;else{recover(state,8,dt);return 0;}
    b=motionPosition(proposedS,proposedSide);distance=Math.hypot(...a.map((v,j)=>b[j]-v));
   }
   next={zone:'route',s:proposedS,lateral:proposedSide};
  }
 }
 const blocked=!plaza&&next.zone==='route'&&ground&&(off||entersOff)&&!ground.canMove(a,b);
 if(blocked||!Number.isFinite(distance)||distance<1e-9||distance>allowedBudget+1e-6){recover(state,8,dt);return 0;}
 const oldS=plaza?null:state.s,oldLateral=state.lateral,oldPhase=state.stepPhase,oldWorld=a;
 if(next.zone==='plaza'){
  const heading=plaza?state.plaza.heading:sample(state.s).heading;
  Object.assign(state,{zone:'plaza',plaza:{x:next.x,z:next.z,heading},s:ROUTE_MIN_S,lateral:0});
 }else Object.assign(state,{zone:'route',plaza:null,summit:null,s:next.s,lateral:next.lateral});
 state.ascent+=Math.max(0,b[1]-a[1]);state.elapsed+=dt;state.distance+=distance;state.running=running;
 if(running){const horizontal=Math.hypot(b[0]-a[0],b[2]-a[2]);const uphill=Math.max(0,(b[1]-a[1])/Math.max(.001,horizontal));state.stamina=Math.max(0,state.stamina-10*(1+uphill)*dt);if(state.stamina<=0)state.runExhausted=true;}
 else recover(state,4,dt);
 const stride=strideAt({plaza:plaza||next.zone==='plaza',seg:p,direction:along<0?-1:1,off:off||entersOff,backward});state.stepPhase+=distance/stride;let crossed=0;
 while(state.stepPhase>=1){state.stepPhase--;state.steps++;const fraction=Math.min(1,((1-oldPhase)+crossed++)*stride/distance);
  // 광장·문 전환 프레임의 발소리는 포장면(paved)이고 위치는 선형 보간한다.
  if(oldS===null||next.zone==='plaza'){const position=oldWorld.map((v,j)=>v+(b[j]-v)*fraction);onStep({step:state.steps,material:'paved',slope:0,s:state.zone==='route'?state.s:null,zone:state.zone,position,distance:state.distance-distance+distance*fraction,elapsed:state.elapsed-dt+dt*fraction});continue;}
  const contactS=oldS+(state.s-oldS)*fraction,contactLateral=oldLateral+(state.lateral-oldLateral)*fraction,contact=sample(contactS);onStep({step:state.steps,material:isOffTrail(contactS,contactLateral)?'soil':contact.material,slope:contact.slope,s:contactS,zone:'route',position:positionAt(contactS,contactLateral,ground),distance:state.distance-distance+distance*fraction,elapsed:state.elapsed-dt+dt*fraction});}
 if(oldS!==null&&state.zone==='route')checkpoints.forEach(c=>{if(Math.min(oldS,state.s)<=c.s&&c.s<=Math.max(oldS,state.s)&&!state.checkpoints.includes(c.id))state.checkpoints.push(c.id);});
 if(state.zone==='route'&&state.s>=route.length){state.auto=false;state.paused=true;state.summitArrived=true;}return distance/dt;
}

// 코스 끝 40m 앞부터는 코스 이동 대신 정상 자유 이동으로 넘어간다. 서 있는 월드 위치·시선은 그대로 둔다.
function enterSummit(state){
 const [x,,z]=positionAt(state.s,state.lateral);
 Object.assign(state,{zone:'summit',plaza:null,summit:{x,z,heading:sample(state.s).heading},auto:false});
}
// 정상 구역 한 프레임. 카메라(시선) 기준 W/A/S/D, 막히면 월드 x·z 성분 하나만 남겨 미끄러진다.
// 길(s<SUMMIT_ENTER_S)로 내려서면 코스 이동으로 이어진다. 길 둘레 lateralLimit 밖이면 그쪽은 막힌다.
function advanceSummit(state,f,side,yaw,run,dt,onStep,ground){
 const G=ground.summit,P=state.summit,sites=G.sites(),backward=f<0,running=run&&!state.runExhausted&&state.stamina>0;
 const h=P.heading+yaw,n=Math.hypot(f,side),dx=(-Math.sin(h)*f+Math.cos(h)*side)/n,dz=(-Math.cos(h)*f-Math.sin(h)*side)/n;
 const a={x:P.x,z:P.z},ay=G.height(a.x,a.z),here=projectToRoute(a.x,a.z),seg0=sample(here.s),onRibbon0=Math.abs(here.lateral)<=seg0.width/2+.3;
 const material=onRibbon0?seg0.material:'rock',mult=(running?RUN_MULTIPLIER:1)*(onRibbon0?1:OFF_TRAIL_MULTIPLIER)*(backward?BACKWARD_MULTIPLIER:1);
 const tryMove=(vx,vz,length)=>{
  const q={x:a.x+vx*length,z:a.z+vz*length},ok=summitMove(G,sites,a,q,lateralLimit);if(!ok)return null;
  const {r,ribbon,seg,toRoute}=ok,qy=G.height(q.x,q.z),horizontal=Math.hypot(q.x-a.x,q.z-a.z);
  // 계단 디딤판 모서리를 넘는 한 걸음은 높이가 한 단(0.18m)씩 튄다. 걸은 거리·경사는 튄 높이를 경사 한도(0.8)로 눌러 셈한다.
  const rise=clamp(qy-ay,-.8*horizontal,.8*horizontal),slope=rise/Math.max(horizontal,1e-6);
  return {q,qy,r,ribbon,seg,toRoute,slope,distance:Math.hypot(horizontal,rise)};
 };
 const speedAt=slope=>speedFor(clamp(slope,-.8,.8),material,slope>=0?1:-1)*mult;
 let hit=null;
 for(const [vx,vz] of [[dx,dz],[dx,0],[0,dz]]){
  if(!vx&&!vz)continue;let length=speedAt(0)*dt,m=null;
  for(let i=0;i<4;i++){m=tryMove(vx,vz,length);if(!m)break;const allowed=speedAt(m.slope)*dt;if(m.distance<=allowed+1e-10)break;length*=allowed/m.distance;m=null;}
  if(m){hit=m;break;}
 }
 if(!hit){recover(state,8,dt);return 0;}
 const {q,r,seg}=hit,distance=hit.distance,oldPhase=state.stepPhase,from={x:a.x,z:a.z,y:ay};
 if(hit.toRoute)Object.assign(state,{zone:'route',plaza:null,summit:null,s:Math.max(ROUTE_MIN_S,r.s),lateral:r.lateral});
 else Object.assign(state,{zone:'summit',summit:{x:q.x,z:q.z,heading:P.heading},s:r.s,lateral:r.lateral});
 state.ascent+=Math.max(0,hit.qy-ay);state.elapsed+=dt;state.distance+=distance;state.running=running;
 if(running){const horizontal=Math.hypot(q.x-a.x,q.z-a.z),uphill=Math.max(0,(hit.qy-ay)/Math.max(.001,horizontal));state.stamina=Math.max(0,state.stamina-10*(1+uphill)*dt);if(state.stamina<=0)state.runExhausted=true;}
 else recover(state,4,dt);
 const stepMaterial=hit.ribbon?seg.material:'rock',stride=strideAt({seg:{slope:hit.slope,material:stepMaterial},direction:hit.slope>=0?1:-1,off:!hit.ribbon,backward});
 state.stepPhase+=distance/stride;let crossed=0;
 while(state.stepPhase>=1){state.stepPhase--;state.steps++;const fraction=Math.min(1,((1-oldPhase)+crossed++)*stride/distance);
  onStep({step:state.steps,material:stepMaterial,slope:hit.slope,s:r.s,zone:state.zone,position:[from.x+(q.x-from.x)*fraction,from.y+(hit.qy-from.y)*fraction,from.z+(q.z-from.z)*fraction],distance:state.distance-distance+distance*fraction,elapsed:state.elapsed-dt+dt*fraction});}
 if(state.zone==='summit'&&!state.summitArrived&&reachedSummit(q.x,q.z,sites)){state.summitArrived=true;state.auto=false;state.paused=true;}
 return distance/dt;
}
