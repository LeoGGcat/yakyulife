import {S} from '../core/state.js?v=2.1.0';
import {clamp} from '../core/rng.js?v=2.1.0';
import {DPN, POSN, POS_ADJ_RUNS, POS_TIER_K, POS_TIER_STR} from '../data/abilities.js?v=2.1.0';
import {LG_N, envOf, envWhip, envLeagueOps} from '../data/teams.js?v=2.1.0';
import {TIER_TH, LEAGUE_K, MILESTONE_DEF, HOF_TH_K} from '../data/economy.js?v=2.1.0';
import {fmtIP, slgOf, roleName3, baseballERA, baseballWHIP, pitG, pitBB} from './season.js?v=2.1.0';
import {isCareerScoringAward, HONOR_GROUP_NAMES, honorSide, splitBySide} from './award-rules.js?v=2.1.0';
export {HONOR_GROUP_NAMES, honorSide};
/* ================= 生涯終章 ================= */
const BUCKET_G={CPBL:120,NPB:143,MLB:162};
/* 守位分：守位難度(POS_ADJ_RUNS 以「每 162 場」計)換算成該聯盟的實際球季長度。
   分母必須用該聯盟的滿季場次，不能寫死 162——守備計分的另一半 defRuns() 用的就是
   gw=games/L.g，兩邊尺度要一致。寫死 162 會讓場次較少的聯盟只拿到部分守位分
   (中職滿勤 18 年只算 13.3 個守位年、日職 15.9 個)，等於把整條守位級距壓縮，
   捕手/游擊的加分與一壘/指定打擊的扣分同時被稀釋。 */
export function positionScore(st,bucket){
  if(!st||!st.DPG)return 0;
  const full=BUCKET_G[bucket]||162;
  let runs=0; Object.entries(st.DPG).forEach(([dp,g])=>{ runs+=(POS_ADJ_RUNS[dp]||0)*(g/full); });
  return runs*6; /* 與 DEF 每 1 defensive run = 6 分使用同一尺度 */
}
/* 後援名人堂校準：300 救援接近候選、400 救援具入選實力、500 救援可挑戰最高門檻。
   里程碑本身依聯盟場次比例縮放(比照其他獎項門檻的作法)，避免場次較少的聯盟
   (中職120場/日職143場)因為天生救援總數就比大聯盟(162場)少，同等地位的終結者
   卻吃不到里程碑加分。 */
export function reliefMilestoneScore(st,bucket){
  const sv=st&&st.SV||0, r=(BUCKET_G[bucket]||162)/162;
  if(sv>=500*r)return 1800;
  if(sv>=400*r)return 1200;
  if(sv>=300*r)return 800;
  if(sv>=200*r)return 350;
  return 0;
}
/* 投手生涯評價的質量校正：純堆數據(局數/勝場/救援等)過去會讓長年低品質後援
   在總分上輾壓真正壓制力強的先發。用生涯 ERA/WHIP 相對「該聯盟平均」算出一個
   0.50~1.60 倍的品質係數，乘回堆疊分數，讓失分率真正影響評價高低。
   分界點是聯盟平均的 0.787 倍(ERA)與 0.750 倍(WHIP)——那就是舊版寫死的
   3.40／1.15 換算成比值之後的樣子，見下面的說明。 */
export function pitcherQualityFactor(st,bucket){
  const E=envOf(bucket), era=baseballERA(st), whip=baseballWHIP(st);
  let q=1;
  /* 參考值改成「相對該聯盟平均的比值」，不再寫死 3.40／1.15。
     3.40 是舊版所有聯盟共用的一把尺，而舊版每個聯盟的平均 ERA 都是 4.32——
     那把尺其實是 0.787 個聯盟平均。日職現在的聯盟平均是 3.01、大聯盟 4.17，
     繼續用 3.40 的話等於白送日職投手一個 +0.06、白扣大聯盟投手 −0.12。
     係數同步換算（0.15×4.32、0.30×1.534），讓同一個「相對水準」的投手拿到
     跟舊版一模一樣的 q，尺才是平移而不是變形。 */
  if(era!=null&&E.era>0)q+=clamp((0.787-era/E.era)*0.648,-0.40,0.40);
  if(whip!=null)q+=clamp((0.750-whip/envWhip(E))*0.460,-0.20,0.20);
  return clamp(q,0.50,1.60);
}
export function pitcherCareerScore(st,bucket){
  const base=st.W*13+(st.SV||0)*8+(st.HLD||0)*3+st.SO*0.9+st.IP*0.35+reliefMilestoneScore(st,bucket);
  return base*pitcherQualityFactor(st,bucket);
}
/* 打者生涯評價的質量校正：對齊投手 pitcherQualityFactor 的設計，用生涯打擊率／OPS
   相對「該聯盟平均」算出 0.50~1.60 倍品質係數，讓打者也有跟投手對稱的
   品質校正，不會因為打者本來沒有品質校正而系統性地比投手更難拿到榮譽級評價。
   末尾 0.67 是配合 LEAGUE_K 重新以「絕對能力值換算生涯總分」實測校準出的尺度，
   讓投手/打者在同一把 TIER_TH 尺上大致對齊(細節見 economy.js 的 LEAGUE_K 說明)。 */
