// 릴스 편집: reels-record.mjs가 찍은 장면(artifacts/reels/raw)을 콘티(docs/릴스-콘티.md §1) 순서·길이로 잘라 잇고,
// 0.2초 교차 페이드(훅→산 고르기는 컷), 콘티 자막(§5 규칙: Apple SD Gothic Neo ExtraBold·외곽선 8px·안전 영역 x 64~912 / y 250~1500),
// AI Office 장면, 엔딩 카드(artifacts/reels/ending.png, 0.3초 페이드인 3초)를 붙이고 게임 소리를 그대로 깐다(배경음악 없음).
//   node scripts/reels-edit.mjs [--raw artifacts/reels/raw] [--out artifacts/reels]
// 결과: <out>/gwanak-reels.mp4(1080×1920 30fps H.264 + AAC 48kHz), <out>/cover.png(표지), <out>/edit/(자막 PNG·중간 파일), <out>/reels-timeline.json
// AI Office 앱 화면: <out>/office/ai-office.png(대표 확인을 받은 앱 창 캡처)가 있으면 카드로 얹고, 없으면 AI 직원 카드(글자만)로 대신한다.
import {chromium} from '@playwright/test';
import {readFileSync,writeFileSync,mkdirSync,existsSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';

const argv=process.argv.slice(2),opt={};for(let i=0;i<argv.length;i++)if(argv[i].startsWith('--'))opt[argv[i].slice(2)]=argv[++i];
const raw=opt.raw??'artifacts/reels/raw',out=opt.out??'artifacts/reels',work=`${out}/edit`;
const FFMPEG=['/opt/homebrew/bin/ffmpeg','/usr/local/bin/ffmpeg'].find(existsSync)??'ffmpeg',FFPROBE=FFMPEG.replace(/ffmpeg$/,'ffprobe');
const W=1080,H=1920,FPS=30,XF=.2;
const OFFICE_IMG=`${out}/office/ai-office.png`,ENDING=`${out}/ending.png`;

// 콘티 §1 장면표. raw = 녹화 장면, from = 그 장면 json의 조작 시각(events) 이름, shift = 그 시각에서 더할 초.
// big·small = 자막(큰 글·작은 글). x = 다음 장면으로 넘어갈 때 교차 페이드 길이(0 = 컷).
export const TIMELINE=[
 {id:'hook',raw:'hook',dur:2,from:'in',big:'집에서\n관악산 등산하기',hook:true,x:0},
 {id:'pick',raw:'pick',dur:3,from:'click',shift:-2.5,audio:{raw:'mapbook',at:0},big:'산 고르고 ▶ 오르기',small:'관악산 632m · 5.1km'},
 {id:'entrance',raw:'entrance',dur:3,from:'in',shift:.2,big:'입구 일주문에서 출발',small:'🔊 발소리·새소리'},
 {id:'valley',raw:'valley',dur:3,from:'in',shift:.2,big:'동동이와 계곡 숲길',small:'시점은 1인칭·3인칭'},
 {id:'stairs',raw:'stairs',dur:3,from:'in',shift:.4,big:'깔딱고개 계단도 직접',small:'🔊 숨소리 대신 발소리'},
 // 11-14 대표 지적(산스장 상호작용·쌍안경 남산·롯데타워가 안 보임): 즐길거리는 들르기(2초)+역기 연타~득근 도장(4초), 쌍안경은 남산·롯데 두 컷. 입구·계곡·계단을 1초씩 줄여 40초 유지.
 {id:'autowalk',raw:'autowalk',dur:2,from:'offer',shift:-.9,big:'걷다 보면 즐길거리가',callout:true},
 {id:'gym',raw:'autowalk',dur:4,from:'lift',shift:1,big:'산스장에서 역기 10번',small:'💪 득근 도장 쾅!'},
 {id:'namsan',raw:'bino',dur:2.6,from:'namsan',shift:-.6,big:'쌍안경으로 남산타워'},
 {id:'lotte',raw:'bino',dur:2.4,from:'lotte',shift:-.2,big:'롯데월드타워까지'},
 {id:'mapbook',raw:'mapbook',dur:3,from:'in',shift:.1,big:'지도와 등산 수첩'},
 {id:'multi',raw:'multi',dur:4,from:'hi',shift:-1.6,big:'친구와 함께 걷기',small:'채팅하고 나란히 걷고'},
 {id:'seasons',raw:'seasons',dur:3,from:'in',shift:.05,big:'계절도 시간도 날씨도'},
 {id:'office',raw:'night',dur:2,from:'in',shift:.1,big:'이 게임, AI 직원들이\nAI Office에서 만들었어요',small:'기획·디자인·개발 전부',office:true,x:.3},
 {id:'ending',raw:'night',dur:3,from:'in',shift:2.1,image:ENDING,x:0},
];

function ff(args,label){const r=spawnSync(FFMPEG,['-hide_banner','-loglevel','error','-y',...args],{stdio:['ignore','inherit','inherit']});if(r.status)throw new Error(`ffmpeg 실패(${label})`);}
const probe=f=>+spawnSync(FFPROBE,['-v','error','-show_entries','format=duration','-of','csv=p=0',f]).stdout.toString().trim();
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
// 이모지는 외곽선 없이 이모지 서체로(콘티 §5 이모지 규칙)
const textHTML=s=>esc(s).replace(/((?![\u25B6\u25C0])\p{Extended_Pictographic}\uFE0F?)/gu,'<span class="emo">$1</span>').replace(/\n/g,'<br>');

// ─── 자막·카드 그리기(투명 PNG 1080×1920) ───
// 바깥선 8px #2b1d0a: 글자 그림자를 둥글게 여러 겹 둘러 그린다(HTML 글자의 -webkit-text-stroke는 안쪽까지 먹어 얇아 보임).
const RING=[8,5.5,3].flatMap(r=>Array.from({length:r>5?32:16},(_,i)=>{const a=i/(r>5?32:16)*2*Math.PI;return `${(r*Math.cos(a)).toFixed(2)}px ${(r*Math.sin(a)).toFixed(2)}px 0 #2b1d0a`;})).join(',');
const CSS=`:root{--ring:${RING}}*{margin:0;padding:0;box-sizing:border-box}html,body{width:${W}px;height:${H}px;background:transparent;overflow:hidden}
body{font-family:'Apple SD Gothic Neo','Pretendard',sans-serif;color:#fff8e6;-webkit-font-smoothing:antialiased}
.cap{position:absolute;left:64px;width:848px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:16px}
.cap .b,.cap .s{text-shadow:var(--ring);filter:drop-shadow(0 4px 8px rgba(0,0,0,.4));white-space:nowrap}
.cap .b{font-weight:800;font-size:76px;line-height:1.2;letter-spacing:-1px}.cap .s{font-weight:500;font-size:44px;line-height:1.25}
.cap.hook .b{font-size:96px}
.emo{font-family:'Apple Color Emoji';text-shadow:none}
.hl{color:#ffd86b}
.office{position:absolute;left:50%;transform:translateX(-50%);top:280px;border-radius:28px;overflow:hidden;background:#fbf3df;box-shadow:0 18px 50px rgba(0,0,0,.55);border:6px solid #fbf3df}
.office img{display:block;height:880px;width:auto;max-width:808px;object-fit:cover;object-position:top}
.staff{position:absolute;left:104px;top:360px;width:768px;padding:44px 40px 40px;border-radius:30px;background:#fbf3df;color:#4a3618;box-shadow:0 18px 50px rgba(0,0,0,.5)}
.staff h3{font-size:54px;font-weight:800;color:#2f6b4a;margin-bottom:6px}.staff p{font-size:32px;font-weight:600;color:#7a6440;margin-bottom:26px}
.staff ul{list-style:none;display:grid;grid-template-columns:1fr 1fr;gap:16px 18px}.staff li{background:#fff;border:3px solid #e6d6ae;border-radius:18px;padding:16px 18px;font-size:34px;font-weight:800}
.staff li small{display:block;font-size:26px;font-weight:600;color:#8a7350;margin-top:2px}
.callout{position:absolute;border-radius:22px;box-shadow:0 0 0 6px #ffd86b,0 14px 34px rgba(0,0,0,.5)}`;
async function renderPNGs(page,items){
 for(const it of items){
  await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>${CSS}</style></head><body>${it.html}</body></html>`);
  await page.evaluate(()=>Promise.all([document.fonts.ready,...[...document.images].map(i=>i.decode().catch(()=>{}))]));
  // 긴 줄은 안전 가로 폭(848px) 안으로 글자 크기를 줄인다.
  await page.evaluate(()=>{for(const el of document.querySelectorAll('.cap .b,.cap .s')){let fs=parseFloat(getComputedStyle(el).fontSize);while(el.scrollWidth>848&&fs>30){fs-=2;el.style.fontSize=fs+'px';}}});
  if(it.anchorBottom)await page.evaluate(y=>{const c=document.querySelector('.cap');c.style.top=(y-c.offsetHeight)+'px';},it.anchorBottom);
  it.box=await page.evaluate(()=>{const c=document.querySelector('.cap');if(!c)return null;const r=c.getBoundingClientRect(),inner=[...c.children].map(e=>e.getBoundingClientRect());return {x:Math.min(...inner.map(r=>r.x)),y:r.y,w:Math.max(...inner.map(r=>r.right))-Math.min(...inner.map(r=>r.x)),h:r.height};});
  await page.screenshot({path:it.file,omitBackground:true});
 }
}
const capHTML=(sc)=>`<div class="cap${sc.hook?' hook':''}"${sc.hook?' style="top:300px"':''}><div class="b">${textHTML(sc.big)}</div>${sc.small?`<div class="s">${textHTML(sc.small)}</div>`:''}</div>`;
function officeHTML(){
 // setContent 페이지(about:blank)는 file:// 그림을 못 읽으므로 data URL로 넣는다. 세로 캡처도 자막(y≈1250~) 위에서 끝나게 높이 880px로 맞춘다.
 if(existsSync(OFFICE_IMG))return `<div class="office"><img src="data:image/png;base64,${readFileSync(OFFICE_IMG).toString('base64')}"></div>`;
 return `<div class="staff"><h3>🏢 AI Office</h3><p>온라인 등산 랩 · AI 직원 5명</p><ul>
<li>산기획<small>기획·검수</small></li><li>산디자인<small>화면·자막</small></li><li>산개발<small>엔진·걷기</small></li><li>산풍경<small>지형·숲·하늘</small></li><li>산리서치<small>자료·출처</small></li><li>대표<small>결정·확인</small></li></ul></div>`;
}

// ─── 장면 자르기 ───
function cutScene(sc,i,next){
 const len=sc.dur+(next?(next.x??XF)||1/FPS:0),meta=JSON.parse(readFileSync(`${raw}/${sc.raw}.json`,'utf8'));
 const at=meta.events[sc.from];if(at===undefined)throw new Error(`${sc.raw}.json에 ${sc.from} 시각 없음`);
 const start=Math.max(0,at+(sc.shift??0));if(start+len>meta.seconds+.05)throw new Error(`${sc.id}: 녹화가 짧음(${meta.seconds}s < ${(start+len).toFixed(2)}s)`);
 const v=`${work}/${String(i).padStart(2,'0')}-${sc.id}.mp4`,a=`${work}/${String(i).padStart(2,'0')}-${sc.id}.wav`;
 let vf=`trim=start=${start.toFixed(3)}:duration=${len.toFixed(3)},setpts=PTS-STARTPTS,fps=${FPS},scale=${W}:${H},format=yuv420p`;
 if(sc.image)ff(['-loop','1','-framerate',String(FPS),'-t',len.toFixed(3),'-i',sc.image,'-vf',`scale=${W}:${H},format=yuv420p`,'-c:v','libx264','-crf','12','-preset','fast',v],sc.id);
 else if(sc.office)ff(['-i',`${raw}/${sc.raw}.mp4`,'-vf',vf+',eq=brightness=-.08:saturation=.85','-c:v','libx264','-crf','12','-preset','fast',v],sc.id);
 else if(sc.callout&&meta.callout&&(meta.callout.y+meta.callout.h)*3>1500){
  // 즐길거리 버튼이 인스타 아래 캡션 영역에 들어가면 버튼을 오려 1.4배로 y≈1300에 띄운다(콘티 §5).
  const c=meta.callout,pad=6,cx=Math.round((c.x-pad)*3),cy=Math.round((c.y-pad)*3),cw=Math.round((c.w+pad*2)*3),ch=Math.round((c.h+pad*2)*3),sw=Math.round(cw*1.4/2)*2,sh=Math.round(ch*1.4/2)*2;
  const on=Math.max(0,meta.events.offer-start);
  ff(['-i',`${raw}/${sc.raw}.mp4`,'-filter_complex',`[0:v]${vf},split[a][b];[b]crop=${cw}:${ch}:${cx}:${cy},scale=${sw}:${sh}[c];[a][c]overlay=x=${Math.round(488-sw/2)}:y=${1300-sh}:enable='gte(t,${on.toFixed(2)})'`,'-c:v','libx264','-crf','12','-preset','fast',v],sc.id);
 }else ff(['-i',`${raw}/${sc.raw}.mp4`,'-vf',vf,'-c:v','libx264','-crf','12','-preset','fast',v],sc.id);
 // 산 고르기 화면은 아직 소리가 켜지기 전이라 비어 있다 → 다른 장면의 환경음(서 있는 계곡 숲)을 깐다.
 const aSrc=sc.audio?`${raw}/${sc.audio.raw}.wav`:`${raw}/${sc.raw}.wav`,aStart=sc.audio?sc.audio.at:start;
 ff(['-i',aSrc,'-af',`atrim=start=${aStart.toFixed(3)}:duration=${len.toFixed(3)},asetpts=PTS-STARTPTS,aresample=48000`,'-ac','2',a],sc.id+' 소리');
 return {...sc,v,a,len,rawStart:+start.toFixed(3),errors:meta.errors?.length??0,captureFps:meta.captureFps};
}

if(import.meta.url===`file://${process.argv[1]}`){
 rmSync(work,{recursive:true,force:true});mkdirSync(work,{recursive:true});
 // 1) 자막·카드 PNG
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
 const pngs=[];
 TIMELINE.forEach((sc,i)=>{if(sc.big)pngs.push({sc,file:`${work}/cap-${String(i).padStart(2,'0')}-${sc.id}.png`,html:capHTML(sc),anchorBottom:sc.hook?null:1480});if(sc.office)pngs.push({sc,file:`${work}/office-card.png`,html:officeHTML(),card:true});});
 await renderPNGs(page,pngs);await browser.close();
 for(const p of pngs.filter(p=>p.box)){const b=p.box;if(b.x<63.5||b.x+b.w>912.5||b.y<249.5||b.y+b.h>1500.5)throw new Error(`자막이 안전 영역 밖: ${p.sc.id} ${JSON.stringify(b)}`);}

 // 2) 장면 자르기
 const clips=TIMELINE.map((sc,i)=>cutScene(sc,i,TIMELINE[i+1]));
 let t=0;for(const c of clips){c.start=+t.toFixed(3);t+=c.dur;}const total=t;

 // 3) 잇기: 화면은 xfade, 소리는 acrossfade(같은 길이만큼 겹침) → 길이 = 장면 길이 합
 const inputs=[];clips.forEach(c=>inputs.push('-i',c.v));clips.forEach(c=>inputs.push('-i',c.a));
 const n=clips.length,fc=[];let vPrev='[0:v]',aPrev=`[${n}:a]`;
 for(let i=1;i<n;i++){const x=(clips[i-1].len-clips[i-1].dur)||1/FPS,trans=clips[i-1].x===0?'fade':'fade';
  fc.push(`${vPrev}[${i}:v]xfade=transition=${trans}:duration=${x.toFixed(4)}:offset=${clips[i].start.toFixed(4)}[v${i}]`);vPrev=`[v${i}]`;
  fc.push(`${aPrev}[${n+i}:a]acrossfade=d=${x.toFixed(4)}:c1=tri:c2=tri[a${i}]`);aPrev=`[a${i}]`;}
 // 4) 자막·카드 얹기(장면 시작 0.2초 뒤 나타나 끝 0.2초 전에 사라짐, 페이드 0.15초. 훅은 0.1초에 위에서 툭 떨어짐)
 let cur=vPrev,k=0;const capInputs=[];
 for(const p of pngs){const c=clips.find(c=>c.id===p.sc.id),idx=2*n+capInputs.length/6;
  const s=p.sc.hook?.1:c.start+(p.card?.05:.2),e=c.start+c.dur-(p.card?.0:.2),d=+(e-s).toFixed(3);
  capInputs.push('-loop','1','-t',d.toFixed(3),'-i',p.file);
  const y=p.sc.hook?`'-150*pow(max(0,1-t/0.35),3)'`:'0';
  fc.push(`[${idx}:v]format=rgba,fade=t=in:st=0:d=${p.sc.hook?'0.12':'0.15'}:alpha=1,fade=t=out:st=${(d-.15).toFixed(3)}:d=0.15:alpha=1,setpts=PTS+${s.toFixed(3)}/TB[c${k}]`);
  fc.push(`${cur}[c${k}]overlay=x=0:y=${y}:eof_action=pass:format=auto[o${k}]`);cur=`[o${k}]`;k++;}
 fc.push(`${cur}format=yuv420p[vout]`);
 // 소리: 장면마다 크기가 달라(정지 장면은 환경음만) 전체를 -16 LUFS로 맞추고, 끝 1.2초는 줄인다.
 fc.push(`${aPrev}loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=out:st=${(total-1.2).toFixed(2)}:d=1.2,aresample=48000[aout]`);
 const mp4=`${out}/gwanak-reels.mp4`;
 ff([...inputs,...capInputs,'-filter_complex',fc.join(';'),'-map','[vout]','-map','[aout]','-t',total.toFixed(3),'-r',String(FPS),
  '-c:v','libx264','-profile:v','high','-level','4.1','-preset','slow','-crf','17','-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart',mp4],'최종');
 // 5) 표지: 훅 장면(문구가 자리 잡은 1.4초)
 ff(['-ss','1.4','-i',mp4,'-frames:v','1',`${out}/cover.png`],'표지');
 const dur=probe(mp4);
 const timeline={file:mp4,seconds:+dur.toFixed(2),size:`${W}x${H}`,fps:FPS,office:existsSync(OFFICE_IMG)?'앱 화면 캡처':'AI 직원 카드(앱 캡처 없음)',
  scenes:clips.map(c=>({id:c.id,from:c.start,to:+(c.start+c.dur).toFixed(2),raw:c.raw,rawStart:c.rawStart,big:c.big??null,small:c.small??null,captureFps:c.captureFps,consoleErrors:c.errors}))};
 writeFileSync(`${out}/reels-timeline.json`,JSON.stringify(timeline,null,1));
 console.log(`✔ ${mp4} ${dur.toFixed(2)}초 · 장면 ${clips.length}개 · 표지 ${out}/cover.png`);
}
