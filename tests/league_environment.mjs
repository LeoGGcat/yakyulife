/* 聯盟環境：par 的球員要打出聯盟平均、ERA 與 WHIP 必須同進同退，
   而且「同一個球員在越弱的聯盟越無雙」。

   這支測試改過兩次，兩次都是因為模型錯了：

   第一版（v1.6.0 之前）把 6.2 K/9、4.6 BB/9、9.2 H/9、.252 打擊率、1.0% 全壘打率
   全部寫死，只靠「− par」表達聯盟差異，於是三個聯盟的平均球季長得一模一樣；
   而 ERA 是獨立擲的，跟被安打／四死球無關，par 的投手會同時印出
   WHIP 1.53 與 ERA 4.32——同一列上的兩個數字互相打臉。

   第二版（v1.6.1）改成「兩個錨點內插」：par 對聯盟平均、能力 80 對該聯盟的頂尖。
   看起來合理，其實把同一件事講了兩次而且方向相反——par 已經在表達聯盟強弱了。
   實測同一個球員（能力完全不動）：力量 80 在中職 30 轟、日職 43 轟、大聯盟 51 轟。
   大聯盟的頂級砲手來中職只能敲 30 轟，這是不可能的。所以那一版的第 ⑥ 條
   「大聯盟 > 日職 > 中職」測的正好是錯的東西，現在整條反過來。

   v1.6.2 改成一條共用的指數曲線，只吃「你比這個聯盟的水準強多少」。
   對照的真實數字與三個錨點見 data/teams.js 的 env 註解。 */
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
  await page.goto(`${url}?seed=league-env`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const rng=await import('./src/core/rng.js?v=2.1.0');
    const season=await import('./src/engine/season.js?v=2.1.0');
    const {LV,envWhip,envLeagueOps,hrCapRate}=await import('./src/data/teams.js?v=2.1.0');
    const th=await import('./src/data/thresholds.js?v=2.1.0');
    const med=a=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1];};

    const pit=(lv,ab,n)=>{ const o=[];
      for(let i=0;i<n;i++){ rng.seedInit('E'+lv+ab+i);
        const s=state.newState('投',1,'P',null);
        Object.assign(s,{stage:'PRO',lv,org:LV[lv].top,orgTeam:'X',role:'SP',
          seasonFactor:1,age:27,effort:'普通投'});
        Object.assign(s.ab,{sta:70,vel:ab,ctl:ab,brk:ab}); state.setS(s);
        const st=season.simSeason(lv); season.normalizePitchingStats(st,lv);
        const ip=st.IP;
        o.push({era:season.baseballERA(st),whip:season.baseballWHIP(st),
          k9:st.SO/ip*9,bb9:season.pitBB(st)/ip*9,h9:season.pitH(st)/ip*9,
          pHR:st.pHR,pH:season.pitH(st),
          /* 重算一次應該完全不動——四個會改成績的地方都走同一支 syncEra */
          reEra:(season.syncEra(st,lv),season.baseballERA(st))}); }
      return o; };
    const bat=(lv,ab,n)=>{ const o=[];
      for(let i=0;i<n;i++){ rng.seedInit('B'+lv+ab+i);
        const s=state.newState('打',1,'IF',null);
        Object.assign(s,{stage:'PRO',lv,org:LV[lv].top,orgTeam:'X',dpos:'1B',seasonFactor:1,age:27});
        Object.assign(s.ab,{sta:ab,con:ab,pow:ab,spd:ab,eye:ab,rng:60,fld:60,arm:60}); state.setS(s);
        const st=season.simSeason(lv);
        o.push({avg:st.AB?st.H/st.AB:0,HR:st.HR,AB:st.AB,
          hrRate:st.AB?st.HR/st.AB:0}); }
      return o; };

    const out={};
    for(const lv of ['CPBL1','NPB1','MLB']){
      const E=LV[lv].env, par=LV[lv].par;
      const P=pit(lv,par,300), P80=pit(lv,80,120), Plow=pit(lv,30,120);
      const B=bat(lv,par,300), B80=bat(lv,80,300), B70=bat(lv,70,300);
      out[lv]={env:{era:E.era,whip:+envWhip(E).toFixed(3),k9:E.k9,bb9:E.bb9,h9:E.h9,avg:E.avg},
        par:{era:+med(P.map(x=>x.era)).toFixed(2),whip:+med(P.map(x=>x.whip)).toFixed(3),
             k9:+med(P.map(x=>x.k9)).toFixed(2),bb9:+med(P.map(x=>x.bb9)).toFixed(2),
             h9:+med(P.map(x=>x.h9)).toFixed(2),avg:+med(B.map(x=>x.avg)).toFixed(3)},
        top:{era:+med(P80.map(x=>x.era)).toFixed(2),HR:med(B80.map(x=>x.HR)),
             hrRate:+med(B80.map(x=>x.hrRate)).toFixed(4),
             avg:+med(B80.map(x=>x.avg)).toFixed(3)},
        elite:{HR:med(B70.map(x=>x.HR)),hrRate:+med(B70.map(x=>x.hrRate)).toFixed(4)},
        cap:{hr:LV[lv].cap.hr,hrRate:+hrCapRate(LV[lv]).toFixed(4),avg:LV[lv].cap.avg},
        low:{era:+med(Plow.map(x=>x.era)).toFixed(2),
             whip:+med(Plow.map(x=>x.whip)).toFixed(3)},
        hrAllowed:{always:P.every(x=>Number.isFinite(x.pHR)),
                   leHits:P.every(x=>x.pHR<=x.pH)},
        eraStable:P.every(x=>Math.abs(x.reEra-x.era)<0.02),
        lgOps:+envLeagueOps(E).toFixed(3),
        th:{pitch:th.pitchTh(lv),bat:th.batTh(lv),keep:th.keepTh(lv)}};
    }
    return out;
  });

  const L=['CPBL1','NPB1','MLB'];
  for(const lv of L){
    const x=r[lv];
    /* ① par 的球員＝聯盟平均。這是整個環境表的定義，對不上就代表內插壞了。 */
    assert.ok(Math.abs(x.par.era-x.env.era)<0.10,`${lv} par 的 ERA 沒有落在聯盟平均：${x.par.era} vs ${x.env.era}`);
    assert.ok(Math.abs(x.par.k9-x.env.k9)<0.25,`${lv} par 的 K/9 偏離：${x.par.k9} vs ${x.env.k9}`);
    assert.ok(Math.abs(x.par.bb9-x.env.bb9)<0.20,`${lv} par 的 BB/9 偏離：${x.par.bb9} vs ${x.env.bb9}`);
    assert.ok(Math.abs(x.par.h9-x.env.h9)<0.30,`${lv} par 的 H/9 偏離：${x.par.h9} vs ${x.env.h9}`);
    assert.ok(Math.abs(x.par.avg-x.env.avg)<0.012,`${lv} par 的打擊率偏離：${x.par.avg} vs ${x.env.avg}`);

    /* ② ERA 與 WHIP 必須是同一個投手的兩個面向。舊版 par 的投手是 WHIP 1.53／ERA 4.32，
       那兩個數字在真實棒球裡不可能同時出現。 */
    assert.ok(Math.abs(x.par.whip-x.env.whip)<0.05,
      `${lv} par 的 WHIP 沒有跟著被安打與四死球走：${x.par.whip} vs ${x.env.whip}`);
    assert.equal(x.eraStable,true,`${lv} ERA 不是從零件算的——重算一次就變了`);

    /* ③ 被全壘打是獨立欄位，而且不可能超過被安打 */
    assert.equal(x.hrAllowed.always,true,`${lv} 沒有產生被全壘打 pHR`);
    assert.equal(x.hrAllowed.leHits,true,`${lv} 被全壘打超過被安打`);

    /* ④ 能力 80 ＝ 遠遠高於這個聯盟的水準，成績必須跟著誇張 */
    assert.ok(x.top.era<x.env.era*0.55,`${lv} 滿檔投手壓不下去：${x.top.era} vs 聯盟 ${x.env.era}`);
    assert.ok(x.top.avg>x.env.avg*1.28,`${lv} 滿檔打者的打擊率不夠高：${x.top.avg}`);

    /* ④b 往下那一側不能指數崩壞。指數曲線兩邊對稱的話，能力 30 的投手會投出
       中職 WHIP 1.98／大聯盟 2.37——真實世界投滿一季不存在 2.0 以上的 WHIP。
       ENV_DOWN 就是在收這一側（同一組能力現在是 1.57／1.87）。
       大聯盟那個數字本來就該比中職難看：能力 30 對 par 59 差了 29 點。 */
    assert.ok(x.low.whip<2.00,`${lv} 低於水準的投手崩到不存在的 WHIP：${x.low.whip}`);
    assert.ok(x.low.whip<x.env.whip*1.50,
      `${lv} 低於水準的投手崩得太誇張：WHIP ${x.low.whip} vs 聯盟 ${x.env.whip}`);
    assert.ok(x.low.era>x.env.era,`${lv} 低於水準的投手 ERA 應該比聯盟平均差：${x.low.era}`);

    /* ⑤ 門檻表要跟著聯盟走，而且級距順序正確 */
    const t=x.th;
    assert.ok(t.pitch.era3<t.pitch.era2&&t.pitch.era2<t.pitch.era1,`${lv} 投手評等門檻順序錯亂`);
    assert.ok(t.bat.ops3>t.bat.ops2&&t.bat.ops2>t.bat.ops1,`${lv} 打者評等門檻順序錯亂`);
    assert.ok(t.keep.era>t.pitch.era2,`${lv} 降級免疫應該比「評等2」寬鬆`);
  }

  /* ⑥ 同一個球員，在越弱的聯盟越無雙。比的是「每個打數的全壘打率」而不是支數——
     中職一年 120 場、大聯盟 162 場，支數會被賽程長度混淆。

     只驗中職對日職、中職對大聯盟這兩條。日職對大聯盟刻意不驗：日職的聯盟長打環境
     （每打數 1.9%）比大聯盟（3.4%）低很多，par 卻只差 6 點，所以固定球員從日職
     換到大聯盟，長打率反而會升約 15%。真實世界的證據兩邊都有（大谷升、鈴木誠也與
     吉田正尚降），而中職那兩條才是這次要修的東西。

     力量 70 與力量 80 兩組都要驗。加天花板的時候中職那條線一度訂在 45 轟
     （紀錄 ×1.15），換算成每打數是 .0980，比大聯盟 84 支的 .1356 還低——
     中職一年 120 場、大聯盟 162 場，同樣是「紀錄 ×1.15」，短賽程那邊的率值
     就是比較低。結果是力量 ≥ 78 的滿檔砲在中職反而不如在大聯盟。
     中職的上限因此單獨拉到 63 轟（.1373 > .1356），把排序買回來。
     所以這兩條斷言現在是那個決定的看門狗：中職的天花板再被調低就會踩到。 */
  for(const [tag,pick] of [['力量70',x=>x.elite.hrRate],['力量80',x=>x.top.hrRate]]){
    const rate=Object.fromEntries(L.map(lv=>[lv,pick(r[lv])]));
    assert.ok(rate.CPBL1>rate.NPB1,
      `${tag}：同一個砲手在中職的長打率應該高於日職：${rate.CPBL1} vs ${rate.NPB1}`);
    assert.ok(rate.CPBL1>rate.MLB,
      `${tag}：同一個砲手在中職的長打率應該高於大聯盟：${rate.CPBL1} vs ${rate.MLB}`);
  }
  /* 天花板本身也要守住排序，不只是採樣出來的結果。 */
  assert.ok(r.CPBL1.cap.hrRate>r.MLB.cap.hrRate,
    `中職的單季天花板（每打數）不可以低於大聯盟：${r.CPBL1.cap.hrRate} vs ${r.MLB.cap.hrRate}`);
  assert.ok(r.CPBL1.top.era<r.MLB.top.era,
    `同一個投手在中職應該比在大聯盟更壓制：${r.CPBL1.top.era} vs ${r.MLB.top.era}`);

  /* ⑥b 使用者當初的原話：「如果力量 80，中職都只能 30 轟，是一件極其不合理的事情。」
     魔鷹在日職是單季最多 13 轟的角色球員，到中職就打出 30 轟拿全壘打王；
     一個滿檔的砲手在中職應該遠遠超過他。中職的天花板是 63 轟，實測滿檔砲的
     中位落在 48 支、把生涯年與狀態火燙疊滿到 60 出頭——正好對上 season.js 原本
     寫的「一個大聯盟等級的砲手掉到中職就是會打出六十轟」。 */
  assert.ok(r.CPBL1.top.HR>=45,'中職滿檔砲應該遠超過 30 支：'+r.CPBL1.top.HR);

  /* ⑥c 單季的物理天花板。滿檔球員要逼近它但不可以越過——這是「破百轟」那份
     回報的回歸測試。日職與大聯盟照真實紀錄 ×1.15（60→69、73→84），
     中職拉到 63（理由見 ⑥ 的排序），打擊率一律 ×1.06。 */
  for(const lv of L){
    const x=r[lv];
    assert.ok(x.top.hrRate<x.cap.hrRate,
      `${lv} 滿檔砲的全壘打率越過了單季天花板：${x.top.hrRate} vs ${x.cap.hrRate}`);
    assert.ok(x.top.hrRate>x.cap.hrRate*0.60,
      `${lv} 天花板把滿檔砲壓得太低，應該要逼近它：${x.top.hrRate} vs ${x.cap.hrRate}`);
    assert.ok(x.top.avg<x.cap.avg,
      `${lv} 滿檔打者的打擊率越過了單季天花板：${x.top.avg} vs ${x.cap.avg}`);
    /* 一般球員（聯盟水準）完全不該感覺到天花板的存在。 */
    assert.ok(x.par.avg<x.cap.avg*0.85,
      `${lv} 聯盟水準的打者離天花板太近，softCap 壓到了不該壓的人：${x.par.avg}`);
  }

  /* ⑦ 中職是高打擊率、低長打的聯盟（真實：.259／1.59%），日職與大聯盟打擊率一樣低 */
  assert.ok(r.CPBL1.env.avg>r.NPB1.env.avg&&r.CPBL1.env.avg>r.MLB.env.avg,
    '中職的聯盟打擊率應該最高');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,1));
}finally{ await browser.close(); }
