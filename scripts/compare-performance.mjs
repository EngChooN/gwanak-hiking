import {readFile,writeFile} from 'node:fs/promises';
const read=async label=>JSON.parse(await readFile(`artifacts/performance-${label}/results.json`));
const before=await read(process.env.BEFORE_LABEL??'before'),after=await read(process.env.AFTER_LABEL??'after');
const value=n=>Number.isFinite(n)?n.toFixed(1):'미측정';
const percent=r=>r.frame.frames?`${(100*r.frame.over50ms/r.frame.frames).toFixed(2)}%`:'미측정';
const rows=['| 조건 | 전 fps | 후 fps | 전 p95 ms | 후 p95 ms | 전/후 >50ms 비율 | 전/후 드로우콜 | 전/후 삼각형 | 판정 |','|---|---:|---:|---:|---:|---|---|---|---|'];
for(const a of after.runs){const b=before.runs.find(r=>r.id===a.id);if(!b)continue;rows.push(`| ${a.id} | ${value(b.frame.fps)} | ${value(a.frame.fps)} | ${value(b.frame.p95Ms)} | ${value(a.frame.p95Ms)} | ${percent(b)} / ${percent(a)} | ${value(b.performance?.drawCalls)} / ${value(a.performance?.drawCalls)} | ${value(b.performance?.triangles)} / ${value(a.performance?.triangles)} | ${a.pass?'통과':'미달'} |`);}
await writeFile('artifacts/performance-comparison.md',`# Chrome 보행 성능 전후\n\n환경: ${JSON.stringify(after.environment)}\n\n${rows.join('\n')}\n\n> 50ms 초과 비율 1% 이하를 ‘거의 없음’의 임시 정량 기준으로 사용한다. CPU 감속은 GPU 감속을 의미하지 않는다. 원본 trace와 cpuprofile은 각 측정 폴더에 보관한다.\n`);
