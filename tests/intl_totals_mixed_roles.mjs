/* 國際賽通算：投打角色換過的生涯，通算必須等於該側逐屆加總。
   S.intlStat 是混合桶——純投手那屆把被安打／四壞記在 G/H/BB，跟打擊共用 key。
   舊版直接拿它當通算：打擊通算多出投手那屆的場次、被安打、四壞(PA 卻剛好對得上)，
   投球通算則因為讀到 GP/pBB 而漏掉純投手那屆。 */
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
  await page.goto(`${url}?seed=intl-totals-mixed`,{waitUntil:'domcontentloaded'});
  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.8');
    const intl=await import('./src/engine/intl.js?v=2.1.8');
    const retire=await import('./src/ui/retire.js?v=2.1.8');
    const s=state.newState('換位',1,'TW',null); state.setS(s);
    const logs=[
      {year:2030,name:'世界棒球經典賽',rank:'八強止步',st:{G:5,PA:15,AB:14,H:3,HR:0,RBI:1,BB:1}},
      {year:2031,name:'世界12強賽',rank:'季軍',st:{G:1,IP:5,SO:6,pHR:0,ER:2,W:1,H:6,BB:3,SV:0}},
      {year:2032,name:'世界12強賽',rank:'殿軍',st:{GP:2,IP:9,SO:10,pHR:1,ER:3,W:1,pH:7,pBB:2,SV:0,
        G:9,PA:36,AB:32,H:8,HR:1,RBI:5,BB:4}},
    ];
    logs.forEach(l=>{ intl.addIntlStat(l.st); s.intlLog.push(l); s.intlCount++; });
    return {bat:retire.rpIntlData('bat'),pit:retire.rpIntlData('pit')};
  });
  assert.deepEqual(errors,[]);
  assert.equal(r.bat.rows.length,2);
  assert.deepEqual(r.bat.tot,[14,51,'.239',11,1,6,5]);
  assert.equal(r.pit.rows.length,2);
  assert.deepEqual(r.pit.tot,[3,'14.0',2,0,16,5,'3.21']);
  console.log('intl_totals_mixed_roles OK');
}finally{ await browser.close(); }
