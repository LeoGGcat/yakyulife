import {$, modalOpen, menuModal} from './dom.js?v=1.5.12';
import {allocPlace} from './alloc.js?v=1.5.12';

/* ================= 主題系統(純呈現層) ================= */
export const THEME_KEY='yakyu-theme';
export function applyTheme(t){
  if(t!=='a'&&t!=='b'&&t!=='c'&&t!=='d')t='a';
  document.body.dataset.theme=t;
  try{localStorage.setItem(THEME_KEY,t);}catch(e){}
  document.querySelectorAll('#seg-theme button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  /* Owner-provided final logo is a single stable asset shared by every theme. */
  const wm='assets/yakyolife-logo.svg';
  document.querySelectorAll('.wm-img').forEach(el=>{ if(el.getAttribute('src')!==wm)el.setAttribute('src',wm); });
  updDispSum();
  const m=document.querySelector('meta[name="theme-color"]');
  if(m)m.setAttribute('content',(getComputedStyle(document.body).getPropertyValue('--bg')||'#081510').trim());
}
export function applyMobileUI(on){
  document.body.classList.toggle('mobile-ui',!!on);
  try{localStorage.setItem('yakyu-mobile-ui',on?'1':'0');}catch(e){}
  document.querySelectorAll('#seg-ui button').forEach(b=>b.classList.toggle('on',(b.dataset.u==='1')===!!on));
  updDispSum();
  allocPlace(); /* switching layout mid-allocation must re-home the rows, not strand them */
}
/* The desktop layout is @media(min-width:921px) AND body:not(.mobile-ui). A phone fails
   the media query and never carries the class, so both halves have to be tested; checking
   the class alone would report "desktop" on every real phone. */
export const isMobileLayout=()=>!(matchMedia('(min-width:921px)').matches&&!document.body.classList.contains('mobile-ui'));
export const BIG_KEY='yakyu-big-text';
export function applyBigText(on){
  document.body.classList.toggle('big-text',!!on);
  try{localStorage.setItem(BIG_KEY,on?'1':'0');}catch(e){}
  document.querySelectorAll('#seg-big button').forEach(b=>b.classList.toggle('on',(b.dataset.b==='1')===!!on));
  updDispSum();
  allocPlace();
}
export const THEME_NAMES={a:'深綠記分板',b:'電子看板',c:'報紙版面',d:'現代儀表板'};
/* Keeps the collapsed 顯示設定 line reporting the current values, so the player never has to
   expand it just to find out what is set. Layout is left out on purpose: it is hidden below
   921px, and naming a setting that cannot be seen would be worse than saying nothing. */
export function updDispSum(){ const el=document.getElementById('disp-sum'); if(!el)return;
  const parts=[THEME_NAMES[document.body.dataset.theme||'a'],
    document.body.classList.contains('big-text')?'大字':'標準'];
  /* The layout row only exists at desktop width. Read its computed display instead of
     repeating the 921px breakpoint here, so the summary keeps listing exactly the settings
     the player can actually see even if that breakpoint ever moves. */
  const ui=document.getElementById('fld-ui');
  if(ui&&getComputedStyle(ui).display!=='none')
    parts.push(document.body.classList.contains('mobile-ui')?'手機版':'電腦版');
  el.textContent='\u3000'+parts.join(' · '); }
export function themeModal(){
  const cur=document.body.dataset.theme||'a';
  modalOpen('<h3>佈景主題</h3>'+['a','b','c','d'].map(t=>
    `<button class="btn${t===cur?' main':''}" data-mt="${t}" style="text-align:center">${THEME_NAMES[t]}${t===cur?' ✓':''}</button>`).join('')+
    `<button class="btn" id="md-back" style="text-align:center;margin-top:14px">返回選單</button>`);
  $('modal-box').querySelectorAll('[data-mt]').forEach(b=>b.onclick=()=>{ applyTheme(b.dataset.mt); themeModal(); });
  $('md-back').onclick=menuModal;
}
