import {S, blankStat, bucketOf, nextStep, stageLabel} from '../core/state.js?v=2.1.0';
import {R, ri, chance, clamp, N0} from '../core/rng.js?v=2.1.0';
import {POS_ADJ_RUNS, POS_PT_BAR} from '../data/abilities.js?v=2.1.0';
import {LV, HS_CUPS, U_CUPS, spLoad, envRate, envAvg, envHR9, ENV_K, hrCapRate, avgCapOf, softCap, softBoost} from '../data/teams.js?v=2.1.0';
import {pitchTh, batTh} from '../data/thresholds.js?v=2.1.0';
import {card, board} from '../ui/dom.js?v=2.1.0';
import {ovr, careerAllStars, toolGap} from './ability.js?v=2.1.0';
import {tjAccrue, tjGamble} from './injury.js?v=2.1.0';
/* temporary scaffold until awards/intl/contract/flow are extracted */
import {demotionAudit} from './contract.js?v=2.1.0';
import {awards} from './awards.js?v=2.1.0';
import {maybeIntl} from './intl.js?v=2.1.0';
import {traitCard, removeTrait} from '../flow/events.js?v=2.1.0';
export function bullpenRole(){ /* 牛棚內依上季表現判定中繼／終結者，與先發體力門檻分開。 */
  /* 牛棚:讀「上一季」的 d(prevD,因為 lastD 已被 phasePre 清空);頂尖 → 終結者 */
  const pd=(S.prevD!==undefined?S.prevD:(S.lastD||0));
  /* 只有上一季已在相同頂級聯盟投牛棚，該季成績才可用於終結者升降。
     二軍升一軍、跨聯盟或舊存檔缺少 lastLv 時，第一季一律先從中繼開始。 */
  const currentTop=LV[S.lv]&&LV[S.lv].top, previousTop=LV[S.lastLv]&&LV[S.lastLv].top;
  const sameTopLeague=!!currentTop&&previousTop===currentTop;
  const d=(sameTopLeague&&S.role&&S.role!=='SP')?pd:-99;
  if(S.role==='CL')return d>=1?'CL':'MR';   /* 終結者崩盤才降中繼 */
  return d>=3?'CL':'MR';                     /* 中繼打出頂尖成績升終結者 */
}
export function pitcherRole(){ /* 體力 >=52 先發;否則牛棚,牛棚內看表現升終結者 */
  if(S.ab.sta>=52)return 'SP';
  return bullpenRole();
}
export function outsFromIP(ip){ /* 模擬用十進位局數統一量化為實際出局數 */
  return Math.max(0,Math.round((Number(ip)||0)*3));
}
export function ipFromOuts(outs){
  return Math.max(0,Math.round(Number(outs)||0))/3;
}
export function normalizeIP(ip){
  return ipFromOuts(outsFromIP(ip));
}
export function baseballERA(st){
  const ip=normalizeIP(st&&st.IP);
  return ip>0?(Number(st&&st.ER)||0)*9/ip:null;
}
export function baseballWHIP(st){
  const ip=normalizeIP(st&&st.IP);
  return ip>0?(pitH(st)+pitBB(st))/ip:null;
}
export function fmtIP(ip){ /* 以出局數顯示棒球局數：1/3 局=.1、2/3 局=.2 */
  const outs=outsFromIP(ip);
  return Math.floor(outs/3)+'.'+(outs%3);
}
export function roleN(r){ return {SP:'先發',MR:'中繼',CL:'終結者'}[r]||'—'; }
export function isSP(){ return S.role==='SP'; } /* 先發引擎判定 */
/* ================= 數據模擬 ================= */
export function scaledSteals(fullSeason,pa,leagueGames){
  return Math.round(Math.max(0,fullSeason||0)*clamp((pa||0)/((leagueGames||1)*4.25),0,1));
}
export function capSteals(st){
  const timesOnBase=Math.max(0,(st.H||0)+(st.BB||0));
  const physicalCap=Math.min(Math.floor((st.PA||0)*0.35),Math.floor(timesOnBase*1.5));
  st.SB=Math.max(0,Math.min(Math.round(st.SB||0),physicalCap));
}
/* ---------- 二刀流:投打共存的三個約定 ----------
   ① st.G 一律是「打擊出賽數」，投球場次另存 st.GP。單刀投手沒有 GP，所以所有讀取
      投球場次的地方都要走 pitG()——直接讀 st.G 會把二刀流的打擊出賽當成登板數，
      TJ 累積與救援上限會被灌爆。
   ② st.dPit / st.dBat 是兩側各自的品質值，st.d 是給薪資與市場用的單一數字。
   ③ 開季投打配比(S.effort)決定投球場次的比例與打擊出賽的折扣。 */
export const pitG=st=>Number.isFinite(st&&st.GP)?st.GP:((st&&st.G)||0);
/* ④ 被安打與四死球同樣要分家。二刀流的 st.H/st.BB 是他自己敲的安打與被保送，
   投球側的被安打／投出的四死球另存 st.pH/st.pBB——共用同一個欄位的話，
   WHIP 會變成「(自己的安打＋自己的保送)÷投球局數」，而且賽季狀態倍率會在
   兩側互相抵銷(投手側 ÷m 之後打擊側再 ×m)，等於兩邊的狀態調整都失效。
   單刀投手沒有 pH/pBB，一律走這兩個讀取函式回退到 H/BB。 */
export const pitH=st=>Number.isFinite(st&&st.pH)?st.pH:((st&&st.H)||0);
export const pitBB=st=>Number.isFinite(st&&st.pBB)?st.pBB:((st&&st.BB)||0);
/* ⑤ ERA 一律從被安打／四死球／被全壘打／三振反推，不再獨立擲。
   舊版 era 是自己一條式子(4.32 − d*0.17)，跟 WHIP 的兩個零件毫無關係，所以
   par 的投手會同時印出 WHIP 1.53 與 ERA 4.32——同一列上的兩個數字互相打臉。

   會改動投球成績的地方有四個(產生、賽季狀態倍率、火燙低潮、投法加成)，
   四個都必須走這一支重算，ERA 才不會又跟零件走散。運氣項只在產生時擲一次，
   存成 st.eraLuck 之後每次重算都沿用，重算不會把運氣洗掉。
   係數是各事件的得分價值：被安打 .38、四死 .32、被全壘打 1.45、三振 −.04。 */
export function eraFromComponents(st,lv){
  const L=LV[lv]; if(!L||!L.env)return st.era||0;
  const E=L.env, ip=normalizeIP(st&&st.IP); if(!(ip>0))return st.era||0;
  const per9=v=>(v||0)/ip*9, hrLg=envHR9(E);
  return clamp(E.era+(per9(pitH(st))-E.h9)*0.38+(per9(pitBB(st))-E.bb9)*0.32
    +(per9(st.pHR)-hrLg)*1.45-(per9(st.SO)-E.k9)*0.04+(st.eraLuck||0),0.60,9.90);
}
/* 重算 ERA 並讓自責分跟著走。任何動到投球零件的地方，收尾都呼叫這一支。 */
export function syncEra(st,lv){
  st.era=eraFromComponents(st,lv);
  st.ER=Math.round(st.era*normalizeIP(st.IP)/9);
  st.WHIP=normalizeIP(st.IP)>0?+(baseballWHIP(st)||0).toFixed(2):(st.WHIP||0);
  return st.era;
}
/* tj 是手肘磨損倍數，由 injury.js 的 tjAccrue 讀走——放在這裡是為了讓
   「投多少、打多少、磨多少」三個數字並排在同一張表上。 */
export const TW_EFFORT={
  '全力投':{pit:0.85,bat:0.90,tj:1.55},
  '普通投':{pit:0.70,bat:1.00,tj:1.35},
  '養生球':{pit:0.50,bat:1.00,tj:1.20},
};
export const twEffort=()=>TW_EFFORT[S.effort]||TW_EFFORT['普通投'];
/* 二刀流的單一品質值:兩側取高，弱側再按比例回饋(最多 +6)。與 ovr() 同一套哲學——
   一個名額做兩份工，但不能直接相加:相加會直接衝破為單刀校準的薪資與評價曲線。
   係數留給第 3 階段的模擬校準。 */
