// GitHub Pages 배포: 하위 경로(/gwanak-hiking/)로 빌드한 dist(허브 / · 등산 /hiking/ · 흡연장 /smoking/)만 gh-pages 브랜치에 올린다.
// 사용: npm run deploy            (빌드 → gh-pages 강제 push)
//       npm run deploy -- --dry   (빌드·크기 점검만, push 안 함)
// 원격은 현재 저장소의 origin(git@github-personal:EngChooN/gwanak-hiking.git)을 쓴다. 작업 폴더의 main 브랜치와 파일은 건드리지 않는다.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,cpSync,writeFileSync,readdirSync,statSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const dry=process.argv.includes('--dry'),BASE='/gwanak-hiking/',LIMIT=100*1024*1024;
const run=(cmd,args,opts={})=>execFileSync(cmd,args,{stdio:'inherit',...opts});
const out=(cmd,args,opts={})=>execFileSync(cmd,args,{encoding:'utf8',...opts}).trim();
run('npm',['run','build'],{env:{...process.env,BASE_PATH:BASE}});
const files=[];(function walk(d){for(const n of readdirSync(d)){const p=join(d,n),s=statSync(p);s.isDirectory()?walk(p):files.push([p,s.size]);}})('dist');
const total=files.reduce((a,[,s])=>a+s,0),big=files.filter(([,s])=>s>LIMIT);
console.log(`dist ${files.length}개 파일, ${(total/1048576).toFixed(1)}MB`);
const missing=['index.html','hiking/index.html','smoking/index.html'].filter(p=>!existsSync(join('dist',p)));
if(missing.length){console.error('빌드 결과에 페이지가 없음:',missing.join(', '));process.exit(1);}
console.log('페이지 3개 확인: / (허브) · /hiking/ · /smoking/');
if(big.length){console.error('100MB 초과 파일:',big.map(([p,s])=>`${p} ${(s/1048576).toFixed(1)}MB`).join(', '));process.exit(1);}
if(dry){console.log('--dry: push 하지 않고 끝냅니다.');process.exit(0);}
const remote=out('git',['remote','get-url','origin']),tmp=mkdtempSync(join(tmpdir(),'gwanak-pages-'));
try{
 cpSync('dist',tmp,{recursive:true});writeFileSync(join(tmp,'.nojekyll'),'');
 const git=(...a)=>run('git',a,{cwd:tmp});
 git('init','-q','-b','gh-pages');git('add','-A');git('commit','-q','-m',`배포: ${new Date().toISOString()}`);
 git('push','-f',remote,'gh-pages');
 console.log('배포 완료: https://engchoon.github.io/gwanak-hiking/ (허브) · …/hiking/ · …/smoking/ (Pages 설정: gh-pages 브랜치 / root)');
}finally{rmSync(tmp,{recursive:true,force:true});}
