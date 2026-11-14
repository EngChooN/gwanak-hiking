// 흡연장 릴스 편집(연개발, 2026-11-11). record-reels-smoking.mjs가 찍은 장면(raw/)을 shots.json의 clip대로 잘라 콘티 순서로 잇고,
// reels-overlay.html(연디자인)로 자막·엔딩 카드·표지를 입혀 크롬 안 canvas + MediaRecorder('video/mp4;codecs=avc1')로 한 파일을 만든다.
// ffmpeg 없이 돈다(있으면 확인용 ffprobe 값만 덧붙임). 장면 사이는 컷(소리는 12ms만 이어 붙여 딸깍 소리를 막음), 배경 음악 없음.
//   node scripts/promo/edit-reels.mjs [--url 접속주소] [--check-only(이미 만든 영상의 확인·장면 캡처만 다시)]
// 결과: artifacts/reels-smoking-2026-11-11/online-smoking-reels.mp4(1080×1920, 30fps, H.264 + AAC) — MP4를 못 만들면 .webm
//       cover.png(1080×1920), frames/scene-0~9.png(완성 영상에서 장면마다 1장)·check-*.png(점검용: 첫 0.1초·마지막·장면 3 링·5a~5c·6 네 시간대·7), frames/contact-sheet.png, edit/(자막 PNG), reels-timeline.json
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync,existsSync,statSync,createReadStream} from 'node:fs';
import {resolve,extname,sep} from 'node:path';
import {spawnSync} from 'node:child_process';

const argv=process.argv.slice(2),opt={},checkOnly=argv.includes('--check-only');for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--')&&argv[i]!=='--check-only')opt[argv[i].slice(2)]=argv[++i];
const DIR='artifacts/reels-smoking-2026-11-11',RAW=`${DIR}/raw`,WORK=`${DIR}/edit`,FRAMES=`${DIR}/frames`;
// 엔딩 접속 주소: 공개 GitHub Pages의 흡연장 주소(서버 주소 아님). 대표가 다른 주소를 고르면 --url로 바꾼다.
const URL_TEXT=opt.url??'engchoon.github.io/gwanak-hiking/smoking/';
const W=1080,H=1920,FPS=30,ENDING_SEC=4.5,LEAD=.15;
// 연공간 결정(장면 4 = NPC 대신 같이 피우기 인사)에 맞춰 바꾼 자막. 나머지 자막은 reels-overlay.html 장면 표 그대로.
const CAP_OVERRIDE={}; // 11-13: 장면 4 자막은 reels-overlay.html 기본값으로 옮겨져 덮어쓰기 없음
// 장면 6 칩: shots.json 장면 6 actions(0·1.25·2.5·3.75초 scene.set)와 같은 시각에 켠다.
const CHIP_AT=[[0,'morning'],[1.25,'lunch'],[2.5,'evening'],[3.75,'afterparty']];
// 장면 1(입장 카드): 자막 띠 자리(y 1220~1480)가 카드의 '옷 고르기' 단추를 덮는다 → 이 장면만 띠를 235px 올려 '금연 시작일·하루 몇 갑' 줄 위에 둔다.
// 장면 3(꿀모금·묘기): 띠 아래(1480)가 묘기 단추 윗부분(약 1450)을 덮는다 → 70px 올려 단추가 다 보이게(11-13 점검표).
const CAP_DY={1:-235,3:-70};
mkdirSync(WORK,{recursive:true});mkdirSync(FRAMES,{recursive:true});

// ── 1. 시간표 ──
const SH=JSON.parse(readFileSync('scripts/promo/shots.json','utf8'));
const meta=Object.fromEntries(SH.shots.map(s=>{const f=`${RAW}/${s.key}.json`;if(!existsSync(f))throw new Error(`녹화 없음: ${f} (먼저 record-reels-smoking.mjs)`);return [s.key,JSON.parse(readFileSync(f,'utf8'))];}));
const pieces=[];let at=0;
for(const s of SH.shots)for(const [from,len] of s.clip){pieces.push({key:s.key,scene:s.scene,at,from,dur:len/1000});at+=len/1000;}
const end8=Math.max(...SH.shots.find(s=>s.key==='8').clip.map(([a,l])=>a+l));
pieces.push({key:null,scene:9,at,dur:ENDING_SEC,audioKey:'8',audioFrom:end8});at+=ENDING_SEC;
const TOTAL=at,N=Math.round(TOTAL*FPS);
const sceneStart={};for(const p of pieces)sceneStart[p.scene]??=p.at;