export function twoWayD(p,b){ return +(Math.max(p,b)+clamp(Math.min(p,b)*0.35,0,6)).toFixed(2); }
/* 核薪用的合成係數比評價用的大。兩件事本來就不同：
   生涯評價問的是「他有多強」，薪水問的是「他幫球隊省下幾個名額」。
   一個中段的二刀流，打擊側照 DH 計價已經先挨了一刀(沒有守備價值)、出賽又比純打者少，
   於是 0.35 合成出來的薪水反而輸給同級的指定打擊——他做兩份工卻領得比較少。
   分開之後評價那條線完全不動(二刀流的名人堂率本來就是七條路線最高的，不能再加)。

   係數是掃出來的。把 TW 與 DH 對齊同一個 peakCore 帶再比生涯收入（只看有站上
   日職一軍以上的），中位倍數：

     係數     55~62    62~68    68~75
     0.35      1.59     1.13     0.93   ← 原本，頂端是輸的
     0.55      1.66     1.24     1.01
     0.80      1.78     1.39     1.10
     1.00      1.88     1.52     1.20

   試過只推頂端而不動低段（讓係數隨弱側大小遞增），沒有用：頂端那一帶的弱側其實
   不大（點數要分給投打兩邊，peakCore 70 的二刀流兩側各自都只有中段水準），
   遞增段根本沒被觸發，斜率 0.030 與 0.055 量出來一模一樣。
   能動頂端的只有整體係數，而它會等比例把三段一起抬。

   所以取 1.00 ——「兩份工作就是相加」，這也是最不需要解釋的版本。
   低段變甜（1.88 倍）是可以接受的：一個邊緣的指定打擊幾乎沒有價值，
   邊緣的二刀流還能吃局數，而且那一段的絕對金額本來就很小（4.1 億對 2.2 億）。
   上限 22 只有兩側都站上聯盟頂尖才會碰到。 */
