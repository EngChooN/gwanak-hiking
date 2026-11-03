// 실경 비교용 구간 7곳 1인칭 캡처. LABEL=1|2(촬영 차수), ONLY=id,id
import {chromium} from '@playwright/test';
import {mkdirSync,writeFileSync} from 'node:fs';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
const label=process.env.LABEL??'1',dir='artifacts/silgyeong';mkdirSync(dir,{recursive:true});
// [id, 구간, 누적m, 쿼리]. 구간 3(계곡)과 4(제1광장)는 지리적으로 겹쳐 지시 번호 순서를 따른다.
const specs=[['s1','입구 일주문',0,`&entrancePhoto=${process.env.DIST??14}`],['s2','입구~호수공원',720,''],['s3','계곡',1600,''],['s4','제1광장 갈림',1070,''],['s5','깔딱고개',4050,''],['s6','연주암·능선',4540,''],['s7','연주대 정상',4930,'']];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});const rows=[];
try{for(const [id,name,m,query] of specs){if(process.env.ONLY&&!process.env.ONLY.split(',').includes(id))continue;
 const seg=route.segments.find(s=>s.b.referenceMetres>=m)??route.segments.at(-1),s=seg.start;
 const context=await browser.newContext({viewport:id==='s1'?{width:1000,height:950}:{width:1200,height:900},deviceScaleFactor:1});
 await context.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...initialState(),s,view:'first',paused:true}});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 // 1차(가을 오전 10시 기본 햇빛)와 같은 조건. 실시간 시각·날씨 기능이 생긴 뒤에는 고정해야 비교가 된다.
 await page.goto(`http://127.0.0.1:5176/?quality=high&time=${process.env.TIME??'10:00'}&weather=clear${query}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().ready&&hiking.landscape().natureReady&&!hiking.rendering().compiling,null,{timeout:240000});
 await page.waitForTimeout(9000);await page.addStyleTag({content:'#app{visibility:hidden}'});
 await page.screenshot({path:`${dir}/${label}-${id}.png`});
 rows.push({id,name,m,s,errors});console.log(id,name,m,errors);await context.close();
}}finally{await browser.close();}
writeFileSync(`${dir}/${label}${process.env.ONLY?'-'+process.env.ONLY:''}.json`,JSON.stringify(rows,null,2));
