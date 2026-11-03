// 복장 4종(대표 첨부 사진 왼쪽부터). 얼굴·신체는 따르지 않고 옷·착용품만 재현한다.
// 사진은 텍스처로 쓰지 않는다. 색·무늬는 hiker-outfits.js의 셰이더·절차 텍스처로 만든다. 색은 사진 눈대중(추정)이다.
export const OUTFIT_SAVE_KEY='gwanak-hiking:outfit';
export const DEFAULT_OUTFIT='lime-polo';
// items: 사진에서 보이는 착용품 체크리스트. id는 hiker-outfits.js가 만드는 부착물·영역 이름과 같다.
export const OUTFITS=Object.freeze([
 {id:'lime-polo',index:1,name:'연두 등산티',summary:'연두 반팔 카라티 · 빨간 반다나 · 갈색 선글라스 · 흰 벨트',
  top:{kind:'polo',sleeve:'short',base:'#b5d65a',side:null,center:null,accent:'#9fc24a',zip:null,collar:'#a9cc52',logo:{side:'left',color:'#2c3a2a',size:'small',shape:'oval'},placket:true},
  armSleeve:'#f2f2ee',pants:{color:'#17181b',roughness:.86,sheen:.1,logo:null,fit:'straight'},
  head:{hat:null,eyewear:{kind:'sunglasses',lens:'#5a3b26',frame:'#3a2a1e',tint:.8}},
  neck:{kind:'bandana',color:'#c8202a',pattern:'plain'},
  belt:{color:'#f1f1ee',buckle:'#b9bcc0'},waist:null,pack:'default',phone:null,
  items:[['상의','연두 반팔 카라티'],['카라','접힌 연두 카라'],['가슴 로고','왼쪽 가슴 작은 타원 로고'],['앞섶 단추','접힌 카라와 앞섶 단추 3개'],['팔토시','흰 팔토시(양팔)'],['반다나','목에 빨간 반다나'],['선글라스','갈색 렌즈 선글라스'],['벨트','흰 벨트'],['버클','은색 벨트 버클'],['바지','검정 바지'],['배낭','기존 배낭']]},
 {id:'navy-zip',index:2,name:'배색 집업',summary:'남색·주황·겨자 반집업 긴팔 · 검정 캡 · 허리 선글라스',
  top:{kind:'halfzip',sleeve:'long',base:'#2f4a78',side:{right:'#e98a3a',left:'#d7a23c'},center:null,accent:'#e98a3a',zip:'#e98a3a',collar:'#2f4a78',logo:{side:'right',color:'#d8c391',size:'patch',shape:'picture',inner:'#b98a2e',emblem:'#5a3a1c'}},
  armSleeve:null,pants:{color:'#141416',roughness:.78,sheen:.18,logo:null,fit:'regular'},
  head:{hat:{kind:'cap',color:'#16171a',accent:'#b3262b'},eyewear:null},
  neck:null,belt:{color:'#4b4d52',buckle:'#2a2b2e'},waist:{kind:'hanging-sunglasses',lens:'#111214',strap:'#202124'},pack:'default',phone:null,
  items:[['상의','남색 반집업 긴팔'],['옆판','주황(오른쪽)·겨자(왼쪽) 옆판'],['지퍼','반집업 지퍼와 손잡이'],['가슴 패치','오른쪽 가슴 겨자·베이지 그림 패치'],['모자','검정 캡모자'],['벨트','회색 벨트'],['버클','벨트 버클'],['허리 선글라스','바지 허리에 걸린 검정 선글라스'],['선글라스 끈','선글라스 끈'],['바지','검정 바지'],['배낭','기존 배낭']]},
 {id:'red-zip',index:3,name:'빨강 배색 집업',summary:'빨강·회색·자주 반집업 반팔 · 흰 팔토시 · 파란 페이즐리 두건',
  top:{kind:'halfzip',sleeve:'short',base:'#e0412f',side:{right:'#8e2232',left:'#8e2232'},center:'#8a8d92',accent:'#8a8d92',zip:'#9a9da2',collar:'#e0412f',logo:{side:'left',color:'#f4efe8',size:'patch',shape:'shield',inner:'#c8262c',emblem:'#c8262c'}},
  armSleeve:'#f2f2ee',pants:{color:'#121315',roughness:.7,sheen:.25,logo:{color:'#d33a2c',where:'left-shin'},fit:'slim'},
  head:{hat:{kind:'bandana',color:'#2f86c9',accent:'#9fd6f2',pattern:'paisley'},eyewear:{kind:'sport',lens:'#0d0f12',frame:'#141518',tint:.9}},
  neck:null,belt:null,waist:null,pack:'default',phone:null,
  items:[['상의','빨강 반집업 반팔'],['가운데 판','회색 가운데 판'],['옆판','자주 옆판'],['지퍼','반집업 지퍼와 손잡이'],['가슴 패치','왼쪽 가슴 작은 흰 방패 패치'],['팔토시','흰 팔토시(양팔)'],['두건','파란 페이즐리 두건'],['선글라스','검정 스포츠 선글라스'],['바지','검정 바지'],['바지 로고','무릎 아래 로고'],['배낭','기존 배낭']]},
 {id:'floral-shirt',index:4,name:'꽃무늬 셔츠',summary:'흰 바탕 파란 잎·꽃무늬 셔츠 · 흰 파나마 · 안경 · 자주 체크 스카프',
  top:{kind:'shirt',sleeve:'long',base:'#eef1f6',side:null,center:null,accent:'#3f63b8',zip:null,collar:'#eef1f6',pattern:'floral',logo:null},
  armSleeve:null,pants:{color:'#151517',roughness:.84,sheen:.12,logo:null,fit:'wide'},
  head:{hat:{kind:'panama',color:'#f3f1ea',band:'#1b1c1f'},eyewear:{kind:'glasses',frame:'#6b6f75'}},
  neck:{kind:'scarf',color:'#8c4c78',pattern:'check'},belt:null,waist:null,pack:'black-straps',phone:{color:'#2f6fd6',cord:'#1d3f86'},
  items:[['상의','흰 바탕 파란 잎·꽃무늬 긴팔 셔츠'],['모자','흰 챙모자(양옆 말린 챙·검정 띠)'],['안경','안경'],['스카프','목에 자주 체크 스카프'],['배낭 멜빵','검정 배낭 멜빵과 가슴 끈'],['휴대폰','파란 휴대폰과 고리'],['바지','검정 바지'],['배낭','검정 배낭']]},
]);
export const outfitById=id=>OUTFITS.find(o=>o.id===id)??null;
// ?outfit=1~4 또는 id. 잘못된 값은 null.
export function outfitFromParam(value){if(value===null||value===undefined||value==='')return null;const n=Number(value);return (Number.isInteger(n)?OUTFITS.find(o=>o.index===n):outfitById(String(value)))??null;}
export function loadOutfit(storage){try{return outfitById(storage?.getItem(OUTFIT_SAVE_KEY))?.id??null;}catch{return null;}}
export function saveOutfit(storage,id){if(!outfitById(id))return false;try{storage?.setItem(OUTFIT_SAVE_KEY,id);return true;}catch{return false;}}
// 선택 화면을 띄울지: 주소에 ?outfit=이 있거나 자동화 브라우저(navigator.webdriver)면 건너뛴다. ?outfitPicker=1은 강제로 띄운다.
export function pickerPlan({search='',webdriver=false,saved=null}={}){
 const params=new URLSearchParams(search),forced=params.get('outfitPicker')==='1',fromUrl=outfitFromParam(params.get('outfit'));
 const outfit=fromUrl?.id??saved??DEFAULT_OUTFIT;
 return {outfit,show:forced||(!fromUrl&&!webdriver),source:fromUrl?'url':saved?'saved':'default'};
}