export const TW_PAY_K=1.00, TW_PAY_CAP=22;
export function twoWayPayD(p,b){
  return +(Math.max(p,b)+clamp(Math.min(p,b)*TW_PAY_K,0,TW_PAY_CAP)).toFixed(2);
}
export function simSeason(lv){
  if((S.pos==='P'||S.pos==='TW')&&!S.role)S.role=pitcherRole();
  const L=LV[lv], par=L.par, a=S.ab, f=S.seasonFactor;
  const st={G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,avg:0,era:0,d:0};
  if(f<=0) return st;
  const TW=S.pos==='TW', share=TW?twEffort():null;
  /* 二刀流一律先把登板數落地，即使今年不投(TJ 復健年)也是 0 而不是 undefined——
     normalizePitchingStats 靠 Number.isFinite(st.GP) 判斷要寫哪一個欄位。 */
  if(TW){ st.GP=0; st.pH=0; st.pBB=0; }
  /* 投球側的三個欄位都依身分分家：單刀投手照舊寫 st.G/st.H/st.BB，二刀流寫
     st.GP/st.pH/st.pBB，把 st.G/st.H/st.BB 讓給打擊側。normalizePitchingStats 與
     pitG()/pitH()/pitBB() 都是靠「有沒有 GP/pH/pBB」判斷的，寫錯欄位會讓單刀投手
     被誤判成二刀流。 */
  const gK=TW?'GP':'G', hK=TW?'pH':'H', bbK=TW?'pBB':'BB';
  if((S.pos==='P'||TW)&&!S.pitchOut){
    const q=(a.vel+a.ctl+a.brk)/3, d=q-par; st.d=d; st.dPit=d;
    /* 表現係數:投得好給滿局數,投爛減少出賽(比照野手) */
    let perfF=clamp(0.80+d*0.028,0.42,1.12);
    if(S.traits.favorite)perfF=Math.max(perfF,0.85); /* 愛將:教練照樣派你上,低潮年不會被冷凍 */
    if(isSP()){
      /* 先發場次要乘上該層級的輪次倍率(詳見 teams.js 的 rot / spLoad)：
         中職一軍 1.00、日職一軍 0.99(六人輪值)、大聯盟 1.35(五人輪值 162 場)。
         舊版沒有這一項，三個聯盟的先發都投 25~30 場，但獎項門檻、TJ 負荷與薪資
         工作量全都以「局數隨聯盟場次放大」為前提，四個系統對不上。 */
      /* 二刀流砍的是「先發場次」，不是每場局數:真實世界是六人輪值多休一天，
         場次少、每場長度正常。砍 ipg 會讓他看起來像每場被早換的爛投手。 */
      const gs=Math.round(clamp(20+(a.sta-40)*0.18,10,30)*spLoad(lv)*f*perfF*(0.94+R()*0.08)*(TW?share.pit:1));
      st[gK]=Math.max(1,gs);
      /* IP/GS:聯盟平均~5.0、優質先發5.2-6.0、工作馬6.1-6.5;由 d 值(綜合實力)決定,控球差略減 */
      const ipg=clamp(5.0+d*0.05+(a.sta-50)*0.012+(a.ctl-par)*0.006+N0(0.12),4.8,6.5);
      st.IP=+(st[gK]*ipg).toFixed(1);
    }else{
      st[gK]=Math.max(1,Math.round(clamp(45+(Math.min(a.sta,60)-40)*0.3,25,68)*f*perfF*(0.94+R()*0.08)*(TW?share.pit:1))); /* 高體力後援:出賽數貢獻以 sta60 封頂,不會貼近先發工作量 */
      st.IP=+(st[gK]*1.05).toFixed(1);
    }
    /* 四個率值都是「該聯盟平均 × exp(±k × (能力 − par))」(見 teams.js 的 env 與 ENV_K)。
       同一個球員降一級 par 掉 15 點，指數項整個放大——這才是真實世界的樣子。
       三振看球速與變化球，四死看控球，被安打與被全壘打看整體實力。
       刻意沒有上限，平衡交給 economy.js 的聯盟折算。 */
    const E=L.env, hrLg=envHR9(E);
    const k9=Math.max(1.5,envRate(E.k9,a.vel*0.62+a.brk*0.38,par,ENV_K.k9,1)+N0(0.45));
    const bb9=Math.max(0.35,envRate(E.bb9,a.ctl,par,ENV_K.bb9,-1)+N0(0.35));
    const h9=Math.max(3.2,envRate(E.h9,q,par,ENV_K.h9,-1)+N0(0.45));
    const hr9=Math.max(0.02,envRate(hrLg,q,par,ENV_K.hr9,-1)*(0.82+R()*0.36));
    st.SO=Math.round(st.IP/9*k9);
    st[bbK]=Math.round(st.IP/9*bb9);
    st[hK]=Math.round(st.IP/9*h9);
    st.pHR=Math.round(st.IP/9*hr9);
    /* ERA 從零件反推，不再獨立擲。舊版 era 是自己一條式子，跟被安打／四死球無關，
       所以 par 的投手會同時出現 WHIP 1.53 與 ERA 4.32——那兩個數字在同一列上互相打臉。
       這裡改成「聯盟平均 ＋ 各項相對聯盟的偏差 × 該事件的得分價值」，
       par 的投手正好落在聯盟 ERA，任何人的 ERA 與 WHIP 從此同進同退。 */
    st.eraLuck=N0(0.20);
    syncEra(st,lv);
    if(isSP()){
      const dec=Math.round(st[gK]*0.72), wp=clamp(0.50+d*0.014+N0(0.05),0.15,0.85);
      st.W=Math.round(dec*wp); st.L=dec-st.W;
    }else if(S.role==='CL'){
      /* 終結者:救援以出賽數為基礎(轉化率隨表現 d),SV 天生 <= G;每場最多 1 救援 */
      const svRate=clamp(0.55+d*0.02,0.35,0.82);            /* 救援轉化率:35%~82% */
      st.SV=Math.min(st[gK], Math.round(st[gK]*svRate));       /* 不可超過登板數 */
      st.HLD=Math.min(Math.max(0,st[gK]-st.SV), Math.round(st[gK]*0.12)); /* 非救援登板的中繼 */
      const dec=Math.max(1,Math.round(st[gK]*0.14)); st.W=Math.round(dec*clamp(0.45+d*0.02,0.3,0.7)); st.L=Math.max(0,dec-st.W);
    }else{ /* 中繼:中繼成功 HLD 以出賽數為基礎 */
      const hldRate=clamp(0.45+d*0.02,0.25,0.72);
      st.HLD=Math.min(st[gK], Math.round(st[gK]*hldRate));     /* 不可超過登板數 */
      st.SV=Math.min(Math.max(0,st[gK]-st.HLD), chance(25)?ri(1,5):0);
      const dec=Math.max(1,Math.round(st[gK]*0.14)); st.W=Math.round(dec*clamp(0.5+d*0.015,0.35,0.7)); st.L=Math.max(0,dec-st.W);
    }
    /* 物理約束:每場最多一種結果 → 救援占比<=85%、勝+敗+救援+中繼 總和不可超過出賽數 */
    if(!isSP()){
      st.SV=Math.min(st.SV||0, Math.floor(st[gK]*0.85));
      st.HLD=Math.min(st.HLD||0, Math.max(0,st[gK]-st.SV));
      const decCap=Math.max(0,st[gK]-st.SV-st.HLD);
      if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
    }
  }
  if(S.pos!=='P'){
    const q=a.con*0.5+a.pow*0.2+a.eye*0.18+a.spd*0.12, d=q-par-0.5; st.d=d; st.dBat=d; /* 加入 pow(長打產能計入實力);-0.5 校準,整體分布與舊版對齊 */
    /* 出賽規模:體力設上限,表現(d)決定實際多寡 */
    /* 體力係數:50+ 接近滿(~0.9-1.0)、45~50 尚可、40 明顯少、35 只剩代打量(~0.35) */
    let staF;
    if(a.sta>=55)staF=1.0; else if(a.sta>=50)staF=0.90+(a.sta-50)*0.02;
    else if(a.sta>=45)staF=0.72+(a.sta-45)*0.036; else if(a.sta>=40)staF=0.52+(a.sta-40)*0.04;
    else if(a.sta>=35)staF=0.35+(a.sta-35)*0.034; else staF=Math.max(0.15,0.35-(35-a.sta)*0.03);
    /* 守位只由季初守位會議決定。低體力會自然減少出賽，不再於季末暗中改判 DH。 */
    /* 表現係數:打得好才有滿打席,爛表現(d<0)出賽再打折
       守備光譜:先發門檻依守位平移(詳見 abilities.js 的 POS_PT_BAR)。捕手/游擊打平聯盟水準
       就守得住先發,一壘/指定打擊打不出來就掉打席。只動出賽率,st.d 不變。 */
    const spotDp=(S.dpos)||(S.pos==='C'?'C':null);
    const posBar=(spotDp&&POS_PT_BAR[spotDp]!=null)?POS_PT_BAR[spotDp]:0;
    const perfF=clamp(0.82+(d+posBar)*0.03,0.45,1.12);
    let useF=clamp(staF*perfF,0.10,1.0);
    if(S.traits.favorite)useF=Math.max(useF,0.85); /* 愛將:出賽率保底(體力偏低或低潮年才會生效,滿額主力無感) */
    st.G=Math.min(L.g, Math.round(L.g*useF*f*(0.90+R()*0.10)*(TW?share.bat:1))); /* 上限=聯盟場次,不可超過;隨機項加寬(原0.95~1.01)—實力遠超聯盟水準時 staF*perfF 常年頂在1.0上限，
       只剩這個隨機項在決定出賽數，範圍太窄(僅約±3%)會讓生涯逐年出賽數/打席看起來年年幾乎一模一樣;加寬到±5%讓表現飽和的球季也有自然的年度落差 */
    st.PA=Math.round(st.G*4.25);
    st._dh=S.dpos==='DH'; /* 只有正式登錄為 DH 的球季才按 DH 結算。 */
    st.BB=Math.round(st.PA*clamp(0.062+(a.eye-par)*0.0034,0.045,0.17));
    st.AB=st.PA-st.BB;
    /* 打擊率與全壘打率同樣是「聯盟平均 ＋ 相對 par 的成長」。全壘打只看力量——
       Contact 高不會變成全壘打，它走的是打擊率那條線。
       打擊率有上界，所以用飽和曲線；全壘打率沒有上限，一個大聯盟等級的砲手
       掉到中職就是會打出六十轟，那是對的。 */
    const E=L.env, hrCap=hrCapRate(L), avgCap=avgCapOf(L);
    st.avg=clamp(envAvg(E.avg,q,par)+(a.sta-50)*0.0003+N0(0.014),0.150,avgCap);
    st.H=Math.round(st.AB*st.avg); st.avg=st.AB?st.H/st.AB:0;
    /* 全壘打率沒有自然上界（打擊率那條線是飽和曲線，本來就有），所以要自己彎。
       softCap 讓一般球員原封不動、頂尖球員收向該層級的天花板：
       中職 pow 80 從原本的「期望 65 轟」收到 42 轟——真實紀錄是 39 轟。 */
    st.HR=Math.round(st.AB*softCap(Math.max(0.0012,envRate(E.hr,a.pow,par,ENV_K.hr,1))*(0.85+R()*0.3),hrCap));
    const fullSeasonSB=clamp((a.spd-45)*0.5+(a.spd-par)*1.3+N0(4),0,70);
    st.SB=scaledSteals(fullSeasonSB,st.PA,L.g); /* 盜壘依實際打席機會縮放，不能只打十幾場卻跑出完整球季產量。 */
    st.RBI=Math.round(st.HR*2.1+(st.H-st.HR)*0.30);
    /* DEF 會在所有出賽加成套用完後，依最終實際出賽數統一計算。 */
    st.DEF=0;
  }
  /* 今年沒投球(復健年)就沒有 dPit，直接用打擊側，不要合成出 NaN。 */
  if(TW)st.d=Number.isFinite(st.dPit)?twoWayD(st.dPit,st.dBat):st.dBat;
  applySeasonForm(st,lv);   /* 低潮年/生涯年:調整率值與產出(不動出賽數) */
  if(S.pos!=='P')capSteals(st);
  return st;
}
/* 賽季狀態:10% 低潮(成績×0.65)、10% 生涯年(成績×1.2,需健康);倍率只作用產出/率值,出賽數 G 不變 */
export function applySeasonForm(st,lv){
  if(S.seasonFactor<=0)return;                 /* 傷缺全季不觸發 */
  st.form=0;                                    /* 0=正常 1=生涯年 -1=低潮 */
  const roll=R();
  const canCareer=S.seasonFactor>=0.9;          /* 生涯年需該季健康 */
  let m=1;
  if(roll<0.10){ st.form=-1; m=0.65; }          /* 低潮:成績打 65 折 */
  else if(canCareer && roll<0.20){ st.form=1; m=1.20; } /* 生涯年:成績 ×1.2 */
  if(m===1)return;
  if(S.pos==='P'||S.pos==='TW'){
    /* 投手:三振/勝場隨倍率;被安打與自責分反向(生涯年變少、低潮變多);SV/HLD 依倍率但不超過出賽數 */
    st.SO=Math.round(st.SO*m);
    st.W=Math.round(st.W*m); if(st.L!=null)st.L=Math.max(0,Math.round(st.L/(m||1)));
    /* 生涯年／低潮動的是零件(被安打、被全壘打)，ERA 由零件重算——直接改 ERA 再
       回推自責分的話，ERA 會離開 WHIP。 */
    const pk=Number.isFinite(st.pH)?'pH':'H';
    st[pk]=Math.max(0,Math.round(st[pk]/m));
    if(Number.isFinite(st.pHR))st.pHR=Math.max(0,Math.round(st.pHR/m));
    syncEra(st,lv);
    const gp=pitG(st);
    if(st.SV)st.SV=Math.min(gp,Math.round(st.SV*m));
    if(st.HLD)st.HLD=Math.min(Math.max(0,gp-(st.SV||0)),Math.round(st.HLD*m));
    /* 物理約束(倍率後再夾):救援占比<=85%、勝+敗+救援+中繼 <= 登板數 */
    if(!isSP()){
      st.SV=Math.min(st.SV||0, Math.floor(gp*0.85));
      st.HLD=Math.min(st.HLD||0, Math.max(0,gp-st.SV));
      const decCap=Math.max(0,gp-st.SV-st.HLD);
      if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
    }
    if(Number.isFinite(st.dPit))st.dPit+=st.form===1?4:st.form===-1?-4:0;
  }
  if(S.pos!=='P'){
    /* 打者:安打/全壘打/盜壘/打點隨倍率;打席與出賽數不變(打率連帶變動)。
       倍率作用在「率值」而且走 softBoost——舊版是直接 st.H*=1.2，而基礎的打擊率
       上界寫在這之前，所以 .430 那條線根本不是上限，生涯年可以把它推到 .516。
       現在離天花板還遠的人照樣吃滿 1.2，已經貼著天花板的人只前進剩餘空間。 */
    const LF=LV[lv]||LV.CPBL1, hrCap=hrCapRate(LF), avgCap=avgCapOf(LF);
    if(st.AB>0){
      st.H=Math.min(st.AB,Math.round(st.AB*softBoost(st.H/st.AB,avgCap,m)));
      st.HR=Math.min(st.H,Math.round(st.AB*softBoost(st.HR/st.AB,hrCap,m)));
    }
    st.SB=Math.round(st.SB*m);
    st.avg=st.AB?st.H/st.AB:0;
    st.RBI=Math.round(st.HR*2.1+(st.H-st.HR)*0.30);
    if(Number.isFinite(st.dBat))st.dBat+=st.form===1?4:st.form===-1?-4:0;
  }
  /* d 值(影響評價/獎項/下放)跟著狀態調整。二刀流的 d 是兩側合成的，重算而不是加。 */
  if(S.pos==='TW')st.d=Number.isFinite(st.dPit)?twoWayD(st.dPit,st.dBat):(st.dBat||st.d);
  else st.d += st.form===1?4:st.form===-1?-4:0;
}
/* 守備分(近似 defensive runs):守位難度權重 × 守備工具相對聯盟基準的幅度 × 出賽比重 */
export function defRuns(lv,overrideDp,games){
  if(S.pos==='P')return 0;
  const L=LV[lv],a=S.ab,par=L.par;
  const dp=overrideDp||S.dpos||(S.pos==='C'?'C':'2B');
  if(dp==='DH')return 0; /* DH 不產生守備分 */
  const posW={SS:1.25,CF:1.20,C:1.15,'2B':1.05,'3B':1.00,RF:0.95,'1B':0.75,LF:0.80}[dp]||1;
  const skill=dp==='C'?(a.fld*0.4+a.arm*0.3+a.cat*0.3)
    :(a.rng*0.45+a.fld*0.40+a.arm*0.15);
  const gw=clamp((games||0)/(L.g||1),0,1);
  return Math.round((skill-par)*posW*0.55*gw);
}
/* 舊年度尚未保存角色時，以數據推定；新年度直接使用 st.role。 */
export function pitcherSalaryRole(st,recordedRole){
  if(['SP','MR','CL'].includes(recordedRole))return recordedRole;
  if(st&&['SP','MR','CL'].includes(st.role))return st.role;
  if(st&&(st.SV||0)>=10&&(st.SV||0)>=(st.HLD||0))return 'CL';
  if(st&&(st.HLD||0)>=10)return 'MR';
  if(st&&pitG(st)>0&&(st.IP||0)/(pitG(st)||1)>=2.5)return 'SP';
  return S.role||'SP';
}
/* 日職／大聯盟的核薪不能只看能力值：把帳面成績轉成有限幅度的市場修正。
   最近三季的 65%／25%／10% 加權仍由 contract.js 處理，因此單季爆發不會直接鎖定歷史級長約。 */
