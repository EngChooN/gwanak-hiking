import {chromium} from '@playwright/test';
import {resolve} from 'node:path';
const b=await chromium.launch({channel:'chrome',headless:true});
try{const p=await b.newPage({viewport:{width:1560,height:1300},deviceScaleFactor:1});await p.goto(`file://${resolve('artifacts/hiker-interactions/캐릭터-동작-검증.html')}`);await p.locator('img').first().waitFor();await p.screenshot({path:'artifacts/hiker-interactions/검증-전체.png',fullPage:true});await p.locator('.close').screenshot({path:'artifacts/hiker-interactions/동작-확대.png'});}finally{await b.close();}
