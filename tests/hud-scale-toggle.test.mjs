import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {installHudToggle,HUD_SAVE_KEY} from '../src/hud-toggle.js';
const read=f=>readFileSync(new URL('../'+f,import.meta.url),'utf8');
test('상호작용·기구 화면 길이는 --u 비례이고 휴대폰 배치는 1px로 되돌린다(수첩 HUD는 hud-notebook.css)',()=>{
 const css=read('src/style.css');
 assert.match(css,/--u:max\(\.6px,min\(\.0520833vw,\.0925926vh\)\)/);
 assert.match(css,/@media\(max-width:700px\),\(max-height:540px\) and \(orientation:landscape\)\{:root\{--u:1px\}\}/);
 assert.match(read('src/main.js'),/import '\.\/hud-notebook\.css';/);
 for(const f of ['src/style.css','src/hud-notebook.css'])assert.ok(!/pause-overlay/.test(read(f)),`${f}: 일시정지 표시 CSS가 없다`);
});
test('H 키는 input·main의 이벤트로만 오고 HUD 모듈은 keydown을 받지 않는다',()=>{
 const src=read('src/hud-toggle.js');
 assert.ok(!/keydown|KeyH/.test(src.replace(/\/\/.*/g,'')));
 assert.match(read('src/input.js'),/KeyH:'hud-toggle'/);
 assert.match(read('hiking/index.html'),/id="hud-hide"/);
 assert.match(read('src/style.css'),/#app\.hud-hidden>\*:not\(#joystick\):not\(#look-zone\):not\(dialog\)/);
});
test('이벤트 한 번에 한 번만 바뀌고 저장된다',()=>{
 const store={};globalThis.localStorage={getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=v;}};
 const listeners={};const win={addEventListener:(t,f)=>{(listeners[t]??=[]).push(f);},dispatchEvent:e=>{(listeners[e.type]||[]).forEach(f=>f(e));}};
 globalThis.CustomEvent=class{constructor(t){this.type=t;}};
 const mk=()=>({dataset:{},classList:{set:new Set(),toggle(c,on){on?this.set.add(c):this.set.delete(c);}},append(){},setAttribute(){},addEventListener(){}});
 const app=mk(),doc={getElementById:id=>id==='app'?app:null,createElement:()=>mk(),body:mk()};
 const ui=installHudToggle(doc,win);
 win.dispatchEvent(new CustomEvent('hiking:hud-toggle'));
 assert.equal(ui.isHidden(),true);assert.ok(app.classList.set.has('hud-hidden'));assert.equal(store[HUD_SAVE_KEY],'true');
 win.dispatchEvent(new CustomEvent('hiking:hud-toggle'));
 assert.equal(ui.isHidden(),false);assert.equal(store[HUD_SAVE_KEY],'false');
});
