import assert from 'node:assert/strict';
import {chromium} from 'playwright';

/* v2.1.7 遠距文案依兩地距離切換：人在中職、她在日本時，不能出現「搭了十幾個小時的飛機」。 */
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
  await page.goto(`${url}?seed=love-distance`,{waitUntil:'domcontentloaded'});
  const r=await page.evaluate(async()=>{
    const love=await import('./src/flow/love.js?v=2.1.7');
    const girls=await import('./src/data/girls.js?v=2.1.7');
    const g=girls.GIRL.rin;
    const txt=(pc,herC)=>love.longDistanceOpts(g,pc,herC).map(o=>o.g+'｜'+o.b).join('\n');
    return {twjp:txt('TW','JP'),jptw:txt('JP','TW'),twus:txt('TW','US'),jpus:txt('JP','US'),
      n:love.longDistanceOpts(g,'TW','JP').length,ok:love.longDistanceOpts(g,'US','JP').every(o=>o.t&&o.g&&o.b)};
  });
  for(const k of ['twjp','jptw']){
    assert.ok(!r[k].includes('十幾個小時'),`${k}：台日之間不是十幾個小時的航程`);
    assert.ok(!r[k].startsWith('時差讓'),`${k}：台日只差一小時`);
    assert.ok(r[k].includes('三個多小時'),`${k}：台日用近距離的說法`);
  }
  for(const k of ['twus','jpus']) assert.ok(r[k].includes('十幾個小時'),`${k}：跨太平洋維持長途航程`);
  assert.equal(r.n,3); assert.ok(r.ok,'每個選項都有成功與失敗文本');
  assert.deepEqual(errors,[]);
  console.log('love distance text ok');
}finally{ await browser.close(); }
