import {S} from '../core/state.js?v=1.5.12';
import {R, ri, pick, chance, clamp} from '../core/rng.js?v=1.5.12';
import {ABL, POS_AB} from '../data/abilities.js?v=1.5.12';
import {LV} from '../data/teams.js?v=1.5.12';
import {card, choose, board} from '../ui/dom.js?v=1.5.12';
import {addAb} from './ability.js?v=1.5.12';
import {isSP} from './season.js?v=1.5.12';
import {removeTrait} from '../flow/events.js?v=1.5.12';
export function tjAccrue(st,lv){ /* 球威風險 × 投法 × 角色標準化工作量；體力不參與。 */
  if(S.pos!=='P'||S.seasonFactor<=0||!st||!(st.G>0))return;
  const L=LV[lv||S.lv],effort={'全力投':1.30,'普通投':1.0,'養生球':0.80}[S.effort]||1.0;
  /* 先發以該層級球季場數作標準局數；後援以約 45% 賽程、最高 60 場作標準登板。 */
  const roleTarget=isSP()?(L.g||1):Math.min(60,Math.max(1,Math.round((L.g||1)*0.45)));
  const actual=isSP()?(st.IP||0):(st.G||0);
  const normalized=actual/roleTarget;
  const workload=clamp(0.4+0.6*normalized,0.4,1.2);
  /* 第一次術後 ×1.15；第二次後再把既有損耗速度乘 1.20（合計 ×1.38），提高第三次危機機率。 */
  const scarMult=S.tjCount>=2?1.15*1.20:S.tjCount>=1?1.15:1;
  const base=(S.ab.vel+S.ab.brk)/19*effort*workload*scarMult;
  S.tj+=base;
  /* v1.5.7 移除「二次重建後第 3 年必定拉警報」的硬性期限。
     原設計用 tjSecondYear 在固定年限把量表強制補滿，等於把第三次 TJ 寫成劇本而非模擬結果——
     玩家不論怎麼調整投球數、投法、工作量都改變不了，決策失去意義。
     現在第三次危機一律由 scarMult(×1.38) 與殘留量表自然推動：仍然明顯比第一次快，但可被操作。 */
}
/* v1.5.7 量表上限 50→60（橡皮人維持 2 倍＝120）。
   原因不是名人堂難度，是傷病頻率本身失真：實測大聯盟先發 100% 會碰到手肘危機、平均動刀 2.2 次，
   現實中約三分之一的投手一輩子動過一次、動三次幾乎等於退休。
   實測改為 60 之後（大聯盟先發 N=250）：平均動刀 2.2→1.4 次、首次危機 28.5→29.5 歲、
   生涯 13.0→14.1 季；名人堂% 只動 +4～9pp（峰值 72：44%→48%），所以這是擬真調整不是難度調整。
   殘留量表刻意維持 ri(38,44) 不同比例放大：在 60 的尺上是 63～73%，
   二次重建後第三次危機仍然機率很高、但不再是必然——這正是移除硬性期限想要的結果。 */
