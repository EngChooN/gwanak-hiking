// 체험 페이지 진입점(mountain-pick.js·lounge/main.js)이 맨 먼저 import 한다: 서버 주소를 주소창에 붙여 둔다(server-link.js).
import {pinServerParam} from './server-link.js';
pinServerParam({envUrl:import.meta.env.VITE_MULTI_SERVER_URL??''});
