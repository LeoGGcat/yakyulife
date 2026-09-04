import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--disable-gpu']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=share-image-modes`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const share=await import('./src/ui/share-image.js?v=1.5.12');
    const s=state.newState('三版結算測試',11,'IF',null);
    s.stage='PRO'; s.year=2040; s.age=30; s.dpos='SS'; s.salary=8888;
    s.stats.CPBL={yr:1,G:120,PA:510,AB:450,H:150,HR:20,RBI:80,SB:10,BB:60,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,AS:1,DEF:8,DPG:{SS:120}};
    s.honors=['2040 中職年度MVP'];
    s.log=[{y:2040,age:30,tm:'新北騎士一軍',lv:'CPBL1',p:'SS',salary:8888,inj:false,
      st:{G:120,PA:510,AB:450,H:150,HR:20,RBI:80,SB:10,BB:60,avg:1/3,DEF:8}}];
    state.setS(s);
    const capture=mode=>{
      const drawn=[],original=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(value,...args){ drawn.push(String(value)); return original.call(this,value,...args); };
      try{ share.renderShareImage(['中職明星球員（評價分 3000）'],['這是一則鄉民留言'],{mode,ending:{title:'測試結局',body:'第一段。<br><br>第二段。'}}); }
      finally{ CanvasRenderingContext2D.prototype.fillText=original; }
      return drawn;
    };
    const endingData={title:'測試結局',body:'第一段。<br><br>第二段。'};
    const result={stats:capture('stats'),salary:capture('salary'),ending:capture('ending')};
    share.shareImageSheet(['中職明星球員（評價分 3000）'],['這是一則鄉民留言'],endingData);
    result.modeLabels=[...document.querySelectorAll('#sh-mode [data-sm]')].map(b=>b.textContent.trim());
    return result;
  });
  const has=(xs,t)=>xs.some(x=>x.includes(t));
  assert(has(result.stats,'生涯年表（職業成績）'));
  assert(has(result.stats,'生涯累積數據'));
  assert(has(result.salary,'生涯合約薪資與成績'));
  assert(has(result.salary,'8,888萬')||has(result.salary,'8888萬'));
  assert(!has(result.salary,'生涯評價'));
  assert(!has(result.salary,'生涯榮譽'));
  assert(has(result.ending,'引退結局 · 〈測試結局〉'));
  assert(has(result.ending,'第一段。'));
  assert(has(result.ending,'球迷看板 · 引退串'));
  assert(has(result.ending,'這是一則鄉民留言'));
  assert(!has(result.ending,'生涯累積數據'));
  assert(!has(result.ending,'生涯榮譽'));
  assert.deepEqual(result.modeLabels,['成績年表','合約與成績','結局與留言']);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({stats:result.stats.length,salary:result.salary.length,ending:result.ending.length},null,2));
}finally{ await browser.close(); }
