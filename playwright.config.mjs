// e2e(기획서 §4): 실사·카툰 두 프로젝트. 배포와 같은 빌드본(vite preview)으로 돌린다 — 개발 서버는 공용 모듈을
// 원래 경로로 내보내 네트워크 격리 검사가 잘못 잡힌다(scripts/verify-style-network.mjs 주석 참고).
// 사용: npm run test:e2e   (기준 스냅샷 갱신: npm run test:e2e -- --update-snapshots)
import {defineConfig} from '@playwright/test';
const PORT=Number(process.env.E2E_PORT||4180);
export default defineConfig({
 testDir:'tests/e2e',
 timeout:600000,
 expect:{timeout:60000,toHaveScreenshot:{maxDiffPixelRatio:.02,threshold:.1}},
 workers:1,
 reporter:[['list']],
 outputDir:'artifacts/e2e-results',
 snapshotPathTemplate:'{testDir}/__snapshots__/{projectName}/{arg}{ext}',
 use:{
  baseURL:`http://127.0.0.1:${PORT}`,
  channel:'chrome',headless:true,
  viewport:{width:1280,height:800},deviceScaleFactor:1,
  launchOptions:{args:['--enable-webgl','--ignore-gpu-blocklist']},
 },
 projects:[
  {name:'realistic',metadata:{style:'realistic'}},
  {name:'toon',metadata:{style:'toon'}},
 ],
 webServer:{command:`npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort`,url:`http://127.0.0.1:${PORT}/`,reuseExistingServer:true,timeout:120000},
});
