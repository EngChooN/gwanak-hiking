// 계절(봄 벚꽃·여름·가을 단풍·겨울 눈): 서울 날짜로 정하고, 외부에서 바꿀 수 있다. three를 쓰지 않는다(node --test로 검사).
// 경계 날짜: docs/관악산-계절-자료.md §5 (봄 3/25~4/30, 여름 5/1~10/14, 가을 10/15~11/30, 겨울 12/1~3/24, Asia/Seoul).
// 바꾸는 길: URL ?season=spring|summer|autumn|winter(auto = 날짜), window.hiking.setSeason(이름|null), 'hiking:free-settings' 이벤트의 season.
// 화면 쪽(셰이더 값·꽃잎 입자)은 src/toon/season.js가 이 값을 받아 부드럽게 바꾼다. 다시 로딩하지 않는다.
import {seoulClock} from './daytime.js';
export const SEASONS=['spring','summer','autumn','winter'];
export const SEASON_LABEL={spring:'봄',summer:'여름',autumn:'가을',winter:'겨울'};
export const SEASON_ICON={spring:'🌸',summer:'🌿',autumn:'🍁',winter:'⛄'};
// [시작 월일(월*100+일), 계절]. 해가 바뀌어도 월일 비교만으로 된다.
export const SEASON_BOUNDS=[[325,'spring'],[501,'summer'],[1015,'autumn'],[1201,'winter']];
export function seasonForMonthDay(month,day){
 const md=month*100+day;let season='winter';
 for(const [from,name] of SEASON_BOUNDS)if(md>=from)season=name;
 return season;
}
export function seasonForDate(utcMs=Date.now()){const c=seoulClock(utcMs);return seasonForMonthDay(c.month,c.day);}
const ALIASES={spring:'spring',봄:'spring',cherry:'spring',summer:'summer',여름:'summer',autumn:'autumn',fall:'autumn',가을:'autumn',winter:'winter',겨울:'winter',snow:'winter'};
// 이름 → 계절. auto·now·null·빈 값은 null(날짜를 따른다). 모르는 값은 undefined.
export function normalizeSeason(value){
 if(value===null||value===undefined)return null;
 const v=String(value).trim().toLowerCase();if(!v||v==='auto'||v==='now'||v==='현재')return null;
 return ALIASES[v];
}
// 계절 보관소. state.season = 지금 보이는 계절, state.manual = 직접 고른 값(null이면 날짜를 따름).
export function createSeasonController({search=globalThis.location?.search??'',nowMs=Date.now,onChange=()=>{}}={}){
 const fromUrl=normalizeSeason(new URLSearchParams(search).get('season'));
 const state={manual:fromUrl??null,auto:seasonForDate(nowMs()),season:null,source:'date'};
 const resolve=()=>{state.auto=seasonForDate(nowMs());state.season=state.manual??state.auto;state.source=state.manual?'manual':'date';return state.season;};
 resolve();
 function set(value){
  const s=normalizeSeason(value);if(s===undefined)return false;
  state.manual=s;resolve();onChange({...state});return true;
 }
 // 자정을 넘겨 계절 경계가 바뀌면 따라간다(날짜를 따를 때만). 바뀌었으면 true.
 function tick(){const before=state.season;resolve();if(before!==state.season){onChange({...state});return true;}return false;}
 return {state,set,tick,get season(){return state.season;}};
}
