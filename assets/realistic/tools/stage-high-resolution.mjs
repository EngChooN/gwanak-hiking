// 로컬 자료 검토본만 생성한다. 네트워크·generated/ 수정·자동 앱 연결 없음.
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {alignRoute, gridHeight} from '../geo.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const fail=message=>{throw new Error(message);};
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const readJSON=async file=>JSON.parse(await readFile(file,'utf8'));
const input=process.argv[2];
if(!input)fail('사용법: node assets/realistic/tools/stage-high-resolution.mjs <로컬 입력 JSON>');
const inputPath=path.resolve(input),spec=await readJSON(inputPath);
const manifest=await readJSON(path.join(root,'generated/manifest.json'));
const config=await readJSON(path.join(root,'config.json'));
const g=spec.grid,source=spec.source;
if(!g||!source)fail('grid·source 필수');
for(const key of ['title','url','license','licenseEvidence','acquiredAt','sha256']){
  if(typeof source[key]!=='string'||!source[key].trim())fail(`출처 누락: ${key}`);
}
if(source.terrainRedistributionAllowed!==true)fail('가공 지형의 웹 재배포 이용 조건 확인 필요');
if(!(source.resolutionMetres>0&&source.resolutionMetres<=5))fail('원자료 해상도가 5m 이하여야 함');
if(!(g.spacing>=source.resolutionMetres&&g.spacing<=5))fail('격자 간격은 원자료 해상도 이상, 5m 이하');
if(g.format!=='float32-little-endian'||g.units!=='metres'||g.north!=='-Z')fail('프로젝트 좌표·격자 형식 불일치');
if(!g.origin||g.origin.lat!==config.origin.lat||g.origin.lon!==config.origin.lon)fail('project() 원점으로 사전 재투영 필요');
if(g.verticalDatum!==config.dem.verticalDatum)fail('수직 기준 변환·DTM/DSM 차이 검토 필요. 자동 가감 금지');
if(![g.x0,g.z0].every(Number.isFinite)||![g.width,g.height].every(n=>Number.isSafeInteger(n)&&n>=2))fail('격자 크기·원점 오류');
const count=g.width*g.height;
if(!Number.isSafeInteger(count)||count*4>256*1024*1024)fail('검토본 256MiB 상한 초과: 타일화 필요');
if(typeof g.file!=='string'||path.isAbsolute(g.file))fail('grid.file은 입력 JSON 기준 상대 경로');
const bytes=await readFile(path.resolve(path.dirname(inputPath),g.file));
if(bytes.length!==count*4||digest(bytes)!==source.sha256)fail('DEM 바이트 수·SHA256 불일치');
const values=new Float32Array(count),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
for(let i=0;i<count;i++){
  const h=view.getFloat32(i*4,true);
  if(!Number.isFinite(h)||h===g.noData||h< -100||h>3000)fail(`NoData/비정상 표고: ${i}`);
  values[i]=h;
}
const grid={...g,values};
// 클램프 보간으로 누락 영역을 숨기지 않는다. 기존 근경 전체를 덮는 검토본만 허용.
const old=manifest.near;
if(g.x0>old.x0||g.z0>old.z0||g.x0+(g.width-1)*g.spacing<old.x0+(old.width-1)*old.spacing||g.z0+(g.height-1)*g.spacing<old.z0+(old.height-1)*old.spacing)fail('기존 근경 범위 미포함: 경계 블렌딩·부분 타일 지원 전 연결 불가');
const previous=await readJSON(path.join(root,'generated/route.json'));
if(previous.length!==337)fail('GPX 337점 기준 변경 확인 필요');
if(!previous.every(p=>[p.originalY,p.x,p.z,p.width].every(Number.isFinite)))fail('경로 원본 표고·좌표·폭 누락');
const next=alignRoute(previous.map(p=>({...p,y:p.originalY})),(x,z)=>gridHeight(grid,x,z),{
  // 기존 기준 유지. 새로운 실측 표고로 확정하는 것은 아님.
  startHeight:previous[0].y,summitHeight:previous.at(-1).y
}).map((p,i)=>({...p,width:previous[i].width}));
const changes=next.map((p,i)=>({index:p.index,oldY:previous[i].y,y:p.y,delta:p.y-previous[i].y,demCenterY:p.demCenterY,elevationCorrection:p.elevationCorrection}));
const near={x0:g.x0,z0:g.z0,width:g.width,height:g.height,spacing:g.spacing,file:'near.f32',format:g.format,bytes:bytes.length};
const audit={status:'검토본 — 실행·접지·성능·실경 검수 전 앱 연결 금지',source,grid:g,
  previousRouteSHA256:digest(await readFile(path.join(root,'generated/route.json'))),
  endpointPolicy:'기존 입구·정상 표고 유지. 새 실측 근거 아님',
  maxRouteDelta:Math.max(...changes.map(p=>Math.abs(p.delta))),changes,
  meshWarning:'load-landscape.js의 stride 8/4/2가 입력 spacing에 비례하므로 성능 예산 재검증 필수',
  orthoStatus:'정사영상·분류 마스크·암릉 사진 배치는 별도 미구현'};
// 새 디렉터리를 독점 생성한다. 같은 이름이 있으면 덮어쓰지 않고 실패한다.
const output=path.join(root,'staged-high-resolution');
await mkdir(output);
await writeFile(path.join(output,'near.f32'),bytes,{flag:'wx'});
await writeFile(path.join(output,'route.json'),JSON.stringify(next),{flag:'wx'});
await writeFile(path.join(output,'candidate-manifest.json'),JSON.stringify({...manifest,near}),{flag:'wx'});
await writeFile(path.join(output,'audit.json'),JSON.stringify(audit,null,2),{flag:'wx'});
console.log('검토본 생성:',output,'— generated/는 변경하지 않았습니다.');