// 출력 프레임마다: 어떤 원본 JPEG(또는 엔딩 카드)를 그리고 어떤 자막을 얹을지
const frameOf=(key,ms)=>{const fr=meta[key].frames;let lo=0,hi=fr.length-1;if(ms<=fr[0])return 0;while(lo<hi){const m=(lo+hi+1)>>1;if(fr[m]<=ms)lo=m;else hi=m-1;}return lo;};
const frames=[];
for(let i=0;i<N;i++){const t=i/FPS,p=pieces.findLast(p=>p.at<=t+1e-6);
 if(p.scene===9){frames.push({full:'ending'});continue;}
 const ms=p.from+(t-p.at)*1000,ts=t-sceneStart[p.scene];
 const ov=p.scene===6?`cap-6-${CHIP_AT.findLast(([s])=>s<=ts+1e-6)[1]}`:`cap-${p.scene}`;
 frames.push({src:`/${RAW}/${p.key}/${String(frameOf(p.key,ms)).padStart(5,'0')}.jpg`,ov,dy:CAP_DY[p.scene]??0,a:p.scene===0?1:Math.min(1,(ts*FPS+1)/5)}); // 자막은 장면 처음 5프레임 동안 나타남. 장면 0은 첫 프레임(인스타 미리보기)부터 안내 띠가 다 보이게 바로 보임
}
// 소리: 조각마다 그 장면 녹음의 같은 구간(녹음 시작 = 시점 0 + audioOffsetMs)
const audio=[];
for(const p of pieces){const key=p.audioKey??p.key,m=meta[key];if(!m.audio)continue;
 const from=p.audioFrom??p.from;audio.push({key,at:p.at,off:(from-m.audioOffsetMs)/1000,dur:p.dur,fadeOut:p.scene===9?1.6:.012});}
const audioKeys=[...new Set(audio.map(a=>a.key))],silent=SH.shots.filter(s=>!meta[s.key].audio).map(s=>s.key);

// ── 2. 정적 파일 서버(저장소 폴더만, 편집 페이지와 오버레이 HTML이 같은 출처에서 읽게) ──
const ROOT=resolve('.'),MIME={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webm':'audio/webm','.mp4':'video/mp4','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{const path=decodeURIComponent(new URL(req.url,'http://x').pathname);
 if(path==='/__edit'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end('<!doctype html><meta charset="utf-8"><body style="margin:0;background:#000">');}
 const file=resolve(ROOT,'.'+path);if(!file.startsWith(ROOT+sep)||!existsSync(file)||!statSync(file).isFile()){res.writeHead(404);return res.end();}
 const size=statSync(file).size,type=MIME[extname(file)]??'application/octet-stream',m=/bytes=(\d*)-(\d*)/.exec(req.headers.range??'');
 if(m){const a=m[1]?+m[1]:size-+m[2],b=m[1]&&m[2]?+m[2]:size-1; // 영상 되감기(seek)용 부분 요청
  res.writeHead(206,{'content-type':type,'accept-ranges':'bytes','content-range':`bytes ${a}-${b}/${size}`,'content-length':b-a+1});return createReadStream(file,{start:a,end:b}).pipe(res);}
 res.writeHead(200,{'content-type':type,'accept-ranges':'bytes','content-length':size});createReadStream(file).pipe(res);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const ORIGIN=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});