export function tjCap(){ return S.traits.rubber?120:60; }
export function tjGamble(cont){ /* 量表達上限:先扣 -5,再對賭 */
  if(S.pos!=='P'||S.tj<tjCap()){ cont(); return; }
  S.tjCrises=(S.tjCrises||0)+1;
  const crisisBefore={vel:S.ab.vel,brk:S.ab.brk};
  addAb('vel',-5); addAb('brk',-5); board(1);
  card('bad','手肘拉起警報',`累積的負荷讓韌帶發出哀鳴——球速、變化球各 <b class="dn">−5</b>。醫療團隊把兩個選項攤在你面前。`);
  const succP=S.traits.rubber?85:55;
  choose('TJ 抉擇：你的手肘撐到極限了',[
    {t:'動 Tommy John 手術',main:true,s:'下一季全年復健；警報先 −5，第一次手術直接回升 +3～+10，重複動刀的恢復幅度較低',f:()=>{
      S.tj=0; S.tjCount++; S.rehab=1; S.marketInjury='major';
      const first=S.tjCount===1,lo=first?3:2,hi=first?10:7;
      const gv=ri(lo,hi),gb=ri(lo,hi);
      /* 能力算式固定為「危機前能力 −5 + 手術回升」；直接加在能力值，不經訓練點成本。第一次僅免除重複動刀的額外永久懲罰。 */
      S.ab.vel=clamp(S.ab.vel+gv,1,80); S.ab.brk=clamp(S.ab.brk+gb,1,80);
      board(1);
      const veq=`${crisisBefore.vel} − 5 + ${gv} ＝ <b class="hl">${S.ab.vel}</b>`;
      const beq=`${crisisBefore.brk} − 5 + ${gb} ＝ <b class="hl">${S.ab.brk}</b>`;
      card('gold','手術成功',`手術很順利。漫長復健後，能力值直接回升，不經訓練點折算——球速：${veq}｜變化球：${beq}。（下季報銷）`);
      tjRepeatDamage();
      afterGamble('surgery',cont); }},
    {t:'打針硬撐，不進手術室',warn:true,s:`成功率 ${succP}%｜失敗＝TJ 大傷（下一季報銷、能力再崩）`,f:()=>{
      if(chance(succP)){ S.tj=Math.max(0,S.tj-20); S.ab.vel=clamp(S.ab.vel+5,1,80); S.ab.brk=clamp(S.ab.brk+5,1,80); board(1);
        card('good','險過一關',`封閉針暫時壓住了疼痛——量表 <b class="hl">−20</b>，球速、變化球各回升 <b class="up">+5</b>，抵銷這次警報造成的下滑。但這是在跟時間借命。`);
        afterGamble('inject',cont); }
      else { tjBigInjury(cont); } }}]);
}
export function tjDeltaText(v){ return v>0?`<b class="up">+${v}</b>`:v<0?`<b class="dn">${v}</b>`:'<b>0</b>'; }
export function tjRepeatDamage(){
  if(S.tjCount===2){
    const dv=ri(6,10),db=ri(6,10);
    S.ab.vel=clamp(S.ab.vel-dv,1,80); S.ab.brk=clamp(S.ab.brk-db,1,80);
    /* 二次重建後不再回到健康的零點：殘留 38～44／60。第三次危機由殘留＋scarMult 自然推動，
       不再有固定年限（v1.5.7 移除 tjSecondYear）——減量、養生球、轉後援都能實際延後它。 */
    const residue=ri(38,44); S.tj=Math.max(S.tj,residue);
    card('bad','兩度動刀的代價',`第二次進手術室，重建過的韌帶與代償已經留下永久痕跡——球速 <b class="dn">−${dv}</b>、變化球 <b class="dn">−${db}</b>。更糟的是，手肘已經不可能真正歸零——量表不會再回到零點，第三次危機隨時可能追上你。<b class="hl">從現在起，投多少、怎麼投，都會直接決定它什麼時候來。</b>`);
  }else if(S.tjCount>=3){
    S.ab.vel=clamp(Math.round(S.ab.vel/2),1,80);
    S.ab.brk=clamp(Math.round(S.ab.brk/2),1,80);
    card('bad','三度動刀的代價','第三次走進手術室，手臂終於越過了無法回頭的界線——球速與變化球<b class="dn">直接砍半</b>，投手生涯已經走到懸崖邊。');
  }
  board(1);
}
export function tjBigInjury(cont){
  S.tjCount++; S.rehab=1; S.tj=0; S.marketInjury='major';
  /* 5% 肩膀報廢 */
  if(chance(5)){ S.ab.vel=10; S.ab.brk=10; S.pot.vel=20; S.pot.brk=20;
    card('bad','最壞的結果',`長期閃避手肘的痛處，你的姿勢逐漸變形，投球姿勢彷彿在推鉛球。突然一陣劇痛，你突然發現你的手抬不起來了。<br><b class="dn">肩膀報廢：球速與變化球降至 10，潛力上限降至 20。</b>`);
    board(1); afterGamble('fail',cont); return; }

  /* 韌帶斷裂的懲罰 (-5) 以及手術後的回春 (+3~+10) */
  const gv=ri(3,10), gb=ri(3,10);
  const netV = gv - 5;
  const netB = gb - 5;
  /* 直接改絕對值,避免蓄力 Bug;鎖 1~80 */
  S.ab.vel = clamp(S.ab.vel + netV, 1, 80);
  S.ab.brk = clamp(S.ab.brk + netB, 1, 80);

  board(1);

  card('bad','TJ 大傷',`啪的一聲，硬撐的代價來了——韌帶當場斷裂。下一季<b class="dn">全年報銷</b>。加上警報時已經失去的球威，本次危機合計：球速 ${tjDeltaText(netV-5)}、變化球 ${tjDeltaText(netB-5)}。就算滿血回歸，也真的只是勉強打平。`);
  tjRepeatDamage();
  afterGamble('fail',cont);
}
export function afterGamble(kind,cont){
  if(kind==='inject'){ S.tjSuccess++;
    if(S.tjSuccess>=2&&!S.traits.rubber){ S.traits.rubber=true; S.tj=0;
      card('gold','隱藏屬性解鎖：橡膠手臂','連續兩次靠打針硬撐挺過手肘危機、完全不進手術室——你的韌帶像橡膠一樣柔韌。<b class="hl">現有 TJ 量表歸零、上限翻倍，打針成功率提升至 85%</b>。'); board(1); } }
  else if(kind==='surgery'){ S.tjSuccess=0; /* 開刀重置連續 */
    if(S.traits.rubber){ removeTrait('rubber','橡膠手臂');
      card('bad','橡膠不再','終究還是進了手術室——那雙被稱為橡膠的手臂，也有極限。<b class="dn">橡膠手臂失效</b>。'); board(1); } }
  else { S.tjSuccess=0; } /* 大傷失敗重置 */
  cont();
}
export function injuryProb(){ /* 基礎風險從 24 降為 15，減少動不動就受傷的頻率 */
  let p=15+S.injNext;
  if(S.age>=35)p+=12; else if(S.age>=32)p+=6;
  if(S.traits.academy&&S.age<25)p-=5; /* 學院派:25歲前科學化管理 */
  if(S.traits.iron&&S.traits.glass)p=25; /* 兩者現已互斥,此分支僅供尚未覆蓋過的舊存檔相容 */
  else if(S.traits.iron)p=Math.min(p,10); /* 鐵人:基礎風險上限 10% */
  else if(S.traits.glass)p=Math.max(p,40);
  /* 事件卡等自找的額外風險(tmpInj)疊加在基礎之上,不受鐵人上限保護 */
  p+=(S.tmpInj||0);
  return clamp(p,3,95);
}
export function injuryMarketStatus(){
  if(S.marketInjury&&S.marketInjury!=='healthy')return S.marketInjury;
  if(S.seasonFactor===0)return 'rehab';
  if(S.seasonFactor<=0.45)return 'major';
  if(S.seasonFactor<0.95)return 'minor';
  return 'healthy';
}
/* 市場不再只追逐合約年的單季高點：最近三季加權；大傷年更重視傷前履歷。 */
export function rollInjury(){
  const p=injuryProb();
  if(!chance(p)){ card('info','健康回報',`本季平安出賽。（受傷機率 ${p}%）`); S.injNext=0; return; }
  S.injNext=0;
  if(chance(64)){ // 64% 的機率是小傷
    const cut=ri(20,45); S.seasonFactor=1-cut/100; S.ironStreak=0; S.marketInjury='minor';
    card('bad','小傷',`肌肉拉傷進了傷兵名單，本季出賽量預估減少 <b class="dn">${cut}%</b>。${injStatLoss(false)}`);
  }else{
    const played = ri(5, 45); /* 讓賽季隨機進行了 5% ~ 45% 時才受傷 */
    S.seasonFactor = played / 100; /* 把比例套用到當季出賽 */
    S.bigInj++; S.ironStreak=0; S.marketInjury='major';
    let txt=`重大傷勢——進手術室了。<b class="dn">賽季提前報銷</b>（本季留下 ${played}% 的出賽紀錄）。`;
    if(chance(20)){ S.rehab=1; txt+=`醫生搖搖頭：<b class="dn">明年也很難趕上開季</b>（明年整季報廢）。`; }
    card('bad','大傷',txt+injStatLoss(true));
    if(S.bigInj>=2&&!S.traits.glass&&S.age<32){ /* 32 歲後的大傷是老化,不再定性為玻璃體質 */
      /* 玻璃人與鐵人互為對立體質，不可並存：本來是鐵人的話直接被玻璃人覆蓋過去。 */
      const wasIron=!!S.traits.iron;
      if(wasIron)removeTrait('iron','鐵人');
      S.traits.glass=true; S.glassYear=S.year;
      S.removed=(S.removed||[]).filter(x=>x!=='玻璃人'); /* 曾被鐵人蓋掉又碎回來:清掉刪除線紀錄 */
      if(wasIron)
        card('bad','隱藏素質覆蓋：鐵人 → 玻璃人','大量的出賽，開始讓你原本如機器人般的身體出現變化，身體逐漸脆弱，最後變為易碎品。<br><b class="dn">鐵人解除</b>，未來每季受傷機率<b class="dn">不低於 40%</b>。');
      else
        card('bad','隱藏素質解鎖：玻璃人','生涯第二次大傷。從此傷病如影隨形，未來每季受傷機率<b class="dn">不低於 40%</b>。');
      board(1); }
    else if(S.bigInj>=2&&!S.traits.glass&&S.age>=32){
      card('info','醫療團隊評估','你不是易碎，只是風化 －－大傷不再被定義為玻璃人體質，身體都能體諒你這些年的征戰。'); }
  }
}
export function injStatLoss(big){
  if(big){ /* 每一次大傷:全能力 −5,身體被實質性摧毀 */
    POS_AB[S.pos].forEach(k=>{ S.ab[k]=clamp(S.ab[k]-5,1,80); }); board(1);
    return `重大傷勢重創身體素質：<b class="dn">全能力 −5</b>。`;
  }
  if(!chance(40))return '';
  const keys=POS_AB[S.pos];
  let k=pick(keys); if(!(k in S.ab))k=pick(keys);
  const amt=ri(1,2);
  S.ab[k]=clamp(S.ab[k]-amt,1,80); board(1);
  return `傷勢留下後遺症：<b class="dn">${ABL[k]} −${amt}</b>。`;
}
