import {S} from '../core/state.js?v=1.5.12';
import {R, ri, pick, chance, clamp, SEED} from '../core/rng.js?v=1.5.12';
import {LV, PATHS, CPBL_TEAMS, NPB_TEAMS, MLB_TEAMS} from '../data/teams.js?v=1.5.12';
import {AMA_ANNUAL, LEVEL_MIN_ANNUAL, MLB_SERVICE_MINOR_MIN} from '../data/economy.js?v=1.5.12';
import {card, choose, board} from '../ui/dom.js?v=1.5.12';
import {tlNote} from '../ui/timeline.js?v=1.5.12';
import {ovr} from './ability.js?v=1.5.12';
import {injuryMarketStatus} from './injury.js?v=1.5.12';
import {hasActiveFranchise} from './tenure.js?v=1.5.12';
import {seasonSalaryRating, currentSalaryRating} from './season.js?v=1.5.12';
import {capTeam} from './career.js?v=1.5.12';
import {traitCard, removeTrait} from '../flow/events.js?v=1.5.12';
import {advance} from './draft.js?v=1.5.12';
import {finishContractYear} from '../flow/phases.js?v=1.5.12';
import {endGame} from '../ui/retire.js?v=1.5.12';
export function pitcherContractCap(){ return ({SP:7,CL:5,MR:4})[S.role]||7; }
/* 年薪（萬台幣）。頂級聯盟採漸進曲線：底薪貼近聯盟現況，明星價值才逐步拉開。 */
export function hasMlbService(){
  return !!(S&&((S.stats&&S.stats.MLB&&S.stats.MLB.yr>0)||(S.log||[]).some(r=>r.lv==='MLB')));
}
export function levelMinAnnual(lv){
  return /^R$|^A[123]$/.test(lv)&&hasMlbService()?MLB_SERVICE_MINOR_MIN:(LEVEL_MIN_ANNUAL[lv]||0);
}
export function salaryFor(lv,d){
  /* 不設硬上限，但 15 以上只計 35%：歷史級種子仍可刷新紀錄，二次曲線不會失控衝破現實頂薪數倍。 */
  const raw=Math.max(0,d||0),p=raw<=15?raw:15+(raw-15)*0.35;
  switch(lv){
    case 'CPBL2':case 'NPB2':case 'R':case 'A1':case 'A2':case 'A3':return levelMinAnnual(lv);
    case 'CPBL1':return Math.round(120+raw*65+raw*raw*3);
    /* 日職中段貼近支配下球員平均，頂端可達現實本土巨星的 5～6 億日圓級距。 */
    case 'NPB1':return Math.round(360+p*280+p*p*36);
    /* MLB 中位仍受底薪與年資制度保護；長期 MVP／歷史級球員才進入 3,000～5,000 萬美元。 */
    case 'MLB':return Math.round(2400+p*1400+p*p*600);
  } return 0;
}
export const fmtMoney=w=>{ const y=Math.floor(w/10000),m=Math.round(w%10000); return (y?y+'億':'')+(m?m.toLocaleString()+'萬':(y?'':'0萬')); };
export function calcContractAnnual(lv,d,mult){
  return Math.round(Math.max(levelMinAnnual(lv),salaryFor(lv,d)*(mult||1)));
}
/* 成績評價 d 是「相對當時層級平均」；跨層級核薪時必須換算到目標層級，不能把二軍 +10 當成一軍 +10。 */
export function ratingAtLevel(d,fromLv,toLv){
  const value=Number.isFinite(d)?d:0,from=LV[fromLv],to=LV[toLv];
  return from&&to?+(value+from.par-to.par).toFixed(2):value;
}
export function contractAnnual(){
  const floor=levelMinAnnual(S.lv);
  if(S.ct&&S.ct.annualSchedule&&S.ct.annualSchedule.length){
    const annual=Math.round(Math.max(floor,S.ct.annualSchedule[0])); S.ct.annualSchedule[0]=annual; return annual;
  }
  if(S.ct&&Number.isFinite(S.ct.annual)){
    const annual=Math.round(Math.max(floor,S.ct.annual)); S.ct.annual=annual; return annual;
  }
  const annual=calcContractAnnual(S.lv,currentSalaryRating(S.lastD||0),S.ct&&S.ct.mult||1);
  if(S.ct)S.ct.annual=annual; /* 舊狀態第一次讀取時鎖定，後續年度不再隨成績浮動 */
  return annual;
}
export function makeContract(yrs,mult,lv,d,annual,extra,kind){
  const m=mult||1,targetLv=lv||S.lv;
  const rating=(d===undefined?currentSalaryRating(S.lastD||0):d);
  const pay=Math.round(Math.max(levelMinAnnual(targetLv),Number.isFinite(annual)?annual:calcContractAnnual(targetLv,rating,m)));
  const ct=Object.assign({yrs:yrs||1,mult:m,annual:pay},extra||{});
  /* ── 生涯合約紀錄 ────────────────────────────────
     在簽約的當下就把這份合約留檔，而不是事後從年薪反推。反推會在
     「兩份金額相同又相鄰的單年約」等情況失真，而這份紀錄要拿來判斷
     一張合約盤不盤，資料本身就必須跟遊戲當下完全一致。

     market 是「同一個薪資評價在該層級的行情價」（mult=1）。
     annual / market 就是這張合約相對行情的溢價倍率：
       > 1 玩家賺到、= 1 照行情、< 1 被壓價。
     rating 一併留著，之後要換別的判準也不必重跑。
     純紀錄，不參與任何計算。 */
  if(Array.isArray(S.contracts)){
    /* id 讓每個球季能精準指回自己的合約。用「年薪相同」去配對是不可靠的：
       升上一軍時 contractAnnual() 會用層級底薪墊高實付金額，同一份合約的
       兩年就會出現不同數字；反過來兩份金額碰巧相同的單年約也會被併成一份。 */
    const id=S.contracts.length+1; ct.__ctid=id;
    S.contracts.push({
      id, y:S.year, age:S.age, org:S.org, lv:targetLv, team:S.orgTeam||'',
      yrs:ct.yrs, annual:pay, total:pay*ct.yrs, mult:m,
      rating, market:calcContractAnnual(targetLv,rating,1),
      kind:kind||'簽約', bonus:0,
    });
  }
  return ct;
}
/* 最近一筆合約紀錄（簽約金要等報價流程結算完才知道，回頭補上）。 */
export function lastContractRecord(){
  return (Array.isArray(S.contracts)&&S.contracts.length)?S.contracts[S.contracts.length-1]:null;
}
/* 日美入札讓渡金（萬台幣）。以 1 美元＝30 台幣換算 MLB 制度的 2,500／5,000 萬美元級距。 */
export function postingReleaseFee(guaranteed){
  const first=Math.min(Math.max(0,guaranteed),75000);
  const second=Math.min(Math.max(0,guaranteed-75000),75000);
  const rest=Math.max(0,guaranteed-150000);
  return Math.round(first*0.20+second*0.175+rest*0.15);
}
/* 球隊掌控期不是自由市場：中、日職逐年靠近市場價；MLB 前段年資接近底薪、後段才進入仲裁級薪資。 */
export function controlledAnnual(lv,d,healthMult){
  const market=salaryFor(lv,d), svc=clamp(S.svc||1,1,4);
  const cfg={
    CPBL1:{rates:[0,0.70,0.78,0.86,0.94]},
    NPB1:{rates:[0,0.70,0.80,0.90,0.96]},
    MLB:{rates:[0,0.08,0.12,0.35,0.60]}
  }[lv];
  if(!cfg)return calcContractAnnual(lv,d,1);
  return Math.round(Math.max(levelMinAnnual(lv),market*cfg.rates[svc]*(healthMult||1)));
}
/* 記分板專用縮寫：未滿一億顯示萬；一億以上四捨五入到小數一位。完整金額仍由 fmtMoney 顯示。 */
export const salParts=w=>w<10000
  ?{v:Math.round(w).toLocaleString(),u:'萬'}
  :{v:(Math.round(w/1000)/10).toFixed(1),u:'億'};