export function hitterQualityFactor(st,bucket){
  const ab=st&&st.AB||0, pa=st&&st.PA||0;
  if(!ab||!pa)return 1;
  const E=envOf(bucket), avg=st.H/ab, obp=(st.H+(st.BB||0))/pa, slg=slgOf(st), ops=obp+slg;
  /* 同 pitcherQualityFactor：.270／.760 換成相對聯盟平均的比值。
     舊版三個聯盟的平均打擊率都是 .249、OPS 都是 .643，所以 .270 其實是
     1.084 個聯盟平均、.760 是 1.182 個。中職現在的聯盟平均打擊率是 .256、
     日職 .245——照舊尺算的話中職打者會被系統性多扣一截。 */
  const lgOps=envLeagueOps(E);
  let q=1;
  q+=clamp((avg/E.avg-1.084)*0.747,-0.35,0.35);
  q+=clamp((ops/lgOps-1.182)*0.386,-0.20,0.20);
  return clamp(q,0.50,1.60);
}
export function hitterCareerScore(st,bucket){
  const base=st.H+st.HR*3+st.SB*0.8+st.RBI*0.5+st.BB*0.3+(st.DEF||0)*6+positionScore(st,bucket);
  return base*hitterQualityFactor(st,bucket)*0.67;
}
/* 這一段履歷算不算二刀流，看的是他「實際打出來的東西」——同一個聯盟裡既有登板也有打席
   ——而不是退休當下的 S.pos。原因是模擬量到的：二刀流的強制轉回中位發生在 39 歲、
   已經打了 19 個二刀流球季之後（89.5% 的人會在生涯尾聲被收斂成單刀）。
   用 S.pos 判斷的話，那十九年會在結算當下被整段當成純打者計分。
   單刀投手沒有打席、單刀野手沒有登板，所以這個判斷不會誤傷他們。 */
export function isTwoWayCareer(st){ return !!(st&&(st.GP||0)>0&&(st.PA||0)>0&&(st.IP||0)>0); }
/* ── 二刀流的表格：投打各自一張 ──
   曾經試過把兩側擠進同一列，但那必須砍掉一半欄位（投手側的 SV/HLD/BB/WHIP、
   打者側的 OBP/SLG/H/BB/SB/DEF）才排得下，而且同一列上兩組數字混在一起讀不出來
   哪個屬於哪一邊。改成兩張表之後，每一張都用回「單刀的完整欄位」，
   二刀流反而看得比單刀還完整。這裡只留兩側各自的「有沒有出賽」判斷。

   一列裡「有沒有投球側／打擊側」要各自判斷：轉型前後的單刀球季也會混在同一段生涯裡，
   沒有產出的那一側整列不畫（薪資表例外，那一年還是有領薪水）。
   投球側不能用 pitG()——純打者的 st.G 是出賽場數，會把每個打者都判成有投球。 */
export const twHasPit=st=>!!(st&&((st.IP||0)>0||(st.GP||0)>0));
export const twHasBat=st=>!!(st&&(st.PA||0)>0);
/* 這一局要不要用二刀流版面。跟計分同一個理由：89.5% 的二刀流在退休前已經被強制轉回，
   用 S.pos 判斷會讓那十九年的履歷用單刀版面印出來，缺的那一側整段消失。 */
