// 동물 출현 구역·배회 계획(2026-11-07). three.js 없이 숫자만 다루는 순수 함수라 테스트에서 그대로 부른다.
// 같은 구역 id + 같은 시간 칸(5분, TRAIL_RULES.animalSlot)이면 어느 컴퓨터에서든 같은 자리·같은 종류·같은 움직임이 나온다.
// 멀티에서 같은 방 사람이 같은 동물을 보게 하는 방법이고 서버 동기화는 없다. 놀라서 달아나기 같은 반응은 각자 화면에서만(trail-world.js).
// 좌표: 길 구역은 (u = 코스 수평거리 m, v = 길 가운데선에서 옆으로 떨어진 거리 m, + = side +1 쪽). 일주문 기준 구역은 (u,v) = 기준 좌표 x·z.
// 월드 좌표로 바꾸는 일은 trail-world.js(routeMeasure·frame)가 한다.
import {ANIMAL_STYLE,ANIMAL_TIME,ANIMAL_SEASON} from './interaction-data.js';
import {laneLimit,inForbid,ANIMAL_LANE_STEP} from './animal-lanes.js';

// 문자열 → 32비트 씨앗(xmur3), 씨앗 → [0,1) 난수열(mulberry32). Math.random과 달리 어디서나 같은 수열이 나온다.
export function hashSeed(text){let h=1779033703^text.length;for(let i=0;i<text.length;i++){h=Math.imul(h^text.charCodeAt(i),3432918353);h=h<<13|h>>>19;}
 h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return (h^h>>>16)>>>0;}
export function seededRandom(seed){let a=typeof seed==='string'?hashSeed(seed):seed>>>0;
 return ()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export const slotOf=(sec,slotSeconds=300)=>Math.floor(sec/slotSeconds);
const U=(r,[a,b])=>a+(b-a)*r();
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));

// 시간대: 새벽 5~8 · 낮 8~17(한낮 11~15) · 해질녘 17~20 · 밤
export function timeBand(hour){if(!Number.isFinite(hour))return 'day';const h=((hour%24)+24)%24;
 return h>=5&&h<8?'dawn':h>=11&&h<15?'noon':h>=8&&h<17?'day':h>=17&&h<20?'dusk':'night';}
// 구역의 종류별 가중 × 시간대 × 계절
export function zoneWeights(zone,{season=null,hour=null}={}){const band=timeBand(hour),out={};
 for(const [kind,w] of Object.entries(zone.w??{}))out[kind]=w*(ANIMAL_TIME[kind]?.[band]??1)*(ANIMAL_SEASON[kind]?.[season]??1);return out;}

// ── 설 수 있는 자리(2026-11-07 산풍경 animal-lanes.js 연결): 길 구역은 길 가장자리에서 허용 폭(laneLimit: 절벽 40°·물·다른 구간 노면 − 0.3m) 안,
// 모든 구역은 금지 원(inForbid: 바위·시설) 밖. toWorld(zone,u,v) → {x,z}가 없으면 금지 원은 보지 않는다(허용 폭만).
// 길 구역 offset 상한 = min(ANIMAL_STYLE offset[1], zone.maxOffset, laneLimit(u,side)). offset[0]보다 작으면 그 자리·그 쪽은 못 선다(null).
function offsetTop(zone,kind,u,side){const [a,b]=ANIMAL_STYLE[kind].offset,top=Math.min(b,zone.maxOffset?.[kind]??b,laneLimit(u,side)-1e-6);return top>=a?top:null;}
export function spotOk(zone,u,v,{halfWidth=()=>1.1,toWorld=null}={}){
 if(!zone.box&&Math.abs(v)-halfWidth(u)>laneLimit(u,v>=0?1:-1))return false;
 if(toWorld){const p=toWorld(zone,u,v);if(inForbid(p.x,p.z))return false;}
 return true;}
