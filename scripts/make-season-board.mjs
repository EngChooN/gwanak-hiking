// 계절 촬영 보드: 같은 자리의 봄·여름·가을·겨울(또는 지정한 파일들)을 2×2로 붙인다.
//   node scripts/make-season-board.mjs <out.png> <제목> <파일1:라벨1> <파일2:라벨2> ...
import {writeFileSync} from 'node:fs';
import {withCanvasPage,composeGrid} from './lib/ref-image.mjs';
const [out,title,...items]=process.argv.slice(2);
const tiles=items.map(s=>{const i=s.lastIndexOf(':');return {path:s.slice(0,i),label:s.slice(i+1)};});
await withCanvasPage(async page=>{writeFileSync(out,await composeGrid(page,tiles,{cols:2,cellW:960,title}));});
console.log(out);
