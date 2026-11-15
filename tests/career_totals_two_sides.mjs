/* 生涯累積數據：投打兩側不可以共用同一格。

   玩家回報（截圖）：二刀流打了 3 年、之後被收斂成投手打完 17 年，結算頁的
   「大聯盟・打擊」寫著 Yrs 17、G 514、PA 335、AVG 6.456、OBP 8.081、H 2066，
   「大聯盟・投球」寫著 G 17、BB 37（2327 局只投出 37 個四死）。

   成因在 accStat()：舊版只有二刀流的球季會把投球數字寫進 GP／pH／pBB，
   單刀投手的登板數與被安打是寫進 G／H／BB 的——跟打者共用同一格。所以一段
   「先二刀流、後收斂成投手」的生涯：
     t.G = 二刀流那幾年的打擊出賽 ＋ 之後所有年的登板數
     t.H = 安打 ＋ 被安打        t.BB = 保送 ＋ 投出的四死
   而 pitG()／pitBB() 又只讀得到二刀流那幾年（GP／pBB 只有那時候才寫）。
   於是打擊那張表拿到被污染的數字、投球那張表反而漏掉大部分生涯。

   另外 Yrs 兩張表都讀同一個 st.yr（總球季數），所以只打過 3 年的打擊履歷會印 17 年。

   這支測試用「3 年二刀流 ＋ 14 年純投手」跑真的 accStat，守住五件事：
     ① 投球側拿得到整段 17 年，不是只有二刀流那 3 年
     ② 打擊側完全乾淨：G／H／BB 不含任何投球數字
     ③ 打出來的率值在物理範圍內（AVG 不可能是 6.456）
     ④ Yrs 兩側各自計算
     ⑤ 純投手與純打者的生涯不受這次改動影響 */
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
  await page.goto(`${url}?seed=career-totals`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state =await import('./src/core/state.js?v=2.1.0');
    const season=await import('./src/engine/season.js?v=2.1.0');
    const career=await import('./src/engine/career.js?v=2.1.0');

    /* 一個二刀流球季：投球寫 GP／pH／pBB，打擊寫 G／H／BB。 */
    const twSeason=()=>({GP:28,IP:170.0,W:12,L:8,SV:0,HLD:0,SO:190,ER:60,pH:140,pBB:45,pHR:18,
      G:79,PA:335,AB:302,H:76,HR:18,RBI:55,SB:2,BB:30,DEF:0});
    /* 一個純投手球季：投球寫 G／H／BB（單刀的欄位規則）。 */
    const pSeason=()=>({G:31,IP:155.0,W:11,L:10,SV:0,HLD:1,SO:150,ER:58,H:145,BB:42,pHR:16,
      PA:0,AB:0,HR:0,RBI:0,SB:0,DEF:0});
    /* 一個純打者球季。 */
    const bSeason=()=>({G:140,PA:600,AB:540,H:160,HR:25,RBI:85,SB:8,BB:55,DEF:3,
      IP:0,W:0,L:0,SV:0,HLD:0,SO:0,ER:0});

    const run=(plan)=>{
      const s=state.newState('測',1,'TW',null); state.setS(s);
      Object.assign(s,{stage:'PRO',lv:'MLB',org:'MiLB',orgTeam:'X',dpos:'DH'});
      s.teamName=function(){return 'X';};
      for(const [pos,role,st] of plan){
        s.pos=pos; s.role=role; s.dpos=(pos==='P')?null:'DH';
        season.accStat('MLB',st);
      }
      const t=s.stats.MLB;
      return {yr:t.yr,yrP:t.yrP,yrB:t.yrB,
        pitG:season.pitG(t),pitH:season.pitH(t),pitBB:season.pitBB(t),IP:t.IP,SO:t.SO,W:t.W,
        G:t.G,PA:t.PA,AB:t.AB,H:t.H,HR:t.HR,BB:t.BB,
        avg:t.AB>0?t.H/t.AB:null, obp:t.PA>0?(t.H+t.BB)/t.PA:null,
        whip:season.baseballWHIP(t), era:season.baseballERA(t),
        yrsP:career.yrsOf(t,true), yrsB:career.yrsOf(t,false)};
    };

    /* 回報的那段生涯：3 年二刀流 → 收斂成投手，再打 14 年。 */
    const plan=[];
    for(let i=0;i<3;i++)plan.push(['TW','SP',twSeason()]);
    for(let i=0;i<14;i++)plan.push(['P','SP',pSeason()]);
    const mixed=run(plan);

    /* ⑤ 對照組：純投手 17 年、純打者 17 年。 */
    const soloP=run(Array.from({length:17},()=>['P','SP',pSeason()]));
    const soloB=run(Array.from({length:17},()=>['OF',null,bSeason()]));
    return {mixed,soloP,soloB};
  });

  const m=r.mixed, J=JSON.stringify(m);

  /* ① 投球側要含整段生涯：3 年二刀流（28 登板）＋ 14 年純投手（31 登板） */
  assert.equal(m.pitG,3*28+14*31,`投球側的登板數漏掉了純投手那幾年：${J}`);
  assert.equal(m.pitH,3*140+14*145,`投球側的被安打漏掉了純投手那幾年：${J}`);
  assert.equal(m.pitBB,3*45+14*42,`投球側的四死漏掉了純投手那幾年（回報的 37 就是這裡）：${J}`);
  assert.equal(m.SO,3*190+14*150,`三振數不對：${J}`);

  /* ② 打擊側必須乾淨：只有二刀流那 3 年 */
  assert.equal(m.G,3*79,`打擊出賽被摻進登板數了：${m.G} 應為 ${3*79}`);
  assert.equal(m.H,3*76,`安打被摻進被安打了：${m.H} 應為 ${3*76}`);
  assert.equal(m.BB,3*30,`保送被摻進投出的四死了：${m.BB} 應為 ${3*30}`);
  assert.equal(m.PA,3*335,`打席不對：${m.PA}`);

  /* ③ 率值要落在物理範圍內——回報的 AVG 6.456／OBP 8.081 是這一條抓的 */
  assert.ok(m.avg>0.100&&m.avg<0.500,`生涯打擊率不可能是 ${m.avg}`);
  assert.ok(m.obp>0.150&&m.obp<0.600,`生涯上壘率不可能是 ${m.obp}`);
  assert.ok(m.G<=m.PA,`出賽數不可能多於打席：G ${m.G} / PA ${m.PA}`);
  assert.ok(m.whip>0.50&&m.whip<2.50,`生涯 WHIP 不合理：${m.whip}`);
  assert.ok(m.era>1.00&&m.era<8.00,`生涯 ERA 不合理：${m.era}`);

  /* ④ Yrs 兩側各自算 */
  assert.equal(m.yr,17,'總球季數應該還是 17');
  assert.equal(m.yrsP,17,`投球年數應為 17：${m.yrsP}`);
  assert.equal(m.yrsB,3,`打擊年數應為 3（回報的就是這裡印成 17）：${m.yrsB}`);

  /* ⑤ 純投手／純打者不受影響 */
  assert.equal(r.soloP.pitG,17*31,'純投手的登板數不該被改動');
  assert.equal(r.soloP.pitBB,17*42,'純投手的四死不該被改動');
  assert.equal(r.soloP.G,0,'純投手不該累積任何打擊出賽');
  assert.equal(r.soloP.yrsP,17); assert.equal(r.soloP.yrsB,0);
  assert.equal(r.soloB.G,17*140,'純打者的出賽數不該被改動');
  assert.equal(r.soloB.H,17*160,'純打者的安打不該被改動');
  assert.equal(r.soloB.pitG,0,'純打者不該累積任何登板數');
  assert.equal(r.soloB.yrsB,17); assert.equal(r.soloB.yrsP,0);

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,1));
}finally{ await browser.close(); }
