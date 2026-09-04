import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',args:['--disable-gpu']});
try{
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=college-draft-timeline`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const timeline=await import('./src/ui/timeline.js?v=1.5.12');
    const phases=await import('./src/flow/phases.js?v=1.5.12');
    const s=state.newState('大學選秀測試',13,'IF',null);
    s.stage='U'; s.stageYr=3; s.age=21; s.year=2031; s.team='輔仁大學';
    s.teamName=function(){ return this.orgTeam+(this.lv==='CPBL1'?'一軍':'二軍'); };
    Object.keys(s.ab).forEach(k=>s.ab[k]=80);
    state.setS(s); timeline.resetTL(); phases.startYear();
    const draft=[...document.querySelectorAll('#act button')].find(b=>b.textContent.includes('投入中華職棒選秀'));
    if(!draft)throw new Error('找不到大學季前中職選秀按鈕');
    draft.click();
    await new Promise(r=>setTimeout(r,20));
    const latest=timeline.TL[timeline.TL.length-1];
    return {stage:s.stage,lv:s.lv,team:s.orgTeam,latest,leftText:document.getElementById('tl-list').textContent};
  });
  assert.equal(errors.length,0,errors.join('\n'));
  assert.equal(result.stage,'PRO');
  assert(result.latest.stage.startsWith('中職 · '),JSON.stringify(result));
  assert(!result.latest.stage.includes('大學'));
  assert(!result.latest.lab.startsWith('大'));
  assert(result.leftText.includes('中職'));
  console.log(JSON.stringify(result,null,2));
}finally{ await browser.close(); }
