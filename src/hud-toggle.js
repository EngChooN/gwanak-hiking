// HUD 가리기. H 키는 input.js→main.js가 'hiking:hud-toggle' 이벤트로만 보내므로 여기서는 키를 따로 받지 않는다.
export const HUD_SAVE_KEY='gwanak-hud-hidden';
export const HINT_MS=2000;
export function installHudToggle(doc=document,win=window){
 const app=doc.getElementById('app');if(!app)return;
 let hidden=false;try{hidden=localStorage.getItem(HUD_SAVE_KEY)==='true';}catch{}
 const hint=doc.createElement('div');hint.className='hud-hint';hint.setAttribute('aria-live','polite');hint.innerHTML='<kbd>H</kbd> 다시 보기';
 const restore=doc.createElement('button');restore.type='button';restore.className='hud-restore';restore.innerHTML='👁 화면 보이기 <kbd>H</kbd>';restore.setAttribute('aria-label','화면 다시 보이기 (H)');
 doc.body.append(hint,restore);
 const hideButton=doc.getElementById('hud-hide');let timer=0;
 function apply(showHint){
  app.classList.toggle('hud-hidden',hidden);restore.dataset.on=String(hidden);hideButton?.setAttribute('aria-pressed',String(hidden));
  clearTimeout(timer);
  if(hidden&&showHint){hint.dataset.show='true';timer=setTimeout(()=>{hint.dataset.show='false';},HINT_MS);}else hint.dataset.show='false';
 }
 function toggle(){hidden=!hidden;try{localStorage.setItem(HUD_SAVE_KEY,String(hidden));}catch{}apply(true);}
 win.addEventListener('hiking:hud-toggle',toggle);
 hideButton?.addEventListener('click',()=>win.dispatchEvent(new CustomEvent('hiking:hud-toggle')));
 restore.addEventListener('click',()=>win.dispatchEvent(new CustomEvent('hiking:hud-toggle')));
 apply(hidden);
 return {toggle,isHidden:()=>hidden};
}
