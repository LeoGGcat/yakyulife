import assert from 'node:assert/strict';
import {chromium} from 'playwright';

/* 好感事件依定位分流：純投手看到 scP 投球版（蘿莎的打擊練習→投球練習），打者與二刀流維持原文。 */
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
  await page.goto(`${url}?seed=love-pitcher-text`,{waitUntil:'domcontentloaded'});
  const r=await page.evaluate(async()=>{
    const rng=await import('./src/core/rng.js?v=2.1.5');
    const state=await import('./src/core/state.js?v=2.1.5');
    const love=await import('./src/flow/love.js?v=2.1.5');
    const girls=await import('./src/data/girls.js?v=2.1.5');
    const rosa=girls.GIRL.rosa, out={};
    const optOk=o=>o.length===3&&o.every(x=>x.t&&x.g&&x.b);
    out.scPShape=girls.GIRLS.filter(g=>g.scP).every(g=>g.scP.length<=3&&g.scP.every(s=>!s||(s.i&&optOk(s.o))));
    for(const pos of ['P','TW','IF','OF']){
      rng.seedInit('lp'+pos); const S=state.newState('測試',1,pos,null); state.setS(S);
      const texts=[0,1,2].map(n=>{ const s=love.affSc(rosa,n); return [s.i,...s.o.flatMap(o=>[o.t,o.g,o.b])].join('|'); });
      out[pos]=texts;
    }
    return out;
  });
  assert.deepEqual(errors,[]);
  assert.ok(r.scPShape,'scP 每一幕都要有情境與三個完整選項');
  const bat=/打擊練習|擊球|擊出|打者/;
  assert.ok(!bat.test(r.P[0]),'純投手的蘿莎第一幕不能出現打擊用語');
  assert.match(r.P[0],/投球練習/);
  assert.match(r.P[0],/三振/);
  for(const pos of ['TW','IF','OF']){
    assert.match(r[pos][0],/打擊練習/,`${pos} 維持原本的打擊練習文案`);
    assert.match(r[pos][0],/擊出全壘打/);
  }
  assert.deepEqual(r.P.slice(1),r.IF.slice(1),'沒有 scP 的幕次，投手與打者共用');
  console.log('love_pitcher_text: ok');
}finally{
  await browser.close();
}
