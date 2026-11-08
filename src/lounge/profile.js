// 내 정보(브라우저에만 저장, localStorage 'online-smoking'): 이름·옷·금연 시작일·하루 갑 수·가격·누적 기록·설정.
import {outfitKey} from './outfit.js';
const KEY='online-smoking';
export const DEFAULT_PROFILE=Object.freeze({nickname:'',outfit:'shirt',status:'quit',quitDate:null,packsPerDay:.5,packPrice:4500,muted:false,timeMode:'auto',
 stats:{cigs:0,puffs:0,visits:0,chats:0,lastVisit:null,butts:0,manners:0,record:{date:null,today:0,total:0,savedWon:0}},seenIntro:false});
export function loadProfile(){
 try{const p=JSON.parse(localStorage.getItem(KEY)||'{}');return {...DEFAULT_PROFILE,...p,outfit:outfitKey(p.outfit),stats:{...DEFAULT_PROFILE.stats,...(p.stats??{})}};}
 catch{return structuredClone(DEFAULT_PROFILE);}
}
export function saveProfile(p){try{localStorage.setItem(KEY,JSON.stringify(p));}catch{}}
// 금연 일수(시작일 포함 1일째)와 아낀 돈(원)
export function quitStats(p,now=Date.now()){
 if(p.status!=='quit'||!p.quitDate)return null;
 const start=new Date(p.quitDate+'T00:00:00+09:00').getTime(),days=Math.max(0,Math.floor((now-start)/86400000));
 const saved=Math.round(days*p.packsPerDay*p.packPrice/100)*100,cigs=Math.round(days*p.packsPerDay*20);
 return {days:days+1,elapsedDays:days,saved,cigs};
}

// ── 금연 기록 도장(기획서 v2 B7): 한 대를 다 피우면 진짜 담배 1개비를 참은 것으로 센다. 한 개비 값 = 한 갑 값 ÷ 20(4,500원 → 225원).
const seoulDay=(now=Date.now())=>new Date(now+9*3600e3).toISOString().slice(0,10);
export const cigWon=p=>Math.round((p.packPrice||4500)/20);
// stats.record에 한 개비를 더한 새 record. 날짜가 바뀌었으면 오늘은 0부터.
export function recordCig(p,now=Date.now()){
 const r=p.stats?.record??{},day=seoulDay(now);
 return {date:day,today:(r.date===day?r.today||0:0)+1,total:(r.total||0)+1,savedWon:(r.savedWon||0)+cigWon(p)};
}
// 오늘 값(날짜가 지났으면 0)
export const todayCigs=(p,now=Date.now())=>{const r=p.stats?.record;return r&&r.date===seoulDay(now)?r.today||0:0;};
// 내 담배가 다 타면(lounge:smoke state 'finished') 기록한다. 금연 중일 때만. onStamp({won,today,total,savedWon})로 도장을 찍게 알린다.
export function attachRecord({profile,save,dispatch,onStamp,playerId='me',win=globalThis.window}){
 const on=e=>{const d=e.detail??{};if(d.id!==playerId||d.state!=='finished'||profile.status!=='quit')return;
  const record=recordCig(profile),out={today:record.today,total:record.total,savedWon:record.savedWon,won:cigWon(profile)};
  save({stats:{...profile.stats,record}});
  dispatch('lounge:record',out);onStamp?.(out);};
 win.addEventListener('lounge:smoke',on);
 return ()=>win.removeEventListener('lounge:smoke',on);
}
