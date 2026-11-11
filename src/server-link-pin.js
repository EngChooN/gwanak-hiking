// 체험 페이지 진입점(mountain-pick.js·lounge/main.js)이 맨 먼저 import 한다: 서버 주소를 고른다(server-link.js).
// ?server= → 빌드 변수 → gh-pages의 multi-server.json(매번 새로) → 기억한 값. 서버 주소를 읽는 쪽은 serverReady를 기다린다.
import {chooseServer,fetchServerFile,setChoice,dropStaleServerParam} from './server-link.js';
export const serverReady=chooseServer({search:location.search,envUrl:import.meta.env.VITE_MULTI_SERVER_URL??'',
 fetchFile:()=>fetchServerFile({base:import.meta.env.BASE_URL})})
 .catch(()=>({server:'',source:'none'}))
 .then(c=>{if(c.stale)dropStaleServerParam();return setChoice(c);});
