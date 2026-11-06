// 상호작용 순수 로직(화면·장면 없이 시험 가능). 좌표는 앱 좌표(동 +x, 남 +z), heading은 three.js 회전(앞 = (-sin h, -cos h)).
import {RULES,STAMPS,LANDMARKS,WEATHER_VISIBILITY_KM,LANDMARK_MIN_ELEVATION} from './interaction-data.js';
const rad=Math.PI/180,deg=180/Math.PI,EARTH_R=6371000;
export const wrapPi=a=>Math.atan2(Math.sin(a),Math.cos(a));
export const wrap180=d=>((d+540)%360)-180;
export const wrap360=d=>((d%360)+360)%360;

// ── 방위 ─────────────────────────────────────────────
// 진북 기준 시계방향 방위(도) ↔ 앱 방향 벡터. 북 = -z, 동 = +x, 남 = +z, 서 = -x.
export const bearingToDirection=b=>({x:Math.sin(b*rad),z:-Math.cos(b*rad)});
export const directionToBearing=(x,z)=>wrap360(Math.atan2(x,-z)*deg);
// 카메라 heading(앞 = (-sin h, -cos h))의 진북 방위. 앞 벡터 (-sin h,-cos h) = bearingToDirection(-h).
export const headingToBearing=h=>wrap360(-h*deg);
export const bearingToHeading=b=>-b*rad;
// 위경도 두 점의 초기 방위(도)와 대원거리(m).
export function initialBearing(lat1,lon1,lat2,lon2){
 const p1=lat1*rad,p2=lat2*rad,dl=(lon2-lon1)*rad,y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);
 return wrap360(Math.atan2(y,x)*deg);
}
export function greatCircle(lat1,lon1,lat2,lon2){
 const p1=lat1*rad,p2=lat2*rad,dp=p2-p1,dl=(lon2-lon1)*rad,a=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
 return 2*EARTH_R*Math.asin(Math.min(1,Math.sqrt(a)));
}
// 관측 고도에서 본 고각(도). 지구 곡률 낙차에 대기 굴절 k=0.13을 반영한다(자료 §③와 같은 방식).
export function elevationDeg(distanceM,topAlt,obsAlt,k=.13){
 const drop=(1-k)*distanceM*distanceM/(2*EARTH_R);
 return Math.atan2(topAlt-obsAlt-drop,distanceM)*deg;
}
// 쌍안경 화면의 방위 띠 폭 ±25°
export const TAPE_HALF=25;

// 한 랜드마크를 지금 서 있는 앱 좌표(px,pz)·해발에서 본 값. local = geographicToLocal이 준 {x,z}.
export function landmarkAt(lm,local,player,visKm){
 const dx=local.x-player.x,dz=local.z-player.z,distance=Math.hypot(dx,dz),bearing=directionToBearing(dx,dz);
 const elev=elevationDeg(distance,lm.topAlt,player.elevation);
 const km=distance/1000;
 return {...lm,distance,km,bearing,elev,seeable:!lm.far&&km<=Math.min(lm.maxKm,visKm),directionOnly:!!lm.far,hazyNow:km>visKm};
}
export const weatherVisibility=kind=>WEATHER_VISIBILITY_KM[kind]??WEATHER_VISIBILITY_KM.clear;
export const landmarksEnabled=(zone,elevation)=>zone==='summit'||elevation>=LANDMARK_MIN_ELEVATION;
// 카메라 방위 기준으로 정리: 띠(±25°)·시야 안(fov/2)·시야 밖 가장자리 알약(가장 가까운 2개)·가운데 맞춤(±1.2°).
export function classifyLandmarks(list,cameraBearing,{halfFov=3.5,focusDeg=1.2}={}){
 const rows=list.map(l=>({...l,delta:wrap180(l.bearing-cameraBearing)}));
 const tape=rows.filter(r=>Math.abs(r.delta)<=TAPE_HALF);
 const inView=rows.filter(r=>Math.abs(r.delta)<=halfFov);
 const edges=rows.filter(r=>Math.abs(r.delta)>halfFov&&Math.abs(r.delta)<=TAPE_HALF+10).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta)).slice(0,2);
 const focus=rows.filter(r=>Math.abs(r.delta)<=focusDeg).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta))[0]??null;
 return {rows,tape,inView,edges,focus};
}
// 이름표 겹침 풀기: 왼쪽부터 놓으며 겹치면 위로 계단식(최대 maxRows줄). width(px) 추정은 글자 수 기준.
export function stackLabels(items,maxRows=3,widthOf=i=>i.name.length*22+48){
 const rows=Array.from({length:maxRows},()=>-Infinity),out=[];
 for(const it of [...items].sort((a,b)=>a.x-b.x)){
  const w=widthOf(it),left=it.x-w/2;let r=rows.findIndex(end=>left>end+8);if(r<0)r=out.length%maxRows;
  rows[r]=it.x+w/2;out.push({...it,row:r});
 }
 return out;
}

