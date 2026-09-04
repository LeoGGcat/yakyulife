import {S} from '../core/state.js?v=1.5.12';
import {SEED} from '../core/rng.js?v=1.5.12';
import {APP_VER, OFFICIAL_HOST} from '../config.js?v=1.5.12';
import {TEAM_COLOR, LG_N} from '../data/teams.js?v=1.5.12';
import {RP_TICKS} from '../data/economy.js?v=1.5.12';
import {TRAIT_KEYS} from '../data/traits.js?v=1.5.12';
import {$, teamChip, modalOpen, modalClose} from './dom.js?v=1.5.12';
import {THEME_NAMES} from './prefs.js?v=1.5.12';
import {traitNames, traitColorRank} from './traits.js?v=1.5.12';
import {fmtMoney} from '../engine/contract.js?v=1.5.12';
import {rpTagline, rpFamily, RP_F3, RP_F2, rpCumData, rpIntlData, rpHonorItems, rpOrgOf, rpProData, rpSalaryData, championshipYear} from './retire.js?v=1.5.12';
/* 結算圖（Canvas 產生 PNG，回傳 data URL 供面板顯示與儲存）
   Single-sheet settlement layout from the design handoff, drawn 1:1 at the
   design's 820px width. The layout is rendered twice: a measure pass on a
   throwaway canvas walks the full flow to learn the total height, then the
   real pass paints background, border, content and footer. Presentation is
   shareImageSheet()'s job — this only returns the encoded image. */
/* The palette lives on body[data-theme], so reading another theme's tokens means wearing
   it for a moment. Attribute swap + getComputedStyle + restore all happen in one
   synchronous block: the style recalc is forced, but no paint can land in between, so
   the page never flashes. applyTheme() is deliberately not used — it would persist the
   theme to localStorage and repoint the wordmark. */