export function salaryPerformanceAdjustment(st,lv,recordedRoleOrPos){
  if(lv!=='NPB1'&&lv!=='MLB')return 0;
  return ({'-1':0,0:-1,1:0,2:1.25,3:3.25})[seasonGrade(st,lv,recordedRoleOrPos)]||0;
}
/* 薪資專用球員價值：野手計打擊、守備與守位；投手計球威、角色與實際工作量。 */
/* 投球側的工作量修正:角色別 × 實際局數／登板數。 */
function pitchPay(st,lv,recordedRole,d){
  if(!(pitG(st)>0))return d; /* 全年復健只交由傷後市場折價，不重複扣工作量。 */
  const role=pitcherSalaryRole(st,recordedRole), L=LV[lv]||LV[S.lv];
  let adj=0;
  if(role==='SP')adj=clamp(((st.IP||0)/(L.g||1)-0.75)*2,-1,0.75);
  else if(role==='CL')adj=-2+clamp(((st.SV||0)-25)/20,-0.75,0.75);
  else adj=-4+clamp(((st.HLD||0)-20)/20,-0.75,0.75);
  return d+adj;
}
/* 打擊側的守備與守位修正。 */
function batPay(st,lv,dp,d){
  const games=Math.max(0,Number(st.G)||0), def=dp==='DH'?0:(Number(st.DEF)||0);
  const full=((LV[lv]||LV[S.lv]||{}).g)||162;
  return d+(def+(POS_ADJ_RUNS[dp]||0)*(games/full))/6;
}
export function seasonSalaryRating(st,lv,recordedRoleOrPos){
  if(!st||!Number.isFinite(st.d))return 0;
  if(Number.isFinite(st.payD))return st.payD;
  if(S.pos==='TW'){
    /* 兩側各自算一次工作量修正，再用與 st.d 相同的方式合成。
       打擊側照 DH 計價(POS_ADJ_RUNS.DH = −14):二刀流真的沒有守備價值，這一刀該挨。
       投球側完全不受這個折價影響，所以不會被同一件事罰兩次。 */
    const pv=pitchPay(st,lv,recordedRoleOrPos,Number.isFinite(st.dPit)?st.dPit:st.d);
    const bv=batPay(st,lv,'DH',Number.isFinite(st.dBat)?st.dBat:st.d);
    return +(twoWayPayD(pv,bv)+salaryPerformanceAdjustment(st,lv,recordedRoleOrPos)).toFixed(2);
  }
  if(S.pos==='P'){
    if(!(pitG(st)>0))return st.d; /* 全年復健只交由傷後市場折價，不重複扣工作量。 */
    const role=pitcherSalaryRole(st,recordedRoleOrPos);
    return +(pitchPay(st,lv,recordedRoleOrPos,st.d)+salaryPerformanceAdjustment(st,lv,role)).toFixed(2);
  }
  const dp=st._dh?'DH':(recordedRoleOrPos||S.dpos||(S.pos==='C'?'C':'DH'));
  const games=Math.max(0,Number(st.G)||0), def=dp==='DH'?0:(Number(st.DEF)||0);
  /* 守位分母用該聯盟滿季場次，不寫死 162：同一行的 def 來自 defRuns()，那邊已經以
     gw=games/L.g 正規化過，兩者必須同尺度。寫死 162 會讓場次較少的聯盟(中職 120 場)
     的守位薪資只算到 74%，捕手/游擊的加價與一壘/指定打擊的減價同時被稀釋。
     與 career.js 的 positionScore() 同一套規則。 */
  const full=((LV[lv]||LV[S.lv]||{}).g)||162;
  const posRuns=(POS_ADJ_RUNS[dp]||0)*(games/full);
  return +(st.d+(def+posRuns)/6+salaryPerformanceAdjustment(st,lv,dp)).toFixed(2);
}
/* 球季帳面成績評等：0=差 1=普通 2=好 3=壓倒性，另有 −1=樣本不足（無法評價）。
   只讀真實數據，完全不看能力值——升降級判定需要「打出來的」跟「體檢數字漂亮」是兩件事。
   以率值(OPS／ERA／WHIP)為主軸，數量型指標(全壘打、救援+中繼)依聯盟場次等比縮放。
   −1 與 1 必須分開：受傷或打席不足的球季無從論斷成績，呼叫端要改用能力判斷，
   不能當成「普通」處理，否則會出現「打擊率 .358 卻被說帳面成績不夠好」的矛盾訊息。 */
