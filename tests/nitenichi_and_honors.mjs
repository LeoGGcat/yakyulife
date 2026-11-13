/* 三件事的回歸測試：

   ① 二天一流：同一年同時拿下投手三冠王與打擊三冠王的隱藏屬性。
      名字取自宮本武藏自創的流派——「二刀流」這個詞就是從二天一流來的。
      只有二刀流碰得到：單刀球員不可能同時滿足規定投球局數與規定打席。

   ② 逐年成績的欄位：打者那排原本沒有盜壘，腳程練起來的球員完全看不出來，
      而 SB 明明就在 st 裡、結算的生涯年表也一直都有。補成七欄，
      投手側同步補 WHIP，切投打的時候整排數字才不會跳。

   ③ 獎項分成 通用／投手／打擊 三段。原本全部擠在同一張清單，
      二刀流的清單會變成一團——他兩邊的獎都有。 */
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
  await page.goto(`${url}?seed=nitenichi`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const aw=await import('./src/engine/awards.js?v=2.1.0');
    const cr=await import('./src/engine/career.js?v=2.1.0');
    const tr=await import('./src/ui/traits.js?v=2.1.0');
    const dom=await import('./src/ui/dom.js?v=2.1.0');

    /* ── ① 六個王一次拿滿 ── */
    const monster=()=>{
      const s=state.newState('六冠',0,'TW',null); state.setS(s);
      const S=state.S;
      Object.assign(S,{stage:'PRO',lv:'CPBL1',org:'CPBL',orgTeam:'台中猛獁',pos:'TW',
        role:'SP',dpos:'DH',age:28,year:2030,seasonFactor:1});
      S.stats.CPBL={yr:6,AS:0};
      Object.assign(S.ab,{sta:80,vel:80,ctl:80,brk:80,con:80,pow:80,spd:70,eye:80,rng:60,fld:60,arm:60});
      /* 遠超過中職所有獎項的「保送」門檻，六個王都會必得 */
      aw.awards('CPBL',{G:120,PA:520,AB:460,H:207,HR:60,RBI:165,SB:12,BB:60,W:22,L:2,
        SV:0,HLD:0,IP:190,SO:260,ER:21,avg:.450,era:1.00,WHIP:0.80,GP:28,pH:120,pBB:25,pHR:6,d:30});
      return S;
    };
    const S1=monster();
    const six={honors:S1.honors.slice(),trait:!!S1.traits.nitenichi,
      leagues:(S1.nitenichiLeagues||[]).slice(),names:tr.traitNames('nitenichi')};

    /* 投手三冠但打擊平庸 → 不該解鎖 */
    const s2=state.newState('只投',0,'TW',null); state.setS(s2);
    const S2=state.S;
    Object.assign(S2,{stage:'PRO',lv:'CPBL1',org:'CPBL',orgTeam:'台中猛獁',pos:'TW',
      role:'SP',dpos:'DH',age:28,year:2030,seasonFactor:1});
    S2.stats.CPBL={yr:6,AS:0};
    Object.assign(S2.ab,{sta:80,vel:80,ctl:80,brk:80,con:40,pow:40,spd:50,eye:45,rng:60,fld:60,arm:60});
    aw.awards('CPBL',{G:120,PA:520,AB:460,H:110,HR:6,RBI:40,SB:2,BB:30,W:22,L:2,
      SV:0,HLD:0,IP:190,SO:260,ER:21,avg:.239,era:1.00,WHIP:0.80,GP:28,pH:120,pBB:25,pHR:6,d:12});
    const pitOnly={honors:S2.honors.slice(),trait:!!S2.traits.nitenichi,
      card:(()=>{const c=[...document.querySelectorAll('.card')].filter(x=>/年度獎項/.test(x.textContent)).pop();
        return c?c.innerHTML:'';})()};

    /* ── ①b 年度最佳投手＋年度最佳打者 → 保底 MVP ──
       勝投王＋三振王會保底最佳投手、全壘打王＋打點王會保底最佳打者，
       但防禦率與打擊率都不到王，所以兩邊都不是三冠王——這一季只靠新規則拿 MVP。 */
    const s2b=state.newState('雙料最佳',0,'TW',null); state.setS(s2b);
    const S2b=state.S;
    Object.assign(S2b,{stage:'PRO',lv:'MLB',org:'MLB',orgTeam:'翡翠水兵',pos:'TW',
      role:'SP',dpos:'DH',age:28,year:2035,seasonFactor:1});
    S2b.stats.MLB={yr:6,AS:0};
    Object.assign(S2b.ab,{sta:80,vel:80,ctl:80,brk:80,con:80,pow:80,spd:70,eye:80,rng:60,fld:60,arm:60});
    aw.awards('MLB',{G:162,PA:600,AB:540,H:160,HR:52,RBI:150,SB:5,BB:55,W:21,L:5,SV:0,HLD:0,
      IP:200,SO:250,ER:80,avg:.296,era:3.60,WHIP:1.05,GP:32,pH:170,pBB:45,pHR:20,d:22});
    const bothBest={honors:S2b.honors.filter(x=>x.startsWith('2035')).map(x=>x.slice(5)),
      card:(()=>{const c=[...document.querySelectorAll('.card')].filter(x=>/年度獎項/.test(x.textContent)).pop();
        return c?c.innerHTML:'';})()};

    /* ── ③ 分段 ── */
    const s3=state.newState('分段',0,'TW',null); state.setS(s3);
    state.S.honors=['2030 中職二天一流','2030 中職年度MVP','2030 中職投手三冠王',
      '2030 中職打擊三冠王','2030 中職勝投王','2030 中職防禦率王','2030 中職三振王',
      '2031 中職救援王','2031 中職中繼王','2030 中職打擊王','2030 中職全壘打王',
      '2030 中職打點王','2031 中職上壘王','2031 中職盜壘王','2031 中職外野手金手套',
      '2031 中職守備聖經','2030 中職年度最佳投手','2031 中職年度最佳打者',
      '2029 中職總冠軍','2028 中職明星賽','2033 經典賽冠軍','2027 黑豹旗冠軍'];
    const sections=cr.honorSections().map(x=>({name:x.name,items:x.groups.map(g=>g.awd)}));

    /* 純投手只會有兩段（通用＋投手），清單維持原來的乾淨 */
    const s4=state.newState('純投',0,'P',null); state.setS(s4);
    state.S.honors=['2030 中職勝投王','2030 中職年度最佳投手','2029 中職總冠軍'];
    const pitcherSections=cr.honorSections().map(x=>x.name);
    /* 什麼都沒拿過 */
    state.S.honors=[];
    const emptySections=cr.honorSections().length;

    /* ── ② 逐年欄位 ── */
    const s5=state.newState('欄位',0,'TW',null); state.setS(s5);
    Object.assign(state.S,{stage:'PRO',lv:'CPBL1',org:'CPBL',orgTeam:'台中猛獁',pos:'TW',age:30});
    state.S.honors=['2030 中職年度MVP','2030 中職勝投王','2030 中職全壘打王'];
    state.S.log=[{y:2030,age:30,tm:'台中猛獁',line:'測試',
      st:{G:118,PA:498,AB:445,H:142,HR:28,RBI:95,SB:17,BB:48,W:12,L:6,SV:0,HLD:0,
        IP:152,SO:168,ER:48,avg:.319,era:2.84,WHIP:1.02,GP:24,pH:120,pBB:38,pHR:11}}];
    dom.board(0);
    document.getElementById('board').classList.add('detail-open');
    dom.detailSync();
    const read=()=>({
      hd:[...document.querySelectorAll('#bd-detail .bd-yr.hd .n')].map(n=>n.textContent),
      row:[...document.querySelectorAll('#bd-detail .bd-yr:not(.hd) .n')].map(n=>n.textContent),
    });
    const pitCols=read();
    const btn=document.querySelector('#bd-detail .ys[data-ys="bat"]'); if(btn)btn.click();
    const batCols=read();
    const groupLabels=[...document.querySelectorAll('#bd-detail .bd-hg')].map(n=>n.textContent);

    return {six,pitOnly,bothBest,sections,pitcherSections,emptySections,pitCols,batCols,groupLabels};
  });

  /* ── ① 二天一流 ── */
  assert(r.six.honors.includes('2030 中職投手三冠王'),'六冠球季沒有拿到投手三冠王');
  assert(r.six.honors.includes('2030 中職打擊三冠王'),'六冠球季沒有拿到打擊三冠王');
  assert(r.six.honors.includes('2030 中職二天一流'),'投打雙三冠沒有觸發二天一流');
  assert.equal(r.six.trait,true,'二天一流屬性沒有解鎖');
  assert.deepEqual(r.six.leagues,['中職'],'二天一流沒有記錄聯盟');
  assert.deepEqual(r.six.names,['中職二天一流'],'二天一流的顯示名稱不對');
  assert(r.pitOnly.honors.includes('2030 中職投手三冠王'),'對照組應該拿到投手三冠王');
  assert(!r.pitOnly.honors.includes('2030 中職打擊三冠王'),'對照組不該拿到打擊三冠王');
  assert.equal(r.pitOnly.trait,false,'只有一邊三冠就不該解鎖二天一流');

  /* ── ①b 雙料年度最佳 → 保底 MVP ── */
  const BB=r.bothBest;
  assert(BB.honors.includes('大聯盟年度最佳投手'),'對照季應該拿到年度最佳投手：'+BB.honors);
  assert(BB.honors.includes('大聯盟年度最佳打者'),'對照季應該拿到年度最佳打者：'+BB.honors);
  assert(!BB.honors.includes('大聯盟投手三冠王'),'這一季不該是投手三冠王（防禦率沒到王）');
  assert(!BB.honors.includes('大聯盟打擊三冠王'),'這一季不該是打擊三冠王（打擊率沒到王）');
  assert(BB.honors.includes('大聯盟年度MVP'),'投打雙料年度最佳沒有保底 MVP：'+BB.honors);
  /* 只拿到一邊最佳的對照組不該被這條保底波及（它可能仍靠機率拿到，所以只驗不是保底來的） */
  assert(!(r.pitOnly.honors.some(x=>/年度最佳打者/.test(x))),'對照組不該拿到年度最佳打者');

  /* ── ①c 季末的年度獎項卡也要分段 ── */
  assert(/通用獎項/.test(BB.card)&&/投手獎項/.test(BB.card)&&/打擊獎項/.test(BB.card),
    '年度獎項卡沒有分成三段：'+BB.card);
  assert(/通用獎項/.test(r.pitOnly.card)&&/投手獎項/.test(r.pitOnly.card),
    '單刀投手的年度獎項卡應該有通用與投手兩段：'+r.pitOnly.card);
  assert(!/打擊獎項/.test(r.pitOnly.card),'單刀投手的年度獎項卡不該出現空的打擊段');

  /* ── ③ 獎項分段 ── */
  assert.deepEqual(r.sections.map(s=>s.name),['通用獎項','投手獎項','打擊獎項'],'分段名稱或順序不對');
  const [all,pit,bat]=r.sections;
  assert(all.items.includes('中職二天一流'),'二天一流是投打一起拿的，應該放通用');
  assert(all.items.includes('中職年度MVP'));
  assert(all.items.includes('中職總冠軍'));
  assert(all.items.includes('經典賽冠軍'));
  for(const a of ['中職投手三冠王','中職勝投王','中職防禦率王','中職三振王','中職救援王','中職中繼王','中職年度最佳投手'])
    assert(pit.items.includes(a),`${a} 應該在投手獎項`);
  for(const a of ['中職打擊三冠王','中職打擊王','中職全壘打王','中職打點王','中職上壘王','中職盜壘王','中職外野手金手套','中職守備聖經','中職年度最佳打者'])
    assert(bat.items.includes(a),`${a} 應該在打擊獎項`);
  /* 一個獎只能出現在一段裡 */
  const seen=new Set();
  for(const s of r.sections)for(const a of s.items){ assert(!seen.has(a),a+' 重複出現在兩段'); seen.add(a); }
  assert.deepEqual(r.pitcherSections,['通用獎項','投手獎項'],'純投手不該出現空的打擊段');
  assert.equal(r.emptySections,0,'沒拿過獎就不該有任何分段');
  assert.deepEqual(r.groupLabels,['通用獎項','投手獎項','打擊獎項'],'成就面板沒有印出分段小標');

  /* ── ② 逐年欄位 ── */
  assert.deepEqual(r.pitCols.hd,['G','IP','W-L','SV','SO','ERA','WHIP'],'投球側欄位不對');
  assert.deepEqual(r.batCols.hd,['G','PA','AVG','HR','RBI','OPS','SB'],'打擊側欄位不對');
  assert.equal(r.batCols.hd.length,r.pitCols.hd.length,'投打兩側欄數不一樣，切換時整排會跳');
  assert.equal(r.batCols.row[6],'17','盜壘沒有印出來');
  assert.equal(r.pitCols.row[0],'24','投球側的出賽數應該讀 GP 而不是打擊出賽');
  assert.equal(r.batCols.row[0],'118','打擊側的出賽數應該讀 G');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,1));
}finally{ await browser.close(); }