// ── 이정표 화살표 ────────────────────────────────────
// 판의 가리킴 방향(월드 각 a: 벡터 (sin a, cos a))을 내가 보는 방향 기준 화면 회전(시계방향 라디안, 0 = 위·앞)으로.
export const arrowAngle=(worldAngle,cameraHeading)=>wrapPi(cameraHeading+Math.PI-worldAngle);
export function arrowGlyph(angle){
 const a=((angle*deg)%360+360)%360;
 return ['↑','↗','→','↘','↓','↙','←','↖'][Math.round(a/45)%8];
}

// ── 후보 선택 ────────────────────────────────────────
// cands: [{id,group,x,z,showRadius,...}]. player: {x,z,heading}. current: 지금 보이는 후보 id(깜빡임 방지용 6.5m).
// 보임 조건: 시선 ±70° 안 + showRadius 안. 이미 보이는 후보는 hide(6.5m) 밖으로 나가야 사라진다.
export function pickCandidate(cands,player,currentId=null){
 const fx=-Math.sin(player.heading),fz=-Math.cos(player.heading);
 let best=null;const near=[];
 for(const c of cands){
  const dx=c.x-player.x,dz=c.z-player.z,d=Math.hypot(dx,dz),ang=d<.05?0:Math.acos(Math.max(-1,Math.min(1,(dx*fx+dz*fz)/d)));
  const radius=c.showRadius??RULES.show,sticky=c.id===currentId&&d<=RULES.hide;
  const inReach=d<=radius&&ang<=RULES.cone;
  if(d<=radius)near.push({c,d,ang});
  if(!(inReach||sticky))continue;
  const score=d+ang*2.5-(sticky?1.2:0);
  if(!best||score<best.score)best={c,d,ang,score};
 }
 if(!best)return null;
 const stack=near.filter(n=>n.c.id!==best.c.id&&n.c.group&&n.c.group===best.c.group).sort((a,b)=>a.d-b.d).map(n=>n.c);
 return {primary:best.c,distance:best.d,angle:best.ang,stack};
}
// 15m 안 마커 후보(이미 한 곳은 뺀다). 가까운 순 max개.
export function markerCandidates(cands,player,{done=()=>false,max=6}={}){
 return cands.map(c=>({c,d:Math.hypot(c.x-player.x,c.z-player.z)})).filter(o=>o.d<=RULES.marker&&!done(o.c)).sort((a,b)=>a.d-b.d).slice(0,max);
}

