import {LV, envWhip, envLeagueOps} from './teams.js?v=2.1.0';
/* ================= 「怎樣算一個好球季」的門檻 =================

   這些數字原本散在 awards.js（TH 表）、season.js（pitchGrade／batGrade）與
   phases.js（降級免疫）三個檔案裡，而且全是絕對值：ERA 2.80、OPS .850、
   全壘打 20 支。在舊版那沒問題，因為舊版三個聯盟的平均球季長得一模一樣
   （ERA 都是 4.32、OPS 都是 .64）。改成真實的聯盟環境之後，同一個絕對數字
   在不同聯盟代表完全不同的水準，整組必須重訂。

   ── 怎麼重訂的 ──
   不是憑感覺重猜，也不是等比例換算——等比例會失效，因為新舊母體的離散程度不同。

   所以用的是「保住分布」：拿 17,500 段完整生涯（新舊各一份、同一組亂數種子）
   跑出來的每一個職業球季，對每一個門檻去解一組新值，讓
     · 獎項：整個母體的「平均得獎機率」與第 90／99 百分位的機率都對回舊版
     · 其他：達成該門檻的球季比例對回舊版
   工具是 tools/rethreshold.mjs（FIT=1 跑獎項那一段）。擬合誤差都在 0.5 個
   百分點以內。也就是說：獎項的稀有度、升降級的節奏、名人堂的難度全部沒有變，
   變的只是成績單上的數字終於像那個聯盟該有的樣子。

   ── 為什麼有些門檻看起來很極端 ──
   中職的打擊王下限是 .330、全壘打王保送 46 支，比真實世界的年度王還高。
   那是對的：模擬母體裡「打滿規定打席」的球季全是倖存者——能站穩該聯盟的本來就是
   強打者，而且率值改成指數模型之後，一個練起來的球員在弱聯盟本來就會打出誇張數字。
   門檻是拿來算「你這一季贏過場外那個看不見的聯盟的機率」，錨點必須是這群人
   而不是全聯盟平均。

   ── 二軍與小聯盟 ──
   沒有真實資料可擬合，所以繼承母聯盟的「比值」（門檻 ÷ 該聯盟環境值），
   再乘上該層級自己的環境。這樣一個 2A 的好球季跟一個大聯盟的好球季，
   相對各自的聯盟是同一件事。 */

/* 每個層級屬於哪個母聯盟（比值從那裡繼承）。 */
const PARENT={CPBL2:'CPBL',CPBL1:'CPBL',NPB2:'NPB',NPB1:'NPB',
  R:'MLB',A1:'MLB',A2:'MLB',A3:'MLB',MLB:'MLB'};

/* ── 獎項門檻 [必不得獎下限, 必得獎上限] ──
   sv / hld / w 沒有重擬合：它們來自出賽數與勝率，跟率值環境無關，分布沒有變。 */
export const AWARD_TH={
  CPBL:{ g:120, era:[2.40,1.41], eraK:[2.30,1.13], sv:[22,35], hld:[18,30],
         so:[139,199], w:[10,16], avg:[0.330,0.402], hr:[21,47], rbi:[81,137], obp:[0.399,0.464] },
  NPB: { g:143, era:[2.67,1.74], eraK:[2.59,1.42], sv:[22,35], hld:[18,30],
         so:[134,186], w:[10,16], avg:[0.322,0.389], hr:[19,33], rbi:[85,117], obp:[0.390,0.453] },
  MLB: { g:162, era:[3.58,2.66], eraK:[3.52,2.48], sv:[22,35], hld:[18,30],
         so:[171,214], w:[14,20], avg:[0.302,0.370], hr:[29,45], rbi:[102,146], obp:[0.374,0.444] },
};

/* ── 三個母聯盟的比值 ──
   全部是「擬合出來的絕對門檻 ÷ 該聯盟的環境值」。ERA 除以聯盟 ERA、
   WHIP 除以聯盟 WHIP、OPS 除以聯盟 OPS、全壘打除以「聯盟平均打者打滿一季的支數」。 */
/* v1.6.2 重擬（率值改成指數模型之後）。有幾個比值看起來很奇怪——例如日職的
   era3 是 0.951（「壓倒性」只要求比聯盟平均好一點點）、era1 是 1.486（「及格」
   放到聯盟平均的一倍半）。那不是擬歪了，是忠實地把舊版的行為搬過來：模擬母體裡
   能站上日職一軍的球員本來就遠高於 par，舊版有 67% 的日職投手球季達到「壓倒性」。
   要不要重新設計那個階梯是另一件事，這次只負責「不要因為換模型而偷偷改掉它」。
   clEra 三個聯盟共用同一個比值（用中職的樣本量出來的 1.890 ÷ 3.72）：
   日職與大聯盟的終結者樣本各只有 73／0 個球季，量出來的數字沒有意義。 */
