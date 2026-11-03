// 실제 GPU 제출 전후 renderer.info 차이. 인스턴스·그룹·drawRange도 그대로 반영한다.
export function installRenderBreakdown(renderer){
 const original=renderer.renderBufferDirect;
 let rows={};
 renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
  let owner=object;while(owner&&!owner.userData?.metricKind)owner=owner.parent;
  const kind=owner?.userData.metricKind??'기타·후처리';
  const pass=material.isMeshDepthMaterial||material.isMeshDistanceMaterial?'그림자':scene?.overrideMaterial?'SSAO 깊이·법선':'기본·후처리';
  const calls=renderer.info.render.calls,triangles=renderer.info.render.triangles;
  const result=original.call(this,camera,scene,geometry,material,object,group);
  const key=`${kind}/${pass}`,row=rows[key]??(rows[key]={kind,pass,triangles:0,drawCalls:0});
  row.triangles+=renderer.info.render.triangles-triangles;row.drawCalls+=renderer.info.render.calls-calls;
  return result;
 };
 return {reset(){rows={};},snapshot(){return Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,{...v}]))}};
}
