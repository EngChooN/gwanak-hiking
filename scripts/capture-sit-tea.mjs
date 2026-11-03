// 앉기·차 마시기 단계별 캡처(앞·옆). 개발 서버(기본 5175)에서 artifacts/sit-tea-2026-11-04/view.html을 연다.
import {chromium} from '@playwright/test';
import {writeFileSync} from 'node:fs';
const port=process.env.PORT??5175,out='artifacts/sit-tea-2026-11-04';
const shots=[
 {id:'01-sit-front',view:'front',label:'앉기 · 앞'},{id:'02-sit-side',view:'side',label:'앉기 · 옆'},{id:'03-sit-34',view:'front34',label:'앉기 · 비스듬히'},
 {id:'04-sit-stairs-side',view:'side',ground:'stairs',label:'계단 턱에 앉기 · 옆'},
 {id:'10-tea-reach',view:'front',tea:.15,label:'차 ① 컵 잡기 (0.45초)'},
 {id:'11-tea-chest',view:'side',tea:.32,label:'차 ② 가슴 높이 (0.96초)'},
 {id:'12-tea-drink-side',view:'side',tea:.56,label:'차 ③ 마시기 · 옆 (1.7초)'},
 {id:'13-tea-drink-front',view:'front',tea:.56,label:'차 ③ 마시기 · 앞 (1.7초)'},
 {id:'14-tea-knee',view:'side',tea:.78,label:'차 ④ 무릎 위로 내림 (2.3초)'},
 {id:'15-tea-place',view:'front',tea:.9,label:'차 ⑤ 컵 내려놓기 (2.7초)'},
 {id:'16-tea-done',view:'front34',tea:null,label:'차 ⑥ 다시 쉬기 (3초 뒤)'}];
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{const p=await b.newPage({viewport:{width:900,height:900}});p.on('pageerror',e=>console.log('오류',e.message));
 await p.goto(`http://127.0.0.1:${port}/${out}/view.html`);await p.waitForFunction(()=>window.ready,null,{timeout:120000});
 for(const s of shots){const r=await p.evaluate(s=>{setView(s.view);label(s.label);return pose({tea:s.tea??null,ground:s.ground??'flat'});},s);await p.screenshot({path:`${out}/${s.id}.png`});rows.push({...s,...r});console.log(s.id,JSON.stringify(r));}
 // 짧은 영상용 프레임(FRAMES=1): 3초를 30fps로 비스듬히·옆 두 각도. GIF는 scripts/frames-to-gif.py로 묶는다.
 if(process.env.FRAMES){for(const view of ['front34','side']){for(let f=0;f<=90;f++){await p.evaluate(([v,t,settle])=>{setView(v);label(`차 마시기 ${(t*3).toFixed(1)}초`);return pose({tea:t,settle});},[view,f/90,f?0:12]);await p.screenshot({path:`${out}/frames-${view}/${String(f).padStart(3,'0')}.png`});}}}
 writeFileSync(`${out}/shots.json`,JSON.stringify(rows,null,2));
}finally{await b.close();}
