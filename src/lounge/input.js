// 입력: PC는 WASD·방향키(Shift 뛰기)·마우스 드래그(시점)·휠(거리), 휴대폰은 떠다니는 조이스틱(왼쪽 절반, 손가락 댄 자리에 생김)·오른쪽 드래그(시점)·핀치.
// 조이스틱 방향 계산은 온라인 등산 src/joystick.js(8방향·데드존·기준점 따라오기)를 그대로 쓴다.
import {stickDirection,stickFollow,clampStickBase,STICK} from '../joystick.js';
import {feedbackOpen} from '../feedback.js';

// 담배 키(PC): Space·F 꾹 = 들이마시기(누르는 동안), R 링·N 코로·T 프렌치, 1~4 담배 고르기(꺼낼 때),
// B 불 빌리기, G 한 대 권하기·받기. onAction(f(name,down))로 받는다.
export const SMOKE_KEYS=Object.freeze({Space:'draw',KeyF:'draw',KeyR:'ring',KeyN:'nose',KeyT:'french',Digit1:'kind1',Digit2:'kind2',Digit3:'kind3',Digit4:'kind4',KeyB:'borrow',KeyG:'give'});

export function createInput({canvas,mobile}){
 const keys=new Set(),lookCbs=[],zoomCbs=[],actionCbs=[];let looking=false,stick=null,runToggle=false;
 const typing=()=>{const a=document.activeElement;return a&&(a.tagName==='INPUT'||a.tagName==='TEXTAREA'||a.isContentEditable);};
 addEventListener('keydown',e=>{if(typing())return;const act=SMOKE_KEYS[e.code];
  if(act){e.preventDefault();if(!e.repeat)actionCbs.forEach(f=>f(act,true));}
  keys.add(e.code);});
 addEventListener('keyup',e=>{const act=SMOKE_KEYS[e.code];if(act&&keys.has(e.code))actionCbs.forEach(f=>f(act,false));keys.delete(e.code);});
 addEventListener('blur',()=>{for(const c of keys)if(SMOKE_KEYS[c])actionCbs.forEach(f=>f(SMOKE_KEYS[c],false));keys.clear();});
 // 조이스틱 그림(손가락 댄 자리)
 const base=document.createElement('div');base.className='joy';base.hidden=true;const knob=document.createElement('div');knob.className='joy-knob';base.appendChild(knob);document.body.appendChild(base);
 const pointers=new Map();let pinch=null;
 canvas.addEventListener('pointerdown',e=>{
  canvas.setPointerCapture?.(e.pointerId);
  const left=e.clientX<innerWidth*.5;
  if(e.pointerType==='touch'&&left&&!stick){const b=clampStickBase(e.clientX,e.clientY,innerWidth,innerHeight);stick={id:e.pointerId,cx:b.x,cy:b.y,dx:0,dy:0,dir:null};base.hidden=false;base.style.left=b.x+'px';base.style.top=b.y+'px';knob.style.transform='translate(-50%,-50%)';return;}
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});looking=true;
  if(pointers.size===2){const [a,b]=[...pointers.values()];pinch=Math.hypot(a.x-b.x,a.y-b.y);}
 });
 canvas.addEventListener('pointermove',e=>{
  if(stick&&e.pointerId===stick.id){const f=stickFollow(stick.cx,stick.cy,e.clientX,e.clientY,STICK.radius);Object.assign(stick,f);stick.dir=stickDirection(f.dx,f.dy,stick.dir?.key);base.style.left=f.cx+'px';base.style.top=f.cy+'px';knob.style.transform=`translate(calc(-50% + ${f.dx}px),calc(-50% + ${f.dy}px))`;return;}
  const p=pointers.get(e.pointerId);if(!p)return;
  if(pointers.size===2&&pinch){p.x=e.clientX;p.y=e.clientY;const [a,b]=[...pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);if(d>0){zoomCbs.forEach(f=>f(pinch/d));pinch=d;}return;}
  const dx=e.clientX-p.x,dy=e.clientY-p.y;p.x=e.clientX;p.y=e.clientY;lookCbs.forEach(f=>f(dx,dy));
 });
 const end=e=>{if(stick&&e.pointerId===stick.id){stick=null;base.hidden=true;return;}pointers.delete(e.pointerId);if(pointers.size<2)pinch=null;if(!pointers.size)looking=false;};
 canvas.addEventListener('pointerup',end);canvas.addEventListener('pointercancel',end);
 canvas.addEventListener('wheel',e=>{e.preventDefault();zoomCbs.forEach(f=>f(Math.exp(e.deltaY*.0012)));},{passive:false});
 canvas.addEventListener('contextmenu',e=>e.preventDefault());
 return {
  move(){
   if(feedbackOpen())return {forward:0,side:0,run:false}; // 의견 보내기 카드가 열린 동안은 걷지 않는다(공용 src/feedback.js)
   if(stick?.dir)return {forward:stick.dir.forward,side:stick.dir.side,run:runToggle||Math.hypot(stick.dx,stick.dy)>STICK.radius*.98&&false};
   const k=c=>keys.has(c);
   const forward=(k('KeyW')||k('ArrowUp')?1:0)-(k('KeyS')||k('ArrowDown')?1:0),side=(k('KeyD')||k('ArrowRight')?1:0)-(k('KeyA')||k('ArrowLeft')?1:0);
   return {forward,side,run:k('ShiftLeft')||k('ShiftRight')||runToggle};
  },
  setRun(on){runToggle=!!on;},get run(){return runToggle;},
  onLook(f){lookCbs.push(f);},onZoom(f){zoomCbs.push(f);},onAction(f){actionCbs.push(f);},
  looking:()=>looking,
  key:c=>keys.has(c),
 };
}
