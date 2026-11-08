// 등산 서버 고르기 창 하나(산 고르기 다음 첫 창 + HUD 👋 함께 걷기 단추가 같이 씀). 창 자체는 공용 server-pick.js.
// 고르면 'hiking:multi-join' {room,name,server}, 나가면 'hiking:multi-leave'. main.js가 아직 듣기 전일 수 있어
// 참가 요청은 window.__hikingMultiJoin에도 남긴다(main.js가 수신기를 단 뒤 남은 요청을 처리하고 지운다).
// 아직 출발 전이면(첫 창) 고르는 순간 출발 신호(START_EVENT)도 보낸다.
import './server-pick.css';
import {createServerPick,serverPickMode} from './server-pick.js';
import {multiServerUrl} from './multi-transport.js';
import {START_EVENT} from './loading.js';

let pick=null;
const startHike=()=>{if(window.__hikingStartRequested)return;window.__hikingStartRequested=true;window.dispatchEvent(new CustomEvent(START_EVENT));};
export const hikingServerUrl=()=>multiServerUrl(location.search,import.meta.env.VITE_MULTI_SERVER_URL??'');
export const hikingPickMode=()=>serverPickMode(location.search,!!navigator.webdriver);
export function hikingServerPick(){
 if(pick)return pick;
 pick=createServerPick({experience:'hiking',serverUrl:hikingServerUrl(),
  onJoin(d){const detail={room:d.room,name:d.name,server:d.server};window.__hikingMultiJoin=detail;window.dispatchEvent(new CustomEvent('hiking:multi-join',{detail}));startHike();},
  onSolo({left}){if(left)window.dispatchEvent(new CustomEvent('hiking:multi-leave'));startHike();}});
 return pick;
}
