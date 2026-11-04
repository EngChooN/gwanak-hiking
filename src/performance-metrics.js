export function createFrameMetrics(limit=3600){
  let samples=[],pending={};
  return {
    stage(name,fn){const start=performance.now();const result=fn();pending[name]=(pending[name]??0)+performance.now()-start;return result;},
    frame(ms,info){samples.push({ms,...pending,...info});pending={};if(samples.length>limit)samples.shift();},
    reset(){samples=[];pending={};},
    report(){
      const times=samples.map(s=>s.ms).sort((a,b)=>a-b),n=times.length;
      const avg=key=>n?samples.reduce((sum,s)=>sum+(s[key]??0),0)/n:0;
      const breakdown={},categories={};for(const s of samples){const frameCategories={};for(const [key,row]of Object.entries(s.breakdown??{})){
        const out=breakdown[key]??(breakdown[key]={kind:row.kind,pass:row.pass,triangles:0,drawCalls:0,maxTriangles:0});
        out.triangles+=row.triangles/n;out.drawCalls+=row.drawCalls/n;out.maxTriangles=Math.max(out.maxTriangles,row.triangles);
        const total=frameCategories[row.kind]??(frameCategories[row.kind]={triangles:0,drawCalls:0});total.triangles+=row.triangles;total.drawCalls+=row.drawCalls;
      }
      for(const [kind,total]of Object.entries(frameCategories)){
        const out=categories[kind]??(categories[kind]={triangles:0,drawCalls:0,maxTriangles:0,maxDrawCalls:0});
        out.triangles+=total.triangles/n;out.drawCalls+=total.drawCalls/n;out.maxTriangles=Math.max(out.maxTriangles,total.triangles);out.maxDrawCalls=Math.max(out.maxDrawCalls,total.drawCalls);
      }
      }
      return {frames:n,breakdown,categories,fps:1000/(avg('ms')||Infinity),p95Ms:times[Math.floor(n*.95)]??0,p99Ms:times[Math.floor(n*.99)]??0,maxMs:times.at(-1)??0,over50ms:times.filter(t=>t>50).length,
        cpuMs:Object.fromEntries(['movement','ambient','hiker','contact','camera','terrain','render','multi'].map(k=>[k,avg(k)])),drawCalls:avg('drawCalls'),triangles:avg('triangles'),maxTriangles:samples.reduce((max,s)=>Math.max(max,s.triangles??0),0),textures:avg('textures')};
    }
  };
}