try{
 let mime='video/mp4',ext=existsSync(`${DIR}/online-smoking-reels.mp4`)?'mp4':'webm',outFile=`${DIR}/online-smoking-reels.${ext}`,stats={late:null};
 if(!checkOnly){
 // ── 3. 자막·엔딩·표지 PNG (reels-overlay.html, 투명 배경) ──
 const op=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
 await op.goto(`${ORIGIN}/scripts/promo/reels-overlay.html`);await op.waitForFunction(()=>window.reelsOverlay);
 const shoot=async(name,o,transparent=true)=>{await op.evaluate(o=>window.reelsOverlay.show(o),o);await op.waitForSelector('body[data-ready="1"]');
  // 엔딩 주소 칸은 글자마다 끊기므로(word-break:break-all) 도메인 뒤 '/'에서 줄을 바꾼다
  if(o.mode==='ending')await op.evaluate(()=>{const u=document.querySelector('.end .url'),t=u?.lastChild;if(t?.nodeType!==3)return;const i=t.data.indexOf('/');if(i<0||i===t.data.length-1)return;
   t.replaceWith(t.data.slice(0,i+1),document.createElement('br'),t.data.slice(i+1));});
  await op.waitForTimeout(80);await op.screenshot({path:`${WORK}/${name}.png`,omitBackground:transparent});return `/${WORK}/${name}.png`;};
 const overlays={};
 for(let n=0;n<=8;n++){if(n===6){for(const [,hl] of CHIP_AT)overlays[`cap-6-${hl}`]=await shoot(`cap-6-${hl}`,{scene:6,hl});continue;}
  overlays[`cap-${n}`]=await shoot(`cap-${n}`,{scene:n,...(CAP_OVERRIDE[n]?{cap:CAP_OVERRIDE[n]}:{})});}
 overlays.ending=await shoot('ending',{scene:9,mode:'ending',url:URL_TEXT},false);
 // 표지: 장면 3(점심, 꿀모금) 프레임 위에 표지 카드
 const coverBg=`/${RAW}/3/${String(frameOf('3',900)).padStart(5,'0')}.jpg`;
 await shoot('cover',{mode:'cover',bg:coverBg},false);
 writeFileSync(`${DIR}/cover.png`,readFileSync(`${WORK}/cover.png`));
 await op.close();
 console.log(`자막·엔딩·표지 PNG ${Object.keys(overlays).length+1}장 → ${WORK}`);

 // ── 4. 크롬 안에서 이어 붙이기·녹화 ──
 const ep=await browser.newPage({viewport:{width:640,height:480},acceptDownloads:true});
 ep.on('console',m=>{if(m.type()==='error'||m.text().startsWith('[편집]'))console.log('  편집 페이지:',m.text());});
 await ep.goto(`${ORIGIN}/__edit`);
 mime=await ep.evaluate(()=>['video/mp4;codecs=avc1.640028,mp4a.40.2','video/mp4;codecs=avc1,mp4a.40.2','video/webm;codecs=vp9,opus'].find(t=>MediaRecorder.isTypeSupported(t)));
 ext=mime.startsWith('video/mp4')?'mp4':'webm';outFile=`${DIR}/online-smoking-reels.${ext}`;
 console.log(`편집 시작: ${TOTAL.toFixed(2)}초 · ${N}프레임 · ${mime} (실시간으로 녹화하므로 약 ${Math.ceil(TOTAL)}초 걸림)`);
 const dl=ep.waitForEvent('download',{timeout:(TOTAL+120)*1000});
 stats=await ep.evaluate(async plan=>{
  const {W,H,FPS,frames,audio,mime,LEAD}=plan;
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;cv.style.width='270px';document.body.appendChild(cv);
  const g=cv.getContext('2d');
  const ac=new AudioContext({sampleRate:48000});await ac.resume();
  const dest=ac.createMediaStreamDestination();
  // 게임 소리 그대로 잇되, 지포·꿀모금·캔 따기 순간이 0dBFS를 넘어(+4dB) 찢어지지 않게 끝단에만 리미터를 건다(배경 음악 없음)
  const lim=ac.createDynamicsCompressor();lim.threshold.value=-6;lim.knee.value=3;lim.ratio.value=20;lim.attack.value=.002;lim.release.value=.12;
  const master=ac.createGain();master.gain.value=.85;master.connect(lim).connect(dest);
  console.log('[편집] 소리 풀기');const bufs={};for(const k of plan.audioKeys)bufs[k]=await ac.decodeAudioData(await (await fetch(`/${plan.RAW}/${k}.webm`)).arrayBuffer());
  const ov={};for(const [n,u] of Object.entries(plan.overlays))ov[n]=await createImageBitmap(await (await fetch(u)).blob());
  const cache=new Map(),load=u=>{if(!cache.has(u))cache.set(u,fetch(u).then(r=>r.blob()).then(b=>createImageBitmap(b)));return cache.get(u);};
  console.log('[편집] 그림 준비');const AHEAD=45;for(let i=0;i<Math.min(AHEAD,frames.length);i++)if(frames[i].src)load(frames[i].src);
  await Promise.all([...cache.values()]);
  const track=cv.captureStream(0).getVideoTracks()[0];
  const rec=new MediaRecorder(new MediaStream([track,...dest.stream.getAudioTracks()]),{mimeType:mime,videoBitsPerSecond:12e6,audioBitsPerSecond:192000});
  const chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
  const draw=async i=>{const f=frames[i];
   if(f.src)g.drawImage(await load(f.src),0,0,W,H);else g.drawImage(ov[f.full],0,0,W,H);
   if(f.ov){g.globalAlpha=f.a;g.drawImage(ov[f.ov],0,f.dy);g.globalAlpha=1;}};
  await draw(0);console.log('[편집] 녹화 시작');
  // MP4 녹화기는 start 이벤트를 늦게 낸다 → 기다리지 않고 바로 시간표를 시작한다(기다리면 그동안 정지 화면이 앞에 붙음).
  // timeslice 없이 한 덩어리로 받는다(1초 조각으로 받으면 크롬이 길이를 첫 조각들만으로 읽음).
  rec.start();track.requestFrame();console.log('[편집] 녹화 시작됨',rec.state);
  const tA=ac.currentTime+LEAD,tV=performance.now()+LEAD*1000;
  for(const a of audio){const src=ac.createBufferSource(),gn=ac.createGain();src.buffer=bufs[a.key];src.connect(gn).connect(master);
   let w=tA+a.at,o=a.off,d=a.dur;if(o<0){w-=o;d+=o;o=0;}d=Math.min(d,src.buffer.duration-o);if(d<=.03)continue;
   gn.gain.setValueAtTime(0,w);gn.gain.linearRampToValueAtTime(1,w+.012);gn.gain.setValueAtTime(1,w+d-a.fadeOut);gn.gain.linearRampToValueAtTime(0,w+d);src.start(w,o,d);}
  let late=0,maxLate=0;
  for(let i=0;i<frames.length;i++){
   const j=i+AHEAD;if(j<frames.length&&frames[j].src)load(frames[j].src);
   await draw(i);
   const wait=tV+i*1000/FPS-performance.now();
   if(wait>0)await new Promise(r=>setTimeout(r,wait));else{late++;maxLate=Math.max(maxLate,-wait);}
   track.requestFrame();if(i%150===0)console.log('[편집] 프레임',i,Math.round(performance.now()-tV));
   const old=frames[i-2]?.src;if(old&&old!==frames[i-1]?.src&&old!==frames[i].src&&cache.has(old)){cache.get(old).then(b=>b.close());cache.delete(old);}
  }
  await new Promise(r=>setTimeout(r,1000/FPS+60)); // 마지막 프레임이 들어갈 만큼만 기다림(11-11엔 +250ms라 끝에 엔딩 정지 화면이 0.3초 더 붙음)
  console.log('[편집] 멈추기');await new Promise(r=>{rec.onstop=r;rec.stop();});console.log('[편집] 멈춤',chunks.length);
  const blob=new Blob(chunks,{type:mime.split(';')[0]});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=plan.name;document.body.appendChild(a);a.click();
  return {late,maxLate:Math.round(maxLate),bytes:blob.size};
 },{W,H,FPS,frames,audio,audioKeys,overlays,mime,LEAD,RAW,name:`online-smoking-reels.${ext}`});
 await (await dl).saveAs(outFile);
 console.log(`✔ ${outFile} · ${(stats.bytes/1e6).toFixed(1)}MB · 늦은 프레임 ${stats.late}개(가장 늦은 ${stats.maxLate}ms)`);
 await ep.close();
 }

 // ── 5. 확인: 크롬에서 다시 열어 크기·길이를 재고, 장면마다 1장 + 점검용 프레임(11-13 점검표)을 뽑는다 ──
 const vp=await browser.newPage({viewport:{width:640,height:480}});
 await vp.goto(`${ORIGIN}/__edit`);
 const picks=Object.entries(sceneStart).map(([n,s])=>{const e=n==='9'?TOTAL:sceneStart[+n+1];return [`scene-${n}`,+(s+(e-s)*(n==='0'?.75:.6)).toFixed(2),`장면 ${n}`];}); // 장면 0은 뿌옇게 된 뒤
 const mid=key=>{const p=pieces.find(p=>p.key===key);return +(p.at+p.dur/2).toFixed(2);};
 picks.push(['check-first',.1,'첫 0.1초'],['check-last','last','마지막'],
  ...[1.8,2.4,3.0].map((o,i)=>[`check-3-ring-${i+1}`,+(sceneStart[3]+o).toFixed(2),`3 도넛 링 ${i+1}`]), // shots.json 장면 3: 링 0.9·1.9·2.5초 탭(clip 0부터)
  ['check-5a',mid('5a'),'5a 벤치'],['check-5b',mid('5b'),'5b 난간'],['check-5c',mid('5c'),'5c 캔커피'],
  ...CHIP_AT.map(([o,hl])=>[`check-6-${hl}`,+(sceneStart[6]+o+.6).toFixed(2),`6 ${hl}`]),
  ...pieces.filter(p=>p.key==='7').map((p,i)=>[`check-7-${'ab'[i]}`,+(p.at+p.dur*.6).toFixed(2),`7 말풍선 ${'ab'[i]}`]));
 const check=await vp.evaluate(async({src,picks,W,H})=>{
  const v=document.createElement('video');v.muted=true;v.preload='auto';v.src=src;document.body.appendChild(v);
  await new Promise((ok,no)=>{v.onloadeddata=ok;v.onerror=()=>no(new Error('영상 열기 실패'));});
  if(!isFinite(v.duration)){v.currentTime=1e6;await Promise.race([new Promise(r=>v.ondurationchange=r),new Promise(r=>setTimeout(r,5000))]);} // 길이 정보가 없는 파일 대비
  const info={width:v.videoWidth,height:v.videoHeight,duration:+v.duration.toFixed(3)},shots={},at={};
  const cv=document.createElement('canvas');cv.width=W;cv.height=H;const g=cv.getContext('2d');
  const cols=6,tw=216,th=384,sheet=document.createElement('canvas');sheet.width=tw*cols;sheet.height=Math.ceil(picks.length/cols)*(th+30);
  const sg=sheet.getContext('2d');sg.fillStyle='#222';sg.fillRect(0,0,sheet.width,sheet.height);
  for(const [k,[name,t0,label]] of picks.entries()){const t=t0==='last'?Math.max(0,v.duration-.02):t0;
   v.currentTime=t;await new Promise(r=>v.onseeked=r);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   g.drawImage(v,0,0,W,H);shots[name]=cv.toDataURL('image/png');at[name]=+t.toFixed(3);
   const x=(k%cols)*tw,y=Math.floor(k/cols)*(th+30);sg.drawImage(cv,x,y+30,tw,th);sg.fillStyle='#fff';sg.font='bold 18px sans-serif';sg.fillText(`${label} · ${t.toFixed(2)}s`,x+6,y+22);}
  return {info,shots,at,sheet:sheet.toDataURL('image/png')};
 },{src:`/${outFile}`,picks,W,H});
 for(const [n,d] of Object.entries(check.shots))writeFileSync(`${FRAMES}/${n}.png`,Buffer.from(d.split(',')[1],'base64'));
 writeFileSync(`${FRAMES}/contact-sheet.png`,Buffer.from(check.sheet.split(',')[1],'base64'));
 await vp.close();
 // ffprobe가 있으면 파일 정보도 적는다(없어도 됨)
 const FFPROBE=['/opt/homebrew/bin/ffprobe','/usr/local/bin/ffprobe'].find(existsSync);let probe=null;
 if(FFPROBE){const r=spawnSync(FFPROBE,['-v','error','-show_entries','format=duration,size,bit_rate:stream=codec_type,codec_name,profile,width,height,r_frame_rate,avg_frame_rate,nb_frames,sample_rate,channels','-of','json',outFile],{encoding:'utf8'});try{probe=JSON.parse(r.stdout);}catch{}}
 const timeline={file:outFile,mime,url:URL_TEXT,total:+TOTAL.toFixed(3),fps:FPS,size:[W,H],chrome:check.info,ffprobe:probe,lateFrames:stats.late,silentShots:silent,
  scenes:Object.entries(sceneStart).map(([n,s])=>({scene:+n,start:+s.toFixed(3),end:+(n==='9'?TOTAL:sceneStart[+n+1]).toFixed(3),frame:`frames/scene-${n}.png`})),checkFrames:check.at,
  pieces:pieces.map(p=>({scene:p.scene,key:p.key,at:+p.at.toFixed(3),from:p.from??null,dur:p.dur})),captionOverride:CAP_OVERRIDE};
 writeFileSync(`${DIR}/reels-timeline.json`,JSON.stringify(timeline,null,1));
 console.log('크롬에서 다시 연 결과',JSON.stringify(check.info));
 if(probe)console.log('ffprobe',JSON.stringify(probe));
 if(silent.length)console.log('소리 없는 장면:',silent.join(','));
 if(ext!=='mp4')console.log(`MP4를 못 만들어 webm으로 저장했습니다. 변환: brew install ffmpeg 뒤\n  ffmpeg -i ${outFile} -c:v libx264 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -movflags +faststart ${DIR}/online-smoking-reels.mp4`);
}finally{await browser.close();server.close();}
