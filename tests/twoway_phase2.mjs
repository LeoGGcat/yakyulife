/* 二刀流 第 2 階段：一季同時產生投打兩條成績線、投打配比、TJ、強制轉回。
   規格見 docs/twoway-design.md §4～§6。 */
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
  await page.goto(`${url}?seed=twoway-phase2`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const season=await import('./src/engine/season.js?v=2.1.0');
    const injury=await import('./src/engine/injury.js?v=2.1.0');
    const phases=await import('./src/flow/phases.js?v=2.1.0');

    const mk=(abv,over={})=>{
      const s=state.newState('二刀',1,'TW',null);
      Object.assign(s,{stage:'PRO',year:2035,age:27,org:'CPBL',lv:'CPBL1',orgTeam:'新北騎士',
        role:'SP',dpos:'DH',seasonFactor:1,effort:'普通投'},over);
      s.traits.genius=true; s.six=5;
      Object.assign(s.ab,{sta:62,vel:60,ctl:58,brk:59,con:60,pow:58,spd:50,eye:56},abv||{});
      s.teamName=function(){return this.orgTeam||'';};
      /* 這一組測試量的是「門檻本身」，不是升級緩衝。補上 twAuditLv＝當前層級，
         代表他已經在這個層級站過一季，audit 才會直接用這個層級的尺。 */
      if(s.twAuditLv==null)s.twAuditLv=s.lv;
      state.setS(s); return s;
    };

    /* ① 投打配比：先發場次 85 / 70 / 50%，打擊出賽只有「以投為主」會打折。
       單季有隨機項，取多次平均才穩。 */
    const share={};
    for(const eff of ['全力投','普通投','養生球']){
      let gp=0,g=0;
      for(let i=0;i<400;i++){ mk(null,{effort:eff}); const st=season.simSeason('CPBL1'); gp+=st.GP; g+=st.G; }
      share[eff]={GP:+(gp/400).toFixed(1),G:+(g/400).toFixed(1)};
    }

    /* ② 一季同時有兩條線，而且 G 與 GP 是分開的欄位。 */
    mk(); const st=season.simSeason('CPBL1');
    const dual={hasGP:Number.isFinite(st.GP),GP:st.GP,G:st.G,
      separate:st.GP!==st.G,pitched:st.IP>0,batted:st.PA>0,
      dPit:st.dPit,dBat:st.dBat,d:st.d,line:season.statLine(st)};

    /* ③ TJ 累積必須讀登板數，不能讀打擊出賽。 */
    const tj={};
    { const s=mk(null,{role:'MR',tj:0});
      injury.tjAccrue({GP:20,G:140,IP:21,era:3.2},'CPBL1'); tj.byGP=+s.tj.toFixed(2); }
    { const s=mk(null,{role:'MR',tj:0});
      injury.tjAccrue({G:140,IP:21,era:3.2},'CPBL1'); tj.ifItReadG=+s.tj.toFixed(2); }
    /* 二刀流的倍數要比單刀高（1.25 對 1.00）。 */
    { const s=mk(null,{role:'SP',tj:0}); injury.tjAccrue({GP:19,G:117,IP:113,era:3.2},'CPBL1'); tj.tw=+s.tj.toFixed(2); }
    { const s=mk(null,{role:'SP',tj:0}); s.pos='P';
      injury.tjAccrue({G:19,IP:113,era:3.2},'CPBL1'); tj.solo=+s.tj.toFixed(2); }

    /* ④ TJ 復健年：只停投球，打擊照跑。 */
    mk(null,{pitchOut:true});
    const rehab=(()=>{ const x=season.simSeason('CPBL1');
      return {GP:x.GP,IP:x.IP,G:x.G,PA:x.PA,d:x.d,noPitD:!Number.isFinite(x.dPit)}; })();

    /* ⑤ 強制轉回：門檻是該層級 min − TW_BAR（中職一軍 41 → 40.5）。 */
    const audit={};
    const snap=s=>({fired:s.__fired,pos:s.pos,role:s.role,dpos:s.dpos,
      genius:s.traits.genius,six:s.six,removed:s.removed.slice(),
      hasGlove:['rng','fld','arm'].every(k=>k in s.ab)});
    let s;
    s=mk({sta:55,vel:52,ctl:50,brk:50,con:52,pow:50,spd:45,eye:48}); s.__fired=phases.twoWayAudit(); audit.both=snap(s);
    s=mk({sta:55,vel:55,ctl:52,brk:52,con:20,pow:20,spd:20,eye:20}); s.__fired=phases.twoWayAudit(); audit.batDead=snap(s);
    s=mk({sta:55,vel:18,ctl:18,brk:18,con:60,pow:58,spd:50,eye:55}); s.__fired=phases.twoWayAudit(); audit.pitDead=snap(s);
    s=mk({sta:55,vel:18,ctl:18,brk:18,con:60,pow:58,spd:50,eye:55},{twOrigin:'genius'});
    s.__fired=phases.twoWayAudit(); audit.organic=snap(s);
    /* 同一組能力在大聯盟門檻更嚴（min 56 → 55.5）。 */
    s=mk({sta:50,vel:50,ctl:48,brk:48,con:50,pow:48,spd:42,eye:45},{lv:'CPBL1'});
    s.__fired=phases.twoWayAudit(); audit.cpbl=snap(s);
    s=mk({sta:50,vel:50,ctl:48,brk:48,con:50,pow:48,spd:42,eye:45},{lv:'MLB',org:'MiLB'});
    s.__fired=phases.twoWayAudit(); audit.mlb=snap(s);

    /* ⑥ 球季評等取兩側較高的一邊。 */
    mk();
    const grade={
      pitOnly:season.seasonGrade({GP:25,G:120,IP:150,ER:40,H:120,BB:30,era:2.40,PA:0},'CPBL1','SP'),
      batOnly:season.seasonGrade({GP:0,G:120,IP:0,PA:500,H:160,BB:50,HR:25,AB:450},'CPBL1','SP'),
    };
    return {share,dual,tj,rehab,audit,grade};
  });

  /* ① 配比 */
  const ratio=r.share['全力投'].GP/r.share['普通投'].GP;
  assert.ok(Math.abs(ratio-0.85/0.70)<0.06,'先發場次比例不符 85/70：'+JSON.stringify(r.share));
  assert.ok(r.share['養生球'].GP<r.share['普通投'].GP*0.80,'養生球的登板數應該明顯更少');
  assert.ok(r.share['全力投'].G<r.share['普通投'].G,'以投為主應該扣打擊出賽');
  assert.ok(Math.abs(r.share['養生球'].G-r.share['普通投'].G)/r.share['普通投'].G<0.05,'養生球不該扣打擊出賽');

  /* ② 雙成績線 */
  assert.ok(r.dual.hasGP&&r.dual.separate,'st.G 與 st.GP 必須分家');
  assert.ok(r.dual.pitched&&r.dual.batted,'二刀流一季要同時有投球與打擊成績');
  assert.ok(r.dual.d>=Math.max(r.dual.dPit,r.dual.dBat),'合成的 d 不該低於較強的一側');
  assert.ok(r.dual.d<=Math.max(r.dual.dPit,r.dual.dBat)+6,'弱側回饋最多 +6');
  assert.match(r.dual.line,/^投 .*／.*打 /,'statLine 要投打兩段');

  /* ③ TJ 讀登板數，不讀打擊出賽 */
  assert.ok(r.tj.byGP<r.tj.ifItReadG*0.9,'tjAccrue 沒有改讀 GP：'+JSON.stringify(r.tj));
  assert.ok(r.tj.tw>r.tj.solo,'二刀流的 TJ 倍數應該高於單刀：'+JSON.stringify(r.tj));

  /* ④ 復健年只停投球 */
  assert.equal(r.rehab.GP,0); assert.equal(r.rehab.IP,0);
  assert.ok(r.rehab.G>0&&r.rehab.PA>0,'復健年的打擊要照跑');
  assert.ok(Number.isFinite(r.rehab.d),'沒投球時 d 不可以是 NaN');

  /* ⑤ 強制轉回 */
  assert.equal(r.audit.both.fired,false);
  assert.equal(r.audit.both.pos,'TW');
  assert.deepEqual([r.audit.batDead.fired,r.audit.batDead.pos,r.audit.batDead.dpos],[true,'P',null]);
  assert.equal(r.audit.batDead.genius,false,'七下路線失去二刀流要一併拔天才');
  assert.equal(r.audit.batDead.six,0,'拔天才時必須把 S.six 歸零，否則下一次擲骰立刻重新解鎖');
  assert.ok(r.audit.batDead.removed.includes('天才'));
  assert.deepEqual([r.audit.pitDead.fired,r.audit.pitDead.pos,r.audit.pitDead.dpos],[true,'OF','DH']);
  assert.equal(r.audit.pitDead.hasGlove,true,'轉打者要補上守備工具，否則後續會出現 NaN');
  assert.equal(r.audit.organic.genius,true,'有機路線的天才不該被拔');
  assert.equal(r.audit.organic.six,5);
  assert.equal(r.audit.cpbl.fired,false,'這組能力在中職一軍應該撐得住');
  assert.equal(r.audit.mlb.fired,true,'同一組能力在大聯盟應該被強制轉回');

  /* ⑥ 評等取較高的一側 */
  assert.ok(r.grade.pitOnly>=2,'投球側夠好就不該被評低');
  assert.ok(r.grade.batOnly>=2,'打擊側夠好就不該被評低');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,2));
}finally{ await browser.close(); }
