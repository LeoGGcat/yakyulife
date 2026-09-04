import {S} from '../core/state.js?v=1.5.12';
import {APP_VER, SPONSOR_URL} from '../config.js?v=1.5.12';
import {renderTraits, traitNames} from './traits.js?v=1.5.12';
import {clearAlloc, allocFullClose} from './alloc.js?v=1.5.12';
import {themeModal, applyBigText, applyMobileUI} from './prefs.js?v=1.5.12';
import {DPN, POSN} from '../data/abilities.js?v=1.5.12';
import {TEAM_COLOR, LV} from '../data/teams.js?v=1.5.12';
import {TRAIT_KEYS, TRAIT_FX} from '../data/traits.js?v=1.5.12';
import {playerName, stageLabel} from '../core/state.js?v=1.5.12';
import {salParts, fmtMoney} from '../engine/contract.js?v=1.5.12';
import {roleN, fmtIP, slgOf, baseballERA} from '../engine/season.js?v=1.5.12';
import {honorGroups, yearRanges} from '../engine/career.js?v=1.5.12';
import {isChampionshipYear} from '../engine/championship.js?v=1.5.12';
import {playerType, ovr} from '../engine/ability.js?v=1.5.12';

export const $=id=>document.getElementById(id);
export let _curYearBody=null; /* 當前年度的內容容器 */
export function logTarget(){ return _curYearBody || $('log'); }
export function scrollBottom(){ /* iOS Safari 於 iframe 內平滑滾動易觸發白畫面,改用同步滾動+rAF */
  try{ requestAnimationFrame(function(){ window.scrollTo(0, document.body.scrollHeight); }); }
  catch(e){ try{ window.scrollTo(0, document.body.scrollHeight); }catch(_){} }
}
/* Team colours are jersey primaries, not text colours. Measured against the old #1a1a1a chip
   background, 29 of the 48 fell below 3:1 and 紐約帝國 (#0C2340) sat at 1.10:1, which is what
   players reported as too dark to read. Use the colour as the chip's background instead and
   pick the text from its luminance: that keeps the team identity at full saturation and puts
   every one of the 48 above 4.5:1. The border is the text colour at low alpha so a dark team
   still reads as a chip against a dark card. */
export function teamChip(hex){
  const h=hex.replace('#','');
  const v=[0,2,4].map(i=>{ const c=parseInt(h.slice(i,i+2),16)/255;
    return c<=.03928?c/12.92:Math.pow((c+.055)/1.055,2.4); });
  const L=.2126*v[0]+.7152*v[1]+.0722*v[2];
  const dark=(L+.05)/.05 > 1.05/(L+.05); /* black text out-contrasts white on this colour */
  return {bg:hex,fg:dark?'#000000':'#ffffff',bd:dark?'rgba(0,0,0,.4)':'rgba(255,255,255,.45)'};
}
/* ---------- 主題化對話框(純呈現層) ---------- */
/* cls is an optional modifier for the box (e.g. a wider sheet). It is assigned rather
   than added so one modal's variant can never leak into the next one opened. */
export function modalOpen(html,cls){ const m=$('modal'); if(!m)return; const b=$('modal-box');
  b.className=cls||''; b.innerHTML=html; m.classList.add('show'); }
