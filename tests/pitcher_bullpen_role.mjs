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
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=pitcher-bullpen-role`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const season=await import('./src/engine/season.js?v=1.5.12');
    const ability=await import('./src/engine/ability.js?v=1.5.12');
    const s=state.newState('牛棚定位測試',1,'P',null);
    s.stage='PRO'; s.lv='NPB1'; s.lastLv='NPB1'; s.role='MR';
    s.ab.sta=60; s.prevD=5;
    state.setS(s);
    const highStamina={overall:season.pitcherRole(),bullpen:season.bullpenRole()};
    s.prevD=2;
    const ordinaryMr=season.bullpenRole();
    s.role='CL'; s.prevD=1;
    const closerStays=season.bullpenRole();
    s.prevD=0.9;
    const closerDemotes=season.bullpenRole();
    s.role='MR'; s.prevD=8; s.lastLv='CPBL1';
    const crossLeague=season.bullpenRole();
    s.lv='NPB1'; s.lastLv='NPB1'; s.role='MR'; s.prevD=5; s.ab.sta=60;
    let continued=false;
    ability.dposReview(()=>{continued=true;});
    const buttons=[...document.querySelectorAll('#act button')];
    const stayBullpenLabel=buttons[1].innerText;
    buttons[1].click();
    const refusal={role:s.role,continued,stayBullpenLabel};
    return {highStamina,ordinaryMr,closerStays,closerDemotes,crossLeague,refusal};
  });
  assert.deepEqual(result,{
    highStamina:{overall:'SP',bullpen:'CL'},
    ordinaryMr:'MR',closerStays:'CL',closerDemotes:'MR',crossLeague:'MR',
    refusal:{role:'CL',continued:true,stayBullpenLabel:'留在牛棚，守住我的位置調整為終結者定位'},
  });
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(result,null,2));
}finally{ await browser.close(); }
