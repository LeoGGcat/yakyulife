import {S} from '../core/state.js?v=1.5.12';
import {R, ri, chance, clamp} from '../core/rng.js?v=1.5.12';
import {ABL, POS_AB, DPN, DP_TH, DP_BAR, POS_ADJ_RUNS, DP_RANK} from '../data/abilities.js?v=1.5.12';
import {LV} from '../data/teams.js?v=1.5.12';
import {card, choose, board} from '../ui/dom.js?v=1.5.12';
import {roleN, pitcherRole, bullpenRole} from './season.js?v=1.5.12';
export function dpScore(p){ const a=S.ab;
  switch(p){
    case 'SS': return a.rng*0.5 + a.fld*0.3 + a.arm*0.2;   /* 游擊:範圍主導 */
    case '2B': return a.rng*0.45+ a.fld*0.4 + a.arm*0.15;  /* 二壘:範圍+守備,臂力次要 */
    case '3B': return a.arm*0.45+ a.fld*0.35+ a.rng*0.2;   /* 三壘:臂力主導 */
    case 'CF': return a.rng*0.55+ a.fld*0.3 + a.arm*0.15;  /* 中外野:範圍主導 */
    case 'RF': return a.arm*0.45+ a.rng*0.35+ a.fld*0.2;   /* 右外野:強臂 */
    case 'LF': return a.rng*0.4 + a.fld*0.35+ a.arm*0.25;  /* 左外野:範圍為主,要求低 */
    case 'C':  return a.fld*0.4 + a.cat*0.4 + a.arm*0.2;   /* 捕手:接球+配球+臂力,不看範圍 */
    case '1B': return a.fld*0.6 + a.rng*0.2 + a.arm*0.2;   /* 一壘:守備為主,門檻低 */
    default: return 99;
  }
}
export function posAdjLabel(p){ const v=POS_ADJ_RUNS[p]||0; return `薪資守位調整 ${v>0?'+':''}${v}／162 場`; }
export function dpBar(){ /* 年輕球員吃潛力紅利,球團不急著拔守位 */
  const base=DP_BAR[S.lv]||0;
  const disc=(S.age<=21?7:S.age<=24?5:S.age<=26?2:0)+(S.traits&&S.traits.favorite?3:0); /* 愛將:教練不急著拔你的守位 */
  return base-disc;
}
export function dpQual(p){
  if(p==='DH')return true;
  if(!DP_TH[p]||!DP_TH[p][S.lv])return true;   /* 非頂級聯盟不設限 */
  /* 年輕球員吃潛力紅利:門檻略降(球團給時間成長) */
  const youthAdj = (S.age<24?-3 : S.age<26?-1.5 : 0)+(S.traits&&S.traits.favorite?-3:0); /* 愛將:守位門檻永久紅利 */
  return dpScore(p) >= DP_TH[p][S.lv]+youthAdj;
}
export function dpList(){ /* 依守位難度掃描:內野手守內野序、外野手守外野序,選出守得動的(最高階在前) */
  /* 候選守位依當前守位群:內野走內野光譜、外野走外野光譜 */
  const order = S.pos==='IF'
    ? ['SS','2B','3B','1B']       /* 內野:游擊>二壘>三壘>一壘 */
    : ['CF','RF','LF','1B'];      /* 外野:中外野>右外野>左外野>(一壘) */
  const q=order.filter(dpQual); q.push('DH'); return q;
}
export function dposReview(cont){
  if(S.stage!=='PRO'||!(S.lv==='CPBL1'||S.lv==='NPB1'||S.lv==='MLB')){ cont(); return; }
  if(S.pos==='C'){ /* 捕手容忍度高,但爛到底也會被移去一壘或DH */
    if(!S.dpos)S.dpos='C';
    const cOk=()=>{ const bar=dpBar(), a=S.ab;
      return a.fld>=bar-6 && a.cat>=bar-4 && a.arm>=bar-2; };
    if(S.dpos==='C'){
      if(cOk()){ cont(); return; }
      const a=S.ab;
      /* 依接球、配球、臂力的當下能力值，顯示數值最低的一環。 */
      const issue=[['漏球',a.fld],['配球',a.cat],['阻殺率',a.arm]]
        .sort((x,y)=>x[1]-y[1])[0][0];
      const opts=[];
      if(dpQual('1B'))opts.push({t:'移防 一壘手',main:true,s:posAdjLabel('1B'),
        f:()=>{S.dpos='1B';card('info','守位調整','捕手裝備收進置物櫃——新球季改守<b class="hl">一壘</b>。');cont();}});
      opts.push({t:'轉任 指定打擊',main:!opts.length,s:posAdjLabel('DH'),
        f:()=>{S.dpos='DH';card('info','守位調整',`${issue}成了聯盟笑話，球團決定讓你專心打擊——<b class="hl">DH</b>。`);cont();}});
      choose(`守位會議：教練團已經不敢讓你蹲捕（${LV[S.lv].n}標準）`,opts); return;
    }
    if(cOk()){ /* 守備練回來了,可以回鍋蹲捕 */
      choose('守位會議：牛棚捕手回報你的接捕又行了',[
        {t:'重披捕手裝備',main:true,s:posAdjLabel('C'),
         f:()=>{S.dpos='C';card('good','守位調整','面罩戴回來——新球季重新登錄為<b class="hl">捕手</b>。');cont();}},
        {t:'維持現狀',f:()=>cont()}]); return; }
    if(S.dpos==='1B'&&!dpQual('1B')){ S.dpos='DH';
      card('info','守位調整','連一壘都站不住了，新球季登錄為<b class="hl">指定打擊</b>。'); }
    cont(); return; }
  if(S.pos==='P'){ /* 體力決定投手類型;牛棚→先發需玩家同意,先發→牛棚仍自動 */
    const nr=pitcherRole(), old=S.role;
    if((old==='MR'||old==='CL')&&nr==='SP'){
      /* 後援投手體力練上先發線:球團徵詢,不強制轉 */
      const reliefRole=bullpenRole();
      choose('球團徵詢：你的體力已達先發水準，要轉任先發嗎？',[
        {t:'轉任先發，扛起輪值',main:true,f:()=>{ S.role='SP';
          card('info','定位調整',`你點頭接下先發任務。新球季起，你是輪值的一員——<b class="hl">先發</b>。`); cont(); }},
        {t:'留在牛棚，守住我的位置',s:(reliefRole===old?'維持':'調整為')+roleN(reliefRole)+'定位',f:()=>{ S.role=reliefRole;
          const msg=reliefRole===old
            ?'你婉拒了教練團的提議——永遠準備待命，在球隊最需要我的時候，登板救火。'
            :`你婉拒先發任務；教練團依上季表現，將你登錄為 <b class="hl">${roleN(reliefRole)}</b>。`;
          card('info',reliefRole===old?'留守牛棚':'定位調整',msg); cont(); }}]);
      return;
    }
    S.role=nr;
    if(old&&old!==nr){
      /* 中繼與終結者互換看球季成績；先發與牛棚間的調整才看體力。 */
      const basis=old!=='SP'&&nr!=='SP'?'成績':'體力';
      card('info','定位調整',`教練團評估你的${basis}，將你登錄為 <b class="hl">${roleN(nr)}</b>。`); }
    else if(!old){
      card('info','投手定位',`教練團評估你的體力，將你登錄為 <b class="hl">${roleN(nr)}</b>。`); }
    cont(); return;
  }
  const q=dpList();
  if(!S.dpos){ S.dpos=q[0];
    card('info','守位登錄',`教練團評估守備工具後，將你登錄為 <b class="hl">${DPN[S.dpos]}</b>。`); cont(); return; }
  if(dpQual(S.dpos)){
    const best=q[0];
    if(DP_RANK[best]<DP_RANK[S.dpos]){ /* 更高身價守位站得住了 */
      choose(`守位會議：教練團想把你推上更吃重的位置`,[
        {t:`升防 ${DPN[best]}`,main:true,s:posAdjLabel(best),
         f:()=>{S.dpos=best;card('good','守位調整',`守備數據說服了所有人——新球季改守 <b class="hl">${DPN[best]}</b>。`);cont();}},
        {t:`留守 ${DPN[S.dpos]}`,f:()=>cont()}]); return; }
    cont(); return; }
  const opts=q.slice(0,2).map((p,i)=>({t:`移防 ${DPN[p]}`,main:i===0,
    s:p==='DH'?`守備已無處可站｜${posAdjLabel(p)}`:posAdjLabel(p),
    f:()=>{ S.dpos=p; card('info','守位調整',`球團季末評估後，新球季改守 <b class="hl">${DPN[p]}</b>。`); cont(); }}));
  choose(`守位會議：教練團認為你的守備已撐不住 ${DPN[S.dpos]}（${LV[S.lv].n}標準）`,opts);
}
/* 只會這個:只吃三種角色維度——打擊(力量/Contact)、跑壘(速度)、守備(綜合) */
export function careerAllStars(){ let n=0; ['CPBL','NPB','MLB'].forEach(b=>{ if(S.stats[b])n+=(S.stats[b].AS||0); }); return n; }
export function toolGap(){ const a=S.ab;
  const hit=Math.max(a.pow,a.con);        /* 打擊維度:力量或 Contact 取高 */
  const run=a.spd;                         /* 跑壘維度 */
  const def=S.pos==='C'?(a.rng+a.fld+a.arm+a.cat)/4:(a.rng+a.fld+a.arm)/3; /* 守備綜合 */
  const dims=[['hit',hit,'代打'],['run',run,'代跑'],['def',def,'代守']];
  dims.sort((x,y)=>y[1]-x[1]);
  const topDim=dims[0], secDim=dims[1];
  const gap=topDim[1]-secDim[1];
  /* 對照角色:代打看力量/Contact 哪個高決定文案來源 */
  const role=topDim[2];
  return {gap, role, val:topDim[1], dim:topDim[0]}; }
