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
  await page.goto(`${url}?seed=farewell`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.6');
    const phases=await import('./src/flow/phases.js?v=2.1.6');
    const fw=await import('./src/flow/farewell.js?v=2.1.6');
    const dom=await import('./src/ui/dom.js?v=2.1.6');
    const season=await import('./src/engine/season.js?v=2.1.6');
    const teamName=function(){ return this.orgTeam; };
    const mk=(pos,org,lv,abl,role)=>{
      const s=state.newState('告別測試',9,pos,null);
      s.stage='PRO'; s.org=org; s.lv=lv; s.orgTeam=org==='CPBL'?'新北騎士':org==='NPB'?'東京巨人':'洛杉磯天使'; s.teamName=teamName;
      s.age=36; s.year=2046; s.rehab=0; s.role=role||null;
      Object.keys(s.ab).forEach(k=>s.ab[k]=abl);
      state.setS(s); document.getElementById('log').innerHTML=''; dom.divider('測試');
      return s;
    };
    const btns=()=>[...document.querySelectorAll('#act .btn')].map(b=>b.textContent);
    const click=t=>[...document.querySelectorAll('#act .btn')].find(b=>b.textContent.includes(t)).click();
    const log=()=>document.getElementById('log').textContent;
    const out={};
    /* 一軍能力（衰退後仍 ≥ 中職一軍門檻）：只給「宣布最後一季」，球季照跑 */
    let s=mk('IF','CPBL','CPBL1',70);
    phases.phasePre();
    out.top={btns:btns()};
    click('宣布最後一季');
    out.top.done=!!s.done; out.top.flag=s.farewellYr; out.top.card=log().includes('這是最後一年')&&log().includes('二軍上來的年輕人');
    /* 引退季出賽與打席五折、無條件進位：滿檔主力上限是 ceil(120/2)=60 場、ceil(510/2)=255 打席 */
    const g=[],pa=[],g0=[],pit=[],pit0=[];
    for(let i=0;i<40;i++){ const st=season.simSeason('CPBL1'); g.push(st.G); pa.push(st.PA); }
    s.farewellYr=null; for(let i=0;i<40;i++)g0.push(season.simSeason('CPBL1').G); s.farewellYr=2046;
    out.top.g=[Math.min(...g),Math.max(...g)]; out.top.pa=Math.max(...pa); out.top.g0=Math.min(...g0);
    out.top.paOk=g.every((x,i)=>pa[i]<=Math.ceil(Math.round(x*2*4.25)/2)&&pa[i]>=Math.ceil(Math.round((x*2-1)*4.25)/2));
    /* 季末：直接進引退結算，不走交易與去向 */
    document.getElementById('log').innerHTML='';
    s.stage='PRO'; phases.phaseEnd();
    out.top.endDone=!!s.done; out.top.endText=log().includes('結束引退巡禮');
    /* 二軍能力：一日球員約，三種角色 */
    for(const [pos,role,key] of [['IF',null,'bat'],['P','CL','pit'],['TW',null,'tw']]){
      s=mk(pos,'CPBL','CPBL2',36,role);
      phases.phasePre();
      const b=btns();
      click('一日球員約');
      out[key]={btns:b,done:!!s.done,line:s.farewellLine,text:log()};
    }
    /* 小聯盟二軍能力：一日大聯盟約，不寫進大聯盟生涯數據 */
    s=mk('OF','MiLB','A3',40); phases.phasePre(); click('一日球員約');
    out.milb={done:!!s.done,mlb:s.stats.MLB,text:log().includes('一日大聯盟球員約')};
    /* 模擬分布：投一局一定是 3 個出局或被換下；打席結果都在表裡 */
    let bad=0;
    for(let i=0;i<500;i++){ const o=fw.farewellInning(44); if(!(o.outs===3||o.bf===9))bad++; if(!fw.paLine(fw.farewellPA(44)))bad++; }
    out.bad=bad;
    return out;
  });

  assert.ok(result.top.btns.some(t=>t.includes('宣布最後一季')));
  assert.ok(!result.top.btns.some(t=>t.includes('一日球員約')));
  assert.equal(result.top.done,false,'引退季開打前不應結束生涯');
  assert.equal(result.top.flag,2046);
  assert.ok(result.top.card);
  assert.ok(result.top.g[1]<=60&&result.top.g[0]>=50,`引退季出賽應約半季：${result.top.g}`);
  assert.ok(result.top.pa<=255,`引退季打席應打五折：${result.top.pa}`);
  assert.ok(result.top.paOk,'打席＝原打席 ÷ 2 無條件進位');
  assert.ok(result.top.g0>100,'非引退季出賽不受影響');
  assert.equal(result.top.endDone,true,'引退季季末應直接結算');
  assert.ok(result.top.endText);
  for(const k of ['bat','pit','tw']){
    const r=result[k];
    assert.ok(r.btns.some(t=>t.includes('一日球員約')),k);
    assert.ok(!r.btns.some(t=>t.includes('宣布最後一季')),k);
    assert.equal(r.done,true,k);
    assert.ok(r.text.includes('一日中職一軍球員約'),k);
    assert.ok(r.text.includes('告別戰'),k);
  }
  assert.match(result.bat.line,/打數|保送/);
  assert.match(result.pit.line,/^\d\.\d 局/);
  assert.ok(result.pit.text.includes('最後一局'));
  assert.ok(result.bat.text.includes('最後一個打席'));
  assert.ok(result.tw.text.includes('最後一場'));
  assert.match(result.tw.line,/^投球 .*；打擊 /);
  assert.equal(result.milb.done,true);
  assert.ok(result.milb.text);
  assert.equal(result.milb.mlb,null,'一日約不應產生大聯盟生涯數據');
  assert.equal(result.bad,0);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({bat:result.bat.line,pit:result.pit.line,tw:result.tw.line},null,2));
}finally{
  await browser.close();
}
