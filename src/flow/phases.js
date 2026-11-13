import {S, stepQ, nextStep, stageLabel} from '../core/state.js?v=2.1.0';
import {R, ri, chance, clamp} from '../core/rng.js?v=2.1.0';
import {ABL, POS_AB} from '../data/abilities.js?v=2.1.0';
import {LV, PATHS, envLeagueOps, teamNick} from '../data/teams.js?v=2.1.0';
import {keepTh} from '../data/thresholds.js?v=2.1.0';
import {AMA_ANNUAL} from '../data/economy.js?v=2.1.0';
import {card, choose, board, divider} from '../ui/dom.js?v=2.1.0';
import {tlNote, tlPush, tlRestage} from '../ui/timeline.js?v=2.1.0';
import {allocUI} from '../ui/alloc.js?v=2.1.0';
import {addAb, ovr, ovrPit, ovrBat, dposReview, statBonusTxt} from '../engine/ability.js?v=2.1.0';
import {rollInjury, tjCap, tjEffortMult} from '../engine/injury.js?v=2.1.0';
import {isMrTeamEligible} from '../engine/tenure.js?v=2.1.0';
import {amateurSeason, proSeason, slgOf, currentSalaryRating, baseballERA, baseballWHIP, seasonGrade} from '../engine/season.js?v=2.1.0';
import {championshipChance} from '../engine/championship.js?v=2.1.0';
import {buyoutRemaining, contractAnnual, fmtMoneyFx, contractMarketProfile, controlledAnnual, crossOffers, daibaFarewell, extensionOffer, faFlow, fmtMoney, handleDemotion, levelMinAnnual, makeContract, makeOffers, offseasonTradeCheck, pickOfferUI, returnHomeSign, signTo, teamChampRate} from '../engine/contract.js?v=2.1.0';
import {drawEvents, removeTrait, checkChampionTrait} from './events.js?v=2.1.0';
import {loveEvent} from './love.js?v=2.1.0';
import {runDraft, pathChoiceHS, pathChoiceU4, advance} from '../engine/draft.js?v=2.1.0';
import {endGame} from '../ui/retire.js?v=2.1.0';
/* ================= 年度流程 ================= */
export function startYear(){ S.yearOutsideIncome=0; stepQ.length=0; stepQ.push(phasePre,phaseMid,phaseEnd); divider(`${S.year} 年 · ${S.age} 歲 · ${stageLabel()}`); tlPush(); nextStep(); }
/* 七下保送幾顆「6」。天才需要 5 顆，保送不足的部分要玩家自己擲出來。
   這是二刀流整條路線的難度總開關——實測(各 3000 段完整生涯，名人堂率)：
     保送 5 顆(全保送) 18.1%　／　完全不保送 6.8%　／　單刀母體 8.3%
   也就是說二刀流「機制本身」比母體略難，多出來的優勢全部來自保送的天才。
   見 docs/twoway-design.md §6。 */
export const TW_SIX_GUARANTEED=3;
/* 中途轉入二刀流時，新增那一側的起點＝現有能力平均 × 這個比例（與 ri(20,32) 取高）。
   0 ＝完全從頭擲。見 docs/twoway-design.md §6。 */
export const TW_CONVERT_RATIO=1.15;
/* 1.15 是量出來的：轉入型與七下型必須一樣難，「怎麼走進來的」不該改變難度。
   實測（收到邀請的同一批人，n=253，名人堂率）：
     從頭擲 6.6%　／　×0.85 13.4%　／　×1.00 13.8%　／　×1.15 17.0%
   七下型是 16.5%（拿到天才的母體 18.3%），所以 ×1.15 才對得上。
   1.15 看起來像「憑空變強」，其實不是：分母是全部能力的平均，裡面含著
   rng/fld/arm 這些他轉型後再也用不到的守備工具，會把平均往下拉。
   ×1.15 之後新增的那一側大約落在他現有核心工具的水準，不會高過去。

   同一批人如果婉拒、維持單刀，名人堂率是 26.5%——高中就解鎖天才是母體裡最強的
   一群，二刀流本來就是更難的路（見上面 TW_SIX_GUARANTEED 的實測）。所以接受
   仍然是一筆誠實的取捨：拿生涯評價的機率，換二刀流這件事本身。 */
/* 中途轉入二刀流（觸發 B：高中解鎖天才時選擇轉入）。
   新增的那一側能力重新擲 ri(20,32)、潛力照二刀流的分層表；原有的鍵值一律保留
   ——包含 rng/fld/arm/cat，它們只是變成用不到，不是被沒收（決議 6／7）。 */
