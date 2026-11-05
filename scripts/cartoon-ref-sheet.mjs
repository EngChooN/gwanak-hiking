// 참고 폴더마다 파일명이 붙은 전체 목록 이미지를 만든다(색 찍을 사진 고르기용). 참고 사진이 들어가므로 커밋하지 않는다.
// 사용: node scripts/cartoon-ref-sheet.mjs [폴더번호…]  → artifacts/cartoon-compare/sheets/NN.png
import {mkdirSync,writeFileSync} from 'node:fs';
import {refFolders,refFiles,withCanvasPage,composeGrid,REF_DIR} from './lib/ref-image.mjs';
const out='artifacts/cartoon-compare/sheets';mkdirSync(out,{recursive:true});
const want=process.argv.slice(2);
await withCanvasPage(async page=>{
 for(const folder of refFolders()){
  if(want.length&&!want.includes(folder.slice(0,2)))continue;
  const tiles=refFiles(folder).map(f=>({path:`${REF_DIR}/${folder}/${f}`,label:f}));
  writeFileSync(`${out}/${folder.slice(0,2)}.png`,await composeGrid(page,tiles,{cols:5,cellW:400,title:folder}));
  console.log(folder,tiles.length);
 }
});