export function twoWayView(){
  if(S.pos==='TW'||(S.twSeasons||0)>0)return true;
  return (S.log||[]).some(r=>isTwoWayCareer(r.st))||
    ['CPBL','NPB','MLB','MINOR'].some(b=>isTwoWayCareer(S.stats&&S.stats[b]));
}
export function careerScore(st,bucket){
  if(S.pos==='P')return pitcherCareerScore(st,bucket);
  /* 二刀流:兩份產出都是他真的打出來的，所以兩邊相加。會不會過強不是靠這裡壓，
     而是靠 LEAGUE_K.TW 與 HOF_TH_K.TW 這兩個校準常數——尺歸尺、分歸分。
     打擊側裡的 positionScore 已經含指定打擊的 −14／162 場，那一刀在這裡挨；
     投球側完全不受影響，所以不會被同一件事罰兩次(posTierK 對二刀流也回 1)。 */
  if(isTwoWayCareer(st))return pitcherCareerScore(st,bucket)+hitterCareerScore(st,bucket);
  return hitterCareerScore(st,bucket);
}
export function primaryPos(){ /* 生涯主守位:過半→該位;無過半→工具人/搖擺人(年數降序) */
  if(S.pos==='TW'||(S.twSeasons||0)>0){
    const ry=S.roleYears||{}, es=Object.entries(ry).sort((a,b)=>b[1]-a[1]);
    return '二刀流'+(es.length?`（${{SP:'先發',MR:'中繼',CL:'終結者'}[es[0][0]]||''}／指定打擊）`:'');
  }
  if(S.pos==='P'){
    const ry=S.roleYears||{}; const tot=Object.values(ry).reduce((a,b)=>a+b,0);
    if(!tot)return roleName3(S.role);
    const es=Object.entries(ry).sort((a,b)=>b[1]-a[1]);
    if(es[0][1]>=tot/2)return roleName3(es[0][0]); /* 有過半 */
    /* 無過半:搖擺人(附主要兩種定位) */
    const list=es.map(e=>({SP:'先發',MR:'中繼',CL:'終結者'}[e[0]]||'')).filter(Boolean);
    return '搖擺人('+list.slice(0,2).join('、')+')';
  }
  const dy=S.dposYears||{}; const total=Object.values(dy).reduce((a,b)=>a+b,0);
  if(!total)return S.dpos?DPN[S.dpos]:POSN[S.pos];
  const entries=Object.entries(dy).sort((a,b)=>b[1]-a[1]);
  if(entries[0][1]>=total/2)return DPN[entries[0][0]]||entries[0][0]; /* 有過半 */
  const noDH=entries.filter(e=>e[0]!=='DH'&&e[0]!=='—').map(e=>DPN[e[0]]||e[0]);
  if(!noDH.length)return DPN['DH'];
  return '工具人('+noDH.join('、')+')';
}
export function capTeam(bucket){ /* 該聯盟效力最久的球隊,作為名人堂帽徽 */
  const tb=(S.teamTally&&S.teamTally[bucket])||{}; let best=null,bn=-1;
  for(const k in tb)if(tb[k]>bn){bn=tb[k];best=k;}
  return best;
}
export function primaryDposByGames(st){ /* 依該聯盟生涯守備出賽數決定代表守位 */
  if(!st||!st.DPG)return null;
  const entries=Object.entries(st.DPG)
    .filter(([dp,g])=>dp&&dp!=='—'&&Number(g)>0)
    .sort((a,b)=>b[1]-a[1]);
  return entries.length?entries[0][0]:null;
}
export function defShare(bucket){ /* 守備貢獻占生涯總價值比重 0~1 */
  const st=S.stats[bucket]; if(!st||S.pos==='P')return 0;
  const off=st.H+st.HR*3+st.SB*0.8+st.RBI*0.5+st.BB*0.3;
  const def=Math.max(0,st.DEF||0)*6;
  return (off+def)>0?def/(off+def):0;
}
export function posLegendPhrase(bucket){ /* 依守備占比與獎項決定守位敘述 */
  const share=defShare(bucket), st=S.stats[bucket];
  const dp=primaryDposByGames(st)||(S.pos==='C'?'C':null);
  const hasGlove=S.honors.some(h=>h.includes('金手套')||h.includes('守備聖經'));
  if(S.pos==='P'||!dp||dp==='DH')return '';
  const posN=DPN[dp]||'';
  if(share>=0.34||(hasGlove&&share>=0.22))return `，以${{SS:'史上最偉大的游擊手之一',CF:'守備範圍撼動聯盟的中外野手',C:'蹲捕藝術的化身',_:'守備傳奇'}[dp]||('頂尖'+posN)}之姿`;
  if(hasGlove&&share>=0.12)return `，一位攻守俱佳的${posN}`;
  return '';
}
export function honorScore(bucket){
  const lg={CPBL:'中職',NPB:'日職',MLB:'大聯盟'}[bucket];
  const years=new Map();
  S.honors.forEach(h=>{
    if(!h.includes(lg))return;
    const m=String(h).match(/^(\d{4})\s+(.+)$/); if(!m)return;
    const award=m[2];
    /* 仍完整顯示於履歷，但不納入生涯評價。浴火重生也共用這把尺，
       避免新人王／明星賽／球隊冠軍等零分獎項誤觸發。 */
    if(!isCareerScoringAward(award))return;
    if(!years.has(m[1]))years.set(m[1],[]);
    years.get(m[1]).push(award);
  });
  let sc=0;
  /* 二刀流同年可能既是最佳投手又是最佳打者;原本的「同年只取最高一項」會吃掉一座。
     年度MVP 是投打共用的一座，只能算一次，所以拿它跟「投球側＋打擊側」比大小，
     不是三者相加。 */
  const twYear=awards=>{
    const pitMajor=awards.some(a=>/投手三冠王/.test(a))?700:awards.some(a=>/最佳投手|賽揚/.test(a))?460:0;
    const batMajor=awards.some(a=>/打擊三冠王/.test(a))?700:awards.some(a=>/最佳打者/.test(a))?460:0;
    const mvp=awards.some(a=>/年度MVP/.test(a))?520:0;
    const nP=awards.filter(a=>/(勝投王|防禦率王|三振王|救援王|中繼王)$/.test(a)).length;
    const nB=awards.filter(a=>/(打擊王|全壘打王|盜壘王|打點王|上壘王)$/.test(a)).length;
    return Math.max(mvp,Math.max(pitMajor,Math.min(200,nP*100))+Math.max(batMajor,Math.min(200,nB*100)));
  };
  const twCareer=isTwoWayCareer(S.stats[bucket]);
  years.forEach(awards=>{
    if(twCareer){
      const fieldingTW=awards.some(a=>/守備聖經/.test(a))?250:awards.some(a=>/金手套/.test(a))?100:0;
      sc+=twYear(awards)+fieldingTW; return;
    }
    /* 同年度的大獎只取最高層級；三冠王已包含其構成獎項，不重複加總。 */
    const major=awards.some(a=>/投手三冠王|打擊三冠王/.test(a))?700
      :awards.some(a=>/年度MVP/.test(a))?520
      :awards.some(a=>/最佳投手|最佳打者|賽揚/.test(a))?460:0;
    const titleN=awards.filter(a=>/(勝投王|防禦率王|三振王|救援王|中繼王|打擊王|全壘打王|盜壘王|打點王|上壘王)$/.test(a)).length;
    const titles=Math.min(200,titleN*100);
    /* 守備獎獨立於打擊獎計分；同年兩者皆有時只取層級較高的守備聖經。 */
    const fielding=awards.some(a=>/守備聖經/.test(a))?250
      :awards.some(a=>/金手套/.test(a))?100:0;
    /* 大獎與打擊單項王取較高者，再加上獨立的守備價值；不同年度仍完整累積。 */
    sc+=Math.max(major,titles)+fielding;
  });
  if(S.traits.franchise)sc+=200; /* 神主牌:忠誠加成 */
  return {sc};
}
/* 生涯守位加權：以各守位的實際出賽數加權平均（詳見 abilities.js 的 POS_TIER_K）。
   用 DPG 而非「主守位」，所以捕手蹲十年再轉一壘的球員會拿到兩者的混合標準，
   不會因為最後幾年移防就整段生涯改用另一把尺。 */
