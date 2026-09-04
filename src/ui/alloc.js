import {$, actClear, actToggleSync, board, scrollBottom} from './dom.js?v=1.5.12';
import {S} from '../core/state.js?v=1.5.12';
import {ABL, POS_AB} from '../data/abilities.js?v=1.5.12';
import {abCost, normalizeAbCarry, addAb} from '../engine/ability.js?v=1.5.12';
import {allocDone} from '../flow/events.js?v=1.5.12';
import {isMobileLayout} from './prefs.js?v=1.5.12';

export function allocFullOpen(){ const f=$('alloc-full'); if(f)f.classList.add('show'); }
export function allocFullClose(){ const f=$('alloc-full'); if(f)f.classList.remove('show'); }
/* The live allocation, so its nodes can be re-homed when a setting changes mid-way.
   render() only ever writes into these same three nodes, which is what makes moving
   them between the panel and the overlay safe. */
export let ALLOC=null;
export function setAlloc(v){ ALLOC=v; }
export function clearAlloc(){ ALLOC=null; }
export function allocPlace(){
  if(!ALLOC)return;
  const a=$('act'), full=document.body.classList.contains('big-text')&&isMobileLayout();
  const s=$('act-side'); if(s)s.classList.toggle('alloc',!full);
  if(full){
    /* move the nodes out of #act before rewriting it, or the rewrite would destroy them */
    const fb=$('af-body');
    fb.appendChild(ALLOC.top); fb.appendChild(ALLOC.rows); fb.appendChild(ALLOC.btm);
    const ft=$('af-title'); if(ft)ft.textContent=ALLOC.title||ALLOC.label;
    a.innerHTML=`<div class="title">${ALLOC.title||ALLOC.label}</div><div class="pool" id="al-cue"></div>`;
    /* both entry points already sit behind an explicit 分配 button, so the overlay opens
       straight away; this one is only the way back after the player dismisses it */
    const ob=document.createElement('button'); ob.className='btn main'; ob.id='al-open';
    ob.style.textAlign='center'; ob.textContent='繼續分配 ▸'; ob.onclick=allocFullOpen;
    a.appendChild(ob);
    allocFullOpen();
  }else{
    const frag=document.createDocumentFragment();
    frag.appendChild(ALLOC.top); frag.appendChild(ALLOC.rows); frag.appendChild(ALLOC.btm);
    a.innerHTML=`<div class="title">${ALLOC.title||ALLOC.label}</div>`+
      (ALLOC.hint?`<div class="al-hint">${ALLOC.hint}</div>`:'');
    a.appendChild(frag);
    allocFullClose();
  }
  ALLOC.render();
  /* the sticky panel just grew (or moved between panel and overlay), which adds the same
     amount to scrollHeight; without this the log's tail is left hidden behind the panel —
     every other event path re-pins the bottom (card()/choose()), this one must too */
  scrollBottom();
}
/* 加點介面：mode {dice:[..]} 或 {pool:n} */
export function allocUI(mode,label,done){
  actClear();
  const a=$('act'); const keys=POS_AB[S.pos];
  let dice=mode.dice?mode.dice.slice():null, pool=mode.pool||0, idx=0, hist=[];
  /* SCREEN_09：標題列只放「分配訓練成果」，括號裡的操作提示獨立成一行說明，
     不要整串塞進 action sheet 的標題（會被截斷成一長條）。 */
  const lm=String(label).match(/^([^（(]+)[（(](.+)[）)]\s*$/);
  const alTitle=lm?lm[1].trim():label, alHint=lm?lm[2].trim():'';
  a.innerHTML=`<div class="title">${alTitle}</div>`+(alHint?`<div class="al-hint">${alHint}</div>`:'')+
    `<div id="al-top"></div><div id="al-rows"></div><div class="row2" id="al-btm"></div>`;
  const touchedKeys={};
  const top=$('al-top'),rows=$('al-rows'),btm=$('al-btm');
  /* allocPlace() below decides panel vs overlay from the current settings, and can be
     called again by applyMobileUI / applyBigText if the player changes them mid-allocation */
  setAlloc({top,rows,btm,label,title:alTitle,hint:alHint,render});
  function remaining(){ return dice?dice.length-idx:pool; }
  function render(){
    if(dice){ top.innerHTML='<div id="dice">'+dice.map((v,i)=>`<div class="die ${i<idx?'used':''} ${i===idx?'active':''} ${v===6?'six':''}">${v}</div>`).join('')+'</div>'; }
    else top.innerHTML=`<div class="pool">剩餘可分配點數：${pool} 點（點一下能力 +1點）</div>`;
    const cue=$('al-cue'); if(cue)cue.textContent=dice?`剩餘 ${remaining()} 顆骰子未分配`:`剩餘 ${remaining()} 點未分配`;
    rows.innerHTML='';
    keys.forEach(k=>{ normalizeAbCarry(k); const v=S.ab[k],cap=v>=80;
      const r=document.createElement('div'); r.className='abrow'+(cap?' capped':'');
      const pk=(S.pot&&S.pot[k])||62, cst=abCost(k), cr=(S.carry&&S.carry[k])||0;
      r.innerHTML=`<span class="nm">${ABL[k]}</span><span class="bar"><i style="width:${v/80*100}%"></i><em style="left:${pk/80*100}%"></em></span><span class="val" style="line-height:1.1">${v}<small style="opacity:.5">/${pk}</small>${cst>1?`<span style="display:block;opacity:.5;font-size:10.5px;letter-spacing:1px;margin-top:-2px">${cr}/${cst}</span>`:''}</span>`;
      if(!cap&&remaining()>0)r.onclick=()=>{ const amt=dice?dice[idx]:1;
        const pc=(S.carry&&S.carry[k])||0;
        const got=addAb(k,amt); touchedKeys[k]=(touchedKeys[k]||0)+amt; hist.push([k,got,pc]); if(dice)idx++; else pool--;
        r.querySelector('.val').innerHTML=`${S.ab[k]} <b style="display:block;font-size:10.5px">${got>0?'+'+got:'蓄力中'}</b>`; render(); board(0); };
      rows.appendChild(r); });
    btm.innerHTML='';
    /* 復原鈕固定佔位:無可復原時 disabled 而非消失,避免版面跳動誤觸 */
    const u=document.createElement('button'); u.className='btn'; u.style.textAlign='center';
    u.textContent='↩ 復原'; u.disabled=!hist.length;
    if(hist.length)u.onclick=()=>{ const [k,got,pc]=hist.pop(); S.ab[k]-=got; if(S.carry)S.carry[k]=pc; if(dice)idx--; else pool++; render(); board(0); };
    btm.appendChild(u);
    const allCap=keys.every(k=>S.ab[k]>=80);
    if(remaining()===0||allCap){ const c=document.createElement('button'); c.className='btn main';
      c.textContent=(remaining()>0&&allCap)?'能力已達上限，捨棄剩餘骰子 ▸':'確認 ▸';
      c.onclick=()=>{ actClear(); allocDone(touchedKeys,dice?true:false); done(); }; btm.appendChild(c); }
    actToggleSync();
  }
  allocPlace();
  /* Roll-in animation on first render only; purely visual (Math.random, not the
     seeded RNG) — game values always come from dice[]. Scoped to `top` rather than #act
     because in the overlay form the dice live in #af-body, where #act cannot see them. */
  if(dice && !matchMedia('(prefers-reduced-motion: reduce)').matches){
    top.querySelectorAll('#dice .die').forEach((el,i)=>{
      el.classList.add('rolling');
      const iv=setInterval(()=>{ el.textContent=1+Math.floor(Math.random()*6); },70);
      setTimeout(()=>{ clearInterval(iv); el.classList.remove('rolling'); el.textContent=dice[i];
        if(dice[i]===6)el.classList.add('flash6'); },260+i*90);
    });
  }
}
