/* 二刀流 第 3 階段：生涯評價與名人堂。
   校準常數的反解過程見 data/economy.js 的 LEAGUE_K 註解與 docs/twoway-design.md §7。 */
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
  await page.goto(`${url}?seed=twoway-phase3`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const career=await import('./src/engine/career.js?v=2.1.0');
    const phases=await import('./src/flow/phases.js?v=2.1.0');
    const {LEAGUE_K,HOF_TH_K}=await import('./src/data/economy.js?v=2.1.0');

    /* 十九年的二刀流履歷。GP/IP 是投球側、PA/G 是打擊側，兩者並存 → 這才是判斷依據。 */
    const twoWayStat=()=>({yr:19,GP:360,G:2100,PA:8800,AB:7700,H:2200,HR:330,RBI:1200,SB:80,BB:900,
      W:150,L:90,SV:0,HLD:0,IP:2100,SO:2000,ER:760,AS:8,DEF:0,DPG:{DH:2100}});
    const hitterStat=()=>{ const s=twoWayStat(); delete s.GP; s.IP=0; s.W=0; s.SO=0; return s; };

    const mk=(pos,over={})=>{
      const s=state.newState('二刀',1,pos==='TW'?'TW':pos,null);
      Object.assign(s,{stage:'PRO',year:2050,age:38,org:'NPB',lv:'NPB1',orgTeam:'阪神猛虎',
        role:'SP',seasonFactor:1,twSeasons:19},over);
      s.teamName=function(){return this.orgTeam||'';};
      state.setS(s); return s;
    };

    /* ① 判斷依據是「打出來的東西」，不是退休當下的 S.pos。
       89.5% 的二刀流會在 39 歲被收斂成單刀，用 S.pos 判斷會讓那十九年整段被當成純打者。 */
    const s1=mk('OF');                       /* 已經被強制轉回外野手 */
    s1.stats={CPBL:null,NPB:twoWayStat(),MLB:null,MINOR:null};
    const detect={twoWayEvenAfterFallback:career.isTwoWayCareer(s1.stats.NPB),
                  pureHitterNotMistaken:career.isTwoWayCareer(hitterStat()),
                  tierPosKey:null,scoreIsSum:null,posTierK:career.posTierK(s1.stats.NPB,'NPB')};
    const cs=career.careerScore(s1.stats.NPB,'NPB');
    const sumOfParts=career.pitcherCareerScore(s1.stats.NPB,'NPB')+career.hitterCareerScore(s1.stats.NPB,'NPB');
    detect.scoreIsSum=Math.abs(cs-sumOfParts)<1e-6;
    /* tierOf 會依 posKey 取用 LEAGUE_K；用「拿掉 TW 常數就會變成另一個分數」反推它走了哪一條。 */
    const tier=career.tierOf('NPB');
    const k=LEAGUE_K.NPB.TW, hs=career.honorScore('NPB').sc;
    detect.tierPosKey=Math.abs(tier.sc-Math.round(cs*k[0]+hs*k[1]))<=1?'TW':'其他';

    /* ② 同一年拿下最佳投手＋最佳打者，兩座都要算到。 */
    const s2=mk('TW');
    s2.stats={CPBL:null,NPB:twoWayStat(),MLB:null,MINOR:null};
    s2.honors=['2045 日職年度最佳投手','2045 日職年度最佳打者'];
    const bothAwards=career.honorScore('NPB').sc;
    s2.honors=['2045 日職年度最佳打者'];
    const oneAward=career.honorScore('NPB').sc;

    /* ③ 天才連坐只在「還沒真正打過二刀流就崩掉」時發動。 */
    const audit=(twSeasons)=>{
      const s=mk('TW',{lv:'NPB1',twSeasons,dpos:'DH'});
      Object.assign(s.ab,{sta:55,vel:18,ctl:18,brk:18,con:60,pow:58,spd:50,eye:55});
      s.traits.genius=true; s.six=5; s.twOrigin='tap'; s.twAuditLv=s.lv; /* 已在該層級站過一季 */
      const fired=phases.twoWayAudit();
      return {fired,pos:s.pos,genius:s.traits.genius,six:s.six};
    };
    return {detect,bothAwards,oneAward,
      early:audit(1),established:audit(9),
      K:{TW:LEAGUE_K.NPB.TW,P:LEAGUE_K.NPB.P,H:LEAGUE_K.NPB.H,hk:HOF_TH_K.NPB.TW},
      tier:{i:tier.i,sc:tier.sc,hofTh:Math.round(tier.hofTh),name:tier.name}};
  });

  /* ① 評價依據 */
  assert.equal(r.detect.twoWayEvenAfterFallback,true,
    '被強制轉回之後，那段二刀流履歷仍必須以二刀流計分——否則十九年會被當成純打者');
  assert.equal(r.detect.pureHitterNotMistaken,false,'純打者不可以被誤判成二刀流');
  assert.equal(r.detect.scoreIsSum,true,'二刀流的生涯分＝投手分＋打者分');
  assert.equal(r.detect.posTierK,1,'二刀流的 posTierK 要回 1（守位代價已在打擊側扣過）');
  assert.equal(r.detect.tierPosKey,'TW','tierOf 沒有走 TW 的折算係數');

  /* ② 同年雙獎 */
  assert.ok(r.bothAwards>r.oneAward,'同年拿下最佳投手＋最佳打者應該高於只拿一座');
  assert.equal(r.bothAwards,r.oneAward*2,'兩座 460 分的大獎應該各算一次');

  /* ③ 天才連坐 */
  assert.equal(r.early.fired,true);
  assert.equal(r.early.pos,'OF');
  assert.equal(r.early.genius,false,'不到 5 季就崩掉＝刷天才，要連坐');
  assert.equal(r.early.six,0);
  assert.equal(r.established.fired,true);
  assert.equal(r.established.genius,true,'打滿 5 季以上的二刀流，四十歲停止投球不該被拔天才');

  /* ④ 校準常數在合理範圍：TW 的 Kbase 應落在同聯盟投手與打者之間偏低處 */
  assert.ok(r.K.TW[0]>0.5&&r.K.TW[0]<Math.max(r.K.P[0],r.K.H[0]),
    'TW 的 Kbase 超出合理範圍：'+JSON.stringify(r.K));
  assert.equal(r.K.hk,1);

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,2));
}finally{ await browser.close(); }