export function modalClose(){ const m=$('modal'); if(m)m.classList.remove('show'); }
/* Keep dynamically-rendered brand rows on the same stable owner-provided logo as the shell. */
export function brandHTML(){
  const wm=document.querySelector('.wm-img');
  const src=wm?wm.getAttribute('src'):'assets/yakyolife-logo.svg';
  return `<img class="wm-img" src="${src}" alt="YaKyoLife"><span class="sub">棒球人生模擬器</span>`+
    `<span class="ver">${APP_VER}</span>`;
}
export function menuModal(){
  const wide=matchMedia('(min-width:921px)').matches;
  const mob=document.body.classList.contains('mobile-ui');
  const big=document.body.classList.contains('big-text');
  modalOpen(`<div class="md-brand">${brandHTML()}</div>
    <button class="btn" id="md-theme" style="text-align:center">切換佈景主題</button>
    <button class="btn" id="md-big" style="text-align:center">${big?'切回標準字級':'改用大字級'}</button>
    ${wide?`<button class="btn" id="md-ui" style="text-align:center">${mob?'切回電腦版介面':'改用手機版介面'}</button>`:''}
    <a class="btn" id="md-sponsor" href="${SPONSOR_URL}" target="_blank" rel="noopener noreferrer" style="text-align:center;margin-top:14px"><span aria-hidden="true">♥</span> 贊助支持<small>贊助伺服器與後續開發</small></a>
    <button class="btn warn" id="md-restart0" style="text-align:center;margin-top:14px">重新開始</button>
    <button class="btn" id="md-credits" style="text-align:center;margin-top:14px">特別感謝</button>
    <button class="btn" id="md-close" style="text-align:center;margin-top:14px">關閉</button>`);
  $('md-theme').onclick=themeModal;
  $('md-big').onclick=()=>{ applyBigText(!big); menuModal(); };
  const mu=$('md-ui'); if(mu)mu.onclick=()=>{ applyMobileUI(!mob); menuModal(); };
  $('md-restart0').onclick=restartModal;
  $('md-credits').onclick=creditsModal;
  $('md-close').onclick=modalClose;
}
/* 特別感謝：資料寫在這裡而不是 HTML，之後要加人只改這一份陣列。 */
export const CREDITS=[
  {who:'Howar31', what:'給予的技術支持'},
  {who:'ktlin850722', what:'UI／UX 支援'},
  {who:'米蟲小組', roster:'安安、阿軒、阿傑、阿豪、阿榮、阿吉、胡立歐、達鬨、KT',
   what:'在遊戲開發給予的建議與測試'},
];
export function creditsModal(){
  const rows=CREDITS.map(c=>
    `<li><b>${c.who}</b>${c.roster?`<span class="cr-roster">${c.roster}</span>`:''}`+
    `<span class="cr-what">${c.what}</span></li>`).join('');
  modalOpen(`<div class="md-brand">${brandHTML()}</div>
    <h3 class="cr-h">特別感謝</h3>
    <ul class="cr-list">${rows}</ul>
    <p class="cr-you">還有每個認真體驗這款遊戲的你們</p>
    <button class="btn" id="cr-close" style="text-align:center;margin-top:14px">關閉</button>`,'md-thanks');
  $('cr-close').onclick=modalClose;
}
export function restartModal(){
  modalOpen(`<h3>重新開始</h3><p>確定要放棄這段人生，從頭開始嗎？</p>
    <button class="btn warn" id="md-restart" style="text-align:center">放棄這段人生，重新開始</button>
    <button class="btn" id="md-cancel" style="text-align:center">繼續目前的生涯</button>`);
  $('md-restart').onclick=()=>{ _allowLeave=true; location.href=location.pathname; };
  $('md-cancel').onclick=menuModal;
}
/* Accidental-reload guard: pull-to-refresh / F5 / tab close mid-game triggers the
   native leave prompt; intentional restarts set _allowLeave, finished games skip it */
let _allowLeave=false;
window.addEventListener('beforeunload',function(ev){
  if(!S||S.done||_allowLeave)return;
  ev.preventDefault(); ev.returnValue='';
});
function cardTitleHTML(title){
  const safe=esc(title);
  const m=String(title).match(/^事件卡｜(.+?)(?:（(.+)）)?$/);
  if(!m)return `<h4><span class="card-title-main">${safe}</span></h4>`;
  const name=esc('事件卡｜'+m[1]), meta=m[2]?`<span class="card-title-meta">${esc(m[2])}</span>`:'';
  return `<h4><span class="card-title-main">${name}</span>${meta}</h4>`;
}
export function card(cls,title,html){ const d=document.createElement('div'); d.className='card '+cls;
  d.innerHTML=(title?cardTitleHTML(title):'')+html; logTarget().appendChild(d);
  renderTraits(); /* settlement-time trait unlocks emit a card without a board() refresh */
  scrollBottom(); }
