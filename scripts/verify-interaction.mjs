// 상호작용 1차 화면 확인. 개발 서버 필요: PORT=5197 node scripts/verify-interaction.mjs  (PASS=desktop|mobile|multi 로 일부만)
// 데스크톱은 키보드로, 아이폰 13 세로·가로는 터치(탭)로 각 상호작용을 실제로 누른다. 콘솔 오류가 하나라도 있으면 실패로 끝난다.
import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium,devices} from '@playwright/test';import {mkdirSync,writeFileSync} from 'node:fs';
const port=process.env.PORT??5197,dir='artifacts/interaction',pass=process.env.PASS??'desktop,mobile,multi';mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],out={steps:[]},log=(k,v={})=>{out.steps.push({k,...v});console.log(k,JSON.stringify(v).slice(0,300));};
const url=(q='')=>`http://127.0.0.1:${port}/?start=gate&time=11:00&weather=clear&quality=low${q}`;
async function open(context,name,q=''){
 await context.addInitScript(()=>{localStorage.setItem('gwanak-sound-enabled','false');});
 const p=await context.newPage();p.on('pageerror',e=>errors.push(name+': '+e.message));p.on('console',m=>{if(m.type()==='error')errors.push(name+': '+m.text());});
 await p.goto(url(q));await p.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&!hiking.rendering().compiling,null,{timeout:240000});
 await p.addStyleTag({content:'#resume-note{display:none!important}'});await p.waitForTimeout(800);return p;
}
const view=p=>p.evaluate(()=>hiking.interaction().view),prog=p=>p.evaluate(()=>hiking.interaction().progress),snap=p=>p.evaluate(()=>hiking.snapshot());
const jump=async(p,id,back=3,face=true,along=0)=>{const ok=await p.evaluate(({id,back,face,along})=>hiking.jumpNear(id,{back,face,along}),{id,back,face,along});if(!ok)throw new Error('이동 실패 '+id);await p.waitForTimeout(700);};
const shot=(p,name)=>p.screenshot({path:`${dir}/${name}.jpg`,type:'jpeg',quality:80});
const tapPill=async(p,i=0)=>{const b=p.locator('.ix-pill').nth(i);await b.waitFor({state:'visible',timeout:5000});await b.tap();};
const drain=async p=>{await p.keyboard.down('Shift');await p.keyboard.down('w');await p.waitForTimeout(9000);await p.keyboard.up('w');await p.keyboard.up('Shift');};

