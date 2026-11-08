// 의견 보내기 카드 캡처(등산·흡연장 × 390×844·844×390·1920×1080). 개발 서버(npm run dev, 5173)를 먼저 띄운다.
// 사용: node scripts/capture-feedback.mjs [hiking,smoking] → artifacts/feedback-2026-11-08/<체험>-<w>x<h>.png
// 검사: 카드가 화면 안에 있는지, 누르는 곳이 44px 이상인지, 카드가 열린 동안 W 키로 걷지 않는지, 콘솔 오류.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
const dir='artifacts/feedback-2026-11-08';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5173';
const exps=(process.argv[2]??'hiking,smoking').split(',');
const SIZES=[[390,844],[844,390],[1920,1080]];
const PAGE={
 hiking:{url:'/hiking/?pick=off&serverpick=off&start=entrance&time=14:20',ready:()=>!!window.hiking,open:'hiking:feedback-open'},
 smoking:{url:'/smoking/?capture=1&time=day',ready:()=>!!window.lounge,open:'lounge:feedback-open'},
};
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist','--use-angle=metal']});
for(const exp of exps)for(const [w,h] of SIZES){
 const p=PAGE[exp],mobile=w<900;
 const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile});
 const logs=[];page.on('console',m=>{if(m.type()==='error')logs.push(m.text());});page.on('pageerror',e=>logs.push('pageerror: '+e.message));
 await page.goto(base+p.url);
 await page.waitForFunction(p.ready,null,{timeout:90000}).catch(e=>logs.push('timeout '+e.message));
 await page.waitForTimeout(4000);
 await page.evaluate(ev=>{dispatchEvent(new CustomEvent(ev));const t=document.querySelector('.fb-text');t.value='계단에서 동동이가 잠깐 멈췄어요';t.dispatchEvent(new Event('input'));document.querySelector('.fb-info').open=true;},p.open);
 // 열린 동안 걷지 않는지: 바깥(body)에 포커스를 두고 W를 1초 누른다
 const before=await page.evaluate(()=>JSON.stringify(window.lounge?.status?.()?.player??window.hiking?.position?.()??null));
 await page.evaluate(()=>document.activeElement?.blur());await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');
 const after=await page.evaluate(()=>JSON.stringify(window.lounge?.status?.()?.player??window.hiking?.position?.()??null));
 const check=await page.evaluate(()=>{
  const c=document.querySelector('.fb-card')?.getBoundingClientRect();
  const small=[...document.querySelectorAll('.fb-modal button,.fb-modal summary')].filter(b=>{const r=b.getBoundingClientRect();return r.width&&(r.height<44||r.width<44);}).map(b=>b.textContent.trim().slice(0,12));
  return {card:c&&{x:Math.round(c.x),y:Math.round(c.y),w:Math.round(c.width),h:Math.round(c.height)},inside:!!c&&c.left>=0&&c.top>=0&&c.right<=innerWidth&&c.bottom<=innerHeight,small,open:document.body.classList.contains('fb-open')};
 });
 const name=`${exp}-${w}x${h}`;
 await page.screenshot({path:`${dir}/${name}.png`});
 console.log(name,JSON.stringify(check),before===after?'걷지 않음':'⚠ 위치가 바뀜(자동 걷기일 수 있음)',logs.length?`\n  오류: ${logs.slice(0,5).join(' | ')}`:'');
 await page.close();
}
await browser.close();
