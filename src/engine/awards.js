import {S} from '../core/state.js?v=1.5.12';
import {chance, clamp} from '../core/rng.js?v=1.5.12';
import {DPN, GLOVE_TH, GLOVE_K} from '../data/abilities.js?v=1.5.12';
import {LV} from '../data/teams.js?v=1.5.12';
import {card} from '../ui/dom.js?v=1.5.12';
import {tlNote} from '../ui/timeline.js?v=1.5.12';
import {isSP, slgOf, baseballERA} from './season.js?v=1.5.12';
import {isCareerScoringAward} from './award-rules.js?v=1.5.12';
import {traitCard, removeTrait} from '../flow/events.js?v=1.5.12';
/* 獎項機率同時有硬下限與必得上限；數值越低越好的獎項（ERA）用 lower=true。 */
export function awardP(value,hardLow,autoWin,base=25,lower=false){
  const ineligible=lower?value>hardLow:value<hardLow;
  const automatic=lower?value<=autoWin:value>=autoWin;
  if(ineligible)return 0;
  if(automatic)return 100;
  const progress=lower?(hardLow-value)/(hardLow-autoWin):(value-hardLow)/(autoWin-hardLow);
  return clamp(base+progress*(95-base),base,95);
}
export function rookieAwardGuaranteed(honors,year,leagueName){
  const sameLeagueAwards=honors.filter(x=>x.startsWith(`${year} ${leagueName}`));
  const elite=sameLeagueAwards.some(x=>/年度MVP|最佳投手|最佳打者|賽揚/.test(x));
  const titleCount=sameLeagueAwards.filter(x=>/(勝投王|防禦率王|三振王|救援王|中繼王|打擊王|全壘打王|盜壘王|打點王|上壘王)$/.test(x)).length;
  return elite||titleCount>=2;
}
/* 新人資格以「曾站上更高聯盟」為準：小聯盟／二軍經歷不會取消中職新人資格，
   但打過日職或大聯盟後返台，以及打過大聯盟後轉戰日職，均不再是新人。 */
