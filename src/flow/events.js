import {S} from '../core/state.js?v=1.5.12';
import {R, pick, chance, clamp} from '../core/rng.js?v=1.5.12';
import {ABL, POS_AB} from '../data/abilities.js?v=1.5.12';
import {LV} from '../data/teams.js?v=1.5.12';
import {EVENTS, EVENT_CATEGORY_NAMES, EVENT_COMBINATIONS, EVENT_ROUTES, eventInjuryRisk} from '../data/events.js?v=1.5.12';
import {card, choose, board} from '../ui/dom.js?v=1.5.12';
import {addAb, statBonus, statBonusTxt, abGainTxt, ovr} from '../engine/ability.js?v=1.5.12';
import {majorChampionshipCount} from '../engine/championship.js?v=1.5.12';
export function traitCard(key,name,desc,tone){ S.traits[key]=true;
  card(tone||'gold','隱藏屬性解鎖：'+name,desc); board(0); }
export function removeTrait(key,label){ if(S.traits[key]){ S.traits[key]=false;
    if(!S.removed.includes(label))S.removed.push(label); } }
export function checkChampionTrait(){
  const count=majorChampionshipCount(S.honors);
  if(!S.traits.championmaker&&count>=5){
    traitCard('championmaker','優勝請負人','你是掌握勝利的神，只要擁有你，球隊奪冠機率大增。國家隊與職業隊奪冠率提升5%。');
    return true;
  }
  return false;
}
export function evOdds(){ /* 事件卡成功率:顯示與擲骰共用同一來源 */
  let base=(S.traits.genius||S.traits.late||S.traits.clutch)?70:50; /* 天才/大器晚成/大心臟 70 */
  if(S.traits.thief)base-=10; /* 薪水小倫 -10 */
  /* 大心臟(2026-08-20 調弱)：不再免除豪賭的 -15 懲罰。非天才的效果是「全力成功率提升到
     與天才同等」(base 進 70 後照扣 15 → 55%，正好是天才的全力線)；本身已是天才者這條
     對他無感，改為全力 +5(→60%)。調弱前大心臟全力 70%、訓練事件期望值 2.2，遠壓過保守
     與普通的 0.8，豪賭是無腦最優解；調弱後非天才 0.75、天才 1.6，三條路線拉回同一水平。 */
  const boldPen=15;
  const clutchBold=(S.traits.clutch&&S.traits.genius)?5:0;
  /* 愛將(2026-08-20 調弱)：出賽保底與守位紅利已經夠有價值，「普通」加成由 20 降為 5——
     原本天才+愛將的普通應對高達 90%。保守與全力不受影響,薪水小倫的 -10 已含在 base 裡。 */
  const normBonus=S.traits.favorite?5:0;
  const safePenalty=S.traits.latepractice?5:0;
  return {safe:Math.min(95,base+20-safePenalty), norm:Math.min(95,base+normBonus), bold:base-boldPen+clutchBold};
}
export function eventEligible(ev,state){
  const s=state||S;
  if(ev.maxAge!==undefined&&s.age>ev.maxAge)return false;
  if(ev.role==='P'&&s.pos!=='P')return false;
  if(ev.role==='C'&&s.pos!=='C')return false;
  if(ev.role==='B'&&(s.pos==='P'||s.pos==='C'))return false;
  /* F=野手(所有非投手,含捕手)。B 沿用舊定義(內外野手,捕手另有專屬卡池)，但像跑壘這種
     捕手同樣會遇到的情境用 B 會把捕手誤排除，所以另立 F 只排除投手。 */
  if(ev.role==='F'&&s.pos==='P')return false;
  if(ev.scope!=='*'&&s.org!==ev.scope)return false;
  if(ev.times.includes('ALL'))return true;
  if(s.stage==='PRO')return ev.times.includes(LV[s.lv]&&LV[s.lv].top?'PRO':'MINOR');
  return ev.times.includes(s.stage);
}
export function eventPool(category,state){ return EVENTS.filter(ev=>ev.category===category&&eventEligible(ev,state)); }
function shuffled(list){ const out=list.slice(); for(let i=out.length-1;i>0;i--){ const j=Math.floor(R()*(i+1)); [out[i],out[j]]=[out[j],out[i]]; } return out; }
export function availableEventCombinations(state){
  return EVENT_COMBINATIONS.filter(combo=>{
    const required=combo.reduce((counts,category)=>{ counts[category]=(counts[category]||0)+1; return counts; },{});
    return Object.entries(required).every(([category,count])=>eventPool(category,state).length>=count);
  });
}
export function eventCombinationOptions(state){
  const available=availableEventCombinations(state);
  const routes=EVENT_ROUTES.map(route=>{
    const combinations=route.combinations.filter(combo=>available.includes(combo));
    return combinations.length?{name:route.name,combination:pick(combinations)}:null;
  }).filter(Boolean);
  const training=routes.find(route=>route.name==='訓練至上');
  if(!training)return shuffled(routes).slice(0,3);
  const pair=shuffled(routes.filter(route=>route!==training)).slice(0,2);
  const top=pair.find(route=>route.name==='體驗人生')||pair.find(route=>route.name==='代言寵兒')||pair[0];
  const bottom=pair.find(route=>route.name==='均衡生活')||pair.find(route=>route!==top);
  return [top,training,bottom].filter(Boolean);
}
function eventTarget(ev){ return ev.target in S.ab?ev.target:pick(POS_AB[S.pos]); }
function eventCash(mode){
  const base={CPBL2:5,CPBL1:20,NPB2:10,NPB1:50,R:5,A1:7,A2:10,A3:15,MLB:100}[S.lv]||5;
  const traitBonus=S.traits.adking?1.1:1;
  return Math.max(1,Math.round(base*({bold:1.5,norm:1,safe:.5}[mode]||1)*traitBonus));
}
export function recordOutsideIncome(value){
  const cash=Math.max(0,Math.round(Number(value)||0));
  S.salary=(S.salary||0)+cash;
  S.outsideIncome=(S.outsideIncome||0)+cash;
  S.yearOutsideIncome=(S.yearOutsideIncome||0)+cash;
  return cash;
}
const fmtEventMoney=value=>Number(value).toLocaleString()+'萬';
/* clutchTier：0=無大心臟、1=大心臟(非天才)、2=大心臟+天才。
   2026-08-20 調弱：只有「天才加持的大心臟」保有成功獎勵放大(+4/+2)；
   非天才的大心臟成功獎勵與常人相同，只保留「失敗懲罰減 1」。 */
