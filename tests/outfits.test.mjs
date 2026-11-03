import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {OUTFITS,OUTFIT_SAVE_KEY,DEFAULT_OUTFIT,outfitById,outfitFromParam,loadOutfit,saveOutfit,pickerPlan} from '../src/outfit-config.js';
const memory=()=>{const m=new Map();return {getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),map:m};};

test('복장 4종: 사진 왼쪽부터 순서·이름·착용품 체크리스트',()=>{
 assert.deepEqual(OUTFITS.map(o=>[o.index,o.id,o.name]),[[1,'lime-polo','연두 등산티'],[2,'navy-zip','배색 집업'],[3,'red-zip','빨강 배색 집업'],[4,'floral-shirt','꽃무늬 셔츠']]);
 const items=o=>o.items.map(([k])=>k);
 assert.ok(['팔토시','반다나','선글라스','벨트','버클','가슴 로고'].every(k=>items(OUTFITS[0]).includes(k)));
 assert.ok(['모자','벨트','버클','허리 선글라스','선글라스 끈','지퍼','가슴 패치','옆판'].every(k=>items(OUTFITS[1]).includes(k)));
 assert.ok(['팔토시','두건','선글라스','지퍼','가슴 패치','가운데 판','옆판','바지 로고'].every(k=>items(OUTFITS[2]).includes(k)));
 assert.ok(['모자','안경','스카프','배낭 멜빵','휴대폰'].every(k=>items(OUTFITS[3]).includes(k)));
 // 바지는 넷 다 검정 계열, 3번만 무릎 아래 로고
 for(const o of OUTFITS){const c=parseInt(o.pants.color.slice(1),16);assert.ok([c>>16,(c>>8)&255,c&255].every(v=>v<40),o.id);}
 assert.deepEqual(OUTFITS.map(o=>!!o.pants.logo),[false,false,true,false]);
 // 배낭은 4번만 검정 멜빵, 나머지 기존 배낭
 assert.deepEqual(OUTFITS.map(o=>o.pack),['default','default','default','black-straps']);
 assert.deepEqual(OUTFITS.map(o=>o.top.sleeve),['short','long','short','long']);
 assert.deepEqual(OUTFITS.map(o=>!!o.armSleeve),[true,false,true,false]);
 assert.deepEqual(OUTFITS.map(o=>o.head.hat?.kind??null),[null,'cap','bandana','panama']);
 assert.deepEqual(OUTFITS.map(o=>o.head.eyewear?.kind??null),['sunglasses',null,'sport','glasses']);
 assert.equal(outfitById(DEFAULT_OUTFIT).index,1);
});

test('주소 ?outfit=1~4 또는 id, 잘못된 값은 무시',()=>{
 assert.equal(outfitFromParam('1').id,'lime-polo');assert.equal(outfitFromParam('4').id,'floral-shirt');assert.equal(outfitFromParam('red-zip').index,3);
 for(const v of ['0','5','x','',null,undefined,'1.5'])assert.equal(outfitFromParam(v),null);
});

test('저장·복원: localStorage 키 하나, 잘못된 저장은 무시, 저장 실패도 안전',()=>{
 const s=memory();assert.equal(loadOutfit(s),null);assert.equal(saveOutfit(s,'navy-zip'),true);assert.equal(s.map.get(OUTFIT_SAVE_KEY),'navy-zip');assert.equal(loadOutfit(s),'navy-zip');
 assert.equal(saveOutfit(s,'없음'),false);assert.equal(loadOutfit(s),'navy-zip');
 s.setItem(OUTFIT_SAVE_KEY,'broken');assert.equal(loadOutfit(s),null);
 const throwing={getItem(){throw new Error('denied');},setItem(){throw new Error('denied');}};assert.equal(loadOutfit(throwing),null);assert.equal(saveOutfit(throwing,'red-zip'),false);
});

test('선택 화면: 첫 접속은 띄우고, 저장된 복장이 기본 선택, ?outfit=·자동화 브라우저는 건너뜀',()=>{
 assert.deepEqual(pickerPlan({}),{outfit:DEFAULT_OUTFIT,show:true,source:'default'});
 assert.deepEqual(pickerPlan({saved:'red-zip'}),{outfit:'red-zip',show:true,source:'saved'});
 assert.deepEqual(pickerPlan({search:'?outfit=2',saved:'red-zip'}),{outfit:'navy-zip',show:false,source:'url'});
 assert.equal(pickerPlan({webdriver:true}).show,false,'캡처·측정 스크립트는 막히지 않는다');
 assert.equal(pickerPlan({webdriver:true,search:'?outfitPicker=1'}).show,true);
 assert.deepEqual(pickerPlan({search:'?outfit=9'}),{outfit:DEFAULT_OUTFIT,show:true,source:'default'});
 assert.equal(pickerPlan({search:'?start=entrance&outfit=4'}).outfit,'floral-shirt');
});

test('연결: 선택이 곧 시작, 지도(M) 창 바꾸기, 기존 뼈대·동작은 건드리지 않음',()=>{
 const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
 assert.match(main,/const manualStart=outfitPlan\.show\|\|/);
 assert.match(main,/mountOutfitPicker\(\{previews,selected:outfitPlan\.outfit,onPick:id=>\{setOutfit\(id\);outfitMenu\?\.update\(id\);unlockSound\(\);window\.hiking\.start\(\);\}\}\)/);
 assert.match(main,/mountOutfitMenu\(\$\('map'\)/);assert.match(main,/navigator\.webdriver===true/);
 const outfits=readFileSync(new URL('../src/hiker-outfits.js',import.meta.url),'utf8');
 // 사진을 텍스처로 읽지 않는다(이미지 로더·첨부 경로 없음).
 assert.doesNotMatch(outfits,/TextureLoader|AI Office|\.png|\.jpg/);
 // 애니메이션·IK 대상(뼈 회전)을 바꾸지 않고 자식 부착물만 더한다.
 assert.doesNotMatch(outfits,/\.quaternion\.|\.rotation\.set\([^)]*\)\s*;\s*skeleton|mixer|clipAction/);
 assert.match(outfits,/holder\.matrix\.copy\(skeleton\.boneInverses\[i\]\)/);
 const hiker=readFileSync(new URL('../src/realistic-hiker.js',import.meta.url),'utf8');assert.doesNotMatch(hiker,/outfit/,'산풍경 담당 파일은 수정하지 않음');
});