function pitchGrade(st,lv,recordedRole){
  const g=(LV[lv]||{}).g||130, r=g/130;
  const era=baseballERA(st), whip=baseballWHIP(st);
  if(era==null||(st.IP||0)<g*0.22)return -1;
  const bulk=pitcherSalaryRole(st,recordedRole)==='SP'?((st.IP||0)>=g*0.5):(((st.SV||0)+(st.HLD||0))>=15*r);
  /* 門檻改成依聯盟走(見 data/thresholds.js)。舊版是絕對的 2.80／3.50／4.35，
     那在三個聯盟平均 ERA 都是 4.32 的舊環境下沒問題；現在日職平均 3.01、
     大聯盟 4.17，同一個 3.50 在日職是中庸、在大聯盟是王牌。 */
  const T=pitchTh(lv);
  if(era<=T.era3&&bulk)return 3;
  if(era<=T.era2||(whip!=null&&whip<=T.whip2&&era<=T.era2w))return 2;
  if(era<=T.era1)return 1;
  return 0;
}
function batGrade(st,lv){
  const g=(LV[lv]||{}).g||130, r=g/130, pa=st.PA||0;
  if(pa<g*2.0)return -1;
  const obp=(st.H+(st.BB||0))/pa, ops=obp+slgOf(st);
  /* 門檻改成依聯盟走(見 data/thresholds.js)。各聯盟的平均 OPS 現在不一樣
     (中職 .705／日職 .672／大聯盟 .713)，全壘打的門檻更是差三倍——
     大聯盟的「二十轟等級」相當於中職的七轟。 */
  const T=batTh(lv);
  if(ops>=T.ops3||(ops>=T.ops3h&&(st.HR||0)>=T.hr3))return 3;
  if(ops>=T.ops2)return 2;
  if(ops>=T.ops1)return 1;
  return 0;
}
export function seasonGrade(st,lv,recordedRole){
  if(!st)return -1;
  if(S.pos==='TW'){
    /* 二刀流取兩側較高的一邊:投得好卻因為棒子安靜被判「差」會直接害他被下放。
       兩側都樣本不足才回 −1(呼叫端會改用能力判斷)。 */
    const pv=pitchGrade(st,lv,recordedRole), bv=batGrade(st,lv);
    if(pv<0&&bv<0)return -1;
    return Math.max(pv,bv);
  }
  if(S.pos==='P')return pitchGrade(st,lv,recordedRole);
  return batGrade(st,lv);
}
export function currentSalaryRating(fallback){
  if(Number.isFinite(S.lastPayD))return S.lastPayD;
  if(S.lastSt)return seasonSalaryRating(S.lastSt,S.lastLv||S.lv,(S.pos==='P'||S.pos==='TW')?S.role:S.dpos);
  return Number.isFinite(fallback)?fallback:0;
}
/* 所有球季狀態與特質加成結束後，再做一次聯盟場次與棒球物理限制的統一校正。 */
export function normalizeBatterStats(st,lv){
  const maxG=LV[lv].g||0;
  st.G=clamp(Math.round(st.G||0),0,maxG);
  const maxPA=Math.round(st.G*4.75);
  st.PA=clamp(Math.round(st.PA||0),0,maxPA);
  st.BB=clamp(Math.round(st.BB||0),0,st.PA);
  st.AB=clamp(Math.round(st.AB||0),0,Math.max(0,st.PA-st.BB));
  st.H=clamp(Math.round(st.H||0),0,st.AB);
  st.HR=clamp(Math.round(st.HR||0),0,st.H);
  st.RBI=Math.max(0,Math.round(st.RBI||0));
  capSteals(st);
  st.avg=st.AB>0?st.H/st.AB:0;
}
export function normalizePitchingStats(st,lv){
  const maxG=LV[lv].g||0;
  const twoWay=Number.isFinite(st.GP);   /* 二刀流:登板數在 GP，st.G 是打擊出賽,不能碰 */
  const g=clamp(Math.round(pitG(st)||0),0,maxG);
  if(twoWay)st.GP=g; else st.G=g;
  st.IP=normalizeIP(clamp(Number(st.IP)||0,0,g*9));
  (twoWay?['pH','pBB']:['H','BB']).concat(['SO','ER','W','L','SV','HLD','pHR'])
    .forEach(k=>{ if(k==='pHR'&&!Number.isFinite(st.pHR))return;
      st[k]=Math.max(0,Math.round(st[k]||0)); });
  if(Number.isFinite(st.pHR))st.pHR=Math.min(st.pHR,pitH(st));   /* 被全壘打不可超過被安打 */
  if(isSP()){
    st.SV=0; st.HLD=0;
    const decCap=g;
    if(st.W+st.L>decCap){
      const ratio=decCap/(st.W+st.L||1);
      st.W=Math.floor(st.W*ratio); st.L=Math.min(decCap-st.W,Math.floor(st.L*ratio));
    }
  }else{
    st.SV=Math.min(st.SV,Math.floor(g*0.85));
    st.HLD=Math.min(st.HLD,Math.max(0,g-st.SV));
    const decCap=Math.max(0,g-st.SV-st.HLD);
    if(st.W+st.L>decCap){
      const ratio=decCap/(st.W+st.L||1);
      st.W=Math.floor(st.W*ratio); st.L=Math.min(decCap-st.W,Math.floor(st.L*ratio));
    }
  }
  st.era=st.IP>0?+(baseballERA(st)||0).toFixed(2):0;
  st.WHIP=st.IP>0?+(baseballWHIP(st)||0).toFixed(2):0;
}
export function accStat(bucket,st){
  if(!S.stats[bucket]) S.stats[bucket]=blankStat();
  const t=S.stats[bucket]; t.yr++;
  if(bucket!=='MINOR'&&S.orgTeam){ const tb=S.teamTally[bucket]||(S.teamTally[bucket]={});
    tb[S.orgTeam]=(tb[S.orgTeam]||0)+1; }
  /* 二刀流兩邊都要累積:原本是 else if，會讓 roleYears 與 dposYears 只長一邊。 */
  if(S.pos!=='P'){ const dp=(st&&st._dh)?'DH':(S.dpos||'—');
    S.dposYears[dp]=(S.dposYears[dp]||0)+1;
    if(!t.DPG)t.DPG={}; t.DPG[dp]=(t.DPG[dp]||0)+(st.G||0); }
  if((S.pos==='P'||S.pos==='TW')&&S.role){ S.roleYears[S.role]=(S.roleYears[S.role]||0)+1; }
  if(S.pos==='TW')S.twSeasons=(S.twSeasons||0)+1;   /* 真的以二刀流身分打完的球季數 */
  /* 投打兩側分開累積。舊版是一行 forEach 把 G／H／BB 全部加進同一格，
     只有二刀流的球季才另外寫 GP／pH／pBB——於是「先二刀流、後被收斂成投手」的生涯，
     t.G 會等於（二刀流那幾年的打擊出賽 ＋ 之後所有年的登板數）、
     t.H 等於（安打 ＋ 被安打）、t.BB 等於（保送 ＋ 投出的四死），
     而 pitG()／pitBB() 只讀得到二刀流那幾年。玩家回報的
     「打擊只打 3 年卻寫 17 年、AVG 6.456、投手保送 37」全部出自這裡。
     現在不管什麼身分，投球的數字一律進 GP／pH／pBB／pHR，打擊的一律進 G／H／BB／HR。
     單季的 st 仍然維持原本的欄位規則（單刀投手寫 st.G／st.H／st.BB），
     所以這裡用 pitG()／pitH()／pitBB() 把它讀出來，不改動任何產生成績的程式碼。 */
  const pitSide=(S.pos==='P'||S.pos==='TW'), batSide=(S.pos!=='P');
  if(pitSide){
    t.GP=(t.GP||0)+pitG(st);
    t.pH=(t.pH||0)+pitH(st);
    t.pBB=(t.pBB||0)+pitBB(st);
    t.pHR=(t.pHR||0)+(st.pHR||0);
    ['W','L','SV','HLD','SO','ER'].forEach(k=>t[k]+=(st[k]||0));
    t.IP=ipFromOuts(outsFromIP(t.IP)+outsFromIP(st.IP));
    if((st.IP||0)>0||pitG(st)>0)t.yrP=(t.yrP||0)+1;
  }
  if(batSide){
    ['G','PA','AB','H','HR','RBI','SB','BB'].forEach(k=>t[k]+=(st[k]||0));
    t.DEF+=(st.DEF||0);
    if((st.PA||0)>0||(st.G||0)>0)t.yrB=(t.yrB||0)+1;
  }
}
/* 二刀流的球季數據卡：投打各一行。比單刀的 statLine() 精簡，打擊側省掉上壘率與
   長打率（OPS 已經含了這兩項）。
   但有兩項不能省，因為省掉之後那個能力就完全看不見了：
     ‧盜壘——單刀野手的卡一直都有，二刀流沒有的話，腳程練起來看不出任何差別。
     ‧四死球——玩家回報「單年結算投打四壞數都沒顯示了」。投手側的控球與打者側的
       選球，成績上唯一的出口就是四死球；不印出來，那兩項練了等於沒練。
   兩行在手機上本來就會折行，多這幾個字不會讓版面更糟。 */
