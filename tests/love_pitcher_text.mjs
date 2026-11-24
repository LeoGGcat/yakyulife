import assert from 'node:assert/strict';
import {chromium} from 'playwright';

/* 戀愛文案依定位分流：純投手看到 meetP／finP／scP／chP 投球版（蘿莎的打擊練習、林曉晴與馮海莎的打擊區、桐谷凜的十八打席），
   打者與二刀流維持原文。 */
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
    const flat=s=>[s.t,s.i,s.end,...s.o.flatMap(o=>[o.t,o.g,o.b])].filter(Boolean).join('|');
    for(const pos of ['P','TW','IF','OF']){
      rng.seedInit('lp'+pos); const S=state.newState('測試',1,pos,null); state.setS(S);
      out[pos]={
        rosa:[0,1,2].map(n=>flat(love.affSc(rosa,n))),
        all:Object.fromEntries(girls.GIRLS.map(g=>[g.id,[love.girlTxt(g,'meet'),love.girlTxt(g,'fin'),
          ...[0,1,2].map(n=>flat(love.affSc(g,n))),...[0,1,2].map(i=>flat(love.girlCh(g,i)))].join('#')])),
        shape:girls.GIRLS.every(g=>[0,1,2].every(n=>{ const s=love.affSc(g,n); return s.i&&optOk(s.o); })
          &&[0,1,2].every(i=>{ const c=love.girlCh(g,i); return c.t&&c.i&&c.end&&optOk(c.o); })),
      };
    }
    return out;
  });
  assert.deepEqual(errors,[]);
  for(const pos of ['P','TW','IF','OF'])assert.ok(r[pos].shape,`${pos}：每一幕、每一章都要有完整的情境與三個選項`);
  /* 純投手不能被寫成站在打擊區、在打擊練習、擊出球或數打席 */
  const batMe=/你.{0,12}(打擊區|打擊練習|擊出|打席)|最大聲的打者/;
  for(const [id,txt] of Object.entries(r.P.all))assert.ok(!batMe.test(txt),`純投手看到 ${id} 的打者文案：${txt.match(batMe)?.[0]}`);
  assert.match(r.P.rosa[0],/投球練習/);
  assert.match(r.P.rosa[0],/三振/);
  assert.match(r.P.all.xiaoqing,/牛棚熱身的時候偷學/);
  assert.match(r.P.all.xiaoqing,/在投手丘上用她的手勢/);
  assert.match(r.P.all.haisha,/投手丘上偷笑/);
  assert.match(r.P.all.rin,/五場先發都撐不過三局/);
  /* 打者與二刀流：文案跟原始資料完全一樣 */
  for(const pos of ['TW','IF','OF']){
    assert.match(r[pos].rosa[0],/打擊練習/,`${pos} 維持原本的打擊練習文案`);
    assert.match(r[pos].all.xiaoqing,/打擊區偷學/);
    assert.match(r[pos].all.haisha,/打擊區偷笑/);
    assert.match(r[pos].all.rin,/十八打席/);
    assert.deepEqual(r[pos].all,r.IF.all);
  }
  /* 沒有投手版的角色與幕次，投手跟打者看到的一樣 */
  const touched=['rosa','xiaoqing','haisha','rin'];
  for(const id of Object.keys(r.P.all))if(!touched.includes(id))assert.equal(r.P.all[id],r.IF.all[id],`${id} 沒有投手版，應該共用`);
  assert.deepEqual(r.P.rosa.slice(1),r.IF.rosa.slice(1));
  /* 部分覆蓋：林曉晴第二章沒改的選項（宵夜探班）與失敗文案沿用原文 */
  assert.match(r.P.all.xiaoqing,/兩大袋滷味/);
  assert.match(r.P.all.xiaoqing,/隔天新聞全在寫你/);
  console.log('love_pitcher_text: ok');
}finally{
  await browser.close();
}