export function posTierK(st,bucket){
  /* 二刀流回 1:他的守位調整已經在打擊側的 positionScore 裡扣過一次，
     這裡再乘 DH 的 1.13 就是同一件事罰兩次。二刀流的門檻位移集中在 HOF_TH_K.TW。 */
  if(S.pos==='P'||isTwoWayCareer(st)||!st||!st.DPG)return 1;
  let g=0,acc=0;
  Object.entries(st.DPG).forEach(([dp,games])=>{
    const n=Math.max(0,games||0); if(!n)return;
    g+=n; acc+=(POS_TIER_K[dp]!=null?POS_TIER_K[dp]:1)*n;
  });
  if(!(g>0))return 1;
  /* 聯盟強度縮放(詳見 abilities.js 的 POS_TIER_STR) */
  const s=(POS_TIER_STR[bucket]!=null?POS_TIER_STR[bucket]:1);
  return 1+(acc/g-1)*s;
}
/* ⚠ 刻意的設計，不是 bug：生涯評價「一個聯盟一份履歷」，分開算、取最好的那份
   （呼叫端 ui/retire.js 取 i 最小者）。所以中職打 16 年是一份完整履歷，
   中職 8 年＋日職 8 年是兩份各半的履歷，兩份都不夠看。

   實測代價（完整流程模擬，N=2500／路線）：
     只待過一個頂級舞台 → 橫跨兩個
     先發投手 20.8% → 14.5%　捕手 22.2% → 11.4%　游擊 19.1% → 8.9%
     最佳聯盟年資 15~16 → 11~12 年，最佳聯盟累積分 1566 → 1268
   而且付這個代價的人數依守位差很多：先發投手 44~48% 會橫跨兩個舞台，
   捕手與游擊只有 21~25%——這就是先發投手「名人堂率不隨天賦上升」(18/17/17)
   的成因：一半的人生涯被拆散，而拆散率不隨運氣變動，於是對每一層均勻扣分。

   為什麼不改（2026-08-21 決定）：現實中日本野球殿堂與古柏鎮本來就是分開的兩座，
   旅外把生涯切成兩半、兩邊都不夠格，是真實存在的球員命運，該有代價。
   評估過的替代方案：跨聯盟累積分打折互相折抵（×0.25~0.35）、另設合併全生涯的
   總評價——兩者都會讓「橫跨兩個舞台」不再有代價，等於取消這個設計，故不採用。

   若日後有人看到「橫跨兩聯盟名人堂率腰斬」想當成 bug 修，請先讀完這段。
   要驗證請用完整流程模擬（高中→引退、玩家行為母體驅動），不要用固定能力的靜態測試
   ——靜態測試沒有聯盟流動，量不到這個效應。 */
