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
    const rng=await import('./src/core/rng.js?v=2.1.4');
    const state=await import('./src/core/state.js?v=2.1.4');
    const love=await import('./src/flow/love.js?v=2.1.4');
    const girls=await import('./src/data/girls.js?v=2.1.4');
    const casts=[];
    for(let i=0;i<400;i++){ rng.seedInit('cast'+i); casts.push(love.drawCast()); }
    rng.seedInit('pool'); const S=state.newState('測試',1,'P',null); state.setS(S);
    S.stage='PRO'; S.org='CPBL';
    S.love.cast={TW:['haisha','ruotong','peici'],JP:['misaki','hiyori','sae'],US:['maya','sophia','naomi']};
    S.love.pid='ruotong';
    love.ensureLove(); S.love.aff={ruotong:100,haisha:80,peici:0,misaki:40,maya:25,sae:50};
    const poolTW=love.affairPool();
    S.love.burned=['sae']; S.org='NPB'; const poolJP=love.affairPool(); S.love.burned=[];
    S.org='MiLB'; const country=love.playerCountry();
    /* 每個選項都要有自己的成功與失敗文本，避免「選 A 卻看到 B 的結果」。 */
    const optOk=o=>o.length===3&&o.every(x=>x.t&&x.g&&x.b);
    const shapeOk=girls.GIRLS.every(g=>g.work&&g.fin&&g.sc.length===3&&g.ch.length===3&&g.sc.every(s=>s.i&&optOk(s.o))
      &&g.ch.every(c=>c.i&&optOk(c.o)&&c.end)&&g.conf.ok&&g.conf.no&&g.propNo&&g.go&&g.stay&&g.goP>0);
    const byC=c=>girls.GIRLS.filter(g=>g.c===c).length;
    /* 夢想達成前不跟著出國；早瀨美咲只保留日本→美國 */
    const G=girls.GIRL, mf=(id,f,t,ch)=>{ S.love.ch=ch; return love.mayFollow(G[id],f,t); };
    const follow=[mf('xiaoqing','TW','JP',0),mf('xiaoqing','TW','US',2),mf('xiaoqing','TW','JP',3),
      mf('misaki','JP','US',0),mf('misaki','JP','TW',0),mf('misaki','US','JP',2),mf('misaki','JP','TW',3),
      mf('maya','US','JP',1),mf('rin','JP','US',2),mf('rin','JP','US',3)];
    S.love.ch=0;
    /* 前任：分開後隔兩年才會再遇到；復合只有一次機會 */
    S.org='CPBL'; S.year=2030; S.love.aff={}; S.love.burned=[]; S.love.past={};
    S.love.st='dating'; S.love.pid='ruotong'; S.love.partner='陳若彤'; S.love.ch=2;
    love.endRelation('left');
    const ex1={past:{...S.love.past.ruotong},st:S.love.st,aff:S.love.aff.ruotong};
    S.year=2031; const coolPool=love.singlePool(null);
    S.year=2032; const backPool=love.singlePool(null), freshPool=love.singlePool('haisha');
    S.love.st='dating'; S.love.pid='ruotong'; S.love.partner='陳若彤'; S.love.ch=3;
    love.endRelation('wait');
    const ex2={burned:S.love.burned.slice(),n:S.love.past.ruotong.n};
    S.year=2040; const afterPool=love.singlePool(null);
    S.love.st='married'; S.love.pid='haisha'; S.love.partner='馮海莎'; S.love.kids=2; S.love.ch=1;
    love.endRelation('far');
    const ex3={past:{...S.love.past.haisha},st:S.love.st,exes:S.love.exes.map(e=>[e.id,e.kids])};
    return {ex1,coolPool,backPool,freshPool,ex2,afterPool,ex3,casts,poolTW,poolJP,country,shapeOk,counts:[byC('TW'),byC('JP'),byC('US')],
      odds:love.LOVE_ODDS,gain:love.AFF_GAIN,conf:love.CONFESS_RATE,fire:love.PRE_MARRIAGE_FIRE,
      aff:[love.affairChance(100),love.affairChance(0),love.affairChance(70)],
      prop:love.PROP_GAIN, pc:[love.proposalChance(100,70),love.proposalChance(0,70),love.proposalChance(100,100),love.proposalChance(50,70)],
      follow,jp:girls.GIRLS.filter(g=>g.c==='JP').map(g=>g.id),us:girls.GIRLS.filter(g=>g.c==='US').map(g=>g.id)};
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
  assert.deepEqual(r.poolTW,['misaki','maya','sae'],'外遇名單：累積過好感度的人，不限國家，排除伴侶、馮海莎與好感度 0');
  assert.deepEqual(r.poolJP,['misaki','maya'],'外遇名單不受所在國家影響，排除不會回頭的人');
  assert.equal(r.country,'US');
  assert.deepEqual(r.odds,{safe:80,norm:65,bold:50});
  assert.deepEqual(r.gain,{safe:25,norm:50,bold:100});
  assert.deepEqual(r.pc,[75,5,95,38]); assert.equal(r.conf,75); assert.equal(r.fire,80);
  assert.deepEqual(r.aff,[10,40,19]);
  assert.deepEqual(r.prop,{safe:25,norm:50,bold:100},'求婚值累積方式同好感度');
  assert.deepEqual(r.follow,[false,false,true,true,false,false,true,false,false,true],'夢想達成前不跟著出國，美咲只走日本→美國');
  assert.deepEqual(r.ex1,{past:{yr:2030,ch:2,n:1,how:'left',wed:false},st:'single',aff:0},'分手時記下前任：年份、她的章節進度、原因');
  assert.deepEqual(r.coolPool,['haisha','peici'],'分手隔年不會再遇到前任');
  assert.deepEqual(r.backPool,['haisha','ruotong','peici'],'隔兩年後可以重逢');
  assert.deepEqual(r.freshPool,['ruotong','peici'],'主動分手的隔年先遇到別人的規則不變');
  assert.deepEqual(r.ex2,{burned:['ruotong'],n:2},'跟同一個人第二次分開，她就不會回來');
  assert.deepEqual(r.afterPool,['haisha','peici']);
  assert.deepEqual(r.ex3,{past:{yr:2040,ch:1,n:1,how:'far',wed:true},st:'divorced',exes:[['haisha',2]]},'離婚：前妻紀錄與孩子照舊');
  assert.deepEqual(errors,[]);
  console.log('love system ok');
}finally{ await browser.close(); }