export function divider(t){ /* 每個 divider 開啟新的年度摺疊區塊 */ const log=$('log'); const blocks=log.querySelectorAll('.yr-block'); /* 替剛結束的「上一年」加上下拉箭頭標記，但保留展開（不加上 collapsed） */ const prev = blocks[blocks.length - 1]; if(prev){ const h = prev.querySelector('.yr-head'); if(h && prev.querySelector('.yr-body').children.length) h.classList.add('has-body'); } /* 找到「前年」（倒數第二個區塊）並將其摺疊起來 */ const prevPrev = blocks[blocks.length - 2]; if(prevPrev){ prevPrev.classList.add('collapsed'); } /* 建新區塊 */ const block=document.createElement('div'); block.className='yr-block'; const head=document.createElement('div'); head.className='yr-head'; head.textContent=t; const body=document.createElement('div'); body.className='yr-body'; head.onclick=()=>block.classList.toggle('collapsed'); block.appendChild(head); block.appendChild(body); log.appendChild(block); _curYearBody=body;
  /* Every year stays in the DOM: the career timeline is only useful if a player can
     reopen an early season, and dropping the oldest blocks made those years dead
     (TL[].el went stale, so tlScrollTo() silently did nothing).
     Pruning was never the saving it looked like. Measured on a 33-season career,
     iPhone-sized viewport, 6x CPU throttle, four identical 603-action runs per build:
       - live DOM nodes after GC: 4,912-5,013 pruned vs 4,817-4,940 kept, the same
         within run-to-run noise, because TL[].el pinned every removed block anyway
         (a constant 955 detached nodes / 29 KB in the pruning build, zero here)
       - past years are already display:none via .yr-block.collapsed .yr-body,
         so they cost no layout and no paint
       - per-action latency: mean 6.5-7.0 -> 7.0-7.3 ms; the p50 (6.0-6.2 vs 6.1-6.4)
         and p95 (12.4-14.0 vs 13.0-14.7) ranges overlap
     About half a millisecond per action buys back the whole career log. Do not
     reintroduce a cap without re-measuring: the old one removed content that was
     already free. */ }
export function actClear(){ const a=$('act'); a.innerHTML=''; a.classList.remove('collapsed');
  const t=$('act-toggle'); if(t)t.style.display='none';
  /* every actClear() site is a point where an allocation has ended or is restarting,
     so this is also where the overlay is torn down and the live allocation forgotten */
  clearAlloc(); allocFullClose(); const fb=$('af-body'); if(fb)fb.innerHTML='';
  const s=$('act-side'); if(s)s.classList.remove('alloc'); }
