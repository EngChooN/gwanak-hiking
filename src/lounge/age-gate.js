// 입장 안내(처음 한 번, 11-13): 이름 정하기(서버 카드·로비)보다 먼저 뜨는 한 장짜리 안내 + 태어난 해 확인.
// 문구·모양은 연디자인 docs/흡연장/입장안내-2026-11-13.md 그대로(수첩 종이 톤, hud.css .lg-age*). 법률 검토가 아니라 일반적인 성인 확인 안내 수준이다.
// 저장은 profile.js(localStorage 'lounge.age')에만 하고 서버로 보내지 않는다. 연 나이 19 미만은 막고 저장하지 않는다(다시 열면 또 묻는다).
// 모드: ask(처음 입장) · block(미성년 막힘) · read(설정 「입장 안내 다시 보기」, 입력 없이 닫기만).
// 자동 점검 브라우저(navigator.webdriver)에서는 건너뛴다. ?age=on 이면 점검 브라우저에서도 띄운다.
import {parseBirthYear,isAdultYear,agePassed,saveAgeCheck} from './profile.js';

export const AGE_TEXT=Object.freeze({
 seal:'19+',title:'들어가기 전에',sub:'온라인 흡연장은 잠깐 보고 가는 가상 체험이에요.',
 notices:['이곳은 흡연을 권하지 않는 가상 체험이에요. 실제 담배나 제품 광고가 아니에요.','만 19세 미만은 이용할 수 없어요.','흡연은 건강에 해로워요. 금연 상담: <a href="tel:1544-9030">1544-9030</a>'],
 label:'태어난 해',placeholder:'예: 1995',help:'숫자 4자리. 이 기기에만 저장되고 서버로 보내지 않아요.',check:'위 내용을 확인했어요',enter:'들어가기',
 error:'태어난 해를 숫자 4자리로 적어 주세요.',
 blockTitle:'아직 들어갈 수 없어요',blockBody:'온라인 흡연장은 만 19세 이상만 이용할 수 있어요.',blockHelp:'흡연이나 금연이 고민되면 금연 상담 1544-9030에 전화해 보세요.',back:'처음으로',close:'닫기',
});

// 카드 안쪽 HTML(mode: ask|block|read). read는 설정 창(.lg-modal) 안에도 그대로 넣는다.
export function ageCardHtml(mode='ask',{year='',checked=false}={}){
 const T=AGE_TEXT;
 if(mode==='block')return `<div class="lg-age-card lg-age-block" role="dialog" aria-modal="true" aria-labelledby="lg-age-h">
  <span class="lg-age-seal" aria-hidden="true">${T.seal}</span><h1 id="lg-age-h">${T.blockTitle}</h1>
  <p class="sub">${T.blockBody}</p><p class="sub">${T.blockHelp.replace('1544-9030','<a href="tel:1544-9030">1544-9030</a>')}</p>
  <button class="lg-btn primary" type="button" data-age="back">${T.back}</button></div>`;
 const list=`<ol class="lg-age-list">${T.notices.map((t,i)=>`<li><b aria-hidden="true">${i+1}</b><span>${t}</span></li>`).join('')}</ol>`;
 const head=`<span class="lg-age-seal" aria-hidden="true">${T.seal}</span><h1 id="lg-age-h">${T.title}</h1><p class="sub">${T.sub}</p>`;
 if(mode==='read')return `<div class="lg-age-card" role="dialog" aria-modal="true" aria-labelledby="lg-age-h">${head}${list}
  <div class="lg-age-form"><button class="lg-btn primary" type="button" data-age="close" data-a="close">${T.close}</button></div></div>`;
 return `<form class="lg-age-card" role="dialog" aria-modal="true" aria-labelledby="lg-age-h" novalidate>${head}${list}
  <div class="lg-age-form">
   <label class="lg-age-field">${T.label}<input id="lg-age-y" name="y" type="text" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="bday-year" placeholder="${T.placeholder}" value="${year}"><small>${T.help}</small></label>
   <p class="lg-age-err" role="alert"></p>
   <label class="lg-age-check"><input id="lg-age-ok" type="checkbox"${checked?' checked':''}>${T.check}</label>
   <button class="lg-btn primary" type="submit" data-age="enter" disabled>${T.enter}</button>
  </div></form>`;
}

// 처음 입장: 확인이 필요하면 화면을 띄우고, 성인 확인이 끝나면 풀리는 Promise. 이미 확인했거나 점검 브라우저면 바로 풀린다.
export function ageGate({query=new URLSearchParams(globalThis.location?.search??''),webdriver=!!globalThis.navigator?.webdriver,store=globalThis.localStorage,host=globalThis.document?.body}={}){
 const force=query.get('age')==='on';
 if((webdriver&&!force)||agePassed(store)||!host)return Promise.resolve({shown:false});
 return new Promise(resolve=>{
  const wrap=document.createElement('div');wrap.className='lg-age';host.appendChild(wrap);
  wrap.addEventListener('keydown',e=>e.stopPropagation()); // 안내 화면에서 친 글자가 게임 단축키(E·C·Space·Enter 채팅)로 새지 않게
  let year='',checked=false;
  const draw=mode=>{wrap.innerHTML=ageCardHtml(mode,{year,checked});wrap.dataset.mode=mode;bind(mode);};
  function bind(mode){
   if(mode==='block'){wrap.querySelector('[data-age=back]').onclick=()=>{year='';checked=false;draw('ask');wrap.querySelector('#lg-age-y')?.focus();};return;}
   const form=wrap.querySelector('form'),inp=form.querySelector('#lg-age-y'),ok=form.querySelector('#lg-age-ok'),btn=form.querySelector('[data-age=enter]'),err=form.querySelector('.lg-age-err');
   const sync=(showErr=false)=>{year=inp.value.replace(/\D/g,'').slice(0,4);if(inp.value!==year)inp.value=year;checked=ok.checked;
    const y=parseBirthYear(year),bad=year.length===4&&y===null;
    inp.setAttribute('aria-invalid',bad||(showErr&&y===null)?'true':'false');err.textContent=bad||(showErr&&y===null)?AGE_TEXT.error:'';
    btn.disabled=!(y!==null&&checked);return y;};
   inp.addEventListener('input',()=>sync());ok.addEventListener('change',()=>sync());
   form.addEventListener('submit',e=>{e.preventDefault();const y=sync(true);if(y===null||!checked)return;
    if(!isAdultYear(y)){draw('block');return;} // 미성년: 저장하지 않는다
    saveAgeCheck(y,store);wrap.remove();resolve({shown:true,year:y});});
   sync();
  }
  draw('ask');
 });
}