function champHash(text){
  let h=2166136261;
  for(let i=0;i<text.length;i++){ h^=text.charCodeAt(i); h=Math.imul(h,16777619); }
  return (h>>>0)/4294967295;
}
function champLeague(team){
  if(CPBL_TEAMS.includes(team))return {key:'CPBL',teams:CPBL_TEAMS};
  if(NPB_TEAMS.includes(team))return {key:'NPB',teams:NPB_TEAMS};
  if(MLB_TEAMS.includes(team))return {key:'MLB',teams:MLB_TEAMS};
  return {key:null,teams:[]};
}
/* 各聯盟的年度戰力級距。share 是該級所有球隊合計的 100% 奪冠率配額：
   中職 6 隊分 3 級、日職 12 隊分 4 級、大聯盟 30 隊分 5 級。
   大聯盟最強 3 隊合計 36%，確保真正的頂級強權能自然突破單隊 10%。 */
export const TEAM_CHAMP_TIERS={
  CPBL:[{count:2,share:58},{count:2,share:28},{count:2,share:14}],
  NPB:[{count:2,share:42},{count:4,share:30},{count:4,share:22},{count:2,share:6}],
  MLB:[{count:3,share:36},{count:6,share:32},{count:9,share:22},{count:8,share:8},{count:4,share:2}],
};
function champStrength(team,year){
  const foundation=(champHash('club|'+team)-0.5)*0.7;
  const form=(champHash(`${SEED}|season|${year}|${team}`)-0.5)*1.3;
  const carry=(champHash(`${SEED}|season|${year-1}|${team}`)-0.5)*0.3;
  return foundation+form+carry;
}
function tieredChampRates(key,teams,year){
  const tiers=TEAM_CHAMP_TIERS[key]||[], ranked=teams
    .map(team=>({team,strength:champStrength(team,year)}))
    .sort((a,b)=>b.strength-a.strength||a.team.localeCompare(b.team));
  const rates={}; let offset=0;
  tiers.forEach(tier=>{
    const group=ranked.slice(offset,offset+tier.count), n=group.length;
    /* 同級內仍保留排名差：首尾權重為 1.12／0.88，避免每隊完全同率。 */
    const weights=group.map((_,i)=>n<=1?1:1.12-i*(0.24/(n-1)));
    const total=weights.reduce((a,b)=>a+b,0)||1;
    group.forEach((entry,i)=>{ rates[entry.team]=tier.share*weights[i]/total; });
    offset+=tier.count;
  });
  return rates;
}
/* 每年先依球隊底蘊、當季狀態與前季延續性重新排名，再套用聯盟級距分配 100%。
   同種子同年度查詢結果固定，但球隊可以隨年度在各級之間升降。 */
