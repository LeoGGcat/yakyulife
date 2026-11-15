/* 被強制收斂成單刀之後，任何管道都不可以再去動「用不到的那一側」的能力。

   玩家回饋：「收斂成單刀的時候，事件卡還是會影響到用不到的數值，有點微妙。」
   不是卡池的問題——卡池在 twoway_phase4 就驗過了，收斂當季就會切回單刀牌庫。
   問題在 `eventTarget()`：它只檢查 `ev.target in S.ab`，而 S.ab 是只增不減的。
   二刀流收斂成投手之後，con/pow/spd/eye 還留在 S.ab 裡（那是生涯紀錄的一部分），
   於是 role:'*' 而 target 寫死在另一側的卡就會繼續加上去。
   純投手／純打者碰不到，因為他們的 S.ab 根本沒有另一側的鍵——所以這是
   二刀流專屬的洞，也正是玩家會注意到的地方。

   守住四件事：
     ① 資料層：真的存在 role:'*' 但 target 落在單側的卡（不然這支測試在驗空氣）
     ② 收斂成投手後，那些卡只會加到投手的四項
     ③ 收斂成打者後，那些卡只會加到打者那一組
     ④ 大巧不工鎖定的能力如果落在放棄的那一側，特質直接解除——不改指到別的能力，
        那等於把玩家沒選過的東西塞給他。解鎖條件就是「連續三年澆同一個工具」，
        工具沒了特質就沒了，跟二刀流的沉沒成本是同一回事。 */
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
  await page.goto(`${url}?seed=converted-targets`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state =await import('./src/core/state.js?v=2.1.0');
    const phases=await import('./src/flow/phases.js?v=2.1.0');
    const events=await import('./src/flow/events.js?v=2.1.0');
    const EV    =await import('./src/data/events.js?v=2.1.0');
    const {POS_AB}=await import('./src/data/abilities.js?v=2.1.0');

    /* ① 資料層：role:'*' 但 target 寫死在單側的卡有哪些。 */
    const PIT=['vel','ctl','brk'], BAT=['con','pow','spd','eye','rng','fld','arm','cat'];
    const anyRole=EV.EVENTS.filter(e=>(e.role||'*')==='*'&&e.target&&e.target!=='rand');
    const crossPit=anyRole.filter(e=>BAT.includes(e.target)).map(e=>({id:e.id,target:e.target}));
    const crossBat=anyRole.filter(e=>PIT.includes(e.target)).map(e=>({id:e.id,target:e.target}));

    /* 收斂：二刀流 → 投手／打者，跑真的 twoWayAudit。 */
    const fall=(ab,over={})=>{
      const s=state.newState('收斂',0,'TW',null); state.setS(s);
      Object.assign(s,{stage:'PRO',lv:'NPB1',org:'NPB',orgTeam:'X',pos:'TW',role:'SP',
        dpos:'DH',age:26,twAuditLv:'NPB1'},over);
      Object.assign(s.ab,ab);
      s.teamName=function(){return 'X';};
      const fell=phases.twoWayAudit();
      return {s,fell};
    };
    /* 打擊側崩掉 → 留投手；投球側崩掉 → 留打者。 */
    const DEAD_BAT={sta:70,vel:72,ctl:70,brk:70,con:30,pow:30,spd:30,eye:30};
    const DEAD_PIT={sta:70,vel:28,ctl:28,brk:28,con:70,pow:70,spd:60,eye:70};

    /* ②③ 把每一張跨側卡餵進 eventTarget 的實際路徑，看它落在哪個能力上。
       eventTarget 沒有匯出，所以走公開的 resolveEvent；只看「哪些鍵被動到」。 */
    const probe=(deadSide,cards)=>{
      const {s,fell}=fall(deadSide);
      const keys=POS_AB[s.pos];
      const before={}; Object.keys(s.ab).forEach(k=>before[k]=s.ab[k]);
      const touched=new Set();
      for(const c of cards){
        for(let i=0;i<40;i++){
          Object.keys(before).forEach(k=>s.ab[k]=before[k]);
          s.carry={};
          const ev=EV.EVENTS.find(e=>e.id===c.id);
          events.resolveEvent(ev,'bold');
          Object.keys(before).forEach(k=>{ if(s.ab[k]!==before[k])touched.add(k); });
        }
      }
      return {fell,pos:s.pos,keys,touched:[...touched],
        stillHasOtherSide:Object.keys(s.ab).length>keys.length};
    };
    const asPit=probe(DEAD_BAT,crossPit);
    const asBat=probe(DEAD_PIT,crossBat);

    /* ④ 大巧不工鎖在放棄的那一側。 */
    const comboPit=(()=>{
      const s=state.newState('收斂',0,'TW',null); state.setS(s);
      Object.assign(s,{stage:'PRO',lv:'NPB1',org:'NPB',orgTeam:'X',pos:'TW',role:'SP',
        dpos:'DH',age:26,twAuditLv:'NPB1',comboKey:'pow',samePickKey:'pow',samePick:3});
      Object.assign(s.ab,DEAD_BAT); s.traits.combo=true;
      s.teamName=function(){return 'X';};
      phases.twoWayAudit();
      return {pos:s.pos,comboKey:s.comboKey,combo:!!s.traits.combo,
        removed:s.removed.slice(),samePickKey:s.samePickKey,samePick:s.samePick};
    })();
    const comboBat=(()=>{
      const s=state.newState('收斂',0,'TW',null); state.setS(s);
      Object.assign(s,{stage:'PRO',lv:'NPB1',org:'NPB',orgTeam:'X',pos:'TW',role:'SP',
        dpos:'DH',age:26,twAuditLv:'NPB1',comboKey:'vel',samePickKey:'vel',samePick:3});
      Object.assign(s.ab,DEAD_PIT); s.traits.combo=true;
      s.teamName=function(){return 'X';};
      phases.twoWayAudit();
      return {pos:s.pos,comboKey:s.comboKey,combo:!!s.traits.combo,
        removed:s.removed.slice(),samePickKey:s.samePickKey,samePick:s.samePick};
    })();
    /* 沒有被收斂的人不該被動到。 */
    const comboIntact=(()=>{
      const s=state.newState('二刀',0,'TW',null); state.setS(s);
      Object.assign(s,{stage:'PRO',lv:'NPB1',org:'NPB',orgTeam:'X',pos:'TW',role:'SP',
        dpos:'DH',age:26,twAuditLv:'NPB1',comboKey:'pow',samePickKey:'pow',samePick:3});
      Object.assign(s.ab,{sta:70,vel:70,ctl:68,brk:69,con:68,pow:70,spd:60,eye:66});
      s.traits.combo=true; s.teamName=function(){return 'X';};
      const fell=phases.twoWayAudit();
      return {fell,comboKey:s.comboKey,combo:!!s.traits.combo};
    })();

    return {crossPit,crossBat,asPit,asBat,comboPit,comboBat,comboIntact};
  });

  /* ① 這些卡真的存在，不然下面在驗空氣 */
  assert.ok(r.crossPit.length>0,'找不到 role:* 而 target 在打擊側的卡，測試前提不成立');
  assert.ok(r.crossBat.length>0,'找不到 role:* 而 target 在投球側的卡，測試前提不成立');

  /* ②③ 收斂之後，事件卡只能動到現在守位用得到的能力 */
  for(const [name,x] of [['收斂成投手',r.asPit],['收斂成打者',r.asBat]]){
    assert.equal(x.fell,true,`${name}：twoWayAudit 應該判定收斂`);
    assert.equal(x.stillHasOtherSide,true,
      `${name}：另一側的能力應該還留在 S.ab 裡（那是生涯紀錄），這個洞才有意義`);
    assert.ok(x.touched.length>0,`${name}：事件卡什麼都沒動到，測試沒驗到東西`);
    for(const k of x.touched){
      assert.ok(x.keys.includes(k),
        `${name}：事件卡動到了用不到的能力「${k}」（現在守位只有 ${x.keys.join('/')}）`);
    }
  }

  /* ④ 大巧不工要整個解除，不是改指到別的能力 */
  for(const [name,x] of [['收斂成投手',r.comboPit],['收斂成打者',r.comboBat]]){
    assert.equal(x.combo,false,`${name}：專精的工具沒了，大巧不工應該解除`);
    assert.equal(x.comboKey,null,
      `${name}：大巧不工解除後 comboKey 應該清空，而不是改指到「${x.comboKey}」`);
    assert.ok(x.removed.includes('大巧不工'),`${name}：解除要記進 S.removed，特質列表才看得到`);
    assert.equal(x.samePickKey,null,`${name}：專精連續計數要重來`);
    assert.equal(x.samePick,0,`${name}：專精連續計數要歸零`);
  }
  /* 沒被收斂的人不該被動到 */
  assert.equal(r.comboIntact.fell,false,'這組能力不該被收斂，測試前提不成立');
  assert.equal(r.comboIntact.comboKey,'pow','沒有被收斂就不該去動大巧不工鎖定的能力');
  assert.equal(r.comboIntact.combo,true,'沒有被收斂就不該拔掉大巧不工');

  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({crossPit:r.crossPit,crossBat:r.crossBat,
    asPit:{pos:r.asPit.pos,touched:r.asPit.touched},
    asBat:{pos:r.asBat.pos,touched:r.asBat.touched},
    comboPit:r.comboPit,comboBat:r.comboBat},null,1));
}finally{ await browser.close(); }

function POSKEYS(pos){
  return {P:['sta','vel','ctl','brk'],
    C:['sta','con','pow','spd','eye','rng','fld','arm','cat'],
    IF:['sta','con','pow','spd','eye','rng','fld','arm'],
    OF:['sta','con','pow','spd','eye','rng','fld','arm'],
    TW:['sta','vel','ctl','brk','con','pow','spd','eye']}[pos]||[];
}
