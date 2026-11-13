/* 中職名人堂的門檻必須對得上真實的中職名人堂等級。

   玩家大量回報「中職名人堂門檻太高」。量下來比回報更嚴重——那條線設在
   **比中職歷史最強的球員還高**：潘威倫量級 0.67、張泰山量級 0.60、彭政閔量級 0.55，
   三個都只判成「中職明星球員」。模擬母體也對得上：整段生涯留在中職的人入選率 1.1%，
   而全部路線的平均是 9.4%——留在中職等於放棄名人堂。

   另外中職投手是 0.0%（84 段終老生涯沒有一個進得了）。除了門檻，還有一層：
   LEAGUE_K.CPBL.P 的 Khonor 只有 0.084，潘威倫量級的 honorScore 1440 只換到 121 分、
   佔總分 2%（同量級的張泰山是 583 分、佔 13%），拿獎對投手的生涯評價幾乎失效。

   這支測試用真實量級當錨點（跟 economy.js 對大聯盟投手用 1.40 時同一套方法），
   守住四件事：
     ① 真實名人堂等級的生涯要進得去（投打都要）
     ② 一般長青球員要留在線下——放寬不等於人人有獎
     ③ 投手的獎項要真的值錢：同樣的累積數據，拿滿獎的人要明顯高於沒拿獎的
     ④ 日職與大聯盟一個字都沒被動到 */
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
  await page.goto(`${url}?seed=cpbl-hof`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state =await import('./src/core/state.js?v=2.1.0');
    const career=await import('./src/engine/career.js?v=2.1.0');
    const ECON  =await import('./src/data/economy.js?v=2.1.0');

    const yrs=(a,n)=>{const o=[];for(let i=0;i<n;i++)o.push(a+i);return o;};
    const pitH=(nAll,nTitle,nBest)=>{const h=[];
      yrs(2030,nAll).forEach(y=>h.push(`${y} 中職明星賽`));
      yrs(2030,nTitle).forEach(y=>{h.push(`${y} 中職勝投王`);h.push(`${y} 中職防禦率王`);h.push(`${y} 中職三振王`);});
      yrs(2030,nBest).forEach(y=>{h.push(`${y} 中職年度最佳投手`);h.push(`${y} 中職年度MVP`);});
      return h;};
    const batH=(nAll,nTitle,nBest,nGlove)=>{const h=[];
      yrs(2030,nAll).forEach(y=>h.push(`${y} 中職明星賽`));
      yrs(2030,nTitle).forEach(y=>{h.push(`${y} 中職打擊王`);h.push(`${y} 中職全壘打王`);h.push(`${y} 中職打點王`);});
      yrs(2030,nBest).forEach(y=>{h.push(`${y} 中職年度最佳打者`);h.push(`${y} 中職年度MVP`);});
      yrs(2030,nGlove).forEach(y=>h.push(`${y} 中職游擊手金手套`));
      return h;};

    const run=(bucket,pos,stat,honors)=>{
      const s=state.newState('x',1,pos,null);
      Object.assign(s,{stage:'PRO',lv:bucket==='CPBL'?'CPBL1':bucket==='NPB'?'NPB1':'MLB',
        org:bucket==='CPBL'?'CPBL':bucket==='NPB'?'NPB':'MiLB',orgTeam:'X',age:40,
        dpos:pos==='P'?null:'DH',role:pos==='P'?'SP':null});
      s.honors=honors||[]; s.teamName=function(){return 'X';};
      s.stats[bucket]=Object.assign(state.blankStat(),stat);
      state.setS(s);
      const t=career.tierOf(bucket);
      return {sc:t.sc,th:Math.round(t.hofTh),r:+(t.sc/t.hofTh).toFixed(2),name:t.name,hof:t.sc>=t.hofTh};
    };

    /* 真實量級的錨點 */
    const PAN ={yr:17,yrP:17,GP:430,IP:2600,W:160,L:110,SO:1900,ER:910,AS:8};
    const CHANG={yr:17,yrB:17,G:1900,PA:8000,AB:7100,H:2100,HR:250,RBI:1100,SB:120,BB:800,AS:8,DEF:60};
    const PENG={yr:17,yrB:17,G:1850,PA:7800,AB:6900,H:2050,HR:150,RBI:950,SB:80,BB:850,AS:9,DEF:50};

    return {
      /* ① 真實名人堂等級 */
      pan  :run('CPBL','P', PAN,pitH(8,4,2)),                       /* 潘威倫量級 160 勝 */
      kuo  :run('CPBL','P',{yr:15,yrP:15,GP:500,IP:1800,W:100,L:90,SV:120,SO:1400,ER:650,AS:6},pitH(6,3,1)),
      chang:run('CPBL','IF',CHANG,batH(8,4,2,3)),                   /* 張泰山量級 2100 安 */
      peng :run('CPBL','IF',PENG,batH(9,5,3,2)),                    /* 彭政閔量級 2050 安 */
      /* ② 一般長青球員——放寬之後仍然要留在線下 */
      midP :run('CPBL','P',{yr:11,yrP:11,GP:250,IP:1400,W:80,L:75,SO:900,ER:580,AS:2},pitH(2,0,0)),
      midH :run('CPBL','IF',{yr:13,yrB:13,G:1400,PA:5600,AB:5000,H:1400,HR:110,RBI:650,SB:60,BB:520,AS:3},batH(3,1,0,1)),
      /* ③ 獎項對投手要有重量：同一份累積數據，一個拿滿獎、一個全沒拿 */
      panNoAward:run('CPBL','P',PAN,[]),
      /* ④ 另外兩個聯盟不可以被碰到 */
      npb:run('NPB','IF',CHANG,batH(8,4,2,3)),
      mlb:run('MLB','IF',CHANG,batH(8,4,2,3)),
      K:{LEAGUE_K:ECON.LEAGUE_K,HOF_TH_K:ECON.HOF_TH_K},
    };
  });

  const J=x=>`${x.sc} / ${x.th} = ${x.r}（${x.name}）`;

  /* ① 真實名人堂等級要進得去 */
  assert.ok(r.pan.hof,  `潘威倫量級（17 季／160 勝／2600 局／2 座MVP）進不了中職名人堂：${J(r.pan)}`);
  assert.ok(r.chang.hof,`張泰山量級（17 季／2100 安／250 轟）進不了中職名人堂：${J(r.chang)}`);
  assert.ok(r.peng.hof, `彭政閔量級（17 季／2050 安／3 座MVP）進不了中職名人堂：${J(r.peng)}`);
  assert.ok(r.kuo.hof,  `郭源治量級（100 勝＋120 救援）進不了中職名人堂：${J(r.kuo)}`);

  /* ② 但不能變成人人有獎 */
  assert.ok(!r.midP.hof,`一般先發（11 季／80 勝／沒拿過獎）也進了名人堂，門檻放得太鬆：${J(r.midP)}`);
  assert.ok(!r.midH.hof,`一般打者（13 季／1400 安）也進了名人堂，門檻放得太鬆：${J(r.midH)}`);
  /* 保留足夠的落差，門檻再動也不會悄悄把這條地板吃掉 */
  assert.ok(r.midH.r<0.75,`一般打者離名人堂線太近（${r.midH.r}），「明星球員」這一級快沒意義了`);

  /* ③ 投手的獎項要值錢。
     不驗「沒拿過獎的 160 勝投手必須出局」——17 季拿 160 勝卻一座獎都沒有，現實裡
     不存在，拿它當地板只會逼出一組畸形的常數。真正的地板是上面的 midP（80 勝無獎）。
     這裡驗的是「同一份累積數據，拿獎的人要看得出差別」。 */
  const lift=r.pan.r-r.panNoAward.r;
  assert.ok(lift>=0.08,
    `同樣 160 勝，拿滿 4 次三冠項目＋2 座MVP 只讓評價分提高 ${(lift*100).toFixed(0)}%——`+
    `拿獎對中職投手幾乎沒有作用（舊版是 2%，Khonor 0.084）。${J(r.pan)} vs ${J(r.panNoAward)}`);
  assert.equal(r.K.LEAGUE_K.CPBL.P[1],r.K.LEAGUE_K.CPBL.H[1],
    'honorScore 是投打共用的尺，中職的折算係數就不該投打不同');

  /* ④ 其他聯盟不受影響 */
  assert.equal(r.K.HOF_TH_K.NPB.H,1,'日職的名人堂線被動到了');
  assert.equal(r.K.HOF_TH_K.MLB.P,1.40,'大聯盟投手的名人堂線被動到了');
  assert.deepEqual(r.K.LEAGUE_K.NPB,{P:[2.048,0.079],H:[2.284,1.010],CL:[1.373,0.159],TW:[1.923,0.292]},
    '日職的折算係數被動到了');
  /* 中職的二刀流線刻意維持 1：他本來就有 12.5% 的入選率，這次是把其他守位拉上來 */
  assert.equal(r.K.HOF_TH_K.CPBL.TW,1,'中職二刀流的名人堂線不該跟著下修');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({
    潘威倫量級:J(r.pan),郭源治量級:J(r.kuo),張泰山量級:J(r.chang),彭政閔量級:J(r.peng),
    一般先發:J(r.midP),一般打者:J(r.midH),潘威倫無獎:J(r.panNoAward),
    獎項帶來的提升:`+${(lift*100).toFixed(0)}%`},null,1));
}finally{ await browser.close(); }
