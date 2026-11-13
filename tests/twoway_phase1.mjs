/* 二刀流 第 1 階段：角色建得出來、資料形狀正確、成本曲線重構沒有動到單刀球員。
   規格見 docs/twoway-design.md。第 2 階段(simSeason 雙成績線)之後要回頭補這支測試。 */
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
  await page.goto(`${url}?seed=twoway-phase1`,{waitUntil:'domcontentloaded'});

  /* ── ① 模組層：資料形狀、成本曲線、ovr、事件卡資格 ── */
  const unit=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const ability=await import('./src/engine/ability.js?v=2.1.0');
    const events=await import('./src/flow/events.js?v=2.1.0');
    const {POS_AB,POSN}=await import('./src/data/abilities.js?v=2.1.0');

    /* 成本曲線由「依守位」改成「依能力鍵」，對投手與野手必須是恆等變換。 */
    const oldCost=(pos,k,cur,pk)=>{ const isP=pos==='P';
      let c=(isP&&k!=='sta')?(cur>=66?7:cur>=58?4:cur>=50?2:1):(cur>=72?3:cur>=64?2:1);
      if(cur>=pk)c*=isP?4:3; return c; };
    let costMismatch=0;
    for(const pos of ['P','IF','C','OF']){
      const s=state.newState('x',1,pos,null); state.setS(s);
      for(const k of POS_AB[pos])for(let cur=1;cur<=80;cur++)for(const pk of [40,62,80]){
        s.ab[k]=cur; s.pot[k]=pk;
        if(ability.abCost(k)!==oldCost(pos,k,cur,pk))costMismatch++;
      }
    }

    /* 初始擲值：兩側各保證一支好工具，否則角色一出生就死在層級門檻上。 */
    let weakSide=0, potSum=0;
    for(let i=0;i<3000;i++){
      const s=state.newState('x',1,'TW',null);
      potSum+=s.potSum0;
      if(Math.max(s.pot.vel,s.pot.ctl,s.pot.brk)<70)weakSide++;
      if(Math.max(s.pot.con,s.pot.pow,s.pot.spd,s.pot.eye)<72)weakSide++;
    }

    const s=state.newState('二刀','1','TW',null); state.setS(s);
    const shape={keys:Object.keys(s.ab).sort().join(','),dpos:s.dpos,twOrigin:s.twOrigin,posn:POSN.TW};

    /* TW 在 60 點時：球威三項走投手的陡曲線(4)、其餘走野手曲線(1)。 */
    POS_AB.TW.forEach(k=>{s.ab[k]=60;s.pot[k]=80;});
    const twCost={};POS_AB.TW.forEach(k=>twCost[k]=ability.abCost(k));

    /* ovr：兩側取高再按弱側回饋，最多 +8；弱側崩掉時收斂回 max()。 */
    const setAb=o=>Object.assign(s.ab,o);
    setAb({sta:55,vel:55,ctl:55,brk:55,con:55,pow:55,spd:55,eye:55});
    const balanced={ovr:ability.ovr(),p:ability.ovrPit(),b:ability.ovrBat()};
    setAb({sta:20,vel:20,ctl:20,brk:20});          /* 投球側整組崩掉 */
    const collapsed={ovr:ability.ovr(),p:ability.ovrPit(),b:ability.ovrBat()};

    /* 事件卡：TW 吃得到投手卡與打者卡，拿不到捕手卡。 */
    const tw={pos:'TW',age:18,stage:'HS',org:null,lv:null};
    const mk=role=>({role,scope:'*',times:['ALL'],category:'training'});
    const elig={P:events.eventEligible(mk('P'),tw),B:events.eventEligible(mk('B'),tw),
                F:events.eventEligible(mk('F'),tw),C:events.eventEligible(mk('C'),tw),
                TW:events.eventEligible(mk('TW'),tw),
                TWforPitcher:events.eventEligible(mk('TW'),{...tw,pos:'P'})};

    return {costMismatch,weakSide,potMean:potSum/3000,shape,twCost,balanced,collapsed,elig};
  });

  assert.equal(unit.costMismatch,0,'成本曲線重構不是恆等變換，動到了單刀球員');
  assert.equal(unit.weakSide,0,'有二刀流角色的某一側沒有頂級工具');
  assert.ok(Math.abs(unit.potMean-516)<3,'TW 初始潛力總和的平均偏離預期：'+unit.potMean);
  assert.equal(unit.shape.keys,'brk,con,ctl,eye,pow,spd,sta,vel');
  assert.equal(unit.shape.dpos,'DH');
  assert.equal(unit.shape.twOrigin,'tap');
  assert.equal(unit.shape.posn,'二刀流');
  assert.deepEqual(unit.twCost,{sta:1,vel:4,ctl:4,brk:4,con:1,pow:1,spd:1,eye:1});
  /* 平衡時 ovr 要高於任一單側；弱側崩掉後獎勵歸零，等於較強那側。 */
  assert.ok(unit.balanced.ovr>Math.max(unit.balanced.p,unit.balanced.b));
  assert.ok(unit.balanced.ovr-Math.max(unit.balanced.p,unit.balanced.b)<=8);
  assert.equal(unit.collapsed.ovr,Math.round(Math.max(unit.collapsed.p,unit.collapsed.b)));
  assert.deepEqual(unit.elig,{P:true,B:true,F:true,C:false,TW:true,TWforPitcher:false});

  /* ── ② 實機：七下入口 → 高中三年保送 TW_SIX_GUARANTEED 顆 6 ── */
  const page2=await browser.newPage();
  page2.on('pageerror',error=>errors.push(error.message));
  await page2.goto(`${url}?seed=twoway-walk`,{waitUntil:'domcontentloaded'});
  /* v2.0.5 起二刀流就是守位列的第五顆按鈕，跟其他四個互斥。
     七下捷徑保留，它現在等於「幫你按下第五顆」。 */
  const before=await page2.evaluate(()=>({
    labels:[...document.querySelectorAll('#seg-pos button')].map(e=>e.textContent.trim()),
    rows:new Set([...document.querySelectorAll('#seg-pos button')]
      .map(e=>Math.round(e.getBoundingClientRect().top))).size,
    wrapped:[...document.querySelectorAll('#seg-pos button')].some(e=>e.scrollWidth>e.clientWidth+1),
    hintHidden:document.getElementById('tw-hint').hidden,
    on:[...document.querySelectorAll('#seg-pos button')].filter(e=>e.classList.contains('on')).map(e=>e.dataset.v),
  }));
  assert.deepEqual(before.labels,['投手','捕手','內野手','外野手','二刀流'],'守位列應該有五顆，最後一顆是二刀流');
  assert.equal(before.rows,1,'五顆守位鈕應該排成一列，不該換行');
  assert.equal(before.wrapped,false,'守位鈕的文字不該被擠到換行');
  assert.equal(before.hintHidden,true,'沒選二刀流時不該顯示說明');
  assert.deepEqual(before.on,['P'],'預設應該選中投手');

  for(let i=0;i<7;i++){ await page2.click('#logo-tap'); }
  const entry=await page2.evaluate(()=>({
    on:[...document.querySelectorAll('#seg-pos button')].filter(e=>e.classList.contains('on')).map(e=>e.dataset.v),
    hintHidden:document.getElementById('tw-hint').hidden,
  }));
  assert.deepEqual(entry.on,['TW'],'七下之後應該選中二刀流那一顆');
  assert.equal(entry.hintHidden,false,'選中二刀流之後應該出現說明');
  await page2.click('#btn-start');

  const walk=await page2.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const {TW_SIX_GUARANTEED}=await import('./src/flow/phases.js?v=2.1.0');
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const vis=x=>x&&x.offsetParent!==null&&!x.disabled;
    const S=state.S, years=[]; let seen=null, dice=[];
    for(let k=0;k<2000;k++){
      if(S.year!==seen){ seen=S.year;
        years.push({year:S.year,stage:S.stage,six:S.six,genius:S.traits.genius}); }
      if(S.stage!=='HS')break;
      const cue=document.querySelector('#act button');
      if(cue&&/顆骰/.test(cue.innerText))dice.push(+cue.innerText.match(/(\d+) 顆骰/)[1]);
      const done=[...document.querySelectorAll('#al-btm .btn')].filter(vis).filter(x=>!/復原/.test(x.textContent));
      const rows=[...document.querySelectorAll('#al-rows .abrow')].filter(x=>x.onclick);
      if(done.length){ done[done.length-1].click(); await sleep(0); continue; }
      if(rows.length){ rows[0].click(); await sleep(0); continue; }
      const btns=[...document.querySelectorAll('#act button,#act .btn')].filter(vis);
      if(!btns.length){ await sleep(20); continue; }
      btns[0].click(); await sleep(0);
    }
    return {years,dice,pos:S.pos,six:S.six,genius:S.traits.genius,guaranteed:TW_SIX_GUARANTEED};
  });

  assert.equal(walk.pos,'TW');
  assert.ok(walk.dice.length>=3,'沒有抓到高中三年的擲骰');
  assert.ok(walk.dice.every(n=>n>=5),'二刀流的訓練骰顆數保底 5 沒有生效：'+walk.dice.join(','));
  /* 七下只保送 TW_SIX_GUARANTEED 顆，剩下的要玩家自己擲——所以這裡不能斷言天才一定解鎖，
     只能斷言配額真的發了。全保送會讓這條路線比母體甜太多（實測 18.1% 對 8.3%），
     見 docs/twoway-design.md §6。 */
  assert.ok(walk.guaranteed>=1&&walk.guaranteed<=5,'TW_SIX_GUARANTEED 超出合理範圍：'+walk.guaranteed);
  assert.ok(walk.six>=walk.guaranteed,
    `高中三年沒有發滿配額：拿到 ${walk.six} 顆，應至少 ${walk.guaranteed} 顆`);
  if(walk.six>=5)assert.equal(walk.genius,true,'湊滿五顆 6 卻沒有解鎖天才');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({unit,walk},null,2));
}finally{ await browser.close(); }
