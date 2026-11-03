import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
const b=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
try{
 const p=await b.newPage({viewport:{width:1200,height:900}});await p.goto('http://127.0.0.1:5178/artifacts/arms/view.html');await p.waitForFunction(()=>window.ready);
 const rows=await p.evaluate(()=>{const rows=[];for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2])for(let n=0;n<16;n++){
  // 독립 표본에서 이전 표본의 접지 위치를 끌고 오지 않는다.
  for(const l of hiker.legs){l.wasPlanted=false;l.lock=false;l.rel?.set(0,0,0);}for(const pole of hiker.props.poles)pole.planted=false;
  const phase=n/8,r=show({moving:true,phase,heading});rows.push({phase,heading,...r});}return rows;});
 let opposed=0,relevant=0;
 for(const r of rows){
  const a=r.interaction.arms;for(const x of a){const sign=x.side==='Left'?-1:1;assert.ok(x.shoulder[0]*sign>0&&x.elbow[0]*sign>0&&x.wrist[0]*sign>0);assert.ok(x.elbow[1]<x.shoulder[1]-.08);}
  const handDelta=r.bones.LeftHand[2]-r.bones.RightHand[2],footDelta=r.bones.LeftFoot[2]-r.bones.RightFoot[2];
  if(Math.abs(footDelta)>.05){relevant++;if(handDelta*footDelta<0)opposed++;}
  for(const pole of r.interaction.poles){assert.ok(pole.error<.002);assert.ok(pole.gripError<.002);}
 }
 assert.ok(opposed/relevant>.9,`반대 팔·다리 ${opposed}/${relevant}`);
 const before=JSON.parse(readFileSync('artifacts/arms/before.json')).rows.find(r=>r.id==='front'),after=JSON.parse(readFileSync('artifacts/arms/after.json')).rows.find(r=>r.id==='front');
 for(const side of ['Left','Right'])assert.deepEqual(before.bones[side+'Arm'],after.bones[side+'Arm']);
 writeFileSync('artifacts/arms/model-check.json',JSON.stringify({rows,opposed,relevant},null,2));console.log('모델 검사',rows.length,'표본, 반대 팔·다리',opposed,relevant);
 await p.goto('http://127.0.0.1:5178/artifacts/arms/팔-어깨-수정전후.html');
 for(const n of [1,2])await p.locator(`#sheet-${n}`).screenshot({path:`artifacts/arms/compare-${n}.png`});
}finally{await b.close();}
