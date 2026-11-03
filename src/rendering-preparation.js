// 로딩 때만 실행한다. AO는 장면 재질 변형이 아니라 별도 후처리 경로다.
export async function warmRenderingPaths({apply,compile,render,restore,mobile=false}){
 try{
  for(const quality of [0,1,2]){
   apply(quality,false);
   await compile();
   render();
   if(quality===2&&!mobile){apply(quality,true);render();}
  }
 }finally{restore();}
}
