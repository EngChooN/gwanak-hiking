import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gadgetMode,activeStop,formatZoom,clockText,PHONE_STOPS} from '../src/gadget-ui.js';
test('쌍안경은 1인칭에서만 테두리를 그리고 HUD를 접는다',()=>{
 assert.deepEqual(gadgetMode({gadget:'binoculars',view:'first'}),{mode:'binoculars-first',hideHud:true,mirror:false});
 const third=gadgetMode({gadget:'binoculars',view:'third'});assert.equal(third.mode,'binoculars-third');assert.equal(third.hideHud,false);
});
test('휴대폰: 1인칭은 테두리, 3인칭은 작은 조작줄만. 셀카 미리보기만 좌우 반전',()=>{
 assert.equal(gadgetMode({gadget:'phone',view:'first',phone:{selfie:false}}).mode,'phone-first');
 assert.equal(gadgetMode({gadget:'phone',view:'first',phone:{selfie:true}}).mirror,true);
 const t=gadgetMode({gadget:'phone',view:'third',phone:{selfie:true}});assert.equal(t.mode,'phone-third');assert.equal(t.mirror,false);assert.equal(t.hideHud,false);
 assert.equal(gadgetMode({gadget:'none',view:'first'}).mode,'none');assert.equal(gadgetMode().mode,'none');
});
test('줌 단추 0.5·1·2·5x, 현재 배율에 가까운 단추 표시',()=>{
 assert.deepEqual([...PHONE_STOPS],[.5,1,2,5]);assert.equal(activeStop(1),1);assert.equal(activeStop(2.05),2);assert.equal(activeStop(1.5),null);
 assert.equal(formatZoom(8),'8x');assert.equal(formatZoom(1.46),'1.5x');assert.equal(formatZoom(.5),'0.5x');
});
test('시계 표기',()=>{assert.equal(clockText(new Date(2026,10,4,9,5)),'09:05');});
test('HUD 크기 비율(--u)을 따르고 휴대폰 단추는 터치 크기를 지킨다',()=>{
 const css=readFileSync(new URL('../src/gadget-ui.css',import.meta.url),'utf8');
 assert.ok(css.includes('var(--u)'));assert.ok(!/--ui\b/.test(css));
 assert.ok(/\.phone-shutter\{[^}]*min-width:64px/.test(css));assert.ok(/\.phone-zooms button\{[^}]*min-height:max\(40px/.test(css));
});
test('쌍안경 윤곽은 두 원의 합집합을 하나의 path로 그려 가운데 교집합 선이 없다',async()=>{
 const {binoOutlinePath,BINO_OVERLAP}=await import('../src/gadget-ui.js');
 const d=binoOutlinePath(BINO_OVERLAP);assert.equal((d.match(/M/g)||[]).length,1);assert.equal((d.match(/A/g)||[]).length,2,'바깥 호 두 개만');
 const h=Math.sqrt(1-BINO_OVERLAP**2);assert.ok(d.startsWith(`M0 -${h.toFixed(4)}`));
 const js=readFileSync(new URL('../src/gadget-ui.js',import.meta.url),'utf8'),css=readFileSync(new URL('../src/gadget-ui.css',import.meta.url),'utf8');
 assert.ok(!js.includes('bino-lens')&&!css.includes('.bino-lens'),'겹치는 원 테두리 요소를 쓰지 않는다');
});
test('셀카에서는 줌 단추를 비활성하고 표시를 숨긴다',()=>{
 const css=readFileSync(new URL('../src/gadget-ui.css',import.meta.url),'utf8'),js=readFileSync(new URL('../src/gadget-ui.js',import.meta.url),'utf8');
 assert.ok(/data-selfie=true\] \.phone-zooms[^{]*\{[^}]*visibility:hidden/.test(css));assert.ok(js.includes("b.disabled=selfie"));
});
// ── 모바일 피드백 (2026-11-07) ──
test('휴대폰 촬영 방향: 저장된 선택이 있으면 그대로, 없으면 화면 방향',async()=>{
 const {initialOrient}=await import('../src/gadget-ui.js');
 assert.equal(initialOrient('landscape',412,915),'landscape','세로 화면에서도 마지막에 고른 가로를 기억');
 assert.equal(initialOrient('portrait',915,412),'portrait');
 assert.equal(initialOrient(null,412,915),'portrait');assert.equal(initialOrient(null,915,412),'landscape');
 assert.equal(initialOrient('이상한값',1440,900),'landscape');
});
test('저장 사진은 보이는 휴대폰 화면 자리만 자른다(가로 틀이면 가로 비율)',async()=>{
 const {cropRect}=await import('../src/gadget-ui.js');
 const view={left:0,top:0,width:412,height:915},canvas={width:824,height:1830};
 const land=cropRect({left:16,top:358,width:380,height:200},view,canvas);
 assert.deepEqual(land,{sx:32,sy:716,sw:760,sh:400});assert.ok(land.sw/land.sh>1.8,'가로');
 const port=cropRect({left:16,top:97,width:380,height:722},view,canvas);assert.ok(port.sh/port.sw>1.8,'세로');
 assert.equal(cropRect(null,view,canvas),null);assert.equal(cropRect({left:0,top:0,width:0,height:0},view,canvas),null);
 // 셀카 미리보기는 좌우 반전이라 오른쪽에 치우친 틀은 캔버스 왼쪽에서 잘린다
 assert.equal(cropRect({left:300,top:0,width:100,height:100},view,canvas,true).sx,824-600-200);
 // 화면 밖으로 나간 부분은 캔버스 안으로 줄인다
 const c=cropRect({left:-20,top:0,width:100,height:100},view,canvas);assert.equal(c.sx,0);assert.equal(c.sw,160);
});
test('휴대폰 틀은 vh가 아니라 안전 영역·여백을 뺀 상자(cq 단위) 안에 들어가고 세로·가로 전환 단추가 터치에도 보인다',()=>{
 const css=readFileSync(new URL('../src/gadget-ui.css',import.meta.url),'utf8'),js=readFileSync(new URL('../src/gadget-ui.js',import.meta.url),'utf8');
 const dev=css.match(/\.phone-device\{[^}]*\}/g).join('');assert.ok(!/\d+vh|\d+vw/.test(dev),'틀 크기에 vh/vw를 쓰지 않는다(안드로이드 주소창)');
 assert.ok(/data-orient=landscape\] \.phone-device\{[^}]*100cqw[^}]*100cqh/.test(css)&&/data-orient=portrait\] \.phone-device\{[^}]*100cqh[^}]*100cqw/.test(css));
 const box=css.match(/data-mode=phone-first\] \.phone\{[^}]*\}/)[0];
 for(const k of ['st','sb','sl','sr'])assert.ok(box.includes(`--${k},env(safe-area-inset-`),`안전 영역 ${k}`);
 assert.ok(!/data-touch=true\] \[data-act=orient\]\{display:none\}/.test(css),'방향 단추를 터치에서 숨기지 않는다');
 assert.ok(js.includes('data-act="orient"')&&js.includes("GADGET_UI_KEYS.orient,o"),'화면을 돌려도 선택을 저장');
});
test('쌍안경: 방위 띠는 맨 위(안전 영역 아래), 8x는 아래 칩 안에 있어 막대와 겹치지 않는다',()=>{
 const css=readFileSync(new URL('../src/gadget-ui.css',import.meta.url),'utf8'),js=readFileSync(new URL('../src/gadget-ui.js',import.meta.url),'utf8');
 assert.ok(/#ix-bino \.ix-tape\{top:calc\(var\(--st,env\(safe-area-inset-top/.test(css));
 assert.ok(!css.includes('.bino-zoom{position:absolute'),'따로 떠 있던 8x 표시를 없앴다');
 assert.ok(/class="gadget-chip"[^`]*data-chip-text><\/span><b class="chip-zoom" data-bino-zoom/.test(js.replace(/\n/g,'')));
 assert.ok(/--r:min\(46cqh,27cqw,calc\(\(100cqh - var\(--band-t\) - var\(--band-b\)\)\/2\)\)/.test(css),'시야 원이 위·아래 띠를 비킨다');
});
test('종이 칩 글씨(인증샷 알약·쌍안경 이름표·알림)는 낮·노을·밤 모두 대비 4.5:1 이상',()=>{
 const css=readFileSync(new URL('../src/hud-notebook.css',import.meta.url),'utf8');
 const lin=h=>{const v=[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)/255).map(x=>x<=.03928?x/12.92:((x+.055)/1.055)**2.4);return .2126*v[0]+.7152*v[1]+.0722*v[2];};
 const ratio=(a,b)=>{const x=lin(a),y=lin(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
 const tone=sel=>{const m=css.match(new RegExp(sel.replace(/[[\]]/g,'\\$&')+'\\{([^}]*)\\}'))[1];return k=>m.match(new RegExp('--'+k+':(#[0-9a-f]{6})'))?.[1];};
 const base=tone(':root'),dusk=tone(':root[data-hud-time=dusk]'),night=tone(':root[data-hud-time=night]');
 for(const [name,t] of [['낮',base],['노을',k=>dusk(k)??base(k)],['밤',k=>night(k)??base(k)]]){
  assert.ok(ratio(t('ink'),t('paper2'))>=4.5,`${name} 잉크/종이 ${ratio(t('ink'),t('paper2')).toFixed(2)}`);
  assert.ok(ratio(t('ink2'),t('paper2'))>=4.5,`${name} 보조 잉크/종이 ${ratio(t('ink2'),t('paper2')).toFixed(2)}`);
 }
 // 상호작용 화면은 --ink를 짙은 초록으로 따로 정해 두므로, 종이 칩 글씨는 :root에서 받아 둔 --chip-ink를 써야 한다
 assert.ok(css.includes(':root{--chip-ink:var(--ink);--chip-ink2:var(--ink2)}'));
 for(const sel of ['.ix-pill-wrap[data-where=phone] .ix-pill{','.ix-lm .tag{','.ix-edge,.ix-bino-note{','.ix-toast{'])assert.ok(new RegExp(sel.replace(/[.[\]()]/g,'\\$&')+'[^}]*color:var\\(--chip-ink\\)').test(css),sel);
});
