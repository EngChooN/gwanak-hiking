// 관악산 FM 라디오 시험(2026-11-08): 외부 접속 규칙, 다이얼 → 방송·잡음 계산, manifest(14개 파일·크레딧), 95.5 멘트 고르기, 화면 글자.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {STATIONS,FM_CHANNELS,EXTERNAL_LINKS,FREQ_MIN,FREQ_MAX,clarityAt,mixAt,snapFreq,clampFreq,nearestStation,receptionLabel} from '../src/radio-stations.js';
import {validateManifest,playlistAt,natureLayers,trackLabel,creditBlocks,guideCandidates,pickGuideLine,captionSeconds,MANIFEST_FILE} from '../src/radio-tracks.js';
import {loadRadio,chipText,displayModel,RADIO_SAVE_KEY} from '../src/radio-ui.js';

const manifest=JSON.parse(readFileSync(MANIFEST_FILE,'utf8'));
const near=(a,b,e=1e-9)=>Math.abs(a-b)<=e;
const walk=d=>readdirSync(d).flatMap(n=>{const p=join(d,n);return statSync(p).isDirectory()?walk(p):[p];});

test('실제 방송은 앱이 재생하지 않는다(STATIONS 빈 배열), 링크는 3개·https',()=>{
 assert.deepEqual(STATIONS,[]);
 assert.deepEqual(EXTERNAL_LINKS.map(l=>l.name),['CBS 음악FM','CBS 표준FM','MBC mini']);
 for(const l of EXTERNAL_LINKS)assert.match(l.url,/^https:\/\//);
});
test('방송사 주소는 src/radio-stations.js 밖에 없다(라이선스 링크는 manifest에만)',()=>{
 const hosts=/cbs\.co\.kr|imbc\.com|kbs\.co\.kr|sbs\.co\.kr|ebs\.co\.kr|tbs\.seoul|igbs\.kr|arirang\.com|somafm\.com/i;
 const bad=walk('src').filter(f=>/\.(js|css|html|json)$/.test(f)&&!f.endsWith('radio-stations.js')&&hosts.test(readFileSync(f,'utf8')));
 assert.deepEqual(bad,[]);
 assert.ok(!hosts.test(readFileSync(MANIFEST_FILE,'utf8')));
});
test('라디오 코드는 외부 주소로 fetch·<audio>·iframe을 만들지 않는다',()=>{
 for(const f of ['src/radio-audio.js','src/radio-ui.js','src/radio-tracks.js']){
  const s=readFileSync(f,'utf8');
  assert.ok(!/iframe/i.test(s.replace(/iframe 금지|iframe이나|iframe 요청/g,'')),`${f}: iframe`);
  assert.ok(!/fetch\(\s*['"`]https?:/.test(s),`${f}: 외부 fetch`);
  assert.ok(!/\.src\s*=\s*['"`]https?:/.test(s),`${f}: 외부 audio src`);
 }
 // 링크는 새 탭·noopener
 const ui=readFileSync('src/radio-ui.js','utf8');for(const m of ui.matchAll(/<a href[^>]*>/g))assert.match(m[0],/target="_blank" rel="noopener noreferrer"/);
});
test('또렷함: 정확히·0.1 = 1, 0.5 = 0.5, 0.9 이상 = 0, 멀어질수록 줄어듦',()=>{
 assert.equal(clarityAt(91.9,91.9),1);assert.equal(clarityAt(92.0,91.9),1);assert.ok(near(clarityAt(92.4,91.9),.5,1e-9));
 assert.equal(clarityAt(92.8,91.9),0);assert.equal(clarityAt(95,91.9),0);
 let prev=2;for(let d=0;d<=1.2;d+=.05){const c=clarityAt(91.9+d,91.9);assert.ok(c<=prev+1e-12);prev=c;}
});
test('섞기: 맞추면 잡음 0·방송 = 볼륨, 방송 사이는 잡음만, 가까워질수록 잡음↓ 방송↑',()=>{
 const on=mixAt(95.5,.6);assert.equal(on.channel.id,'guide');assert.equal(on.noise,0);assert.ok(near(on.broadcast,.6));assert.equal(on.bars,5);assert.ok(on.locked);assert.equal(on.cutoff,6000);
 const off=mixAt(105,.6);assert.equal(off.channel,null);assert.equal(off.broadcast,0);assert.ok(near(off.noise,.33));assert.equal(off.bars,0);assert.equal(off.label,'수신 불량…');
 let pn=1,pb=-1;for(let f=97.5;f>=95.5-1e-9;f-=.1){const m=mixAt(f,1);assert.ok(m.noise<=pn+1e-12&&m.broadcast>=pb-1e-12,`${f}`);pn=m.noise;pb=m.broadcast;}
 assert.equal(receptionLabel(.85),'수신 보통');assert.equal(receptionLabel(.5),'수신 약함');
 assert.equal(mixAt(91.9,0).broadcast,0);
});
test('다이얼: 범위·0.1 눈금, 방송 ±0.1 안이면 붙음, 세 채널은 3.6MHz 이상 떨어짐',()=>{
 assert.equal(clampFreq(80),FREQ_MIN);assert.equal(clampFreq(120),FREQ_MAX);assert.equal(clampFreq(91.94),91.9);
 assert.equal(snapFreq(92.0),91.9);assert.equal(snapFreq(99.0),99.1);assert.equal(snapFreq(93.2),93.2);
 assert.equal(nearestStation(98,FM_CHANNELS).station.id,'nature');assert.equal(nearestStation(97,FM_CHANNELS).station.id,'guide');
 const f=FM_CHANNELS.map(c=>c.freq);for(let i=1;i<f.length;i++)assert.ok(f[i]-f[i-1]>=3.6-1e-9);
});
test('manifest: 91.9 Kevin MacLeod 8곡(CC BY 4.0)·99.1 Freesound 6개(CC0), 파일이 모두 같은 출처에 있음',()=>{
 assert.deepEqual(validateManifest(manifest),[]);
 const calm=manifest.channels.calm.tracks,nature=manifest.channels.nature.tracks;
 assert.equal(calm.length,8);assert.equal(nature.length,6);
 for(const t of [...calm,...nature]){assert.ok(existsSync(`assets/radio/${t.file}`),t.file);}
 assert.ok(calm.every(t=>t.license==='CC BY 4.0'&&t.artist==='Kevin MacLeod'));assert.ok(nature.every(t=>t.license==='CC0'));
 assert.equal(readdirSync('assets/radio/919-calm').filter(n=>n.endsWith('.mp3')).length,8);
 assert.equal(readdirSync('assets/radio/991-forest-wind').filter(n=>n.endsWith('.mp3')).length,6);
});
test('91.9 크레딧은 docs/radio-tracks.md 문구 그대로',()=>{
 const doc=readFileSync('docs/radio-tracks.md','utf8'),block=doc.split('```')[1].trim();
 assert.equal(manifest.channels.calm.credit,block);
 const b=creditBlocks(manifest);assert.deepEqual(b.map(x=>x.id),['calm','guide','nature']);assert.equal(b[0].text,block);
 assert.match(b[2].text,/Freesound, CC0/);
});
test('곡 위치: 시각 % 총 길이로 같은 곡의 같은 자리, 99.1은 바람·물 두 층',()=>{
 const calm=manifest.channels.calm.tracks,total=calm.reduce((s,t)=>s+t.duration,0);
 assert.deepEqual(playlistAt(calm,0),{index:0,offset:0,total});
 const p=playlistAt(calm,calm[0].duration+10);assert.equal(p.index,1);assert.ok(near(p.offset,10,1e-6));
 assert.equal(playlistAt(calm,total+5).index,0);
 const layers=natureLayers(manifest.channels.nature.tracks);assert.equal(layers.length,2);
 const lens=layers.map(l=>l.reduce((s,t)=>s+t.duration,0));assert.ok(Math.abs(lens[0]-lens[1])>5,'층 길이가 달라 같이 반복되지 않음');
 assert.equal(trackLabel('calm',calm[0]),'Morning · Kevin MacLeod');assert.equal(trackLabel('guide'),'자작 멘트');assert.match(trackLabel('nature',layers[0][0]),/^자연 소리/);
});
test('95.5 멘트: 정상 근처 최우선, 같은 줄은 마지막 3개 안에서 반복 안 함, 후보 없으면 fm-id, 녹음 없으면 자막',()=>{
 assert.equal(guideCandidates({remaining:300,kind:'rain',phase:'night'})[0],'summit-near');
 assert.deepEqual(guideCandidates({kind:'rain',level:'heavy',phase:'day',season:'summer'}).slice(0,2),['rain-heavy','summer']);
 assert.equal(pickGuideLine({kind:'clear',phase:'day'},[]),'clear-day');
 assert.equal(pickGuideLine({kind:'clear',phase:'day'},['clear-day']),'fm-id');
 assert.equal(pickGuideLine({kind:'clear',phase:'day',season:'autumn'},['autumn']),'clear-day');
 const h=[];for(let i=0;i<6;i++){const id=pickGuideLine({kind:'clear',phase:'night',season:'spring'},h);assert.ok(!h.slice(-3).includes(id)||id==='fm-id');h.push(id);}
 const lines=manifest.channels.guide.lines;assert.equal(lines.length,15);assert.ok(lines.every(l=>l.text&&l.file===null));
 assert.ok(lines.some(l=>l.id==='fm-id'));for(const id of ['clear-day','night','summit-near','long-walk'])assert.ok(lines.some(l=>l.id===id),id);
 assert.ok(captionSeconds(lines[0].text)>=6&&captionSeconds(lines[0].text)<=10);
});
test('저장·화면 글자: 전원은 늘 꺼진 채 시작, 칩 📻 91.9 / 잡음 ~, 표시창 상태',()=>{
 const mem=new Map([[RADIO_SAVE_KEY,JSON.stringify({on:true,freq:99.14,vol:.3})]]),st={getItem:k=>mem.get(k)??null};
 assert.deepEqual(loadRadio(st),{on:false,freq:99.1,vol:.3});assert.deepEqual(loadRadio(null),{on:false,freq:91.9,vol:.6});
 assert.equal(chipText(false,91.9),'📻 라디오');assert.equal(chipText(true,91.9),'📻 91.9');assert.equal(chipText(true,87.5),'📻 ~87.5');
 assert.equal(displayModel({on:false,freq:91.9,vol:.6}),null);
 assert.equal(displayModel({on:true,freq:91.9,vol:.6,deckState:'playing'}).name,'관악산 FM · 잔잔한 음악');
 assert.equal(displayModel({on:true,freq:91.9,vol:.6,deckState:'error'}).status,'방송이 끊겼어요');
 assert.equal(displayModel({on:true,freq:104,vol:.6}).status,'수신 불량…');
 assert.equal(displayModel({on:true,freq:91.9,vol:.6,deckState:'playing',sound:false}).status,'소리 꺼짐');
 assert.equal(displayModel({on:true,freq:91.9,vol:0,deckState:'playing'}).status,'음소거');
});