const RATIO={
  CPBL:{ era3:0.702, era2:0.975, era2w:1.080, whip2:0.833, era1:1.310,
         ops3:1.298, ops3h:1.203, hr3:2.111, ops2:1.110, ops1:0.961,
         keepEra:1.262, keepWhip:1.088, keepOps:1.059, keepHr:1.290, keepRbi:1.135,
         asAvg:1.035, asOps:1.110, asHr:1.759, asEraSP:1.140, asEraRP:1.100,
         mvpEra:0.737, mvpOps:1.307, boyOps:[1.405,1.685], clEra:0.508 },
  NPB: { era3:0.951, era2:1.265, era2w:1.346, whip2:0.962, era1:1.486,
         ops3:1.285, ops3h:1.206, hr3:1.673, ops2:1.126, ops1:0.974,
         keepEra:1.449, keepWhip:1.186, keepOps:1.081, keepHr:0.984, keepRbi:1.149,
         asAvg:1.094, asOps:1.126, asHr:1.181, asEraSP:1.321, asEraRP:1.530,
         mvpEra:0.978, mvpOps:1.294, boyOps:[1.371,1.607], clEra:0.508 },
  MLB: { era3:0.719, era2:0.870, era2w:0.925, whip2:0.906, era1:1.079,
         ops3:1.231, ops3h:1.160, hr3:1.311, ops2:1.073, ops1:0.969,
         keepEra:1.038, keepWhip:1.061, keepOps:1.038, keepHr:0.631, keepRbi:0.909,
         asAvg:1.082, asOps:1.073, asHr:0.777, asEraSP:0.988, asEraRP:0.919,
         mvpEra:0.812, mvpOps:1.224, boyOps:[1.279,1.572], clEra:0.508 },
};

/* 該層級「聯盟平均的打者打滿一季」會打出多少支全壘打／多少打點。
   全壘打門檻用它當分母，這樣同一個比值在 120 場與 162 場的聯盟都說得通。 */
export function fullSeasonHR(lv){
  const L=LV[lv]||LV.CPBL1, E=L.env;
  return E.hr*((L.g||120)*4.25*0.88);
}
export function fullSeasonRBI(lv){
  const L=LV[lv]||LV.CPBL1, E=L.env, ab=(L.g||120)*4.25*0.88;
  const hr=E.hr*ab, h=E.avg*ab;
  return hr*2.1+(h-hr)*0.30;   /* 與 simSeason 的打點公式同式 */
}
function R(lv){ return RATIO[PARENT[lv]||'CPBL']; }

/* ── 季末評等的門檻（投手） ── */
export function pitchTh(lv){
  const L=LV[lv]||LV.CPBL1, E=L.env, r=R(lv), w=envWhip(E);
  return {era3:E.era*r.era3, era2:E.era*r.era2, era2w:E.era*r.era2w,
    whip2:w*r.whip2, era1:E.era*r.era1};
}
/* ── 季末評等的門檻（打者） ── */
export function batTh(lv){
  const L=LV[lv]||LV.CPBL1, o=envLeagueOps(L.env), r=R(lv);
  return {ops3:o*r.ops3, ops3h:o*r.ops3h, hr3:Math.round(fullSeasonHR(lv)*r.hr3),
    ops2:o*r.ops2, ops1:o*r.ops1};
}
/* ── 降級免疫：這一季夠不夠好到不該被下放 ── */
export function keepTh(lv){
  const L=LV[lv]||LV.CPBL1, E=L.env, r=R(lv);
  return {era:E.era*r.keepEra, whip:envWhip(E)*r.keepWhip, ops:envLeagueOps(E)*r.keepOps,
    hr:Math.round(fullSeasonHR(lv)*r.keepHr), rbi:Math.round(fullSeasonRBI(lv)*r.keepRbi)};
}
/* ── 明星賽入選、MVP 資格、年度打者、終結者 ── */
export function starTh(lv){
  const L=LV[lv]||LV.CPBL1, E=L.env, r=R(lv), o=envLeagueOps(E);
  return {avg:E.avg*r.asAvg, ops:o*r.asOps, hr:Math.round(fullSeasonHR(lv)*r.asHr),
    eraSP:E.era*r.asEraSP, eraRP:E.era*r.asEraRP,
    mvpEra:E.era*r.mvpEra, mvpOps:o*r.mvpOps,
    boyOps:[o*r.boyOps[0],o*r.boyOps[1]], clEra:E.era*r.clEra};
}
