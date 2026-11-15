/* ---------- trait names/order/styles/effects, shared by the settlement tags, the share image and the desktop trait panel ---------- */
export const TRAIT_KEYS={pos:['legend','taiwan','goldcloth','mrteam','confidante','jiejiri','genius','iron','late','oldghost','adking','miraclegen','strongpitch','stronghit','championmaker','disc','academy','intlace','franchise','clutch','favorite','phoenix','rubber','onetool','smallschool','grinder','combo','rainbow','pitcherTC','hitterTC','nitenichi'],
  neg:['glass','scum','yips','distract','cancer','ambience','thief','latepractice']};
export const TRAIT_N={genius:'天才',iron:'鐵人',glass:'玻璃人',scum:'渣男',late:'大器晚成',oldghost:'老鬼',adking:'業配王',miraclegen:'奇蹟世代',strongpitch:'強投少年',stronghit:'強打少年',championmaker:'優勝請負人',disc:'自律狂',academy:'學院派',intlace:'國際賽之鬼',franchise:'神主牌',clutch:'大心臟',favorite:'愛將',phoenix:'浴火重生',onetool:'只會這個',rubber:'橡膠手臂',goldcloth:'黃金聖衣',confidante:'閨中密友',jiejiri:'街尻',smallschool:'小學校之光',grinder:'努力仔',yips:'失憶症',distract:'外務纏身',cancer:'更衣室毒瘤',ambience:'氣氛大師',thief:'薪水小倫',latepractice:'練球遲到',combo:'大巧不工',rainbow:'七彩球衣',taiwan:'Team Taiwan',pitcherTC:'投手三冠王',hitterTC:'打擊三冠王',nitenichi:'二天一流'};
export const TRAIT_FX={genius:'訓練骰永久 4 點起，事件卡好結果機率 70%',late:'訓練骰永久 3 點起，事件卡好結果機率 70%',oldghost:'下一年衰退減緩 50%（一生涯限一次）',adking:'代言取得金額 +10%',miraclegen:'高中階段四度以上奪冠的紀念稱號',strongpitch:'24 歲前取得日職或大聯盟年度 MVP 的紀念稱號',stronghit:'24 歲前取得日職或大聯盟年度 MVP 的紀念稱號',championmaker:'國家隊與職業隊奪冠率 +5%',disc:'衰退曲線整體延後兩年',academy:'25 歲前受傷率 −5%、季初擲骰期望值提升',iron:'受傷機率上限 10%',clutch:'全力一搏成功率提升至天才級（本身是天才則再 +5%）；失敗懲罰減 1；天才加持下訓練成功 +4；國際賽個人成績小幅提升',favorite:'「普通應對」成功率提升 5 個百分點；出賽率保底 85%；守位門檻永久享有年輕球員紅利',combo:'季初自動擲 1 顆骰，加在專精的能力上',rubber:'TJ 量表上限翻倍、打針成功率提升至 85%',phoenix:'玻璃人懲罰解除，受傷率恢復正常',intlace:'國際賽不增加受傷風險，每次徵召能力點保底 +2',franchise:'效力中的神主牌享有交易保護與 4% 招牌溢價；轉隊後暫停，同隊頂級七季後恢復；引退評價 +200 永久保留',goldcloth:'效力台中猛獁滿十年，主場的信仰',mrteam:'同隊至少十五季且三分之二為頂級球季，球隊的代名詞',taiwan:'國際賽徵召超過 5 次的國家隊常客',confidante:'紅粉知己遍佈，情場的隱藏稱號',jiejiri:'求婚被拒兩次——職業球員求婚都會成功。對吧？',smallschool:'小學校出身，站上頂級舞台',grinder:'平庸天賦，靠汗水熬成的生涯',legend:'名人堂首輪入選的歷史級評價',rainbow:'同一聯盟效力球隊數爆表',glass:'受傷機率下限 40%',yips:'系統評價 −3，升上更高層級或奪得年度獎項可解除',distract:'季初擲骰永久 −1 顆（最低 2 顆）',cancer:'季末被交易機率大增、續約條件惡化',ambience:'季末轉隊機率永久提高',thief:'事件卡失敗率永久 +10%',latepractice:'「保守應對」成功率永久 −5 個百分點',scum:'每次外遇被抓到，全能力 −5',onetool:'只剩一項武器的替補奇兵，出賽數銳減',pitcherTC:'同年同時拿下勝投王、防禦率王、三振王的投手最高榮譽，該年必得年度MVP',hitterTC:'同年同時拿下打擊王、全壘打王、打點王的打者最高榮譽，該年必得年度MVP',nitenichi:'同一年同時拿下投手三冠王與打擊三冠王——一季六個王，二刀流的極致'};
export function leagueTraitNames(leagues,suffix,fallback){
  const list=Array.isArray(leagues)?leagues.filter(Boolean):[];
  if(!list.length&&fallback)list.push(fallback);
  return [...new Set(list)].map(lg=>lg+suffix);
}
export function legendTraitNames(leagues,fallback){
  return leagueTraitNames(leagues,'歷史級球星',fallback);
}
export function rainbowTraitNames(leagues,fallback){
  return leagueTraitNames(leagues,'七彩球衣',fallback);
}
export function pitcherTCNames(leagues){
  return leagueTraitNames(leagues,'投手三冠王');
}
export function hitterTCNames(leagues){
  return leagueTraitNames(leagues,'打擊三冠王');
}
/* 二天一流：同一年投打雙三冠。名字取自宮本武藏自創的流派——「二刀流」這個詞
   就是從二天一流來的。同年六個王已經不只是「拿兩把刀」，是自成一派。 */
export function nitenichiNames(leagues){
  return leagueTraitNames(leagues,'二天一流');
}
