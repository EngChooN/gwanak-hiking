// 진단 전용. GPU 결과는 비동기로 읽고 동기 대기나 gl.finish를 사용하지 않는다.
export function createAOProfiler(renderer,enabled=false){
 const gl=renderer.getContext(),ext=enabled?gl.getExtension('EXT_disjoint_timer_query_webgl2'):null;
 const rows={},pending=[];
 const status={enabled,gpuSupported:!!ext,gpuDisjointSamples:0,rows};
 function measure(label,fn){
  if(!enabled)return fn();
  const row=rows[label]??(rows[label]={cpuSamples:0,cpuTotalMs:0,cpuMeanMs:0,gpuSamples:0,gpuTotalMs:0,gpuMeanMs:null});
  const query=ext&&pending.length<32?gl.createQuery():null;
  if(query)gl.beginQuery(ext.TIME_ELAPSED_EXT,query);
  const start=performance.now();
  try{return fn();}finally{
   row.cpuTotalMs+=performance.now()-start;row.cpuSamples++;row.cpuMeanMs=row.cpuTotalMs/row.cpuSamples;
   if(query){gl.endQuery(ext.TIME_ELAPSED_EXT);pending.push({query,row});}
  }
 }
 function poll(){
  if(!ext)return;
  if(gl.getParameter(ext.GPU_DISJOINT_EXT)){
   status.gpuDisjointSamples+=pending.length;for(const {query}of pending)gl.deleteQuery(query);pending.length=0;return;
  }
  for(let i=pending.length-1;i>=0;i--){const {query,row}=pending[i];
   if(!gl.getQueryParameter(query,gl.QUERY_RESULT_AVAILABLE))continue;
   row.gpuTotalMs+=gl.getQueryParameter(query,gl.QUERY_RESULT)/1e6;row.gpuSamples++;row.gpuMeanMs=row.gpuTotalMs/row.gpuSamples;
   gl.deleteQuery(query);pending.splice(i,1);
  }
 }
 return {status,measure,poll};
}
