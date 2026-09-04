import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--disable-gpu'],
});

try{
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=practice-late-trait`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const events=await import('./src/flow/events.js?v=1.5.12');
    const s=state.newState('遲到測試',0,'P',null);
    state.setS(s);
    const before=events.evOdds();

    events.recordTrainingSafeFailure({category:'encounter'},'safe',false);
    events.recordTrainingSafeFailure({category:'endorsement'},'safe',false);
    events.recordTrainingSafeFailure({category:'training'},'norm',false);
    events.recordTrainingSafeFailure({category:'training'},'safe',true);
    const ignoredCount=s.cntTrainingSafeFail;

    for(let i=0;i<19;i++)events.recordTrainingSafeFailure({category:'training'},'safe',false);
    events.checkTraitsMid();
    const atNineteen={count:s.cntTrainingSafeFail,unlocked:!!s.traits.latepractice};
    events.recordTrainingSafeFailure({category:'training'},'safe',false);
    events.checkTraitsMid();
    const atTwenty={count:s.cntTrainingSafeFail,unlocked:!!s.traits.latepractice};
    const after=events.evOdds();
    return {before,ignoredCount,atNineteen,atTwenty,after};
  });

  assert.equal(result.ignoredCount,0);
  assert.deepEqual(result.atNineteen,{count:19,unlocked:false});
  assert.deepEqual(result.atTwenty,{count:20,unlocked:true});
  assert.equal(result.after.safe,result.before.safe-5);
  assert.equal(result.after.norm,result.before.norm);
  assert.equal(result.after.bold,result.before.bold);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(result,null,2));
}finally{
  await browser.close();
}
