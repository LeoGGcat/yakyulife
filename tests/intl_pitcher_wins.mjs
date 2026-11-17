import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--disable-gpu'],
});

/* 國際賽勝投：先發投手每一場都要投滿 5 局才可能記勝，勝投數不得超過出賽數。 */
try{
  const page=await browser.newPage();
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=intl-pitcher-wins`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.2');
    const intl=await import('./src/engine/intl.js?v=2.1.2');
    const rows=[];
    for(const role of ['SP','MR']){
      for(let n=0;n<400;n++){
        const s=state.newState('國際賽勝投測試',1,'P',null);
        s.stage='PRO'; s.lv='NPB1'; s.role=role; s.ab.sta=role==='SP'?70:40;
        Object.keys(s.ab).forEach(k=>{ if(k!=='sta')s.ab[k]=80; });
        s.seasonFactor=1; s.rehab=0; s.skipMid=false; s.intlLock=s.year=2030;
        state.setS(s);
        let done=false;
        intl.maybeIntl(()=>{done=true;});
        const btn=document.querySelector('#act button'); if(btn)btn.click();
        const log=s.intlLog[s.intlLog.length-1];
        if(log)rows.push({role,done,rank:log.rank,...log.st});
      }
    }
    return rows;
  });
  assert.deepEqual(errors,[]);
  assert.ok(result.length>700,`expected intl rows, got ${result.length}`);
  const outs=ip=>Math.round(ip*3);
  for(const r of result){
    assert.ok(r.done);
    assert.ok(r.W<=r.G,`W ${r.W} > G ${r.G}`);
    if(r.role==='SP'){
      assert.ok(r.G<=2);
      /* 先發投手的勝投數不能超過「投滿 5 局的場次」上限 */
      assert.ok(outs(r.IP)>=15*r.W,`starter W=${r.W} with only ${r.IP} IP over ${r.G} G`);
      if(r.G===1&&outs(r.IP)<15)assert.equal(r.W,0,`1 start, ${r.IP} IP should not get a win`);
    }
  }
  const sp=result.filter(r=>r.role==='SP');
  assert.ok(sp.some(r=>r.W>0),'starters should still earn wins');
  assert.ok(sp.some(r=>r.G===1&&outs(r.IP)<15),'sample should include short starts');
  console.log(`intl_pitcher_wins: ${result.length} tournaments OK`);
}finally{
  await browser.close();
}
