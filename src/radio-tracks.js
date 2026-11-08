// 관악산 FM 곡·소리 목록 도우미(순수 모듈). 목록 자체는 assets/radio/manifest.json 한 파일이고(같은 출처), 이 파일은 읽기·검사·계산만 한다.
// 화면의 '♪ 곡 정보' 칸과 「소리 출처」 화면, 시험(tests/radio.test.mjs)이 같은 manifest를 읽어 문구가 어긋나지 않게 한다.
// 95.5 멘트 고르기 규칙(docs/radio-design.md §5)도 여기 둔다.
export const MANIFEST_FILE='assets/radio/manifest.json';
export const RADIO_DIR='assets/radio/';

// manifest 모양 검사: 문제 목록(빈 배열이면 통과)
export function validateManifest(m){
 const bad=[];const ch=m?.channels;if(!ch)return ['channels 없음'];
 for(const id of ['calm','guide','nature']){if(!ch[id])bad.push(`${id} 채널 없음`);}
 for(const id of ['calm','nature'])for(const t of ch[id]?.tracks??[]){
  if(!t.file||/^https?:|^\/\//.test(t.file))bad.push(`${id}/${t.id}: 같은 출처 상대 경로가 아님`);
  if(!(t.duration>0))bad.push(`${id}/${t.id}: 길이 없음`);
  if(!['CC0','CC BY 4.0'].includes(t.license))bad.push(`${id}/${t.id}: 허용 라이선스 아님(${t.license})`);
  if(t.license==='CC BY 4.0'&&!t.credit)bad.push(`${id}/${t.id}: CC BY 크레딧 없음`);
 }
 for(const l of ch.guide?.lines??[])if(l.file&&/^https?:|^\/\//.test(l.file))bad.push(`guide/${l.id}: 외부 주소`);
 return bad;
}
// 시각(초)에 틀어 놓았던 곡과 그 곡 안의 위치: 목록 총 길이로 나눈 나머지(라디오가 '계속 흘러가고 있던' 느낌, radio-design §3-3)
export function playlistAt(tracks,tSec){
 const total=tracks.reduce((s,t)=>s+t.duration,0);if(!(total>0))return {index:0,offset:0,total:0};
 let x=((tSec%total)+total)%total;
 for(let i=0;i<tracks.length;i++){if(x<tracks[i].duration)return {index:i,offset:x,total};x-=tracks[i].duration;}
 return {index:0,offset:0,total};
}
// 99.1 층(바람·새 / 물): 층마다 따로 돌고, 층 길이가 달라 똑같이 반복되는 때가 거의 없다.
export const natureLayers=tracks=>{const by={};for(const t of tracks){(by[t.layer??'wind']??=[]).push(t);}return Object.values(by);};
// '♪ 곡 정보' 한 줄
export function trackLabel(channelId,track){
 if(channelId==='guide')return '자작 멘트';
 if(channelId==='nature')return track?`자연 소리 · ${track.title}`:'자연 소리';
 return track?`${track.title} · ${track.artist}`:'';
}
// 「소리 출처」 화면 블록: [{id,heading,freq,text,links:[{label,url}]}]. text는 manifest 크레딧 문구 그대로.
export function creditBlocks(m){
 const ch=m?.channels??{},out=[];
 if(ch.calm)out.push({id:'calm',heading:`${ch.calm.freq} ${ch.calm.name}`,text:ch.calm.credit,links:(ch.calm.tracks??[]).map(t=>({label:t.title,url:t.page}))});
 if(ch.guide)out.push({id:'guide',heading:`${ch.guide.freq} ${ch.guide.name}`,text:ch.guide.credit,links:[]});
 if(ch.nature)out.push({id:'nature',heading:`${ch.nature.freq} ${ch.nature.name}`,text:ch.nature.credit,links:(ch.nature.tracks??[]).map(t=>({label:`${t.title} — ${t.artist}`,url:t.page}))});
 return out;
}

// ── 95.5 멘트 고르기(radio-design §5). 게임 안 값만 읽는다(실제 기상 예보가 아님).
// g = {kind:'clear'|'cloud'|'overcast'|'rain'|'fog'|'snow', level, windSpeed?, phase:'day'|'dusk'|'night', season, remaining(정상까지 m), longWalk(30분 지남)}
export function guideCandidates(g={}){
 const c=[];
 if(Number.isFinite(g.remaining)&&g.remaining<=400)c.push('summit-near');
 if(g.kind==='rain')c.push(g.level==='heavy'?'rain-heavy':'rain-light');
 if(g.kind==='fog')c.push('fog');
 if(g.kind==='snow'||g.season==='winter')c.push('snow-winter');
 if(Number.isFinite(g.windSpeed)&&g.windSpeed>=6)c.push('wind');
 if(g.phase==='dusk')c.push('dusk');
 if(g.phase==='night')c.push('night');
 if(['spring','summer','autumn'].includes(g.season))c.push(g.season);
 if(g.phase==='day'&&g.kind==='clear')c.push('clear-day');
 if(g.phase==='day'&&(g.kind==='cloud'||g.kind==='overcast'))c.push('cloud-day');
 if(g.longWalk)c.push('long-walk');
 return c;
}
// 후보 중 마지막 3개에 없는 첫 줄, 없으면 fm-id
export function pickGuideLine(g,history=[]){
 const recent=history.slice(-3);
 return guideCandidates(g).find(id=>!recent.includes(id))??'fm-id';
}
// 자막을 띄우는 시간(초): 한국어 글자 수로 6~10초
export const captionSeconds=text=>Math.max(6,Math.min(10,[...String(text??'')].length/11));