// ── 스탬프·수첩 저장 ──────────────────────────────────
export const PROGRESS_KEY='gwanak-interaction:v1';
export const emptyProgress=()=>({stamps:{},stones:0,read:{},certifiedAt:null,drinks:0,dips:0,stretches:0,fun:{}});
// 즐길거리 칸(코스 스탬프 6개와 따로, 완등 카드 조건에 넣지 않는다): 역기 10회 → 산스장 득근, 에어건 → 깨끗한 신발
export const FUN_BADGES=Object.freeze([{id:'gym',glyph:'득근',name:'산스장 득근',hint:'산스장 역기 10번'},{id:'shoes',glyph:'✨',name:'깨끗한 신발',hint:'입구 에어건으로 신발 털기'}]);
// 처음 얻으면 true(시각 기록), 이미 있으면 false
export function addFun(p,id,at){if(!FUN_BADGES.some(b=>b.id===id))return false;p.fun??={};if(p.fun[id])return false;p.fun[id]={at};return true;}
export function loadProgress(storage){
 try{const raw=storage?.getItem(PROGRESS_KEY);if(!raw)return emptyProgress();const v=JSON.parse(raw),out=emptyProgress();
  for(const s of STAMPS){const r=v.stamps?.[s.id];if(r&&Number.isFinite(r.at))out.stamps[s.id]={at:r.at,km:Number.isFinite(r.km)?r.km:s.km,elev:Number.isFinite(r.elev)?r.elev:s.elev,weather:String(r.weather??'')};}
  for(const k of ['stones','drinks','dips','stretches'])out[k]=Number.isFinite(v[k])?Math.max(0,Math.floor(v[k])):0;
  if(v.read&&typeof v.read==='object')for(const [k,t] of Object.entries(v.read))if(t===true)out.read[k]=true;
  for(const b of FUN_BADGES){const r=v.fun?.[b.id];if(r&&Number.isFinite(r.at))out.fun[b.id]={at:r.at};}
  out.certifiedAt=Number.isFinite(v.certifiedAt)?v.certifiedAt:null;return out;
 }catch{return emptyProgress();}
}
export function saveProgress(storage,p){try{storage?.setItem(PROGRESS_KEY,JSON.stringify(p));return true;}catch{return false;}}
export const stampCount=p=>STAMPS.filter(s=>p.stamps[s.id]).length;
export const hasAllStamps=p=>stampCount(p)===STAMPS.length;
// 도장 찍기. 이미 찍었으면 false(기록은 바꾸지 않는다).
export function addStamp(p,id,info){
 if(!STAMPS.some(s=>s.id===id)||p.stamps[id])return false;
 p.stamps[id]={at:info.at,km:info.km,elev:info.elev,weather:info.weather??''};return true;
}
// 수첩 칸 목록: 찍은 칸은 기록, 못 찍은 칸은 "다음 ·" 표시와 앞 칸에서 몇 km인지.
export function notebookSlots(p){
 let lastKm=0,next=-1;STAMPS.forEach((s,i)=>{if(next<0&&!p.stamps[s.id])next=i;});
 return STAMPS.map((s,i)=>{const r=p.stamps[s.id];if(r){lastKm=s.km;return {...s,got:true,at:r.at,recKm:r.km,recElev:r.elev,weather:r.weather};}
  const ahead=Math.max(0,s.km-lastKm);return {...s,got:false,next:i===next,ahead};});
}
export const pad2=n=>String(n).padStart(2,'0');
export const clock=ms=>{const d=new Date(ms);return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;};
export const dateText=ms=>{const d=new Date(ms),w=['일','월','화','수','목','금','토'][d.getDay()];return `${d.getFullYear()}.${pad2(d.getMonth()+1)}.${pad2(d.getDate())} (${w})`;};
export const hms=sec=>{sec=Math.max(0,Math.floor(sec));return `${pad2(Math.floor(sec/3600))}:${pad2(Math.floor(sec/60)%60)}:${pad2(sec%60)}`;};
// 완등 카드 값. 거리·시간·오른 높이는 게임 상태(state.distance·elapsed·ascent) 그대로.
export function cardData(state,progress,{now=Date.now(),weatherLabel='',nickname='산길 손님',photo=null}={}){
 return {date:dateText(progress.certifiedAt??now),time:clock(progress.certifiedAt??now),weather:weatherLabel,nickname,photo,
  elapsed:hms(state.elapsed),distanceKm:`${(state.distance/1000).toFixed(2)} km`,ascent:`+${Math.round(state.ascent)} m`,
  stampText:`${stampCount(progress)} / ${STAMPS.length}`,stamps:STAMPS.map(s=>({...s,got:!!progress.stamps[s.id]}))};
}

// ── 행동 쿨다운·효과 ─────────────────────────────────
export function actionReady(cool,id,now){const t=cool[id];return !(t&&now<t);}
export function applyStamina(state,amount){const before=state.stamina;state.stamina=Math.max(0,Math.min(100,state.stamina+amount));if(state.stamina>=30)state.runExhausted=false;return state.stamina-before;}
