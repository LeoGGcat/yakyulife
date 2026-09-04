import {S} from '../core/state.js?v=1.5.12';
import {clamp} from '../core/rng.js?v=1.5.12';
import {DPN, POSN, POS_ADJ_RUNS, POS_TIER_K, POS_TIER_STR} from '../data/abilities.js?v=1.5.12';
import {LG_N} from '../data/teams.js?v=1.5.12';
import {TIER_TH, LEAGUE_K, MILESTONE_DEF, HOF_TH_K} from '../data/economy.js?v=1.5.12';
import {fmtIP, slgOf, roleName3, baseballERA, baseballWHIP} from './season.js?v=1.5.12';
import {isCareerScoringAward} from './award-rules.js?v=1.5.12';
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
   在總分上輾壓真正壓制力強的先發。用生涯 ERA/WHIP 相對聯盟參考值(3.40/1.15，
   對齊「稱職先發」與「王牌先發」的真實分界)算出一個 0.50~1.60 倍的品質係數，
   乘回堆疊分數，讓失分率真正影響評價高低，同時讓各等級先發的級距拉開。 */
export function pitcherQualityFactor(st){
  const era=baseballERA(st), whip=baseballWHIP(st);
  let q=1;
  if(era!=null)q+=clamp((3.40-era)*0.15,-0.40,0.40);
  if(whip!=null)q+=clamp((1.15-whip)*0.30,-0.20,0.20);
  return clamp(q,0.50,1.60);
}
export function pitcherCareerScore(st,bucket){
  const base=st.W*13+(st.SV||0)*8+(st.HLD||0)*3+st.SO*0.9+st.IP*0.35+reliefMilestoneScore(st,bucket);
  return base*pitcherQualityFactor(st);
}
/* 打者生涯評價的質量校正：對齊投手 pitcherQualityFactor 的設計，用生涯打擊率／OPS
   相對聯盟參考值(0.270／0.760)算出 0.50~1.60 倍品質係數，讓打者也有跟投手對稱的
   品質校正，不會因為打者本來沒有品質校正而系統性地比投手更難拿到榮譽級評價。
   末尾 0.67 是配合 LEAGUE_K 重新以「絕對能力值換算生涯總分」實測校準出的尺度，
   讓投手/打者在同一把 TIER_TH 尺上大致對齊(細節見 economy.js 的 LEAGUE_K 說明)。 */
export function hitterQualityFactor(st){
  const ab=st&&st.AB||0, pa=st&&st.PA||0;
  if(!ab||!pa)return 1;
  const avg=st.H/ab, obp=(st.H+(st.BB||0))/pa, slg=slgOf(st), ops=obp+slg;
  let q=1;
  q+=clamp((avg-0.270)*3.0,-0.35,0.35);
  q+=clamp((ops-0.760)*0.6,-0.20,0.20);
  return clamp(q,0.50,1.60);
}
export function hitterCareerScore(st,bucket){
  const base=st.H+st.HR*3+st.SB*0.8+st.RBI*0.5+st.BB*0.3+(st.DEF||0)*6+positionScore(st,bucket);
  return base*hitterQualityFactor(st)*0.67;
}
export function careerScore(st,bucket){
  if(S.pos==='P')return pitcherCareerScore(st,bucket);
  return hitterCareerScore(st,bucket);
}
export function primaryPos(){ /* 生涯主守位:過半→該位;無過半→工具人/搖擺人(年數降序) */
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
  years.forEach(awards=>{
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
  if(S.pos==='P'||!st||!st.DPG)return 1;
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
  const posKey=S.pos!=='P'?'H':((st.SV||0)>=(st.IP||0)/1.05*0.4?'CL':'P');
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
export function statTable(bucket){
  const st=S.stats[bucket]; if(!st)return '';
  let rows;
  if(S.pos==='P'){
    const era=st.IP>0?baseballERA(st).toFixed(2):'-';
    const whip=st.IP>0?baseballWHIP(st).toFixed(2):'-';
    rows=`<tr><th>Yrs</th><th>G</th><th>IP</th><th>W</th><th>L</th><th>SV</th><th>HLD</th><th>SO</th><th>BB</th><th>ERA</th><th>WHIP</th></tr>
    <tr><td>${st.yr}</td><td>${st.G}</td><td>${fmtIP(st.IP)}</td><td>${st.W}</td><td>${st.L}</td><td>${st.SV||0}</td><td>${st.HLD||0}</td><td>${st.SO}</td><td>${st.BB||0}</td><td>${era}</td><td>${whip}</td></tr>`;
  }else{
    const obpN = st.PA>0 ? (st.H+st.BB)/st.PA : 0;
    const slgN = slgOf(st);
    const avg = st.AB>0 ? (st.H/st.AB).toFixed(3).replace(/^0/,'') : '-';
    const obp = st.PA>0 ? obpN.toFixed(3).replace(/^0/,'') : '-';
    const slg = st.AB>0 ? slgN.toFixed(3).replace(/^0/,'') : '-';
    const ops = st.AB>0 ? (obpN+slgN).toFixed(3).replace(/^0/,'') : '-';
    rows=`<tr><th>Yrs</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>H</th><th>HR</th><th>RBI</th><th>BB</th><th>SB</th><th>DEF</th></tr>
    <tr><td>${st.yr}</td><td>${st.G}</td><td>${st.PA}</td><td>${avg}</td><td>${obp}</td><td>${slg}</td><td>${ops}</td><td>${st.H}</td><td>${st.HR}</td><td>${st.RBI}</td><td>${st.BB||0}</td><td>${st.SB}</td><td>${st.DEF>0?'+':''}${st.DEF||0}</td></tr>`;
  }
  const asN=st.AS||0;
  return `<p style="margin-top:8px"><b>${LG_N[bucket]}</b>${asN?` · 明星賽 ${asN} 度入選`:''}</p><table class="fin">${rows}</table>`;
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
  const defs=S.pos==='P'?MILESTONE_DEF.pit:MILESTONE_DEF.bat;
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
  const kind=/總冠軍|世界大賽冠軍|日本一$/.test(awd)?0:/年度MVP/.test(awd)?1:/三冠王/.test(awd)?2:/MVP/.test(awd)?3:
    /最佳投手|最佳打者|賽揚/.test(awd)?4:/金手套/.test(awd)?5:/守備聖經/.test(awd)?6:/王/.test(awd)?7:/明星賽/.test(awd)?9:8;
  return league*10+kind;
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
