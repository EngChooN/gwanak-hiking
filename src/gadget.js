// 쌍안경·휴대폰 카메라 공통 뼈대. 상태는 state.gadget('none'|'binoculars'|'phone')·state.phone{zoom,selfie}·state.binoculars{zoom}에 두고
// 'hiking:state' 이벤트로 산풍경(손동작·소품)과 산디자인(테두리·버튼)에 넘긴다. 저장(이어하기)에는 남기지 않는다.
export const GADGETS=Object.freeze(['none','binoculars','phone']);
export const BINOCULAR_ZOOM=Object.freeze({min:4,max:10,initial:8});
export const PHONE_ZOOM=Object.freeze({min:.5,max:5,stops:[.5,1,2,5]});
// 셀카: 머리 앞쪽으로 팔을 뻗은 거리(m)와 오른손 쪽 옆 거리, 눈보다 조금 위.
export const SELFIE=Object.freeze({reach:.6,side:.12,up:.06});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// 셀카는 가장 넓은 광각(0.5x)에 고정한다. 후면으로 돌아오면 셀카 전 배율(phone.restoreZoom)을 되돌린다.
export const SELFIE_ZOOM=PHONE_ZOOM.min;
export function gadgetDefaults(){return {gadget:'none',phone:{zoom:1,selfie:false},binoculars:{zoom:BINOCULAR_ZOOM.initial}};}
export function ensureGadget(state){const d=gadgetDefaults();if(!GADGETS.includes(state.gadget))state.gadget=d.gadget;state.phone={...d.phone,...(state.phone||{})};state.binoculars={...d.binoculars,...(state.binoculars||{})};return state;}
// 셀카 켜고 끄기 한 곳에서 처리: 켜면 배율을 저장하고 광각 고정, 끄면 복원.
function setSelfie(state,on){
 const p=state.phone;if(on===!!p.selfie)return;
 if(on){p.restoreZoom=p.zoom;p.zoom=SELFIE_ZOOM;}else{p.zoom=p.restoreZoom??p.zoom;delete p.restoreZoom;}
 p.selfie=on;
}
// 기구를 켜면 3인칭이어도 1인칭으로 강제하고 원래 시점(state.gadgetPrevView)을 기억했다가 모두 끄면 되돌린다.
export const viewLocked=state=>(state.gadget??'none')!=='none';
function enterGadgetView(state){if(state.gadgetPrevView==null)state.gadgetPrevView=state.view;state.view='first';}
function leaveGadgetView(state){if(state.gadgetPrevView!=null){state.view=state.gadgetPrevView;delete state.gadgetPrevView;}}
// 켜면 걷기·자동 걷기·달리기를 멈춘다(기구로 둘러보는 중에는 시간이 흐른다). 같은 기구를 다시 누르면 끈다.
export function setGadget(state,kind){
 ensureGadget(state);if(!GADGETS.includes(kind))return false;
 const next=state.gadget===kind?'none':kind;state.gadget=next;
 if(next!=='none'){state.auto=false;state.running=false;if(state.pose&&state.pose!=='stand'){state.pose='stand';state.teaRemaining=0;}}
 if(next!=='phone')setSelfie(state,false);
 if(next!=='none')enterGadgetView(state);else leaveGadgetView(state);
 return true;
}
export const closeGadget=state=>{ensureGadget(state);if(state.gadget==='none')return false;state.gadget='none';setSelfie(state,false);leaveGadgetView(state);return true;};
// 기구를 든 동안에는 걷기 입력을 받지 않는다(제자리에서 조준).
export const walkInput=(state,cmd)=>state.gadget&&state.gadget!=='none'?{...cmd,forward:0,side:0,run:false}:cmd;
const selfieLocked=state=>state.gadget==='phone'&&!!state.phone?.selfie;
// 휠·손가락 모으기: dz>0이면 축소. 배율은 곱셈으로 바꿔 넓은 범위에서 같은 손맛을 낸다.
export function zoomBy(state,dz){
 ensureGadget(state);if(selfieLocked(state))return false;
 if(state.gadget==='binoculars'){state.binoculars.zoom=clamp(state.binoculars.zoom*Math.exp(-dz*.4),BINOCULAR_ZOOM.min,BINOCULAR_ZOOM.max);return true;}
 if(state.gadget==='phone'){state.phone.zoom=clamp(state.phone.zoom*Math.exp(-dz*.5),PHONE_ZOOM.min,PHONE_ZOOM.max);return true;}
 return false;
}
// +/− 키: 휴대폰은 0.5·1·2·5배 단계, 쌍안경은 1배씩.
export function zoomStep(state,direction){
 ensureGadget(state);if(selfieLocked(state))return false;
 if(state.gadget==='binoculars'){state.binoculars.zoom=clamp(Math.round(state.binoculars.zoom)+Math.sign(direction),BINOCULAR_ZOOM.min,BINOCULAR_ZOOM.max);return true;}
 if(state.gadget!=='phone')return false;
 const z=state.phone.zoom,stops=PHONE_ZOOM.stops;
 state.phone.zoom=direction>0?(stops.find(s=>s>z*1.001)??PHONE_ZOOM.max):([...stops].reverse().find(s=>s<z/1.001)??PHONE_ZOOM.min);return true;
}
export function setPhoneZoom(state,zoom){ensureGadget(state);if(selfieLocked(state)||!Number.isFinite(zoom))return false;state.phone.zoom=clamp(zoom,PHONE_ZOOM.min,PHONE_ZOOM.max);return true;}
export function toggleSelfie(state){ensureGadget(state);if(state.gadget!=='phone')return false;setSelfie(state,!state.phone.selfie);return true;}
// 화면 배율. 3인칭은 자세만 보이고 시점은 그대로(1배)다.
export function viewZoom(state){
 if(state.view!=='first')return 1;
 if(state.gadget==='binoculars')return state.binoculars.zoom;
 if(state.gadget==='phone')return state.phone.zoom;
 return 1;
}
export const selfieActive=state=>state.view==='first'&&state.gadget==='phone'&&!!state.phone?.selfie;
// 마우스 감도는 배율에 반비례(1배 미만은 그대로).
export const lookScale=state=>1/Math.max(1,viewZoom(state));
// 쌍안경으로 볼 때 연무 광학 깊이를 줄이는 비율. 실제 대기는 그대로지만 확대 화면의 원경이 뭉개지지 않게 √배율만큼 덜어 낸다.
export const hazeScale=zoom=>1/Math.sqrt(Math.max(1,zoom));
// 장면 LOD·거리 판정에 쓰는 배율. THREE.LOD는 camera.zoom을 이미 나눈다.
export const lodZoom=camera=>Math.max(1,camera?.zoom||1);
export function photoFilename(date=new Date()){const p=n=>String(n).padStart(2,'0');return `관악산-${date.getFullYear()}${p(date.getMonth()+1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.png`;}
// 셀카 카메라 위치: 머리(eye) 앞쪽(heading 기준) 팔 길이, 오른쪽 약간, pitch만큼 위아래로 돈다. 반환값은 [x,y,z].
export function selfiePosition(eye,heading,pitch=0){
 const fx=-Math.sin(heading),fz=-Math.cos(heading),rx=Math.cos(heading),rz=-Math.sin(heading),c=Math.cos(pitch),s=Math.sin(pitch);
 return [eye[0]+fx*SELFIE.reach*c+rx*SELFIE.side,eye[1]+SELFIE.up-SELFIE.reach*s,eye[2]+fz*SELFIE.reach*c+rz*SELFIE.side];
}