export function eventPlan(category,mode,good,clutchTier){
  const soft=clutchTier>=1, full=clutchTier>=2; /* soft=失敗減 1;full=成功獎勵放大 */
  if(category==='training'){
    /* 訓練的成功報酬與失敗風險都隨選擇強度遞增：保守 1、普通 2、全力 3。
       大心臟+天才把全力成功提高為 +4；大心臟(不分天才)把失敗懲罰從 -3 降為 -2。 */
    const points=mode==='safe'?1:mode==='norm'?2:(good?(full?4:3):(soft?2:3));
    return {ability:good?points:-points,stat:0,cash:false};
  }
  if(category==='encounter'){
    const points=mode==='safe'?1:mode==='norm'?2:(good?3:(soft?2:3));
    return {ability:0,stat:good?points:-points,cash:false};
  }
  if(mode==='safe')return {ability:0,stat:good?1:-1,cash:good};
  if(mode==='norm')return {ability:good?1:0,stat:good?0:-1,cash:good};
  return {ability:good?1:0,stat:good?(full?2:1):(soft?-1:-2),cash:good};
}
function showEvent(ev,after){
  const od=evOdds();
  const opts=[
    ['bold','加成／減益幅度最大',true,false],
    ['norm','加成／減益幅度中等',false,true],
    ['safe','加成／減益幅度最小',false,false],
  ].map(([mode,scale,warn,main])=>{
    const c=ev.choices[mode];
    return {t:c.label,warn,main,center:true,s:`成功率 ${od[mode]}%｜${scale}`,f:()=>resolveEvent(ev,mode,after)};
  });
  /* 名稱與引言拆成兩個元素：摺疊列只取 .ev-h（名稱），引言留給內文。
     原本靠 <br> 分行，但 actToggleSync() 是用 textContent 取字，<br> 會被吃掉，
     兩段黏成一長串再被截斷，手機上就變成一行讀不完的省略號。 */
  choose(`<span class="ev-h">事件｜${EVENT_CATEGORY_NAMES[ev.category]}｜${ev.n}</span>`+
         `<small>${ev.intro}</small>`,opts);
}
export function drawEventCards(sequence,state){
  const used=new Set();
  return sequence.map(category=>{
    const pool=eventPool(category,state).filter(ev=>!used.has(ev.id));
    const ev=pick(pool);
    if(ev)used.add(ev.id);
    return ev;
  }).filter(Boolean);
}
function runEventCards(cards,done,index){
  const i=index||0;
  if(i>=cards.length){ done(); return; }
  const after=()=>{ board(1); runEventCards(cards,done,i+1); };
  showEvent(cards[i],after);
}
export function isAmateurEventStage(state){
  const s=state||S;
  return s.stage==='HS'||s.stage==='U'||s.stage==='AMA';
}
export function amateurEventPool(state){
  const s=state||S;
  return EVENTS
    .filter(ev=>(ev.category==='training'||ev.category==='encounter')&&eventEligible(ev,s))
    /* 業餘沒有可承接的球季成績數值：保留遭遇故事，但一律視為訓練卡，
       讓顯示、成功/失敗點數與結算都改走能力成長。原始職業卡池不受影響。 */
    .map(ev=>ev.category==='encounter'?{...ev,category:'training'}:ev);
}
export function drawEvents(done){
  /* 高中、大學與業餘沒有代言或成績加成，也不選事件組成：
     通用卡與該階段限定卡混池後，全部以訓練卡抽取；高中與業餘三張，
     大學維持兩張。 */
  if(isAmateurEventStage(S)){
    const count=S.stage==='U'?2:3;
    runEventCards(shuffled(amateurEventPool(S)).slice(0,count),done,0);
    return;
  }
  const routes=eventCombinationOptions(S);
  choose('請決定今年的事件組成',routes.map(route=>({
    t:route.name,main:true,
    f:()=>runEventCards(drawEventCards(route.combination,S),done,0)
  })));
}
export function resolveEvent(ev,mode,done){
  done=done||function(){};
  const od=evOdds(); /* 與畫面顯示同源,保證所見即所得 */
  if(mode==='safe')S.cntSave++;
  let good,tag;
  if(mode==='safe'){ good=chance(od.safe); tag='保守應對'; }
  else if(mode==='bold'){ good=chance(od.bold); tag='全力一搏';
    if(good){ S.cntBoldWin++; if(ev.category==='endorsement')S.cntEndorseBoldWin=(S.cntEndorseBoldWin||0)+1; }
    else S.cntBoldFail++; }
  else { good=chance(od.norm); tag=''; if(good)S.cntNormWin=(S.cntNormWin||0)+1; } /* 愛將:普通成功才算 */
  if(mode==='safe'&&good)S.cntSaveWin=(S.cntSaveWin||0)+1; /* 自律狂:保守成功才算 */
  recordTrainingSafeFailure(ev,mode,good);
  if((ev.n==='宵夜文化'||ev.n==='場外代言邀約')&&mode!=='safe'&&!good)S.cntSnack++;
  if(mode==='bold'&&!good&&(ev.category==='encounter'||ev.category==='endorsement'))S.cntSocialBoldFail=(S.cntSocialBoldFail||0)+1;
  const plan=eventPlan(ev.category,mode,good,S.traits.clutch?(S.traits.genius?2:1):0), out=[];
  if(plan.cash){ const cash=recordOutsideIncome(eventCash(mode));
    out.push(`業外收入 <span class="up">+${fmtEventMoney(cash)}</span>`); }
  if(plan.ability){
    const k=eventTarget(ev),delta=addAb(k,plan.ability);
    const overflow=plan.ability>0?(S.lastOverflow||0):0;
    /* 能力已滿 80 時全額溢出，這裡不重複報「加了幾點」，只報轉成的狀態火燙 */
    if(!(overflow>0&&delta===0))out.push(abGainTxt(k,plan.ability-overflow,delta));
    if(overflow>0)statBonus(overflow,out);
  }
  if(plan.stat){ S.pendStat=(S.pendStat||0)+plan.stat; out.push(statBonusTxt(plan.stat)); }
  const injuryRisk=eventInjuryRisk(ev,mode,good,!!S.traits.clutch);
  if(injuryRisk){ S.tmpInj=(S.tmpInj||0)+injuryRisk; out.push(`本季受傷機率 <span class="dn">+${injuryRisk}%</span>`); }
  const result=ev.choices[mode];
  const resultText=good?result.good:result.bad;
  card(good?'good':'bad','事件卡｜'+ev.n+(tag?`（${tag}）`:''),
    `${resultText}${/[。！？!?]$/.test(resultText)?'':'。'}${mode==='bold'&&good?'<b class="hl">全力一搏成功！</b>':''}${mode==='bold'&&!good?'<b class="dn">全力一搏失敗……</b>':''}<br>${out.join('｜')||'沒有額外數值變動'}`);
  checkTraitsMid();
  done();
}
export function recordTrainingSafeFailure(ev,mode,good){
  if(mode==='safe'&&!good&&ev&&ev.category==='training'){
    S.cntTrainingSafeFail=(S.cntTrainingSafeFail||0)+1;
  }
}
/* 賽季中即時可解鎖的特性 */
export function allocDone(touched,isDice){
  const keys=Object.keys(touched);
  if(isDice&&S.stage!=='HS'&&keys.length){ /* 只計職業/大學季初骰的專注度 */
    const tot=Object.values(touched).reduce((a,b)=>a+b,0);
    let mk=keys[0]; keys.forEach(k=>{ if(touched[k]>touched[mk])mk=k; });
    const focused=(touched[mk]/tot>=0.75)?mk:null; /* 七成五以上灌同一項 */
    if(focused&&focused===S.samePickKey)S.samePick++;
    else if(focused){ S.samePickKey=focused; S.samePick=1; }
    else { S.samePickKey=null; S.samePick=0; }
    if(S.samePick>=3&&!S.traits.combo){ S.traits.combo=true; S.samePickBonus=true;
      S.comboKey=S.samePickKey; /* 鎖定解鎖當下的能力,之後不再變動 */
      traitCard('combo','大巧不工',`連續三年，你把所有汗水都澆在同一個工具上——<b class="hl">季初系統會自動擲 1 顆骰，永遠加在你專精的「${ABL[S.comboKey]}」上</b>。專精者的複利。`); }
  }
  /* 大器晚成:25 歲後單季加點總幅度 >=8 */
  const gain=Object.values(touched).reduce((a,b)=>a+b,0);
  if(!S.traits.late&&!S.traits.genius&&ovr()<47&&S.age>=25&&S.age<32&&isDice&&gain>=16){
    S.traits.late=true;
    const exDef=S.pos==='C'?['rng','fld','arm','cat']:[];
    /* 與天才一致：潛力 70 以上的高天賦項目不再占用重新評估名額。 */
    const cands=POS_AB[S.pos].filter(k=>S.ab[k]<70&&(S.pot[k]||62)<70&&!exDef.includes(k));
    for(let i=cands.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=cands[i];cands[i]=cands[j];cands[j]=t;}
    const boost=cands.slice(0,2), bl=[];
    boost.forEach(k=>{ const oldPot=S.pot[k]||62,newPot=Math.min(80,oldPot+10),potGain=newPot-oldPot;
      S.pot[k]=newPot; S.ab[k]=clamp(S.ab[k]+5,1,80);
      bl.push(`${ABL[k]} <b class="up">+5</b>（潛力上限 ${oldPot} → ${newPot}，實際 +${potGain}）`); });
    card('gold','隱藏素質解鎖：大器晚成',`別人都以為你到頂了，你卻在這一年脫胎換骨——從今以後，每一顆訓練骰<b class="hl">永久固定 3 點以上</b>，事件卡好結果機率提升至 <b class="hl">70%</b>。`+(bl.length?`潛能重新被評估：${bl.join('、')}。`:'')+'你的故事，才正要展開。');
    board(1); }
}
export function checkTraitsMid(){
  if(!S.traits.latepractice&&(S.cntTrainingSafeFail||0)>=20){
    traitCard('latepractice','練球遲到','你總把保守當成安全牌，卻連最基本的集合時間都抓不準。二十次訓練失敗後，教練不再相信你的「慢慢來」——<b class="dn">往後「保守應對」成功率永久 −5 個百分點</b>。','bad'); }
  if(!S.traits.adking&&(S.cntEndorseBoldWin||0)>=5){
    traitCard('adking','業配王','你在廣告上的時間，比明星還多，從此代言取得金額多10%'); }
  /* 自律狂:25 歲前累積保守「成功」15 次 + 從未外遇被抓 + 宵夜 <5 次 */
  if(!S.traits.disc&&S.age<25&&(S.cntSaveWin||0)>=15&&S.love.caught===0&&S.cntSnack<5){
    traitCard('disc','自律狂','你見過凌晨四點的洛杉磯嗎？——年紀輕輕就把身體當成聖殿經營，沒有派對、沒有酒精，只有重訓室的鐵片聲：<b class="hl">整條衰退曲線延後兩年</b>，你的巔峰比同梯更長。'); }
  /* 愛將:25 歲前普通應對成功 10 次。三條事件路線各有一個代表特性——保守是自律狂(15 次)、
     全力是大心臟(7 次)，普通這條線原本是空的。10 次對應約 86% 的達成率，與另外兩條齊平
     (自律狂 85%、大心臟 82%)。 */
  if(!S.traits.favorite&&S.age<25&&(S.cntNormWin||0)>=10){
    traitCard('favorite','愛將','不躁進，也不過度保守——你總是做出當下最合理的那個判斷。教練不需要為你多操一份心，先發名單上永遠有你的名字。<br><b class="hl">「普通應對」成功率提升 5 個百分點；出賽率保底 85%；守位門檻永久享有年輕球員的紅利</b>。'); }
  /* 大心臟:25 歲前全力一搏成功 7 次(允許失敗)。解鎖文案依當下是否為天才分流:
     只有天才加持的大心臟保有「成功獎勵放大」,非天才版把那句拿掉。 */
  if(!S.traits.clutch&&S.age<25&&S.cntBoldWin>=7){
      traitCard('clutch','大心臟',S.traits.genius
        ?'每次的豪賭淬鍊出你無與無比的心性，愈刺激的狀況只會讓你更加幹勁十足。從此以後，愈賭愈強，成功獎勵愈大，失敗懲罰愈少，不過在豪賭的路上，還是要注意一下身邊的其他人……<br><b class="hl">「全力一搏」成功率再 +5%；訓練成功加成 +4、失敗只 −2；遭遇與代言也會減輕失敗懲罰；國際賽個人成績獲得小幅加成</b>。'
        :'每次的豪賭淬鍊出你無與無比的心性，愈刺激的狀況只會讓你更加幹勁十足。從此以後，失敗懲罰愈少，不過在豪賭的路上，還是要注意一下身邊的其他人……<br><b class="hl">「全力一搏」成功率提升至天才級；訓練失敗只 −2；遭遇與代言也會減輕失敗懲罰；國際賽個人成績獲得小幅加成</b>。'); }
  /* 外務纏身:宵夜/代言/緋聞累計(以宵夜次數 + 感情事件觸發次數估) */
  if(!S.traits.distract&&!S.traits.disc&&(S.love.affairs+S.love.caught+S.cntSnack)>=4&&(S.love.affairs+S.love.caught)>=1){
    traitCard('distract','外務纏身','通告、代言、社群媒體佔據了你太多心神，休賽季很久沒有完整專注在棒球上——<b class="dn">季初擲骰永久 −1 顆</b>（最低 2 顆）。','bad'); }
  /* 更衣室毒瘤:遭遇＋代言的全力一搏失敗合計超過 10 次；渣男仍保留既有解鎖路徑。 */
  if(!S.traits.cancer&&!S.traits.franchise&&!S.traits.intlace&&((S.cntSocialBoldFail||0)>10||S.traits.scum)){
    traitCard('cancer','更衣室毒瘤','教練受夠了你的不可控，隊友對你的新聞指指點點。比起成績，球團現在更想清理休息室的氣氛——<b class="dn">季末被交易機率大增、續約條件惡化</b>。','bad'); }
}
