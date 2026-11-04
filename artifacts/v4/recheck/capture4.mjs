// 3차 유지 확인: 해질녘·밤(둥근 별, 조명등)과 계곡 물 위 풀을 로컬 빌드로 찍는다(읽기 전용).
import {chromium} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {initialState} from '../../../src/movement.js';
const dir='artifacts/v4/recheck/shots';mkdirSync(dir,{recursive:true});
const base=process.env.BASE_URL??'http://127.0.0.1:5413';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const ready=p=>p.waitForFunction(()=>window.hiking?.started&&hiking.landscape().ready&&!hiking.rendering().compiling,null,{timeout:300000});
for(const [id,time,s,lat] of [['dusk-1800',  '18:10',1500,0],['night-2200','22:30',1500,0],['dusk-summit','18:10',5000,0]]){
 const c=await browser.newContext({viewport:{width:1280,height:800},deviceScaleFactor:1});
 const st=JSON.stringify({...initialState({start:'demo'}),s,lateral:lat,zone:'route'});
 await c.addInitScript(st=>{localStorage.clear();localStorage.setItem('gwanak-sound-enabled','false');localStorage.setItem('gwanak-hiking:v1',st);},st);
 const p=await c.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(`${base}/?quality=high&time=${time}&weather=clear`);await ready(p);await p.waitForTimeout(3000);
 await p.evaluate(()=>document.querySelectorAll('dialog[open]').forEach(d=>d.close()));
 await p.screenshot({path:`${dir}/${id}.png`});console.log(id,errors.length);await c.close();}
await browser.close();