export function readTheme(t){
  const b=document.body, had=b.hasAttribute('data-theme'), prev=b.dataset.theme;
  if(t)b.dataset.theme=t;
  const cs=getComputedStyle(b), tk=(n,fb)=>((cs.getPropertyValue(n)||'').trim()||fb);
  const p={
    bg:tk('--bg','#081510'), edge:tk('--edge','#2b4d3a'), dim:tk('--dim','#93ab9c'),
    accent:tk('--accent','#ffc95c'), text:tk('--text','#ece7d6'), good:tk('--good','#8fd08f'),
    bad:tk('--bad','#e2695c'), info:tk('--info','#7fb3d5'), panel2:tk('--panel2','#1a382a'),
    panel:tk('--panel','#132920'), row:tk('--row','#0d2115'), gold:tk('--gold','#ffc95c'),
    sans:tk('--sans',"'Noto Sans TC',sans-serif"), mono:tk('--mono',"'IBM Plex Mono',monospace")};
  p.btnedge=tk('--btnedge',p.edge);
  p.head=tk('--head',p.sans);
  p.glow=tk('--glow','none')!=='none';
  p.glowC=(tk('--bgfx','none').match(/rgba?\([^)]*\)/)||[])[0]||null;
  if(t){ if(had)b.dataset.theme=prev; else b.removeAttribute('data-theme'); }
  return p;
}
export function renderShareImage(evals,picks,opt){
  opt=opt||{};
  const mode=['stats','salary','ending'].includes(opt.mode)?opt.mode:'stats';
  const isP=S.pos==='P';
  const tiers=(evals||[]).map(t=>String(t).replace(/<[^>]+>/g,''));
  const hist=S.log.slice(), amaLogs=hist.filter(r=>!r.st), proLogs=hist.filter(r=>r.st);
  const cum=rpCumData(), honors=rpHonorItems();
  const pro=proLogs.length?rpProData(proLogs):null;
  const salary=proLogs.length?rpSalaryData(proLogs):null;
  const intl=S.intlCount>0?rpIntlData():null;
  const fans=(picks||[]).map(p=>'「'+p.replace(/{n}/g,S.name)+'」');
  const showFans=(mode==='ending'||opt.fans===true)&&fans.length>0;
  const ending=opt.ending||{title:'引退之後',body:'這段棒球人生，已經走到終點。'};
  const W=820,PADX=36,CW=W-PADX*2,scale=2;
  /* Canvas colors/fonts follow the theme the player picked for the image, which is not
     necessarily the one the page is wearing (opt.theme omitted = the active one). */
  const P=readTheme(opt.theme);
  const C_BG=P.bg, C_EDGE=P.edge, C_DIM=P.dim, C_ACC=P.accent, C_TX=P.text, C_GOOD=P.good,
        C_BAD=P.bad, C_INFO=P.info, C_P2=P.panel2, C_PANEL=P.panel, C_ROW=P.row, C_GOLD=P.gold,
        C_BTNEDGE=P.btnedge;
  const F_SANS=P.sans, F_MONO=P.mono, F_HEAD=P.head;
  const GLOW=P.glow, glowC=P.glowC;
  const LGC={MLB:C_INFO,NPB:C_BAD,CPBL:C_ACC,MINOR:C_DIM};
  /* 特性(保留 + 刪除線標記；依顏色分類排序，避免同色特性東插一個西插一個) */
  const keepTr=[...TRAIT_KEYS.pos,...TRAIT_KEYS.neg].filter(k=>S.traits[k]).sort((a,b)=>traitColorRank(a)-traitColorRank(b)).flatMap(k=>
    traitNames(k).map(label=>({label,key:k,neg:TRAIT_KEYS.neg.includes(k)})));
  const remTr=(S.removed||[]).map(l=>({label:l,key:'',neg:false,rem:true}));
  function tagColor(o){ /* keep in sync with traitTagStyle() + the .tag defaults */
    if(o.rem)return {bg:'#242424',bd:'#4a4a4a',fg:'#8a8a8a'};
    if(o.key==='legend'||o.key==='taiwan'||o.key==='intlace'||o.key==='pitcherTC'||o.key==='hitterTC')return {bg:'#3a2c05',bd:'#ffc95c',fg:'#ffe08a'}; /* 金 */
    if(o.key==='goldcloth')return {bg:'#3a3505',bd:'#e8d43a',fg:'#fff35a'}; /* 黃 */
    if(o.key==='mrteam')return teamChip(TEAM_COLOR[S.mrTeamName]||'#ffc95c');
    if(o.key==='genius'||o.key==='disc'||o.key==='clutch'||o.key==='favorite')return {bg:'#232733',bd:'#c8d0e0',fg:'#e8eef7'}; /* 銀 */
    if(o.neg)return {bg:'#2a0f0f',bd:'#c0392b',fg:'#ff8b7a'};             /* 紅 */
    return {bg:C_P2,bd:C_EDGE,fg:C_ACC};                                  /* 主題色 */
  }
  function rr(c,x,y,w,h,r){ c.beginPath();
    c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath(); }
  function drawBall(c,cx,cy,d){ /* stylized baseball, 24-box geometry scaled to d */
    const k=d/24, X=x=>cx-d/2+x*k, Y=y=>cy-d/2+y*k;
    c.save();
    c.beginPath(); c.arc(cx,cy,d/2-k*.5,0,Math.PI*2);
    c.fillStyle='#faf7ee'; c.fill();
    /* ring rides --text so the white face keeps its outline on light themes too */
    c.save(); c.globalAlpha=.55; c.lineWidth=Math.max(1,1.6*k); c.strokeStyle=C_TX; c.stroke(); c.restore();
    c.lineCap='round'; c.strokeStyle=C_BAD;
    c.lineWidth=1.5*k; c.beginPath();
    c.moveTo(X(7.6),Y(1.9)); c.quadraticCurveTo(X(2.6),Y(12),X(7.6),Y(22.1));
    c.moveTo(X(16.4),Y(1.9)); c.quadraticCurveTo(X(21.4),Y(12),X(16.4),Y(22.1)); c.stroke();
    c.lineWidth=1.1*k; c.beginPath();
    RP_TICKS.forEach(p=>{ c.moveTo(X(p[0]),Y(p[1])); c.lineTo(X(p[2]),Y(p[3]));
      c.moveTo(X(24-p[0]),Y(p[1])); c.lineTo(X(24-p[2]),Y(p[3])); });
    c.stroke(); c.restore(); }
  function wrap(c,t,font,maxW){ c.font=font; const out=[]; let cur='';
    for(const ch of String(t)){ if(c.measureText(cur+ch).width>maxW&&cur){ out.push(cur); cur=ch; } else cur+=ch; }
    if(cur)out.push(cur); return out; }
  function render(c){
    let y=32;
    const ls=v=>{ try{c.letterSpacing=v;}catch(e){} };
    /* All text is anchored on the alphabetic baseline: 'top'/'middle' derive from the
       font bounding box, which Safari and Chrome compute differently, so device renders
       drifted vertically. mid() centers a string on cy using its measured ink box. */
    c.textBaseline='alphabetic'; c.textAlign='left'; c.lineJoin='round';
    const mid=(t,x,cy)=>{ const m=c.measureText(t), a=m.actualBoundingBoxAscent, d=m.actualBoundingBoxDescent;
      c.fillText(t,x,cy+((a!=null?a:8)-(d!=null?d:0))/2); };
    /* ---- 刊頭 lockup (main text, sub and ball share one baseline) ---- */
    const wmBase=y+25;
    c.font='900 32px '+F_HEAD; c.fillStyle=C_TX; ls('1.3px');
    const w1=c.measureText('YaKy').width;
    c.fillText('YaKy',PADX,wmBase);
    drawBall(c,PADX+w1+11.5,wmBase-9,21);
    c.fillText('Life',PADX+w1+23,wmBase);
    const wmW=w1+23+c.measureText('Life').width;
    ls('0px');
    c.font='13px '+F_SANS; c.fillStyle=C_DIM; ls('3.6px');
    c.fillText('棒球人生模擬器',PADX+wmW+12,wmBase); ls('0px');
    /* 引退紀念鋼印章 */
    c.font='700 12px '+F_SANS; ls('3.6px');
    const stT='引退紀念', stW=c.measureText(stT).width+21, stH=27, stX=W-PADX-stW;
    if(GLOW){ c.save(); c.shadowColor=C_ACC; c.shadowBlur=12; }
    c.strokeStyle=C_ACC; c.lineWidth=1.5; rr(c,stX,y,stW,stH,3); c.stroke();
    if(GLOW)c.restore();
    c.fillStyle=C_ACC; mid(stT,stX+13,y+stH/2); ls('0px');
    y+=54;
    /* ---- 球員名＋背號牌 (badge digits sit on the name baseline) ---- */
    const nameBase=y+35;
    c.font='900 44px '+F_HEAD; c.fillStyle=C_ACC;
    const wN=c.measureText(S.name).width;
    c.fillText(S.name,PADX,nameBase);
    c.font='700 31px '+F_MONO;
    const jT='#'+S.jersey, jW=c.measureText(jT).width+18, bCy=nameBase-11;
    c.fillStyle=C_ACC; rr(c,PADX+wN+12,bCy-19,jW,38,5); c.fill();
    c.fillStyle=C_BG; mid(jT,PADX+wN+21,bCy);
    y+=52;
    /* ---- 副標 ---- */
    c.font='15px '+F_SANS; c.fillStyle=C_TX; mid(rpTagline(),PADX,y+11); y+=27;
    /* ---- 特質標籤＋家庭＋總薪資 ---- */
    const salW=210, leftW=CW-salW-20;
    if(keepTr.length||remTr.length){
      let tx=PADX; c.font='700 13px '+F_SANS;
      keepTr.concat(remTr).forEach(o=>{ const col=tagColor(o), w=c.measureText(o.label).width+20;
        if(tx>PADX&&tx+w>PADX+leftW){ tx=PADX; y+=32; }
        c.fillStyle=col.bg; rr(c,tx,y,w,24,3); c.fill();
        c.strokeStyle=col.bd; c.lineWidth=1; rr(c,tx,y,w,24,3); c.stroke();
        c.fillStyle=col.fg; mid(o.label,tx+10,y+12);
        if(o.rem){ c.strokeStyle='#8a8a8a'; c.beginPath(); c.moveTo(tx+6,y+12); c.lineTo(tx+w-6,y+12); c.stroke(); }
        tx+=w+8; });
      y+=34;
    }
    const famLines=wrap(c,rpFamily(),'12.5px '+F_SANS,leftW);
    c.font='12.5px '+F_SANS; c.fillStyle=C_DIM;
    famLines.forEach(l=>{ mid(l,PADX,y+9); y+=19; });
    { /* 生涯總薪資(右下,金額與「台幣」共用基線,與家庭行底對齊) */
      const salBase=y-6;
      c.textAlign='right';
      c.font='12px '+F_SANS; c.fillStyle=C_DIM;
      const uW=c.measureText('台幣').width;
      c.fillText('台幣',W-PADX,salBase);
      c.fillText('生涯總薪資',W-PADX,salBase-30);
      c.font='700 24px '+F_MONO; c.fillStyle=C_ACC;
      if(GLOW){ c.save(); c.shadowColor=C_ACC; c.shadowBlur=10; }
      c.fillText(fmtMoney(Math.round(S.salary)),W-PADX-uW-6,salBase);
      if(GLOW)c.restore();
      c.textAlign='left';
    }
    /* ---- 生涯評價 ---- */
    if(mode==='stats'&&tiers.length){
      y+=18; c.strokeStyle=C_EDGE; c.lineWidth=1;
      c.beginPath(); c.moveTo(PADX,y+.5); c.lineTo(W-PADX,y+.5); c.stroke();
      y+=16;
    }
    const sec=(t,inline)=>{ if(!inline)y+=24;
      drawBall(c,PADX+6,y+6,12);
      c.font='700 12px '+F_SANS; c.fillStyle=C_DIM; ls('3px');
      const tw=c.measureText(t).width;
      mid(t,PADX+20,y+6); ls('0px');
      c.strokeStyle=C_EDGE; c.lineWidth=1; c.beginPath();
      c.moveTo(PADX+20+tw+8,y+6.5); c.lineTo(W-PADX,y+6.5); c.stroke();
      y+=22; };
    if(mode==='stats'&&tiers.length){
      sec('生涯評價',true);
      tiers.forEach(t=>{ drawBall(c,PADX+8.5,y+11,17);
        c.font='700 16px '+F_SANS; c.fillStyle=C_ACC; mid(t,PADX+26,y+11); y+=24; });
    }
    /* ---- 表格繪製共用 ---- */
    function tcols(defs){ const tot=defs.reduce((a,d)=>a+d.w,0); let x=PADX;
      return defs.map(d=>{ const w=d.w/tot*CW, o={t:d.t,a:d.a,zh:d.zh,x,w}; x+=w; return o; }); }
    function thRow(cols){
      cols.forEach(cc=>{ c.font='500 12px '+(cc.zh?F_SANS:F_MONO); c.fillStyle=C_DIM;
        c.textAlign=cc.a==='l'?'left':'right';
        mid(cc.t,cc.a==='l'?cc.x+7:cc.x+cc.w-7,y+9); });
      c.textAlign='left'; y+=22;
      c.strokeStyle=C_EDGE; c.lineWidth=1; c.beginPath(); c.moveTo(PADX,y-.5); c.lineTo(W-PADX,y-.5); c.stroke(); }
    function tdRow(cols,cells,opt){
      opt=opt||{}; const rh=opt.rh||25, fs=opt.fs||12.5;
      if(opt.bg){ c.fillStyle=opt.bg; c.fillRect(PADX,y,CW,rh); }
      if(opt.topline){ c.strokeStyle=C_EDGE; c.lineWidth=1; c.beginPath(); c.moveTo(PADX,y+.5); c.lineTo(W-PADX,y+.5); c.stroke(); }
      if(opt.bar){ c.fillStyle=opt.bar; c.fillRect(PADX,y,3,rh); }
      const cyR=y+rh/2;
      cells.forEach((cell,i)=>{ if(cell==null)return; const cc=cols[i];
        const o=(cell&&typeof cell==='object')?cell:{t:cell};
        if(o.crown){
          const x=cc.x+6, top=cyR-3;
          c.save(); c.fillStyle=C_GOLD; c.beginPath(); c.moveTo(x,top+1);
          c.lineTo(x+2,top+3.5); c.lineTo(x+4,top); c.lineTo(x+6,top+3.5);
          c.lineTo(x+8,top+1); c.lineTo(x+7.2,top+6); c.lineTo(x+.8,top+6);
          c.closePath(); c.fill(); c.restore();
        }
        if(o.badge!==undefined){ /* 國際賽結果膠囊 badge */
          c.font='700 11.5px '+F_SANS;
          const bw=c.measureText(String(o.t)).width+16, bx=cc.x+7, bh=19, byy=y+(rh-bh)/2;
          let fg=C_DIM, bd=C_BTNEDGE;
          if(o.badge==='gold'){ fg=C_GOLD; bd=C_GOLD;
            c.save(); c.globalAlpha=.12; c.fillStyle=C_GOLD; rr(c,bx,byy,bw,bh,3); c.fill(); c.restore(); }
          else if(o.badge==='silver'){ fg='#e8eef7'; bd='#c8d0e0';
            c.fillStyle='#232733'; rr(c,bx,byy,bw,bh,3); c.fill(); }
          c.strokeStyle=bd; c.lineWidth=1; rr(c,bx,byy,bw,bh,3); c.stroke();
          c.fillStyle=fg; mid(String(o.t),bx+8,cyR); return; }
        c.font=(o.best||o.bold||opt.bold?'700 ':'')+fs+'px '+((cc.zh||o.zh)?F_SANS:F_MONO);
        c.fillStyle=o.best?C_ACC:(o.color||opt.color||C_TX);
        c.textAlign=cc.a==='l'?'left':'right';
        let t=String(o.t); const crownPad=o.year?9:0, maxw=cc.w-12-crownPad;
        while(c.measureText(t).width>maxw&&t.length>1)t=t.slice(0,-1);
        mid(t,cc.a==='l'?cc.x+7+crownPad:cc.x+cc.w-7,cyR); });
      c.textAlign='left'; y+=rh; }
    if(mode==='stats'){
    /* ---- 生涯累積數據 ---- */
    sec('生涯累積數據');
    if(cum.rows.length){
      /* PA 可能跨到五位數；不能依賴 IBM Plex Mono 剛好塞進窄欄，否則字型載入失敗
         回退到較寬的系統等寬字時，10000 會被共用截字邏輯畫成 1000。 */
      const wide={IP:1,PA:1,ERA:1,WHIP:1,AVG:1,OBP:1,SLG:1,OPS:1};
      const cols=tcols([{t:'League',w:84,a:'l'}].concat(cum.hd.map(t=>({t,w:wide[t]?58:46,a:'r'}))));
      thRow(cols);
      cum.rows.forEach((r,i)=>{ tdRow(cols,
        [{t:LG_N[r.b],zh:true,bold:true}].concat(r.txt.map((t,j)=>({t,best:r.best[j]}))),
        {bg:i%2?C_ROW:null,bar:LGC[r.b]}); });
    } else { c.font='13px '+F_SANS; c.fillStyle=C_DIM; mid('（無職業層級出賽紀錄）',PADX,y+9); y+=22; }
    /* ---- 國際賽逐屆成績 ---- */
    if(intl){
      sec('國際賽逐屆成績（中華隊 '+S.intlCount+' 屆）');
      const cols=tcols([{t:'年度',w:56,a:'l'},{t:'賽事',w:140,a:'l',zh:true},{t:'結果',w:96,a:'l',zh:true}]
        .concat(intl.hd.map(t=>({t,w:56,a:'r'}))));
      thRow(cols);
      intl.rows.forEach((r,i)=>{ tdRow(cols,
        [{t:r.year,year:true,crown:r.rank==='冠軍'},{t:r.name,zh:true},{t:r.rank,badge:/冠軍/.test(r.rank)?'gold':/亞軍/.test(r.rank)?'silver':''}]
          .concat(r.txt),{bg:i%2?C_ROW:null,rh:28}); });
      tdRow(cols,[{t:'通算',zh:true,bold:true,color:C_GOOD},null,null].concat(intl.tot.map(t=>({t,bold:true}))),
        {bg:C_PANEL,topline:true,rh:28});
    }
    /* ---- 生涯榮譽(雙欄條列,直向優先) ---- */
    sec('生涯榮譽（'+honors.length+' 項）');
    if(honors.length){
      const colW=(CW-28)/2, rows2=Math.ceil(honors.length/2), lh=22, fs=13.5;
      const drawItem=(parts,x,yy)=>{ let cx=x;
        const put=(txt,acc)=>{ c.font=(acc?'700 ':'')+fs+'px '+F_SANS; c.fillStyle=acc?C_ACC:C_GOOD;
          for(const ch of txt){ const w=c.measureText(ch).width;
            if(cx+w>x+colW&&cx>x){ yy+=lh; cx=x+12; }
            c.fillText(ch,cx,yy+16); cx+=w; } };
        parts.forEach((p,i)=>put((i?'':'· ')+p[0],p[1]));
        return yy+lh; };
      let yl=y, yr=y;
      honors.forEach((p,i)=>{ if(i<rows2)yl=drawItem(p,PADX,yl); else yr=drawItem(p,PADX+colW+28,yr); });
      y=Math.max(yl,yr);
    } else { c.font='13px '+F_SANS; c.fillStyle=C_DIM; mid('（生涯未獲得任何獎項或里程碑）',PADX,y+9); y+=22; }
    /* ---- 生涯年表(業餘) ---- */
    if(amaLogs.length){
      sec('生涯年表（業餘成績）');
      const cols=tcols([{t:'年',w:50,a:'l'},{t:'齡',w:38,a:'r'},{t:'球隊',w:110,a:'l',zh:true},{t:'成績',w:550,a:'l',zh:true}]);
      thRow(cols);
      amaLogs.forEach((r,i)=>{ tdRow(cols,
        [{t:r.y,year:true,crown:championshipYear(r.y)},r.age,{t:r.tm,zh:true},{t:r.line,zh:true,color:r.inj?null:C_DIM}],
        {bg:i%2?C_ROW:null,rh:21,fs:12,color:r.inj?C_BAD:null,bold:r.inj}); });
    }
    /* ---- 生涯年表(職業,按球隊分段) ---- */
    if(pro){
      sec('生涯年表（職業成績）');
      const defs=isP
        ?[{t:'年',w:48,a:'l'},{t:'齡',w:34,a:'r'},{t:'球隊',w:96,a:'l',zh:true},{t:'G',w:40,a:'r'},{t:'IP',w:54,a:'r'},{t:'W-L',w:50,a:'r'},{t:'SV',w:42,a:'r'},{t:'HLD',w:46,a:'r'},{t:'SO',w:44,a:'r'},{t:'BB',w:42,a:'r'},{t:'ERA',w:52,a:'r'},{t:'WHIP',w:54,a:'r'}]
        :[{t:'年',w:48,a:'l'},{t:'齡',w:34,a:'r'},{t:'球隊',w:84,a:'l',zh:true},{t:'G',w:38,a:'r'},{t:'PA',w:44,a:'r'},{t:'AVG',w:50,a:'r'},{t:'OBP',w:50,a:'r'},{t:'SLG',w:50,a:'r'},{t:'OPS',w:50,a:'r'},{t:'H',w:38,a:'r'},{t:'HR',w:38,a:'r'},{t:'RBI',w:42,a:'r'},{t:'BB',w:36,a:'r'},{t:'SB',w:36,a:'r'},{t:'DEF',w:42,a:'r'}];
      const cols=tcols(defs); thRow(cols);
      pro.blocks.forEach(b=>{
        y+=6; c.font='700 11px '+F_SANS; c.fillStyle=LGC[b.lg]||C_DIM; ls('2.2px');
        mid((LG_N[b.lg]||'')+' · '+b.team,PADX+7,y+6); ls('0px'); y+=19;
        b.rows.forEach((r,i)=>{ tdRow(cols,
          [{t:r.y,year:true,crown:r.champ},r.age,{t:r.lvl,zh:true,color:r.inj?null:(r.minor?C_DIM:null)}]
            .concat(r.txt.map((t,j)=>({t,best:r.best[j]}))),
          {bg:i%2?C_ROW:null,rh:21,fs:12,color:r.inj?C_BAD:null,bold:r.inj}); });
      });
    }
    }else if(mode==='salary'){
      /* ---- 生涯合約薪資與當季表現 ---- */
      sec('生涯合約薪資與成績');
      if(salary&&salary.rows.length){
        const defs=isP
          ?[{t:'年',w:48,a:'l'},{t:'齡',w:34,a:'r'},{t:'球隊／層級',w:150,a:'l',zh:true},{t:'年薪',w:108,a:'r',zh:true},{t:'G',w:45,a:'r'},{t:'IP',w:60,a:'r'},{t:'W-L',w:55,a:'r'},{t:'SV',w:45,a:'r'},{t:'ERA',w:55,a:'r'}]
          :[{t:'年',w:48,a:'l'},{t:'齡',w:34,a:'r'},{t:'球隊／層級',w:150,a:'l',zh:true},{t:'年薪',w:108,a:'r',zh:true},{t:'G',w:45,a:'r'},{t:'PA',w:55,a:'r'},{t:'AVG',w:55,a:'r'},{t:'HR',w:45,a:'r'},{t:'RBI',w:48,a:'r'},{t:'OPS',w:55,a:'r'}];
        const cols=tcols(defs); thRow(cols);
        salary.rows.forEach((r,i)=>{
          /* 合約起始年之前插一條說明帶：這幾年是同一份合約，總額一次講清楚 */
          if(r.contract){
            const ct=r.contract;
            c.fillStyle=C_ROW; c.fillRect(PADX,y,CW,20);
            c.fillStyle=C_ACC; c.fillRect(PADX,y,3,20);
            c.font='700 11.5px '+F_SANS; c.fillStyle=C_ACC;
            mid(ct.annual!=null?`合約　${ct.yrs} 年 × ${fmtMoney(ct.annual)}`
                              :`合約　${ct.yrs} 年`,PADX+10,y+10);
            c.font='500 11.5px '+F_SANS; c.fillStyle=C_DIM; c.textAlign='right';
            mid(`總額 ${fmtMoney(ct.total)}`,W-PADX-7,y+10);
            c.textAlign='left'; y+=20;
          }
          tdRow(cols,
          [{t:r.y,year:true},r.age,{t:r.team+'·'+r.lvl,zh:true}].concat(r.txt.map((t,j)=>({t,zh:j===0}))),
          {bg:i%2?C_ROW:null,rh:23,fs:12,color:r.inj?C_BAD:null,bold:r.inj}); });
      }else{
        c.font='13px '+F_SANS; c.fillStyle=C_DIM; mid('（無職業合約與成績紀錄）',PADX,y+9); y+=22;
      }
    }else{
      /* ---- 引退結局 ---- */
      sec('引退結局 · 〈'+String(ending.title||'引退之後')+'〉');
      const holder=document.createElement('div');
      String(ending.body||'').split(/<br\s*\/?\s*>/i).forEach(raw=>{
        holder.innerHTML=raw; const paragraph=(holder.textContent||'').trim();
        if(!paragraph){ y+=8; return; }
        const lines=wrap(c,paragraph,'14px '+F_SANS,CW-14);
        c.font='14px '+F_SANS; c.fillStyle=C_TX;
        lines.forEach(l=>{ c.fillText(l,PADX+7,y+17); y+=24; });
        y+=5;
      });
    }
    /* ---- 球迷看板・引退串 ---- */
    if(showFans){
      sec('球迷看板 · 引退串');
      fans.forEach(t=>{ const lines=wrap(c,t,'13px '+F_SANS,CW-14), top=y;
        c.font='13px '+F_SANS; c.fillStyle=C_TX;
        lines.forEach(l=>{ c.fillText(l,PADX+14,y+15); y+=21; });
        c.fillStyle=C_EDGE; c.fillRect(PADX,top+2,2,y-top-6);
        y+=8; });
    }
    return y;
  }
  /* measure pass on a throwaway canvas, then paint for real */
  const mc=document.createElement('canvas'); mc.width=8; mc.height=8;
  const yEnd=render(mc.getContext('2d'));
  const H=yEnd+26+44;
  const cv=document.createElement('canvas');
  cv.width=W*scale; cv.height=H*scale;
  const c=cv.getContext('2d'); c.scale(scale,scale);
  c.fillStyle=C_BG; c.fillRect(0,0,W,H);
  if(glowC){ /* 頂部 radial 光暈(以主題 --bgfx 的顏色近似橢圓) */
    c.save(); c.translate(W/2,-30); c.scale(1,.35);
    const g=c.createRadialGradient(0,0,0,0,0,W*.72);
    g.addColorStop(0,glowC); g.addColorStop(1,'rgba(0,0,0,0)');
    c.fillStyle=g; c.fillRect(-W/2,0,W,W); c.restore(); }
  c.strokeStyle=C_EDGE; c.lineWidth=1; rr(c,.5,.5,W-1,H-1,10); c.stroke();
  const fy=render(c)+26;
  /* ---- 三欄頁尾 ---- */
  c.strokeStyle=C_EDGE; c.lineWidth=1; c.beginPath(); c.moveTo(PADX,fy+.5); c.lineTo(W-PADX,fy+.5); c.stroke();
  c.font='12px '+F_MONO; c.textBaseline='alphabetic';
  c.fillStyle=C_DIM; c.textAlign='left'; c.fillText('seed: '+SEED,PADX,fy+23.5);
  c.textAlign='right'; c.fillText(APP_VER,W-PADX,fy+23.5);
  c.fillStyle=C_ACC; c.textAlign='center'; c.fillText(OFFICIAL_HOST,W/2,fy+23.5);
  c.textAlign='left';
  const url=cv.toDataURL('image/png');
  /* the PNG is encoded; drop the ~17MB backing bitmap rather than wait for GC, since a
     player comparing themes can ask for several of these in a row on a phone */
  cv.width=cv.height=0;
  return url;
}