export function tierOf(bucket){
  const st=S.stats[bucket]; if(!st)return null;
  const hs=honorScore(bucket);
  /* 生涯評價折算依「這個聯盟這段生涯的實際角色」判斷，不是看目前角色：
     救援數占推估出賽數四成以上視為終結者型生涯，套用終結者專屬折算值。 */
  const posKey=isTwoWayCareer(st)?'TW':(S.pos!=='P'?'H':((st.SV||0)>=(st.IP||0)/1.05*0.4?'CL':'P'));
  /* [Kbase,Khonor]:數據累積分與獎項分分開折算(兩者的聯盟差異性質相反,詳見 economy.js) */
  const k=((LEAGUE_K[bucket]||{})[posKey])||[1,1];
  const sc=careerScore(st,bucket)*k[0]+hs.sc*k[1],th=TIER_TH[bucket];
  /* 五級門檻整條依守位加權平移(不只名人堂)：同一個守位就該從頭到尾用同一把尺。 */
  const pk=posTierK(st,bucket);
  const hk=((HOF_TH_K[bucket]||{})[posKey])||1; /* 名人堂線獨立微調,明星以下不受影響(詳見 economy.js) */
  const hofTh=th[0]*pk*hk;                 /* 這段生涯實際適用的名人堂線 */
  let i=sc>=hofTh?0:sc>=th[1]*pk?1:sc>=th[2]*pk?2:sc>=th[3]*pk?3:4;
  /* 不設單季獎項的階級保底；明星與名人堂必須靠整段生涯累積。 */
  /* hofTh 一併回傳:票選畫面的「首輪入選」與「得票率」必須跟這裡用同一把尺，
     不能各自去讀 TIER_TH[bucket][0] 的裸值(詳見 ui/retire.js 的說明)。 */
  return {i,sc:Math.round(sc),hofTh,name:LG_N[bucket]+['名人堂','明星球員','每日球員','邊緣球員','一頁過客'][i]};
}
/* 該側真的有出賽的年數。二刀流收斂成投手之後，打擊那一張如果照用 st.yr，
   只打過 1 年的打擊履歷會印成 17 年——玩家回報的就是這個。
   yrP／yrB 是 v2.0.7 才加的，舊欄位缺就退回 st.yr。 */
