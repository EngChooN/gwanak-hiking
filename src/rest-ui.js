import './rest-ui.css';
// 명령 이벤트만 사용한다. main의 #sit/#tea 직접 바인딩과 중복하지 않는다.
export function mountRestUI(){
 if(document.getElementById('rest-controls')||document.getElementById('sit'))return;
 const panel=document.createElement('section');panel.id='rest-controls';panel.setAttribute('aria-label','휴식과 스테미너');
 panel.innerHTML='<div class="rest-stamina"><label for="rest-stamina">스테미너 <output id="rest-value">100%</output></label><progress id="rest-stamina" max="100" value="100"></progress></div><div class="rest-buttons"><button data-rest="sit" aria-pressed="false"><span>앉기</span> <kbd>C</kbd></button><button data-rest="tea" disabled><span>차 마시기</span> <kbd>T</kbd></button></div><small id="rest-hint">Shift 달리기 · 앉아서 스테미너 회복</small>';
 document.getElementById('app').append(panel);
 for(const b of panel.querySelectorAll('button'))b.addEventListener('click',()=>{window.dispatchEvent(new CustomEvent('hiking:command',{detail:{id:b.dataset.rest}}));b.blur();});
 window.addEventListener('hiking:state',({detail:s})=>{
  panel.querySelector('progress').value=s.stamina;panel.querySelector('output').textContent=`${Math.round(s.stamina)}%`;
  const sit=panel.querySelector('[data-rest="sit"]'),tea=panel.querySelector('[data-rest="tea"]');
  sit.setAttribute('aria-pressed',String(s.pose!=='stand'));sit.querySelector('span').textContent=s.pose==='stand'?'앉기':'일어나기';
  tea.disabled=!s.teaReady;tea.querySelector('span').textContent=s.pose==='tea'?`차 마시는 중 ${s.teaRemaining.toFixed(1)}초`:'차 마시기';
  panel.querySelector('small').textContent=s.paused?'일시정지 · 계속하기를 누르면 이어집니다':s.pose==='tea'?'3초 후 회복 · 이동하면 취소':s.pose==='sit'?(s.teaReady?'T 차 마시기 · C 또는 이동으로 일어나기':'앉는 중 · 잠시 후 차를 마실 수 있어요'):s.runExhausted?'스테미너 30%에서 달리기 재개':'Shift 달리기 · 앉아서 스테미너 회복';
 });
}