export function pitchLine(st){
  const relief=(S.role==='CL'&&st.SV)?`｜${st.SV}救援`:(S.role==='MR'&&st.HLD)?`｜${st.HLD}中繼`:'';
  return `登板 ${pitG(st)}｜局數 ${fmtIP(st.IP)}｜${st.W}勝${st.L}敗${relief}｜三振 ${st.SO}｜四死 ${pitBB(st)}｜ERA ${(st.era||0).toFixed(2)}｜WHIP ${(baseballWHIP(st)||0).toFixed(2)}`;
}
export function batLine(st){
  const obpN=st.PA>0?(st.H+st.BB)/st.PA:0, slgN=slgOf(st);
  const f=v=>v.toFixed(3).replace(/^0/,'');
  return `出賽 ${st.G}｜打席 ${st.PA}｜打擊率 ${st.AB>0?f(st.avg):'-'}｜OPS ${st.AB>0?f(obpN+slgN):'-'}｜安打 ${st.H}｜全壘打 ${st.HR}｜打點 ${st.RBI}｜保送 ${st.BB||0}｜盜壘 ${st.SB||0}`;
}
/* 球季數據卡的內容。二刀流拆成兩個框：投打串在同一行讀不出來哪個數字屬於哪一邊，
   但仍然是同一張卡——那是同一個球季的兩份工作。復健年只投不打(或只打不投)時，
   沒有產出的那一側整個不畫，不留一排零。 */
export function statCardHTML(st,teamTag){
  const tag=`<span class="tag">${teamTag}</span>`;
  if(S.pos!=='TW')return tag+`<div class="statline">${statLine(st)}</div>`;
  const box=(side,txt)=>`<div class="statline tw"><span class="side">${side}</span>${txt}</div>`;
  let h=tag;
  if((st.GP||0)>0||(st.IP||0)>0)h+=box('投',pitchLine(st));
  if((st.PA||0)>0)h+=box('打',batLine(st));
  if(h===tag)h+=`<div class="statline">（本季無出賽紀錄）</div>`;
  return h;
}
export function statLine(st){
  if(S.pos==='TW')return `投 ${pitchLine(st)}　／　打 ${batLine(st)}`;
  if(S.pos==='P'){ const role=roleN(S.role); const relief=(S.role==='CL'&&st.SV)?`｜${st.SV}救援`:(S.role==='MR'&&st.HLD)?`｜${st.HLD}中繼`:''; return `出賽 ${st.G}｜局數 ${fmtIP(st.IP)}｜${st.W}勝${st.L}敗${relief}｜三振 ${st.SO}｜保送 ${st.BB||0}｜ERA ${st.era.toFixed(2)}｜WHIP ${(st.WHIP||0).toFixed(2)}`; }
  const obpN=st.PA>0?(st.H+st.BB)/st.PA:0;
  const slgN=slgOf(st);
  const obp=st.PA>0?obpN.toFixed(3).replace(/^0/,''):'-';
  const slg=st.AB>0?slgN.toFixed(3).replace(/^0/,''):'-';
  const ops=st.AB>0?(obpN+slgN).toFixed(3).replace(/^0/,''):'-';
  return `出賽 ${st.G}｜打席 ${st.PA}｜打擊率 ${st.avg.toFixed(3).replace(/^0/,'')}｜上壘率 ${obp}｜長打率 ${slg}｜OPS ${ops}｜安打 ${st.H}｜全壘打 ${st.HR}｜打點 ${st.RBI}｜保送 ${st.BB}｜盜壘 ${st.SB}${st.DEF!==undefined?`｜守備 ${st.DEF>0?'+':''}${st.DEF}`:''}`;
}
/* 長打率估算:無二三壘數據,依全壘打比例與力量推估壘打數 */
export function slgOf(st){
  if(!st.AB)return 0;
  const hr=st.HR, nonHR=Math.max(0,st.H-hr);
  /* 非全壘打安打中,約 22% 二壘打、3% 三壘打——取整數支數,壘打數必為整數,小樣本 SLG 才不會出現 .320 這種不可能的值 */
  const doubles=Math.round(nonHR*0.22), triples=Math.round(nonHR*0.03);
  const singles=Math.max(0,nonHR-doubles-triples);
  const tb=singles + doubles*2 + triples*3 + hr*4;
  return tb/st.AB;
}
export function amateurSeason(){
  if(S.seasonFactor===0){ card('bad','','整季只能在場邊看著隊友比賽。');
    S.log.push({y:S.year,age:S.age,tm:S.team||stageLabel(),line:'傷缺全季', inj:true}); nextStep(); return; }
  const cups=S.stage==='HS'?HS_CUPS:S.stage==='U'?U_CUPS:['成棒甲組春季聯賽','成棒甲組秋季聯賽'];
  const thr=S.stage==='HS'?[52,46,40,34,28]:[60,54,48,42,36];
  let gain=0,lines=[],plain=[];
  const eventForm=S.pendStat||0;
  const tB=S.stage==='HS'?({1:6,2:0,3:-6})[S.hsTier||2]:0; /* 高中隱藏強度分級 */
  cups.forEach(c=>{ const pw=ovr()+tB+eventForm+ri(-8,8);
    const i=pw>=thr[0]?0:pw>=thr[1]?1:pw>=thr[2]?2:pw>=thr[3]?3:pw>=thr[4]?4:5;
    const rk=['冠軍','亞軍','四強','八強','十六強','預賽出局'][i];
    const pts=[7,5,4,3,2,1][i]+Math.floor(ovr()/22);
    gain+=pts; lines.push(`${c}：<b class="hl">${rk}</b>（+${pts} 點）`); plain.push(`${c}${rk}`);
    if(S.stage==='U'&&rk==='冠軍'&&!S.traits.academy){ S.traits.academy=true;
      card('gold','隱藏屬性解鎖：學院派','大學殿堂的科學化訓練與防護打下扎實基礎——<b class="hl">25 歲前受傷率 −5%、季初擲骰期望值提升</b>。'); }
    if(i===0){
      S.honors.push(`${S.year} ${c}冠軍`);
      if(S.stage==='HS')S.hsChampions=(S.hsChampions||0)+1;
    } });
  if(S.stage==='HS'&&(S.hsChampions||0)>3&&!S.traits.miraclegen){
    traitCard('miraclegen','奇蹟世代','沒有人知道這所學校的這群少年，會在棒球界中掀起什麼樣的風暴');
  }
  S.pendStat=0;
  S.pool+=gain;
  S.log.push({y:S.year,age:S.age,tm:S.team||stageLabel(),line:plain.join('、'), inj:false});
  card('','年度大賽',lines.join('<br>')+`<div class="statline">獲得能力點 ${gain} 點，季末統一分配。能力越高，大賽收穫越多。</div>`);
  maybeIntl(()=>nextStep());
}
/* ── 狀態火燙／低潮：出賽機會 ＋ 內容，不再直接加減 counting stat ──

   舊版是「st.SO += p×8、st.IP += p×4」。兩個問題：

   ① 加成是**絕對值**，不隨工作量縮放。一個投 200 局的王牌加 8 個三振無感，
      一個只投 30 局的二刀流加 8 個就是 +30%。二刀流被放大得最嚴重。
   ② 憑空生出來的局數沒有對應的被安打與四死球。ERA 改成由零件反推之後
      （v1.6.1），IP 是 h9／bb9／hr9 的分母——多灌 16 局進去，三個率值同時
      被除小三成，ERA 直接崩到 1 點多。實測回報：能力 53/46/56（大聯盟 par 59，
      三項全部低於聯盟平均）的二刀流投出 6 登板／46 局／ERA 1.76／63 三振，
      每場 7.7 局、K/9 12.3——兩個都是不存在的數字。舊版看不出來，
      因為那時候 ERA 是獨立擲的，跟被安打無關。

   現在拆成兩件事，兩件都是**比例**：
     · 出賽機會：火燙＝教練多用你，局數跟著自己的「每場局數」走，不會憑空出現。
     · 內容：直接動 k9／h9／bb9／hr9 四個率值，再由 IP 反推 counting stat。
   這樣不管 IP 多少，火燙的效果都是同一個幅度，而且 ERA 與 WHIP 永遠對得起來。

   p 的分布（實測 14,829 個球季）：中位 1.0、p90 2.1、p99 3.0、最大 9.0。 */
