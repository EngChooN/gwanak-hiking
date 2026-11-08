// 빌드 뒤 정적 자료를 dist로 복사한다. 그래픽은 카툰 하나라(2026-11-06) 실사 전용 에셋은 배포에 넣지 않는다:
// assets/realistic/generated의 PBR 텍스처(jpg·png)·sky.hdr·nature/(실사 식생 GLB), assets/realistic/models(실사 등산객),
// 예전 실사 시제품 GLB(summit-approach·hiker-170). 파일 자체는 저장소에 남겨 두고(삭제는 산기획 확인 뒤) 복사만 뺀다.
// assets/realistic/generated의 지형 격자·경로·도시·물 자료(json·f32)는 카툰도 쓰므로 같은 경로로 복사한다.
import {cpSync,mkdirSync,existsSync,readdirSync,statSync} from 'node:fs';
mkdirSync('dist/assets/data',{recursive:true});
cpSync('assets/manifest.json','dist/assets/manifest.json');
cpSync('assets/data','dist/assets/data',{recursive:true});

// 카툰이 실제로 받는 자료만: 지형 격자(.f32)와 manifest·route·도시·물 json. 검수용 기록(json)은 뺀다.
const SHARED_DATA_SKIP=/^(sources|verification|elevation-audit|elevation-deltas|seoul-scenery-audit)\.json$/;
const sharedData=name=>/\.(json|f32)$/.test(name)&&!SHARED_DATA_SKIP.test(name);
const generated='assets/realistic/generated';
mkdirSync(`dist/${generated}`,{recursive:true});
let copied=0;
for(const name of readdirSync(generated)){
 if(!statSync(`${generated}/${name}`).isFile()||!sharedData(name))continue;
 cpSync(`${generated}/${name}`,`dist/${generated}/${name}`);copied++;
}
// assets/radio: 관악산 FM 곡·소리와 manifest.json(2026-11-08). 원본 그대로 복사(약 88MB — 압축안은 docs/변경기록-2026-11-08-동행-라디오.md)
for(const dir of ['assets/shared','assets/toon','assets/radio'])if(existsSync(dir))cpSync(dir,`dist/${dir}`,{recursive:true});
console.log(`카툰 에셋·공용 지형 자료 ${copied}개 복사 완료(실사 텍스처·HDR·식생·등산객 제외)`);
