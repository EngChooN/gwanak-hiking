import {defineConfig} from 'vite';
// GitHub Pages 하위 경로 배포는 BASE_PATH=/gwanak-hiking/ 로 빌드한다(scripts/deploy-pages.mjs). 기본은 '/'.
const base=process.env.BASE_PATH||'/';
// 카툰 하나만 남아(2026-11-06) 모드별 청크 이름(mode-toon-·mode-realistic-)과 실사 inventory.json 개발 서버 경로는 쓰지 않는다.
export default defineConfig({base,build:{sourcemap:true}});
