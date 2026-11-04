// 상호작용 컨트롤러: 후보 찾기 → 알약 → 실행(스탬프·안내판·산길 행동·쌍안경 이름표·인사 메뉴)을 한곳에서 돌린다.
// 장면·카메라는 모르고 main.js가 deps로 넘긴 값만 쓴다(시험에서는 가짜 deps). 키는 input.js가 command로 넘긴다.
import {STAMPS,PAGES,BOARD_PAGES,GPX_SOURCE,NOT_SIGN_NOTICE,STONE_NOTICE,LANDMARKS,LANDMARK_OBSERVER,ACTIONS,RULES} from './interaction-data.js';
import {pickCandidate,markerCandidates,arrowAngle,headingToBearing,loadProgress,saveProgress,addStamp,stampCount,hasAllStamps,notebookSlots,cardData,applyStamina,landmarkAt,classifyLandmarks,stackLabels,landmarksEnabled,weatherVisibility,TAPE_HALF,clock} from './interaction-logic.js';

const FRAME_KEY='gwanak-photo-frame';
const READ_KIND={trailSign:'이정표 읽기',infoBoard:'안내판 읽기',summitBoard:'안내판 읽기'};
const EMOTES=[{icon:'🙇',label:'인사',id:'hello'},{icon:'👋',label:'손 흔들기',id:'wave'},{icon:'📸',label:'같이 셀카',id:'selfie'}];
const smooth=t=>t<=0?0:t>=1?1:t*t*(3-2*t);
// 행동 중 카메라 숙임(rad, 음수 = 아래)·눈높이 낮춤(m). 설계 §⑥ 타임라인의 제안값.
export function actionPose(id,t,total){
 const w=smooth(Math.min(t/.5,(total-t)/.5,1));
 if(id==='drink')return {pitch:-.26*w,drop:.22*w};
 if(id==='dip')return {pitch:-.34*w,drop:.28*w};
 if(id==='cairn')return {pitch:(t<total*.45?-.28:.2)*w,drop:(t<total*.45?.2:0)*w};
 if(id==='stretch')return {pitch:.14*w,drop:0};
 return {pitch:0,drop:0};
}
export function createInteraction({state,sites=[],streams=[],player,ui,sound,storage=null,now=()=>Date.now(),courseKm=()=>0,weather=()=>({kind:'clear',label:''}),geo,projectDir,projectWorld,cameraInfo=()=>({fov:65,aspect:16/9,zoom:1}),phoneRect=()=>null,gadget=()=>state.gadget??'none',multi=()=>null,requestShot=null,nickname='산길 손님',canShare=false}){
 const progress=loadProgress(storage);let t=0,curSpeed=0,view=null,current=null,action=null,tagsOn=true,frameOn=false,summitPhoto=null,holdX=null,wheelOn=false,lastBino=null,lastTick=-9;
 try{frameOn=storage?.getItem(FRAME_KEY)==='true';}catch{}
 const cool={},persist=()=>saveProgress(storage,progress);
 const stampSite=sites.find(s=>s.id==='stamp-6');
 const gloss=k=>({trailSign:'i',infoBoard:'i',summitBoard:'i',stampBox:'印',spring:'水',cairnField:'石'}[k]??'·');
 // 후보 만들기(한 번). 같은 자리에서 쌓이는 행동은 group이 같다(돌탑 공터의 스탬프+돌 올리기).
 const cands=[];
 for(const s of sites){
  const base={id:s.id,x:s.x,z:s.z,y:s.y,site:s,glyph:gloss(s.kind),group:s.id};
  if(READ_KIND[s.kind])cands.push({...base,action:'read',showRadius:RULES.show});
  else if(s.kind==='stampBox')cands.push({...base,action:'stamp',showRadius:RULES.showStamp,group:s.id==='stamp-4'?'cairn-area':s.id,priority:0});
  else if(s.kind==='spring')cands.push({...base,action:'drink',showRadius:RULES.show});
  else if(s.kind==='cairnField')cands.push({...base,action:'cairn',showRadius:5.5,group:'cairn-area',priority:1});
 }
 for(const s of streams)cands.push({id:s.id,x:s.x,z:s.z,y:s.y??0,site:s,glyph:'水',group:s.id,action:'dip',showRadius:3.5});
 const doneFor=c=>c.action==='stamp'?!!progress.stamps[c.id]:c.action==='read'?!!progress.read[c.id]:false;

 // ── 알약 줄 ──
 function rowFor(c,i){
  const key=i===0?'F':String(i+1);
  if(c.action==='read')return {key,label:READ_KIND[c.site.kind],sub:c.site.title??'지명 안내',state:progress.read[c.id]?'done':'ready'};
  if(c.action==='stamp'){const s=STAMPS.find(x=>x.id===c.id),got=!!progress.stamps[c.id];
   if(got&&c.id==='stamp-6'&&hasAllStamps(progress))return {key,label:'완등 기록 카드 보기',sub:'정상 인증 완료',state:'done'};
   return {key,label:got?`스탬프 ✓ ${s.name}`:c.id==='stamp-6'?'정상 인증 · 스탬프 찍기':`스탬프 찍기 · ${s.name}`,sub:got?'이미 찍었어요':s.note,state:got?'done':'ready'};}
  if(c.action==='drink'||c.action==='dip'||c.action==='cairn'){const a=ACTIONS[c.action],wait=Math.max(0,(cool[c.action]??0)-t);
   if(wait>0&&c.action!=='cairn')return {key,label:a.label,sub:a.sub,state:'lock',reason:`${Math.ceil(wait)}초 뒤에 다시 할 수 있어요`};
   return {key,label:a.label,sub:c.action==='cairn'?`${STONE_NOTICE}${progress.stones?` · 내 돌 ${progress.stones}개`:''}`:state.stamina>=100?`${a.sub} · 체력이 가득해요`:a.sub,state:'ready'};}
  if(c.action==='greet')return {key,label:'인사하기',sub:c.name,state:'ready'};
  return {key,label:c.label??'',sub:'',state:'ready'};
 }
 const hidden=()=>state.paused||(state.pose&&state.pose!=='stand')||!!action||ui.boardOpen||ui.bookOpen||ui.cardOpen||curSpeed>RULES.runSpeed;
 function personCandidate(p){
  const m=multi();if(!m?.nearest)return null;const n=m.nearest(RULES.show);if(!n)return null;
  return {id:'greet',action:'greet',x:n.player.x,z:n.player.z,name:n.player.name,showRadius:RULES.show,group:'greet',glyph:'👋'};
 }

 // ── 스탬프 ──
 function stamp(c){
  const s=STAMPS.find(x=>x.id===c.id);if(!s)return;
  if(progress.stamps[c.id]){
   if(c.id==='stamp-6'&&hasAllStamps(progress)){openCard();return;}
   ui.toast('이미 찍은 스탬프예요');return;}
  const info={at:now(),km:courseKm()/1000,elev:player().elevation??s.elev,weather:weather().label};
  // 지도 기준 값과 크게 어긋나면(광장·지형 오차) 자료 표 값을 쓴다.
  if(!Number.isFinite(info.km)||Math.abs(info.km-s.km)>.35)info.km=s.km;if(!Number.isFinite(info.elev)||Math.abs(info.elev-s.elev)>45||c.id==='stamp-6')info.elev=s.elev; // 정상석은 표기 값(629m)
  addStamp(progress,c.id,info);if(c.id==='stamp-6'&&progress.certifiedAt==null)progress.certifiedAt=info.at;persist();
  sound.play('stamp');
  const count=stampCount(progress);
  if(count===STAMPS.length){setTimeout(()=>openCard(),900);ui.toast('6/6 완등 스탬프를 모았어요!');return;}
  ui.stampToast({stamp:s,count,detail:`일주문에서 ${s.km.toFixed(2)}km · 해발 ${s.id==='stamp-6'?'629m 표기':Math.round(info.elev)+'m'}${c.id==='stamp-6'?' · 정상 인증 완료 · P로 폰을 꺼내 인증샷을 찍어 보세요':''}`});
 }
 // ── 안내판 ──
 function pagesFor(c){
  const s=c.site;
  if(s.kind==='trailSign'){
   const rows=(s.boards??[]).map((b,i)=>({text:b.text,angle:arrowAngle(s.yaw+b.angle,player().heading),hint:i===0?'오르는 쪽':i===1?'내려가는 쪽':'옆길 · 방향은 추정'}));
   const pages=[{title:'이정표',rows,body:[],chips:[{kind:'ok',text:'이정표에 적힌 지명'},{kind:'est',text:'화살표 방향(옆길)'}],source:GPX_SOURCE}];
   if(s.contentId&&PAGES[s.contentId])pages.push(PAGES[s.contentId]);return pages;
  }
  return (BOARD_PAGES[s.id]??[s.contentId]).filter(k=>PAGES[k]).map(k=>PAGES[k]);
 }
 function openRead(c){
  const pages=pagesFor(c);if(!pages.length)return;progress.read[c.id]=true;persist();sound.play('tick');
  ui.openBoard({eyebrow:`${c.site.kind==='trailSign'?'이정표':'안내판'} · ${c.site.title??'코스 이정표'}`,pages,notice:NOT_SIGN_NOTICE});
 }
 // ── 산길 행동 ──
 function begin(id,label,cand=null){
  const a=ACTIONS[id],wait=Math.max(0,(cool[id]??0)-t);
  if(wait>0&&id!=='cairn'){ui.toast(`${Math.ceil(wait)}초 뒤에 다시 할 수 있어요`);return false;}
  if(state.pose&&state.pose!=='stand')return false;
  action={id,t:0,total:a.total,cand,label:label??a.label};cool[id]=t+a.cooldown+a.total;
  sound.playAction(id);return true;
 }
 function finish(){
  const a=action,def=ACTIONS[a.id];let msg=a.label;
  if(a.id==='drink'){const g=applyStamina(state,def.stamina);progress.drinks++;msg=`약수 한 모금 · 체력 +${Math.round(g)}`;}
  else if(a.id==='dip'){const g=applyStamina(state,def.stamina);progress.dips++;msg=`손 담그기 · 체력 +${Math.round(g)}`;}
  else if(a.id==='cairn'){progress.stones++;msg=`오늘 내 돌 ${progress.stones}개 · ${STONE_NOTICE}`;}
  else if(a.id==='stretch'){const g=applyStamina(state,def.stamina);progress.stretches++;msg=`스트레칭 · 체력 +${Math.round(g)}`;}
  persist();sound.play('done');ui.toast(msg,{ms:3400});action=null;ui.setAction(null);result={id:a.id,at:t};
 }
 let result=null;
 function cancel(why='움직여서 멈췄어요'){if(!action)return;sound.cancel();ui.setAction(null);ui.toast(why,{ms:1600});cool[action.id]=Math.min(cool[action.id]??0,t+1);action=null;}
 // ── 완등 카드 ──
 function cardInfo(){return cardData(state,progress,{now:now(),weatherLabel:weather().label,nickname,photo:summitPhoto});}
 function nearSummitStone(r=12){const m=stampSite;if(!m)return false;const p=player();return Math.hypot(p.x-m.x,p.z-m.z)<=r;}
 function openCard(){
  if(!hasAllStamps(progress)){ui.toast('스탬프를 모두 모으면 완등 카드가 만들어져요');return;}
  ui.closeBook();
  const open=()=>ui.openCard(cardInfo(),{canShare,filename:`관악산-완등-${new Date(progress.certifiedAt??now()).toISOString().slice(0,10)}.png`});
  if(!summitPhoto&&requestShot&&nearSummitStone())requestShot(img=>{if(img)summitPhoto=img;open();});else open();
 }
 // ── 인증샷 틀 ──
 function frameRow(){return {key:'F',label:frameOn?'인증샷 틀 끄기':'인증샷 틀 켜기',sub:'저장 사진에 틀이 들어가요',state:'ready'};}
 const frameInfo=()=>({date:cardInfo().date,time:clock(now()),weather:weather().label,nickname});
 // ── 쌍안경 이름표 ──
 function binoModel(){
  const p=player(),cam=cameraInfo(),el=p.elevation??0,on=landmarksEnabled(p.zone,el),b=headingToBearing(p.heading),w=weather(),vis=weatherVisibility(w.kind);
  const half=Math.atan(Math.tan(cam.fov*Math.PI/360)*cam.aspect)*180/Math.PI/Math.max(.5,cam.zoom);
  if(!on)return {bearing:b,tape:[],labels:[],edges:[],focus:null,note:'정상 부근에서 이름표가 보여요',hit:null};
  const rows=LANDMARKS.map(lm=>landmarkAt(lm,geo(lm.lat,lm.lon),{x:p.x,z:p.z,elevation:el},vis));
  const c=classifyLandmarks(rows,b,{halfFov:half});
  const short=r=>r.name.replace(' (인천)','').replace(/ \((.*) 쪽\)/,'($1)');
  const tape=c.tape.map(r=>({id:r.id,delta:r.delta,short:short(r),directionOnly:r.directionOnly}));
  let labels=[],edges=[],focus=null;
  if(tagsOn){
   const placed=c.inView.map(r=>{const q=projectDir(r.bearing,r.elev);return q&&q.visible?{...r,x:q.x,y:q.y}:null;}).filter(Boolean);
   labels=stackLabels(placed.slice(0,6)).map(r=>({x:r.x,y:r.y,name:r.name,sub:r.directionOnly?'방향만 · 멀리 인천 방향':`${r.km.toFixed(1)}km${r.hazyNow?' · 지금은 안 보여요':r.blocked?' · 추정':''}${r.height&&!r.hazyNow?' · '+r.height.split(' · ')[0]:''}`,row:r.row,rise:Math.max(14,Math.min(30+r.row*38,r.y-(globalThis.innerHeight||900)*.3-44)),dim:!r.seeable&&!r.directionOnly||r.clearest&&r.km>vis*.9,directionOnly:r.directionOnly,focus:c.focus?.id===r.id}));
   edges=c.edges.filter(r=>!c.inView.some(v=>v.id===r.id)).map(r=>({delta:r.delta,directionOnly:r.directionOnly,text:`${short(r)}${r.directionOnly?' (방향만)':''} · ${Math.abs(r.delta).toFixed(0)}° ${r.delta<0?'왼쪽':'오른쪽'}`}));
   if(c.focus){const f=c.focus;focus={id:f.id,name:f.name,row:f,lines:[`방위 ${f.bearing.toFixed(1)}° · 거리 ${f.km.toFixed(1)}km${f.height?' · 높이 '+f.height:''}`,f.directionOnly?'가시거리 기준 밖이라 방향만 표시해요':f.hazyNow?'지금 날씨에서는 안 보여요':f.clearest?'가장 맑은 날에만 보여요':f.blocked?'다른 산에 가려질 수 있어요 (추정)':'맑은 날 보여요',...(f.note?[f.note]:[])]};}
  }
  return {bearing:b,tape,labels,edges,focus,note:tagsOn?null:'이름표 꺼짐 · N으로 켜기',hit:focus};
 }
 function landmarkPages(f){
  const lm=f.row,chips=[];
  chips.push(lm.directionOnly||lm.blocked||lm.clearest?{kind:'est',text:lm.directionOnly?'가시거리 밖 · 방향만':lm.blocked?'시선 가림 미확인':'가장 맑은 날만'}:{kind:'ok',text:'맑은 날 보임'});
  const body=[`진북 기준 ${lm.bearing.toFixed(1)}° 방향, 약 ${lm.km.toFixed(1)}km 떨어져 있어요.${lm.height?` 높이는 ${lm.height}입니다.`:''}`];
  body.push('좌표는 대표점이라 건물·봉우리 꼭대기와 몇백 m 다를 수 있고, 지형이나 건물에 시선이 가려지는지는 아직 확인하지 않았어요.');
  if(lm.note)body.push(lm.note);
  return [{title:lm.name,body,chips,source:'좌표·높이 · 위키백과 대표 좌표와 표기 값 — 방위·고도각은 직접 계산'}];
 }
 // ── 한 번 실행 ──
 function run(i){
  if(!view)return false;const row=view.rows[i];if(!row)return false;
  if(view.kind==='bino'){ui.openBoard({eyebrow:'쌍안경 · 이름표',pages:landmarkPages(view.focus),notice:'직접 계산한 값이며 현장 안내판 글이 아닙니다'});sound.play('tick');return true;}
  if(view.kind==='frame'){frameOn=!frameOn;try{storage?.setItem(FRAME_KEY,String(frameOn));}catch{}ui.toast(frameOn?'인증샷 틀 켜짐 · 저장 사진에 들어가요':'인증샷 틀 꺼짐');return true;}
  const c=view.cands[i];if(row.state==='lock'){ui.toast(row.reason);return true;}
  if(c.action==='read')openRead(c);
  else if(c.action==='stamp')stamp(c);
  else if(c.action==='greet'){multi()?.doGesture?.('hello');}
  else if(c.action==='drink'||c.action==='dip'||c.action==='cairn')begin(c.action,ACTIONS[c.action].label,c);
  if(state.auto&&c.action!=='read')state.auto=false;
  return true;
 }
 // 막 시작한 행동으로 자동 걷기를 멈춘다(끝나도 재개하지 않는다).
 function stopAutoFor(){if(state.auto)state.auto=false;}

 // ── 프레임 갱신 ──
 function update(dt,{cmd={},started=true,speed=0}={}){
  if(!started)return;t+=dt;curSpeed=speed;const p=player(),moving=!!(cmd.forward||cmd.side);
  if(ui.boardOpen&&moving)closeBoard();
  if(action){
   if(moving||state.pose!=='stand'||state.paused||gadget()!=='none')cancel(moving?'움직여서 멈췄어요':'멈췄어요');
   else{action.t+=dt;const a=ACTIONS[action.id],frac=action.t/action.total,i=Math.min(a.steps.length-1,Math.floor(frac*a.steps.length));
    ui.setAction({label:action.label,step:a.steps[i],progress:Math.min(1,frac),breath:action.id==='stretch',tint:action.id==='dip'?'water':null,hint:action.id==='cairn'?STONE_NOTICE:'움직이면 멈춰요'});
    if(action.t>=action.total)finish();}
  }
  // 알약
  const g=gadget();let next=null;
  if(g==='binoculars'&&!state.paused){const m=binoModel();lastBino=m;ui.setBino({bearing:m.bearing,tape:m.tape,labels:m.labels,edges:m.edges,focus:m.focus,note:m.note});
   if(m.focus)next={kind:'bino',rows:[{key:'F',label:`${m.focus.name} 자세히`,sub:'',state:'ready'}],focus:m.focus,cands:[]};}
  else{lastBino=null;ui.setBino(null);}
  if(g==='phone'&&!state.paused&&p.zone==='summit'&&nearSummitStone(RULES.showStamp)&&gadget()==='phone'){next={kind:'frame',rows:[frameRow()],cands:[],where:'phone'};}
  if(!next&&g==='none'&&!hidden()){
   const list=[...cands];const person=personCandidate(p);if(person)list.push(person);
   const hit=pickCandidate(list,p,current);
   if(hit){if(current!==hit.primary.id&&t-lastTick>=RULES.recheck){lastTick=t;sound.play('tick');}current=hit.primary.id;const cs=[hit.primary,...hit.stack].sort((a,b)=>(a.priority??0)-(b.priority??0)),primary=hit.primary;
    // 쌓기 순서: 같은 자리에서는 priority가 낮은 행동(스탬프)이 맨 위 F, 아래 줄이 숫자키
    const ordered=cs.slice(0,3);next={kind:'world',rows:ordered.map(rowFor),cands:ordered};}
   else current=null;
  }else if(g!=='none'||hidden())current=null;
  view=next;
  if(next?.where==='phone'){const r=phoneRect();ui.setPill(r?{rows:next.rows,where:'phone',rect:r}:null);}
  else ui.setPill(next&&next.kind!=='bino'?{rows:next.rows,where:'world'}:null);
  // 15m 마커
  if(g==='none'&&!ui.boardOpen&&!ui.bookOpen&&!ui.cardOpen&&!action){
   const list=markerCandidates(cands,p,{done:c=>doneFor(c)||c.id===current}),out=[];
   for(const o of list){const q=projectWorld(o.c.x,(o.c.y??0)+1.6,o.c.z);if(q?.visible)out.push({id:o.c.id,x:q.x,y:q.y,glyph:o.c.glyph,far:o.d>RULES.show+4});}
   ui.setMarkers(out);
  }else ui.setMarkers([]);
  // 인증샷 틀 오버레이
  const r=phoneRect2();ui.setFrame(frameOn&&g==='phone'&&p.zone==='summit'&&nearSummitStone(RULES.showStamp)&&!!r,r,frameInfo());
  // X 누르고 있기
  if(holdX!==null&&!wheelOn&&t-holdX>=.25&&multi()){wheelOn=true;ui.showWheel(EMOTES,-1,'숫자 1·2·3 또는 눌러서 고르기');}
  const pose=action?actionPose(action.id,action.t,action.total):{pitch:0,drop:0};api.pitch=pose.pitch;api.drop=pose.drop;
 }
 const phoneRect2=()=>{try{return globalThis.document?.querySelector('.phone-screen')?.getBoundingClientRect()??null;}catch{return null;}};
 function closeBoard(){ui.closeBoard();}
 // ── 명령 ──
 function handle(id,value){
  if(id==='interact'||id==='choice-1'||id==='choice-2'||id==='choice-3'){
   const n=id==='interact'?0:Number(id.slice(-1))-1;
   if(wheelOn&&id!=='interact'){pickEmote(n);return true;}
   if(ui.cardOpen){ui.closeCard();return true;}
   if(ui.boardOpen&&n===0){closeBoard();return true;}
   if(ui.bookOpen)return false;
   if(action)return false;
   return run(n);
  }
  if(id==='panel-close'){if(ui.cardOpen)ui.closeCard();else if(ui.boardOpen)closeBoard();else if(ui.bookOpen)ui.closeBook();else return false;return true;}
  if(id==='page-prev'||id==='page-next'){return ui.stepBoard(id==='page-next'?1:-1);}
  if(id==='stamps-toggle'){if(ui.bookOpen){ui.closeBook();return true;}if(action||state.paused)return true;closeBoard();ui.closeCard();openBook();return true;}
  if(id==='card-open'){openCard();return true;}
  if(id==='labels-toggle'){tagsOn=!tagsOn;multi()?.setTags?.(tagsOn);ui.toast(tagsOn?'이름표 켜짐':'이름표 꺼짐 (방위 띠는 남아요)');return true;}
  if(id==='stretch'){if(action||state.paused||ui.bookOpen||ui.cardOpen||gadget()!=='none')return true;closeBoard();stopAutoFor();begin('stretch','스트레칭');return true;}
  if(id==='emote-menu'){
   if(value==='down'){if(holdX===null)holdX=t;return true;}
   if(value==='up'){const quick=!wheelOn&&holdX!==null&&t-holdX<.25;holdX=null;if(wheelOn){wheelOn=false;ui.hideWheel();}else if(quick){if(multi())multi().doGesture('hello');else ui.toast('인사는 함께 걷기(?multi=방이름)에서 쓸 수 있어요');}return true;}
  }
  if(id==='emote-pick'){pickEmote(Number(value));return true;}
  return false;
 }
 function pickEmote(n){const m=multi(),e=EMOTES[n];wheelOn=false;holdX=null;ui.hideWheel();if(!m||!e)return;if(e.id==='selfie')m.selfieKey();else m.doGesture(e.id);sound.play('greet');}
 function openBook(){
  const slots=notebookSlots(progress),count=stampCount(progress);
  ui.openBook({slots,count,canCard:count===STAMPS.length,small:globalThis.innerWidth<=700,stats:`오늘 내 돌 ${progress.stones}개 · 약수 ${progress.drinks}번 · 손 담그기 ${progress.dips}번 · 스트레칭 ${progress.stretches}번`});
 }
 // 사진 저장 때 불러, 정상석 앞에서 찍은 사진은 완등 카드용으로 기억한다.
 function notePhoto(url){if(!url||!nearSummitStone(12))return;const img=new Image();img.onload=()=>{summitPhoto=img;};img.src=url;}
 function bakeFrame(g,w,h,drawPhotoFrame){if(!frameActive())return false;drawPhotoFrame(g,w,h,frameInfo());return true;}
 function reset(){if(action){sound.cancel();action=null;}ui.setAction(null);ui.closeBoard();ui.closeBook();ui.closeCard();ui.hideWheel();ui.setPill(null);ui.setMarkers([]);wheelOn=false;holdX=null;current=null;view=null;}
 const frameActive=()=>frameOn&&gadget()==='phone'&&player().zone==='summit'&&nearSummitStone(RULES.showStamp);
 const api={update,handle,run,reset,frameActive,openBook,openCard,notePhoto,bakeFrame,pitch:0,drop:0,
  active:()=>!!view,anyPanel:()=>ui.boardOpen||ui.bookOpen||ui.cardOpen,modal:()=>ui.bookOpen||ui.cardOpen,panelPages:()=>ui.boardPages,wheel:()=>wheelOn,
  progress,cands,
  get view(){return view?{kind:view.kind,id:view.cands?.[0]?.id??view.focus?.id??null,rows:view.rows.map(r=>({...r}))}:null;},
  get action(){return action&&{id:action.id,t:action.t,total:action.total};},get result(){return result;},
  get tagsOn(){return tagsOn;},get frameOn(){return frameOn;},get bino(){return lastBino;},cooldowns:()=>({...cool}),now:()=>t,
  debug:{setPhoto:img=>{summitPhoto=img;}}};
 return api;
}
