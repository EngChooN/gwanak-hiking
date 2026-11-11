// 함께 걷기 서버 주소 공개 파일(multi-server.json)을 gh-pages 브랜치 맨 위에 올린다. 사이트 전체를 다시 빌드·배포하지 않는다.
// 사이트(src/server-link.js)는 들어올 때마다 …/gwanak-hiking/multi-server.json?t=… 을 새로 받아 서버 주소를 찾는다.
// 방법: node_modules/.cache/gwanak-pages.git(맨 저장소, 파일 내용 없이 목록만 받는 partial clone)에서
//       지금 gh-pages 커밋의 목록 + 새 파일 하나로 커밋을 만들어 push(강제 아님). 작업 폴더·main 브랜치는 건드리지 않는다.
// 사용: node scripts/multi-publish.mjs wss://xxxx.trycloudflare.com   (켜짐)
//       node scripts/multi-publish.mjs off                            (꺼짐)
//       node scripts/multi-publish.mjs --show                         (지금 gh-pages에 올라 있는 내용)
import {execFileSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export const FILE='multi-server.json',BRANCH='gh-pages';
const ROOT=resolve(import.meta.dirname,'..'),CACHE=join(ROOT,'node_modules/.cache/gwanak-pages.git');

/** 공개 파일 내용. url이 없거나 'off'면 꺼짐. */
export function serverFileBody(url,now=new Date()){
 const on=!!url&&url!=='off';
 return JSON.stringify(on?{state:'on',url,updated:now.toISOString()}:{state:'off',url:'',updated:now.toISOString()})+'\n';
}

const git=(args,opts={})=>execFileSync('git',['--git-dir',CACHE,...args],{encoding:'utf8',stdio:['pipe','pipe','pipe'],...opts}).trim();
function remoteUrl(){return execFileSync('git',['-C',ROOT,'remote','get-url','origin'],{encoding:'utf8'}).trim();}
function prepare(){
 if(!existsSync(CACHE)){
  mkdirSync(CACHE,{recursive:true});
  git(['init','-q','--bare']);
  git(['remote','add','origin',remoteUrl()]);
  git(['config','remote.origin.promisor','true']);
  git(['config','remote.origin.partialclonefilter','blob:none']);
  git(['config','extensions.partialClone','origin']);
 }else git(['remote','set-url','origin',remoteUrl()]);
}
function fetchBranch(){
 git(['fetch','-q','--filter=blob:none','--no-tags','origin',`+refs/heads/${BRANCH}:refs/heads/${BRANCH}`],{timeout:120000});
 return git(['rev-parse',`refs/heads/${BRANCH}`]);
}

/** 지금 gh-pages에 올라 있는 공개 파일 내용(없으면 null). deploy-pages.mjs가 배포 때 이어 붙이려고 쓴다. */
export function readPublished(){
 prepare();
 try{fetchBranch();}catch{return null;}
 try{return git(['cat-file','blob',`refs/heads/${BRANCH}:${FILE}`],{timeout:60000})+'\n';}catch{return null;}
}

/** 공개 파일을 올린다. 다른 곳에서 gh-pages가 바뀌어 push가 거절되면 한 번 다시 받아 다시 올린다. */
export function publishServerFile(url,{log=console.log}={}){
 prepare();
 const body=serverFileBody(url);
 for(let attempt=0;;attempt++){
  const parent=fetchBranch();
  const blob=git(['hash-object','-w','--stdin'],{input:body});
  const index=join(mkdtempSync(join(tmpdir(),'gwanak-pub-')),'index'),env={...process.env,GIT_INDEX_FILE:index};
  try{
   git(['read-tree',`${parent}^{tree}`],{env});
   git(['update-index','--add','--cacheinfo',`100644,${blob},${FILE}`],{env});
   const tree=git(['write-tree','--missing-ok'],{env});
   if(tree===git(['rev-parse',`${parent}^{tree}`])){log(`[공개 파일] 바뀐 것 없음: ${body.trim()}`);return body;}
   const msg=`함께 걷기 서버 주소: ${url&&url!=='off'?url:'꺼짐'}`;
   const commit=git(['commit-tree',tree,'-p',parent,'-m',msg],{env:{...env,GIT_AUTHOR_NAME:'gwanak multi:up',GIT_AUTHOR_EMAIL:'multi-up@localhost',GIT_COMMITTER_NAME:'gwanak multi:up',GIT_COMMITTER_EMAIL:'multi-up@localhost'}});
   git(['push','-q','origin',`${commit}:refs/heads/${BRANCH}`],{timeout:120000});
   log(`[공개 파일] gh-pages에 올림 (${commit.slice(0,7)}): ${body.trim()}`);
   return body;
  }catch(e){
   if(attempt>=1)throw e;
   log(`[공개 파일] push가 거절되어 다시 받아 올립니다: ${String(e.stderr||e.message).trim().split('\n')[0]}`);
  }finally{try{unlinkSync(index);}catch{}}
 }
}

if(import.meta.url===pathToFileURL(process.argv[1]??'').href){
 const a=process.argv[2];
 if(!a){console.error('사용: node scripts/multi-publish.mjs <wss://주소|off|--show>');process.exit(2);}
 if(a==='--show'){process.stdout.write(readPublished()??'(gh-pages에 multi-server.json 없음)\n');}
 else publishServerFile(a==='off'?'':a);
}
