import {defineConfig} from 'vite';
import {resolve} from 'node:path';
// GitHub Pages 하위 경로 배포는 BASE_PATH=/gwanak-hiking/ 로 빌드한다(scripts/deploy-pages.mjs). 기본은 '/'.
const base=process.env.BASE_PATH||'/';
// 다중 페이지(2026-11-08 메타버스 통합): / 허브 · /hiking/ 온라인 등산 · /smoking/ 온라인 흡연장.
// 세 페이지 모두 같은 base를 쓰므로 에셋(public·assets)은 `${import.meta.env.BASE_URL}assets/…`로 한 벌을 같이 받는다.
// 카툰 하나만 남아(2026-11-06) 모드별 청크 이름(mode-toon-·mode-realistic-)과 실사 inventory.json 개발 서버 경로는 쓰지 않는다.
export const PAGES={main:'index.html',hiking:'hiking/index.html',smoking:'smoking/index.html'};
// 의견 보내기(src/feedback.js)의 「빌드」 줄에 쓰는 빌드 날짜(서울)
const BUILD_DATE=new Date(Date.now()+9*3600e3).toISOString().slice(0,10);
export default defineConfig({base,define:{__BUILD_DATE__:JSON.stringify(BUILD_DATE)},build:{sourcemap:true,chunkSizeWarningLimit:1500,rollupOptions:{input:Object.fromEntries(Object.entries(PAGES).map(([k,v])=>[k,resolve(import.meta.dirname,v)]))}}});
