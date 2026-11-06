// 완등 기록(브라우저 localStorage). 산 고르기 카드·지도·정상 도착 창의 '등산 완료' 도장과 자유 설정 잠금 해제에 쓴다.
// 모양: {gwanak:{first:'2026-11-06',count:2,bestSec:7960,last:'2026-11-07'}} (사양 §2-4). three를 쓰지 않는다.
export const SUMMITS_KEY='gwanak-summits';
export const SEAL_SEEN_KEY='gwanak-summits-seen';
const valid=r=>r&&typeof r==='object'&&Number.isFinite(r.count)&&r.count>0;
export function loadSummits(storage){
 try{const v=JSON.parse(storage?.getItem(SUMMITS_KEY)||'{}');if(!v||typeof v!=='object'||Array.isArray(v))return {};
  return Object.fromEntries(Object.entries(v).filter(([,r])=>valid(r)));}catch{return {};}
}
export const summitOf=(records,id)=>valid(records?.[id])?records[id]:null;
// 정상에 닿은 순간 한 번 부른다. date는 서울 날짜 'YYYY-MM-DD', sec는 걸은 시간(초).
export function recordSummit(storage,id,{date,sec=null}={}){
 const all=loadSummits(storage),prev=all[id];
 const r=prev?{...prev}:{first:date,count:0,bestSec:null,last:null};
 r.count+=1;r.last=date;if(!r.first)r.first=date;
 if(Number.isFinite(sec)&&sec>0&&(!Number.isFinite(r.bestSec)||sec<r.bestSec))r.bestSec=Math.round(sec);
 all[id]=r;try{storage?.setItem(SUMMITS_KEY,JSON.stringify(all));}catch{}
 return r;
}
export function clearSummits(storage){try{storage?.removeItem(SUMMITS_KEY);storage?.removeItem(SEAL_SEEN_KEY);}catch{}}
// 도장 글자: '2026-11-06' → '2026.11.06'
export const sealDate=d=>String(d??'').replaceAll('-','.');
const pad=n=>String(n).padStart(2,'0');
export const formatSec=s=>Number.isFinite(s)?`${Math.floor(s/3600)}:${pad(Math.floor(s/60)%60)}:${pad(Math.floor(s)%60)}`:'—';
// 기록 한 줄(카드·지도). HTML이 아니라 조각 배열 [글, 강조?]로 돌려준다.
export function recordLine(r){
 if(!r)return null;
 const out=[['완등 '],[`${r.count}회`,true],[` · 처음 ${sealDate(r.first)}`]];
 if(Number.isFinite(r.bestSec))out.push([' · 가장 빠른 '],[formatSec(r.bestSec),true]);
 return out;
}