export function actToggleSync(){
  const a=$('act'), t=$('act-toggle'); if(!t)return;
  const has=a.innerHTML.trim()!=='' && a.style.display!=='none';
  t.style.display=has?'flex':'none';
  /* same chevron as the top bar's hint; it points up while the options are folded away,
     which is the direction they come back from at the bottom of the screen */
  const collapsed=a.classList.contains('collapsed');
  if(!t.querySelector('.act-title'))t.innerHTML='<span class="act-title"></span><i class="ph-bold ph-caret-down chev" aria-hidden="true"></i>';
  const title=a.querySelector(':scope > .title');
  const first=a.querySelector('button,.btn');
  /* 事件標題含引言時只取名稱那一段（.ev-h）；textContent 會把兩段黏在一起。 */
  const head=title&&title.querySelector('.ev-h');
  const txt=(head&&head.textContent.trim())||(title&&title.textContent.trim())||(first&&first.textContent.trim().replace(/\s+/g,' '))||'目前行動';
  t.querySelector('.act-title').textContent=txt;
  /* 手機版的摺疊列已經印過大標了，內文只需要留小標。沒有小標的面板（分配訓練成果、
     球季表現這種）整塊標成 .solo，交給 CSS 在手機版收起來，不要同一句話印兩次。 */
  if(title)title.classList.toggle('solo',!title.querySelector('small'));
  const ic=t.querySelector('.chev');
  ic.classList.toggle('ph-caret-up',collapsed);
  ic.classList.toggle('ph-caret-down',!collapsed);
  t.setAttribute('aria-expanded',String(!collapsed));
  const lbl=collapsed?'展開選項':'收合選項';
  t.setAttribute('aria-label',lbl); t.title=lbl;
}
export function choose(title,opts){
  actClear(); const a=$('act');
  a.classList.remove('collapsed'); /* 新選項出現時自動展開 */
  if(title)a.innerHTML=`<div class="title">${title}</div>`;
  opts.forEach(o=>{ const b=document.createElement('button');
    b.className='btn'+(o.main?' main':'')+(o.warn?' warn':'')+(o.center?' center':'');
    b.innerHTML=o.t+(o.s?`<small>${o.s}</small>`:'');
    b.onclick=()=>{ actClear(); o.f(); }; a.appendChild(b); });
  actToggleSync(); scrollBottom();
}
/* 所屬區塊(1A 定稿)。小標依階段在「所屬學校／所屬球隊」間切換(手機只留「所屬」，見 CSS)；
   隊名在職業階段沿用原本的隊色圓點＋白底標籤，非職業維持琥珀色文字；層級徽章文案就是
   stageLabel()，站上該條路的頂端(學生年級／中職一軍／日職一軍／大聯盟)填實心金底，
   還沒上去的(業餘、二軍、小聯盟)只描邊。 */
const LV_SHORT={CPBL2:'二軍',NPB2:'二軍',R:'新人'}; /* 手機版:聯盟由隊名交代,徽章只留層級 */
function affiliationHTML(){
  const student=(S.stage==='HS'||S.stage==='U');
  const proTeam=(S.stage==='PRO'&&S.orgTeam)?S.orgTeam:'';
  const lvOk=S.stage!=='PRO'||!!(S.lv&&LV[S.lv]);
  const badge=lvOk?stageLabel():'';
  const top=student?true:S.stage==='AMA'?false:!!(S.lv&&LV[S.lv]&&LV[S.lv].top);
  /* 手機版寫法:三個聯盟的頂級層級不掛徽章,二軍就寫二軍,美國新人聯盟寫新人,1A~3A 不變。
     學生年級與業餘成棒兩邊都寫全稱——沒有隊名可以交代那是高幾。 */
  const short=(S.stage==='PRO'&&S.lv&&LV[S.lv])
    ? (LV[S.lv].top?'':(LV_SHORT[S.lv]||LV[S.lv].n)) : badge;
  const tc=proTeam&&TEAM_COLOR[proTeam];
  let name;
  if(tc){ /* 判斷顏色是否為白色，避免白底白字 */
    const isWhite=(tc.toLowerCase()==='#ffffff'||tc.toLowerCase()==='#fff');
    name=`<span class="bt-dot" style="background:${isWhite?'#cccccc':tc}"></span>`+
      `<span class="bt-name chip" style="color:${isWhite?'#000000':tc}">${proTeam}</span>`;
  } else name=`<span class="bt-name plain">${proTeam||S.team||''}</span>`;
  let bhtml='';
  if(badge){ const cls=`bt-badge ${top?'top':'sub'}${short?'':' nomob'}`;
    const txt=short===badge?badge:`<i class="lw">${badge}</i><i class="lc">${short}</i>`;
    bhtml=`<span class="${cls}">${txt}</span>`; }
  return `<span class="bt-lbl"><i>所屬</i><em>${student?'學校':'球隊'}</em></span>`+
    `<span class="bt-row">${name}${bhtml}</span>`;
}
/* 守位晶片(實底)＋稱號晶片(金描邊) */
function chipsHTML(){
  const pos=(S.dpos?DPN[S.dpos]:POSN[S.pos])+(S.role?'・'+roleN(S.role):'');
  const typ=playerType()+(S.traits.genius?' ★':'');
  return `<span class="bd-chip pos">${pos}</span><span class="bd-chip typ">${typ}</span>`;
}
export function board(phase){
  renderTraits();
  $('bd-jersey').textContent=S.jersey;
  $('bd-name').textContent=S.name;
  $('bd-role').innerHTML=chipsHTML();
  { const t=$('bd-team'); t.innerHTML=affiliationHTML();
    /* the compact bar drops the pill around a pro club: its white label is its own frame */
    t.classList.toggle('pro',!!(S.stage==='PRO'&&S.orgTeam&&TEAM_COLOR[S.orgTeam])); }
  $('bd-age').textContent=S.age; $('bd-year').textContent=S.year;
  $('bd-ovr').textContent=ovr(); if(S.pos==='P'){const el=$('bd-tj'); if(el)el.textContent='';}
  { const sal=Math.round(S.salary),sp=salParts(sal),salEl=$('bd-sal'); salEl.textContent=sp.v;
    salEl.style.fontSize='';
    const lb=$('bd-sal-lbl'); if(lb)lb.textContent=`生涯薪(${sp.u})`;
    const tip=$('bd-sal-tip'); if(tip)tip.textContent=fmtMoney(sal)+' 台幣'; }
  [0,1,2].forEach(i=>$('lp'+i).classList.toggle('on',i===phase));
  detailSync();
}
/* the compact bar is a CSS state, so ask the layout rather than re-deriving the breakpoint */
function isCompact(){ const h=$('bd-hint'); return !!h && getComputedStyle(h).display!=='none'; }
/* ---------- 「詳情」展開面板 ----------
   Four blocks over data the game already keeps: S.honors / S.ct + S.salary / S.traits +
   S.removed / S.log. Desktop lays all four out at once, mobile switches them with the tab
   strip (the active tab lives in #bd-detail[data-tab] so a board() refresh keeps it).
   逐年薪資 is deliberately absent: nothing in the save records a per-year figure, and
   inventing one from the current contract would be wrong for every earlier season. */