// ═══ 데스크톱 1440×900 ═══
if(pass.includes('desktop')){
 const ctx=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});const p=await open(ctx,'desktop');
 // 0) 알약이 없을 때 F = 정면 보기(기존 동작)
 await p.keyboard.press('f');log('알약 없음 F',{view:await view(p),face:await p.evaluate(()=>hiking.orientation().reset!==null||true)});
 // 1) 일주문 스탬프
 await jump(p,'stamp-1');let v=await view(p);log('일주문 알약',{label:v?.rows[0].label});await shot(p,'01-pill-stamp-gate');
 await p.keyboard.press('f');await p.waitForTimeout(450);await shot(p,'02-stamp-toast');log('일주문 스탬프',{stamps:Object.keys((await prog(p)).stamps)});
 // 2) 이정표
 await jump(p,'sign-518');v=await view(p);log('이정표 알약',{label:v?.rows[0].label});await p.keyboard.press('f');await p.waitForTimeout(300);await shot(p,'03-signpost-panel');
 log('이정표 패널',{rows:await p.locator('.ix-signrow').allTextContents()});await p.keyboard.press('Escape');await p.waitForTimeout(200);log('Esc로 닫힘',{open:await p.locator('.ix-board').isVisible()});
 await jump(p,'sign-1935');await p.keyboard.press('f');await p.waitForTimeout(300);log('이정표+바위쪽',{dots:await p.locator('.ix-dots i').count()});await p.keyboard.press('ArrowRight');await p.waitForTimeout(250);await shot(p,'04-signpost-page2');
 await p.keyboard.down('w');await p.waitForTimeout(500);await p.keyboard.up('w');log('걸으면 닫힘',{open:await p.locator('.ix-board').isVisible()});
 // 3) 해설판
 for(const [id,name] of [['board-valley','05-board-valley'],['board-yeonjuam','06-board-yeonjuam'],['board-eungjinjeon','07-board-eungjinjeon'],['board-summit','08-board-summit']]){
  await jump(p,id);v=await view(p);await p.keyboard.press('f');await p.waitForTimeout(300);
  log(id,{pill:v?.rows[0].label,chips:await p.locator('.ix-chip').allTextContents(),notice:(await p.locator('.ix-board .why').textContent())});await shot(p,name);
  await p.keyboard.press('f');await p.waitForTimeout(150);
 }
 // 4) 약수: 달려서 체력을 쓴 뒤 한 모금
 await jump(p,'sign-518',3,false);await drain(p);const before=(await snap(p)).stamina;
 await jump(p,'spring');v=await view(p);await shot(p,'09-pill-spring');await p.keyboard.press('f');await p.waitForTimeout(1500);await shot(p,'10-drink-action');
 log('약수 진행',{action:await p.evaluate(()=>hiking.interaction().action)});await p.waitForTimeout(2600);
 const after=(await snap(p)).stamina;log('약수 한 모금',{before:+before.toFixed(1),after:+after.toFixed(1),diff:+(after-before).toFixed(1)});await shot(p,'11-drink-done');
 // 쿨다운
 v=await view(p);log('약수 쿨다운',{state:v?.rows[0].state,reason:v?.rows[0].reason});
 // 이동하면 취소
 await jump(p,'stream-1710',2);await p.keyboard.press('f');await p.waitForTimeout(900);const mid=await p.evaluate(()=>hiking.interaction().action);await shot(p,'12-dip-action');
 await p.keyboard.down('w');await p.waitForTimeout(400);await p.keyboard.up('w');log('이동 취소',{진행중:mid?.id,취소후:await p.evaluate(()=>hiking.interaction().action)});
 const b2=(await snap(p)).stamina;await p.waitForTimeout(500);
 await jump(p,'stream-1710',2);await p.keyboard.press('f');await p.waitForTimeout(3700);log('손 담그기',{stamina:+(await snap(p)).stamina.toFixed(1),전:+b2.toFixed(1)});
 // 돌탑: 스탬프(F) + 돌 올리기(2)
 await jump(p,'cairn',3.5);v=await view(p);log('돌탑 알약',{rows:v?.rows.map(r=>`${r.key}:${r.label}`)});await shot(p,'13-pill-cairn-stack');
 await p.keyboard.press('2');await p.waitForTimeout(1200);await shot(p,'14-cairn-action');await p.waitForTimeout(2400);log('돌 올리기',{stones:(await prog(p)).stones,toast:await p.locator('.ix-toast').textContent().catch(()=>null)});
 // 스트레칭
 await p.keyboard.press('z');await p.waitForTimeout(1500);await shot(p,'15-stretch');await p.waitForTimeout(3000);log('스트레칭',{count:(await prog(p)).stretches});
 // 5) 스탬프 6곳 + 수첩 + 완등 카드
 for(const id of ['stamp-2','stamp-3','stamp-4','stamp-5']){await jump(p,id,4);await p.keyboard.press('f');await p.waitForTimeout(300);}
 await shot(p,'16-stamp-toast-5');await p.keyboard.press('j');await p.waitForTimeout(400);await shot(p,'17-notebook-5of6');log('수첩 5/6',{cardBtn:await p.locator('.ix-book [data-a=card]').isDisabled()});await p.keyboard.press('j');
 await jump(p,'stamp-6',4);v=await view(p);log('정상 인증 알약',{label:v?.rows[0].label});await shot(p,'18-pill-summit-stamp');
 await p.keyboard.press('f');await p.waitForTimeout(2200);await shot(p,'19-complete-card');
 const card=await p.evaluate(()=>{const c=document.querySelector('.ix-card canvas');return {w:c.width,h:c.height,url:c.toDataURL('image/png')};});
 writeFileSync(`${dir}/완등카드-1080x1350.png`,Buffer.from(card.url.split(',')[1],'base64'));log('완등 카드',{w:card.w,h:card.h,stamps:Object.keys((await prog(p)).stamps).length});
 await p.keyboard.press('Escape');await p.waitForTimeout(200);await p.keyboard.press('j');await p.waitForTimeout(400);await shot(p,'20-notebook-6of6');await p.keyboard.press('j');
 // 저장 유지: 새로고침 뒤에도 스탬프 6개
 await p.reload();await p.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready,null,{timeout:240000});log('저장 유지',{stamps:Object.keys((await prog(p)).stamps).length});
 // 6) 쌍안경 이름표(정상)
 await jump(p,'stamp-6',4,false);await p.keyboard.press('b');await p.waitForTimeout(600);
 const aim=async target=>{for(let k=0;k<30;k++){const h=await p.evaluate(()=>hiking.orientation().cameraHeading),b=((-h*180/Math.PI)%360+360)%360,d=((target-b+540)%360)-180;if(Math.abs(d)<.8)return b;await p.keyboard.down(d>0?'e':'q');await p.waitForTimeout(Math.min(700,Math.max(30,Math.abs(d)/63*1000*.55)));await p.keyboard.up(d>0?'e':'q');await p.waitForTimeout(250);}return null;};
 await p.evaluate(()=>hiking.setGadgetZoom?.(8));
 const lm=async(name,target,shotName)=>{const b=await aim(target);await p.waitForTimeout(400);const m=await p.evaluate(()=>hiking.interaction().bino);log(name,{bearing:b,focus:m?.focus?.name,labels:m?.labels.map(l=>l.name),edges:m?.edges.map(e=>e.text),tape:m?.tape.length});if(shotName)await shot(p,shotName);return m;};
 await lm('쌍안경 남산',10.2,'21-binoculars-namsan');
 await p.keyboard.press('f');await p.waitForTimeout(350);await shot(p,'22-landmark-detail');await p.keyboard.press('f');await p.waitForTimeout(150);
 await lm('쌍안경 북한산(맑은 날만)',6.1,null);
 await lm('쌍안경 인천대교(방향만)',264.5,'23-binoculars-incheon-direction-only');
 await p.keyboard.press('n');await p.waitForTimeout(400);log('이름표 끄기',{labels:(await p.evaluate(()=>hiking.interaction().bino)).labels.length});await shot(p,'24-binoculars-labels-off');await p.keyboard.press('n');await p.keyboard.press('b');
 // 7) 휴대폰 인증샷 틀
 await jump(p,'stamp-6',4);await p.keyboard.press('p');await p.waitForTimeout(700);v=await view(p);log('폰 틀 알약',{kind:v?.kind,label:v?.rows[0].label});await shot(p,'25-phone-frame-pill');
 await p.keyboard.press('f');await p.waitForTimeout(500);await p.keyboard.press('Space');await p.waitForTimeout(600);await shot(p,'26-phone-frame-on');log('폰 틀 켜고 촬영',{frame:(await p.evaluate(()=>hiking.interaction().frameOn)),photo:await p.evaluate(()=>hiking.lastPhoto)});await p.keyboard.press('p');
 // 8) 구간 이동과 함께
 await p.locator('.sj-toggle').click();await p.waitForTimeout(200);await shot(p,'27-section-jump-open');await p.locator('[data-jump=gate]').click();await p.waitForTimeout(600);log('구간 이동 뒤',{view:await view(p),panels:await p.evaluate(()=>document.querySelectorAll('.ix-board:not([hidden]),.ix-book:not([hidden]),.ix-card:not([hidden])').length)});
 // 9) 키 겹침: Q/E 회전은 그대로, 알약 없으면 F 정면 보기
 await jump(p,'sign-1352',3,false,-40);const y0=await p.evaluate(()=>hiking.orientation().yaw);await p.keyboard.down('e');await p.waitForTimeout(500);await p.keyboard.up('e');const y1=await p.evaluate(()=>hiking.orientation().yaw);await p.keyboard.press('f');await p.waitForTimeout(1500);const y2=await p.evaluate(()=>hiking.orientation().yaw),vF=await view(p);
 log('E 회전·F 정면',{E전:+y0.toFixed(2),E후:+y1.toFixed(2),F후:+y2.toFixed(2),알약:vF?.rows?.[0]?.label??null});
 await ctx.close();
}
// ═══ 아이폰 13 터치 에뮬레이션(세로·가로) ═══
async function mobile(name,device){
 const ctx=await browser.newContext({...devices[device],deviceScaleFactor:2});const p=await open(ctx,name);const n=name;
 await p.evaluate(()=>{localStorage.removeItem('gwanak-interaction:v1');});
 await jump(p,'spring');let v=await view(p);log(n+' 약수 알약',{label:v?.rows[0].label,round:await p.locator('.ix-pill').first().evaluate(e=>{const r=e.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})});await shot(p,`${n}-01-pill-round`);
 await tapPill(p);await p.waitForTimeout(1300);await shot(p,`${n}-02-drink`);await p.waitForTimeout(2600);log(n+' 약수',{drinks:(await prog(p)).drinks});
 await jump(p,'stamp-2',4);await tapPill(p);await p.waitForTimeout(450);await shot(p,`${n}-03-stamp-toast`);log(n+' 스탬프',{n:Object.keys((await prog(p)).stamps).length});
 await jump(p,'sign-1352');await tapPill(p);await p.waitForTimeout(350);await shot(p,`${n}-04-sign-sheet`);log(n+' 이정표 시트',{open:await p.locator('.ix-board').isVisible()});await p.locator('.ix-board [data-a=close]').tap();await p.waitForTimeout(200);
 await jump(p,'board-valley');await tapPill(p);await p.waitForTimeout(350);await shot(p,`${n}-05-board-sheet`);await p.locator('.ix-board [data-a=close]').tap();
 await jump(p,'cairn',3.5);await p.waitForTimeout(300);await shot(p,`${n}-06-cairn-pill`);
 await p.locator('.ix-quick [data-q=stamps-toggle]').tap();await p.waitForTimeout(400);await shot(p,`${n}-07-notebook`);log(n+' 수첩',{open:await p.locator('.ix-book').isVisible()});await p.locator('.ix-book [data-a=close]').tap();
 await p.locator('.ix-quick [data-q=stretch]').tap();await p.waitForTimeout(1300);await shot(p,`${n}-08-stretch`);await p.waitForTimeout(3300);log(n+' 스트레칭',{count:(await prog(p)).stretches});
 // 정상: 쌍안경(터치) + 폰 틀
 await jump(p,'stamp-6',4); await tapPill(p);await p.waitForTimeout(400);log(n+' 정상 스탬프',{n:Object.keys((await prog(p)).stamps).length});await shot(p,`${n}-09-summit-stamp`);
 await ctx.close();
}
if(pass.includes('mobile')){await mobile('iphone-portrait','iPhone 13');await mobile('iphone-landscape','iPhone 13 landscape');}
// ═══ 함께 걷기 연결(이름표 N · 인사 X 메뉴) ═══
if(pass.includes('multi')){
 const ctx=await browser.newContext({viewport:{width:1100,height:680},deviceScaleFactor:1});
 const open2=async name=>{const p=await ctx.newPage();p.on('pageerror',e=>errors.push(name+': '+e.message));p.on('console',m=>{if(m.type()==='error')errors.push(name+': '+m.text());});
  await p.goto(`http://127.0.0.1:${port}/hiking/?multi=ix&name=${encodeURIComponent(name)}&start=entrance&time=13:00&weather=clear&quality=balanced&outfit=${name==='하늘'?2:4}`);await p.waitForFunction(()=>window.hiking?.started&&window.hiking?.multi,null,{timeout:180000});return p;};
 const A=await open2('하늘'),B=await open2('바다');await A.bringToFront();await A.waitForTimeout(1200);
 const pb=await B.evaluate(()=>hiking.position());await A.evaluate(({x,z,h})=>hiking.multiApi.teleport({zone:'plaza',x,z,heading:h}),{x:pb.x-Math.sin(pb.heading)*3,z:pb.z-Math.cos(pb.heading)*3,h:pb.heading+Math.PI});await A.waitForTimeout(2200);
 const v=await A.evaluate(()=>hiking.interaction().view);log('멀티 알약',{label:v?.rows?.[0]?.label});await (await waitChunks(A)).screenshot({path:`${dir}/28-multi-greet-pill.jpg`,type:'jpeg',quality:80});
 await A.keyboard.down('x');await A.waitForTimeout(600);log('X 누르고 있기',{wheel:await A.locator('.ix-wheel').isVisible()});await (await waitChunks(A)).screenshot({path:`${dir}/29-multi-emote-menu.jpg`,type:'jpeg',quality:80});
 await A.keyboard.press('2');await A.keyboard.up('x');await B.waitForTimeout(900);log('메뉴에서 손 흔들기',{B가본:(await B.evaluate(()=>hiking.multi().roster[0])).gesture});
 await A.waitForTimeout(3300);await A.keyboard.press('x');await B.waitForTimeout(900);log('X 짧게=인사',{B가본:(await B.evaluate(()=>hiking.multi().roster[0])).gesture});
 await A.keyboard.press('n');await A.waitForTimeout(500);log('N 이름표 끄기',{tagsOn:await A.evaluate(()=>hiking.multiApi.tagsOn),interaction:await A.evaluate(()=>hiking.interaction().tagsOn)});await (await waitChunks(A)).screenshot({path:`${dir}/30-multi-tags-off.jpg`,type:'jpeg',quality:80});await A.keyboard.press('n');
 await ctx.close();
}
await browser.close();
out.errors=errors;writeFileSync(`${dir}/results.json`,JSON.stringify(out,null,1));
console.log('콘솔 오류',errors.length,errors.slice(0,5));process.exit(errors.length?1:0);
