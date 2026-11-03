// 광장 안내: hiking:state의 zone이 'plaza'인 동안만 '출발 전 · 광장' 안내를 보인다. 일주문(화면 중앙 위쪽)을 가리지 않도록 아래쪽 가운데에 둔다.
export const plazaBannerVisible=detail=>detail?.zone==='plaza'&&detail?.started!==false;
if(typeof window!=='undefined'){
 const el=()=>document.getElementById('plaza-banner');
 window.addEventListener('hiking:state',e=>{const b=el();if(b){const on=plazaBannerVisible(e.detail);b.hidden=!on;document.body.classList.toggle('in-plaza',on);}});
}
