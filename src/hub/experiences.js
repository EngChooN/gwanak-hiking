// 허브 체험 목록. 체험이 늘면 배열에 한 줄만 더한다(art는 hub.js의 ART 키). path는 BASE_PATH 기준 상대 경로.
// record는 카드에 작게 보일 기존 기록을 읽는 선택 함수(localStorage 사용, 없으면 null).
import {loadSummits,summitOf} from '../summit-records.js';
export const EXPERIENCES=[
 {id:'hiking',path:'hiking/',title:'온라인 등산',place:'관악산',desc:'등산복 입은 동동이와 연주대까지 걸어 올라요',tags:['혼자·함께','낮·노을·밤'],art:'mountain',
  record:storage=>{const r=summitOf(loadSummits(storage),'gwanak');return r?`완등 ${r.count}회`:null;}},
 {id:'smoking',path:'smoking/',title:'온라인 흡연장',place:'서울 옥상',desc:'회사원 옷 입은 동동이와 옥상에서 수다 한 대',tags:['수다','옥상 야경'],art:'rooftop',record:null},
];
/** 카드 링크 주소: base(import.meta.env.BASE_URL)에 상대 경로를 붙인다. */
export const experienceHref=(e,base='/')=>`${base.endsWith('/')?base:base+'/'}${e.path}`;
