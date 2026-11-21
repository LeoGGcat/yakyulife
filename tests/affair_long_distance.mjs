import assert from 'node:assert/strict';
import {chromium} from 'playwright';

/* v2.1.6 遠距時的外遇與分手文案：她不在身邊，不能寫成「回到家她已經睡了」或「鑰匙放在餐桌上」。 */
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
  await page.goto(`${url}?seed=affair-ld`,{waitUntil:'domcontentloaded'});
  const r=await page.evaluate(async()=>{
    const rng=await import('./src/core/rng.js?v=2.1.5');
    const state=await import('./src/core/state.js?v=2.1.5');
    const love=await import('./src/flow/love.js?v=2.1.5');
    const log=document.getElementById('log'), act=document.getElementById('act');
    const setup=(apart,st)=>{
      const S=state.newState('測試',1,'P',null); state.setS(S);
      S.stage='PRO'; S.org='NPB'; S.age=30; S.year=2049;
      S.love.cast={TW:['haisha','ruotong','peici'],JP:['misaki','hiyori','sae'],US:['maya','sophia','naomi']};
      love.ensureLove(); const L=S.love;
      Object.assign(L,{st,pid:'ruotong',partner:'陳若彤',bond:10,ch:3,prop:0,proposed:true,dyrs:1,
        herC:apart?'TW':'JP',lastC:'JP',apart,apartYrs:apart?1:0,withYrs:0,aff:{misaki:80}});
      log.innerHTML=''; act.innerHTML='';
      return S;
    };
    const cardsText=()=>[...log.querySelectorAll('.card')].map(c=>c.textContent);
    /* 找一個「赴約、沒被抓到」的種子，看遠距與同住各自的文案 */
    const night=apart=>{
      for(let i=0;i<500;i++){
        setup(apart,'married'); rng.seedInit('ld'+i);
        love.loveEvent(()=>{});
        const t=act.querySelector('.title');
        if(!t||!t.textContent.includes('誘惑'))continue;
        act.querySelector('button').click();
        const c=cardsText().find(x=>x.startsWith('深夜'));
        if(c)return c;
      }
      return null;
    };
    const caughtDating=apart=>{
      setup(apart,'dating'); love.loveCaughtDating(()=>{});
      return act.querySelector('.title').textContent;
    };
    /* 感情冷淡第三年：直接分開 */
    const coldEnd=(apart,st)=>{
      const S=setup(apart,st); S.love.cold={pid:'ruotong',n:2}; rng.seedInit('cold');
      love.loveEvent(()=>{});
      return cardsText().find(x=>x.startsWith(st==='married'?'離婚':'分手'))||'';
    };
    const coldWarn=apart=>{
      const S=setup(apart,'married'); S.love.cold={pid:'ruotong',n:1}; rng.seedInit('cold');
      love.loveEvent(()=>{});
      return cardsText().find(x=>x.startsWith('冷淡'))||'';
    };
    return {nightFar:night(true),nightHome:night(false),cdFar:caughtDating(true),cdHome:caughtDating(false),
      coldFarM:coldEnd(true,'married'),coldFarD:coldEnd(true,'dating'),coldHomeD:coldEnd(false,'dating'),
      warnFar:coldWarn(true),warnHome:coldWarn(false)};
  });
  assert.ok(r.nightFar,'遠距時能觸發外遇沒被抓到');
  assert.ok(!r.nightFar.includes('已經睡了')&&r.nightFar.includes('訊息'),`遠距的深夜不是回家看到她睡著：${r.nightFar}`);
  assert.ok(r.nightHome&&r.nightHome.includes('已經睡了'),'同住時保留原本的文案');
  assert.ok(r.cdFar.includes('視訊')&&!r.cdHome.includes('視訊'),'遠距劈腿曝光後是接起視訊，不是見面');
  assert.ok(r.coldFarM.includes('寄了過來')&&!r.coldFarM.includes('餐桌'),`遠距冷淡離婚：${r.coldFarM}`);
  assert.ok(r.coldFarD.includes('訊息')&&!r.coldFarD.includes('鑰匙'),`遠距冷淡分手：${r.coldFarD}`);
  assert.ok(r.coldHomeD.includes('鑰匙'),'同住時保留鑰匙放餐桌');
  assert.ok(r.warnFar.includes('視訊')&&!r.warnFar.includes('放下'),`遠距冷淡警告：${r.warnFar}`);
  assert.ok(r.warnHome.includes('把手機放下'));
  assert.deepEqual(errors,[]);
  console.log('affair long distance ok');
}finally{ await browser.close(); }