export function convertToTwoWay(origin){
  const shuffle=arr=>{ for(let i=arr.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=arr[i];arr[i]=arr[j];arr[j]=t;} return arr; };
  /* 新增那一側的起點:取現有能力平均的一個比例，與 ri(20,32) 取高。
     TW_CONVERT_RATIO=0 等於「完全從頭擲」。 */
  const cur=Object.keys(S.ab).map(k=>S.ab[k]);
  const avg=cur.length?cur.reduce((a,b)=>a+b,0)/cur.length:26;
  const base=Math.round(avg*TW_CONVERT_RATIO);
  const add=(keys,tiers)=>{
    const fresh=keys.filter(k=>!(k in S.ab));
    fresh.forEach(k=>{ S.ab[k]=clamp(Math.max(ri(20,32),base),1,80); });
    shuffle(fresh).forEach((k,i)=>{ S.pot[k]=tiers[Math.min(i,tiers.length-1)](); });
    return fresh;
  };
  const gainedPit=add(['vel','ctl','brk'],[()=>ri(70,80),()=>ri(58,68),()=>ri(50,60)]);
  const gainedBat=add(['con','pow','spd','eye'],[()=>ri(72,80),()=>ri(62,72),()=>ri(54,66),()=>ri(46,60)]);
  /* 體力是二刀流的雙重門票（先發線 52、滿勤打擊線 55）。單刀的潛力表把體力丟進洗牌，
     過半的人抽到 ri(44,54) 或 ri(46,62)——照原值轉過來的話，這個邀請對他們是陷阱。
     所以轉入時把體力潛力墊到二刀流自己的下限。 */
  S.pot.sta=Math.max(S.pot.sta||0,ri(60,74));
  S.pos='TW'; S.twOrigin=origin||'genius'; S.role=null; S.dpos='DH'; S.twSeasons=0; S.twAuditLv=null;
  return {gainedPit,gainedBat};
}
/* ---------- 二刀流資格檢查 ----------
   任一側跟不上該層級就強制收斂成較好的那一側。投在放棄那一側的能力點不退還——
   那是二刀流的沉沒成本，也是這條路線的風險。見 docs/twoway-design.md 決議 5／7／14。

   ── 收斂門檻 TW_BAR ──
   門檻是「弱側的 ovr 低於該層級 min − TW_BAR」。歷史沿革：
     v2.0.1 以前 min−10：實測只有 0.3% 在衰退前被收斂——弱側中位數是 min+5.8，
       那條線根本碰不到，95% 的人是 38~39 歲被衰退砍下去才崩的。那不是失敗，是老了。
     v2.0.2 改 min−3 → 15.3%，但當時是「每年、用當前層級、只看能力值」判定，
       實測中位只打 1 個二刀流球季就被砍，而且 74.8% 崩在剛升上日職一軍那一年。
     v2.0.6 加上升級緩衝與成績豁免（見下），同一條 min−3 掉到 2.9%，
       門檻往回收到 min−0.5 才把失敗率拉回 14.9%。
     v2.0.9 二刀流綜評重算之後又掉到 11.6%——綜評變高讓他們更快跳過日職二軍，
       而那裡正是原本的洗牌區：失敗發生在 NPB2 的比例 7.0%→2.7%、
       在大聯盟 0.8%→4.8%。先收到 min−0 把 15.5% 拿回來。
     v2.0.9（同一版，第二次調整）再收到 min+1.2。起點是結局配比：
       〈全部的棒球〉佔到 84.5%，成功得太廉價。
       一開始想改結局判定（把「算走完全程」的年齡線從 32 抬到 37），但那會把
       「36 歲才停、打了十四年」的人重新標成失敗，而那兩篇失敗結局的文案是寫給
       年輕就放棄的人的——語意對不上。
       改成從源頭收：能力撐不住的人本來就該早點被篩掉。實測（N=2,000）：
         min+0 84.8% ／ min+1.2 70.9% ← 現在 ／ min+1.5 65.7% ／ min+2 56.8%（成功結局）
       而且失敗年齡的中位數從頭到尾都是 24 歲、97% 發生在 30 歲以前，
       多出來的失敗全部落在年輕那一段——文案因此不必改寫，只要拿掉寫死的年數。
       代價是二刀流的名人堂率 16.8%→13.9%，這是刻意接受的。
   （註：這段裡的版本號是歷史沿革，升版號的腳本不可以連它一起換掉。）

   ── 為什麼不能拿新層級的尺去量剛升上來的人 ──
   玩家回報：2A 打出 .304／42 轟／OPS 1.023、投出 ERA 2.52／WHIP 1.01，
   隔年直接跳上大聯盟，季初立刻被判「打擊跟不上大聯盟」。
   2A 的門檻是 47、大聯盟是 56，一個休賽季跳了 9 點，而他在大聯盟還沒打過一球——
   卡片寫「球團把數據攤在你面前」，那個當下根本沒有大聯盟的數據可以攤。

   所以判定一律用「他真的打過的那個層級」的尺：
     ① 這個休賽季升級了 → 這一季沿用舊層級的門檻。
        在舊層級站得住 → 不收斂，讓他上去打一季再說（緩衝一季）；
        舊層級就已經站不住 → 現在就收斂，那不是被拉上去，是本來就跟不上。
     ② 站穩一季之後，才改用新層級的門檻。
     ③ 成績豁免：上一季弱側真的打出該層級的水準，就不看能力值。
        數據講話優先於能力值講話——這是玩家回報那一局該有的待遇。 */
export const TW_BAR=-1.2;
/* ── 成績豁免（2026-09 重寫）──
   玩家回報：大聯盟新人王＋全壘打王＋打點王＋年度最佳打者、.270／56 轟／165 打點，
   隔年季初被判「打擊跟不上大聯盟」。

   舊版的「成績豁免」拿 st.dPit／st.dBat 當成績，但那兩個值是
       dBat = con×0.5 + pow×0.2 + eye×0.18 + spd×0.12 − par − 0.5
   ——換一組權重的能力值而已，唯一跟成績有關的成分是狀態火燙／低潮的 ±4。
   它看不見 56 轟，也看不見打點王。卡片寫「球團把數據攤在你面前」，
   那個當下桌上其實沒有數據。離線實測 890 次收斂：有人上一季拿了打點王＋年度MVP，
   dBat −2.04 對門檻 −1.80，差 0.24 出局；另一位上一季全壘打王，差 0.04。
   兩道關卡（能力值與 d）量的幾乎是同一個東西，而且都是刀鋒。

   改成兩層，兩層都只看他真的做了什麼：
     ① 頭銜硬豁免——那一側上一季拿到任何個人頭銜（含年度MVP）。
        聯盟自己認證他是那個項目最強的人之一，沒有任何能力值可以推翻這件事。
     ② 產出豁免——上一季該側的 OPS+／ERA+ 達到這個層級的門檻水準。
        校準（各層級 500 季，能力值全設成 min+1.2，也就是現行的能力門檻）：
          中職一軍 OPS+ 94／ERA+ 96　　日職一軍 95／96　　大聯盟 95／96
        所以 95 就是「能力剛好踩在門檻上的人會打出來的產出」。
        兩條線量的是同一件事，差別只在一條量工具、一條量結果——
        結果贏了工具，就以結果為準。 */
export const TW_PERF_OPS=95, TW_PERF_ERA=95;
/* 取樣門檻：樣本太小的話一段熱手就能換到豁免。打席抓滿季的 1.2 倍、局數抓 0.3 倍
   （二刀流本來兩邊都打折，不能拿單刀的規模去要求他）。 */
const twPaGate=L=>Math.round((L.g||120)*1.2), twIpGate=L=>Math.round((L.g||120)*0.30);
const TW_BAT_TITLE=/(打擊王|全壘打王|打點王|上壘王|盜壘王|年度最佳打者|打擊三冠王|年度MVP)$/;
const TW_PIT_TITLE=/(勝投王|防禦率王|三振王|救援王|中繼王|年度最佳投手|投手三冠王|年度MVP)$/;
const TW_LGN={CPBL:'中職',NPB:'日職',MLB:'大聯盟'};
/* 頭銜字串長這樣：`2037 大聯盟全壘打王`。只認上一季、而且是上一季那個聯盟的頭銜——
   去年在中職拿的勝投王不該用來抵今年大聯盟的門檻。 */
function twTitlePass(keepPit,L){
  const lg=L&&L.top?TW_LGN[L.top]:null; if(!lg)return false;
  const re=keepPit?TW_BAT_TITLE:TW_PIT_TITLE, head=`${S.year-1} ${lg}`;
  return (S.honors||[]).some(h=>typeof h==='string'&&h.startsWith(head)&&re.test(h));
}
function twOutputPass(keepPit,L,st){
  if(!st||!L||!L.env)return false;
  if(keepPit){                               /* 被質疑的是打擊 */
    if(!(st.PA>0)||st.PA<twPaGate(L))return false;
    const lg=envLeagueOps(L.env); if(!(lg>0))return false;
    return ((st.H+st.BB)/st.PA+slgOf(st))/lg*100>=TW_PERF_OPS;
  }
  if(!((st.IP||0)>=twIpGate(L))||!(st.era>0))return false;
  return L.env.era/st.era*100>=TW_PERF_ERA;
}
/* 上一季弱側到底做了什麼。傷缺季／復健年沒有那一側的數據，兩層都過不了 → 回 false，
   退回能力值判定；不要把「沒打」當成「打得好」。 */
