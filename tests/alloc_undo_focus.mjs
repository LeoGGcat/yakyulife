/* 季初配點的「復原」必須連專注度一起回滾。

   玩家回報：「大巧不工觸發好像只檢查最初骰子點在哪個屬性？配錯再用復原修正沒辦法觸發。」

   根因在 ui/alloc.js。按能力列時做兩件事：
       addAb(k,amt);  touchedKeys[k] += amt;
   但「↩ 復原」只退 S.ab／S.carry／骰子索引，**沒有退 touchedKeys**。
   於是「點錯一顆 → 復原 → 改點正確的那一項」會被記成「兩項各點過」，
   而 allocDone() 判定專注度用的是 touched[最大項]/總和 >= 0.75——
   分母被灌水之後就過不了，S.samePick 當場歸零，連續三年的計數被一次手滑無聲砍斷。

   同一個洞也讓「大器晚成」的 gain（單季加點總幅度 >= 16）被灌水，一併守住。

   守住四件事：
     ① 點錯 → 復原 → 改點，專注度要以「最後真正留下的配點」判定
     ② 一路點同一項（沒有復原）照常觸發，沒有被這次改動弄壞
     ③ 復原之後再確認，S.ab 與 touched 必須對得起來（不能只修一半）
     ④ 大器晚成的 gain 不吃被復原掉的點數 */
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
  await page.goto(`${url}?seed=alloc-undo`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const alloc=await import('./src/ui/alloc.js?v=2.1.0');

    /* 一次配點：clicks 是要按的能力鍵，undo 標示那一次按完要按復原。 */
    const run=(dice,clicks)=>{
      const s=state.newState('測',1,'IF',null);
      Object.assign(s,{stage:'PRO',lv:'CPBL1',org:'CPBL',orgTeam:'X',dpos:'2B',age:24});
      /* 能力壓低一點，確保每一顆骰都吃得進去（不會卡 80 上限），
         也讓成本曲線不會把點數吃成「蓄力中」。 */
      Object.keys(s.ab).forEach(k=>{ s.ab[k]=40; s.pot[k]=78; });
      s.teamName=function(){return 'X';};
      state.setS(s);

      alloc.allocUI({dice:dice.slice()},'分配訓練成果',()=>{});
      const rowOf=k=>{
        const rows=[...document.querySelectorAll('#al-rows .abrow')];
        const names=['體力','Contact','力量','速度','選球','守備範圍','接球','臂力'];
        const label={sta:'體力',con:'Contact',pow:'力量',spd:'速度',eye:'選球',
          rng:'守備範圍',fld:'接球',arm:'臂力'}[k];
        return rows.find(el=>el.querySelector('.nm').textContent===label);
      };
      const undoBtn=()=>[...document.querySelectorAll('#al-btm button')]
        .find(b=>b.textContent.includes('復原'));
      const okBtn=()=>[...document.querySelectorAll('#al-btm button')]
        .find(b=>b.textContent.includes('確認')||b.textContent.includes('捨棄'));

      for(const c of clicks){
        const el=rowOf(c.k);
        if(!el||!el.onclick)return {err:`點不到 ${c.k}（可能已經沒有骰子或已達上限）`};
        el.onclick();
        if(c.undo){ const u=undoBtn(); if(!u||u.disabled)return {err:'復原鈕按不下去'}; u.onclick(); }
      }
      const ok=okBtn(); if(!ok)return {err:'找不到確認鈕——骰子沒分配完'};
      ok.onclick();
      return {samePickKey:s.samePickKey,samePick:s.samePick,combo:!!s.traits.combo,
        late:!!s.traits.late,ab:{con:s.ab.con,pow:s.ab.pow,spd:s.ab.spd}};
    };

    /* ① 兩顆骰，點錯一次就改掉：舊版 touched={pow:5,con:5}→ 5/10=0.5 過不了 0.75 */
    const slip1=run([5,5],[{k:'pow',undo:true},{k:'con'},{k:'con'}]);
    /* ① 三顆骰，點錯兩次：舊版 10/(10+3+3)=0.63 */
    const slip2=run([5,5,3,3],[{k:'pow',undo:true},{k:'spd',undo:true},
      {k:'con'},{k:'con'},{k:'con'},{k:'con'}]);
    /* ② 對照組：完全沒按復原，一路點同一項 */
    const clean=run([5,5],[{k:'con'},{k:'con'}]);
    /* ② 對照組：本來就該判定失敗（真的分散配點），不可以因為這次改動變成通過 */
    const spread=run([5,5],[{k:'con'},{k:'pow'}]);

    /* ④ 大器晚成：25 歲後單季加點總幅度 >=16 才解鎖。
       真正留下的是 8+4=12 點（不該解鎖），但舊版把復原掉的 8 點也算進去 → 20 點，
       於是誤觸發。這一條單獨驗 gain，跟專注度那三條是同一個洞的另一半。 */
    const lateCase=(()=>{
      const s=state.newState('測',1,'IF',null);
      Object.assign(s,{stage:'PRO',lv:'CPBL1',org:'CPBL',orgTeam:'X',dpos:'2B',age:27});
      Object.keys(s.ab).forEach(k=>{ s.ab[k]=30; s.pot[k]=40; });
      s.teamName=function(){return 'X';};
      state.setS(s);
      alloc.allocUI({dice:[8,4]},'分配訓練成果',()=>{});
      const rows=()=>[...document.querySelectorAll('#al-rows .abrow')];
      const byName=n=>rows().find(el=>el.querySelector('.nm').textContent===n);
      byName('力量').onclick();                       /* 點錯：8 點 */
      [...document.querySelectorAll('#al-btm button')].find(b=>b.textContent.includes('復原')).onclick();
      byName('Contact').onclick();                    /* 改點：8 點 */
      byName('Contact').onclick();                    /* 再點：4 點 → 真正留下 12 點 */
      const ok=[...document.querySelectorAll('#al-btm button')]
        .find(b=>b.textContent.includes('確認')||b.textContent.includes('捨棄'));
      if(ok)ok.onclick();
      return {late:!!s.traits.late};
    })();

    return {slip1,slip2,clean,spread,lateCase};
  });

  for(const [k,v] of Object.entries(r))
    assert.ok(!v.err,`${k} 測資本身沒跑起來：${v.err}`);

  /* ① 這就是玩家回報的那一格 */
  assert.equal(r.slip1.samePickKey,'con',
    `點錯一顆、復原之後改點 Contact，專注度卻不是 Contact——復原沒有回滾 touchedKeys（回報的 bug）。實際：${r.slip1.samePickKey}`);
  assert.equal(r.slip1.samePick,1,`專注度計數應該要從 1 開始累積，實際 ${r.slip1.samePick}`);
  assert.equal(r.slip2.samePickKey,'con',
    `連點錯兩次再改回來，專注度仍然應該是 Contact。實際：${r.slip2.samePickKey}`);

  /* ② 沒有按復原的正常路徑不能被弄壞 */
  assert.equal(r.clean.samePickKey,'con','一路點同一項卻沒有被判為專注');
  assert.equal(r.clean.samePick,1);
  /* 真的分散配點就該判定失敗——地板不能因為這次改動被挖掉 */
  assert.equal(r.spread.samePickKey,null,
    `平均分給兩項不該算專注（會讓大巧不工變成人人有獎）。實際：${r.spread.samePickKey}`);
  assert.equal(r.spread.samePick,0);

  /* ③ 能力值要跟最後留下的配點一致：復原掉的那一顆不可以留在身上 */
  assert.equal(r.slip1.ab.pow,40,`被復原掉的點數還留在能力上：力量 ${r.slip1.ab.pow}`);
  assert.ok(r.slip1.ab.con>40,`最後點的那一項沒有加上去：Contact ${r.slip1.ab.con}`);

  /* ④ 大器晚成不吃被復原掉的點數 */
  assert.equal(r.lateCase.late,false,
    '復原掉的點數被算進大器晚成的加點總幅度：真正留下 12 點卻被當成 20 點');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,1));
}finally{ await browser.close(); }
