// 저장 거리·통과 지점은 경로 기하와 체크포인트 배치에 종속된다.
// 수동 ROUTE_ID 갱신을 놓쳐도 이전 지형의 진행을 복구하지 않는다.
export function routeRevision(points, checkpoints, summitElevation) {
  let hash = 2166136261;
  const payload = JSON.stringify([
    summitElevation,
    points.map(({x,y,z,width}) => [x,y,z,width]),
    checkpoints.map(({id,s,reference,verified,temporary}) => [id,s,reference,verified,temporary]),
  ]);
  for (let i=0;i<payload.length;i++) {
    hash = Math.imul(hash ^ payload.charCodeAt(i), 16777619) >>> 0;
  }
  return `geometry-v1-${hash.toString(16).padStart(8,'0')}`;
}
