/* 生涯全壘打的累積上限。

   玩家回報「大聯盟會被刷到生涯千轟、單季 90 轟」。單季那條由 teams.js 的 cap
   守著（見 league_environment.mjs ⑥c），但單季合法不代表加起來合法——
   每一季都只差一點點，乘上二十季就會變成另一回事。

   這支測試把「完美玩法」整段跑一次：22 歲出道、26 歲把能力練滿、整段待在
   同一個聯盟、一次傷都沒有，能力照遊戲自己的衰退曲線走
   （32 歲起 −2／年，35 歲起 −(5+age−35)／年，訓練加點假設抵掉 32~34 那三年）。
   這是這個遊戲裡不可能再高的一條線，所以它就是生涯累積的實質天花板。

   守住三件事：
     ① 大聯盟的完美生涯不可以超過 1,000 轟（真實紀錄 762／Bonds）
     ② 但也不能低到沒有獎勵感——完美玩法本來就該打破紀錄
     ③ 顛峰期的單季產出要跟 league_environment 的單季天花板對得上，
        不然這兩支測試會各自為政 */
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
  await page.goto(`${url}?seed=career-hr-ceiling`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state =await import('./src/core/state.js?v=2.1.0');
    const rng   =await import('./src/core/rng.js?v=2.1.0');
    const season=await import('./src/engine/season.js?v=2.1.0');
    const {LV}  =await import('./src/data/teams.js?v=2.1.0');
    const med=a=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1];};

    /* 遊戲自己的衰退曲線（flow/phases.js）：32 歲起每年 −2，35 歲起 −(5+age−35)。
       訓練加點在 32~34 那三年還抵得住，35 之後抵不住了。 */
    const abAt=age=>{
      if(age<26)return 60+(age-22)*5;
      if(age<=34)return 80;
      let v=80; for(let a=35;a<=age;a++)v-=(5+(a-35));
      return Math.max(20,v);
    };
    const seasonHR=(lv,ab,seed)=>{ rng.seedInit(seed);
      const s=state.newState('打',1,'IF',null);
      Object.assign(s,{stage:'PRO',lv,org:LV[lv].top||'MLB',orgTeam:'X',
        dpos:'DH',seasonFactor:1,age:27});
      const v=Math.min(80,ab);
      Object.assign(s.ab,{sta:v,con:v,pow:v,spd:v,eye:v,rng:60,fld:60,arm:60});
      s.teamName=function(){return 'X';}; state.setS(s);
      return season.simSeason(lv).HR; };

    const out={};
    for(const lv of ['CPBL1','NPB1','MLB']){
      let total=0; const byAge={};
      for(let age=22;age<=42;age++){
        const o=[]; for(let i=0;i<60;i++)o.push(seasonHR(lv,abAt(age),'K'+lv+age+i));
        byAge[age]=med(o); total+=byAge[age];
      }
      out[lv]={total,peak:byAge[29],cap:LV[lv].cap.hr,byAge};
    }
    return out;
  });

  const J=JSON.stringify(Object.fromEntries(
    Object.entries(r).map(([k,v])=>[k,{生涯:v.total,顛峰單季:v.peak,單季天花板:v.cap}])));

  /* ① 生涯不可以刷到千轟。真實紀錄：大聯盟 762（Bonds）／日職 868（王貞治）。 */
  assert.ok(r.MLB.total<1000,`大聯盟的完美生涯刷到千轟了：${r.MLB.total} ${J}`);
  assert.ok(r.NPB1.total<1000,`日職的完美生涯刷到千轟了：${r.NPB1.total} ${J}`);
  /* 中職一年只有 120 場，但天花板 63 轟比另外兩個聯盟寬（那是「掉到弱聯盟就是會
     開轟」換來的），所以一樣要看著。 */
  assert.ok(r.CPBL1.total<1000,`中職的完美生涯刷到千轟了：${r.CPBL1.total} ${J}`);

  /* ② 完美玩法本來就該破紀錄，不能收到沒有獎勵感。 */
  assert.ok(r.MLB.total>600,`大聯盟的完美生涯被壓得太低，失去獎勵感：${r.MLB.total} ${J}`);

  /* ③ 顛峰單季要跟 teams.js 的單季天花板對得上：逼近但不越過。
     兩支測試量的是同一件事的兩端，脫鉤的話就會出現「單季都合法、生涯不合法」。 */
  for(const lv of ['CPBL1','NPB1','MLB']){
    const x=r[lv];
    assert.ok(x.peak<x.cap,`${lv} 顛峰單季越過了天花板：${x.peak} vs ${x.cap}`);
    assert.ok(x.peak>x.cap*0.50,`${lv} 顛峰單季離天花板太遠，天花板等於沒作用：${x.peak} vs ${x.cap}`);
  }

  /* ④ 衰退要真的咬得下去：38 歲的產出必須明顯低於顛峰，不然生涯就是靠「永遠不老」
     堆出來的。這是生涯累積唯一的剎車，壞掉了上面三條會一起失守。 */
  for(const lv of ['CPBL1','NPB1','MLB']){
    const x=r[lv];
    assert.ok(x.byAge[38]<x.peak*0.40,
      `${lv} 38 歲還在打顛峰的量，衰退沒有咬到：${x.byAge[38]} vs 顛峰 ${x.peak}`);
  }

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(Object.fromEntries(
    Object.entries(r).map(([k,v])=>[k,{生涯:v.total,顛峰單季:v.peak,單季天花板:v.cap,
      '35歲':v.byAge[35],'38歲':v.byAge[38]}])),null,1));
}finally{ await browser.close(); }
