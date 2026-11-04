// 개발용 구간 이동: 화면 구석 버튼 → 목록에서 고르면 그 지점으로 순간 이동한다. 끄려면 아래 설정값 하나만 false로 바꾼다.
// 주소에 ?jump=off 를 붙이면 그 접속에서만 숨긴다(캡처·점검용).
import {checkpoints} from './route.js';
import {PLAZA_START,GATE_S} from './plaza.js';
export const SECTION_JUMP_ENABLED=true;
export const sectionJumpEnabled=(search='')=>SECTION_JUMP_ENABLED&&new URLSearchParams(search).get('jump')!=='off';
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
// 정상 구역 목적지: 정상석 3.5m 앞(길 끝 쪽)에서 정상석을 바라본다. 정상석 위치를 모르면 null(목록에서 뺀다).
export function summitSpot(sites,end,gap=3.5){
 const m=sites?.find(s=>s.id==='marker');if(!m||!end)return null;
 const dx=end.x-m.x,dz=end.z-m.z,len=Math.hypot(dx,dz)||1,x=m.x+dx/len*gap,z=m.z+dz/len*gap;
 return {zone:'summit',x,z,heading:wrap(Math.atan2(-(m.x-x),-(m.z-z)))};
}
// 목적지 목록. pos는 movement.setPlayerPosition에 그대로 넘기는 값이다.
export function jumpTargets({summit=null}={}){
 const list=[
  {id:'plaza',label:'입구 광장',pos:{zone:'plaza',x:PLAZA_START.x,z:PLAZA_START.z,heading:PLAZA_START.heading}},
  {id:'gate',label:'일주문',pos:{zone:'route',s:GATE_S+1e-6,lateral:0}},
  ...checkpoints.map(c=>({id:c.id,label:c.name,pos:{zone:'route',s:c.s,lateral:0},checkpoint:c.id}))
 ];
 if(summit)list.push({id:'summit',label:'정상 구역',pos:summit,summit:true});
 return list;
}
export function mountSectionJump({targets,onJump,root=document.body}){
 const box=document.createElement('div');box.id='section-jump';box.hidden=true;
 box.innerHTML='<button type="button" class="sj-toggle" aria-expanded="false" aria-controls="sj-list">구간 이동</button><ul id="sj-list" class="sj-list" hidden></ul>';
 const toggle=box.querySelector('.sj-toggle'),list=box.querySelector('.sj-list');
 const open=v=>{list.hidden=!v;toggle.setAttribute('aria-expanded',String(v));};
 for(const t of targets){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.textContent=t.label;b.dataset.jump=t.id;b.addEventListener('click',()=>{if(onJump(t)!==false)open(false);});li.append(b);list.append(li);}
 toggle.addEventListener('click',()=>open(list.hidden));
 // 조이스틱·시점 영역으로 들어간 터치가 걷기·시점 입력으로 새지 않게 막고, 바깥을 누르면 접는다.
 box.addEventListener('pointerdown',e=>e.stopPropagation());
 document.addEventListener('pointerdown',e=>{if(!list.hidden&&!box.contains(e.target))open(false);});
 root.append(box);
 return {show:()=>{box.hidden=false;},hide:()=>{box.hidden=true;open(false);},element:box};
}
