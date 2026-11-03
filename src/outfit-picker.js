// 로딩이 끝난 뒤 복장 고르기 카드 4장과 지도(M) 창의 복장 바꾸기. 고르면 바로 출발한다.
// 미리보기는 실제 등산객 모델을 복장별로 바꿔 한 번씩 그린 그림이다(사진 텍스처 없음).
import {Scene,Color,HemisphereLight,DirectionalLight,PerspectiveCamera} from 'three';
import {OUTFITS} from './outfit-config.js';
import './outfit-picker.css';
export function renderOutfitPreviews({renderer,avatar,apply,width=220,height=290,fov=25,eye=[.55,1.05,-4.1],target=[0,.9,0],ids=OUTFITS.map(o=>o.id)}){
 const previews={},scene=new Scene();scene.background=new Color('#dfe8d4');
 scene.add(new HemisphereLight('#ffffff','#6f7f5e',2.1));const sun=new DirectionalLight('#fff3df',2.6);sun.position.set(-2,3.5,-3);scene.add(sun);
 const camera=new PerspectiveCamera(fov,width/height,.1,30);camera.position.set(...eye);camera.lookAt(...target);
 const parent=avatar.parent,saved={position:avatar.position.clone(),rotation:avatar.rotation.y,visible:avatar.visible};
 const canvas=renderer.domElement,dpr=renderer.getPixelRatio(),out=document.createElement('canvas');out.width=width;out.height=height;const ctx=out.getContext('2d');
 try{
  scene.add(avatar);avatar.position.set(0,0,0);avatar.rotation.y=.25;avatar.visible=true;avatar.updateMatrixWorld(true);
  renderer.setRenderTarget(null);renderer.setScissorTest(true);renderer.setViewport(0,0,width,height);renderer.setScissor(0,0,width,height);
  for(const id of ids){const o={id};apply(o.id);renderer.render(scene,camera);ctx.clearRect(0,0,width,height);ctx.drawImage(canvas,0,canvas.height-height*dpr,width*dpr,height*dpr,0,0,width,height);previews[o.id]=out.toDataURL('image/png');}
 }catch(e){console.warn('복장 미리보기 실패',e);}
 finally{renderer.setScissorTest(false);renderer.setViewport(0,0,canvas.clientWidth||innerWidth,canvas.clientHeight||innerHeight);parent?.add(avatar);avatar.position.copy(saved.position);avatar.rotation.y=saved.rotation;avatar.visible=saved.visible;}
 return previews;
}
const card=(o,preview,selected)=>`<button type="button" class="outfit-card${selected?' selected':''}" data-outfit="${o.id}" aria-pressed="${selected}"><span class="outfit-preview">${preview?`<img src="${preview}" alt="${o.name} 미리보기">`:'<i aria-hidden="true">미리보기 없음</i>'}</span><b><kbd>${o.index}</kbd>${o.name}</b><small>${o.summary}</small></button>`;
// 전체 화면 선택 카드. onPick(id)에서 출발한다. 숫자 1~4 키·Enter로도 고른다.
export function mountOutfitPicker({previews={},selected,onPick}){
 const root=document.createElement('section');root.id='outfit-picker';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','outfit-picker-title');
 root.innerHTML=`<div class="outfit-sheet"><h2 id="outfit-picker-title">오늘의 산행 복장</h2><p>고르면 바로 일주문 앞 광장에서 출발합니다. 지도(M) 창에서 언제든 바꿀 수 있어요.</p><div class="outfit-cards">${OUTFITS.map(o=>card(o,previews[o.id],o.id===selected)).join('')}</div><p class="outfit-note">옷·착용품만 사진을 참고해 만들었습니다. 색은 눈대중이에요.</p></div>`;
 document.body.append(root);let done=false;
 const pick=id=>{if(done)return;done=true;root.classList.add('leaving');removeEventListener('keydown',key,true);setTimeout(()=>root.remove(),450);onPick(id);};
 const key=e=>{const n=Number(e.key);if(n>=1&&n<=OUTFITS.length){e.preventDefault();e.stopPropagation();pick(OUTFITS[n-1].id);}else if(e.key==='Enter'&&!e.target.closest?.('button')){e.preventDefault();pick(selected);}};
 addEventListener('keydown',key,true);
 root.querySelectorAll('[data-outfit]').forEach(b=>b.addEventListener('click',()=>pick(b.dataset.outfit)));
 root.querySelector(`[data-outfit="${selected}"]`)?.focus({preventScroll:true});
 return {root,pick};
}
// 지도(M) 창 안의 복장 바꾸기 버튼 묶음.
export function mountOutfitMenu(dialog,{selected,onPick}){
 if(!dialog)return null;const box=document.createElement('div');box.className='outfit-menu';box.setAttribute('role','group');box.setAttribute('aria-label','복장 바꾸기');
 const render=current=>{box.innerHTML=`<p>복장</p>${OUTFITS.map(o=>`<button type="button" data-outfit="${o.id}" aria-pressed="${o.id===current}">${o.index}. ${o.name}</button>`).join('')}`;box.querySelectorAll('[data-outfit]').forEach(b=>b.onclick=()=>{onPick(b.dataset.outfit);render(b.dataset.outfit);b.blur();});};
 render(selected);(dialog.querySelector('.start-choice')??dialog.lastElementChild).before(box);return {update:render};
}