export function rookieLeagueEligible(bucket,stats=S.stats){
  if(bucket==='CPBL')return !(stats&&stats.NPB)&&!(stats&&stats.MLB);
  if(bucket==='NPB')return !(stats&&stats.MLB);
  return bucket==='MLB';
}
/* 新人王至少要有一段可評價的一軍球季；門檻依聯盟場次等比縮放。 */
export function rookieWorkloadEligible(bucket,st,pos,role){
  pos=pos||(S&&S.pos); role=role||(S&&S.role);
  const games=((LV[({CPBL:'CPBL1',NPB:'NPB1',MLB:'MLB'})[bucket]]||{}).g)||120;
  if(pos==='P'){
    if(role==='SP')return (st.G||0)>=Math.ceil(games*.08)&&(st.IP||0)>=Math.ceil(games*.40);
    return (st.G||0)>=Math.ceil(games*.25)&&(st.IP||0)>=Math.ceil(games*.12);
  }
  return (st.G||0)>=Math.ceil(games*.40)&&(st.PA||0)>=Math.ceil(games*1.50);
}
export function canUnlockPhoenix(added,state=S){
  if(!state.traits.glass||state.traits.phoenix||state.glassYear===state.year)return false;
  return (added||[]).some(x=>isCareerScoringAward(String(x).replace(/^\d{4}\s+/,'')));
}
export function pitcherAwardName(bucket){
  const leagueName={CPBL:'中職',NPB:'日職',MLB:'大聯盟'}[bucket];
  return `${leagueName}年度最佳投手`;
}
export function batterAwardName(bucket){
  const leagueName={CPBL:'中職',NPB:'日職',MLB:'大聯盟'}[bucket];
  return `${leagueName}年度最佳打者`;
}
export function relieverAceChance(st,role){
  const era=Number(st&&st.era);
  if(role!=='CL'||!Number.isFinite(era)||st.G<50||era>2.20||(st.SV||0)<35)return 0;
  return clamp(
    3+Math.max(0,2.20-era)*8+Math.max(0,(st.SV||0)-35)*0.4+Math.max(0,(st.d||0)-10)*0.8,
    3,18
  );
}
export function awards(bucket,st){
  if(!LV[S.lv].top||S.seasonFactor===0)return;
  const y=S.year,h=S.honors,lgN={CPBL:'中職',NPB:'日職',MLB:'大聯盟'}[bucket],aceName=pitcherAwardName(bucket),bestBatterName=batterAwardName(bucket);

  /* 符合 simSeason 數學邏輯的門檻表 [必不得獎下限, 必得獎上限] */
  /* 比率數據(ERA/AVG/OBP)與非場次連動數據(SV/HLD/SB)三個聯盟統一標準 */
  /* 只有吃打席/局數的(HR/RBI/SO)依 120:143:162 場次等比放大 */
  /* 投手的量產型獎項(SO/W)依「先發輪次」放大,不是依球季場次:日職是六人輪值,
     143 場 / 6 人 = 23.8 輪，與中職 120 場 / 5 人 = 24.0 輪幾乎相同，所以門檻與中職同級；
     大聯盟 162 場 / 5 人 = 32.4 輪，比中職多 35%，門檻才該放大(so 175、w 14)。
     舊版按場次放大成 so 155 / w 12，但日職先發的實際工作量並沒有跟著長，
     造成日職名人堂級投手 15 年只拿 0.7 座三振王。 */
  /* era(最佳投手)門檻收緊為[2.90,1.90](原[3.20,2.20])，避免生涯夠長時單靠中等偏上的ERA
     就能反覆拿下最高榮譽；eraK(防禦率王)則刻意更嚴格，避免同一顆ERA每年雙開兩個獎項。 */
  const TH = {
    CPBL: { g: 120, era: [2.90, 1.90], eraK: [2.80, 1.60], sv: [22, 35], hld: [18, 30], so: [130, 180], w: [10, 16], avg: [0.300, 0.360], hr: [20, 32], rbi: [75, 105], obp: [0.370, 0.430] },
    NPB:  { g: 143, era: [2.90, 1.90], eraK: [2.80, 1.60], sv: [22, 35], hld: [18, 30], so: [132, 183], w: [10, 16], avg: [0.300, 0.360], hr: [24, 38], rbi: [90, 125], obp: [0.370, 0.430] },
    MLB:  { g: 162, era: [3.50, 2.40], eraK: [3.40, 2.25], sv: [22, 35], hld: [18, 30], so: [175, 240], w: [14, 20], avg: [0.300, 0.360], hr: [27, 43], rbi: [100, 140], obp: [0.370, 0.430] }
  };
  /* v1.6.0 大聯盟的 ERA 門檻改為 [3.50,2.40]／防禦率王 [3.40,2.25]，不再與中職日職共用。
     比率型門檻(ERA/AVG/OBP)本來統一是有道理的——它們不隨球季場次變動。但它們隨
     「聯盟基準(par)」變動：同一個能力值的球員，在中職是 par+18、在大聯盟只有 par+3。
     實測 100 局以上球季的 ERA 分布：
       中職   最佳10% 1.66 ／ 中位 2.97   → 達 2.90 的球季 48.3%
       日職   最佳10% 2.20 ／ 中位 3.40   → 29.9%
       大聯盟 最佳10% 3.21 ／ 中位 4.33   → 4.6%
     大聯盟連「最佳 10% 的球季」都摸不到 2.90，年度最佳投手變成一個再怎麼投都拿不到
     的獎(生涯中位 1 座，日職 6 座)。打者的比率門檻不動：打率達 .300 的比例是
     47.7%／39.7%／30.8%，階梯本來就正常。
     註：這一項只值約 60 分，遠不足以解釋大聯盟的名人堂缺口(那是 economy.js 的
     Kbase 問題)，但「拿不到的獎」本身就是壞掉的體驗，該修。 */
  const th = TH[bucket] || TH.CPBL;

  /* 1. 明星賽入選：一般球隊須先達真實成績門檻；台中猛獁可用 30% 人氣票入選。 */
  {
    const d=st.d;
    const popular=bucket==='CPBL'&&S.orgTeam==='台中猛獁';
    const workloadOK=S.pos==='P'
      ? (isSP()?st.IP>=60:st.G>=25)
      : st.PA>=Math.round(LV[S.lv].g*1.7);
    let performanceOK=false;
    if(S.pos==='P'){
      const era=baseballERA(st)??99;
      performanceOK=isSP()
        ? st.IP>=80&&era<=4.00
        : st.G>=30&&era<=3.80&&((st.SV||0)>=10||(st.HLD||0)>=10||d>=2);
    }else{
      const obp=st.PA>0?(st.H+st.BB)/st.PA:0;
      const ops=obp+slgOf(st);
      performanceOK=st.PA>=300&&(st.avg>=0.260||ops>=0.750||st.HR>=15||st.SB>=15);
    }
    let asP=0;
    if(workloadOK){
      if(performanceOK)asP=awardP(d,0,10,10);
      if(popular)asP=performanceOK?clamp(asP+30,30,97):30;
    }
    if(chance(asP)){
      S.stats[bucket].AS++;
      h.push(`${y} ${lgN}明星賽`+(popular&&!performanceOK?'（人氣入選）':''));
    }
  }

  /* 2. 投手個人獎項 */
  let pitcherTripleCrown=false;
  if(S.pos==='P'){
    if(isSP() && st.IP >= th.g){
      let p=awardP(st.era,th.era[0],th.era[1],30,true);
      if(p>0&&p<100)p=clamp(p+(st.IP-th.g)*0.35,30,95);
      if(p===100&&st.IP<150)p=95;
      if(chance(p)) h.push(`${y} ${aceName}`);
    }else{
      /* 神級終結者可低機率角逐年度最佳投手；門檻比後援 MVP 更明確，機率上限仍僅 18%。 */
      const p=relieverAceChance(st,S.role);
      if(p>0&&chance(p))h.push(`${y} ${aceName}`);
    }
    if(S.role==='CL'){
      const p=awardP(st.SV,th.sv[0],th.sv[1],28);
      if(chance(p)) h.push(`${y} ${lgN}救援王`);
    }
    if(S.role==='MR'){
      const p=awardP(st.HLD||0,th.hld[0],th.hld[1],28);
      if(chance(p)) h.push(`${y} ${lgN}中繼王`);
    }
    /* 勝投王／防禦率王／三振王：三項齊得即觸發投手三冠王，必得年度MVP。 */
    let hasWinTitle=false, hasEraTitle=false, hasSoTitle=false;
    { const p=awardP(st.W,th.w[0],th.w[1]); if(chance(p)){ h.push(`${y} ${lgN}勝投王`); hasWinTitle=true; } }
    if(isSP() && st.IP >= th.g){ /* 防禦率王門檻比最佳投手嚴格,避免同一顆ERA每年雙開兩個獎項 */
      const p=awardP(st.era,th.eraK[0],th.eraK[1],25,true);
      if(chance(p)){ h.push(`${y} ${lgN}防禦率王`); hasEraTitle=true; }
    }
    { const p=awardP(st.SO,th.so[0],th.so[1]); if(chance(p)){ h.push(`${y} ${lgN}三振王`); hasSoTitle=true; } }
    /* 三冠中拿下兩項以上，實力已無庸置疑，直接保底年度最佳投手。 */
    const pitcherTitleCount=[hasWinTitle,hasEraTitle,hasSoTitle].filter(Boolean).length;
    if(pitcherTitleCount>=2 && !h.includes(`${y} ${aceName}`)) h.push(`${y} ${aceName}`);
    pitcherTripleCrown = hasWinTitle && hasEraTitle && hasSoTitle;
    if(pitcherTripleCrown){
      h.push(`${y} ${lgN}投手三冠王`);
      if(!S.pitcherTCLeagues.includes(lgN)){
        S.pitcherTCLeagues=[...S.pitcherTCLeagues,lgN];
        S.traits.pitcherTC=true;
        card('gold',`隱藏屬性解鎖：${lgN}投手三冠王`,
          `勝投、防禦率、三振同時稱王——一整個球季，你就是聯盟裡最強的那個投手。<b class="hl">${lgN}投手三冠王</b>，王牌中的王牌，至高的榮耀。`);
      }
    }
  }
  /* 3. 野手個人獎項 */
  let hitterTripleCrown=false;
  if(S.pos!=='P'){
    /* 年度最佳打者:比照最佳投手,先過近乎全勤的打席門檻,再以OPS機率角逐。
       門檻收緊為[0.900,1.050](原[0.820,1.000])，避免生涯夠長時單靠中等偏上的OPS
       就能反覆拿下最高榮譽。 */
    { const paGate=Math.round(LV[S.lv].g*3.6);
      if(st.PA >= paGate){
        const obp0=st.PA>0?(st.H+st.BB)/st.PA:0, ops0=obp0+slgOf(st);
        let p=awardP(ops0,0.900,1.050,30);
        if(p>0&&p<100)p=clamp(p+(st.PA-paGate)*0.08,30,95);
        if(p===100&&st.PA<paGate*1.15)p=95;
        if(chance(p)) h.push(`${y} ${bestBatterName}`);
      }
    }
    let hasAvgTitle=false, hasHrTitle=false, hasRbiTitle=false;
    if(st.PA >= 350){
      const p=awardP(st.avg,th.avg[0],th.avg[1]);
      if(chance(p)){ h.push(`${y} ${lgN}打擊王`); hasAvgTitle=true; }
    }
    if(st.PA >= 300){
      const p=awardP(st.HR,th.hr[0],th.hr[1]);
      if(chance(p)){ h.push(`${y} ${lgN}全壘打王`); hasHrTitle=true; }
    }
    if(st.PA >= 300){ // SB不隨場次放大，全聯盟標準一致
      const p=awardP(st.SB,25,45);
      if(chance(p)) h.push(`${y} ${lgN}盜壘王`);
    }
    if(st.PA >= 300){
      const p=awardP(st.RBI,th.rbi[0],th.rbi[1]);
      if(chance(p)){ h.push(`${y} ${lgN}打點王`); hasRbiTitle=true; }
    }
    const obp = st.PA > 0 ? (st.H + st.BB) / st.PA : 0;
    if(st.PA >= 350){
      const p=awardP(obp,th.obp[0],th.obp[1]);
      if(chance(p)) h.push(`${y} ${lgN}上壘王`);
    }
    const def1 = st.DEF || 0;
    const awardDp=st._dh?'DH':(S.dpos||(S.pos==='C'?'C':null));
    const gloveMinG=Math.ceil(LV[S.lv].g*0.5);
    if(awardDp&&awardDp!=='DH'&&st.G>=gloveMinG){
      const gt=GLOVE_TH[awardDp]||[4,16];
      /* 必得獎上限依聯盟可達 DEF 上限縮放(詳見 abilities.js 的 GLOVE_K)；下限不動。 */
      const gk=GLOVE_K[S.lv]||1;
      const top=v=>Math.max(v*gk,v*0.5); /* 保險:縮放後仍必定高於下限 */
      const gloveAward=`${y} ${lgN}${DPN[awardDp]}金手套`;
      const pGlove=awardP(def1,gt[0],top(gt[1]),30);
      if(chance(pGlove))h.push(gloveAward);
      const pBible=awardP(def1,9,top(22),25);
      if(chance(pBible)){
        h.push(`${y} ${lgN}守備聖經`);
        if(!h.includes(gloveAward))h.push(gloveAward); /* 守備聖經必定同時拿下金手套 */
      }
    }
    /* 三冠中拿下兩項以上，攻擊產出已無庸置疑，直接保底年度最佳打者。 */
    const hitterTitleCount=[hasAvgTitle,hasHrTitle,hasRbiTitle].filter(Boolean).length;
    if(hitterTitleCount>=2 && !h.includes(`${y} ${bestBatterName}`)) h.push(`${y} ${bestBatterName}`);
    /* 打擊王／全壘打王／打點王：三項齊得即觸發打擊三冠王，必得年度MVP。 */
    hitterTripleCrown = hasAvgTitle && hasHrTitle && hasRbiTitle;
    if(hitterTripleCrown){
      h.push(`${y} ${lgN}打擊三冠王`);
      if(!S.hitterTCLeagues.includes(lgN)){
        S.hitterTCLeagues=[...S.hitterTCLeagues,lgN];
        S.traits.hitterTC=true;
        card('gold',`隱藏屬性解鎖：${lgN}打擊三冠王`,
          `打擊率、全壘打、打點同時稱王——攻擊三項數據無人能及。<b class="hl">${lgN}打擊三冠王</b>，棒球場上最華麗的頭銜，非你莫屬。`);
      }
    }
  }

  /* 4. 年度 MVP（最高榮譽）：先通過真實成績門檻，再與聯盟其他球員競爭。 */
  const isReliever=S.pos==='P'&&!isSP();
  let mvpQual=false;
  if(S.pos==='P'){
    if(isSP()){
      mvpQual=st.IP>=140&&st.era<=3.20&&(st.W>=12||st.SO>=th.so[0]);
    }else{
      mvpQual=st.G>=50&&st.era<=2.20&&((st.SV||0)>=35||(st.HLD||0)>=30);
    }
  }else{
    const obp=st.PA>0?(st.H+st.BB)/st.PA:0;
    const ops=obp+slgOf(st);
    mvpQual=st.PA>=LV[S.lv].g*3.6&&(
      ops>=0.850||
      st.HR>=th.hr[0]||
      (st.avg>=th.avg[0]&&st.RBI>=th.rbi[0])
    );
  }
  if(pitcherTripleCrown||hitterTripleCrown){
    /* 投手/打擊三冠王：必得年度MVP，不再走機率判定。 */
    h.push(`${y} ${lgN}年度MVP`);
  }else if(mvpQual&&S.seasonFactor>=0.9){
    if(isReliever){
      /* 後援 MVP 保持極低機率，且必須先達神級救援／中繼實績。 */
      const pMVP=clamp(
        0.5+Math.max(0,st.d-10)*0.4+Math.max(0,2.20-st.era)*2+
        Math.max(0,(st.SV||0)-35)*0.08+Math.max(0,(st.HLD||0)-30)*0.04,
        0.5,5
      );
      if(chance(pMVP))h.push(`${y} ${lgN}年度MVP`);
    }else{
      const pMVP=awardP(st.d,8,16,8);
      if(chance(pMVP))h.push(`${y} ${lgN}年度MVP`);
    }
  }

  /* 5. 新人王：先通過聯盟資歷與實際工作量，再判定獲獎；年度 MVP 只在合格後保底。 */
  const leagueRookie=S.stats[bucket].yr===1, rookieAward=`${y} ${lgN}新人王`;
  const annualMvpAwarded=h.some(x=>x===`${y} ${lgN}年度MVP`);
  const rookieOK=rookieLeagueEligible(bucket,S.stats)&&rookieWorkloadEligible(bucket,st,S.pos,S.role);
  if(leagueRookie&&rookieOK&&annualMvpAwarded&&!h.includes(rookieAward)){
    h.push(rookieAward);
  }else if(leagueRookie&&rookieOK){
    const rkP=rookieAwardGuaranteed(h,y,lgN)?100:awardP(st.d,4,10,30);
    if(chance(rkP)) h.push(rookieAward);
  }

  /* 6. 後續獲獎觸發特質 */
  const added=h.filter(x=>x.startsWith(String(y)));
  if(added.length){ card('gold','年度獎項',added.map(x=>x.slice(5)).join('｜'));
    const topAw=added.find(x=>/年度MVP/.test(x))||added.find(x=>/最佳投手|最佳打者|王/.test(x))||added.find(x=>/新人王/.test(x))||added[0];
    tlNote(3,topAw.slice(5));
    if(S.traits.yips){ removeTrait('yips','失憶症'); card('good','走出陰影','站上大舞台拿下獎項的那一刻，腦海裡的雜音消失了——<b class="hl">失憶症痊癒</b>。'); }
    if(canUnlockPhoenix(added)){ S.traits.phoenix=true; removeTrait('glass','玻璃人');
        S.pool+=8;
        card('gold','隱藏屬性解鎖：浴火重生','那些殺不死你的，真的讓你更強大了。受傷的地方逐漸痊癒，長成了更強壯的形狀。——<b class="hl">玻璃人懲罰解除，受傷率恢復正常，並獲得一大筆能力點</b>。'); }
    const annualMvp=added.some(x=>/年度MVP/.test(x));
    if(annualMvp&&S.age>=35&&!S.traits.oldghost&&!S.oldGhostUsed){
      S.oldGhostPending=true;
      traitCard('oldghost','老鬼','別人正在衰退，而你再一次抵達頂點。時間在你身上彷彿未留下痕跡，球迷們開始叫你老鬼，因為你用成績告訴年輕選手，過去是你的，現在是你的，未來也會是你的。下一年衰退減緩50%。');
    }
    if(annualMvp&&S.age<24&&(bucket==='NPB'||bucket==='MLB')){
      const key=S.pos==='P'?'strongpitch':'stronghit',name=S.pos==='P'?'強投少年':'強打少年';
      if(!S.traits[key])traitCard(key,name,'天空才是你的極限，怪物的成績，不過是你傳奇生涯的起點');
    }
  }
}
