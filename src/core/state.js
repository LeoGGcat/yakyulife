import {R, ri} from './rng.js?v=1.5.12';
import {POS_AB} from '../data/abilities.js?v=1.5.12';
import {LV} from '../data/teams.js?v=1.5.12';

/* ================= 遊戲狀態 ================= */
export let S=null, stepQ=[];
export function setS(v){ S=v; }
export function newState(name,jersey,pos,role){
  const ab={}; POS_AB[pos].forEach(k=>ab[k]=ri(20,32));
  if(pos==='P'){ab.vel+=ri(0,6);ab.brk+=ri(0,4);} else {ab.con+=ri(0,6);ab.pow+=ri(0,4);}
  /* OOTP 式潛力天花板:洗牌後 1 項頂尖工具、1 項優質、1 項中上,其餘平庸 */
  /* 捕手沿用一般野手的 8 項潛力分配，但以配球取代守備範圍的席位；額外的守備範圍只給低上限。 */
  const pot={}, sh=(pos==='C'?POS_AB[pos].filter(k=>k!=='rng'):POS_AB[pos].slice());
  for(let i=sh.length-1;i>0;i--){const j=Math.floor(R()*(i+1));const t=sh[i];sh[i]=sh[j];sh[j]=t;}
  if(pos==='P'){
    /* 投手只有 4 項能力,天花板更集中:1 項招牌武器,其餘明顯壓低,避免動輒雙 70/四滿天賦 */
    sh.forEach((k,i)=>{ pot[k]= i===0?ri(70,80) : i===1?ri(58,68) : i===2?ri(50,60) : ri(44,54); });
  } else {
    sh.forEach((k,i)=>{ pot[k]= i===0?ri(72,80) : i===1?ri(64,74) : i===2?ri(56,68) : ri(46,62); });
    if(pos==='C')pot.rng=ri(32,40); /* 不參與頂尖工具洗牌，初始守備範圍潛力永不超過 40 */
  }
  /* 高中固定分級表(隱藏):T1 名門 +6 / T2 中堅 ±0 / T3 弱旅 -6 */
  const hsMap={'平鎮高中':1,'穀保家商':1,'高苑工商':2,'北科附工':2,'普門高中':3,'東大體中':3};
  const schools=Object.keys(hsMap);
  const myTeam=schools[Math.floor(R()*schools.length)];
  return {name,jersey,pos,role:pos==='P'?null:null,age:16,year:2026,stage:'HS',stageYr:1,pot,
    hsMap,hsTier:hsMap[myTeam],team:myTeam,potSum0:Object.values(pot).reduce((a,b)=>a+b,0),
    league:null,org:null,orgTeam:null,lastCpblTeam:null,lastLeagueTeam:{CPBL:null,NPB:null,MLB:null},teamTally:{CPBL:{},NPB:{},MLB:{}},
    ab,traits:{genius:false,glass:false,iron:false,scum:false,
      late:false,disc:false,academy:false,intlace:false,franchise:false,clutch:false,favorite:false,phoenix:false,combo:false,onetool:false,rubber:false,legend:false,
      oldghost:false,adking:false,miraclegen:false,strongpitch:false,stronghit:false,championmaker:false,
      yips:false,distract:false,cancer:false,ambience:false,goldcloth:false,thief:false,latepractice:false,mrteam:false,confidante:false,smallschool:false,grinder:false,rainbow:false,taiwan:false,pitcherTC:false,hitterTC:false},
    removed:[], /* 被覆蓋/解除的特性,結算畫刪除線 */
    cntSave:0,cntSaveWin:0,cntTrainingSafeFail:0,cntNormWin:0,cntSnack:0,cntBoldWin:0,cntBoldFail:0,cntSocialBoldFail:0,cntEndorseBoldWin:0,
    hsChampions:0,oldGhostPending:false,oldGhostUsed:false,samePick:0,samePickKey:null,
    teamSeasons:0,teamYears:0,teamStarYears:0,franchiseActive:false,franchiseTeamName:null,
    six:0,bigInj:0,glassYear:null,ironStreak:0,npbYears:0,
    injNext:0,tmpInj:0,rehab:0,marketInjury:'healthy',salary:0,outsideIncome:0,yearOutsideIncome:0,pool:0,pendStat:0,seasonFactor:1,
    stats:{CPBL:null,NPB:null,MLB:null,MINOR:null},contracts:[],honors:[],legendLeagues:[],rainbowLeagues:[],pitcherTCLeagues:[],hitterTCLeagues:[],intlCount:0,intlLock:null,intlStat:{G:0,PA:0,AB:0,H:0,HR:0,RBI:0,BB:0,IP:0,SO:0,ER:0,W:0,SV:0},intlLog:[],intlBest:null,dpos:null,dposYears:{},roleYears:{},tradeRefuse:0,champThisTeam:false,svc:0,svcOrg:null,faElig:false,tradeHeat:0,complainCount:0,demotionRefused:false,tj:0,tjCount:0,tjCrises:0,effort:'普通',tjSuccess:0,lastLv:null,love:{st:'single',partner:null,kids:0,caught:0,affairs:0,exes:[],dyrs:0,datedTimes:0},traits2:{},log:[],ct:null,done:false};
}
export function playerName(){ return `${S.name} #${S.jersey}`; }
export function blankStat(){return {yr:0,G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,AS:0,DEF:0,DPG:{}};}
export function bucketOf(lv){ const l=lv&&LV[lv]; return l&&l.top?l.top:'MINOR'; } /* 業餘引退時 lv 為空,歸類 MINOR */
export function nextStep(){ if(S.done){ stepQ=[]; return; } /* 已引退:清空後續步驟,不再跑續約/結算 */ const f=stepQ.shift(); if(f)f(); }
export function stageLabel(){
  if(S.stage==='HS')return '高'+['一','二','三'][S.stageYr-1];
  if(S.stage==='U')return '大'+['一','二','三','四'][S.stageYr-1];
  if(S.stage==='AMA')return '業餘成棒';
  return LV[S.lv].n;
}
