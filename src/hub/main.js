// 허브(/) 진입: 옛 등산 주소면 /hiking/로 넘기고, 아니면 체험 고르기 화면을 그린다(hub.js).
import {legacyHikingTarget} from './legacy-redirect.js';
import {mountHub} from './hub.js';
import './hub.css';
const target=legacyHikingTarget(location.search,location.hash,import.meta.env.BASE_URL);
if(target)location.replace(target);
else{
 mountHub(document,{forced:new URLSearchParams(location.search).get('hubtime')});
 document.documentElement.classList.add('hub-ready');
}