export function ovr(){
  const a=S.ab;
  if(S.pos==='P'){ const arr=[a.vel,a.ctl,a.brk].sort((x,y)=>y-x);
    return Math.round(arr[0]*0.42+arr[1]*0.30+arr[2]*0.18+a.sta*0.10); }
  const off=[a.con,a.pow,a.eye,a.spd].sort((x,y)=>y-x);
  const offv=off[0]*0.38+off[1]*0.27+off[2]*0.20+off[3]*0.15;
  /* 守備分:用當前守位的 dpScore(與守位門檻系統一致);DH 無守備價值 → 以「1B 守備分 −12」計(確保同打擊下 1B 恆 > DH);未定守位則取最佳可守守位的分 */
  const dpForOvr = S.dpos || (S.pos==='C'?'C':(S.pos==='OF'?'CF':'SS'));
  const def = S.dpos==='DH' ? (dpScore('1B')-12) : dpScore(dpForOvr);
  /* 守備權重:關鍵守位(SS/CF/C)最高 30%,角落降低;DH 用與 1B 相同權重(守備分已內含 DH 懲罰) */
  const dw=S.dpos?({SS:0.30,CF:0.30,C:0.30,'2B':0.22,'3B':0.22,RF:0.20,'1B':0.12,LF:0.14,DH:0.12})[S.dpos]??0.22:0.24;
  let v=Math.round(offv*(1-dw)+def*dw);
  if(S.traits.yips)v-=3; /* 失憶症:心理陰影,系統評價 -3 */
  return v;
}
export function playerType(){
  const a=S.ab;
  const decliningVeteran=S.stage==='PRO'&&(S.age-(S.traits.disc?2:0))>=32;
  if(S.traits.onetool&&S.toolRole)return S.toolRole+'工具人';
  if(S.pos==='P'){
    const m=Math.max(a.vel,a.ctl,a.brk);
    if(m<52)return decliningVeteran?'老將':'潛力股';
    if(a.sta>=m&&a.sta>=62)return '工作馬';
    if(m===a.vel)return '火球男'; if(m===a.brk)return '魔術師'; return '人體Kzone';
  }
  if(S.pos==='C'){ const rest=Math.max(a.con,a.pow,a.spd,a.eye,a.rng,a.fld,a.arm);
    if(a.cat>=58&&rest<=a.cat-8)return '配球皇帝'; }
  const dv=S.pos==='C'?(a.rng+a.fld+a.cat)/3:(a.rng+a.fld+a.arm)/3;
  const cand=[['巨炮型',a.pow],['安打製造機',a.con],['選球大師',a.eye],['飛毛腿',a.spd],['守備達人',dv]];
  cand.sort((x,y)=>y[1]-x[1]);
  if(cand[0][1]<52)return decliningVeteran?'老將':'潛力股';
  if(cand[0][1]-cand[1][1]<=3&&cand[0][1]>=60)return '全能型';
  return cand[0][0];
}
export function abCost(k){ /* 目前這一級要花幾點(須與 addAb 成本公式一致，含體力的例外) */
  const cur=S.ab[k], pk=(S.pot&&S.pot[k])||62, isP=S.pos==='P';
  let c=(isP&&k!=='sta')?(cur>=66?7:cur>=58?4:cur>=50?2:1):(cur>=72?3:cur>=64?2:1);
  if(cur>=pk)c*=isP?4:3; return c;
}
export function normalizeAbCarry(k){
  if(!S.carry)S.carry={};
  /* 能力只使用整數；進度固定為 0～分母-1，避免降能力跨級距後出現 2/2 卻未升級。 */
  S.ab[k]=clamp(Math.round(Number(S.ab[k])||1),1,80);
  const cost=abCost(k);
  S.carry[k]=clamp(Math.floor(Number(S.carry[k])||0),0,Math.max(0,cost-1));
  return S.carry[k];
}
export function addAb(k,v){ if(!(k in S.ab))return 0;
  normalizeAbCarry(k);
  const o=S.ab[k];
  S.lastOverflow=0; /* 【修正】紀錄真正溢出的點數 */
  if(v<0){
    S.ab[k]=clamp(o+v,1,80);
    normalizeAbCarry(k);
    return S.ab[k]-o;
  } /* 扣值 1:1,不吃量表成本 */
  if(!S.carry)S.carry={};
  let cur=o,bud=v+(S.carry[k]||0); /* 未滿一級的點數累積在進度槽,不再蒸發 */
  const pk=(S&&S.pot&&S.pot[k])||62;
  const isP=S&&S.pos==='P';
  while(bud>0&&cur<80){
    /* v1.5.9 體力單獨改用野手曲線。體力不是球威，卻跟球速/控球/變化球吃同一條
       最陡的成本(66 以上每點 7)，而先發必須把體力墊到 52 才站得上輪值——那些點數
       本來該進球威。實測結果是先發成為唯一一條「實際峰值低於自身潛力」的路線
       (峰值 − 潛力 = −3.3；後援 0.0、捕手 +2.3、一壘 +3.7)，天賦再好也轉不成分數：
       名人堂率在四個運氣分層是 12/12/9/15%，完全沒有梯度。
       只動體力這一項(球威成本與超潛力 ×4 都不碰)之後：−3.3 → −1.3，
       名人堂率 15/14/15/55%——普通運氣只動 3 個百分點，但「天賦好又健康」
       從 15% 回到 55%，跟捕手(54)、游擊(52) 對齊。後援幾乎不受影響(本來就不練體力)。 */
    let cost=(isP&&k!=='sta')?(cur>=66?7:cur>=58?4:cur>=50?2:1)  /* 投手球威,養成成本最陡 */
              :(cur>=72?3:cur>=64?2:1);                          /* 野手9項與投手體力 */
    if(cur>=pk)cost*=isP?4:3; /* 天花板之上:投手×4、野手×3 */
    if(bud>=cost){bud-=cost;cur++;} else break; }
  if(cur>=80) S.lastOverflow=bud; /* 滿 80 後，剩下的點數才是真正的溢出 */
  S.carry[k]=cur>=80?0:bud;
  S.ab[k]=cur; return cur-o; }
