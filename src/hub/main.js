// 허브(/) 진입: 옛 등산 주소면 /hiking/로 넘기고, 아니면 체험 고르기 화면을 그린다(hub.js).
import {legacyHikingTarget} from './legacy-redirect.js';
import {mountHub} from './hub.js';
import {resolveServerParam,withServer} from '../server-link.js';
import './hub.css';
const target=legacyHikingTarget(location.search,location.hash,import.meta.env.BASE_URL);
if(target)location.replace(target);
else{
 mountHub(document,{forced:new URLSearchParams(location.search).get('hubtime')});
 // 체험 카드 링크에 서버 주소를 붙인다(허브 주소에는 붙이지 않음: 옛 주소 규칙으로 /hiking/에 넘어가므로)
 const {server}=resolveServerParam('',{envUrl:import.meta.env.VITE_MULTI_SERVER_URL??''});
 if(server)for(const a of document.querySelectorAll('a.hub-card'))a.setAttribute('href',withServer(a.getAttribute('href'),server));
 document.documentElement.classList.add('hub-ready');
}