// 걸어서 옮기는 다리: 0.05m 간격 표본(출발점 제외, 금지 원 가장자리를 스치는 길도 잡게)과 허용 폭 칸(5m) 경계 바로 앞·뒤 자리(허용 폭은 칸 안에서 일정하고 경계에서만 바뀐다)가 모두 설 수 있는 자리여야 한다.
// leap(날기·나무 위에서 다른 자리로) = 도착점만 본다.
export const PATH_SAMPLE=.05;
export function legOk(zone,from,to,ctx,leap=false){
 if(leap)return spotOk(zone,to.u,to.v,ctx);
 const at=k=>spotOk(zone,from.u+(to.u-from.u)*k,from.v+(to.v-from.v)*k,ctx),n=Math.max(1,Math.ceil(dist2(from,to)/PATH_SAMPLE));
 for(let i=1;i<=n;i++)if(!at(i/n))return false;
 if(!zone.box&&to.u!==from.u){const a=Math.min(from.u,to.u),b=Math.max(from.u,to.u);
  for(let c=Math.ceil(a/ANIMAL_LANE_STEP)*ANIMAL_LANE_STEP;c<=b;c+=ANIMAL_LANE_STEP){for(const e of [-1e-6,0]){const k=(c+e-from.u)/(to.u-from.u);if(k>0&&k<=1&&!at(k))return false;}}}
 return true;}
const PLACE_TRIES=12;

// 구역 하나의 이번 시간 칸 동물 목록. 구역을 count(없으면 120m에 하나)칸으로 고르게 나눠 칸마다 한 마리까지 뽑는다.
// halfWidth(m) = 그 자리 노면 반폭(길 가장자리에서 offset만큼 떨어뜨린다). salt = 방 이름 등(같은 값이면 같은 결과).
// toWorld(zone,u,v) → {x,z}: 금지 원 확인용(trail-world.js의 toWorld와 같은 식).
// 자리가 허용 폭 밖·금지 원 안이면 먼저 반대쪽, 그다음 그 칸 씨앗에서 이어지는 난수열로 다시 뽑는다(최대 12번, 다 실패하면 그 칸은 비운다).
export const SPAWN_SPACING=120;
export function zoneSpawns(zone,slot,{season=null,hour=null,halfWidth=()=>1.1,toWorld=null,slotSeconds=300,salt=''}={}){
 const r=seededRandom(`${salt}|${zone.id}|${slot}`),w=zoneWeights(zone,{season,hour}),kinds=Object.keys(w).filter(k=>w[k]>0&&ANIMAL_STYLE[k]);
 const sum=kinds.reduce((n,k)=>n+w[k],0);if(!sum)return [];
 const area=!!zone.box,len=area?0:zone.to-zone.from,n=zone.count??Math.max(1,Math.round(len/SPAWN_SPACING)),present=clamp(sum/3,.3,1),out=[];
 for(let i=0;i<n;i++){
  const p=r(),pick=r()*sum,side=r()<.5?1:-1,ra=r(),rb=r(),seed=Math.floor(r()*4294967296);   // 칸마다 같은 개수의 난수를 써서 다른 칸 결과가 밀리지 않게 한다
  if(p>present)continue;
  let acc=0,kind=kinds.at(-1);for(const k of kinds){acc+=w[k];if(pick<acc){kind=k;break;}}
  const at=place(zone,kind,i,n,len,side,ra,rb,seed,{halfWidth,toWorld});if(!at)continue;
  const {u,v}=at;
  out.push({id:`${zone.id}@${slot}#${i}`,kind,zone:zone.id,slot,t0:slot*slotSeconds,u,v,home:{u,v},seed});}
 return out;
}
// 칸 i의 출현 자리. 첫 시도는 칸 난수(ra·rb·side) 그대로라 막히지 않은 곳은 예전과 같은 자리다.
function place(zone,kind,i,n,len,side,ra,rb,seed,ctx){
 const spot=(a,b,sd)=>{if(zone.box){const [x0,x1,z0,z1]=zone.box;return {u:x0+(x1-x0)*(i+.15+.7*a)/n,v:z0+(z1-z0)*b};}
  const u=zone.from+(i+.15+.7*a)*len/n,o=offsetRange(zone,kind,b,u,sd);return o==null?null:{u,v:sd*(ctx.halfWidth(u)+o)};};
 const ok=p=>p&&spotOk(zone,p.u,p.v,ctx);
 let p=spot(ra,rb,side);if(ok(p))return p;
 if(!zone.box&&ok(p=spot(ra,rb,-side)))return p;
 const r=seededRandom((seed^0x9E3779B9)>>>0);
 for(let k=0;k<PLACE_TRIES;k++){const a=r(),b=r(),sd=r()<.5?1:-1;if(ok(p=spot(a,b,sd)))return p;}
 return null;
}
function offsetRange(zone,kind,r,u,side){const a=ANIMAL_STYLE[kind].offset[0],top=offsetTop(zone,kind,u,side);return top==null?null:a+(top-a)*r;}

