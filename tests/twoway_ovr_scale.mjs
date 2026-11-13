/* 二刀流的綜合評價：練弱側必須看得到回報。

   玩家回饋「速度選球加不了綜評，感覺變雞肋了」。量下來比回饋更嚴重——
   舊式子是 `max(投,打) + clamp((弱側 − 35) × 0.15, 0, 8)`，而二刀流實際待的區間
   （日職一軍弱側 p25~p95 = 54~65）距離那條 35 的替代線很遠，弱側減完 35
   全都是 19~30 的大數字，再乘 0.15 之後整段區間的加成只從 2.9 變到 4.5。
   結果是把弱側從收斂線一路練到 p95，綜評總共只漲 中職 +3／日職 +2／大聯盟 +1。
   上限 8 也碰不到：能力全滿時弱側最多 73.5，加成也才 5.8。

   常數重算成 TW_REPL 45 / TW_WEAK 0.45 / TW_CAP 16（見 ability.js 的說明）。

   守住五件事：
     ① 形狀不變：弱側崩到替代線以下時加成歸零，評價收斂回 max()——
        強制收斂的當下不可以出現斷崖
     ② 練弱側真的有回報：從收斂線練到 p95，中職與日職都要漲 5 分以上
     ③ 單調：弱側每一點都要讓綜評不減
     ④ 上限碰得到也壓得住：能力全滿時加成落在 10~16 之間
     ⑤ 單刀球員一點都不受影響 */
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
  await page.goto(`${url}?seed=tw-ovr-scale`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const A    =await import('./src/engine/ability.js?v=2.1.0');
    const {LV} =await import('./src/data/teams.js?v=2.1.0');

    const mk=(pos,ab,over={})=>{
      const s=state.newState('x',1,pos,null);
      Object.assign(s,{stage:'PRO',lv:'NPB1',org:'NPB',orgTeam:'X',
        dpos:pos==='P'?null:'DH',role:'SP',age:27},over);
      Object.assign(s.ab,ab); s.teamName=function(){return 'X';};
      state.setS(s); return s;
    };
    /* 投球側固定在滿檔附近，只掃打擊側，好讓「弱側」一直是打擊。 */
    const STRONG={sta:70,vel:72,ctl:70,brk:71};
    const batAt=v=>({con:v,pow:v-2,eye:v-4,spd:v-8,rng:24,fld:24,arm:24});
    const scan=[];
    for(let v=30;v<=80;v+=1){
      mk('TW',{...STRONG,...batAt(v)});
      scan.push({v,pit:+A.ovrPit().toFixed(2),bat:+A.ovrBat().toFixed(2),ovr:A.ovr()});
    }
    /* 弱側崩到谷底：加成應該歸零，綜評等於強側 */
    mk('TW',{...STRONG,...batAt(20)});
    const dead={pit:+A.ovrPit().toFixed(2),bat:+A.ovrBat().toFixed(2),ovr:A.ovr()};
    /* 兩側都滿檔 */
    mk('TW',{sta:80,vel:80,ctl:80,brk:80,con:80,pow:80,eye:80,spd:80,rng:24,fld:24,arm:24});
    const full={pit:+A.ovrPit().toFixed(2),bat:+A.ovrBat().toFixed(2),ovr:A.ovr()};

    /* ⑤ 單刀對照：同一組能力當純投手／純指定打擊 */
    mk('P',{sta:70,vel:72,ctl:70,brk:71});
    const soloP=A.ovr();
    mk('OF',{sta:70,con:62,pow:60,eye:56,spd:52,rng:40,fld:40,arm:40},{dpos:'DH'});
    const soloDH=A.ovr();

    return {scan,dead,full,soloP,soloDH,
      K:{repl:A.TW_REPL,weak:A.TW_WEAK,cap:A.TW_CAP},
      mins:{CPBL1:LV.CPBL1.min,NPB1:LV.NPB1.min,MLB:LV.MLB.min}};
  });

  const at=t=>r.scan.reduce((a,b)=>Math.abs(b.bat-t)<Math.abs(a.bat-t)?b:a);
  const J=JSON.stringify(r.K);

  /* ② 先驗這次改動真正要解決的事，而且不依賴任何匯出的常數——
     舊公式跑這支測試時 TW_REPL 還不存在，斷言順序放錯的話會因為
     「讀不到常數」而失敗，那不算抓到行為。這幾條是純粹量行為的。 */
  const span=(minLv,p95)=>at(p95).ovr-at(minLv).ovr;
  const spans={CPBL1:span(r.mins.CPBL1,59.7),NPB1:span(r.mins.NPB1,63.9),MLB:span(r.mins.MLB,63.1)};
  assert.ok(spans.CPBL1>=5,`中職練弱側的回報太小：+${spans.CPBL1}（舊版是 +3）${J}`);
  assert.ok(spans.NPB1>=5,`日職練弱側的回報太小：+${spans.NPB1}（舊版是 +2）${J}`);
  assert.ok(spans.MLB>=2,`大聯盟練弱側的回報太小：+${spans.MLB}（舊版是 +1）${J}`);

  /* ① 弱側崩掉時加成歸零：綜評 == 強側，收斂當下沒有斷崖。
     18.5 遠低於任何一條合理的替代線，不必讀常數也成立。 */
  assert.ok(r.dead.bat<30,`測資沒把弱側壓夠低：${r.dead.bat}`);
  assert.equal(r.dead.ovr,Math.round(r.dead.pit),
    `弱側已經低於替代線，綜評應該就是強側本身：${r.dead.ovr} vs ${r.dead.pit}`);

  /* ③ 單調：弱側每長一點，綜評不可以倒退 */
  for(let i=1;i<r.scan.length;i++){
    assert.ok(r.scan[i].ovr>=r.scan[i-1].ovr,
      `弱側變強反而讓綜評下降：能力 ${r.scan[i-1].v}→${r.scan[i].v} 綜評 ${r.scan[i-1].ovr}→${r.scan[i].ovr}`);
  }

  /* ④ 上限要碰得到，但不能失控 */
  const fullBonus=r.full.ovr-Math.round(Math.max(r.full.pit,r.full.bat));
  assert.ok(fullBonus>=10,`兩側全滿的加成太小，上限等於裝飾：+${fullBonus} ${J}`);
  assert.ok(fullBonus<=20,`加成失控：+${fullBonus}`);
  if(Number.isFinite(r.K.cap))
    assert.ok(fullBonus<=r.K.cap,`加成越過了自己宣告的上限：+${fullBonus} > ${r.K.cap}`);

  /* 二刀流要明顯優於「同樣投球側的純投手」，那是這條路線的獎勵 */
  assert.ok(at(57.6).ovr>=r.soloP+4,
    `中位二刀流相對同級純投手的溢價太小：${at(57.6).ovr} vs ${r.soloP}`);

  /* ⑤ 單刀完全不受影響（常數只出現在 TW 分支） */
  assert.equal(r.soloP,Math.round(r.dead.pit),'純投手的綜評不該被這次改動碰到');
  assert.ok(r.soloDH>0&&r.soloDH<80,'純指定打擊的綜評應該照常算出來');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({常數:r.K,弱側崩掉:r.dead,兩側全滿:r.full,
    練弱側的回報:spans,純投手:r.soloP,
    取樣:[40,50,57.6,64,73].map(t=>({弱側:at(t).bat,綜評:at(t).ovr}))},null,1));
}finally{ await browser.close(); }
