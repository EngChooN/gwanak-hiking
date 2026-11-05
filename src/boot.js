// 진입점(기획서 §2.2). three를 불러오지 않는다: 모드를 정한 뒤에야 main.js(와 그 모드의 코드·에셋)를 받는다.
import {resolveStyle,saveStyle,clearStyle} from './graphics-style.js';

const storage=(()=>{try{return localStorage;}catch{return null;}})();

// #style-chooser를 보여 주고 카드 클릭을 기다린다. #style-remember가 체크돼 있으면 저장한다.
function chooseStyle(){
 const chooser=document.getElementById('style-chooser');
 if(!chooser)return Promise.resolve('realistic');
 chooser.hidden=false;
 return new Promise(resolve=>{
  const pick=e=>{
   const card=e.target.closest?.('[data-style]');if(!card||!chooser.contains(card))return;
   const style=card.dataset.style;if(style!=='realistic'&&style!=='toon')return;
   chooser.removeEventListener('click',pick);
   if(document.getElementById('style-remember')?.checked)saveStyle(storage,style);
   chooser.hidden=true;resolve(style);
  };
  chooser.addEventListener('click',pick);
  chooser.querySelector('[data-style]')?.focus({preventScroll:true});
 });
}

// 지도(M) 대화상자의 "그래픽 모드 바꾸기": 저장을 지우고 ?style 없이 새로고침해 선택 화면을 다시 띄운다.
document.getElementById('style-switch')?.addEventListener('click',()=>{
 clearStyle(storage);
 const url=new URL(location.href);url.searchParams.delete('style');
 location.replace(url.pathname+url.search+url.hash);
});

const style=resolveStyle({search:location.search,storage,webdriver:navigator.webdriver===true})??await chooseStyle();
document.documentElement.dataset.style=style;
await import('./main.js');
