/* 二刀流的逐年年表：沒有產出的那一年不可以整列消失。

   玩家回饋：「退休結算沒顯示投手手術年」。
   二刀流的年表是投打兩張分開畫的，舊版靠 twHasPit()／twHasBat() 過濾，
   「那一側沒有產出就整列不畫」。但 TJ 手術的復健年（只停投球、棒子照打）
   投球側本來就是 0 局，全年報銷更是兩側都 0——於是動手術那一年從投球那張表
   整個消失，玩家在結算頁上完全看不到自己哪一年開的刀。
   單刀投手不會遇到：他只有一張表，`side` 是 null，不走過濾。

   另外全年報銷那一列（phases.js 推的）本來就沒帶 lv／p／role，
   所以就算不過濾也認不出它屬於哪一側。

   守住四件事：
     ① TJ 復健年（只停投球）要留在投球表，並寫明原因
     ② 全年報銷要留在兩張表
     ③ 收斂成單刀之後，放棄那一側不會冒出一整排空白列
     ④ 有產出的年份照常畫數據，沒有被這次改動弄壞 */
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
  await page.goto(`${url}?seed=tw-year-gaps`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state =await import('./src/core/state.js?v=2.1.0');
    const retire=await import('./src/ui/retire.js?v=2.1.0');
    const season=await import('./src/engine/season.js?v=2.1.0');

    const s=state.newState('測',1,'TW',null); state.setS(s);
    Object.assign(s,{stage:'PRO',lv:'MLB',org:'MiLB',orgTeam:'X',pos:'TW',twSeasons:5});
    s.teamName=function(){return 'X';};

    const tw=()=>({GP:28,IP:170.0,W:12,L:8,SV:0,HLD:0,SO:190,ER:60,pH:140,pBB:45,pHR:18,
      G:79,PA:335,AB:302,H:76,HR:18,RBI:55,SB:2,BB:30,DEF:0,avg:76/302,era:3.18});
    /* TJ 復健年：手肘停機一整季，棒子照打（phasePre 的 rehabPitchOnly 分支）。 */
    const rehabPitchOnly=()=>({GP:0,IP:0,W:0,L:0,SV:0,HLD:0,SO:0,ER:0,pH:0,pBB:0,pHR:0,
      G:120,PA:500,AB:450,H:120,HR:22,RBI:70,SB:1,BB:45,DEF:0});
    /* 全年報銷：phases.js 推的 dummySt，兩側都是 0。 */
    const dead=()=>({G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,avg:0,era:0,WHIP:0,DEF:0});
    /* 收斂成投手之後的球季：沒有打席，也沒有守位。 */
    const solo=()=>({G:31,IP:155.0,W:11,L:10,SV:0,HLD:1,SO:150,ER:58,H:145,BB:42,pHR:16,
      PA:0,AB:0,HR:0,RBI:0,SB:0,DEF:0});

    s.log=[
      {y:2030,age:22,tm:'X',lv:'MLB',p:'DH',role:'SP',line:'',inj:false,st:tw()},
      /* 2031：TJ 手術的復健年，只停投球 */
      {y:2031,age:23,tm:'X',lv:'MLB',p:'DH',role:'SP',line:'',inj:true,st:rehabPitchOnly()},
      /* 2032：全年報銷（phases.js 的那一列，現在帶 lv/p/role） */
      {y:2032,age:24,tm:'X',lv:'MLB',p:'DH',role:'SP',line:'復健年・全年報銷',inj:true,st:dead()},
      {y:2033,age:25,tm:'X',lv:'MLB',p:'DH',role:'SP',line:'',inj:false,st:tw()},
      /* 2034 起收斂成純投手：沒有守位、沒有打席 */
      {y:2034,age:26,tm:'X',lv:'MLB',p:'',role:'SP',line:'',inj:false,st:solo()},
      {y:2035,age:27,tm:'X',lv:'MLB',p:'',role:'SP',line:'',inj:true,st:solo()},
    ];
    const pit=retire.proYearTableHTML(s.log,'pit');
    const bat=retire.proYearTableHTML(s.log,'bat');
    const yearsIn=html=>[...html.matchAll(/>(20\d\d)</g)].map(m=>+m[1]);
    return {pit,bat,pitYears:yearsIn(pit),batYears:yearsIn(bat),
      pitRows:(pit.match(/<tr/g)||[]).length-1, batRows:(bat.match(/<tr/g)||[]).length-1,
      cardTW:season.statCardHTML(tw(),'X'), statLineTW:season.statLine(tw())};
  });

  /* ① TJ 復健年要留在投球表，而且要寫明原因、不能印一排 0 */
  assert.ok(r.pitYears.includes(2031),
    `TJ 復健年從投球年表消失了——這就是回報的問題。投球表只有 ${r.pitYears.join('/')}`);
  assert.match(r.pit,/本季未登板/,'復健年那一列要說明為什麼是空的，不是印一排 0');
  assert.ok(r.batYears.includes(2031),'復健年棒子照打，打擊表當然要有');

  /* ② 全年報銷兩張表都要有 */
  assert.ok(r.pitYears.includes(2032),`全年報銷從投球年表消失了：${r.pitYears.join('/')}`);
  assert.ok(r.batYears.includes(2032),`全年報銷從打擊年表消失了：${r.batYears.join('/')}`);
  assert.match(r.pit,/全年報銷/,'全年報銷要照原文寫出來');

  /* ③ 收斂之後放棄的那一側不可以冒出空白列 */
  assert.ok(!r.batYears.includes(2034)&&!r.batYears.includes(2035),
    `收斂成投手之後，打擊年表不該再出現那些年份：${r.batYears.join('/')}`);
  assert.deepEqual(r.pitYears,[2030,2031,2032,2033,2034,2035],
    `投球年表應該是完整的六年：${r.pitYears.join('/')}`);
  assert.deepEqual(r.batYears,[2030,2031,2032,2033],
    `打擊年表應該只有二刀流那四年：${r.batYears.join('/')}`);

  /* ④ 有產出的年份照常畫數據 */
  assert.match(r.pit,/170\.0/,'正常球季的局數不見了');
  assert.match(r.bat,/335/,'正常球季的打席不見了');

  /* 四死球要回到球季卡的兩行上（玩家回報「投打四壞數都沒顯示了」） */
  assert.match(r.cardTW,/四死 45/,'投球行要有四死球');
  assert.match(r.cardTW,/保送 30/,'打擊行要有保送');
  assert.match(r.statLineTW,/四死 45/,'年表用的單行字串也要有四死球');
  assert.match(r.statLineTW,/保送 30/,'年表用的單行字串也要有保送');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({pitYears:r.pitYears,batYears:r.batYears,
    pitRows:r.pitRows,batRows:r.batRows,card:r.cardTW.replace(/<[^>]+>/g,'｜')},null,1));
}finally{ await browser.close(); }
