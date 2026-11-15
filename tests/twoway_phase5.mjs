/* 二刀流 第 5 階段：結算版面。
   一段二刀流生涯在四張表(逐年板、生涯累積、逐年結算、合約薪資)與結算圖上，
   投打兩側都必須看得到；而且判斷依據要跟計分一致——看「打出來的東西」，
   不是退休當下的 S.pos（89.5% 的人退休前已經被強制轉回單刀）。

   同時守住第 2 階段留下的一個回歸：投球側的欄位分家沒做乾淨的話，
   純投手的 st.G 會變成 0（見 §「單刀投手的 G」的斷言）。 */
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--disable-gpu'],
});

try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=twoway-phase5`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const season=await import('./src/engine/season.js?v=2.1.0');
    const career=await import('./src/engine/career.js?v=2.1.0');
    const retire=await import('./src/ui/retire.js?v=2.1.0');
    const share=await import('./src/ui/share-image.js?v=2.1.0');

    /* ── ① 單刀投手的 G ──
       第 2 階段把投球區塊整段改成寫 st.GP，而 normalizePitchingStats 是靠
       Number.isFinite(st.GP) 判斷「這是不是二刀流」，結果每個純投手都被判成
       二刀流：st.G 從此永遠是 0，逐年表、後援出賽上限、鐵人判定全部讀到 0。 */
    const p=state.newState('純投',1,'P',null);
    Object.assign(p,{stage:'PRO',lv:'CPBL1',role:'SP',seasonFactor:1,age:25});
    Object.assign(p.ab,{sta:55,vel:60,ctl:58,brk:56});
    state.setS(p);
    const ps=season.simSeason('CPBL1'); season.normalizePitchingStats(ps,'CPBL1');
    const soloP={G:ps.G,hasGP:'GP' in ps,hasPH:'pH' in ps,
      whip:ps.WHIP,recomputed:+(season.baseballWHIP(ps)||0).toFixed(2)};

    /* ── ② 二刀流：兩側的欄位真的分家 ── */
    const t=state.newState('二刀',1,'TW',null);
    Object.assign(t,{stage:'PRO',lv:'CPBL1',role:'SP',dpos:'DH',seasonFactor:1,age:25,effort:'普通投'});
    Object.assign(t.ab,{sta:60,vel:62,ctl:58,brk:58,con:62,pow:60,spd:52,eye:56});
    state.setS(t);
    const ts=season.simSeason('CPBL1'); season.normalizePitchingStats(ts,'CPBL1');
    const twSeason={GP:ts.GP,G:ts.G,pH:ts.pH,pBB:ts.pBB,H:ts.H,BB:ts.BB,IP:ts.IP,PA:ts.PA,
      whip:+(season.baseballWHIP(ts)||0).toFixed(2),
      whipFromBatting:+(((ts.H+ts.BB)/ts.IP)).toFixed(2)};

    /* ── ③ 版面：已被強制轉回外野手，但十九年的二刀流履歷還在 ── */
    const twStat=()=>({yr:19,GP:360,G:2100,PA:8800,AB:7700,H:2200,HR:330,RBI:1200,SB:80,BB:900,
      pH:1900,pBB:620,W:150,L:90,SV:0,HLD:0,IP:2100,SO:2000,ER:760,AS:8,DEF:0,DPG:{DH:2100}});
    const yr=(y,two)=>({y,age:20+(y-2040),tm:'新北騎士一軍',lv:'CPBL1',p:'DH',role:'SP',
      salary:5000+(y-2040)*100,inj:false,
      st:two?{GP:22,G:120,PA:500,AB:440,H:130,HR:28,RBI:90,SB:4,BB:55,pH:110,pBB:40,
              W:12,L:6,SV:0,HLD:0,IP:140,SO:150,ER:45,avg:130/440,DEF:0,_dh:true}
            /* 被強制轉回之後的單刀打者球季：投球側整排要印 '-'，不是 0 */
            :{G:130,PA:560,AB:500,H:150,HR:30,RBI:100,SB:5,BB:55,W:0,L:0,SV:0,HLD:0,
              IP:0,SO:0,ER:0,avg:150/500,DEF:0,_dh:true}});
    const s=state.newState('大谷',1,'OF',null);
    Object.assign(s,{stage:'PRO',year:2059,age:39,org:'CPBL',lv:'CPBL1',orgTeam:'新北騎士',
      dpos:'DH',role:null,twSeasons:19,salary:120000,seasonFactor:1,
      stats:{CPBL:twStat(),NPB:null,MLB:null,MINOR:null},
      honors:['2050 中職年度最佳投手','2050 中職年度最佳打者'],
      intlCount:2,
      intlStat:{G:18,GP:3,PA:76,AB:66,H:22,HR:5,RBI:16,SB:1,BB:10,pH:20,pBB:8,
        W:2,L:0,SV:0,HLD:0,IP:24,SO:30,ER:8},
      intlLog:[{year:2047,name:'世界棒球經典賽',rank:'冠軍',
        st:{G:9,GP:2,PA:38,AB:33,H:11,HR:3,RBI:9,SB:0,BB:5,pH:10,pBB:4,W:1,L:0,SV:0,IP:12,SO:15,ER:4}},
        {year:2051,name:'世界12強賽',rank:'亞軍',
        st:{G:9,GP:1,PA:38,AB:33,H:11,HR:2,RBI:7,SB:1,BB:5,pH:10,pBB:4,W:1,L:0,SV:0,IP:12,SO:15,ER:4}}]});
    s.log=[yr(2040,true),yr(2041,true),yr(2057,false)];
    s.teamName=function(){return this.orgTeam||'';};
    state.setS(s);

    const view={twoWayView:career.twoWayView(),pos:s.pos};
    const logs=s.log.filter(x=>x.st);
    const side=k=>({cum:retire.rpCumData(k),pro:retire.rpProData(logs,k),
      pay:retire.rpSalaryData(logs,k),intl:retire.rpIntlData(k)});
    const P=side('pit'), B=side('bat');
    const table=career.statTables('CPBL');

    /* 逐年板(遊戲中的「逐年」分頁)：二刀流有投／打切換，切到哪一側就是該側完整六欄 */
    const dom=await import('./src/ui/dom.js?v=2.1.0');
    dom.board(1);
    const bd=document.getElementById('bd-detail');
    const bdRoot=document.getElementById('board');
    if(bdRoot)bdRoot.classList.add('detail-open');   /* detailSync 只在展開時才重畫 */
    const readBoard=()=>{
      const rows=[...bd.querySelectorAll('.sec-y .bd-yr')];
      const head=rows.find(x=>x.classList.contains('hd'));
      const body=rows.filter(x=>!x.classList.contains('hd'));
      return {hd:head?[...head.querySelectorAll('.n')].map(x=>x.textContent.trim()):[],
        rows:body.length, sides:[...bd.querySelectorAll('.sec-y .ys')].map(b=>b.textContent.trim()),
        on:[...bd.querySelectorAll('.sec-y .ys.on')].map(b=>b.dataset.ys)[0]||null};
    };
    let boardPit={},boardBat={},boardClick=false;
    if(bd){ bd.dataset.tab='y'; delete bd.dataset.yside; dom.detailSync();
      boardPit=readBoard();
      /* 真的點下去，而不是直接改 dataset——要順便驗事件有掛上 */
      const btn=[...bd.querySelectorAll('.sec-y .ys')].find(b=>b.dataset.ys==='bat');
      if(btn){ boardClick=true; btn.click(); }
      boardBat=readBoard();
    }

    /* 結算圖：三個模式都要畫得出來，而且欄位是二刀流的那一組 */
    const capture=mode=>{
      const drawn=[],orig=CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText=function(v,...a){ drawn.push(String(v)); return orig.call(this,v,...a); };
      try{ share.renderShareImage(['中職名人堂（評價分 9000）'],['留言'],
        {mode,ending:{title:'測試結局',body:'第一段。'}}); }
      finally{ CanvasRenderingContext2D.prototype.fillText=orig; }
      return drawn;
    };
    const img={stats:capture('stats'),salary:capture('salary')};

    /* 引退文案：四篇都要有二刀流的敘事人稱 */
    const endingPos=retire.endingPos();
    const prose={pos:endingPos,
      nextGame:retire.nextGameEnding(endingPos).body,
      nextBase:retire.nextBaseEnding(endingPos).body,
      jersey:retire.jerseyWeightEnding(endingPos).body,
      ghost:retire.oldGhostLongCareerComment(endingPos)};

    const tagline=retire.rpTagline();

    /* ⑦ 球季數據卡：二刀流拆成兩個框，但仍在同一張卡裡。
       這一段會換掉 state，所以擺在最後、而且上面要用到 S 的東西都已經算完。 */
    state.setS(t);
    const cardTW=season.statCardHTML(ts,'新北騎士｜DH');
    state.setS(p);
    const cardSolo=season.statCardHTML(ps,'新北騎士');

    return {soloP,twSeason,view,P,B,table,boardPit,boardBat,boardClick,img,prose,cardTW,cardSolo,tagline};
  });

  /* ── ① 單刀投手沒有被誤判成二刀流 ── */
  assert.ok(r.soloP.G>0,'純投手的 st.G 變成 0——投球側欄位分家做錯了，逐年表與鐵人判定都會壞掉');
  assert.equal(r.soloP.hasGP,false,'單刀投手不該有 GP 欄位（pitG() 靠它判斷身分）');
  assert.equal(r.soloP.hasPH,false,'單刀投手不該有 pH 欄位（pitH() 靠它判斷身分）');
  assert.ok(r.soloP.whip>0.5&&r.soloP.whip<2.5,'單刀投手的 WHIP 壞掉了：'+r.soloP.whip);
  assert.equal(r.soloP.whip,r.soloP.recomputed);

  /* ── ② 二刀流的投打欄位分家 ── */
  assert.ok(r.twSeason.GP>0&&r.twSeason.G>0,'二刀流的登板數與打擊出賽要各自存在');
  assert.ok(r.twSeason.GP<r.twSeason.G,'登板數不該等於打擊出賽數');
  assert.ok(r.twSeason.pH>0&&r.twSeason.pBB>0,'被安打／投出的四死球沒有存進 pH/pBB');
  assert.ok(Math.abs(r.twSeason.whip-r.twSeason.whipFromBatting)>0.05,
    'WHIP 還是用打擊側的安打與保送算的：'+JSON.stringify(r.twSeason));
  assert.ok(r.twSeason.whip>0.5&&r.twSeason.whip<2.5,'二刀流的 WHIP 不合理：'+r.twSeason.whip);

  /* ── ③ 版面判斷不看 S.pos ── */
  assert.equal(r.view.pos,'OF','前置條件：這個角色已經被強制轉回外野手');
  assert.equal(r.view.twoWayView,true,'已被轉回的二刀流仍必須用二刀流版面');

  /* 投打各自一張表，而且每一張都用回「單刀的完整欄位」——不再是擠成一列時
     被砍到剩一半的樣子。 */
  const pitOnly=['SV','HLD','WHIP'], batOnly=['OBP','SLG','SB','DEF'];
  const has=(hd,ks)=>ks.every(k=>hd.includes(k));
  assert.ok(has(r.P.cum.hd,['IP','W','L','SO','ERA'].concat(pitOnly)),
    '投球側的累積表欄位不完整：'+r.P.cum.hd.join(','));
  assert.ok(has(r.B.cum.hd,['PA','AVG','OPS','HR','RBI'].concat(batOnly)),
    '打擊側的累積表欄位不完整：'+r.B.cum.hd.join(','));
  assert.ok(has(r.P.pro.hd,['IP','W-L','ERA'].concat(pitOnly)),'投球側的逐年表欄位不完整');
  assert.ok(has(r.B.pro.hd,['PA','AVG','OPS'].concat(batOnly)),'打擊側的逐年表欄位不完整');
  /* 兩張表不可以再混進另一側的欄位 */
  assert.ok(!r.P.pro.hd.some(h=>batOnly.includes(h)),'投球表混進了打擊欄位');
  assert.ok(!r.B.pro.hd.some(h=>pitOnly.includes(h)),'打擊表混進了投球欄位');
  assert.ok(!r.P.cum.hd.includes('投G')&&!r.B.cum.hd.includes('打G'),
    '拆表之後不該再有「投G／打G」這種擠成一列時才需要的欄名');
  assert.equal(r.P.cum.rows[0].txt.length,r.P.cum.hd.length);
  assert.equal(r.P.intl.tot.length,r.P.intl.hd.length);

  /* 沒上場的那一側整列不畫：三個球季裡只有兩季有投球 */
  const pRows=r.P.pro.blocks.flatMap(b=>b.rows), bRows=r.B.pro.blocks.flatMap(b=>b.rows);
  assert.equal(pRows.length,2,'投球表應該只有真的登板過的球季：'+pRows.length);
  assert.equal(bRows.length,3,'打擊表應該包含全部三個球季：'+bRows.length);
  assert.ok(pRows.every(x=>x.txt[0]!=='-'),'投球表裡不該出現整列 - 的球季');
  /* 層級欄各標自己那一側的定位 */
  assert.ok(pRows[0].lvl.includes('先發'),'投球表的層級欄要標定位：'+pRows[0].lvl);
  assert.ok(bRows[0].lvl.includes('DH'),'打擊表的層級欄要標守位：'+bRows[0].lvl);

  /* 薪資表相反：沒上場的球季照樣要列（那一年還是有領薪水），該側印 '-' */
  assert.equal(r.P.pay.rows.length,3,'薪資表不該濾掉沒登板的球季');
  assert.equal(r.P.pay.rows[2].txt[1],'-','沒登板的那一年，投球欄要印 -');
  assert.notEqual(r.P.pay.rows[2].txt[0],'-','沒登板的那一年還是有年薪');

  /* 累積表：兩張都有值 */
  assert.ok(r.P.cum.rows[0].txt.every(v=>v!=='-'),'投球側的累積表不該有空欄');
  assert.ok(r.B.cum.rows[0].txt.every(v=>v!=='-'),'打擊側的累積表不該有空欄');

  /* statTables 應該吐出兩張表 */
  assert.ok(/投球/.test(r.table)&&/打擊/.test(r.table),'生涯累積數據沒有拆成投打兩張');
  assert.equal((r.table.match(/<table/g)||[]).length,2,'生涯累積數據應該是兩張表');

  /* ── ④ 逐年板：投／打切換，各自是該側完整的七欄 ──
     原本是六欄。打者那排補上盜壘（SB 本來就在 st 裡，只有這張表沒印），
     投手側同步補 WHIP，兩側維持一樣寬——不然切投打的時候整排數字會跳。 */
  assert.equal(r.boardClick,true,'逐年板上找不到投／打切換按鈕');
  assert.deepEqual(r.boardPit.sides,['投球','打擊'],'切換按鈕的標籤不對');
  assert.equal(r.boardPit.on,'pit','逐年板預設應該停在投球側');
  assert.deepEqual(r.boardPit.hd,['G','IP','W-L','SV','SO','ERA','WHIP'],
    '投球側的逐年板欄位應該跟單刀投手一模一樣');
  assert.equal(r.boardBat.on,'bat','點了打擊之後沒有切過去');
  assert.deepEqual(r.boardBat.hd,['G','PA','AVG','HR','RBI','OPS','SB'],
    '打擊側的逐年板欄位應該跟單刀野手一模一樣');
  assert.equal(r.boardPit.hd.length,r.boardBat.hd.length,
    '投打兩側欄數不一樣，切換時整排數字會跳');
  /* 切到投球側只列真的登板過的球季；打擊側三季都在 */
  assert.equal(r.boardPit.rows,2,'投球側的逐年板應該只有登板過的球季：'+r.boardPit.rows);
  assert.equal(r.boardBat.rows,3,'打擊側的逐年板應該有全部三個球季：'+r.boardBat.rows);

  /* ── ⑤ 結算圖：每一種表都畫兩張 ── */
  const drew=(xs,t)=>xs.some(x=>x.includes(t));
  assert.ok(drew(r.img.stats,'生涯年表（職業成績・投球）')&&drew(r.img.stats,'生涯年表（職業成績・打擊）'),
    '結算圖的年表沒有拆成投打兩張');
  assert.ok(drew(r.img.stats,'生涯累積數據・投球')&&drew(r.img.stats,'生涯累積數據・打擊'),
    '結算圖的累積數據沒有拆成兩張');
  assert.ok(drew(r.img.salary,'生涯合約薪資與成績・投球')&&drew(r.img.salary,'生涯合約薪資與成績・打擊'),
    '結算圖的薪資表沒有拆成兩張');
  assert.ok(!drew(r.img.stats,'投G')&&!drew(r.img.stats,'打G'),'結算圖還留著擠成一列時的欄名');

  /* ── ⑥ 引退文案與標語 ── */
  assert.equal(r.prose.pos,'TW');
  assert.ok(/投出了一次三振/.test(r.prose.nextGame)&&/一壘安打/.test(r.prose.nextGame),
    '〈下一場比賽〉沒有寫成二刀流的版本');
  assert.ok(/投丟/.test(r.prose.nextBase),'〈下一個壘包〉沒有寫成二刀流的版本');
  assert.ok(/打擊區/.test(r.prose.jersey),'〈球衣的重量〉沒有寫成二刀流的版本');
  assert.ok(/二刀流/.test(r.prose.ghost),'老將留言沒有認出二刀流');
  assert.ok(/二刀流/.test(r.tagline),'結算標語沒有認出二刀流：'+r.tagline);

  assert.equal(errors.length,0,errors.join('\n'));
  /* ── ⑦ 球季數據卡：兩個框、同一張卡 ── */
  assert.equal((r.cardTW.match(/class="statline/g)||[]).length,2,
    '二刀流的球季數據卡應該是兩個框：'+r.cardTW);
  assert.ok(/<span class="side">投<\/span>/.test(r.cardTW)&&/<span class="side">打<\/span>/.test(r.cardTW),
    '兩個框要各自標投／打');
  assert.ok(!/／/.test(r.cardTW),'兩個框之後不該再有把投打串在同一行的分隔號');
  assert.equal((r.cardSolo.match(/class="statline/g)||[]).length,1,'單刀球員的球季數據卡仍是一個框');
  /* 二刀流的卡比單刀精簡（一張卡要放兩行），但盜壘與 WHIP 不能省——
     單刀那版一直都有，二刀流沒有的話等於腳程與被上壘完全看不出來。 */
  assert.ok(/盜壘 /.test(r.cardTW),'二刀流的球季數據卡沒有印盜壘：'+r.cardTW);
  assert.ok(/WHIP /.test(r.cardTW),'二刀流的球季數據卡沒有印 WHIP：'+r.cardTW);

  console.log(JSON.stringify({soloP:r.soloP,twSeason:r.twSeason,
    hd:{pitCum:r.P.cum.hd,batCum:r.B.cum.hd,pitPro:r.P.pro.hd,batPro:r.B.pro.hd,
        boardPit:r.boardPit.hd,boardBat:r.boardBat.hd},
    rows:{pit:r.P.pro.blocks.flatMap(b=>b.rows).length,bat:r.B.pro.blocks.flatMap(b=>b.rows).length}},null,2));
}finally{ await browser.close(); }