function twPerfPass(keepPit){
  const L=LV[S.lastLv||S.lv];
  if(twTitlePass(keepPit,L))return true;
  return twOutputPass(keepPit,L,S.lastSt);
}
export function twoWayAudit(){
  if(S.pos!=='TW'||S.stage!=='PRO')return false;
  const L=LV[S.lv]; if(!L||!Number.isFinite(L.min))return false;
  /* 第一次以二刀流站上職業（或中途轉入二刀流）的那一季沒有任何可以量的數據，
     記下層級就放行。同一條原則：不拿沒打過的層級去判一個人。 */
  if(!S.twAuditLv){ S.twAuditLv=S.lv; return false; }
  /* 上一次判定時人在哪個層級。跟現在不同而且現在比較高 → 這個休賽季升上來了。 */
  const seen=LV[S.twAuditLv]||L, promoted=seen.min<L.min;
  const J=promoted?seen:L;                  /* 這一季要用哪一把尺 */
  S.twAuditLv=S.lv;                         /* 記下來，下一季就用新層級的尺 */
  const bar=J.min-TW_BAR, p=ovrPit(), b=ovrBat();
  if(p>=bar&&b>=bar)return false;
  const keepPit=p>=b;
  if(twPerfPass(keepPit))return false;      /* 成績豁免：弱側上一季真的打出水準 */
  const lost=keepPit?'打擊':'投球';
  S.twFellAge=S.age; S.twFellLv=S.lv;
  S.pos=keepPit?'P':'OF';
  S.twFell=keepPit?'pit':'bat';
  if(keepPit){
    S.dpos=null;                      /* 投手沒有守位，晶片才不會繼續印「指定打擊」 */
  }else{
    S.role=null;
    /* 二刀流沒練過守備工具:轉打者時補上三項，但只給替補等級的值與上限——
       他守不動任何位置，dposReview() 會把他放到指定打擊，這是這條路的自然結局。 */
    ['rng','fld','arm'].forEach(k=>{ if(!(k in S.ab)){ S.ab[k]=ri(18,26); S.pot[k]=ri(28,40); } });
    S.dpos='DH';
  }
  /* 大巧不工鎖定的能力如果落在放棄的那一側，每年那顆免費骰就會一直加在用不到的
     數值上。這裡不改指到別的能力——那等於把玩家沒有選過的東西塞給他。
     這個特質的解鎖條件就是「連續三年把點數澆在同一個工具上」，那個工具沒了，
     特質就跟著沒了，跟二刀流的沉沒成本是同一回事。 */
  let comboLost=null;
  {
    const keys=POS_AB[S.pos]||[];
    const stale=k=>k&&!keys.includes(k);
    if(stale(S.comboKey)){
      if(S.traits&&S.traits.combo){ comboLost=S.comboKey; removeTrait('combo','大巧不工'); }
      S.comboKey=null;
    }
    /* 專精連續計數也要歸零：那三年是澆在用不到的工具上的，不該繼續累積。 */
    if(stale(S.samePickKey)){ S.samePickKey=null; S.samePick=0; }
  }
  card('bad','二刀流終止',
    `球團把數據攤在你面前:你的${lost}已經跟不上<b class="dn">${J.n}</b>的水準了。`+
    `再撐下去只是兩頭落空——從今天起，你專心當一個<b class="hl">${keepPit?'投手':'打者'}</b>。`+
    `<br>那些年投進${lost}的訓練，沒有人會還給你。`);
  if(comboLost){
    card('bad','大巧不工褪去',
      `你連續三年把所有點數都澆在「${ABL[comboLost]}」上，那份複利是這樣長出來的。`+
      `<br>現在那個工具你用不到了——<b class="dn">「大巧不工」解除</b>，季初不再自動多擲那顆骰。`+
      `<br>汗水沒有白流，只是它流去的地方，已經不在你的球場上了。`);
  }
  /* 七下路線的天才是系統送的，失去二刀流身分就一併收回;自己擲出五顆 6 的不拔。
     S.six 必須同時歸零——解鎖條件是 S.six>=5 && !genius && age<22，
     不歸零的話下一次擲骰就會立刻再解鎖一次，等於白拔。 */
  /* 只有「還沒真正打過二刀流就崩掉」才連坐拔天才——七下是要擋刷天才的人，
     不是要罰一個打了十九年二刀流、四十歲才停止投球的球員。
     模擬佐證(各 600／3000 段完整生涯)：
       故意只練投球側的刷天才玩法 100% 在 5 季內崩掉，轉回年齡中位 19 歲；
       正常玩的二刀流 0.0% 在 5 季內崩掉，轉回年齡中位 39 歲、已打 19 個二刀流球季。
     所以 5 季這條線抓得到 100% 的刷天才、誤傷 0% 的正常玩家。 */
  const TW_ESTABLISHED=5;
  if(S.twOrigin==='tap'&&S.traits.genius&&(S.twSeasons||0)<TW_ESTABLISHED){
    removeTrait('genius','天才'); S.six=0;
    card('bad','天才褪去',
      '那份與生俱來的手感，好像是為了二刀流才借給你的。當這條路走不下去，它也一起離開了——'+
      '<b class="dn">「天才」解除</b>，訓練骰回到常人的 1～6 點。<br>剩下的路，要用練的。');
  }
  board(1);
  return true;
}
/* ---------- 季初 ---------- */
export function phasePre(){
  board(0); S.tmpInj=0; S.seasonFactor=1; S.skipMid=false; S.marketInjury='healthy'; S.prevD=S.lastD||0; S.lastD=0; S.lastPayD=0; /* 先保留上季 d 供投手定位判定 */
  checkChampionTrait(); /* 舊存檔已有五冠時也會補解鎖。 */
  if(S.age>=48){ buyoutRemaining(1,true); endGame('身體已到極限，'+S.year+' 年春訓後宣布引退。'); return; }
  const declAge=S.age-(S.traits.disc?2:0); /* 自律狂:衰退曲線整體延後兩年 */
  if(declAge>=32){ const baseDec=declAge>=35?5+(declAge-35):2;
    const oldGhostActive=!!(S.oldGhostPending&&!S.oldGhostUsed);
    const dec=oldGhostActive?Math.max(1,Math.round(baseDec*0.5)):baseDec;
    const catcherCallDec=S.pos==='C'?Math.max(1,Math.round(dec*0.5)):dec;
    POS_AB[S.pos].forEach(k=>S.ab[k]=clamp(S.ab[k]-(k==='cat'?catcherCallDec:dec),1,80));
    if(oldGhostActive){ S.oldGhostPending=false; S.oldGhostUsed=true; }
    const declineText=S.pos==='C'
      ?`配球以外能力 <b class="dn">−${dec}</b>（你的配球經驗是你珍貴的財產，不會急遽衰退，配球<b class="dn">−${catcherCallDec}</b>）`
      :`所有能力 <b class="dn">−${dec}</b>`;
    card('bad','歲月不饒人',`${declAge>=35?'第二階段（逐年加劇）':'第一階段'}衰退：${declineText}${S.traits.disc?'（自律狂：生涯延後兩年）':''}${oldGhostActive?`（老鬼：原衰退 −${baseDec}，本年減緩 50%）`:''}。訓練加點照常，但身體回不去了。`); board(0); }
  twoWayAudit();   /* 擲骰之前先判定:被收斂的那一年就不該再吃二刀流的顆數保底 */
  S.pitchOut=false;
  if(S.rehab>0&&S.rehabPitchOnly&&S.pos==='TW'){
    /* 二刀流的 TJ 復健年:手肘停機一整季，但棒子照打——這是二刀流最招牌的一段。
       只關掉投球側(S.pitchOut)，不動 seasonFactor 與 skipMid，訓練與打擊照常。 */
    S.rehab--; S.rehabPitchOnly=false; S.pitchOut=true; S.marketInjury='rehab';
    card('bad','復健年（只停投球）',`手肘的重建還沒走完，這一季<b class="dn">完全不會登板</b>——但你還握得住球棒。球團把你排進打線，讓你用打擊撐過這一年。`);
  }
  else if(S.rehab>0){ S.rehab--; S.skipMid=true; S.seasonFactor=0; S.marketInjury='rehab';
    card('bad','復健年',`大傷尚未痊癒，本季確定<b class="dn">全年報銷</b>，只能在復健室度過。（擲骰減為 2 顆）`);
    const dummySt = {G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,avg:0,era:0,WHIP:0,DEF:0};
    /* lv／p／role 要跟正常球季那一列帶一樣的欄位：二刀流的年表是投打兩張分開畫的，
       靠 role（那年是投手身分）與 p（那年有守位）判斷這一列屬於哪一側。
       缺了它們，手術／全年報銷那一年會從兩張表同時消失——玩家回報的
       「退休結算沒顯示投手手術年」就是這個。 */
    S.log.push({y:S.year,age:S.age,tm:S.stage==='PRO'?S.teamName():(S.team||stageLabel()),
      lv:S.stage==='PRO'?S.lv:null, p:S.pos==='P'?null:(S.dpos||''),
      role:(S.pos==='P'||S.pos==='TW')?S.role:null,
      line:'復健年・全年報銷', inj: true, st: S.stage==='PRO'?dummySt:null}); }
  let afterAsk=()=>{
    let n=S.skipMid?2:(()=>{const r=R();return r<0.35?3:r<0.75?4:r<0.95?5:6;})();
    if(S.traits.distract&&!S.skipMid)n=Math.max(2,n-1); /* 外務纏身 */
    if(S.traits.academy&&!S.skipMid&&chance(35))n++; /* 學院派:期望值略升 */
    /* 二刀流要同時養兩套工具,顆數保底 5(不是固定 5——高顆數的運氣照樣吃得到)。
       跌回單刀就沒有這一條,所以直接綁 S.pos 即可,不需要常駐旗標。復健年的 2 顆不在此限。 */
    if(S.pos==='TW'&&!S.skipMid)n=Math.max(n,5);
    
    /* 七下起手的二刀流:高中三年以「累積目標」保送五顆 6(高一 2、高二 4、高三 5)。
       每季只補到當季目標,其餘骰子照常擲——自然骰出的 6 會被算進去,下一季要補的就變少,
       運氣好提早湊滿就提早解鎖(這是允許的)。解鎖後 genius 為真、S.six 停止累加,
       這段就自動失效,不需要額外的關閉條件。 */
    let forced=new Set();
    if(S.twOrigin==='tap'&&!S.traits.genius&&S.stage==='HS'&&!S.skipMid&&TW_SIX_GUARANTEED>0){
      /* 高中三年的累積目標:把保送額度平均攤在三年，第三年補到滿。
         TW_SIX_GUARANTEED=5 → [2,4,5]（全保送）；=3 → [1,2,3]（剩兩顆要自己擲）。 */
      const yr=clamp(S.stageYr||1,1,3);
      const target=Math.min(TW_SIX_GUARANTEED,Math.ceil(TW_SIX_GUARANTEED*yr/3));
      let need=clamp(target-S.six,0,n);
      while(forced.size<need)forced.add(Math.floor(R()*n));
    }
    const dice=[]; let newSix=0, justUnlockedGenius=false;
    for(let i=0;i<n;i++){ const v=forced.has(i)?6:(S.traits.genius?ri(4,6):S.traits.late?ri(3,6):ri(1,6)); dice.push(v);
      if(v===6&&S.age<22&&!S.traits.genius){S.six++;newSix++;} }
      
    let msg=`自主訓練擲出 <b class="hl">${n}</b> 顆骰。`;
    if(newSix&&!S.traits.genius)msg+=` 高標值「6」累計 <b class="hl">${S.six}/5</b> 次。`;
    
    /* 【修正】大巧不工改為：自動擲骰並加點，滿額溢出轉為成績加成 */
    if(S.traits.combo && !S.skipMid && (S.comboKey||S.samePickKey)) {
      const ck = S.comboKey||S.samePickKey; /* 永遠用解鎖當下鎖定的能力 */
      const cv = S.traits.genius?ri(4,6):S.traits.late?ri(3,6):ri(1,6);
      const gained = addAb(ck, cv);
      const overflow = S.lastOverflow || 0;

      if(overflow > 0) S.pendStat = (S.pendStat || 0) + overflow;

      let cmsg = `<br>大巧不工發動：系統自動擲出 <b class="hl">${cv}</b> 點，挹注於 <b class="hl">${ABL[ck]}</b>`;
      if(gained > 0) cmsg += `（<b class="up">+${gained}</b>）`;
      if(overflow > 0) cmsg += `（頂峰造極：溢出的 ${overflow} 點轉為${statBonusTxt(overflow)}）`;
      if(gained===0 && overflow===0) cmsg += `（<b class="dn">未升級</b>）`;
      msg += cmsg + `。`;
    }
    
    card('','季初特訓',msg);
    if(S.six>=5&&!S.traits.genius&&S.age<22){ S.traits.genius=true; S.geniusEver=true;
      {
      const exDef=S.pos==='C'?['rng','fld','arm','cat']:[];
      /* 潛力 70 以上已是高天賦，不再吃掉重新評估名額；最高只會由 69 提升至 79。 */
      const cands=POS_AB[S.pos].filter(k=>S.ab[k]<70&&(S.pot[k]||62)<70&&!exDef.includes(k));
      for(let i=cands.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=cands[i];cands[i]=cands[j];cands[j]=t;}
      const boost=cands.slice(0,2), bl=[];
      boost.forEach(k=>{ const oldPot=S.pot[k]||62,newPot=Math.min(80,oldPot+10),potGain=newPot-oldPot;
        S.pot[k]=newPot; S.ab[k]=clamp(S.ab[k]+5,1,80);
        bl.push(`${ABL[k]} <b class="up">+5</b>（潛力上限 ${oldPot} → ${newPot}，實際 +${potGain}）`); });
      card('gold','隱藏素質解鎖：天才','22 歲前五度擲出高標值！從今以後，每一顆訓練骰<b class="hl">永久固定 4 點以上</b>，事件卡好結果機率提升至 <b class="hl">70%</b>。'+(bl.length?`天賦覺醒，潛能重新被評估：${bl.join('、')}。`:'')+'天賦，是藏不住的。');
      board(1);
      justUnlockedGenius=true;
    } }
    const toAlloc=()=>choose('分配訓練成果',[{t:'<i class="ph-bold ph-gear" aria-hidden="true"></i>開始分配',s:`${dice.length} 顆骰`,main:true,f:()=>dposReview(()=>allocUI({dice},'分配訓練成果（點骰套用｜球探量表：'+(S.pos==='P'?'60/70/75':S.pos==='TW'?'球威 60/70/75｜其餘 70/75':'70/75')+' 以上成長遞減）',()=>nextStep()))}]);
    /* 觸發 B:高中時期解鎖天才 → 詢問要不要轉二刀流。玩家可以拒絕，拒絕就再也不問。 */
    if(justUnlockedGenius&&S.stage==='HS'&&S.pos!=='TW'){
      const wasP=S.pos==='P';
      choose('<span class="ev-h">天賦覺醒 · 教練把你叫進辦公室</span>'+
        `<small>「你這種身體，只做一半太可惜了。」他把${wasP?'球棒':'手套跟球'}放到你面前。</small>`,[
        {t:'兩邊都要——走二刀流',main:true,
         s:`${wasP?'重新學打擊':'重新學投球'}（從你目前水準的八成起步）｜訓練骰保底 5 顆｜任一側跟不上層級水準就會被強制收斂，投在另一側的點數不退還`,
         f:()=>{ const g=convertToTwoWay('genius');
           const names=k=>ABL[k];
           card('gold','二刀流',
             `你點了頭。從這一天起，你不再只是${wasP?'投手':'打者'}——<b class="hl">${wasP?'球棒':'投手丘'}</b>也成了你的功課。`+
             `<br>新增能力：${g.gainedPit.concat(g.gainedBat).map(names).join('、')}（從頭練起）。`+
             `<br>訓練骰顆數保底 <b class="hl">5 顆</b>；但只要投或打其中一側跟不上所在層級的水準，`+
             `球團就會把你收斂回單刀，而那些年投進另一側的點數<b class="dn">沒有人會還給你</b>。`);
           board(1); toAlloc(); }},
        {t:`專心當${wasP?'投手':'打者'}`,s:'維持現狀。這個邀請不會再出現',
         f:()=>{ S.twDeclined=true;
           card('info','婉拒','你搖搖頭。把一件事做到最好，本身就已經夠難了。'); toAlloc(); }}]);
      return;
    }
    toAlloc();
  };
  /* 投手開季：投球強度(續航+TJ 量表) */
  const preAsk=afterAsk;
  if((S.pos==='P'||S.pos==='TW')&&S.stage==='PRO'&&!S.skipMid&&!S.pitchOut){
    afterAsk=()=>{
      const arm=(function(){const r=S.tj/tjCap();return S.rehab>0?'復健中':r>=0.85?'手肘隱隱作痛':r>=0.6?'手臂略感疲勞':r>=0.35?'狀況尚可':'手感輕盈';})();
      /* 二刀流沿用同一張面板，但它同時決定投球場次與打擊出賽——這才是每一季要重做的
         平衡取捨(見 docs/twoway-design.md §5)。單刀的三個選項維持原樣。 */
      const opts=S.pos==='TW'
        /* 倍數一律從引擎的常數表讀，不要在文案裡再抄一份數字。 */
        ? [{t:'以投為主',warn:true,s:`先發場次 85%｜打擊出賽 90%｜TJ 累積 ×${tjEffortMult('TW','全力投').toFixed(2)}`,f:()=>{S.effort='全力投';preAsk();}},
           {t:'投打並重',main:true,s:`先發場次 70%｜打擊全勤｜TJ 累積 ×${tjEffortMult('TW','普通投').toFixed(2)}`,f:()=>{S.effort='普通投';preAsk();}},
           {t:'以打為主',s:`先發場次 50%｜打擊全勤｜TJ 累積 ×${tjEffortMult('TW','養生球').toFixed(2)}`,f:()=>{S.effort='養生球';preAsk();}}]
        : [{t:'全力投',warn:true,s:`成績最佳｜手臂負荷最大（TJ 累積 ×${tjEffortMult('P','全力投').toFixed(2)}）`,f:()=>{S.effort='全力投';preAsk();}},
           {t:'普通投',main:true,s:'標準強度｜TJ 累積正常',f:()=>{S.effort='普通投';preAsk();}},
           {t:'養生球',s:`成績保守｜省手臂（TJ 累積 ×${tjEffortMult('P','養生球').toFixed(2)}）`,f:()=>{S.effort='養生球';preAsk();}}];
      choose(`${S.pos==='TW'?'開季投打配比':'開季投球規劃'}（手臂狀況：${arm}）`,opts);
    };
  }
  /* 大學季前：是否投入選秀與旅外（大二～大四） */
  if(S.stage==='U'&&S.stageYr>=2){
    const o=ovr();
    /* 接受任何職業去向後，都要把本年已建立的「大學」時間軸改成實際職業身分。 */
    const finishDecision=()=>{ if(S.stage==='PRO')tlRestage(); afterAsk(); };
    const opts=[
      {t:'投入中華職棒選秀',s:`目前綜合 ${o}｜年齡加權：越年輕評價越高`,f:()=>runDraft(true,finishDecision)}
    ];
    /* 年齡懲罰：每長一歲，門檻微調，但簽約金大幅縮水 */
    const agePenalty = Math.max(0, S.age - 18);
    const reqNPB = 44 + Math.floor(agePenalty / 2);   // 門檻：18歲44 -> 22歲46
    const reqMiLB = 50 + Math.floor(agePenalty / 2);  // 門檻：18歲50 -> 22歲52
    const bonusNPB = Math.max(100, 800 - agePenalty * 180);   // 日職簽約金逐年大減
    const bonusMiLB = Math.max(150, 1500 - agePenalty * 350); // 美職簽約金逐年大減
    /* the season was already pushed as a college year; tlRestage() moves it to the new
       league so a short overseas stint still shows up as its own era on the career card */
    const goPro=finishDecision;
    if(o>=reqNPB)opts.push({t:'洽談旅日合約',s:`休學挑戰日職｜大齡影響簽約金`,f:()=>{
      S.stage='PRO'; S.team=''; S.svc=0; S.faElig=false;
      pickOfferUI('日職球團報價','NPB',makeOffers('NPB',2,bonusNPB,2,3,'NPB2',null),goPro);}});
    if(o>=reqMiLB)opts.push({t:'洽談旅美合約',s:`休學挑戰小聯盟｜大齡影響簽約金`,f:()=>{
      S.stage='PRO'; S.team=''; S.svc=0; S.faElig=false;
      pickOfferUI('大聯盟球團報價','MiLB',makeOffers('MiLB',2,bonusMiLB,3,4,o>=55?'A1':'R',null),goPro);}});
    /* 續留選項固定放在所有選秀／旅外選項之後。 */
    opts.push({t:'留在大學繼續磨練',main:true,f:afterAsk});
    choose(`大${['一','二','三','四'][S.stageYr-1]}季前 · 升學與職棒的十字路口`,opts);
    return;
  }
  if(S.stage==='PRO'&&S.age>=36&&S.rehab===0){
    const oldOpts=[{t:'再戰一年',main:true,f:afterAsk}];
    /* 旅外老將(衰退期):放棄現有合約,落葉歸根返台;ovr<30(真的打不動)不給 */
    if(S.org!=='CPBL'&&ovr()>=LV.CPBL2.min){
      oldOpts.push({t:'放棄合約，落葉歸根',s:'狀態不再，仍想把最後的球打給家鄉看',f:()=>{
        const from=S.org;
        returnHomeSign(from,'CPBL','CPBL1',`狀態雖然已經不在巔峰，但家鄉球隊仍然向你招手——他們要的不是你的實力，是你在國際賽、在海外聯賽建立起的回憶。你決定放棄合約，回家，把職業生涯最後幾年奉獻給大家。`);
        tlRestage(); afterAsk(); /* spring move: this season is already CPBL */
      }});
    }
    oldOpts.push({t:'召開引退記者會',warn:true,s:'結束選手生涯',f:()=>{buyoutRemaining(0.7,true);daibaFarewell(()=>endGame('功成身退，於 '+S.year+' 年宣布引退。'));}});
    choose('又是一年春訓，身體大不如前了',oldOpts);
    return;
  }
  afterAsk();
}
/* ---------- 賽季中 ---------- */
export function phaseMid(){
  board(1);
  if(S.skipMid){ S.ironStreak=0; nextStep(); return; }
  loveEvent(()=>drawEvents(()=>{
    choose('季中健康檢查',[{t:'<i class="ph-bold ph-stethoscope" aria-hidden="true"></i>查看報告',main:true,f:()=>{ rollInjury();
      choose('球季表現',[{t:'<i class="ph-fill ph-baseball" aria-hidden="true"></i>查看結果',main:true,f:()=>{
        if(S.stage==='PRO')proSeason();
        else amateurSeason(); }}]); }}]);
  }));
}
const RAINBOW_RULES={CPBL:['中職',3],NPB:['日職',5],MLB:['大聯盟',5]};
/* 三聯盟的七彩球衣各自累積；回傳這次新解鎖的聯盟，方便流程顯示一次取得訊息。 */
export function unlockRainbowLeagues(state=S){
  const owned=Array.isArray(state.rainbowLeagues)?state.rainbowLeagues.filter(Boolean):[];
  /* 舊存檔只有單一 rainbowLg，先搬進新陣列，之後仍可解鎖另外兩個聯盟。 */
  if(state.rainbowLg&&!owned.includes(state.rainbowLg))owned.push(state.rainbowLg);
  const added=[];
  Object.entries(RAINBOW_RULES).forEach(([league,[label,minTeams]])=>{
    const teams=Object.keys((state.teamTally&&state.teamTally[league])||{}).length;
    if(teams>minTeams&&!owned.includes(label)){
      owned.push(label);
      added.push({league,label,teams});
    }
  });
  state.rainbowLeagues=[...new Set(owned)];
  if(state.rainbowLeagues.length){
    state.traits.rainbow=true;
    if(!state.rainbowLg)state.rainbowLg=state.rainbowLeagues[0]; /* 保留舊版欄位供相容 */
  }
  return added;
}
/* 球隊年資在季末交易前結算：交易屬於下一季異動，剛打完的球季必須記在原隊。 */
export function updateTeamTenureTraits(){
  if(S.stage!=='PRO'||!S.orgTeam)return;
  S.teamSeasons=(S.teamSeasons||0)+1; /* 同一球團全部球季：二軍、復健年也算忠誠年資。 */
  if(LV[S.lv].top&&!S.skipMid){
    S.teamYears=(S.teamYears||0)+1; /* 樣本不足仍是在一軍度過的球季，照常累積一軍年資。 */
    if(seasonGrade(S.lastSt,S.lv)>=2)S.teamStarYears=(S.teamStarYears||0)+1;
  }

  if(!S.traits.goldcloth&&S.orgTeam==='台中猛獁'&&(S.teamTally.CPBL&&S.teamTally.CPBL['台中猛獁']>=10)){
    S.traits.goldcloth=true;
    card('gold','隱藏屬性解鎖：黃金聖衣','效力 台中猛獁 滿十年，你愛猛獁，不離不棄。'); board(1);
  }

  if(!S.traits.franchise&&S.teamYears>=7&&S.champThisTeam&&S.champTeam===S.orgTeam){
    const removedCancer=!!S.traits.cancer;
    if(removedCancer)removeTrait('cancer','更衣室毒瘤');
    S.traits.franchise=true; S.franchiseActive=true; S.franchiseTeamName=S.orgTeam;
    card('gold','隱藏屬性解鎖：神主牌','小孩指著你說：「我媽媽從小就看你打球」。球團高層很清楚，放你走球迷會把主場拆了——<b class="hl">合約市場保有 4% 招牌球星溢價，並提高引退評價</b>。'+(removedCancer?'<br><b class="hl">你以長年貢獻重新贏回休息室信任，「更衣室毒瘤」解除。</b>':'')); board(1);
  }else if(S.traits.franchise&&!S.franchiseActive&&S.teamYears>=7){
    S.franchiseActive=true; S.franchiseTeamName=S.orgTeam;
    card('gold','神主牌效果恢復',`來到 <b class="hl">${S.orgTeam}</b> 的第七個頂級球季，你再一次成為城市無法割捨的招牌——<b class="hl">交易保護與 4% 合約溢價重新生效</b>。`); board(1);
  }

  /* ◯◯先生：同隊至少 15 個一軍球季，且其中至少 2/3 達明星級表現。 */
  const mrEligible=isMrTeamEligible(S.teamYears,S.teamStarYears);
  if(!S.traits.mrteam&&mrEligible){ S.traits.mrteam=true; S.mrTeamName=S.orgTeam;
    const nick=teamNick(S.orgTeam),starNeed=Math.ceil(S.teamYears*2/3);
    card('gold','隱藏稱號：'+nick+'先生',`在同一支球隊走過 <b class="hl">${S.teamSeasons}</b> 個球季，其中 <b class="hl">${S.teamYears}</b> 季站在一軍，並有 <b class="hl">${S.teamStarYears}</b> 季達明星級表現（所需 ${starNeed} 季）。球迷不再喊你的名字，他們喊你「<b class="hl">${nick}先生</b>」——你就是這支球隊的代名詞。`); board(1);
  }

  /* ◯◯七彩球衣：同一聯盟生涯效力球隊數超標（中職>3、日職>5、美職>5）。 */
  unlockRainbowLeagues().forEach(({label,teams})=>{
    card('info','隱藏稱號：'+label+'七彩球衣',`打開衣櫃，${teams} 件不同的球衣掛在眼前——${label}的球隊你快穿過一輪了。球迷笑稱你是「<b class="hl">七彩球衣</b>」：去到哪裡都能活下來，這也是一種本事。`); board(1);
  });
}
/* ---------- 季末 ---------- */
export function phaseEnd(){
  board(2);
  const outside=Math.round(S.yearOutsideIncome||0);
  const outsideText=outside?`<br>業外收入：<b class="hl">+${fmtMoney(outside)}</b>`:'';
  if(S.stage==='PRO'){
    if(!S.ct)S.ct=makeContract(1,1,S.lv,currentSalaryRating(S.lastD||0),undefined,null,'預設約');
    const sal=contractAnnual(); /* 合約保證年薪：不因本季表現、受傷或能力變動而重算 */
    S.salary+=sal;
    /* 球季成績先於季末結算寫入；把本年度薪資／業外收入補回同一列，供結算圖使用。 */
    const seasonLog=[...(S.log||[])].reverse().find(r=>r.st&&r.y===S.year);
    /* 一併記下這一季是由哪一份合約給付的，結算年表才分得出
       「同一份合約的第幾年」與「另外簽的單年約」。 */
    if(seasonLog){ seasonLog.salary=sal; seasonLog.outsideIncome=outside;
      seasonLog.ctId=(S.ct&&S.ct.__ctid)||null; }
    let extra='';
    if(LV[S.lv].top&&S.seasonFactor>0){
      const tp=LV[S.lv].top;
      const pc=teamChampRate(S.orgTeam,S.year);
      let pcc=pc;
      if(S.tradeRefuse>0){ pcc*=0.75; } /* 否決交易:戰力略受影響(成本已降) */
      pcc=championshipChance(pcc,!!S.traits.championmaker);
      if(chance(pcc)){ const cN={CPBL:'中職總冠軍',NPB:'日本一',MLB:'世界大賽冠軍'}[LV[S.lv].top];
        S.honors.push(`${S.year} ${cN}`); S.wonChamp=true; S.champThisTeam=true; S.champTeam=S.orgTeam; checkChampionTrait(); extra=`<br>球隊奪下 <b class="hl">${cN}</b>，全城陷入瘋狂！`; } }
    if(S.tradeRefuse>0)S.tradeRefuse--;
    if(S.tradeHeat>0)S.tradeHeat=Math.max(0,S.tradeHeat-5);
    card('','季末結算',`本年度薪資：<b class="hl">${fmtMoney(sal)}</b>（生涯累計 ${fmtMoney(Math.round(S.salary))}）${S.ct?`｜合約剩 ${Math.max(0,S.ct.yrs-1)} 年`:''}${outsideText}${extra}`);
    board(2);
  }else if(S.stage==='AMA'){
    S.salary+=AMA_ANNUAL;
    card('','企業隊年度收入',`本年度工作年薪：<b class="hl">${fmtMoney(AMA_ANNUAL)}</b>（每月 4 萬；生涯累計 ${fmtMoney(Math.round(S.salary))}）。有時候你分不清，你是員工，還是球員？${outsideText}`);
    board(2);
  }
  /* 冠軍、薪資與國際賽都結算完畢後，先把本季記在原隊，再進入季末交易。 */
  if(S.stage==='PRO')updateTeamTenureTraits();
  const go=()=>S.stage==='PRO'?offseasonTradeCheck(()=>movement()):movement();
  if(S.pool>0){ const p=S.pool; S.pool=0;
    choose('分配能力點',[{t:'<i class="ph-bold ph-gear" aria-hidden="true"></i>開始分配',s:`${p} 點・大賽／國際賽成果`,main:true,f:()=>allocUI({pool:p},'季末能力點分配（大賽／國際賽成果）',go)}]); }
  else go();
}
/* ---------- 升降級與去向 ---------- */
export function annualHomecomingEligible(org,lv){
  return (org==='MiLB'&&!!LV[lv]&&!LV[lv].top)||(org==='NPB'&&lv==='NPB2');
}
export function finishContractYear(o){
  if(!S.ct)S.ct=makeContract(2,1,S.lv,currentSalaryRating(S.lastD||0),undefined,null,'預設約');
  S.ct.yrs--;
  if(S.ct.annualSchedule&&S.ct.annualSchedule.length)S.ct.annualSchedule.shift();
  /* 母隊延長/換約時機:多年約跑到倒數第二年、或最後一張約剩1年,可談延長 */
  if(S.ct.yrs===1&&LV[S.lv].top&&!S.ct.extOffered&&S.faElig&&(S.lastD||0)>=1&&chance(45)){
    S.ct.extOffered=true; extensionOffer(o); return;
  }
  if(S.ct.yrs<=0){
    if(LV[S.lv].top){
      if(S.faElig){ faFlow(o); return; }
      /* 菜鳥5年內:球團行使續約權,續短約,薪資不低於層級基數 */
      const renewalProfile=contractMarketProfile(S.lastD||0), renewalD=renewalProfile.rating, renewalAnnual=controlledAnnual(S.lv,renewalD,renewalProfile.aav);
      S.ct=makeContract(ri(1,2),1,S.lv,renewalD,renewalAnnual,{extOffered:false,controlled:true},'球團續約');
      card('info','球團續約',`你仍在選秀球隊掌控期（服務 ${S.svc}/5 年），球團依服務年資與近年表現行使續約權——固定年薪 <b class="hl">${fmtMoneyFx(S.ct.annual)}</b> × <b class="hl">${S.ct.yrs} 年</b>，合約總額 <b class="hl">${fmtMoneyFx(S.ct.annual*S.ct.yrs)}</b>。`); board(1);
    } else { S.ct=makeContract(ri(1,2),1,S.lv,currentSalaryRating(S.lastD||0),undefined,null,'球團續約'); } /* 非頂級層級 */
  }
  /* 仍在海外養成層級時，每個球季結束都讓玩家重新決定是否返台。
     日職二軍與小聯盟相同，不因身處支配下體系就鎖死去向。 */
  if(annualHomecomingEligible(S.org,S.lv)){
    const homeLv=o>=LV.CPBL1.min?'CPBL1':'CPBL2';
    const inJapan=S.org==='NPB';
    choose(inJapan?'旅日生涯抉擇':'旅美生涯抉擇',[
      {t:inJapan?'繼續挑戰日職':'繼續挑戰小聯盟',main:true,
       s:inJapan?`留在${LV[S.lv].n}，繼續爭取升上一軍`:`留在${LV[S.lv].n}，繼續朝大聯盟前進`,f:()=>crossOffers(o)},
      {t:`返台加盟中職（${LV[homeLv].n}）`,s:`結束${inJapan?'旅日':'小聯盟'}挑戰，回到台灣延續職業生涯`,f:()=>{
        signTo('CPBL',homeLv);
        card('good','返鄉',`你決定結束${inJapan?'旅日':'旅美'}挑戰，回到台灣，從<b class="hl">${LV[homeLv].n}</b>延續職業生涯。`);
        advance();
      }}
    ]);
    return;
  }
  crossOffers(o);
}
export function movement(){
  const o=ovr();
  if(S.stage==='HS'){ if(S.stageYr<3)advance(); else pathChoiceHS(); return; }
  if(S.stage==='U'){ if(S.stageYr<4)advance(); else pathChoiceU4(); return; }
  if(S.stage==='AMA'){
    if(S.age>=26){ endGame('選秀多年落榜，'+S.year+' 年結束球員身分，轉任基層教練。'); return; }
    choose('業餘年度結束',[
      {t:'再次投入中職選秀',main:true,f:()=>runDraft(false,()=>advance())},
      {t:'高掛球鞋',warn:true,f:()=>endGame('在業餘球隊劃下句點。')}]);
    return;
  }
  /* 職業 */
  if(S.org==='NPB')S.npbYears++;
  if(LV[S.lv].top){ /* 轉換聯盟：直接解除球團 5 年控制期限制，往後只要合約到期就是自由球員 */
    if(S.svcOrg && S.svcOrg!==S.org){ S.faElig=true; }
    S.svcOrg=S.org;
    S.svc=(S.svc||0)+1; if(S.svc>=5)S.faElig=true;
  }
  if(S.skipMid){ finishContractYear(o); return; } /* 復健年不升降級，但照常累積年資、消耗合約年度與處理到期續約。 */
  if(o<30){ buyoutRemaining(1); endGame('能力已跌破中職二軍最低水準，'+S.year+' 年球季後遭釋出，被迫引退。'); return; }
  const path=PATHS[S.org], idx=path.indexOf(S.lv);
  let minReq=LV[S.lv].min;
  if(S.org==='NPB'&&S.npbYears>=8){ minReq-=4; }
  const perf=(S.seasonFactor>=0.5)?(S.lastD||0):null; /* 傷缺季不看成績 */
  /* 得獎保護傘:當季拿過個人獎項(MVP/王/最佳投手,不含明星賽)→絕不下放/釋出 */
  const wonAward = S.honors.some(x=>x.startsWith(String(S.year))&&/王|MVP|賽揚|澤村|最佳投手|最佳打者|金手套|守備聖經/.test(x)&&!/明星賽/.test(x));
  /* Fix C:實際成績達標保護傘——用當季真實數據(不看能力 d),打得好就不下放 */
  let goodReal=false;
  { const st=S.lastSt;
    if(st&&S.seasonFactor>=0.5){
      /* 二刀流:任一側達標就保護。只看一側會出現「投得夠好卻因為棒子安靜被下放」。 */
      if(S.pos==='P'||S.pos==='TW'){
        const era=baseballERA(st)??99, whip=baseballWHIP(st)??99;
        /* 投手:ERA 或 WHIP 達聯盟一線水準,或有一定救援/中繼產能 */
        const K=keepTh(S.lv);
        if((st.IP||0)>0&&(era<=K.era||whip<=K.whip||(st.SV||0)>=15||(st.HLD||0)>=15))goodReal=true;
      }
      if(S.pos!=='P'&&!goodReal){
        const obp=st.PA>0?(st.H+st.BB)/st.PA:0, slg=slgOf(st), ops=obp+slg;
        /* 野手:OPS 達聯盟主力水準(.720+),或雙位數轟/盜等實質產能 */
        const K=keepTh(S.lv);
        if(ops>=K.ops||st.HR>=K.hr||st.SB>=15||st.RBI>=K.rbi)goodReal=true;
      }
    }
  }
  if(wonAward||goodReal){ /* 拿獎 或 帳面成績達標 → 球團不會處理掉 */ }
  else if(o<minReq){
    if(perf!==null&&perf>=0){ /* 帳面成績夠好,球團續留觀察 */
      card('info','球團評估',`體能檢測數字亮紅燈，但你用<b class="hl">實際成績</b>說話——本季表現達聯盟水準，球團決定續留一線觀察。`);
    }else{ handleDemotion(o,path,idx); return; }
  }else if(perf!==null&&perf<=-6&&chance(55)){ /* 能力還在但成績崩盤,一樣會被下放 */
    card('bad','球團評估','帳面數據遠低於聯盟水準，教練團失去耐心。');
    handleDemotion(o,path,idx); return;
  }
  /* 升級：能力門檻 ＋ 帳面成績（壓倒性表現可連跳兩級）
     舊版只看 ovr 與能力值 d，等於「體檢過關就上一軍」，實際打得如何完全不影響。
     現在是兩道關卡：能力達標之後還要看當季真實數據(seasonGrade)，打不出來就再練一年；
     反過來，能力檢測差最多 3 點但成績壓倒性，球團會破格拔擢——真實棒球的「打出來的」升法。

     判定順序刻意是「先看能力是否遠超門檻，再看樣本是否足夠，最後才看成績」：
     ① 能力已達「再下一級」的門檻(overQual) → 無條件升級。這種球員留在原層級沒有任何
        意義，不該被一次擲骰卡住（實例：能力 62 的外野手在 1A，連大聯盟門檻 56 都過了，
        卻因為受傷只出賽 25 場而被留隊）。
     ② 樣本不足(grade<0：傷缺季或打席/局數太少) → 無從論斷成績，回到看能力的舊行為。
     ③ 樣本足夠 → 依成績評等決定機率。
     ②③ 必須分開，否則「打擊率 .358 但只出賽 25 場」會被當成「成績普通」，
     跳出的訊息還會反過來說他帳面成績不夠好。 */
  if(idx<path.length-1){ const nx=path[idx+1];
    const grade=S.lastSt?seasonGrade(S.lastSt,S.lv):-1;
    const abilityOK=o>=LV[nx].min;
    const nx2=idx<path.length-2?path[idx+2]:null;
    /* 遠超門檻＝已達再下一級的標準；沒有再下一級時以 min+5 代之(各層級間距約 4~5)。 */
    const overQual=abilityOK&&(nx2?o>=LV[nx2].min:o>=LV[nx].min+5);
    const forced=!abilityOK&&o>=LV[nx].min-3&&grade>=3;
    let promote=false;
    if(abilityOK){
      if(overQual)promote=true;                    /* ① 能力遠超門檻 */
      else if(grade<0)promote=chance(85);          /* ② 樣本不足:看能力 */
      else promote=grade>=3?true:grade===2?chance(90):grade===1?chance(70):chance(25);
    }
    else if(forced)promote=chance(55);
    if(!promote&&abilityOK){
      if(grade<0)card('info','球團評估',`體能檢測已達 <b>${LV[nx].n}</b> 的標準，但本季<b class="hl">出賽場數不足</b>，球團看不到足夠的樣本——再打一個完整球季。`);
      else if(grade<=1)card('info','球團評估',`體能檢測已達 <b>${LV[nx].n}</b> 的標準，但帳面成績還沒說服教練團——<b class="hl">再打一年給他們看</b>。`);
    }
    if(promote){
      let to=nx;
      /* 連跳兩級:成績壓倒性,或能力已明顯凌駕再下一級(受傷球季也給得到) */
      if(nx2&&o>=LV[nx2].min+2&&(grade>=3||o>=LV[nx2].min+6))to=nx2;
      const oldAnnual=S.ct?(S.ct.annualSchedule&&S.ct.annualSchedule.length?S.ct.annualSchedule[0]:S.ct.annual):null;
      S.lv=to;
      if(forced)card('good','破格拔擢','體能檢測的數字還差一點，但你的成績讓球團無法忽視——<b class="hl">直接把你拉上去</b>。');
      card('good','升級通知',`表現獲得肯定，${to!==nx?'<b class="hl">連跳兩級</b>':'晉升'} <b class="hl">${LV[to].n}</b>！`); board(2);
      if(S.ct&&Number.isFinite(oldAnnual)&&levelMinAnnual(to)>oldAnnual){
        const raised=contractAnnual();
        card('info','升級薪資保障',`原合約固定年薪 <b>${fmtMoney(oldAnnual)}</b> 低於 ${LV[to].n}保障標準；自下季起調整為 <b class="hl">${fmtMoney(raised)}</b>。只要這份合約還沒到期，即使之後被下放，也會照調整後年薪給付。`);
      }
      if(LV[to].top)tlNote(2,'升上'+LV[to].n);
      if(S.traits.yips){ removeTrait('yips','失憶症'); card('good','走出陰影','將身體與心靈重新來過，終於爬回了原本的高度，——<b class="hl">失憶症痊癒</b>。'); } } }
  finishContractYear(o);
}