/* Webfonts are fetched only when the page actually paints with them, so a player sitting
   in 深綠記分板 who asks for 報紙版面 would get the canvas silently falling back to
   sans-serif. Warm the target theme's families first; the race caps a slow network so the
   panel can never hang, at the cost of one fallback render in that rare case. */
function ensureFonts(P){
  if(!document.fonts||!document.fonts.load)return Promise.resolve();
  const jobs=[];
  [P.head,P.sans,P.mono].forEach(f=>[400,500,700,900].forEach(w=>{
    try{ jobs.push(document.fonts.load(w+' 16px '+f)); }catch(e){} }));
  return Promise.race([Promise.all(jobs).catch(()=>{}), new Promise(r=>setTimeout(r,2500))]);
}
function download(url,fileName){ const a=document.createElement('a'); a.href=url; a.download=fileName;
  document.body.appendChild(a); a.click(); a.remove(); }
/* 三種圖表內容各存成不同檔名，一次下載三張才不會互相覆蓋。 */
export const SH_MODE_SUFFIX={stats:'_stats',salary:'_salary',ending:'_ending'};
export function shareImageFileName(name=S.name,seed=SEED,mode){
  const safe=value=>String(value??'').trim().replace(/[\\/:*?"<>|]/g,'_').slice(0,64)||'unknown';
  const suffix=SH_MODE_SUFFIX[mode]||'';
  return `棒球生涯結算_${safe(name)}_${safe(seed)}${suffix}.png`;
}
const SH_THEMES=['a','b','c','d'];
/* Options survive re-opening the panel; the rendered PNGs are kept too, so flipping back to
   a theme already seen is instant. The whole space is 4 themes x 3, and each entry is a
   base64 string rather than a live bitmap, so the ceiling is small enough to leave uncapped.
   Neither is persisted: a career settles once, and the next run should start from whatever
   theme that player is actually looking at. */
let shOpt=null;
let shCareerKey=null;
const shCache=new Map();
/* 結算圖面板：開啟即以目前佈景畫好，換主題或內容版型都在原地重畫 */
export function shareImageSheet(evals,picks,ending){
  const careerKey=SEED+'|'+S.name+'|'+S.year;
  if(!shOpt||shCareerKey!==careerKey){
    shCareerKey=careerKey; shOpt={theme:document.body.dataset.theme||'a',mode:'stats'}; shCache.clear();
  }
  const st=shOpt;
  /* 檔名隨當前圖表內容變動，所以是函式而不是開面板時就固定的字串 */
  const fileName=()=>shareImageFileName(S.name,SEED,st.mode);
  const key=()=>st.theme+'|'+st.mode;
  const cur=()=>shCache.get(key());
  /* One scroll surface only: the box is a flex column whose middle section scrolls, so the
     preview never becomes a scroller nested inside another one. The actions sit in a pinned
     footer instead of at the end of the scroll, which is what keeps 儲存 reachable while the
     expanded image runs past the viewport. */
  modalOpen(`<div class="sh-head"><h3>結算圖</h3><button class="sh-x" id="sh-x" aria-label="關閉"><i class="ph-bold ph-x" aria-hidden="true"></i></button></div>
    <div class="sh-body">
      <div class="sh-frame clip busy" id="sh-frame">
        <img id="sh-pic" alt="結算圖">
        <div class="sh-wait">產生中…</div>
        <div class="sh-more" id="sh-more">點圖展開</div>
      </div>
      <div class="sh-lab">佈景主題</div>
      <div class="seg two sh-seg" id="sh-seg">${SH_THEMES.map(t=>{ const p=readTheme(t);
        return `<button data-st="${t}" style="background:${p.bg};color:${p.text}">`+
          `<span class="sh-sw" style="background:${p.accent}"></span><span class="sh-nm"></span></button>`; }).join('')}</div>
      <div class="sh-lab">圖表內容</div>
      <div class="sh-mode" id="sh-mode">
        <button class="btn" data-sm="stats">成績年表</button>
        <button class="btn" data-sm="salary">合約與成績</button>
        <button class="btn" data-sm="ending">結局與留言</button>
      </div>
    </div>
    <div class="sh-foot">
      <button class="btn main" id="sh-save"><i class="ph-fill ph-share-network" aria-hidden="true"></i>儲存 / 分享圖片</button>
      <div class="sh-row"><button class="btn" id="sh-dl"><i class="ph-bold ph-download-simple" aria-hidden="true"></i>下載到裝置</button><button class="btn" id="sh-close"><i class="ph-bold ph-x" aria-hidden="true"></i>關閉</button></div>
      <div class="sh-hint">若按鈕無效，長按上方圖片也可儲存</div>
    </div>`,'sh-sheet');
  const frame=$('sh-frame'), pic=$('sh-pic');
  /* every repaint is stamped: a tap landing while an older render is still awaiting fonts
     must not have its result overwrite the newer pick */
  let seq=0;
  const syncCtl=()=>{
    $('sh-seg').querySelectorAll('[data-st]').forEach(b=>{
      const p=readTheme(b.dataset.st), on=b.dataset.st===st.theme;
      b.style.borderColor=on?p.accent:p.edge;
      b.style.boxShadow=on?'0 0 0 2px '+p.accent:'none';
      b.querySelector('.sh-nm').textContent=THEME_NAMES[b.dataset.st]+(on?' ✓':'');
    });
    $('sh-mode').querySelectorAll('[data-sm]').forEach(b=>{
      const on=b.dataset.sm===st.mode; b.classList.toggle('main',on);
      b.setAttribute('aria-pressed',String(on));
    });
  };
  const paint=async()=>{
    syncCtl();
    const k=key(), my=++seq, hit=shCache.get(k);
    if(hit){ pic.src=hit; frame.classList.remove('busy'); return; }
    frame.classList.add('busy');
    await ensureFonts(readTheme(st.theme));
    /* yield a task so 產生中… actually paints before the render blocks the thread */
    await new Promise(r=>setTimeout(r,0));
    if(my!==seq)return;
    const url=renderShareImage(evals,picks,{theme:st.theme,mode:st.mode,ending});
    shCache.set(k,url);
    if(my!==seq)return;
    pic.src=url; frame.classList.remove('busy');
  };
  $('sh-seg').querySelectorAll('[data-st]').forEach(b=>b.onclick=()=>{
    if(st.theme===b.dataset.st)return; st.theme=b.dataset.st; paint(); });
  $('sh-mode').querySelectorAll('[data-sm]').forEach(b=>b.onclick=()=>{
    if(st.mode===b.dataset.sm)return; st.mode=b.dataset.sm; paint(); });
  const more=$('sh-more');
  frame.onclick=()=>{ if(frame.classList.contains('busy'))return;
    const clip=frame.classList.toggle('clip');
    more.textContent=clip?'點圖展開':'點圖收合'; };
  $('sh-close').onclick=modalClose;
  $('sh-x').onclick=modalClose;
  $('sh-dl').onclick=()=>{ const u=cur(); if(u)download(u,fileName()); };
  /* 分享:優先 Web Share(可存相簿),不支援則退回下載 */
  $('sh-save').onclick=async ()=>{
    const u=cur(); if(!u)return;
    try{
      const blob=await (await fetch(u)).blob();
      const file=new File([blob],fileName(),{type:'image/png'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){
        /* 只分享圖片本身：帶 title/text 會讓部分平台把文字一起貼進貼文或訊息，
           使用者要的是乾淨的一張圖。 */
        await navigator.share({files:[file]});
        return;
      }
    }catch(e){ if(e&&e.name==='AbortError')return; /* 使用者取消,不用退回 */ }
    download(u,fileName()); /* 不支援 Web Share → 退回下載 */
  };
  paint();
}