const F2=v=>v==null?'-':v.toFixed(2);
const F3=v=>v==null?'-':v.toFixed(3).replace(/^0/,'');
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
const salRow=(k,v)=>`<div class="bd-sr"><span class="k">${k}</span><span class="v">${v}</span></div>`;
function secHonors(){
  /* honorGroups() is ranked by prestige, which is what the settlement card wants; here the
     year is the leading column, so read it chronologically instead */
  const first=g=>{ const ys=g.yrs.filter(Boolean).map(Number); return ys.length?Math.min(...ys):Infinity; };
  const gs=honorGroups().sort((a,b)=>first(a)-first(b));
  const body=gs.length?gs.map(g=>{
    const rs=yearRanges(g.yrs), n=g.yrs.length;
    return `<div class="bd-hr"><span class="y">${rs.join('、')}</span>`+
      `<span class="n">${g.awd}${n>1?` <b>×${n}</b>`:''}</span></div>`;
  }).join(''):'<div class="bd-none">還沒有拿過任何獎項。</div>';
  return `<div class="bd-sec sec-h"><div class="bd-sh">目前成就</div>${body}</div>`;
}
function secSalary(){
  const ct=S.ct;
  /* annualSchedule[0] is the year actually being paid when a contract has a step schedule */
  const annual=ct?((ct.annualSchedule&&ct.annualSchedule.length)?ct.annualSchedule[0]:ct.annual):null;
  const contract=(ct&&Number.isFinite(annual))
    ?`${fmtMoney(Math.round(annual))} × 剩 ${Math.max(0,ct.yrs||0)} 年`:'—';
  const tenure=(S.stage==='PRO'&&S.orgTeam)?`${S.teamYears||0} 年（${S.orgTeam}）`:'—';
  const outside=Math.round(S.outsideIncome||0), yearOutside=Math.round(S.yearOutsideIncome||0);
  const outsideRow=outside?salRow('業外收入',`${fmtMoney(outside)}${yearOutside?`（本年 +${fmtMoney(yearOutside)}）`:''}`):'';
  return `<div class="bd-sec sec-s"><div class="bd-sh">薪資</div>`+
    salRow('現行合約',contract)+salRow('球隊年資',tenure)+outsideRow+
    `<div class="bd-sr tot"><span class="k">生涯累計</span>`+
    `<span class="v">${fmtMoney(Math.round(S.salary))}</span></div></div>`;
}
function secTraits(){
  const out=[];
  /* the effect text is carried on title as well as inline: the wide layout shows names only
     (see the .bd-tc .f rule) and surfaces the effect on hover, the way #trait-side already does */
  [...TRAIT_KEYS.pos,...TRAIT_KEYS.neg].forEach(k=>{ if(!S.traits||!S.traits[k])return;
    const fx=TRAIT_FX[k]||'';
    traitNames(k).forEach(name=>out.push(`<div class="bd-tc${TRAIT_KEYS.neg.includes(k)?' neg':''}" title="${esc(fx)}">`+
      `<span class="n">${name}</span><span class="f">${fx}</span></div>`)); });
  (S.removed||[]).forEach(l=>out.push(
    `<div class="bd-tc off" title="已解除"><span class="n">${l}</span><span class="f">已解除</span></div>`));
  return `<div class="bd-sec sec-t"><div class="bd-sh">隱藏屬性</div>`+
    (out.length?`<div class="bd-tw">${out.join('')}</div>`
               :'<div class="bd-none">還沒有覺醒任何隱藏屬性。</div>')+`</div>`;
}
function secLog(){
  const L=S.log||[], isP=S.pos==='P';
  const yearHTML=y=>{ const crown=isChampionshipYear(S.honors,y)
    ?'<span class="champ-crown" title="該年度奪冠" role="img" aria-label="冠軍"></span>':'';
    return `<span class="champ-slot">${crown}</span>${y}`; };
  /* 業餘年份沒有 st(逐項數據)，只有文字事蹟——這就是兩張表的分界 */
  const ama=L.filter(r=>!r.st), pro=L.filter(r=>r.st);
  const hd=isP?['G','IP','W-L','SV','SO','ERA']:['G','PA','AVG','HR','RBI','OPS'];
  const drop=isP?[1,0,0,1,1,0]:[1,1,0,0,1,0]; /* 手機留 3 欄:投手 IP/W-L/ERA、野手 AVG/HR/OPS */
  const cells=v=>v.map((t,i)=>`<span class="n${drop[i]?' opt':''}">${t}</span>`).join('');
  let h=`<div class="bd-sec sec-y"><div class="bd-sh">生涯逐年成績</div>`;
  if(!L.length)h+='<div class="bd-none">還沒有完整打過一個球季。</div>';
  if(ama.length){ h+='<div class="bd-yg">業餘</div>';
    ama.forEach(r=>{ h+=`<div class="bd-yr${r.inj?' inj':''}"><span class="y">${yearHTML(r.y)}</span>`+
      `<span class="a opt">${r.age}</span><span class="tm">${esc(r.tm)}</span>`+
      `<span class="ln">${esc(r.line)}</span></div>`; }); }
  if(pro.length){ h+='<div class="bd-yg">職業</div>'+
      `<div class="bd-yr hd"><span class="y">年</span><span class="a opt">齡</span>`+
      `<span class="tm">球隊</span>${cells(hd)}</div>`;
    pro.forEach(r=>{ const s=r.st; let v;
      if(isP){ const era=baseballERA(s);
        v=[s.G,fmtIP(s.IP),`${s.W}-${s.L}`,s.SV||0,s.SO,F2(era)];
      } else { const obp=s.PA>0?(s.H+s.BB)/s.PA:null, slg=s.AB>0?slgOf(s):null;
        v=[s.G,s.PA,F3(s.AB>0?s.H/s.AB:null),s.HR,s.RBI,F3((obp!=null&&slg!=null)?obp+slg:null)]; }
      /* the compact row drops BB/WHIP/SB/DEF; the full season line stays on hover */
      h+=`<div class="bd-yr${r.inj?' inj':''}" title="${esc(r.line)}"><span class="y">${yearHTML(r.y)}</span>`+
        `<span class="a opt">${r.age}</span><span class="tm">${esc(r.tm)}</span>${cells(v)}</div>`; }); }
  return h+'</div>';
}
const DTABS=[['h','成就'],['s','薪資'],['t','屬性'],['y','逐年']];
export function detailSync(){
  const bd=$('board'),d=$('bd-detail');
  if(!S||!bd||!d||!bd.classList.contains('detail-open'))return;
  const cur=d.dataset.tab||'h', sc=d.scrollTop;
  const prevY=d.querySelector('.sec-y'), yTop=prevY?prevY.scrollTop:null;
  /* the phone bar drops the lamp row for the year strip and has no room for the 稱號 chip;
     both come back on the panel's first line */
  const lamps=$('lamps'), on=lamps&&lamps.querySelector('.lamp.on');
  const idrow=isCompact()
    ? `<div class="bd-idrow">${on?`<span class="bd-ph"><i></i>${on.textContent}</span>`:''}`+
      `${chipsHTML()}</div>`
    : '';
  d.innerHTML=idrow+'<div class="bd-tabs">'+DTABS.map(([k,n])=>
      `<button type="button" class="bd-tab${k===cur?' on':''}" data-t="${k}">${n}</button>`).join('')+'</div>'+
    secHonors()+secSalary()+secTraits()+secLog()+
    (isCompact()?`<div class="bd-mark">${brandHTML()}</div>`:'');
  /* stopPropagation, not just the #bd-detail guard on the board listener: this handler
     replaces the panel's innerHTML, so by the time the click bubbles up the button is
     detached and closest() can no longer tell the board the click came from inside */
  const activateTab=(b,e)=>{
    const k=b.dataset.t; e.stopPropagation(); d.dataset.tab=k; detailSync();
    const nb=d.querySelector(`.bd-tab[data-t="${k}"]`); if(nb)nb.focus();
  };
  d.querySelectorAll('.bd-tab').forEach(b=>b.onclick=e=>activateTab(b,e));
  d.querySelectorAll('.bd-tab').forEach(b=>b.onkeydown=e=>{
    if(e.key!=='Enter'&&e.key!==' ')return;
    e.preventDefault(); activateTab(b,e); });
  d.scrollTop=sc;
  /* a board() refresh must not yank the 逐年 list back to the player's rookie year */
  const y=d.querySelector('.sec-y'); if(y&&yTop!=null)y.scrollTop=yTop;
}
function detailToggle(){
  const bd=$('board'),btn=$('bd-more'),d=$('bd-detail'); if(!bd||!btn||!d)return;
  const open=!bd.classList.contains('detail-open');
  bd.classList.toggle('detail-open',open);
  btn.setAttribute('aria-expanded',String(open));
  if(!open){ d.innerHTML=''; return; } /* collapsed keeps no stale DOM to re-measure */
  detailSync();
  /* open on the season just played; no-op where 逐年 is not the element that scrolls */
  const y=d.querySelector('.sec-y'); if(y)y.scrollTop=y.scrollHeight;
}
if(typeof document!=='undefined'){
  const more=document.getElementById('bd-more');
  if(more)more.onclick=e=>{ e.stopPropagation(); detailToggle(); };
  /* Compact bar: the whole thing is the toggle (8B). The hamburger, the panel itself and the
     year strip are live controls inside it, so a click that started there is not a bar tap. */
  const bd=document.getElementById('board');
  if(bd)bd.addEventListener('click',function(e){
    if(!isCompact())return;
    const t=e.target;
    /* a target that is no longer in the document was removed by its own handler, which means
       something inside the bar already answered this click */
    if(t.isConnected===false)return;
    /* 生涯薪 cell has its own tap (reveal the exact amount), the hamburger opens the menu,
       the panel and the year strip are live controls: none of them are a tap on the bar */
    if(t.closest&&t.closest('#btn-menu,#bd-detail,#tl-strip,#bd-sal-cell'))return;
    detailToggle();
  });
}