export function addAbStat(k,amt){ 
  if(amt<=0)return addAb(k,amt);
  const pk=(S.pot&&S.pot[k])||62;
  const isP=S.pos==='P';
  let cur=S.ab[k], bud=amt, cr=(S.carry&&S.carry[k])||0, gained=0;
  /* 潛力已滿：直接全額轉為狀態火燙 */
  if(cur>=pk){ S.pendStat=(S.pendStat||0)+bud; return 0; }
  
  /* 潛力未滿：依正常成本加點，達到潛力上限就停止 */
  while(bud>0 && cur<pk){
    let c = isP ? (cur>=66?7:cur>=58?4:cur>=50?2:1) : (cur>=72?3:cur>=64?2:1);
    bud--; cr++; if(cr>=c){ cr-=c; cur++; gained++; }
  }
  
  if(!S.carry) S.carry={}; S.carry[k]=cr; S.ab[k]=cur;
  
  /* 達到潛力上限後剩餘的點數轉為成績加成 */
  if(bud>0) S.pendStat=(S.pendStat||0)+bud;
  return gained;
}
export function statBonus(pts,out){ /* 正向獎勵無法再轉成能力時，改為當季成績加成（下次結算套用）。 */
  S.pendStat=(S.pendStat||0)+pts;
  out.push(statBonusTxt(pts));
}
/* 全遊戲「本季成績加成」的統一文案：正值為狀態火燙、負值為狀態低迷，格式一律
   「狀態火燙（本季成績加成 +N）」，避免各處出現 ×N／+N／純文字等不一致寫法。 */
