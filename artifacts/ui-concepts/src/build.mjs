// 지난 상세 시안(등산수첩-상세.html)의 CSS·HUD 그리기 코드를 그대로 불러와 새 시안에 넣는다(배경 이미지 포함).
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const here=p=>fileURLToPath(new URL(p,import.meta.url));
const base=readFileSync(here('../등산수첩-상세.html'),'utf8').split('\n');
const css=base.slice(base.indexOf('<style>')+1,base.indexOf('</style></head>')).join('\n');
const js0=base.findIndex(l=>l.startsWith('const Q=')),js1=base.findIndex(l=>l.startsWith('// ── 보드 그리기 ──'));
const js=base.slice(js0,js1).join('\n');
const tpl=readFileSync(here('산고르기-자유설정.template.html'),'utf8');
writeFileSync(here('../산고르기-자유설정.html'),tpl.replace('/*__BASE_CSS__*/',()=>css).replace('/*__BASE_JS__*/',()=>js));
console.log('ok');
