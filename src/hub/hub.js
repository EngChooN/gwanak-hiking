// 허브(/) 체험 고르기 화면. three.js를 쓰지 않는다(카드 그림은 인라인 SVG, 색은 CSS 변수).
// 시간대 색은 서울 지금 시각의 해 높이로 정한다(수첩 HUD와 같은 기준: -4° 미만 밤, 8° 미만 노을). 시험용 ?hubtime=day|dusk|night.
import {EXPERIENCES,experienceHref} from './experiences.js';
import {sunPosition} from '../daytime.js';
export const hubTime=(elevation)=>!Number.isFinite(elevation)?'day':elevation<-4?'night':elevation<8?'dusk':'day';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// 카드 그림(240×120). fill은 CSS 변수로 시간대에 따라 바뀐다.
export const ART={
 mountain:`<svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="240" height="120" class="sky"/><circle cx="188" cy="30" r="12" class="sun"/><path class="far" d="M0 84 L40 52 L72 74 L118 38 L170 78 L210 56 L240 74 V120 H0Z"/><path class="near" d="M0 104 L52 70 L96 92 L150 58 L204 94 L240 80 V120 H0Z"/><path class="tree" d="M22 112 l7-18 7 18z M38 112 l6-14 6 14z M196 114 l7-17 7 17z"/><circle cx="150" cy="53" r="2.6" class="flag"/></svg>`,
 rooftop:`<svg viewBox="0 0 240 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false"><rect width="240" height="120" class="sky"/><circle cx="52" cy="28" r="11" class="sun"/><g class="far"><rect x="10" y="62" width="30" height="58"/><rect x="46" y="48" width="26" height="72"/><rect x="78" y="68" width="34" height="52"/><rect x="118" y="44" width="28" height="76"/><rect x="152" y="60" width="32" height="60"/><rect x="190" y="52" width="40" height="68"/></g><g class="win"><rect x="52" y="58" width="4" height="5"/><rect x="62" y="70" width="4" height="5"/><rect x="124" y="56" width="4" height="5"/><rect x="134" y="72" width="4" height="5"/><rect x="198" y="64" width="4" height="5"/><rect x="214" y="78" width="4" height="5"/></g><rect class="near" x="0" y="100" width="240" height="20"/><rect class="rail" x="0" y="94" width="240" height="3" rx="1.5"/><path class="smoke" d="M170 90 q-6-10 2-16 q8-6 0-14" fill="none"/></svg>`,
};
export function cardHTML(e,base='/',storage=null){
 let rec=null;try{rec=e.record?e.record(storage):null;}catch{}
 return `<a class="hub-card" id="hub-${esc(e.id)}" href="${esc(experienceHref(e,base))}" data-exp="${esc(e.id)}">
<div class="hub-art">${ART[e.art]??''}${rec?`<span class="hub-stamp">${esc(rec)}</span>`:''}</div>
<div class="hub-body"><span class="hub-place">${esc(e.place)}</span><b class="hub-title">${esc(e.title)}</b><span class="hub-desc">${esc(e.desc)}</span>
<span class="hub-tags">${(e.tags??[]).map(t=>`<i>${esc(t)}</i>`).join('')}</span><span class="hub-go">들어가기 ▶</span></div></a>`;
}
export function mountHub(doc=document,{base=import.meta.env.BASE_URL,storage=globalThis.localStorage,nowMs=Date.now(),forced=null}={}){
 const root=doc.getElementById('hub');if(!root)return null;
 const t=['day','dusk','night'].includes(forced)?forced:hubTime(sunPosition(nowMs).elevation);
 doc.documentElement.dataset.hubTime=t;
 let st=null;try{st=storage;}catch{}
 root.innerHTML=`<header class="hub-head"><h1>온라인 메타버스</h1><p>들어갈 곳을 고르세요</p></header><nav class="hub-grid" aria-label="체험 고르기">${EXPERIENCES.map(e=>cardHTML(e,base,st)).join('')}</nav><footer class="hub-foot">동동이와 함께하는 온라인 체험</footer>`;
 return t;
}