export const yrsOf=(st,isP)=>{ const v=isP?st.yrP:st.yrB; return Number.isFinite(v)?v:(st.yr||0); };
export function statTable(bucket,side){
  const st=S.stats[bucket]; if(!st)return '';
  let rows;
  /* side='pit'／'bat' 只畫該側，二刀流會呼叫兩次（見 statTables）。 */
  const isP=side?side==='pit':(S.pos==='P');
  if(side&&(side==='pit'?!twHasPit(st):!twHasBat(st)))return '';
  if(isP){
    const era=st.IP>0?baseballERA(st).toFixed(2):'-';
    const whip=st.IP>0?baseballWHIP(st).toFixed(2):'-';
    rows=`<tr><th>Yrs</th><th>G</th><th>IP</th><th>W</th><th>L</th><th>SV</th><th>HLD</th><th>SO</th><th>BB</th><th>ERA</th><th>WHIP</th></tr>
    <tr><td>${yrsOf(st,true)}</td><td>${pitG(st)}</td><td>${fmtIP(st.IP)}</td><td>${st.W}</td><td>${st.L}</td><td>${st.SV||0}</td><td>${st.HLD||0}</td><td>${st.SO}</td><td>${pitBB(st)}</td><td>${era}</td><td>${whip}</td></tr>`;
  }else{
    const obpN = st.PA>0 ? (st.H+st.BB)/st.PA : 0;
    const slgN = slgOf(st);
    const avg = st.AB>0 ? (st.H/st.AB).toFixed(3).replace(/^0/,'') : '-';
    const obp = st.PA>0 ? obpN.toFixed(3).replace(/^0/,'') : '-';
    const slg = st.AB>0 ? slgN.toFixed(3).replace(/^0/,'') : '-';
    const ops = st.AB>0 ? (obpN+slgN).toFixed(3).replace(/^0/,'') : '-';
    rows=`<tr><th>Yrs</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>H</th><th>HR</th><th>RBI</th><th>BB</th><th>SB</th><th>DEF</th></tr>
    <tr><td>${yrsOf(st,false)}</td><td>${st.G}</td><td>${st.PA}</td><td>${avg}</td><td>${obp}</td><td>${slg}</td><td>${ops}</td><td>${st.H}</td><td>${st.HR}</td><td>${st.RBI}</td><td>${st.BB||0}</td><td>${st.SB}</td><td>${st.DEF>0?'+':''}${st.DEF||0}</td></tr>`;
  }
  const asN=st.AS||0;
  const side名=side==='pit'?'・投球':side==='bat'?'・打擊':'';
  return `<p style="margin-top:8px"><b>${LG_N[bucket]}${side名}</b>${asN&&side!=='bat'?` · 明星賽 ${asN} 度入選`:''}</p><table class="fin">${rows}</table>`;
}
/* 一個聯盟的累積數據：單刀一張、二刀流投打各一張。 */
export function statTables(bucket){
  if(!twoWayView())return statTable(bucket);
  return statTable(bucket,'pit')+statTable(bucket,'bat');
}
export function milestoneLevel(st,key,unit){ return Math.floor((st&&st[key]||0)/unit)*unit; }
export function milestoneLine(label,st,defs,onlyKeys){
  if(!st)return '';
  const parts=[];
  defs.forEach(([key,unit,suffix])=>{
    if(onlyKeys&&!onlyKeys.has(key))return;
    const value=milestoneLevel(st,key,unit); if(value)parts.push(`${value}${suffix}`);
  });
  return parts.length?`${label} ${parts.join('・')}`:'';
}
export function careerMilestones(){
  const out=[];
  (S.hofInfo||[]).forEach(h=>out.push(`${h.lg}名人堂｜第 ${h.yr} 年入選｜得票率 ${h.pct}%`));
  const leagues=['MLB','NPB','CPBL'];
  /* 二刀流兩邊的里程碑都要列(勝場、三振、局數 ＋ 安打、全壘打、打點…)。 */
  const defs=(S.pos==='TW'||(S.twSeasons||0)>0)?MILESTONE_DEF.pit.concat(MILESTONE_DEF.bat)
    :S.pos==='P'?MILESTONE_DEF.pit:MILESTONE_DEF.bat;
  const played=leagues.filter(b=>{const st=S.stats[b];return st&&((st.yr||0)>0||(st.G||0)>0||(st.PA||0)>0||(st.IP||0)>0);});
  const sum={}; defs.forEach(([key])=>sum[key]=0);
  played.forEach(b=>defs.forEach(([key])=>sum[key]+=S.stats[b][key]||0));
  /* 通算只在兩聯盟以上且加總真的跨過任何單一聯盟的下一級里程碑時，額外列出該項；各聯盟紀錄仍全部保留。 */
  if(played.length>=2){
    const raised=new Set();
    defs.forEach(([key,unit])=>{
      const combined=milestoneLevel(sum,key,unit);
      const best=Math.max(0,...played.map(b=>milestoneLevel(S.stats[b],key,unit)));
      if(combined>best)raised.add(key);
    });
    const total=milestoneLine('通算',sum,defs,raised); if(total)out.push(total);
  }
  leagues.forEach(b=>{const m=milestoneLine(LG_N[b],S.stats[b],defs);if(m)out.push(m);});
  return out;
}
export function honorRank(awd){
  const intl=/經典賽|12強|奧運|亞運|國家隊/.test(awd);
  const league=intl?0:(/大聯盟|世界大賽/.test(awd)?1:(/日職|日本一/.test(awd)?2:(/中職/.test(awd)?3:4)));
  const kind=/總冠軍|世界大賽冠軍|日本一$/.test(awd)?0:/二天一流/.test(awd)?1:/年度MVP/.test(awd)?2:/三冠王/.test(awd)?3:/MVP/.test(awd)?4:
    /最佳投手|最佳打者|賽揚/.test(awd)?5:/金手套/.test(awd)?6:/守備聖經/.test(awd)?7:/王/.test(awd)?8:/明星賽/.test(awd)?10:9;
  return league*11+kind;
}
/* ── 獎項分組：通用／投手／打擊 ──
   原本全部擠在同一張清單裡，投手獎跟打擊獎混在一起。單刀球員還看得下去，
   二刀流的清單直接變成一團——他兩邊的獎都有。

   分法就照獎項本身屬於哪一邊：
     · 投手：勝投王／防禦率王／三振王／救援王／中繼王／投手三冠王／年度最佳投手
     · 打擊：打擊王／全壘打王／打點王／上壘王／盜壘王／打擊三冠王／年度最佳打者／金手套／守備聖經
     · 通用：其餘全部——年度MVP、二天一流（投打雙三冠，不屬於任何一邊）、
             總冠軍與日本一、明星賽、國際賽的名次與賽會MVP、學生時代的大賽冠軍
   金手套與守備聖經放進打擊那一組，是因為它們是「野手」的獎；投手金手套本遊戲沒有。 */
