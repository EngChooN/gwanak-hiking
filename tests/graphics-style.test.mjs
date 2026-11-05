import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GRAPHICS_STYLE_KEY,resolveStyle,saveStyle,clearStyle} from '../src/graphics-style.js';

const memory=(init={})=>{const m=new Map(Object.entries(init));return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),map:m};};

test('키 이름은 기획서 §2.1 그대로',()=>{assert.equal(GRAPHICS_STYLE_KEY,'gwanak-graphics-style');});

test('우선순위: ?style → localStorage → null',()=>{
 const s=memory({[GRAPHICS_STYLE_KEY]:'toon'});
 assert.equal(resolveStyle({search:'?style=realistic',storage:s}),'realistic');
 assert.equal(resolveStyle({search:'',storage:s}),'toon');
 assert.equal(resolveStyle({search:'',storage:memory()}),null);
 assert.equal(resolveStyle({search:'?style=toon',storage:memory()}),'toon');
});

test('잘못된 값은 무시한다',()=>{
 assert.equal(resolveStyle({search:'?style=cel',storage:memory({[GRAPHICS_STYLE_KEY]:'toon'})}),'toon');
 assert.equal(resolveStyle({search:'',storage:memory({[GRAPHICS_STYLE_KEY]:'pixel'})}),null);
});

test('자동화 브라우저는 ?style이 없으면 저장값과 상관없이 realistic',()=>{
 const s=memory({[GRAPHICS_STYLE_KEY]:'toon'});
 assert.equal(resolveStyle({search:'',storage:s,webdriver:true}),'realistic');
 assert.equal(resolveStyle({search:'?start=summit',storage:null,webdriver:true}),'realistic');
 assert.equal(resolveStyle({search:'?style=toon',storage:s,webdriver:true}),'toon');
 assert.equal(resolveStyle({search:'?style=bad',storage:s,webdriver:true}),'realistic');
});

test('저장 공간이 막혀도 예외 없이 null',()=>{
 const broken={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');},removeItem(){throw new Error('denied');}};
 assert.equal(resolveStyle({search:'',storage:broken}),null);
 assert.equal(saveStyle(broken,'toon'),false);assert.equal(clearStyle(broken),false);
});

test('saveStyle·clearStyle',()=>{
 const s=memory();
 assert.equal(saveStyle(s,'toon'),true);assert.equal(s.map.get(GRAPHICS_STYLE_KEY),'toon');
 assert.equal(saveStyle(s,'watercolor'),false);assert.equal(s.map.get(GRAPHICS_STYLE_KEY),'toon');
 assert.equal(clearStyle(s),true);assert.equal(s.map.has(GRAPHICS_STYLE_KEY),false);
});

test('boot.js는 three를 import하지 않고 main.js를 동적 import한다',()=>{
 const boot=readFileSync(new URL('../src/boot.js',import.meta.url),'utf8');
 assert.doesNotMatch(boot,/from\s+['"]three|import\(['"]three/);
 assert.match(boot,/import\('\.\/main\.js'\)/);
 assert.match(boot,/#style-chooser|'style-chooser'/);assert.match(boot,/style-remember/);assert.match(boot,/style-switch/);
 assert.match(boot,/dataset\.style=/);
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/<script type="module" src="\/src\/boot\.js"><\/script>/);
 assert.doesNotMatch(html,/src="\/src\/main\.js"/);
});

test('main.js: 카툰 모듈은 style==="toon"일 때만 동적 import, 실사 전용 셰이더는 정적 import하지 않음',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.doesNotMatch(main,/^import[^\n]*toon\//m);
 assert.match(main,/style==='toon'[^\n]*await import\('\.\/toon\/index\.js'\)/);
 assert.match(main,/window\.hiking\.style=style/);
 const landscape=readFileSync(new URL('../assets/realistic/load-landscape.js',import.meta.url),'utf8');
 assert.doesNotMatch(landscape,/^import[^\n]*terrain-material\.js/m);assert.doesNotMatch(landscape,/^import[^\n]*RGBELoader/m);
 assert.match(landscape,/import\('\.\/terrain-material\.js'\)/);
 const rendering=readFileSync(new URL('../src/rendering.js',import.meta.url),'utf8');
 assert.doesNotMatch(rendering,/^import[^\n]*toon\//m);
});
