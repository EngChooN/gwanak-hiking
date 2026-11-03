import test from 'node:test';import assert from 'node:assert/strict';
import {gadgetDefaults,ensureGadget,setGadget,closeGadget,walkInput,zoomBy,zoomStep,setPhoneZoom,toggleSelfie,viewZoom,selfieActive,lookScale,hazeScale,selfiePosition,photoFilename,BINOCULAR_ZOOM,PHONE_ZOOM,SELFIE} from '../src/gadget.js';
import {commandFor,KEY_COMMANDS} from '../src/input.js';
import {initialState,restore,advance} from '../src/movement.js';
const fresh=(o={})=>ensureGadget({...initialState(),...o});
test('기본 상태와 저장 복구: 기구는 이어하기에 남지 않는다',()=>{
 const s=fresh();assert.equal(s.gadget,'none');assert.deepEqual(s.phone,{zoom:1,selfie:false});assert.equal(s.binoculars.zoom,8);
 setGadget(s,'phone');const back=ensureGadget(restore(JSON.stringify(s)));assert.equal(back.gadget,'none');
});
test('켜기·끄기·전환: 켜면 자동 걷기·달리기·일시정지·앉기를 푼다',()=>{
 const s=fresh({auto:true,running:true,paused:true,pose:'sit'});
 setGadget(s,'binoculars');assert.equal(s.gadget,'binoculars');assert.equal(s.auto,false);assert.equal(s.running,false);assert.equal(s.paused,false);assert.equal(s.pose,'stand');
 setGadget(s,'phone');assert.equal(s.gadget,'phone');
 toggleSelfie(s);assert.equal(s.phone.selfie,true);
 setGadget(s,'binoculars');assert.equal(s.phone.selfie,false,'휴대폰을 내리면 셀카도 해제');
 setGadget(s,'binoculars');assert.equal(s.gadget,'none','같은 기구를 다시 누르면 끈다');
 assert.equal(closeGadget(s),false);setGadget(s,'phone');assert.equal(closeGadget(s),true);assert.equal(s.gadget,'none');
 assert.equal(setGadget(s,'drone'),false);
});
test('기구를 든 동안 걷기 입력은 막히고 이동하지 않는다',()=>{
 const s=fresh();setGadget(s,'phone');const cmd=walkInput(s,{forward:1,side:1,run:true,turn:1});
 assert.deepEqual(cmd,{forward:0,side:0,run:false,turn:1});const before=s.s;advance(s,cmd,.1);assert.equal(s.s,before);
 closeGadget(s);assert.equal(walkInput(s,{forward:1}).forward,1);
});
test('쌍안경 배율: 휠 4~10배, 기본 8배, 1인칭에서만 화면 배율',()=>{
 const s=fresh();setGadget(s,'binoculars');assert.equal(viewZoom(s),8);
 for(let i=0;i<50;i++)zoomBy(s,-1);assert.equal(s.binoculars.zoom,BINOCULAR_ZOOM.max);
 for(let i=0;i<50;i++)zoomBy(s,1);assert.equal(s.binoculars.zoom,BINOCULAR_ZOOM.min);
 zoomStep(s,1);assert.equal(s.binoculars.zoom,5);
 s.view='third';assert.equal(viewZoom(s),1,'3인칭은 자세만');assert.equal(lookScale(s),1);
 s.view='first';assert.ok(Math.abs(lookScale(s)-1/5)<1e-12,'마우스 감도는 배율에 반비례');
});
test('휴대폰 줌: 0.5·1·2·5 단계와 연속 줌, 범위 제한',()=>{
 const s=fresh();setGadget(s,'phone');
 const ups=[];for(let i=0;i<5;i++){zoomStep(s,1);ups.push(s.phone.zoom);}assert.deepEqual(ups,[2,5,5,5,5]);
 const downs=[];for(let i=0;i<4;i++){zoomStep(s,-1);downs.push(s.phone.zoom);}assert.deepEqual(downs,[2,1,.5,.5]);
 setPhoneZoom(s,3.3);assert.equal(viewZoom(s),3.3);zoomStep(s,1);assert.equal(s.phone.zoom,5);zoomStep(s,-1);zoomStep(s,-1);assert.equal(s.phone.zoom,1);
 zoomBy(s,.4);assert.ok(s.phone.zoom<1&&s.phone.zoom>=PHONE_ZOOM.min);setPhoneZoom(s,99);assert.equal(s.phone.zoom,5);
 assert.equal(lookScale({...s,phone:{zoom:.5}}),1,'광각에서는 감도 그대로');
});
test('셀카: 휴대폰·1인칭에서만, 머리 앞 0.6m에서 얼굴을 본다',()=>{
 const s=fresh();assert.equal(toggleSelfie(s),false);setGadget(s,'phone');toggleSelfie(s);assert.equal(selfieActive(s),true);
 s.view='third';assert.equal(selfieActive(s),false);s.view='first';
 const eye=[10,100,20],p=selfiePosition(eye,0,0);
 assert.ok(Math.abs(p[2]-(20-SELFIE.reach))<1e-9,'heading 0이면 -z(앞)로 팔 길이');assert.ok(Math.abs(Math.hypot(p[0]-eye[0],p[2]-eye[2])-Math.hypot(SELFIE.reach,SELFIE.side))<1e-9);
 const q=selfiePosition(eye,Math.PI/2,0);assert.ok(q[0]<eye[0]-.5,'heading 90°면 -x 쪽');
});
test('키 배정: 기구 모드 안에서만 Space·ESC·Tab·Y·± 의미가 바뀐다',()=>{
 assert.equal(commandFor('KeyB'),'binoculars');assert.equal(commandFor('KeyP'),'phone');
 assert.equal(commandFor('Space'),'pause');assert.equal(commandFor('Space','binoculars'),'pause');assert.equal(commandFor('Space','phone'),'shutter');
 assert.equal(commandFor('Escape'),'pause');assert.equal(commandFor('Escape','phone'),'gadget-off');assert.equal(commandFor('Escape','binoculars'),'gadget-off');
 assert.equal(commandFor('KeyY'),null);assert.equal(commandFor('Tab'),null);assert.equal(commandFor('KeyY','phone'),'selfie');assert.equal(commandFor('Tab','phone'),'selfie');
 assert.equal(commandFor('Equal','phone'),'zoom-in');assert.equal(commandFor('Minus','binoculars'),'zoom-out');assert.equal(commandFor('Equal'),null);
 for(const k of ['KeyW','KeyS','KeyH','KeyV','KeyC','KeyT','KeyR','KeyF','KeyM'])assert.equal(commandFor(k,'phone'),KEY_COMMANDS[k]??null,k);
 assert.ok(!Object.values(KEY_COMMANDS).includes('shutter'));
});
test('연무 줄임·사진 파일명',()=>{
 assert.equal(hazeScale(1),1);assert.equal(hazeScale(.5),1);assert.ok(Math.abs(hazeScale(4)-.5)<1e-12);
 assert.equal(photoFilename(new Date(2026,10,4,9,5,7)),'관악산-20261104-090507.png');
 assert.deepEqual(gadgetDefaults().phone,{zoom:1,selfie:false});
});
