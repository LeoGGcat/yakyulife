import {S} from '../core/state.js?v=1.5.12';
import {ri, pick} from '../core/rng.js?v=1.5.12';
import {CPBL_TEAMS} from '../data/teams.js?v=1.5.12';
import {card, choose, board, menuModal} from '../ui/dom.js?v=1.5.12';
import {tlNote} from '../ui/timeline.js?v=1.5.12';
import {ovr, playerType} from './ability.js?v=1.5.12';
import {primaryPos} from './career.js?v=1.5.12';
import {fmtMoney, makeOffers, pickOfferUI, signTo} from './contract.js?v=1.5.12';
import {startYear} from '../flow/phases.js?v=1.5.12';
import {endGame} from '../ui/retire.js?v=1.5.12';
/* ---------- 選秀與生涯路口 ---------- */
export function runDraft(fromSchool,cb){
  const o=ovr(); const score=o+Math.max(0,22-S.age)*2+ri(-4,4);
  const rd=score>=56?1:score>=49?2:score>=43?ri(3,4):score>=37?ri(5,7):score>=30?ri(8,10):0;
  if(rd===0){
    card('bad','選秀落榜',`唱名一輪又一輪，始終沒有你的名字。（綜合 ${o}｜年齡加權後評價 ${score}）`);
    if(fromSchool){ card('info','','回到校隊，明年再來。'); cb(); }
    else cb('fail');
    return;
  }
  const bonus=[0,1000,600,350,350,150,150,150,50,50,50][rd]||50;
  const lv=(rd===1&&o>=50)?'CPBL1':'CPBL2';
  const team=pick(CPBL_TEAMS);
  const accept=()=>{
    S.stage='PRO'; S.team=''; S.salary+=bonus; S.svc=0; S.faElig=false;
    signTo('CPBL',lv,team,ri(2,3),1); /* 菜鳥分段短約(2~3年) */
    card('gold','中華職棒選秀會',`第 <b class="hl">${rd}</b> 輪獲 <b class="hl">${team}</b> 指名！簽約金依順位為 <b class="hl">${fmtMoney(bonus)}</b>。${lv==='CPBL1'?'即戰力評價，直接放入一軍名單。':'先從二軍出發。'}`);
    tlNote(4,'選秀第'+rd+'輪');
    board(0); cb();
  };
  /* 輪次不滿意(第 3 輪以後)可選擇重返業餘再拚一年;年齡太大(24+)則不給這選項,避免拖太久 */
  if(rd>=3 && S.age<24){
    choose(`中華職棒選秀會 · 第 ${rd} 輪獲 ${team} 指名`,[
      {t:'接受指名，加盟球隊',main:true,s:`簽約金 ${fmtMoney(bonus)}｜${lv==='CPBL1'?'一軍':'二軍'}出發`,f:accept},
      {t: (S.stage==='HS'||(S.stage==='U'&&S.stageYr<4))?'重返校園，再拚一年':'重返業餘，再拚一年',warn:true,s:'放棄本次指名，明年重新參加選秀',f:()=>{
        const goUni = (S.stage==='HS')||(S.stage==='U'&&S.stageYr<4);
        const fresh = (S.stage==='HS');
        card('info', goUni?'重返校園':'重返業餘', `看到被選到的輪次，雙眼發黑，原本以為會在前段輪次被選中，卻落到了後段的輪次。你握緊了拳頭，決定${goUni?(fresh?'進入大學繼續深造':'留在校隊繼續磨練'):'重返業餘'}，這一次，你一定要上台戴上所屬球隊的帽子。`);
        if(fresh){ S.stage='U'; S.stageYr=0; S.team=pick(['文化大學','輔仁大學','國立體大','台灣體大','開南大學']); }
        else if(!goUni){ S.stage='AMA'; S.team=pick(['合電','台庫','安妞先物','美麗珊瑚']); }
        if(fromSchool) cb(); else advance();
      }}]);
    return;
  }
  accept();
}
export function pathChoiceHS(){
  const o=ovr();
  const opts=[{t:'就讀大學（延長養成）',s:'一年僅 2 場大賽加點｜大二起每年可投入選秀',f:()=>{
      S.stage='U'; S.stageYr=0; S.team=pick(['文化大學','輔仁大學','國立體大','台灣體大','開南大學']);
      card('info','升學',`進入 <b class="hl">${S.team}</b> 棒球隊。`); advance(); }},
    {t:'投入中華職棒選秀',s:'目前綜合 '+o,f:()=>runDraft(false,r=>{
      if(r==='fail')choose('落榜之後',[
        {t:'改就讀大學',main:true,f:()=>{S.stage='U';S.stageYr=0;S.team=pick(['文化大學','輔仁大學','國立體大','台灣體大']);advance();}},
        {t:'加入業餘成棒隊',f:()=>{S.stage='AMA';S.team=pick(['合電','台庫','安妞先物','美麗珊瑚']);advance();}}]);
      else advance(); })}];
  if(o>=44)opts.push({t:'洽談旅日合約',s:'從日職二軍（支配下）出發｜滿 8 年視同本土',f:()=>{
    S.stage='PRO';
    pickOfferUI('日職球團的育成報價','NPB',makeOffers('NPB',ri(2,3),800,3,3,'NPB2',null),()=>{
      card('gold','旅日','目標：一軍初登場。'); advance(); }); }});
  if(o>=50)opts.push({t:'洽談旅美合約',main:true,s:`從${o>=54?' 1A ':'新人聯盟'}出發，逐級挑戰大聯盟`,f:()=>{
    S.stage='PRO';
    pickOfferUI('大聯盟球團的國際簽約報價','MiLB',makeOffers('MiLB',ri(2,3),1500,3,4,o>=54?'A1':'R',null),()=>{
      card('gold','旅美','美國的紅土，等著你去征服。'); advance(); }); }});
  choose(`高中畢業 · 綜合能力 ${o} · 人生的第一個路口`,opts);
}
export function pathChoiceU4(){
  const o=ovr();
  const opts=[{t:'投入中華職棒選秀',main:true,s:'綜合 '+o+'｜大學畢業年齡加權下降',f:()=>runDraft(false,r=>{
    if(r==='fail')choose('落榜之後',[
      {t:'加入業餘成棒隊',f:()=>{S.stage='AMA';S.team=pick(['合電','台庫','安妞先物']);advance();}},
      {t:'高掛球鞋',warn:true,f:()=>endGame('大學畢業選秀落榜，決定告別球場。')}]);
    else advance(); })}];

  /* 大四畢業 (約22歲)，套用最大年齡懲罰 (Senior Sign) */
  const agePenalty = Math.max(0, S.age - 18);
  const reqNPB = 44 + Math.floor(agePenalty / 2);
  const reqMiLB = 50 + Math.floor(agePenalty / 2);
  const bonusNPB = Math.max(100, 800 - agePenalty * 180);
  const bonusMiLB = Math.max(150, 1500 - agePenalty * 350);
  if(o>=reqNPB)opts.push({t:'洽談旅日合約',s:'大齡新秀，簽約行情極低',f:()=>{S.stage='PRO';
    pickOfferUI('日職球團報價','NPB',makeOffers('NPB',2,bonusNPB,2,3,'NPB2',null),advance);}});
  if(o>=reqMiLB)opts.push({t:'洽談旅美合約',s:'大齡底薪簽約 (Senior Sign)',f:()=>{S.stage='PRO';
    pickOfferUI('大聯盟球團報價','MiLB',makeOffers('MiLB',2,bonusMiLB,3,4,o>=55?'A1':'R',null),advance);}});
  choose(`大學畢業 · 綜合能力 ${o}`,opts);
}
if(typeof document!=='undefined'&&document.getElementById('btn-menu')){
  document.getElementById('btn-menu').onclick=menuModal;
}
export function advance(){
  S.age++; S.year++; S.stageYr++; startYear();
}
