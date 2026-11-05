// 그래픽 모드(실사·카툰) 결정. three를 쓰지 않는다(boot.js가 첫 화면 전에 읽는다). 기획서 §2.1.
export const GRAPHICS_STYLE_KEY='gwanak-graphics-style';
export const GRAPHICS_STYLES=['realistic','toon'];
const valid=v=>GRAPHICS_STYLES.includes(v)?v:null;

// 우선순위: ?style= → localStorage → null(선택 화면). 자동화 브라우저는 ?style이 없으면 저장값과 상관없이 실사(기존 캡처·검증 스크립트 유지).
export function resolveStyle({search='',storage=null,webdriver=false}={}){
 const query=new URLSearchParams(search).get('style');
 if(query!==null)return valid(query)??(webdriver?'realistic':readStored(storage));
 if(webdriver)return 'realistic';
 return readStored(storage);
}
function readStored(storage){try{return valid(storage?.getItem(GRAPHICS_STYLE_KEY));}catch{return null;}}
export function saveStyle(storage,style){if(!valid(style))return false;try{storage.setItem(GRAPHICS_STYLE_KEY,style);return true;}catch{return false;}}
export function clearStyle(storage){try{storage.removeItem(GRAPHICS_STYLE_KEY);return true;}catch{return false;}}
