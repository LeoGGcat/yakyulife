/* 明星賽要有成績保底。

   玩家回報：「明星賽沒有保底，導致極度爛的成績也有可能進入明星賽。」

   根因在 awards.js 的 performanceOK——打者那條是四選一的 OR：
       PA>=300 && (avg>=門檻 || ops>=門檻 || HR>=門檻 || SB>=15)
   任何一項達標就整季放行，其他三項再難看都不管。實測 27,339 次判定裡最離譜的入選：
       .166／OPS .517／15 轟　← 靠 HR 過關，OPS+ 77
       .193／OPS .503／18 盜　← 靠 SB>=15 過關，OPS+ 75
       .171／OPS .457／ 3 轟　← 台中猛獁的人氣票，30% 固定機率、完全不看成績，OPS+ 65
   主路線本來就要求 OPS+ 約 110（asOps 1.07~1.13），所以補的是**地板**而不是把門檻上搬。

   守住五件事：
     ① 單項達標但整體慘不忍睹 → 進不去（HR 那條）
     ② 盜壘達標但整體慘不忍睹 → 進不去（SB 那條）
     ③ 人氣票也要有地板，但比成績路線寬（這是猛獁的特色，不能直接拿掉）
     ④ 正常的好球季照常入選——地板不可以把一般明星球員一起掃掉
     ⑤ 二刀流用比較好的那一側判定：打擊爛但投球好，照樣是明星 */
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
  await page.goto(`${url}?seed=as-floor`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state =await import('./src/core/state.js?v=2.1.0');
    const rng   =await import('./src/core/rng.js?v=2.1.0');
    const awards=await import('./src/engine/awards.js?v=2.1.0');
    const {LV,envLeagueOps}=await import('./src/data/teams.js?v=2.1.0');

    /* 入選是機率事件（asP），所以跑 N 次數有沒有人中，而不是賭單一次結果。
       地板擋掉的情況 asP 會是 0 → 必定 0/N。 */
    const N=60;
    const trial=(pos,lv,st,team)=>{
      let hit=0;
      for(let i=0;i<N;i++){
        rng.seedInit('as'+lv+pos+(team||'')+st.HR+st.SB+st.PA+i);
        const s=state.newState('x',1,pos,null);
        Object.assign(s,{stage:'PRO',lv,org:LV[lv].org,orgTeam:team||'北岸閃電',
          dpos:pos==='P'?null:'DH',role:pos==='P'?'SP':null,age:27,year:2038,seasonFactor:1});
        s.teamName=function(){return this.orgTeam;};
        /* awards() 會讀 S.stats[bucket]（新人王判定、明星賽計數），不能是 null。
           yr 設 5 讓他不是菜鳥，免得新人王那一段混進來。 */
        const bucket=LV[lv].top||'CPBL';
        s.stats[bucket]=Object.assign(state.blankStat(),{yr:5,yrP:5,yrB:5});
        state.setS(s);
        const full=Object.assign(state.blankStat(),st);
        awards.awards(bucket,full);
        if(s.honors.some(h=>/明星賽/.test(h)))hit++;
      }
      return hit;
    };
    const opsPlus=(st,lv)=>{
      const slg=((st.H-st.HR)+st.HR*4)/st.AB;   /* 粗估，只用來標示測資 */
      return Math.round(((st.H+st.BB)/st.PA+slg)/envLeagueOps(LV[lv].env)*100);
    };

    /* d 是「該季實力 − 該層級 par」，asP 由它決定。測資一律給 d=5（能力不差），
       這樣擋住爛球季的就只剩成績地板本身——不然會分不清是地板擋的還是 d 太低。 */
    /* 回報案例：靠全壘打那一項過關的災難球季（中職一軍滿季 120 場） */
    const hrOnly={G:118,PA:470,AB:440,H:73,HR:16,RBI:48,SB:0,BB:28,avg:73/440,DEF:0,d:5};
    /* 回報案例：靠盜壘那一項過關 */
    const sbOnly={G:118,PA:470,AB:430,H:84,HR:3,RBI:30,SB:22,BB:36,avg:84/430,DEF:0,d:5};
    /* 正常的明星級球季 */
    const good  ={G:118,PA:500,AB:445,H:138,HR:24,RBI:88,SB:8,BB:50,avg:138/445,DEF:0,d:5};
    /* 中等偏下，但還在人氣票可以接受的範圍 */
    const meh   ={G:118,PA:500,AB:450,H:117,HR:12,RBI:58,SB:5,BB:44,avg:117/450,DEF:0,d:5};

    return {
      hrOnly  :{hit:trial('IF','CPBL1',hrOnly),plus:opsPlus(hrOnly,'CPBL1')},
      sbOnly  :{hit:trial('IF','CPBL1',sbOnly),plus:opsPlus(sbOnly,'CPBL1')},
      good    :{hit:trial('IF','CPBL1',good),  plus:opsPlus(good,'CPBL1')},
      /* 人氣票：台中猛獁 */
      popBad  :{hit:trial('IF','CPBL1',hrOnly,'台中猛獁'),plus:opsPlus(hrOnly,'CPBL1')},
      popMeh  :{hit:trial('IF','CPBL1',meh,'台中猛獁'),   plus:opsPlus(meh,'CPBL1')},
      /* 一般球隊的同一份中等成績，拿來對照人氣票確實有加成 */
      normMeh :{hit:trial('IF','CPBL1',meh),             plus:opsPlus(meh,'CPBL1')},
      /* ⑤ 二刀流：打擊是 hrOnly 那種災難，但投球很好 */
      twGoodArm:{hit:trial('TW','CPBL1',Object.assign({},hrOnly,
        {GP:26,IP:170,W:14,L:6,SO:150,ER:52,pH:140,pBB:40,pHR:10,era:52*9/170}))},
      floors:{ops:awards.AS_FLOOR_OPS,opsPop:awards.AS_FLOOR_OPS_POP,
        era:awards.AS_FLOOR_ERA,eraPop:awards.AS_FLOOR_ERA_POP},
      N,
    };
  });

  /* 測資前提。這裡刻意寫死 100／85 而不是讀 awards.js 匯出的常數——
     舊碼上那兩個常數還不存在，斷言順序放錯的話會因為「讀不到常數」而失敗，
     那不算抓到行為。底下三條是純粹量行為的，常數的一致性放到最後再驗。 */
  const OPS_FLOOR=100, OPS_FLOOR_POP=85;
  assert.ok(r.hrOnly.plus<OPS_FLOOR,`「只有全壘打」那份測資的 OPS+ 應該低於地板：${r.hrOnly.plus}`);
  assert.ok(r.sbOnly.plus<OPS_FLOOR,`「只有盜壘」那份測資的 OPS+ 應該低於地板：${r.sbOnly.plus}`);
  assert.ok(r.good.plus>=OPS_FLOOR,`「正常好球季」那份測資應該高於地板：${r.good.plus}`);
  assert.ok(r.popMeh.plus>=OPS_FLOOR_POP&&r.popMeh.plus<OPS_FLOOR,
    `「中等球季」要落在人氣地板與成績地板之間才驗得出人氣票：OPS+ ${r.popMeh.plus}`);

  /* ① ② 這就是玩家回報的那兩格 */
  assert.equal(r.hrOnly.hit,0,
    `.166 打擊率／OPS+ ${r.hrOnly.plus} 的球季靠 16 轟就進了明星賽 ${r.hrOnly.hit}/${r.N} 次——這就是回報的 bug`);
  assert.equal(r.sbOnly.hit,0,
    `.195 打擊率／OPS+ ${r.sbOnly.plus} 的球季靠 22 盜就進了明星賽 ${r.sbOnly.hit}/${r.N} 次`);

  /* ③ 人氣票也要有地板，但要比成績路線寬 */
  assert.equal(r.popBad.hit,0,
    `台中猛獁的人氣票讓 OPS+ ${r.popBad.plus} 的球季進了明星賽 ${r.popBad.hit}/${r.N} 次——人氣票也要有地板`);
  assert.ok(r.popMeh.hit>0,
    `人氣票的地板卡過頭了：OPS+ ${r.popMeh.plus} 的中等球季在猛獁也進不去（${r.popMeh.hit}/${r.N}），`+
    `那等於把人氣入選整個拿掉`);
  assert.ok(r.popMeh.hit>r.normMeh.hit,
    `人氣票應該仍然有加成：猛獁 ${r.popMeh.hit}/${r.N} vs 一般球隊 ${r.normMeh.hit}/${r.N}`);

  /* ④ 正常好球季不可以被掃到 */
  assert.ok(r.good.hit>=r.N*0.5,
    `.310／24 轟的好球季入選率掉到 ${r.good.hit}/${r.N}——地板把一般明星球員一起掃掉了`);

  /* ⑤ 二刀流看比較好的那一側 */
  assert.ok(r.twGoodArm.hit>0,
    `二刀流打擊不好但投出 170 局／ERA 2.75，仍然應該進得了明星賽（${r.twGoodArm.hit}/${r.N}）`);

  /* 最後才驗常數本身，確保上面寫死的數字沒有跟實作脫鉤 */
  assert.equal(r.floors.ops,OPS_FLOOR,`成績地板改了就要同步改這支測試：${JSON.stringify(r.floors)}`);
  assert.equal(r.floors.opsPop,OPS_FLOOR_POP,`人氣地板改了就要同步改這支測試：${JSON.stringify(r.floors)}`);
  assert.ok(r.floors.eraPop<r.floors.era,'人氣路線的投手地板應該比成績路線寬');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({地板:r.floors,樣本數:r.N,
    只有全壘打:r.hrOnly,只有盜壘:r.sbOnly,正常好球季:r.good,
    人氣票_爛成績:r.popBad,人氣票_中等:r.popMeh,一般球隊_中等:r.normMeh,
    二刀流_好投球:r.twGoodArm},null,1));
}finally{ await browser.close(); }
