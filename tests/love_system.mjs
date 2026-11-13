import assert from 'node:assert/strict';
import {chromium} from 'playwright';

/* v2.1.0 戀愛系統重置：角色抽選、外遇名單、機率邊界。 */
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
  await page.goto(`${url}?seed=love-system`,{waitUntil:'domcontentloaded'});
  const r=await page.evaluate(async()=>{
    const rng=await import('./src/core/rng.js?v=2.1.0');
    const state=await import('./src/core/state.js?v=2.1.0');
    const love=await import('./src/flow/love.js?v=2.1.0');
    const girls=await import('./src/data/girls.js?v=2.1.0');
    const casts=[];
    for(let i=0;i<400;i++){ rng.seedInit('cast'+i); casts.push(love.drawCast()); }
    rng.seedInit('pool'); const S=state.newState('測試',1,'P',null); state.setS(S);
    S.stage='PRO'; S.org='CPBL';
    S.love.cast={TW:['haisha','ruotong','peici'],JP:['misaki','hiyori','sae'],US:['maya','sophia','naomi']};
    S.love.pid='ruotong';
    const poolTW=love.affairPool();
    S.org='NPB'; const poolJP=love.affairPool();
    S.org='MiLB'; const country=love.playerCountry();
    const shapeOk=girls.GIRLS.every(g=>g.sc.length===3&&g.ch.length===3&&g.sc.every(s=>s.o.length===3&&s.g&&s.b)
      &&g.ch.every(c=>c.o.length===3&&c.g&&c.b&&c.end)&&g.conf.ok&&g.conf.no&&g.propNo&&g.go&&g.stay&&g.goP>0);
    const byC=c=>girls.GIRLS.filter(g=>g.c===c).length;
    return {casts,poolTW,poolJP,country,shapeOk,counts:[byC('TW'),byC('JP'),byC('US')],
      odds:love.LOVE_ODDS,gain:love.AFF_GAIN,conf:love.CONFESS_RATE,fire:love.PRE_MARRIAGE_FIRE,
      aff:[love.affairChance(100),love.affairChance(0),love.affairChance(70)],
      prop:[love.proposalChance(1,0),love.proposalChance(3,100),love.proposalChance(1,70)],
      jp:girls.GIRLS.filter(g=>g.c==='JP').map(g=>g.id),us:girls.GIRLS.filter(g=>g.c==='US').map(g=>g.id)};
  });
  assert.deepEqual(r.counts,[6,5,5],'台灣 6 人（含馮海莎）、日本 5、美國 5');
  assert.ok(r.shapeOk,'每位角色都有三幕好感事件、三章故事與旅外文本');
  let haisha=0,xiaoqing=0;
  for(const c of r.casts){
    for(const k of ['TW','JP','US']){ assert.equal(c[k].length,3); assert.equal(new Set(c[k]).size,3); }
    assert.ok(!(c.TW.includes('haisha')&&c.TW.includes('xiaoqing')),'啦啦隊只佔一個名額');
    if(c.TW.includes('haisha'))haisha++; if(c.TW.includes('xiaoqing'))xiaoqing++;
    c.JP.forEach(id=>assert.ok(r.jp.includes(id))); c.US.forEach(id=>assert.ok(r.us.includes(id)));
  }
  /* 啦啦隊入選率 3/5＝60%，其中一半是馮海莎 → 各約 30% */
  assert.ok(haisha>80&&haisha<160,`馮海莎入選 ${haisha}/400`);
  assert.ok(xiaoqing>80&&xiaoqing<160,`林曉晴入選 ${xiaoqing}/400`);
  assert.deepEqual(r.poolTW,['peici'],'外遇名單排除伴侶與馮海莎');
  assert.deepEqual(r.poolJP,['misaki','hiyori','sae'],'外遇名單跟著所在聯盟的國家');
  assert.equal(r.country,'US');
  assert.deepEqual(r.odds,{safe:80,norm:65,bold:50});
  assert.deepEqual(r.gain,{safe:25,norm:50,bold:100});
  assert.equal(r.conf,75); assert.equal(r.fire,80);
  assert.deepEqual(r.aff,[5,35,14]);
  assert.deepEqual(r.prop,[20,95,55]);
  assert.deepEqual(errors,[]);
  console.log('love system ok');
}finally{ await browser.close(); }