export function formPitch(st,lv,p){
  const ip0=normalizeIP(st.IP); if(!(ip0>0)||!p)return;
  const gK=Number.isFinite(st.GP)?'GP':'G';
  const hK=Number.isFinite(st.pH)?'pH':'H', bbK=Number.isFinite(st.pBB)?'pBB':'BB';
  const per9=v=>(v||0)/ip0*9;
  let k9=per9(st.SO), h9=per9(st[hK]), bb9=per9(st[bbK]), hr9=per9(st.pHR);
  const g0=Math.max(1,pitG(st)), ipg=ip0/g0;
  /* ① 出賽機會。先發的上限照輪次(該層級場次 ÷ 5)，後援照 68 場與聯盟場次。 */
  const L=LV[lv]||LV.CPBL1, sp=isSP();
  const cap=sp?Math.max(1,Math.round((L.g||120)/5*1.12)):Math.min(68,L.g||120);
  const g=Math.max(1,Math.min(cap,g0+Math.round(p*(sp?0.5:1.2))));
  const ip=+(g*ipg).toFixed(1);
  /* ② 內容。火燙＝球被打得比較差、三振變多；低潮反過來。 */
  const f=clamp(p*0.030,-0.30,0.30);
  k9*=1+f*0.90; h9*=1-f*0.55; bb9*=1-f*0.45; hr9*=1-f*1.20;
  st[gK]=g; st.IP=ip;
  st.SO=Math.max(0,Math.round(ip/9*k9));
  st[hK]=Math.max(0,Math.round(ip/9*h9));
  st[bbK]=Math.max(0,Math.round(ip/9*bb9));
  if(Number.isFinite(st.pHR))st.pHR=Math.max(0,Math.round(ip/9*hr9));
  syncEra(st,lv);
  /* ③ 勝敗／救援跟著出賽數重算，並夾回物理上限。 */
  if(sp){
    const dec=Math.round(g*0.72), wp=clamp((st.W+st.L)>0?st.W/(st.W+st.L)+f*0.35:0.5+f*0.35,0.10,0.90);
    st.W=Math.round(dec*wp); st.L=Math.max(0,dec-st.W);
  }else{
    const scale=g/g0;
    st.SV=Math.round((st.SV||0)*scale*(1+f*0.5));
    st.HLD=Math.round((st.HLD||0)*scale*(1+f*0.5));
    st.SV=Math.min(st.SV,Math.floor(g*0.85));
    st.HLD=Math.min(st.HLD,Math.max(0,g-st.SV));
    const decCap=Math.max(0,g-st.SV-st.HLD);
    if((st.W+st.L)>decCap){ st.W=Math.min(st.W,decCap); st.L=Math.max(0,decCap-st.W); }
  }
}
/* 打擊側同理。舊版新增的打數是用固定的 .550 打擊率再加 p×1.5 支安打填的
   ——實測那批新打數的打擊率會到 .8 以上，等於憑空塞進一段不可能的成績。
   改成：新打數用他自己的打擊率，火燙再統一給一個比例加成。 */