export function statBonusTxt(pts){
  const n=Math.round(pts);
  if(n>=0)return `<span class="up">狀態火燙（本季成績加成 +${n}）</span>`;
  return `<span class="dn">狀態低迷（本季成績加成 −${Math.abs(n)}）</span>`;
}
/* 全遊戲「能力成長」的統一文案。能力數值的增減寫 +N／−N 不加單位(畫面上到處都是，加單位
   反而囉嗦)。事件卡不會告訴玩家這次給了幾點，而養成成本表會讓投入點數與實際升的級數對不
   起來(投手 66 以上每級 7 點、突破潛力上限後成本再 ×3~×4)，所以只在兩者不相等時才補上
   「加了 N 點」——沒補的時候就代表 1 點換 1 級，不必多寫。進度槽的餘數刻意不顯示，太吵。
   負向扣值是 1:1 不吃成本表，直接寫 −N。 */
export function abGainTxt(k,pts,levels){
  const name=ABL[k]||k;
  if(pts<0||levels<0){
    const d=Math.abs(Math.round(levels));
    return d?`<b class="dn">${name} −${d}</b>`:`${name} 無變化`;
  }
  const p=Math.round(pts);
  if(levels>0)return p===levels
    ?`${name} <span class="up">+${levels}</span>`
    :`加了 ${p} 點，${name} <span class="up">+${levels}</span>`;
  return `加了 ${p} 點，${name} <span class="dn">未升級</span>`;
}
