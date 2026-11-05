// 청크 스트리밍 대기(기획서 §4). 캡처 직전에 현재 위치의 지형·식생 청크가 붙을 때까지 기다린다.
// 대기 뒤 page를 그대로 돌려주므로 식 안에서도 `(await waitChunks(page)).screenshot(...)`로 쓴다.
// 청크 API가 없는 페이지(미리보기·시안)나 시작 전 화면에서는 바로 넘어간다. 최대 timeout ms까지만 기다린다.
export async function waitChunks(page,timeout=30000){
 try{
  await page.evaluate(ms=>{const c=window.hiking?.chunks;if(!window.hiking?.started||!c?.ready)return null;
   return Promise.race([c.ready(),new Promise(r=>setTimeout(r,ms))]).then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));},timeout);
 }catch{}
 return page;
}
