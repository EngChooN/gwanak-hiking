// 바탕 화면 JPG를 시안 HTML 안에 넣어 파일 하나로 열리게 만든다.
import {readFileSync,writeFileSync} from 'node:fs';
const t=readFileSync(new URL('./사계절-시안.template.html',import.meta.url),'utf8');
const out=t.replace(/__IMG_(\w+)__/g,(_,k)=>'data:image/jpeg;base64,'+readFileSync(new URL(`./base/${k}.jpg`,import.meta.url)).toString('base64'));
writeFileSync(new URL('./사계절-시안.html',import.meta.url),out);console.log('ok');
