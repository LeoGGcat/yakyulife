import assert from 'node:assert/strict';
import {chromium} from 'playwright';

/* 下放通知／戰力外時改投中職，也必須走母隊判定並出現「回歸母隊」文案（落葉歸根）。 */
const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--disable-gpu'],
});

try{
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=homecoming-demotion`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.4');
    const rng=await import('./src/core/rng.js?v=2.1.4');
    const contract=await import('./src/engine/contract.js?v=2.1.4');
    const {LV}=await import('./src/data/teams.js?v=2.1.4');
    const teamName=function(){
      if(!this.orgTeam)return '';
      if(this.lv==='MLB'||this.lv==='CPBL1'||this.lv==='NPB1')return this.orgTeam;
      return this.orgTeam+'二軍';
    };
    const fresh=()=>{
      const s=state.newState('下放回歸測試',7,'IF',null);
      s.stage='PRO'; s.org='CPBL'; s.lv='CPBL1'; s.orgTeam='台中猛獁'; s.teamName=teamName; s.age=29;
      Object.keys(s.ab).forEach(k=>s.ab[k]=60);
      state.setS(s);
      contract.signTo('NPB','NPB1','名古屋神龍',3,1,2000,true);
      document.getElementById('act').innerHTML='';
      return s;
    };
    /* 只看這次新增的紀錄：清空 #log 會讓卡片寫進已脫離畫面的年度區塊。 */
    const logLen=()=>document.getElementById('log').textContent.length;
    const btn=text=>[...document.querySelectorAll('#act button')].find(b=>b.textContent.includes(text));

    /* 1) 日職一軍下放、其他聯盟遞約：找一個會出現「返台加盟中職一軍」的種子，且母隊判定落在 90% 內。 */
    let demotion=null;
    for(let k=0;k<200&&!demotion;k++){
      const s=fresh(), start=logLen();
      rng.seedInit('demote-'+k);
      contract.handleDemotion(LV.NPB2.min+1,['NPB2','NPB1'],1);
      const accept=btn('接受下放，繼續奮鬥'); if(accept)accept.click();
      const back=btn('返台加盟中職一軍'); if(!back)continue;
      back.click();
      const log=document.getElementById('log').textContent.slice(start);
      if(log.includes('回歸母隊'))demotion={org:s.org,team:s.orgTeam,log};
    }

    /* 2) 戰力外通告後接受中職合約。 */
    let released=null;
    for(let k=0;k<200&&!released;k++){
      const s=fresh(), start=logLen();
      rng.seedInit('release-'+k);
      contract.outOfOrg(LV.CPBL1.min+5);
      const back=btn('中職一軍合約'); if(!back)continue;
      back.click();
      const log=document.getElementById('log').textContent.slice(start);
      if(log.includes('回歸母隊'))released={org:s.org,team:s.orgTeam,log};
    }
    return {demotion,released};
  });

  assert(result.demotion,'下放跳槽返台沒有出現回歸母隊文案');
  assert.equal(result.demotion.org,'CPBL');
  assert.equal(result.demotion.team,'台中猛獁');
  assert(result.released,'戰力外返台沒有出現回歸母隊文案');
  assert.equal(result.released.org,'CPBL');
  assert.equal(result.released.team,'台中猛獁');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('ok');
}finally{
  await browser.close();
}