// ── 배회 계획: 다리(leg) 목록 {t0,t1,mode,from,to,arc,hops}. 시간 t(초)의 자리는 다리 안에서 직선 보간(+ 높이 h).
// mode: run(다람쥐 뛰기)·pause·climb(나무 타기)·hidden(나무 위·덤불 속)·hop(토끼 깡충 묶음)·graze(풀 뜯기)·look(두리번)
//       walk(까치 종종걸음)·peck·fly(짧은 비행)·prowl(고양이 어슬렁)·sit. cross = 이 다리가 등산로를 가로지른다.
// 다음 목표 자리. 허용 폭 밖·금지 원 안을 지나거나 거기서 끝나면 같은 난수열에서 다시 뽑고(거리는 0.7배씩 줄임), 8번 다 막히면 제자리에 있는다.
function target(sp,zone,from,dist,{cross=false,leap=false,halfWidth,toWorld}){
 const ctx={halfWidth,toWorld};
 for(let k=0;k<8;k++,dist*=.7){const to=pickTarget(sp,zone,from,dist,{cross,halfWidth});if(to&&legOk(zone,from,to,ctx,leap))return to;}
 return {u:from.u,v:from.v};
}
function pickTarget(sp,zone,from,dist,{cross,halfWidth}){
 const st=ANIMAL_STYLE[sp.kind],r=sp.rand;
 if(zone.box){const [x0,x1,z0,z1]=zone.box,a=r()*Math.PI*2;return {u:clamp(from.u+Math.cos(a)*dist,x0,x1),v:clamp(from.v+Math.sin(a)*dist,z0,z1)};}
 const lo=Math.max(zone.from,sp.home.u-st.roam),hi=Math.min(zone.to,sp.home.u+st.roam);
 if(cross){const u=clamp(from.u+(r()*2-1)*Math.min(2,dist),lo,hi),side=from.v>=0?-1:1,o=offsetRange(zone,sp.kind,r(),u,side);return o==null?null:{u,v:side*(halfWidth(u)+o)};}
 const a=r()*Math.PI*2,u=clamp(from.u+Math.cos(a)*dist,lo,hi),side=from.v>=0?1:-1,o0=st.offset[0],top=offsetTop(zone,sp.kind,u,side),hw=halfWidth(u);
 if(top==null)return null;
 return {u,v:side*clamp(Math.abs(from.v)+Math.sin(a)*dist*.6,hw+o0,hw+top)};
}
const dist2=(a,b)=>Math.hypot(b.u-a.u,b.v-a.v);
function nextLegs(sp,zone,halfWidth,toWorld){
 const st=ANIMAL_STYLE[sp.kind],r=sp.rand,legs=sp.legs,cur=()=>legs.length?legs.at(-1).to:{u:sp.u,v:sp.v},end=()=>legs.length?legs.at(-1).t1:sp.t0,at=cur();
 // 멈춤 다리(to 생략)는 바로 앞 다리가 끝난 자리에 그대로 있는다
 const push=(mode,dur,to=cur(),extra={})=>{const t0=end();legs.push({t0,t1:t0+Math.max(.05,dur),mode,from:cur(),to,...extra});};
 const move=(mode,speed,cross)=>{const to=target(sp,zone,at,U(r,st.step),{cross:cross&&!zone.box,halfWidth,toWorld});return {to,dur:dist2(at,to)/speed};};
 if(sp.kind==='squirrel'){
  const {to,dur}=move('run',U(r,st.speed),r()<st.cross);push('run',dur,to,{cross:Math.sign(to.v)!==Math.sign(at.v)});push('pause',U(r,st.pause));
  if(r()<st.climb){push('climb',st.climbTime);const back=target(sp,zone,sp.home,U(r,[0,st.roam]),{leap:true,halfWidth,toWorld});push('hidden',U(r,st.hidden),back);
   legs.at(-1).from=back;push('pause',1);}   // 나무 위(또는 덤불)로 사라졌다가 구역 안 다른 자리에서 다시 나타난다
 }else if(sp.kind==='hare'){
  const cross=r()<st.cross,{to,dur}=move('hop',st.speed[0],cross),hops=Math.max(Math.round(U(r,st.hops)),Math.ceil(dur/st.hopTime));
  push('hop',Math.max(dur,hops*st.hopTime),to,{hops,arc:.12,cross:Math.sign(to.v)!==Math.sign(at.v)});push('graze',U(r,st.graze));push('look',U(r,st.look));
 }else if(sp.kind==='magpie'){
  if(r()<st.fly){const cross=r()<st.flyCross,to=target(sp,zone,at,U(r,st.flyStep),{cross:cross&&!zone.box,leap:true,halfWidth,toWorld});push('fly',st.flyTime,to,{arc:U(r,st.flyArc),cross:Math.sign(to.v)!==Math.sign(at.v)});}
  else{const {to,dur}=move('walk',st.speed[0],r()<st.cross);push('walk',dur,to,{cross:Math.sign(to.v)!==Math.sign(at.v)});}
  push('peck',U(r,st.pause));
 }else{ // 고양이: 가로지를 때는 길 한가운데서 잠깐 멈춘다
  let to,mid;const ctx={halfWidth,toWorld};
  if(!zone.box&&r()<st.cross&&(to=target(sp,zone,at,U(r,st.step),{cross:true,halfWidth,toWorld}),mid={u:(at.u+to.u)/2,v:0},Math.sign(to.v)!==Math.sign(at.v)&&legOk(zone,at,mid,ctx)&&legOk(zone,mid,to,ctx))){
   push('prowl',dist2(at,mid)/st.speed[0],mid,{cross:true});push('sit',U(r,st.crossPause));push('prowl',dist2(mid,to)/st.speed[0],to,{cross:true});}
  else{const {to,dur}=move('prowl',st.speed[0],false);push('prowl',dur,to);}
  push('sit',U(r,st.pause));
 }
}
// 시간 sec(초, 1970년부터)의 배회 상태. 다리는 필요한 만큼만 이어 만들고(sp.legs에 쌓음), 같은 sp·같은 sec면 늘 같은 값이다.
// 돌려주는 값: {u,v,h(땅 위 높이 m),mode,k(다리 안 진행 0~1),du,dv(이 다리의 움직임 방향),cross}
// toWorld(zone,u,v) → {x,z}: 금지 원 확인용(없으면 허용 폭만 본다). 같은 sp는 늘 같은 toWorld로 불러야 결정성이 유지된다.
export function wanderAt(sp,sec,zone,halfWidth=()=>1.1,toWorld=null){
 if(!sp.legs){sp.legs=[];sp.rand=seededRandom(sp.seed);sp.cursor=0;}
 const t=Math.max(sp.t0,sec);let guard=0;
 while((!sp.legs.length||sp.legs.at(-1).t1<=t)&&guard++<5000)nextLegs(sp,zone,halfWidth,toWorld);
 let i=Math.min(sp.cursor,sp.legs.length-1);if(sp.legs[i].t0>t)i=0;while(sp.legs[i].t1<=t&&i<sp.legs.length-1)i++;sp.cursor=i;
 const L=sp.legs[i],k=clamp((t-L.t0)/(L.t1-L.t0),0,1),mode=L.mode;
 const u=L.from.u+(L.to.u-L.from.u)*k,v=L.from.v+(L.to.v-L.from.v)*k;
 const h=mode==='fly'?(L.arc??2)*Math.sin(Math.PI*k):mode==='hop'?(L.arc??.12)*Math.abs(Math.sin(Math.PI*k*(L.hops??1))):0;
 return {u,v,h,mode,k,du:L.to.u-L.from.u,dv:L.to.v-L.from.v,cross:!!L.cross,leg:i};
}

// ── 분포 확인: 코스를 cell m 칸으로 나눠, 즐길거리 자리(points m)도 동물 구역도 없는 칸 목록. 완료 기준 = 빈 칸 0개.
export function emptyCells(length,{points=[],zones=[],cell=250}={}){
 const out=[];for(let a=0;a<length;a+=cell){const b=Math.min(length,a+cell);
  const hit=points.some(m=>m>=a&&m<b)||zones.some(z=>!z.box&&z.from<b&&z.to>a&&Object.values(z.w??{}).some(w=>w>0));if(!hit)out.push([a,b]);}
 return out;
}
