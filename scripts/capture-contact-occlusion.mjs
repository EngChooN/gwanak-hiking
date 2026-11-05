import {waitChunks} from './lib/chunk-wait.mjs';
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {route} from '../src/route.js';
import {initialState,SAVE_KEY} from '../src/movement.js';
import {contactEdgeMetric} from './contact-edge-metric.mjs';
const base=process.env.BASE_URL??'http://127.0.0.1:5188',folder='artifacts/contact-occlusion';
await mkdir(folder,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:process.env.HEADED!=='1'});
const results={date:new Date().toISOString(),errors:[],comparisons:[],diagnostics:[]};
async function scene(point,query){
 const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
 await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 const segment=route.segments.find(s=>s.a===route.points[point])??route.segments.reduce((best,s)=>Math.hypot(s.a.x-route.points[point].x,s.a.z-route.points[point].z)<Math.hypot(best.a.x-route.points[point].x,best.a.z-route.points[point].z)?s:best);
 await context.addInitScript(({key,state})=>{localStorage.setItem(key,JSON.stringify(state));localStorage.setItem('gwanak-sound-enabled','false');},{key:SAVE_KEY,state:{...initialState(),s:segment.start,view:'first',paused:true}});
 const page=await context.newPage();page.on('pageerror',error=>results.errors.push(error.message));
 await page.goto(`${base}/?quality=high&fov=55&${query}`);
 await page.waitForFunction(()=>window.hiking?.started&&window.hiking?.landscape().natureReady&&!window.hiking.rendering().compiling,null,{timeout:240000});
 await page.waitForTimeout(16000);return {context,page};
}
try{
 // 한 페이지에서 uniform만 변경: 좌표·카메라·DPR·LOD·일광·안개를 동일하게 유지한다.
 for(const [name,point]of [['rocks',315],['forest',250]]){
  const {context,page}=await scene(point,'aoMode=off');
  const row={name,point,images:[],states:[]},buffers=[];
  for(const enabled of [false,true]){
   await page.evaluate(value=>hiking.contactOcclusion(value),enabled);await page.waitForTimeout(500);
   const path=`${folder}/${name}-${enabled?'after':'before'}.png`;buffers.push((await (await waitChunks(page)).screenshot({path})).toString('base64'));row.images.push(path);
   const rendering=await page.evaluate(()=>hiking.rendering());row.states.push({enabled,rendering});
   if(rendering.shaderErrors.length)results.errors.push(`${name}/${enabled}: ${JSON.stringify(rendering.shaderErrors)}`);
  }
  // 전체 평균 외에 32px 지역별 차이를 기록한다. 목표 부위 판독은 같은 좌표의 전후 캡처로 한다.
  row.contactProbes=await page.evaluate(()=>hiking.contactProbes());
  row.routeEdgeBand=await contactEdgeMetric(page,buffers[0],buffers[1]);
  row.pixelDifference=await page.evaluate(async ({images,probes})=>{
   const pixels=[];let width,height;
   for(const encoded of images){
    const image=new Image();image.src='data:image/png;base64,'+encoded;await image.decode();
    const canvas=document.createElement('canvas');width=canvas.width=image.width;height=canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);pixels.push(ctx.getImageData(0,0,width,height).data);
   }
   let sum=0,changed=0,target=0,over40=0,brightened=0,max=0;const tiles=new Map();
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,delta=.2126*(pixels[0][i]-pixels[1][i])+.7152*(pixels[0][i+1]-pixels[1][i+1])+.0722*(pixels[0][i+2]-pixels[1][i+2]);
    sum+=delta;max=Math.max(max,delta);if(delta>=1)changed++;if(delta>=15&&delta<=40)target++;if(delta>40)over40++;if(delta< -1)brightened++;
    const key=`${Math.floor(x/32)},${Math.floor(y/32)}`;
    let tile=tiles.get(key);if(!tile){tile={x:Math.floor(x/32)*32,y:Math.floor(y/32)*32,count:0,sum:0,target:0,over40:0};tiles.set(key,tile);}
    tile.count++;tile.sum+=delta;if(delta>=15&&delta<=40)tile.target++;if(delta>40)tile.over40++;
   }
   // 합격 대상(15m 이내, b>=0.3m)을 우선해 24곳 제한에 밀리지 않게 한다.
   const contactRegions=probes.filter(p=>p.visible&&p.inFrame&&p.kind==='rock'&&p.nearDetail).sort((a,b)=>Number(b.distance<=15&&b.baseRadius>=.3)-Number(a.distance<=15&&a.baseRadius>=.3)||a.distance-b.distance).slice(0,24).map(probe=>{
    const cx=Math.round((probe.ndc[0]+1)*width/2),cy=Math.round((1-probe.ndc[1])*height/2);
    const scale=4.5/Math.max(1,probe.distance),bounds=probe.screenBounds;
    const body=bounds?{x:(bounds.minX+1)*width/2,right:(bounds.maxX+1)*width/2,y:(1-bounds.maxY)*height/2,bottom:(1-bounds.minY)*height/2}:null;
    // 12차 ring.mjs의 앞쪽 바닥 범위와 메시 외접 상자 아래 여유를 함께 포함한다.
    const region={x:Math.max(0,Math.floor(Math.min(cx-90*scale,body?body.x-12*scale:cx-24))),y:Math.max(0,Math.floor(cy-30*scale)),
     right:Math.min(width,Math.ceil(Math.max(cx+90*scale,body?body.right+12*scale:cx+24))),bottom:Math.min(height,Math.ceil(Math.max(cy+70*scale,body?body.bottom+32*scale:cy+16)))};
    let count=0,sum=0,max=0,target15to40=0,over40=0,changed=0;
    for(let y=region.y;y<region.bottom;y++)for(let x=region.x;x<region.right;x++){
     const i=(y*width+x)*4,d=.2126*(pixels[0][i]-pixels[1][i])+.7152*(pixels[0][i+1]-pixels[1][i+1])+.0722*(pixels[0][i+2]-pixels[1][i+2]);
     count++;sum+=d;max=Math.max(max,d);if(d>=1)changed++;if(d>=15&&d<=40)target15to40++;if(d>40)over40++;
    }
    return {probe,region,bodyBounds:body,count,mean:count?sum/count:null,max,changed,target15to40,over40};
   });
   const eligible=contactRegions.filter(r=>r.probe.distance<=15&&r.probe.baseRadius>=.3);
   const bands=[[0,.15],[.15,.3],[.3,.4],[.4,Infinity]].map(([min,max])=>{
    const rows=contactRegions.filter(r=>r.probe.baseRadius>=min&&r.probe.baseRadius<max);
    return {baseRadiusMin:min,baseRadiusMax:Number.isFinite(max)?max:null,regions:rows.length,
     regionsWith15to40:rows.filter(r=>r.target15to40>0).length,target15to40:rows.reduce((n,r)=>n+r.target15to40,0),over40:rows.reduce((n,r)=>n+r.over40,0)};
   });
   const roadsideRockContactSummary={bands,nearVisibleLarge:{maxDistance:15,minBaseRadius:.3,regions:eligible.length,
    regionsWith15to40:eligible.filter(r=>r.target15to40>0).length,coverage:eligible.length?eligible.filter(r=>r.target15to40>0).length/eligible.length:null,
    over40:eligible.reduce((n,r)=>n+r.over40,0)},note:'영역 간 중복 화소가 있을 수 있다. 영역 수의 과반과 원본 화면을 함께 확인'};
   return {width,height,mean:sum/(width*height),changed,target15to40:target,over40,brightened,max,roadsideRockContactRegions:contactRegions,roadsideRockContactSummary,
    strongestTiles:[...tiles.values()].map(t=>({...t,mean:t.sum/t.count})).sort((a,b)=>b.mean-a.mean).slice(0,30),
    note:'거리 비례 ring 영역과 바위 외접 상자 아래 바닥을 포함. 몸체·주변 식생·UI 혼입 가능하므로 전후 이미지 대조 필요'};
  },{images:buffers,probes:row.contactProbes});
  row.state=await page.evaluate(()=>({state:hiking.snapshot(),camera:hiking.orientation(),contact:hiking.landscape().contactOcclusion,rendering:hiking.rendering()}));
  results.comparisons.push(row);await context.close();
 }
 // 고정 장면·해상도, 진단만 켠 별도 페이지. 성능 합격 벤치와 혼합하지 않는다.
 for(const mode of ['off','normal','full']){
  const {context,page}=await scene(310,`aoMode=${mode}&aoProfile=1`);
  const start=await page.evaluate(()=>hiking.rendering().aoProfile);
  await page.evaluate(()=>window.__hikingPerformance.reset());await page.waitForTimeout(10000);
  const end=await page.evaluate(()=>({profile:hiking.rendering().aoProfile,performance:window.__hikingPerformance.report(),rendering:hiking.rendering()}));
  if(end.rendering.shaderErrors.length)results.errors.push(`${mode}: ${JSON.stringify(end.rendering.shaderErrors)}`);
  const phases={};
  for(const [name,row]of Object.entries(end.profile.rows)){
   const before=start.rows[name]??{},cpuSamples=row.cpuSamples-(before.cpuSamples??0),gpuSamples=row.gpuSamples-(before.gpuSamples??0);
   phases[name]={cpuSamples,cpuMeanMs:cpuSamples?(row.cpuTotalMs-(before.cpuTotalMs??0))/cpuSamples:null,
    gpuSamples,gpuMeanMs:gpuSamples?(row.gpuTotalMs-(before.gpuTotalMs??0))/gpuSamples:null};
  }
  results.diagnostics.push({mode,start,...end,phases});await context.close();
 }
}finally{await browser.close();await writeFile(`${folder}/results.json`,JSON.stringify(results,null,2));}
if(results.errors.length)throw new Error(results.errors.join('\n'));