export function teamChampRates(team,year){
  const league=champLeague(team), teams=league.teams, y=Number.isFinite(year)?year:(S&&S.year)||2026;
  if(!teams.length)return {};
  const rates=tieredChampRates(league.key,teams,y);
  const playerTeam=S&&S.stage==='PRO'&&LV[S.lv]&&LV[S.lv].top&&teams.includes(S.orgTeam)?S.orgTeam:null;
  if(playerTeam){
    const base=rates[playerTeam], delta=ovr()-LV[S.lv].par;
    /* 高於聯盟平均最多增加 5 個百分點；低於平均不設固定扣分下限，可一路壓到接近 0。 */
    const shift=delta>=0?Math.min(5,delta*0.5):delta*0.8;
    const target=clamp(base+shift,0.2,85), scale=(100-target)/(100-base);
    teams.forEach(t=>{ rates[t]=t===playerTeam?target:rates[t]*scale; });
  }
  return rates;
}
export function teamChampRate(team,year){
  const rate=teamChampRates(team,year)[team];
  return Number.isFinite(rate)?Number(rate.toFixed(1)):0;
}
export function marketRating(d,targetLv,sourceLv){
  const target=targetLv||S.lv,source=sourceLv||S.lastLv||S.lv;
  const cur=ratingAtLevel(currentSalaryRating(d),source,target), status=injuryMarketStatus();
  const prior=(S.log||[]).filter(r=>r.y!==S.year&&r.st&&Number.isFinite(r.st.d)).slice(-2).reverse()
    .map(r=>ratingAtLevel(seasonSalaryRating(r.st,r.lv||source,S.pos==='P'?r.role:r.p),r.lv||source,target));
  const weights=status==='rehab'?[0.20,0.50,0.30]:status==='major'?[0.35,0.40,0.25]:status==='minor'?[0.55,0.30,0.15]:[0.65,0.25,0.10];
  const vals=[cur].concat(prior); let sum=0,ws=0;
  vals.forEach((v,i)=>{sum+=v*weights[i];ws+=weights[i];});
  return +(sum/(ws||1)).toFixed(2);
}
export function contractMarketProfile(d,targetLv,sourceLv){
  const target=targetLv||S.lv,source=sourceLv||S.lastLv||S.lv;
  const status=injuryMarketStatus(), rating=marketRating(d,target,source);
  const prior=(S.log||[]).filter(r=>r.y!==S.year&&r.st&&Number.isFinite(r.st.d)).slice(-2)
    .map(r=>ratingAtLevel(seasonSalaryRating(r.st,r.lv||source,S.pos==='P'?r.role:r.p),r.lv||source,target));
  const reputation=prior.length?prior.reduce((a,b)=>a+b,0)/prior.length:rating;
  const star=reputation>=7;
  const map={
    healthy:{aav:1,bonus:1,drop:0,maxYears:99,label:''},
    minor:{aav:0.93,bonus:0.80,drop:0,maxYears:99,label:'小傷使市場略為觀望'},
    major:{aav:star?0.82:0.70,bonus:star?0.50:0.35,drop:star?1:2,maxYears:3,label:star?'重大傷勢：履歷保住部分身價，但只能先證明健康':'重大傷勢：報價、年限與簽約金大幅縮水'},
    rehab:{aav:star?0.72:0.55,bonus:star?0.35:0.20,drop:star?2:3,maxYears:2,label:star?'整季復健：球團只願承擔證明約風險':'整季復健：市場接近凍結'}
  }[status];
  return {...map,status,rating,reputation,star,proveIt:(status==='major'||status==='rehab')};
}
export function faYears(d,cap,profile){ /* FA 年限:近三年成績穩定+傷病少→年限長;上限 cap(野手15/投手7) */
  const mp=profile||contractMarketProfile(d), value=mp.rating;
  const perf=Math.max(0,Math.min(1,(value+2)/8)); /* d=-2→0, d=6→1 */
  const injPenalty=(S.bigInj||0)*0.12+(S.tjCount||0)*0.15;
  let yrs=Math.round(2+perf*(cap-2)-injPenalty*cap);
  /* 年齡上限:球團不會賭老將的長約(考慮引退年齡與衰退) */
  let ageCap=cap;
  if(S.age>=36)ageCap=2; else if(S.age>=34)ageCap=3; else if(S.age>=32)ageCap=5; else if(S.age>=30)ageCap=8;
  yrs=Math.min(yrs,ageCap,mp.maxYears);
  return Math.max(1,Math.min(cap,yrs));
}
export function demotionAudit(cont){
  if(!S.demotionRefused){ cont(); return; }
  S.demotionRefused=false;
  /* 打回身價:d >= 該合約薪資係數應有的水準(mult 越高要求越高) */
  const need=Math.round((S.ct&&S.ct.mult?S.ct.mult:1)*2)-1; /* mult1→1, mult1.2→1.4→1, mult2→3 */
  if((S.lastD||0)>=need){
    if(S.traits.cancer){ removeTrait('cancer','更衣室毒瘤');
      card('good','用成績說話','你用一整季的表現堵住了所有人的嘴——<b class="hl">更衣室毒瘤洗刷</b>。當初拒絕下放的決定，被證明是對的。'); board(1); }
    else card('good','守住身價','你證明了自己還配得上這份合約。');
  } else {
    if(!S.traits.thief){ S.traits.thief=true;
      card('bad','隱藏屬性解鎖：薪水小倫','拒絕下放後，你的成績依然沒有起色。球迷開始在社群叫你「薪水小倫」——<b class="dn">事件卡失敗率永久 +10%</b>，這個名聲跟著你到退休。'); board(1); }
    else card('bad','薪水小倫','又是虛擲的一年。看台上的噓聲更大了。');
  }
  cont();
}
export function offseasonTradeCheck(cont){
  if(S.stage!=='PRO'||!LV[S.lv].top||S.seasonFactor<=0){ cont(); return; }
  const star = ovr()>=LV[S.lv].par+4; /* 明星:綜合≥聯盟平均+4 */
  let p=15+ (S.tradeHeat||0); /* 基礎 15% + 累積怨氣 */
  if(S.traits.cancer)p+=25; if(S.traits.ambience)p+=20;
  if(!chance(p)){ cont(); return; }
  /* 現役神主牌／◯◯先生是城市象徵；神主牌轉隊後只保留身分，不再提供交易保護。 */
  if(hasActiveFranchise(S)||S.traits.mrteam){
    card('info','非賣品',`他隊捧著誘人的包裹來詢價，高層連會議都沒開就回絕了——<b class="hl">「他是這座城市的象徵，非賣品。」</b>`);
    board(1); cont(); return;
  }
  if(star){
    /* 明星:否決權詢問(同舊設定) */
    if(S.traits.cancer){ doTradeExec(); card('bad','毒瘤交易','球團受夠了休息室的氣氛，直接把你打包送走。'); board(1); cont(); return; }
    choose('球季結束：他隊送來交易報價，球團徵詢你的否決權',[
      {t:'點頭同意，換個環境',main:true,f:()=>{ doTradeExec(); card('info','轉隊','你打包行李，前往新的城市。'); board(1); cont(); }},
      {t:'行使否決權，我要留下',warn:true,s:'未來 2 年冠軍機率略降、下張合約薪水 −15%',f:()=>{
        S.tradeRefuse=2; card('info','否決交易',`你按下否決鍵。忠誠是一種選擇——球團的重建計畫被你打亂了，短期戰力和你的下張合約都會付出一點代價，但這件球衣，你留下來了。`); board(1); cont(); }}]);
    return;
  }
  /* 非明星:季末交易傳言,可抱怨或沉默 */
  choose('季末交易傳言：媒體報導你可能在休賽季被交易',[
    {t:'公開抱怨表達不滿',warn:true,s:'增加本次被交易的可能性',f:()=>{
      S.complainCount=(S.complainCount||0)+1;
      if(S.complainCount>=2&&!S.traits.ambience){ S.traits.ambience=true;
        card('bad','隱藏屬性解鎖：氣氛大師','你又一次對媒體大吐苦水。球團高層看在眼裡——這種選手，留著也是不定時炸彈。<b class="dn">往後轉隊機率永久提高</b>。'); board(1); }
      if(chance(60)){ doTradeExec(); card('bad','弄假成真',`你的抱怨上了頭條，球團順勢把你送走。新東家，好好打吧。`); board(1); }
      else card('info','雷聲大雨點小','抱怨歸抱怨，這次交易最後沒有成局。你還在原隊，但氣氛有點僵。');
      cont(); }},
    {t:'保持沉默，專心打球',main:true,s:'交易機率不變',f:()=>{
      if(chance(35)){ doTradeExec(); card('info','交易成局','儘管你不動聲色，球團還是完成了這筆交易。'); board(1); }
      else card('info','留了下來','傳言就是傳言。下個球季，你還是穿著同一件球衣。');
      cont(); }}]);
}
export function doTradeExec(){
  /* 季末交易只更換下季球隊，當季成績仍完整歸屬原隊。 */
  S.teamSeasons=0; S.teamYears=0; S.teamStarYears=0; S.franchiseActive=false; S.champThisTeam=false; S.champTeam=null;
  const list=S.org==='CPBL'?CPBL_TEAMS:S.org==='NPB'?NPB_TEAMS:MLB_TEAMS;
  const nt=pick(list.filter(t=>t!==S.orgTeam)); S.orgTeam=nt; rememberLeagueTeam(S.org,nt); tlNote(2,'轉隊 '+nt); board(1);
}
export function buyoutRemaining(rate,includeCurrent){ /* 合約剩餘年數給付:季前需包含尚未支付的當年度；季末則扣除已入帳年度。 */
  rate=rate||0.7;
  const paidYears=includeCurrent?0:1;
  if(!S.ct||!(S.ct.yrs>paidYears)||(!LV[S.lv].top&&rate<1))return 0; /* 球團主動終止不受二軍守衛限制 */
  const remain=S.ct.yrs-paidYears;
  if(remain<=0)return 0;
  const schedule=S.ct.annualSchedule&&S.ct.annualSchedule.length?S.ct.annualSchedule.slice(paidYears,paidYears+remain):null;
  const yearly=contractAnnual();
  const full=schedule&&schedule.length===remain?schedule.reduce((a,b)=>a+b,0):yearly*remain; /* 依剩餘各年固定薪資計算 */
  const total=Math.round(full*rate);
  if(total>0){ S.salary+=total;
    if(rate>=1) card('gold','合約全額給付',`合約還有 <b class="hl">${remain} 年</b>，但這次不是你要走——球團主動終止合約，依約剩餘薪資<b class="hl">十成全額</b>給付，<b class="hl">${fmtMoney(total)}</b> 一次入帳。白紙黑字的長約，在此刻護住了你。`);
    else card('gold','合約買斷',`你仍在合約中，球團依約買斷剩餘 <b class="hl">${remain} 年</b>合約——雙方談定以 <b class="hl">七成</b> 價碼結清，<b class="hl">${fmtMoney(total)}</b> 一次入帳。合約精神，該給的一毛不少。`); }
  S.ct=makeContract(1,S.ct.mult,S.lv,S.lastD||0,yearly,null,'買斷結清'); /* 給付後合約結清 */
  return total;
}
/* 引退時若沒回中職,補一場大巨蛋開球告別 */
export function daibaFarewell(cont){
  if(S.stage==='PRO'&&S.org!=='CPBL'&&!S._daiba){ S._daiba=true;
    card('gold','最後一球',`雖然沒能回到家鄉獻技，你還是接受了邀請，回到 <b class="hl">臺北大巨蛋</b> 當一日中職球員。開球儀式上，四萬人的注視下，你投出了生涯的最後一球——不為勝負，只為那個曾經在紅土上作夢的自己。`);
  }
  cont();
}
export function handleDemotion(o,path,idx){
  if((S.lv==='CPBL1'||S.lv==='NPB1'||S.lv==='MLB')&&(S.lastD||0)<=-6&&!S.traits.yips&&S.seasonFactor>=0.5){
    traitCard('yips','失憶症',`生理上明明沒受傷，但站上場的瞬間，腦海全是上個賽季被痛宰的畫面——<b class="dn">系統評價暫時 −3，直到再次升級或奪得年度獎項才能解除</b>。`,'bad'); }
  const doDemote=()=>{
    /* 找同組織中符合的層級 */
    let t=-1; for(let i=idx-1;i>=0;i--){ if(o>=LV[path[i]].min){t=i;break;} }
    if(t>=0){
      /* 旅外體系下放時,亞洲球團同步遞約 */
      /* 跨聯盟的去處一律走母隊優先（returnTeam）：待過的聯盟 90% 是老東家把你接回去。 */
      const alts=[];
      if(S.org==='MiLB'){
        if(o>=LV.NPB1.min&&chance(Math.round(60*ageGateJP())))alts.push({t:'跳槽日職一軍',s:'旅日合約',f:()=>{buyoutRemaining();signTo('NPB','NPB1',returnTeam('NPB').team);advance();}});
        else if(o>=LV.NPB2.min&&chance(50))alts.push({t:'轉戰日職二軍（支配下）',f:()=>{buyoutRemaining();signTo('NPB','NPB2',returnTeam('NPB').team);advance();}});
        if(o>=LV.CPBL1.min)alts.push({t:'返台加盟中職一軍',s:'落葉歸根',f:()=>{buyoutRemaining();signTo('CPBL','CPBL1',returnTeam('CPBL').team);advance();}});
      }else if(S.org==='NPB'&&o>=LV.CPBL1.min&&chance(70)){
        alts.push({t:'返台加盟中職一軍',f:()=>{buyoutRemaining();signTo('CPBL','CPBL1',returnTeam('CPBL').team);advance();}});
      }
      if(alts.length){
        card('bad','降級通知',`成績未達標，球團打算將你下放 <b class="dn">${LV[path[t]].n}</b>——但消息一出，其他聯盟的邀請也到了。`);
        choose('接受下放，還是換個舞台？',[
          {t:'接受下放 '+LV[path[t]].n,main:true,f:()=>{S.lv=path[t];board(2);finishContractYear(o);}},...alts]);
      }else{ S.lv=path[t]; card('bad','降級通知',`成績未達標，被下放至 <b class="dn">${LV[path[t]].n}</b>。`); board(2); finishContractYear(o); }
    }
    else outOfOrg(o);
  };
  const longContract = S.ct && S.ct.yrs>1 && LV[S.lv].top;
  if(longContract){
    choose('球團約談：成績未達當前層級要求，打算將你下放',[
      {t:'接受下放，繼續奮鬥',main:true,f:doDemote},
      {t:'行使長約條款，拒絕下放',warn:true,s:'觸發更衣室毒瘤；隔年成績打回身價才能洗刷，否則更慘',f:()=>{
        S.demotionRefused=true;
        if(!S.traits.cancer&&!S.traits.franchise&&!S.traits.intlace){ S.traits.cancer=true;
          card('bad','隱藏屬性解鎖：更衣室毒瘤','你搬出合約條款拒絕下放。教練搖頭，隊友私下議論——你保住了位置，卻失去了更衣室。'); }
        else card('info','拒絕下放','你搬出合約條款留在一軍。球團記住了這件事。');
        board(1); finishContractYear(o); }},
      {t:'就此引退',warn:true,s:'以現役身分光榮退場',f:()=>{buyoutRemaining();daibaFarewell(()=>endGame('不願下放，'+S.year+' 年宣布引退。'));}}]);
  } else if(S.age>=33){
    choose('球團約談：成績未達當前層級的最低要求',[
      {t:'接受下放，繼續奮鬥',f:doDemote},
      {t:'選擇引退',warn:true,s:'以現役身分光榮退場',f:()=>{buyoutRemaining();daibaFarewell(()=>endGame('不願下放低階聯盟，'+S.year+' 年宣布引退。'));}}]);
  } else doDemote();
}
export function outOfOrg(o){
  /* 遭原聯盟釋出，尋找重疊層級合約 */
  const offers=[];
  if(S.org!=='NPB'&&o>=44)offers.push({t:'日職二軍（支配下）合約',f:()=>{buyoutRemaining(1);signTo('NPB','NPB2',returnTeam('NPB').team);}});
  if(S.org!=='CPBL'){ if(o>=41)offers.push({t:'中職一軍合約',f:()=>{buyoutRemaining(1);signTo('CPBL','CPBL1',returnTeam('CPBL').team);}});
    else if(o>=30)offers.push({t:'中職二軍合約',f:()=>{buyoutRemaining(1);signTo('CPBL','CPBL2',returnTeam('CPBL').team);}}); }
  if(!offers.length){ buyoutRemaining(1); daibaFarewell(()=>endGame('遭球團釋出且無人問津，'+S.year+' 年黯然引退。')); return; }
  card('bad','戰力外通告',`未達 ${S.org==='NPB'?'日職':'原聯盟'}留用門檻，遭到釋出。所幸還有球隊捎來邀請——`);
  if(S.age>=33){ offers.push({t:'就此引退',warn:true,f:()=>{buyoutRemaining(1);daibaFarewell(()=>endGame('收到戰力外通告後，'+S.year+' 年選擇引退。'));}}); }
  choose('新東家的邀請',offers.map(x=>({...x,f:()=>{x.f();advance();}})));
}
export function teamListOf(org){ return org==='CPBL'?CPBL_TEAMS:org==='NPB'?NPB_TEAMS:MLB_TEAMS; }
function leagueKeyOf(org){ return org==='CPBL'?'CPBL':org==='NPB'?'NPB':org==='MiLB'||org==='MLB'?'MLB':null; }
function rememberLeagueTeam(org,team){
  const key=leagueKeyOf(org); if(!key||!team||!teamListOf(org).includes(team))return;
  const last=S.lastLeagueTeam||(S.lastLeagueTeam={CPBL:null,NPB:null,MLB:null});
  last[key]=team;
  if(key==='CPBL')S.lastCpblTeam=team; /* 保留舊欄位，讓既有流程與舊資料仍能相容。 */
}
export function signTo(org,lv,team,yrs,mult,annual,quiet){
  const sourceLv=S.lastLv||S.lv,contractD=ratingAtLevel(currentSalaryRating(S.lastD||0),sourceLv,lv);
  /* 跨國前先記住離開當下的最後一隊；同聯盟轉隊則會在簽約後改記新東家。 */
  rememberLeagueTeam(S.org,S.orgTeam);
  S.org=org; S.lv=lv;
  /* 【修正】先決定新球隊是誰，比對不一樣才把年資歸零，最後再蓋掉 S.orgTeam */
  const newTeam = team || pick(teamListOf(org));
  if(newTeam !== S.orgTeam){ S.teamSeasons=0; S.teamYears=0; S.teamStarYears=0; S.franchiseActive=false; S.champThisTeam=false; S.champTeam=null; tlNote(2,'加盟 '+newTeam); }
  S.orgTeam = newTeam;
  rememberLeagueTeam(org,newTeam);
  S.ct=makeContract(yrs||2,mult||1,lv,contractD,annual,null,'簽約');
  if(org!=='NPB')S.npbYears=0;
  /* quiet：呼叫端自己會寫一張更完整的卡（旅外回歸），這裡就不要再印一張制式簽約卡。 */
  if(!quiet)card('info','簽約',`與 <b class="hl">${S.teamName()}</b> 簽下固定年薪 <b class="hl">${fmtMoney(S.ct.annual)}</b> × <b class="hl">${S.ct.yrs} 年</b>，合約薪資總額 <b class="hl">${fmtMoney(S.ct.annual*S.ct.yrs)}</b>。`);
  board(2);
}
/* ---------- 旅外回歸：母隊優先 ---------- */
/* 「母隊」＝離開該聯盟、前往更高階海外聯盟前效力的最後一隊，不是第一隊或待最久的隊。
   回得去不代表回得成——合約金額與角色定位談不攏
   在現實裡本來就常見，所以只有 90% 談成，另外 10% 會輾轉加盟同聯盟的其他球隊。
   沒有母隊（第一次到那個聯盟）就不套這條規則，照舊隨機找東家。 */
