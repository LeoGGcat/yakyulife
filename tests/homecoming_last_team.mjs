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
  await page.goto(`${url}?seed=homecoming-last-team`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const rng=await import('./src/core/rng.js?v=1.5.12');
    const contract=await import('./src/engine/contract.js?v=1.5.12');
    const phases=await import('./src/flow/phases.js?v=1.5.12');

    const teamName=function(){
      if(!this.orgTeam)return '';
      if(this.lv==='MLB'||this.lv==='CPBL1'||this.lv==='NPB1')return this.orgTeam;
      return this.orgTeam+'二軍';
    };

    /* 台中待得最久、也是較早的隊；出國當下效力新北，母隊必須是新北。 */
    const tracked=state.newState('母隊測試',7,'IF',null);
    tracked.stage='PRO'; tracked.org='CPBL'; tracked.lv='CPBL1'; tracked.orgTeam='新北騎士';
    tracked.teamName=teamName; tracked.lastLeagueTeam.CPBL='台中猛獁';
    tracked.lastCpblTeam='台中猛獁'; tracked.teamTally.CPBL={'台中猛獁':10,'新北騎士':2};
    Object.keys(tracked.ab).forEach(k=>tracked.ab[k]=60);
    state.setS(tracked);
    contract.signTo('NPB','NPB1','名古屋神龍',2,1,1000,true);
    const cpblAfterDeparture=contract.homeTeamOf('CPBL');
    contract.signTo('MiLB','MLB','紐約帝國',2,1,3000,true);
    const npbAfterDeparture=contract.homeTeamOf('NPB');

    /* 更新前已在海外的狀態沒有 lastLeagueTeam，改由逐年紀錄倒序找最後一隊。 */
    const legacy=state.newState('舊資料測試',8,'IF',null);
    legacy.stage='PRO'; legacy.org='NPB'; legacy.lv='NPB1'; legacy.orgTeam='千葉海潮'; legacy.teamName=teamName;
    delete legacy.lastLeagueTeam; legacy.lastCpblTeam='台中猛獁';
    legacy.teamTally.CPBL={'台中猛獁':8,'新北騎士':1};
    legacy.log=[
      {y:2029,lv:'CPBL1',tm:'台中猛獁'},
      {y:2030,lv:'CPBL1',tm:'新北騎士'},
      {y:2031,lv:'NPB1',tm:'千葉海潮'},
    ];
    state.setS(legacy);
    const legacyCpbl=contract.homeTeamOf('CPBL');

    /* 衰退期季前主動返台，也必須走同一套母隊判斷。 */
    const veteran=state.newState('老將回歸測試',9,'IF',null);
    veteran.stage='PRO'; veteran.org='NPB'; veteran.lv='NPB1'; veteran.orgTeam='千葉海潮';
    veteran.teamName=teamName; veteran.age=36; veteran.year=2046; veteran.rehab=0;
    veteran.lastLeagueTeam.CPBL='新北騎士'; veteran.lastCpblTeam='台中猛獁';
    veteran.teamTally.CPBL={'台中猛獁':12,'新北騎士':2};
    Object.keys(veteran.ab).forEach(k=>veteran.ab[k]=60);
    state.setS(veteran);
    phases.phasePre();
    const homecoming=[...document.querySelectorAll('#act button')].find(b=>b.textContent.includes('放棄合約，落葉歸根'));
    if(!homecoming)throw new Error('找不到衰退期落葉歸根選項');
    rng.seedInit('guaranteed-homecoming');
    const firstRoll=rng.R(); rng.seedInit('guaranteed-homecoming');
    if(firstRoll>=0.9)throw new Error('測試種子的母隊判定沒有落在 90% 內');
    homecoming.click();
    return {
      cpblAfterDeparture,
      npbAfterDeparture,
      legacyCpbl,
      veteranOrg:veteran.org,
      veteranTeam:veteran.orgTeam,
      resultText:document.getElementById('log').textContent,
    };
  });

  assert.equal(result.cpblAfterDeparture,'新北騎士');
  assert.equal(result.npbAfterDeparture,'名古屋神龍');
  assert.equal(result.legacyCpbl,'新北騎士');
  assert.equal(result.veteranOrg,'CPBL');
  assert.equal(result.veteranTeam,'新北騎士');
  assert(result.resultText.includes('回歸母隊'));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(result,null,2));
}finally{
  await browser.close();
}
