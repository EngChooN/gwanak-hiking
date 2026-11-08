// 산 고르기 닉네임 칸 점검·캡처(2026-11-08). 세로 390×844·가로 844×390·PC 1920×1080 + 키보드 흉내(세로 390×430, 가로 844×200).
// 흐름: 산 고르기에 이름 → 단축키(R·C·F·W·Space)가 걷기로 안 새는지 → ▶ 오르기 → 서버 고르기 칸에 미리 채움 → 거기서 고치면 저장값 반영
//       → '혼자 걷기'도 이름 저장 → 새로 들어오면 마지막 이름이 채워짐.
//   node scripts/capture-mountain-nick.mjs → artifacts/server-pick/mountain-nick-*.png · mountain-nick-report.json. 실패가 있으면 종료 코드 1.
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
const dir='artifacts/server-pick';mkdirSync(dir,{recursive:true});
const {createServer}=await import('vite');const vp=Number(process.env.PORT??5210);
const vite=await createServer({server:{port:vp,host:'127.0.0.1',strictPort:true},logLevel:'warn'});await vite.listen();
const url=`http://127.0.0.1:${vp}/hiking/?pick=on&serverpick=on&server=off&start=entrance&time=13:00&weather=clear&quality=balanced`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const out={at:new Date().toISOString(),checks:[],errors:[]};let fail=false;
const check=(n,ok,d={})=>{out.checks.push({n,ok:!!ok,...d});if(!ok)fail=true;console.log(ok?'통과':'실패',n,ok?'':JSON.stringify(d));};
const SIZES={세로:[390,844,true],가로:[844,390,true],PC:[1920,1080,false],'세로-키보드':[390,430,true],'가로-키보드':[844,200,true]};
const layout=p=>p.evaluate(()=>{const i=document.querySelector('#mountain-pick .pk-nick input'),r=i.getBoundingClientRect(),vh=visualViewport?.height??innerHeight;
 const small=[...document.querySelectorAll('#mountain-pick button:not([disabled]),#mountain-pick input')].filter(e=>e.offsetParent).map(e=>({e,r:e.getBoundingClientRect()})).filter(({r})=>r.height<43.5||r.width<43.5).map(({e,r})=>`${e.className||e.name} ${Math.round(r.width)}×${Math.round(r.height)}`);
 return {input:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},vh,inView:r.top>=-.5&&r.bottom<=vh+.5&&r.left>=-.5&&r.right<=innerWidth+.5,small,fontPx:parseFloat(getComputedStyle(i).fontSize)};});
async function page(size,init){
 const [w,h,touch]=SIZES[size];
 const ctx=await browser.newContext({viewport:{width:w,height:h},deviceScaleFactor:1,hasTouch:touch,isMobile:touch});
 await ctx.addInitScript(init??(()=>{if(!sessionStorage.getItem('seeded')){localStorage.clear();sessionStorage.setItem('seeded','1');}localStorage.setItem('gwanak-sound-enabled','false');}));
 const p=await ctx.newPage();
 p.on('pageerror',e=>out.errors.push(`${size}: ${e.message}`));
 p.on('console',m=>{if(m.type()==='error'&&!/WebSocket|favicon|Failed to load|ERR_CONNECTION/.test(m.text()))out.errors.push(`${size}: ${m.text()}`);});
 await p.goto(url);await p.waitForSelector('#mountain-pick .pk-nick input',{timeout:180000});
 // 주소의 time=13:00이 수첩 톤(낮)에 반영될 때까지 기다린다(그 전에는 지금 서울 시각 톤)
 await p.waitForFunction(()=>document.documentElement.dataset.hudTime==='day',null,{timeout:60000}).catch(()=>out.errors.push(`${size}: 낮 톤으로 안 바뀜`));await p.waitForTimeout(400);
 return {p,ctx};
}
try{
 // 1) 세 크기 캡처 + 키보드 흉내
 for(const size of Object.keys(SIZES)){
  const {p,ctx}=await page(size);const kb=size.includes('키보드');
  if(kb){await p.focus('#mountain-pick .pk-nick input');await p.keyboard.type('산타는곰');await p.waitForTimeout(500);}
  const L=await layout(p);
  check(`${size}: 단추·칸 44px 이상, 입력 16px(iOS 확대 방지)`,!L.small.length&&L.fontPx>=16,L);
  check(`${size}: 닉네임 칸이 보이는 화면 안`,L.inView,L);
  await p.screenshot({path:`${dir}/mountain-nick-${size}.png`});await ctx.close();
 }
 // 2) 흐름(PC)
 const {p,ctx}=await page('PC');
 await p.evaluate(()=>{window.__leak=[];addEventListener('keydown',e=>window.__leak.push(e.code));});
 await p.click('#mountain-pick .pk-nick input');await p.keyboard.type('RCF 곰');await p.keyboard.press('KeyW');await p.keyboard.press('Space');
 const typed=await p.evaluate(()=>({v:document.querySelector('#mountain-pick .pk-nick input').value,leak:window.__leak,saved:localStorage.getItem('gwanak-multi-name')}));
 check('입력 중 단축키가 걷기로 새지 않음(window keydown 0번)',typed.leak.length===0,typed);
 check('치는 대로 저장값(gwanak-multi-name)에 저장',typed.saved===typed.v.trim()&&typed.v.startsWith('RCF 곰'),typed);
 await p.fill('#mountain-pick .pk-nick input','가나다라마바사아자차카타파하');
 check('12자까지',(await p.inputValue('#mountain-pick .pk-nick input')).length===12);
 await p.fill('#mountain-pick .pk-nick input','산타는곰');
 await p.click('[data-pk-go]');await p.waitForSelector('.sp-wrap:not([hidden]) input',{timeout:10000});
 check('서버 고르기 칸에 미리 채움',(await p.inputValue('.sp-wrap:not([hidden]) input'))==='산타는곰');
 await p.fill('.sp-wrap:not([hidden]) input','바위다람쥐');
 check('서버 고르기 창에서 고치면 같은 저장값에',(await p.evaluate(()=>localStorage.getItem('gwanak-multi-name')))==='바위다람쥐');
 await p.click('.sp-wrap:not([hidden]) [data-sp=solo]');
 check('혼자 걷기 뒤에도 이름 저장',(await p.evaluate(()=>localStorage.getItem('gwanak-multi-name')))==='바위다람쥐');
 await p.reload();await p.waitForSelector('#mountain-pick .pk-nick input',{timeout:180000});
 check('다시 들어오면 마지막 이름',(await p.inputValue('#mountain-pick .pk-nick input'))==='바위다람쥐');
 await p.fill('#mountain-pick .pk-nick input','');await p.click('[data-pk-go]');await p.waitForSelector('.sp-wrap:not([hidden]) input');
 const empty=await p.evaluate(()=>{const i=document.querySelector('.sp-wrap:not([hidden]) input');return {v:i.value,ph:i.placeholder,saved:localStorage.getItem('gwanak-multi-name')};});
 check('비우면 빈 칸 + 등산객XXXX 안내',empty.v===''&&empty.ph==='등산객XXXX'&&empty.saved==='',empty);
 await ctx.close();
}catch(e){fail=true;check('오류',false,{message:e.message});}
check('콘솔 오류 없음',!out.errors.length,{errors:out.errors});
writeFileSync(`${dir}/mountain-nick-report.json`,JSON.stringify(out,null,1));
await browser.close();await vite.close();
process.exit(fail?1:0);