function lastLoggedTeam(org){
  const wanted=org==='CPBL'?'CPBL':org==='NPB'?'NPB':'MiLB', teams=teamListOf(org), rows=S.log||[];
  for(let i=rows.length-1;i>=0;i--){
    const row=rows[i]||{}, info=LV[row.lv];
    if(!info||info.org!==wanted)continue;
    const name=String(row.tm||''), team=teams.find(t=>name.startsWith(t));
    if(team)return team;
  }
  return null;
}
export function homeTeamOf(org){
  const key=leagueKeyOf(org), remembered=S.lastLeagueTeam&&S.lastLeagueTeam[key];
  /* lastLoggedTeam 讓更新前已在旅外途中的資料，也能由逐年紀錄找回真正的最後一隊。 */
  const t=remembered||lastLoggedTeam(org)||(org==='CPBL'?S.lastCpblTeam:null)||capTeam(key);
  return (t&&teamListOf(org).includes(t))?t:null;
}
export function returnTeam(org){
  const home=homeTeamOf(org);
  if(home&&chance(90))return {team:home,home,back:true};
  const others=teamListOf(org).filter(t=>t!==home);
  return {team:pick(others.length?others:teamListOf(org)),home,back:false};
}
const LEAGUE_OF={CPBL:'中職',NPB:'日職',MiLB:'大聯盟'};
/* 從 from 聯盟回到 org 聯盟並簽約。intro 是「為什麼回來」，簽完再依有沒有回到母隊寫結果。 */
export function returnHomeSign(from,org,lv,intro,o){
  const dest=(o&&o.dest)||returnTeam(org), lg=LEAGUE_OF[org]||'', fromN=LEAGUE_OF[from]||'海外';
  if(intro)card('info','長考',intro);
  signTo(org,lv,dest.team,o&&o.yrs,o&&o.mult,o&&o.annual,true);
  const ct=S.ct, detail=`固定年薪 <b class="hl">${fmtMoney(ct.annual)}</b> × <b class="hl">${ct.yrs} 年</b>（合約總額 <b class="hl">${fmtMoney(ct.annual*ct.yrs)}</b>）`;
  const heroN=S.pos==='P'?'王牌':'第四棒';
  if(dest.back){
    card('gold','回歸母隊',`從 <b class="hl">${fromN}</b> 回歸，你決定重返母隊 <b class="hl">${dest.team}</b>，而 ${dest.team} 也敞開雙臂歡迎你。球迷們無不引頸期盼你的回歸——無論你在海外的成就如何，在他們眼中，你都還是那個離開前的${heroN}。${dest.team} 以${detail}簽下你，讓你繼續在這片熟悉的紅土上，寫完屬於 ${dest.team} 的傳奇。`);
  }else if(dest.home){
    card('info','輾轉加盟',`從 <b class="hl">${fromN}</b> 旅外回歸，原本你要重返在${lg}的母隊 <b class="dn">${dest.home}</b>，但在談判過程中，雙方在合約金額以及角色定位上始終有所歧異，最後你沒有辦法重返母隊。輾轉之間，<b class="hl">${dest.team}</b> 遞出了報價——你以${detail}加入 ${dest.team}，在另一座球場重新開始。`);
  }else{
    card('info','新東家',`<b class="hl">${dest.team}</b> 以${detail}簽下你，你將在${LV[lv].n}展開全新的一章。`);
  }
}
/* 多隊報價選擇:opts=[{team,bonus,yrs,mult,lv}] */
export function pickOfferUI(title,org,offers,after){
  choose(title,offers.map(of=>{ const lv=of.lv||S.lv, offerD=ratingAtLevel(currentSalaryRating(S.lastD||0),S.lastLv||S.lv,lv), annual=calcContractAnnual(lv,offerD,of.mult||1);
    return {
      t:of.team+(of.lv?`（${LV[of.lv].n}）`:''),
      s:`簽約金 ${fmtMoney(of.bonus)}｜固定年薪 ${fmtMoney(annual)} × ${of.yrs} 年｜合約薪資總額 ${fmtMoney(annual*of.yrs)}`,
      f:()=>{ S.salary+=of.bonus;
        signTo(org,lv,of.team,of.yrs,of.mult||1,annual);
        const rec=lastContractRecord(); if(rec)rec.bonus=of.bonus;
        card('gold','簽約金',`入袋 <b class="hl">${fmtMoney(of.bonus)}</b>。`); after(); }
    };
  }));
}
export function makeOffers(org,n,bonusBase,yrsLo,yrsHi,lv,exclude){
  const list=teamListOf(org).filter(t=>t!==exclude);
  const teams=[]; const pool=list.slice();
  for(let i=0;i<n&&pool.length;i++)teams.push(pool.splice(Math.floor(R()*pool.length),1)[0]);
  return teams.map(t=>({team:t,bonus:Math.round(bonusBase*(0.8+R()*0.5)),yrs:ri(yrsLo,yrsHi),lv,mult:1}));
}
/* ---------- 長約/短約 選擇器 ---------- */
export function termParams(d,lv,profile,franchisePremium){ /* 長約 >2 年、短約 1-2 年；大傷／復健年只提供證明約 */
  const mp=profile||contractMarketProfile(d);
  const cap=S.pos==='P'?pitcherContractCap():15;
  const maxY=faYears(mp.rating,cap,mp);    /* 已含年齡與健康上限 */
  const longEligible = !mp.proveIt && maxY>2 && mp.rating>=0;
  const longY=Math.max(3,maxY);           /* 長約至少 3 年 */
  const shortY=mp.proveIt?1:Math.min(2,Math.max(1,maxY));
  let baseM=mp.aav;                       /* 表現已反映於 salaryFor，不再重複加價 */
  if(franchisePremium!==false&&hasActiveFranchise(S))baseM*=1.04; /* 只套用母隊合約；轉隊報價不帶走 */
  if(S.tradeRefuse>0)baseM*=0.85;
  return {longEligible,longY,shortY,longM:+(baseM*0.95).toFixed(2),shortM:+(baseM*1.05).toFixed(2),profile:mp};
}
export function termEstimate(lv,d,offerMult,profile,franchisePremium){
  const source=S.lastLv||S.lv;
  const mp=(lv===S.lv&&profile)?profile:contractMarketProfile(d,lv,source),tp=termParams(d,lv,mp,franchisePremium),bm=offerMult||1;
  const line=(y,m)=>{ const annual=calcContractAnnual(lv,mp.rating,+(m*bm).toFixed(2)); return `${fmtMoney(annual)}×${y}年＝${fmtMoney(annual*y)}`; };
  return tp.longEligible?`長約 ${line(tp.longY,tp.longM)}／短約 ${line(tp.shortY,tp.shortM)}`:`${mp.proveIt?'證明約':'短約'} ${line(tp.shortY,tp.shortM)}`;
}
export function protectExtensionOffer(y,annual,minGuaranteedTotal,guaranteedYears){
  const years=Math.max(1,Math.round(y||1)), rawAnnual=Math.max(0,Math.round(annual||0));
  const oldTotal=Math.max(0,Math.round(minGuaranteedTotal||0)), oldYears=Math.max(0,Math.round(guaranteedYears||0));
  /* 舊約保障完整保留；延長出去的每一年，至少再加上新估值的一年薪資。 */
  const floorTotal=oldTotal+rawAnnual*Math.max(0,years-oldYears);
  const protectedAnnual=Math.max(rawAnnual,Math.ceil(floorTotal/years));
  return {annual:protectedAnnual,total:protectedAnnual*years};
}
export function remainingContractGuarantee(){
  if(!S.ct)return 0;
  const yrs=Math.max(0,Math.round(S.ct.yrs||0)); if(!yrs)return 0;
  const floor=levelMinAnnual(S.lv), schedule=S.ct.annualSchedule;
  if(schedule&&schedule.length>=yrs)return schedule.slice(0,yrs).reduce((sum,v)=>sum+Math.max(floor,Math.round(v||0)),0);
  return contractAnnual()*yrs;
}
export function termChoice(o,d,baseTitle,onPick,onReject,rejectLabel,rejectDesc,offerMult,franchisePremium,extensionProtection){
  const mp=contractMarketProfile(d), tp=termParams(d,S.lv,mp,franchisePremium);
  const now=contractAnnual(), baseMult=offerMult||1;
  const offer=(y,m)=>{ const actualMult=+(m*baseMult).toFixed(2), rawAnnual=calcContractAnnual(S.lv,mp.rating,actualMult);
    const protectedPay=protectExtensionOffer(y,rawAnnual,extensionProtection&&extensionProtection.total,extensionProtection&&extensionProtection.years);
    return {y,m:actualMult,annual:protectedPay.annual,total:protectedPay.total}; };
  const describe=x=>`固定年薪 <b>${fmtMoney(x.annual)}</b> × ${x.y} 年｜合約總額 <b>${fmtMoney(x.total)}</b>`;
  const opts=[];
  if(tp.longEligible){ /* 夠格才給長約選項 */
    const long=offer(tp.longY,tp.longM), short=offer(tp.shortY,tp.shortM);
    opts.push({t:`長約｜${fmtMoney(long.annual)} × ${long.y} 年`,main:true,s:`${describe(long)}｜年薪略低；受傷、衰退與下放仍享固定保障`,
      f:()=>onPick(long.y,long.m,long.annual,long.total)});
    opts.push({t:`短約｜${fmtMoney(short.annual)} × ${short.y} 年`,warn:true,s:`${describe(short)}｜年薪較高，賭下次身價`,
      f:()=>onPick(short.y,short.m,short.annual,short.total)});
  } else { /* 年齡大或成績不佳:只能短約(不出現長約) */
    const short=offer(tp.shortY,tp.shortM);
    opts.push({t:`${mp.proveIt?'證明約':'短約'}｜${fmtMoney(short.annual)} × ${short.y} 年`,main:true,s:`${describe(short)}｜${mp.proveIt?'傷勢讓市場只願先確認你能健康回歸':'以你目前的年齡與成績，球團只願提供短約'}`,
      f:()=>onPick(short.y,short.m,short.annual,short.total)});
  }
  if(onReject)opts.push({t:rejectLabel||'拒絕，維持現狀',s:rejectDesc||'不接受這份合約',f:onReject});
  const health=mp.label?`｜<span class="dn">${mp.label}</span>`:'';
  const guarantee=extensionProtection&&extensionProtection.total?`｜原約剩餘保障：<b class="hl">${fmtMoney(extensionProtection.total)}</b>`:'';
  /* 大標到「目前年薪」之前為止（摺疊列只取 .ev-h），年薪／保障／市場備註走小標。
     原本兩段在同一個字串裡，textContent 會把它們黏成一長串印在摺疊列上。 */
  choose(`<span class="ev-h">${baseTitle}</span>`+
    `<small>目前年薪：<b class="hl">${fmtMoney(now)}</b>${guarantee}｜市場依最近三季加權估值${health}</small>`,opts);
}
/* 母隊延長續約:提前綁約 */
export function extensionOffer(o){
  const d=S.lastD||0;
  const remainingYears=Math.max(0,S.ct&&S.ct.yrs||0), mp=contractMarketProfile(d), tp=termParams(d,S.lv,mp);
  const maxOfferedYears=Math.max(tp.longEligible?tp.longY:0,tp.shortY);
  /* 新約若沒有增加任何保障年限，就只是拿新估值覆蓋舊約，不應包裝成提前延長。 */
  if(maxOfferedYears<=remainingYears){ crossOffers(o); return; }
  const remainingGuarantee=remainingContractGuarantee();
  termChoice(o,d,`母隊提前延長續約 · ${S.teamName()}（原合約剩 1 年）`,(y,m,annual,total)=>{
    const effectiveYear=S.year+1, team=S.teamName();
    /* 提前續約直接覆蓋剩餘舊約；下一球季起領新約，不額外多綁舊約年數。 */
    S.ct=makeContract(y,m,S.lv,d,annual,{extOffered:true},'延長合約');
    card('gold','延長續約',`為了提前留下你，<b class="hl">${team}</b>決定提前續約，開了一筆固定年薪 <b class="hl">${fmtMoney(annual)}</b> × <b class="hl">${y} 年</b>的新約（合約總額 <b class="hl">${fmtMoney(total)}</b>），並且從 <b class="hl">${effectiveYear} 年</b>生效！`); board(1);
    crossOffers(o);
  }, ()=>{ /* 拒絕延長:維持原合約繼續跑 */
    card('info','婉拒延長',`你婉拒了母隊的提前延長，選擇打完現有合約再說。`);
    crossOffers(o);
  },undefined,undefined,undefined,undefined,{total:remainingGuarantee,years:remainingYears});
}
/* ---------- FA 自由球員 ---------- */
export function faFlow(o){
  const d=S.lastD||0;
  if(S.traits.cancer){ /* 毒瘤:續約惡化 */
    if(!S.traits.franchise&&chance(45)){
      card('bad','球團冷處理',`<b class="dn">${S.orgTeam}</b>明確表示無意續約——你的新聞比你的成績更出名。其他球隊則開始評估能否用較低代價帶走你。`);
      faMarket(o,d,{cold:true,oldTeam:S.orgTeam});
      return; } }
  const faOpts=[
    {t:`與 ${S.teamName()} 續約`,main:true,s:'接著選擇長約或短約',
     f:()=>termChoice(o,d,`與 ${S.teamName()} 續約 · 選擇合約類型`,(y,m,annual,total)=>{
       S.ct=makeContract(y,m,S.lv,d,annual,{extOffered:false},'延長合約');
       card('info','續約',`與 <b class="hl">${S.teamName()}</b> 完成續約：固定年薪 <b class="hl">${fmtMoney(annual)}</b> × <b class="hl">${y} 年</b>，合約總額 <b class="hl">${fmtMoney(total)}</b>。`); advance(); })},
    {t:'跳出合約，測試自由市場',warn:true,s:'成績不佳可能乏人問津，只能回原隊減薪',f:()=>faMarket(o,d)}];
  /* 5a 大聯盟合約走完:能力還撐得住日職一軍的話,亞洲最高殿堂也是一條路。
     faFlow 只在 LV[S.lv].top 時才會跑,所以 S.org==='MiLB' 這裡必定是大聯盟。 */
  if(S.org==='MiLB'&&o>=LV.NPB1.min){
    faOpts.push({t:'轉戰日職一軍',s:'把天賦帶回亞洲職棒的最高殿堂',
      f:()=>{ returnHomeSign('MiLB','NPB','NPB1',
        `雖然大聯盟的合約書就攤在桌上，但在幾個輾轉難眠的夜裡，你還是把筆放了下來。橫越太平洋的十幾個小時、一年有兩百天在陌生的旅館醒來——你想的已經不是可以在大聯盟達成甚麼成就，而是離家近一點。長考之後，你決定把天賦帶回亞洲職棒的最高殿堂：<b class="hl">日本職棒</b>。`);
        advance(); }});
  }
  /* 5b 旅外球員合約到期:多一個返台加盟中職的選項(落葉歸根) */
  if(S.org!=='CPBL'&&o>=LV.CPBL1.min){
    faOpts.push({t:'返台加盟中職一軍',s:'落葉歸根，回到熟悉的主場',
      f:()=>{ returnHomeSign(S.org,'CPBL','CPBL1',
        `結束海外的挑戰，你把行李箱從衣櫃頂端搬了下來。護照上那些出入境章記錄了你走過的地方，但這一次，飛機降落的是熟悉的桃園機場。你決定回到家鄉球迷面前，把剩下的棒球打完。`);
        advance(); }});
  }
  choose(`合約到期 · 取得自由球員（FA）資格（球隊奪冠率 ${teamChampRate(S.orgTeam)}%）`,faOpts);
}
export function marketRetirementText(){
  const love=S.love||{},kidCount=Math.max(0,love.kids||0);
  const hasFamily=love.st==='married'&&love.partner&&kidCount>0;
  const family=hasFamily?`你想了想${love.partner}與${kidCount===1?'孩子':'孩子們'}，不想錯過孩子的成長。`:'';
  return `回想從小到大的棒球生涯，在紅土上拚搏，身體早已累積大大小小的傷。回過身來看看自己的家人，有多久沒有跟他們好好吃頓飯了？${family}是該多花一點時間，陪伴自己的家人了。你將沒簽字的合約書推回，決定脫下球衣、高掛球鞋，走向下一段精彩的人生。`;
}
export function retireFromMarket(){ daibaFarewell(()=>endGame(marketRetirementText())); }
export function homecomingAfterRejectedOffer(o){
  const homeLv=o>=LV.CPBL1.min?'CPBL1':'CPBL2';
  /* 先擲好去哪一隊,按鈕才寫得出隊名——90% 回母隊,10% 談不攏改投他隊(見 returnTeam)。 */
  const dest=returnTeam('CPBL');
  const annual=calcContractAnnual(homeLv,marketRating(S.lastD||0,homeLv),1);
  const from=S.org;
  choose(`落葉歸根 · 球團評估從${LV[homeLv].n}出發`,[
    {t:`返台加盟 ${dest.team}（${LV[homeLv].n}）`,main:true,
      s:`綜合 ${o}｜一軍門檻 ${LV.CPBL1.min}｜固定年薪 ${fmtMoney(annual)} × 1 年`,f:()=>{
        returnHomeSign(from,'CPBL',homeLv,
          `你婉拒了海外的合約，把球具收一收，決定回到出發的地方，從 <b class="hl">${LV[homeLv].n}</b>重新開始。`,
          {dest,yrs:1,mult:1,annual});
        advance(); }},
    {t:'就此引退',warn:true,s:'不再簽下新合約，結束球員生涯',f:retireFromMarket}
  ]);
}
export function faMarket(o,d,settings){
  const org=S.org, lv=S.lv, offers=[];
  const cold=!!(settings&&settings.cold),oldTeam=(settings&&settings.oldTeam)||S.orgTeam;
  const mp=contractMarketProfile(d), value=mp.rating;
  const cap=S.pos==='P'?pitcherContractCap():15;
  if(cold){
    const team=pick(teamListOf(org).filter(t=>t!==oldTeam)),mult=+(0.90*mp.aav).toFixed(2);
    const annual=calcContractAnnual(lv,mp.rating,mult);
    offers.push({team,org,lv,yrs:1,mult,annual,bonus:0,cold:true});
  }else{
    let n=value>=3?ri(2,4):value>=1?ri(1,3):value>=-1?(chance(60)?ri(1,2):0):(chance(30)?1:0);
    if(mp.drop){ n=Math.max(0,n-mp.drop); if(!mp.star&&mp.proveIt&&chance(mp.status==='rehab'?60:40))n=0; }
    if(S.traits.cancer)n=Math.max(0,n-1); /* 毒瘤:報價變少 */
    makeOffers(org,n,({CPBL1:200,NPB1:800,MLB:2000})[lv]||100,1,cap,lv,S.orgTeam)
      .forEach(of=>{of.yrs=faYears(value,cap,mp); of.mult=+(0.97+R()*0.08).toFixed(2); of.bonus=Math.round(of.bonus*mp.bonus); offers.push({...of,org});});
  }
  const crossHealthy=mp.status==='healthy'||mp.status==='minor'||(mp.star&&chance(mp.status==='major'?35:20));
  if(crossHealthy&&lv==='CPBL1'&&o>=53)makeOffers('NPB',cold?ri(1,2):1,1000,2,3,o>=51?'NPB1':'NPB2',null)
    .forEach(of=>{of.bonus=Math.round(of.bonus*mp.bonus);offers.push({...of,org:'NPB',mult:+(0.97+R()*0.08).toFixed(2)});});
  if(crossHealthy&&lv==='NPB1'&&o>=60){
    /* 滿 7 年 → 海外 FA(免入札,直接跳美);未滿則走入札(有年齡把關) */
    const freeAgent=(S.npbYears||0)>=7;
    if(freeAgent || chance(Math.round(50*ageGateUSA(o,60)))){
      makeOffers('MiLB', freeAgent?ri(1,2):1, 3000, 3,5,'MLB',null)
        .forEach(of=>{ const posting=!freeAgent; of.bonus=posting?0:Math.round(of.bonus*mp.bonus);
          offers.push({...of,org:'MiLB',mult:+(0.97+R()*0.08).toFixed(2),posting}); });
    }
  }
  if(!offers.length){
    card('bad','自由市場',`電話一直沒有響。經紀人聳聳肩——市場對你的評價比想像中冷。${mp.label?`<br><span class="dn">${mp.label}</span>`:''}`);
    const fallbackAnnual=calcContractAnnual(S.lv,mp.rating,+(0.70*mp.aav).toFixed(2));
    choose('沒有球隊開價',[
      {t:`回 ${S.teamName()} 減薪簽約`,main:true,s:`固定年薪 ${fmtMoney(fallbackAnnual)} × 1 年｜合約總額 ${fmtMoney(fallbackAnnual)}`,
       f:()=>{ S.ct=makeContract(1,0.7,S.lv,mp.rating,fallbackAnnual,null,'減薪合約'); card('bad','減薪合約',`低著頭回到 <b class="hl">${S.teamName()}</b>，簽下固定年薪 <b class="hl">${fmtMoney(S.ct.annual)}</b>的一年約。`); advance(); }},
      {t:'就此引退',warn:true,f:()=>endGame('FA 市場乏人問津，'+S.year+' 年黯然引退。')}]);
    return;
  }
  const estL=of=>termEstimate(of.lv,d,of.mult||1,mp,false);
  const cty=og=>({CPBL:'🇹🇼 台灣',NPB:'🇯🇵 日本',MiLB:'🇺🇸 美國',MLB:'🇺🇸 美國'})[og]||'';
  const ctyOrder={CPBL:0,NPB:1,MiLB:2,MLB:2};
  offers.sort((a,b)=>(ctyOrder[a.org]??9)-(ctyOrder[b.org]??9)); /* 依國家排序:台→日→美 */
  const offerOpts=offers.map(of=>of.cold?({
    t:`${cty(of.org)}｜${of.team}（${LV[of.lv].n}）`,
    s:`球團冷處理報價｜固定年薪 ${fmtMoney(of.annual)} × 1 年｜原行情 ×0.90`,
    f:()=>{ signTo(of.org,of.lv,of.team,1,of.mult,of.annual);
      card('info','轉投新東家',`原球團不願意簽你，所以<b class="hl">${of.team}</b>趁虛而入，用較低的代價帶走了你。`);
      advance(); }
  }):({
    t:`${cty(of.org)}｜${of.team}（${LV[of.lv].n}）`,
    s:`${of.posting?'日美入札｜讓渡金依最終合約另計':`簽約金 ${fmtMoney(of.bonus)}`}｜奪冠率 ${teamChampRate(of.team)}%｜長/短：${estL(of)}`,
    f:()=>{ const savedLv=S.lv,formerTeam=S.teamName(); S.lv=of.lv;
      termChoice(o,d,`${of.team} · 選擇合約類型`,(y,m,annual,total)=>{ S.lv=savedLv;
        if(!of.posting)S.salary+=of.bonus;
        const release=of.posting?postingReleaseFee(total):0;
        signTo(of.org,of.lv,of.team,y,m,annual);
        if(of.posting)card('gold','入札成立',`<b class="hl">${of.team}</b>與你簽下固定年薪 <b class="hl">${fmtMoney(annual)}</b> × <b class="hl">${y} 年</b>、保障總額 <b class="hl">${fmtMoney(total)}</b>的合約；另支付 <b class="hl">${fmtMoney(release)}</b>讓渡金給 <b class="hl">${formerTeam}</b>。讓渡金不計入你的生涯收入。`);
        advance(); },
        ()=>{ /* 報價簽約金尚未入帳；拒絕後不重抽市場。 */
          S.lv=savedLv;
          if(org==='CPBL')retireFromMarket();
          else homecomingAfterRejectedOffer(o);
        },org==='CPBL'?'拒絕合約，宣布引退':'落葉歸根',org==='CPBL'?'不接受這份合約，直接結束球員生涯':'婉拒這份合約，查看返台層級或選擇引退',of.mult||1,false); }}));
  const finalOpt=cold
    ?{t:'就此引退',warn:true,s:'不接受任何報價，結束球員生涯',f:retireFromMarket}
    :{t:`回原隊（${S.teamName()}）1 年約`,s:`固定年薪 ${fmtMoney(calcContractAnnual(S.lv,mp.rating,+(0.90*mp.aav).toFixed(2)))} × 1 年｜合約總額 ${fmtMoney(calcContractAnnual(S.lv,mp.rating,+(0.90*mp.aav).toFixed(2)))}`,
      f:()=>{ const annual=calcContractAnnual(S.lv,mp.rating,+(0.90*mp.aav).toFixed(2)); S.ct=makeContract(1,0.9,S.lv,mp.rating,annual,null,'折衷續約'); card('info','回歸',`重回 <b class="hl">${S.teamName()}</b>，固定年薪 <b class="hl">${fmtMoney(S.ct.annual)}</b>。`); advance(); }};
  choose(`<span class="ev-h">${cold?'球團冷處理後的':'自由市場'}報價一覽（依國家分列）</span>`+
    `<small>目前年薪：<b class="hl">${fmtMoney(contractAnnual())}</b>${mp.label?`｜<span class="dn">${mp.label}</span>`:''}</small>`,[...offerOpts,finalOpt]);
}
export function ageGateUSA(o,minReq){ /* 旅美/日職跳大聯盟:年齡越大越難,28 歲後幾乎關窗 */
  const age=S.age;
  if(age<=22)return 1.0;
  if(age<=24)return 0.75;
  if(age<=26)return 0.5;
  if(age<=27)return 0.3;
  if(age<=28)return 0.15;
  /* 28 歲以後:只有能力遠超門檻(+5)的怪物即戰力還有微弱機會 */
  return o>=minReq+5 ? 0.08 : 0;
}
export function ageGateJP(){ /* 旅日:窗口寬,31 歲(衰退前)都還有機會 */
  const age=S.age;
  if(age<=26)return 1.0;
  if(age<=28)return 0.7;
  if(age<=30)return 0.45;
  if(age<=31)return 0.25;
  return 0; /* 32 歲起(進入衰退)關窗 */
}
export function cpblUsaOfferChance(o,age){
  /* 中職旅美同時看年齡與綜合評價：年輕球員有培養價值，大齡怪物級戰力仍有被看見的機會。 */
  const a=Number.isFinite(age)?age:S.age;
  if(o<57||a>=33)return 0; /* 32 歲是最後窗口，33 歲起關窗 */
  const base=a<=22?30:a<=24?25:a<=26?20:a<=28?15:a<=30?10:a<=31?6:3;
  const abilityMult=o>=70?2:o>=65?1.5:o>=60?1:0.75;
  return Math.min(40,Math.round(base*abilityMult));
}
export function rollCpblCrossOffers(o,d,rollJP,rollUSA){
  /* 先獨立完成兩國判定，再組合畫面；日職抽中不再阻斷旅美判定。 */
  const jp=o>=53&&d>=1&&!!rollJP();
  const usa=o>=57&&d>=2&&!!rollUSA();
  return {jp,usa};
}
export function crossOffers(o){
  const fin=()=>advance();
  const mp=contractMarketProfile(S.lastD||0);
  if((mp.status==='major'||mp.status==='rehab')&&(!mp.star||!chance(mp.status==='major'?35:20))){ fin(); return; }
  const priceBid=(of,lv)=>{ const target=contractMarketProfile(S.lastD||0,lv);
    of.bonus=Math.round(of.bonus*target.bonus); of.annual=calcContractAnnual(lv,target.rating,+(target.aav*(0.97+R()*0.08)).toFixed(2)); return of; };
  if(S.lv==='CPBL1'){
    const jpP=Math.round(35*ageGateJP()),usaP=cpblUsaOfferChance(o,S.age);
    const hits=rollCpblCrossOffers(o,S.lastD||0,
      ()=>jpP>0&&chance(jpP),
      ()=>usaP>0&&chance(usaP));
    const opts=[],both=hits.jp&&hits.usa;
    if(hits.jp){
      const jl=o>=51?'NPB1':'NPB2';
      makeOffers('NPB',2,1200,2,3,jl,null).map(of=>priceBid(of,jl)).forEach(of=>opts.push({
        t:(both?'🇯🇵 ':'')+of.team+`（${LV[jl].n}）`,s:`簽約金 ${fmtMoney(of.bonus)}｜固定年薪 ${fmtMoney(of.annual)} × ${of.yrs} 年｜總額 ${fmtMoney(of.annual*of.yrs)}`,
        f:()=>{S.salary+=of.bonus;signTo('NPB',jl,of.team,of.yrs,1,of.annual);fin();}}));
    }
    if(hits.usa){
      const ml=o>=60?'MLB':'A3';
      makeOffers('MiLB',2,2000,2,4,ml,null).map(of=>priceBid(of,ml)).forEach(of=>opts.push({
        t:(both?'🇺🇸 ':'')+of.team+`（${LV[ml].n}）`,s:`簽約金 ${fmtMoney(of.bonus)}｜固定年薪 ${fmtMoney(of.annual)} × ${of.yrs} 年｜總額 ${fmtMoney(of.annual*of.yrs)}`,
        f:()=>{S.salary+=of.bonus;signTo('MiLB',ml,of.team,of.yrs,1,of.annual);fin();}}));
    }
    if(opts.length){
      const title=both?'日、美球團同時開出旅外合約':hits.jp?'日職球團開出旅外合約':'大聯盟球探遞出合約';
      choose(title,[...opts,{t:'留在中職',main:true,f:fin}]); return;
    }
  }
  if(S.lv==='NPB1'&&o>=60&&(S.lastD||0)>=2&&chance(Math.round(30*ageGateUSA(o,60)))){
    const bids=makeOffers('MiLB',ri(2,3),0,3,6,'MLB',null).map(of=>({...of,mult:+(0.97+R()*0.08).toFixed(2)}));
    const formerTeam=S.teamName();
    choose('入札制度：大聯盟多隊競標你的合約',[...bids.map(of=>({
      t:of.team,s:`${termEstimate('MLB',S.lastD||0,of.mult,mp,false)}｜讓渡金依最終保障總額另計`,
      f:()=>{ const savedLv=S.lv; S.lv='MLB';
        termChoice(o,S.lastD||0,`${of.team} · 入札合約類型`,(y,m,annual,total)=>{ S.lv=savedLv;
          const release=postingReleaseFee(total);
          signTo('MiLB','MLB',of.team,y,m,annual);
          card('gold','入札成立',`<b class="hl">${of.team}</b>與你簽下固定年薪 <b class="hl">${fmtMoney(annual)}</b> × <b class="hl">${y} 年</b>、保障總額 <b class="hl">${fmtMoney(total)}</b>的合約；另支付 <b class="hl">${fmtMoney(release)}</b>讓渡金給 <b class="hl">${formerTeam}</b>。讓渡金不計入你的生涯收入。`);
          fin(); },()=>{ S.lv=savedLv; fin(); },'留在日職','不接受這份入札合約，留在原球隊',of.mult,false); }})),
      {t:'留在日職',main:true,f:fin}]); return; }
  fin();
}