/* 分組規則本體在 award-rules.js（季末的年度獎項卡也要用同一套）。 */
export function honorSections(groups){
  return splitBySide(groups||honorGroups(),g=>g.awd)
    .map(sec=>({key:sec.key,name:sec.name,groups:sec.items}));
}
export function honorGroups(){
  const map=new Map();
  S.honors.forEach(h=>{ const parts=h.split(' '), yr=parts.length>=2?parts.shift():''; const awd=parts.length?parts.join(' '):h;
    if(!map.has(awd))map.set(awd,[]); map.get(awd).push(yr); });
  return [...map].map(([awd,yrs])=>({awd,yrs})).sort((a,b)=>honorRank(a.awd)-honorRank(b.awd)||a.awd.localeCompare(b.awd,'zh-Hant'));
}
export function yearRanges(yrs){
  const nums=yrs.filter(Boolean).map(Number).sort((a,b)=>a-b); if(!nums.length)return [];
  const res=[]; let st=nums[0],ed=nums[0];
  for(let i=1;i<=nums.length;i++){
    if(i<nums.length&&nums[i]===ed+1)ed=nums[i];
    else{res.push(ed-st>=2?`${st}~${ed}`:ed-st===1?`${st}、${ed}`:`${st}`);if(i<nums.length){st=nums[i];ed=nums[i];}}
  }
  return res;
}
export function honorText(g){
  const ranges=yearRanges(g.yrs), count=g.yrs.length;
  if(!ranges.length)return g.awd;
  return count>1?`${g.awd} ×${count} (${ranges.join('、')})`:`${g.awd} (${ranges[0]})`;
}
