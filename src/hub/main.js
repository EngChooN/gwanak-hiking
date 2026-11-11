// 허브(/) 진입: 옛 등산 주소면 /hiking/로 넘기고, 아니면 체험 고르기 화면을 그린다(hub.js).
import {legacyHikingTarget} from './legacy-redirect.js';
import {mountHub} from './hub.js';
import './hub.css';
const target=legacyHikingTarget(location.search,location.hash,import.meta.env.BASE_URL);
if(target)location.replace(target);
else{
 mountHub(document,{forced:new URLSearchParams(location.search).get('hubtime')});
 // 체험 카드 링크에 서버 주소를 붙이지 않는다(11-11): 체험 페이지가 공개 파일 multi-server.json에서 지금 주소를 찾는다(server-link.js).
 document.documentElement.classList.add('hub-ready');
}
