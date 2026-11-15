/* 狀態火燙／低潮不可以生出物理上不存在的成績。

   回報的案例：能力 球速 53／控球 46／變化球 56 的二刀流，在大聯盟（par 59，
   三項全部低於聯盟平均）投出 6 登板／46.0 局／ERA 1.76／63 三振——
   每場 7.7 局、K/9 12.3。兩個都是不存在的數字。

   成因是舊版的加成寫成「st.SO += p×8、st.IP += p×4」：
     ① 絕對值，不隨工作量縮放。投 200 局的王牌加 8 個三振無感，
        只投 30 局的二刀流加 8 個就是 +30%。
     ② 憑空生出來的局數沒有對應的被安打與四死球。ERA 改成由零件反推之後，
        IP 是 h9／bb9／hr9 的分母，多灌局數進去等於把三個率值一起除小，
        ERA 直接崩掉。舊版看不出來，因為那時候 ERA 是獨立擲的。

   現在拆成「出賽機會」與「內容」兩件事，兩件都是比例。這支測試守住四件事：
     ① 每場局數不受狀態影響（先發 4.8~6.5、後援約 1.05）
     ② K/9 不會偏離能力該有的水準太多
     ③ ERA 與 WHIP 同進同退（火燙讓兩者一起變好，不會只有 ERA 崩下去）
     ④ 火燙的方向要對：成績變好、出賽變多 */
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
  await page.goto(`${url}?seed=season-form`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const rng=await import('./src/core/rng.js?v=2.1.0');
    const season=await import('./src/engine/season.js?v=2.1.0');
    const med=a=>{a=a.slice().sort((x,y)=>x-y);return a[a.length>>1];};

    /* 回報案例的能力值：大聯盟 par 59，三項全部低於聯盟平均。 */
    const AB={sta:60,vel:53,ctl:46,brk:56,con:60,pow:58,spd:55,eye:55,rng:60,fld:60,arm:60};
    const run=(pos,role,pend,n)=>{ const o=[];
      for(let i=0;i<n;i++){ rng.seedInit('F'+pos+role+pend+i);
        const s=state.newState('投',1,pos,null);
        Object.assign(s,{stage:'PRO',lv:'MLB',org:'MLB',orgTeam:'X',role,
          pos,seasonFactor:1,age:27,effort:'普通投',dpos:'DH'});
        Object.assign(s.ab,AB); state.setS(s);
        const st=season.simSeason('MLB'); season.normalizePitchingStats(st,'MLB');
        if(pend)season.formPitch(st,'MLB',pend);
        const ip=st.IP, g=season.pitG(st);
        o.push({g,ip,ipg:g>0?ip/g:0,k9:ip>0?st.SO/ip*9:0,era:st.era,
          whip:season.baseballWHIP(st)||0}); }
      return {g:med(o.map(x=>x.g)),ip:+med(o.map(x=>x.ip)).toFixed(1),
        ipg:+med(o.map(x=>x.ipg)).toFixed(2),k9:+med(o.map(x=>x.k9)).toFixed(2),
        era:+med(o.map(x=>x.era)).toFixed(2),whip:+med(o.map(x=>x.whip)).toFixed(3),
        maxIpg:+Math.max(...o.map(x=>x.ipg)).toFixed(2)}; };

    const out={sp:{},rp:{},tw:{}};
    /* p 的實測分布：中位 1.0、p90 2.1、p99 3.0、最大 9.0。取到 9 才守得住極端。 */
    for(const pend of [0,1,3,9,-3]){
      out.sp[pend]=run('P','SP',pend,200);
      out.rp[pend]=run('P','MR',pend,200);
      out.tw[pend]=run('TW','SP',pend,200);
    }
    return out;
  });

  for(const [name,rows] of Object.entries(r)){
    const base=rows[0];
    for(const [pend,x] of Object.entries(rows)){
      const p=+pend;
      /* ① 每場局數是物理量，狀態不該碰它。 */
      if(name==='rp'){
        assert.ok(x.maxIpg<2.0,`${name} pend=${p} 後援每場局數爆掉：${x.maxIpg}`);
      }else{
        assert.ok(x.maxIpg<=6.6,`${name} pend=${p} 先發每場局數超過物理上限：${x.maxIpg}`);
        assert.ok(x.ipg>=4.7,`${name} pend=${p} 先發每場局數過低：${x.ipg}`);
        assert.ok(Math.abs(x.ipg-base.ipg)<0.15,
          `${name} pend=${p} 的每場局數被狀態改動了：${x.ipg} vs 基準 ${base.ipg}`);
      }
      /* ② K/9。這組能力在大聯盟低於聯盟平均，三振不該逼近聯盟三振王。 */
      assert.ok(x.k9<10.5,`${name} pend=${p} 的 K/9 過高：${x.k9}（能力低於聯盟平均）`);
      assert.ok(x.k9>5.5,`${name} pend=${p} 的 K/9 過低：${x.k9}`);
      /* ③ ERA 與 WHIP 同進同退。低於聯盟平均的投手不可能投出 2.00 以下。 */
      assert.ok(x.era>2.60,`${name} pend=${p} 的 ERA 低到不合理：${x.era}`);
      assert.ok(x.whip>1.15,`${name} pend=${p} 的 WHIP 低到不合理：${x.whip}`);
    }
    /* ④ 方向要對：火燙比平常好、低潮比平常差，而且火燙要多上場。 */
    assert.ok(rows[3].era<base.era,`${name} 火燙的 ERA 應該比平常好：${rows[3].era} vs ${base.era}`);
    assert.ok(rows[-3].era>base.era,`${name} 低潮的 ERA 應該比平常差：${rows[-3].era} vs ${base.era}`);
    assert.ok(rows[3].g>=base.g,`${name} 火燙應該被教練多用：${rows[3].g} vs ${base.g}`);
    assert.ok(rows[9].k9>rows[0].k9,`${name} 火燙的三振應該變多`);
  }

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,1));
}finally{ await browser.close(); }