export function formBat(st,lv,p){
  if(!p||!(st.AB>0))return;
  const L=LV[lv]||LV.CPBL1, f=clamp(p*0.030,-0.30,0.30);
  const avg0=st.H/st.AB, hrR=st.HR/st.AB, rbiPerH=st.H>0?st.RBI/st.H:0.5;
  const addG=Math.round(p*1.5);
  const g=Math.max(1,Math.min(L.g||120,st.G+addG));
  const scale=st.G>0?g/st.G:1;
  st.G=g; st.PA=Math.round(st.PA*scale); st.AB=Math.round(st.AB*scale);
  st.BB=Math.round((st.BB||0)*scale);
  /* 舊版這裡自己寫了一條 clamp(…,0.100,0.480)，比基礎那條 0.430 還寬——
     兩條線互相打臉，而且都在加成之前。現在統一收到該層級的天花板底下。 */
  const hrCap=hrCapRate(L), avgCap=avgCapOf(L);
  const avg=Math.max(0.100,softBoost(avg0,avgCap,1+f*0.55));
  const hr=Math.max(0,softBoost(hrR,hrCap,1+f*1.10));
  st.H=Math.min(st.AB,Math.round(st.AB*avg));
  st.HR=Math.min(st.H,Math.round(st.AB*hr));
  st.RBI=Math.max(0,Math.round(st.H*rbiPerH*(1+f*0.6)));
  st.SB=Math.round((st.SB||0)*scale);
  st.avg=st.AB?st.H/st.AB:0;
}
export function proSeason(){
 const seasonLv=S.lv,st=simSeason(seasonLv); S.lastSt=st; S.lastD=st.d; S.lastLv=seasonLv;
  if(S.pendStat!==0&&S.seasonFactor>0){
    /* 【修正】狀態火燙的加成，必須依照該季實際出賽的比例（seasonFactor）進行打折 */
    const p = S.pendStat * S.seasonFactor;
    /* 二刀流兩側都要吃到火燙／低潮。原本寫成 if(投手)…else if(打者)…，
       二刀流會落進打者那一支，投球側整季的加成與折損通通不見。 */
    const pitSide=S.pos==='P'||S.pos==='TW', batSide=S.pos!=='P';
    if(pitSide)formPitch(st,seasonLv,p);
    if(batSide)formBat(st,seasonLv,p);
  }
  S.pendStat=0;
  /* 投法對成績的加成/折損 */
  if((S.pos==='P'||S.pos==='TW')&&S.seasonFactor>0){ const em={'全力投':1,'普通投':0,'養生球':-1}[S.effort]||0;
    if(em!==0){ const hk=Number.isFinite(st.pH)?'pH':'H';
      st[hk]=Math.max(0,Math.round((st[hk]||0)*(1-em*0.030)));
      if(Number.isFinite(st.pHR))st.pHR=Math.max(0,Math.round(st.pHR*(1-em*0.08)));
      st.SO=Math.round(st.SO*(1+em*0.06));
      syncEra(st,S.lv);
      /* 投法只影響投球側:二刀流的 st.d 是兩側合成的，加完再重算一次。 */
      if(S.pos==='TW'){ st.dPit+=em; st.d=twoWayD(st.dPit,st.dBat); } else st.d+=em; } }
  if(S.traits.onetool&&S.seasonFactor>0){ /* 工具人:那項工具讓他「多爭取」到代打/代跑/代守上場(加成,非砍半) */
    /* 出賽數不可以超過該層級的場次——原本直接 ×1.25，120 場的中職會印出 150 場。
       倍率改成「補到滿季為止」，率值不動（多上場本來就該多打，那是合理的）。 */
    const gCap=(LV[seasonLv]||LV.CPBL1).g||120;
    const boost=st.G>0?Math.min(1.25,gCap/st.G):1.25;
    /* 累積型數據隨打席等比微調 */
    ['H','HR','RBI','SB','BB'].forEach(k=>{ if(typeof st[k]==='number')st[k]=Math.round(st[k]*boost); });
    st.avg=st.AB>0?st.H/st.AB:0; capSteals(st); }
  if(S.pos!=='P'){
    normalizeBatterStats(st,seasonLv);
    st.DEF=defRuns(seasonLv,st._dh?'DH':null,st.G);   /* 二刀流固定 DH，這裡回 0 */
  }
  if(S.pos==='P'||S.pos==='TW')normalizePitchingStats(st,seasonLv);
  S.lastD=st.d;
  if(S.pos==='P'||S.pos==='TW')st.role=S.role;
  st.payD=seasonSalaryRating(st,seasonLv,(S.pos==='P'||S.pos==='TW')?S.role:S.dpos);
  S.lastPayD=st.payD;
  const bucket=bucketOf(S.lv); accStat(bucket,st);
  /* The position actually played this season, not the registered one: a forced-DH year
     (the dhThisYear branch above) already counts as DH for defensive runs, dposYears,
     salary rating and award eligibility, so every display reads it from here too. */
  const seasonDp=st._dh?'DH':(S.dpos||'');
  if(S.seasonFactor===0){ card('bad','球季數據','（傷缺，本季無出賽紀錄）'); }
  else card('','球季數據',statCardHTML(st,`${S.teamName()}${seasonDp?'｜'+seasonDp:''}`));
  /* 低潮年 / 生涯年 敘述卡 */
  if(st.form===-1){
    card('bad','巨大的低潮',`身體狀況很好，但是成績一直打不出來，遇到了巨大的低潮。孤獨、無助，就像是溺水一樣，只能隨意抓取孤木。`);
  }else if(st.form===1){
    if(S.pos==='P') card('gold','生涯年','縫線掠過指尖的感覺無與倫比，而你投出去的球像是有了生命，用一個無人能想像得到的角度，閃過了打者的球棒，並穩穩投進捕手的手套。');
    else card('gold','生涯年','投來的每顆球看起來都像籃球一樣大，你看得到縫線、球的轉動，就和駭客任務的子彈一樣慢了下來，而你每一顆擊中甜蜜點的球，都往全壘打牆奔去。');
  }
  const isInj = S.seasonFactor <= 0.45; /* 判斷是否為大傷報廢年 */
  S.log.push({y:S.year,age:S.age,tm:S.teamName(),lv:seasonLv,p:seasonDp,role:(S.pos==='P'||S.pos==='TW')?S.role:null,line:S.seasonFactor===0?'傷缺全季':statLine(st), inj: isInj, st: st});
  /* 鐵人累計 */
  const healthy=S.seasonFactor>=0.95&&(S.pos==='P'?(isSP()?st.IP>=120:st.G>=42):st.G>=LV[S.lv].g*0.8);
  if(healthy){ S.ironStreak++;
    if(S.ironStreak>=5&&!S.traits.iron){
      /* 鐵人與玻璃人互為對立體質，不可並存：本來是玻璃人的話直接被鐵人覆蓋過去。 */
      const wasGlass=!!S.traits.glass;
      if(wasGlass)removeTrait('glass','玻璃人');
      S.traits.iron=true;
      S.removed=(S.removed||[]).filter(x=>x!=='鐵人'); /* 曾被玻璃人蓋掉又練回來:清掉刪除線紀錄 */
      if(wasGlass)
        card('gold','隱藏素質覆蓋：玻璃人 → 鐵人','多年來的傷病，讓你逐漸了解與自己傷痕累累的身體相處，出賽愈來愈多，你發現到那些說你是玻璃人的觀眾逐漸閉嘴，你現在是強化玻璃，大家改叫你鐵人。<br><b class="hl">玻璃人解除</b>，未來每季受傷機率<b class="hl">不高於 10%</b>。');
      else
        card('gold','隱藏素質解鎖：鐵人','連續五年全勤級出賽！你就像是八點檔，無論哪一年打開電視，都能看到你在球場奮戰，球迷們甚至開始懷疑你是機器人，未來每季受傷機率<b class="hl">不高於 10%</b>。');
      board(1); } }
  else if(S.seasonFactor<0.95)S.ironStreak=0;
  /* 只會這個:先看夠不夠格當主力,夠格絕不判工具人;不夠格才看有無突出工具 */
  /* 二刀流排除:toolGap() 的守備維度讀 rng/fld/arm，二刀流沒有這三項，算出來會是 NaN。
     何況「只剩一項武器的替補奇兵」跟二刀流本來就是互斥的角色。 */
  if(S.pos!=='P'&&S.pos!=='TW'){ const tg=toolGap();
    /* 主力判定:還原健康狀態下的預估出賽數,傷病缺陣不影響評估
       (出賽數公式含 seasonFactor,除回即得健康時的預估;表現係數仍保留) */
    const projG = S.seasonFactor > 0 ? (st.G / S.seasonFactor) : 0;
    const isRegular = projG >= LV[S.lv].g * 0.60;
    if(!S.traits.onetool && !isRegular && tg.gap>=22 && tg.val>=58 && careerAllStars()<4){ S.traits.onetool=true;
      const wasBefore=S.removed.includes('只會這個');
      S.removed=S.removed.filter(x=>x!=='只會這個'); /* 重新觸發:清掉刪除線記錄 */
      const role=tg.role;
      S.toolRole=role;
      if(wasBefore||S.age>=33)
        traitCard('onetool','只會這個',`歲月帶走了你的其他工具，只剩<b class="hl">${role}</b>那一項本領還在。教練把你當成板凳上的秘密武器——關鍵時刻，你仍然可靠。`,'bad');
      else
        traitCard('onetool','只會這個',`你只有一項武器強得誇張，其餘全是破洞。教練不敢讓你先發，只在關鍵時刻派你上去做一件事——你成了球隊的<b class="hl">${role}</b>。出賽數銳減，但那一項本領無人能及。`,'bad'); }
    else if(S.traits.onetool && (tg.gap<18 || isRegular)){ /* 補起來 或 實力打回主力 → 解除 */
      removeTrait('onetool','只會這個'); S.toolRole=null;
      card('good','不再是工具人','教練終於敢把你放進先發打線——你證明了自己不只是板凳上的一招鮮。<b class="hl">「只會這個」解除</b>，你是個完整的球員了。'); board(1); } }
  awards(bucket,st);
  if((S.pos==='P'||S.pos==='TW')&&S.seasonFactor>0)tjAccrue(st,seasonLv);
  tjGamble(()=>demotionAudit(()=>maybeIntl(()=>nextStep())));
}
export function roleName3(r){ return {SP:'先發投手',MR:'中繼投手',CL:'終結者'}[r]||'投手'; }
