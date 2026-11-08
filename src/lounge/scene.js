// 상황 고르기(B6): 출근 전 한 대(아침)·점심 먹고 한 대(낮)·퇴근길 한 대(노을)·회식 후 한 대(밤).
// 시간대는 main.js의 기존 setTime(낮·노을·밤 프리셋)을 그대로 쓰고, 'lounge:scene' {id}를 보낸다(NPC 화제는 npc.js가 받아서 바꾼다).
// 분위기는 <html data-scene>으로만 알린다(spots.css가 화면 가장자리에 아주 옅은 색을 얹는다). 단추·패널은 spots.js가 만든다.
export const SCENES=Object.freeze({
 morning:Object.freeze({id:'morning',icon:'☕',label:'출근 전 한 대',sub:'아침 · 쌀쌀해요',time:'day',mood:'chilly'}),
 lunch:Object.freeze({id:'lunch',icon:'🍱',label:'점심 먹고 한 대',sub:'낮 · 배불러요',time:'day',mood:'calm'}),
 evening:Object.freeze({id:'evening',icon:'🌇',label:'퇴근길 한 대',sub:'노을 · 홀가분',time:'dusk',mood:'warm'}),
 afterparty:Object.freeze({id:'afterparty',icon:'🍻',label:'회식 후 한 대',sub:'밤 · 알딸딸',time:'night',mood:'tipsy'}),
});
export const SCENE_IDS=Object.freeze(Object.keys(SCENES));
export const sceneOf=id=>SCENES[id]??null;

// setTime(mode): 시간대 바꾸기, dispatch(type,detail): window 이벤트, save(p): 프로필 저장, root: data-scene을 달 요소(<html>)
export function createScene({setTime,dispatch,save,profile=null,root=globalThis.document?.documentElement??null}){
 let current=null;
 const mark=id=>{if(!root)return;if(id)root.dataset.scene=id;else delete root.dataset.scene;};
 function set(id){
  const s=sceneOf(id);if(!s)return null;
  current=s.id;setTime?.(s.time);mark(s.id);save?.({scene:s.id,timeMode:s.time});
  dispatch?.('lounge:time',{mode:s.time});dispatch?.('lounge:scene',{id:s.id,time:s.time,mood:s.mood});
  return s;
 }
 function clear(){if(!current)return;current=null;mark(null);save?.({scene:null});}
 // 설정에서 시간을 다른 것으로 바꾸면 상황 분위기는 내린다(NPC 화제는 그대로 둔다).
 const onTime=e=>{const m=e.detail?.mode;if(current&&m&&m!==SCENES[current].time)clear();};
 globalThis.addEventListener?.('lounge:time',onTime);
 return {
  set,clear,
  get current(){return current;},
  get saved(){return sceneOf(profile?.scene)?.id??null;},
  list:SCENE_IDS.map(k=>SCENES[k]),
  dispose(){globalThis.removeEventListener?.('lounge:time',onTime);},
 };
}
