import {S, blankStat, bucketOf} from '../core/state.js?v=1.5.12';
import {R, ri, SEED} from '../core/rng.js?v=1.5.12';
import {OFFICIAL_URL} from '../config.js?v=1.5.12';
import {LV, LG_N, CPBL_TEAMS, NPB_TEAMS, MLB_TEAMS, teamNick} from '../data/teams.js?v=1.5.12';
import {TIER_TH, FAN, RP_LV_SUF} from '../data/economy.js?v=1.5.12';
import {TRAIT_KEYS} from '../data/traits.js?v=1.5.12';
import {$, card, choose, divider, board, actClear} from './dom.js?v=1.5.12';
import {careerTimelineCard, tlNote} from './timeline.js?v=1.5.12';
import {traitNames, traitTagStyle, traitColorRank} from './traits.js?v=1.5.12';
import {roleN, fmtIP, slgOf, baseballERA, baseballWHIP} from '../engine/season.js?v=1.5.12';
import {fmtMoney} from '../engine/contract.js?v=1.5.12';
import {isChampionshipYear, isProChampionshipYear} from '../engine/championship.js?v=1.5.12';
import {capTeam, careerMilestones, honorGroups, posLegendPhrase, primaryPos, statTable, tierOf, yearRanges, honorText} from '../engine/career.js?v=1.5.12';
import {shareImageSheet} from './share-image.js?v=1.5.12';
/* ================= 結算圖資料建構 =================
   Data builders for shareImage()'s canvas layout (design handoff 2026-08-14).
   All values come from S.*; the in-game settlement cards are untouched. */
/* Baseball tick marks: precomputed points on the left seam (a quadratic from
   (7.6,1.9) over (2.6,12) to (7.6,22.1)); the right seam mirrors them at x=24-x. */
export function rpTagline(){
  const first=S.log.length?S.log[0].y:'?';
  return `${primaryPos()}｜${first}–${S.year}｜引退時 ${S.age} 歲`+
    (S.pos==='P'&&(S.tjCrises||S.tjCount)?`｜手肘危機×${S.tjCrises||0}／TJ×${S.tjCount}`:'');
}
export function rpFamily(){
  const lv=S.love, kid=n=>n?`（育${n}）`:'';
  const cur=lv.st==='married'?`老婆 ${lv.partner}${kid(lv.kids)}`
    :lv.st==='dating'?`交往中 ${lv.partner}（${lv.dyrs||0} 年）`
    :lv.st==='divorced'?'離婚':'未婚';
  const ex=lv.exes.length?`｜前妻 ${lv.exes.map(e=>`${e.name}${kid(e.kids)}`).join('、')}`:'';
  const kids=lv.kids+lv.exes.reduce((t,e)=>t+e.kids,0);
  return `家庭：${cur}${ex}｜子女共 ${kids} 人${lv.affairs?`｜外遇 ${lv.affairs} 次（抓 ${lv.caught}）`:''}`;
}
export const RP_F3=v=>v==null?'-':v.toFixed(3).replace(/^0/,'');
export const RP_F2=v=>v==null?'-':v.toFixed(2);
export function championshipYear(year){ return isChampionshipYear(S.honors,year); }
export function proChampionshipYear(year){ return isProChampionshipYear(S.honors,year); }
export function settlementYearHTML(year,isChampion=championshipYear(year)){
  const crown=isChampion?'<span class="champ-crown" title="該年度奪冠" role="img" aria-label="冠軍"></span>':'';
  return `<span class="champ-slot">${crown}</span>${year}`;
}
export function rpCumData(){ /* per-league career totals; best-of-column marks need 2+ rows */
  const isP=S.pos==='P';
  const order=['MLB','NPB','CPBL','MINOR'].filter(b=>S.stats[b]);
  const hd=isP?['Yrs','G','IP','W','L','SV','HLD','SO','BB','ERA','WHIP']
             :['Yrs','G','PA','AVG','OBP','SLG','OPS','H','HR','RBI','BB','SB','DEF'];
  const rows=order.map(b=>{ const st=S.stats[b];
    if(isP){
      const era=baseballERA(st), whip=baseballWHIP(st);
      return {b,txt:[st.yr,st.G,fmtIP(st.IP),st.W,st.L,st.SV||0,st.HLD||0,st.SO,st.BB||0,RP_F2(era),RP_F2(whip)],
              num:[st.yr,st.G,st.IP,st.W,st.L,st.SV||0,st.HLD||0,st.SO,st.BB||0,era,whip]};
    }
    const obp=st.PA>0?(st.H+st.BB)/st.PA:null, slg=st.AB>0?slgOf(st):null,
          avg=st.AB>0?st.H/st.AB:null, ops=(obp!=null&&slg!=null)?obp+slg:null;
    return {b,txt:[st.yr,st.G,st.PA,RP_F3(avg),RP_F3(obp),RP_F3(slg),RP_F3(ops),st.H,st.HR,st.RBI,st.BB||0,st.SB,(st.DEF>0?'+':'')+(st.DEF||0)],
            num:[st.yr,st.G,st.PA,avg,obp,slg,ops,st.H,st.HR,st.RBI,st.BB||0,st.SB,st.DEF||0]};
  });
  /* Yrs never marked; pitcher L/BB "best" is meaningless; ERA/WHIP take the minimum */
  const minCols=isP?{9:1,10:1}:{}, skip=isP?{0:1,4:1,8:1}:{0:1}, best={};
  if(rows.length>=2)hd.forEach((_,i)=>{ if(skip[i])return;
    const vs=rows.map(r=>r.num[i]).filter(v=>v!=null&&!(v===0&&!minCols[i]));
    if(vs.length)best[i]=minCols[i]?Math.min(...vs):Math.max(...vs); });
  rows.forEach(r=>r.best=r.num.map((v,i)=>best[i]!=null&&v===best[i]));
  return {hd,rows};
}
export function rpIntlData(){
  const isP=S.pos==='P', IS=S.intlStat, il=S.intlLog||[];
  const walks=st=>Number.isFinite(st&&st.BB)?Math.max(0,Math.round(st.BB)):
    (Number.isFinite(st&&st.PA)&&Number.isFinite(st&&st.AB)?Math.max(0,Math.round(st.PA-st.AB)):0);
  const totalBB=Number.isFinite(IS.BB)?Math.max(0,Math.round(IS.BB)):il.reduce((n,r)=>n+walks(r.st),0);
  if(isP){
    return {hd:['G','IP','W','SV','SO','BB','ERA'],
      rows:il.map(r=>{ const st=r.st; return {year:r.year,name:r.name,rank:r.rank,
        txt:[st.G,fmtIP(st.IP),st.W,st.SV,st.SO,walks(st),RP_F2(baseballERA(st))]}; }),
      tot:[IS.G,fmtIP(IS.IP),IS.W,IS.SV,IS.SO,totalBB,RP_F2(baseballERA(IS))]};
  }
  return {hd:['G','PA','AVG','H','HR','RBI','BB'],
    rows:il.map(r=>{ const st=r.st; return {year:r.year,name:r.name,rank:r.rank,
      txt:[st.G,st.PA,RP_F3(st.AB>0?st.H/st.AB:null),st.H,st.HR,st.RBI,walks(st)]}; }),
    tot:[IS.G,IS.PA,RP_F3(IS.AB>0?IS.H/IS.AB:null),IS.H,IS.HR,IS.RBI,totalBB]};
}
export function rpHonorItems(){ /* [[text,accent?],...] per item; ×N gets the accent color */
  return careerMilestones().map(t=>[[t,0]])
    .concat(honorGroups().map(g=>{ const ranges=yearRanges(g.yrs), n=g.yrs.length, parts=[[g.awd,0]];
      if(n>1)parts.push([` ×${n}`,1]);
      if(ranges.length)parts.push([` (${ranges.join('、')})`,0]);
      return parts; }));
}
export function rpOrgOf(r){ /* org team + league + level label for one pro-log row */
  let tm=r.tm||'', lvl='';
  for(const s of RP_LV_SUF){ if(tm.endsWith(s)){ lvl=s; tm=tm.slice(0,-s.length); break; } }
  const lg=CPBL_TEAMS.includes(tm)?'CPBL':NPB_TEAMS.includes(tm)?'NPB':MLB_TEAMS.includes(tm)?'MLB'
    :(r.lv&&LV[r.lv]?(LV[r.lv].top||(LV[r.lv].org==='MiLB'?'MLB':LV[r.lv].org)):'CPBL');
  if(!lvl)lvl=lg==='MLB'?'大聯盟':'一軍';
  return {team:tm,lg,lvl,minor:lvl!=='一軍'&&lvl!=='大聯盟'};
}
export function rpProData(proLogs){ /* team segments: a new block whenever the org changes */
  const isP=S.pos==='P';
  const hd=isP?['G','IP','W-L','SV','HLD','SO','BB','ERA','WHIP']
             :['G','PA','AVG','OBP','SLG','OPS','H','HR','RBI','BB','SB','DEF'];
  const blocks=[]; let cur=null;
  proLogs.forEach(r=>{ const o=rpOrgOf(r);
    if(!cur||cur.team!==o.team||cur.lg!==o.lg){ cur={team:o.team,lg:o.lg,rows:[]}; blocks.push(cur); }
    const s=r.st||blankStat(); let txt,era=null,ops=null;
    if(isP){ era=baseballERA(s);
      txt=[s.G,fmtIP(s.IP),`${s.W}-${s.L}`,s.SV||0,s.HLD||0,s.SO,s.BB||0,RP_F2(era),RP_F2(baseballWHIP(s))];
    } else { const obp=s.PA>0?(s.H+s.BB)/s.PA:null, slg=s.AB>0?slgOf(s):null;
      ops=(obp!=null&&slg!=null)?obp+slg:null;
      txt=[s.G,s.PA,RP_F3(s.AB>0?s.H/s.AB:null),RP_F3(obp),RP_F3(slg),RP_F3(ops),s.H,s.HR,s.RBI,s.BB||0,s.SB,(s.DEF>0?'+':'')+(s.DEF||0)];
    }
    /* level cell carries the season's role: fielding position for batters (一軍·CF),
       SP/MR/CL for pitchers (一軍·先發). r.p is already the position actually played,
       so a forced-DH season reads as DH here exactly as it does in the in-game table. */
    const dp=isP?(r.role?roleN(r.role):''):(r.p||'');
    cur.rows.push({y:r.y,champ:proChampionshipYear(r.y),age:r.age,lvl:o.lvl+(dp?'·'+dp:''),minor:o.minor,
      inj:!!r.inj,txt,sv:s.SV||0,era,hr:s.HR||0,ops});
  });
  /* career-best marks: SV + ERA for pitchers, HR + OPS for batters (ties all marked);
     a single pro season has no "best" to speak of, so 2+ rows are required */
  let bSV=0,bERA=null,bHR=0,bOPS=null;
  const nRows=blocks.reduce((a,b)=>a+b.rows.length,0);
  blocks.forEach(b=>b.rows.forEach(r=>{
    bSV=Math.max(bSV,r.sv); bHR=Math.max(bHR,r.hr);
    if(r.era!=null&&(bERA==null||r.era<bERA))bERA=r.era;
    if(r.ops!=null&&(bOPS==null||r.ops>bOPS))bOPS=r.ops; }));
  blocks.forEach(b=>b.rows.forEach(r=>{
    r.best=hd.map(()=>false);
    if(nRows<2)return;
    if(isP){ if(bSV>0&&r.sv===bSV)r.best[3]=true; if(r.era!=null&&r.era===bERA)r.best[7]=true; }
    else { if(bHR>0&&r.hr===bHR)r.best[7]=true; if(r.ops!=null&&r.ops===bOPS)r.best[5]=true; } }));
  return {hd,blocks};
}
export function rpSalaryData(proLogs){
  const isP=S.pos==='P';
  const hd=isP?['年薪','G','IP','W-L','SV','ERA']
             :['年薪','G','PA','AVG','HR','RBI','OPS'];
  const rows=(proLogs||[]).map(r=>{ const s=r.st||blankStat(),o=rpOrgOf(r);
    let txt;
    if(isP){
      txt=[Number.isFinite(r.salary)?fmtMoney(Math.round(r.salary)):'—',s.G,fmtIP(s.IP),`${s.W}-${s.L}`,s.SV||0,RP_F2(baseballERA(s))];
    }else{
      const obp=s.PA>0?(s.H+s.BB)/s.PA:null,slg=s.AB>0?slgOf(s):null,ops=(obp!=null&&slg!=null)?obp+slg:null;
      txt=[Number.isFinite(r.salary)?fmtMoney(Math.round(r.salary)):'—',s.G,s.PA,RP_F3(s.AB>0?s.H/s.AB:null),s.HR||0,s.RBI||0,RP_F3(ops)];
    }
    return {y:r.y,age:r.age,team:o.team,lvl:o.lvl+(isP&&r.role?'·'+roleN(r.role):!isP&&r.p?'·'+r.p:''),inj:!!r.inj,
      pay:Number.isFinite(r.salary)?Math.round(r.salary):null,txt};
  });
  /* 合約分段：用付薪當下標記的 ctId 分組，每一份合約都自成一段——包含單年約。
     單年約如果不獨立標出來，視覺上會被上一條多年約的帶子吃掉，看起來像是
     那份合約的一部分，盤不盤就完全看不出來了。

     顯示的年數與總額一律取「這段實際打了幾季、實際領了多少」，不是簽約當下的
     帳面值。兩者會不一樣：升上一軍時 contractAnnual() 會用層級底薪墊高實付，
     中途被交易或釋出則會少領幾年。畫面上的數字必須跟同一張表的逐年欄位對得起來。
     簽約當下的帳面內容完整留在 S.contracts 供分析。 */
  const src=(proLogs||[]);
  for(let i=0;i<rows.length;){
    const id=src[i]&&src[i].ctId;
    let j=i+1;
    if(id!=null){ while(j<rows.length&&src[j]&&src[j].ctId===id)j++; }
    const seg=rows.slice(i,j).filter(r=>Number.isFinite(r.pay));
    if(seg.length){
      const total=seg.reduce((a,r)=>a+r.pay,0);
      const same=seg.every(r=>r.pay===seg[0].pay);
      rows[i].contract={yrs:j-i,total,annual:same?seg[0].pay:null};
    }
    i=Math.max(j,i+1);
  }
  return {hd,rows};
}
export function nextGameEnding(pos){
  /* 先固定球員身分再組文，結果不留下括號候選字或不連貫的守位敘事。 */
  const pitcher=pos==='P';
  const role=pitcher
    ?{strain:'踏地',first:'第一局，你投出了一次三振。',realize:'回投手丘整理狀態時，你忽然發現——'}
    :{strain:'滑壘',first:'第一打席，你打出一支平凡的一壘安打。',realize:'站上一壘的那一刻，你忽然發現——'};
  return {title:'下一場比賽',body:`沒有鎂光燈，沒有滿場的觀眾。你揹著有點髒的球具袋，走進了休息室。<br>休息室裡有的孩子，才剛從大學畢業，眼裡依舊閃耀著對職業的嚮往。<br>你想起他們看見你的時候，眼神滿是詫異，然後有人小聲地說出你的名字——那個曾經出現在球員卡上、出現在賽後新聞裡的名字。<br>那天，休息室變成了一個小小的簽名會。<br>球衣是獨立聯盟的，胸前印著的贊助商是巷口的機車行。號碼隨便發的，不是你打了十幾二十年的那一個。<br>你花了比以前更久的時間纏繃帶。膝蓋在陰雨天會提醒你，它記得所有你想忘記的${role.strain}。<br>比賽在下午三點開打。觀眾席上坐著幾位家長、一隻在陰影下打盹的狗，還有一個推著冰棒車、順便看球的老先生。<br>依然有幾個熱情球迷，從年輕時就追著你的比賽。你退休了，他們也有時間了，依然常常到場舉著毛巾，唱著你的應援曲。<br>${role.first}沒有人歡呼，只有隊友在休息區敲了敲欄桿。<br>${role.realize}<br>心跳的頻率，和十六歲那年第一次上場，一樣。<br>七局下，兩出局，一分落後。輪到一個剛從大學畢業的孩子打擊。<br>他在打擊區裡緊張到握棒的手在抖。你在後面喊了一聲他的名字，說：「看你想看的那顆就好。」<br>他真的等到了。球飛過中外野手的頭頂，落地那一秒，整支球隊像瘋了一樣衝出休息區。<br>沒有轉播、沒有慢動作重播、沒有隔天的頭條。<br>但那個孩子在二壘上，笑得像剛簽下一份千萬合約。<br>比賽結束後，大家蹲在地上一起收壘包、拔起邊線的木樁。你把整理好的球具搬上車，動作熟練得像做過一千次。<br>那個孩子跑過來，有點害羞地問你：「前輩，你為什麼還要打？」<br>你想了很久。<br>想到那些傷、那些被下放的季節、那些在二軍球場等待電話的夜晚。想到最後一場職業賽，你在休息區把帽子壓得很低，怕被拍到。<br>然後你把袋子的拉鍊拉上，說：<br>「因為明天還有下一場。」<br>天暗下來了。已經不是職業了，球場只剩下一盞燈。<br>你回頭看了一眼。<br>紅土被今天的雨打得有點坑漥，明天早上得先整理一下。<br>——你的球員生涯結束了。<br>你的棒球，還沒有。`};
}
export function nextBaseEnding(pos){
  const memory=pos==='P'
    ?'你想到了那些被敲出的全壘打。你蹲在投手丘上，看著對方從休息室出來歡呼。'
    :'你想到了最後一個打席的三振、接殺、觸殺。投手振臂，而你只是低下了頭，盯著自己的球棒。';
  return {title:'下一個壘包',body:`星期六早上八點，你開車載著小孩去球場。<br><br>和之前不同，這次去的球場不是那種有轉播車、場地整理得漂漂亮亮的球場，而是一個內野紅土有點坑坑洞洞、外野草皮有點禿，甚至因為跟成人共用場地，全壘打牆是用護欄與帆布架起的臨時全壘打牆。<br><br>就跟你小時候常去的球場一樣。<br><br>你把小孩送去集合，孩子的教練看到是你，想要過來打招呼致意。你對他搖了搖頭，示意他你只是一個家長而已。接著你就和其他家長一樣，坐到場邊的鐵板凳觀眾席（當然也引起了一陣騷動）。<br><br>比賽開始，你才發現看自己的小孩打球，比自己上場緊張一百倍。<br><br>你以前站在滿場的球場裡都不會抖，現在你兒子站上打擊區，你的手心居然在流汗。<br><br>第一打席，三振。他懊惱地盯著自己的球棒，那表情你在看自己過往的影片時常看到。<br><br>第二打席，他打了一顆滾地球穿出了二遊，形成了安打。你差點站起來大叫，但你只是用力鼓了幾下掌。<br><br>站上一壘之後，他在壘包上偷偷往你這邊看了一眼，對你比了一個 Ya。<br><br>你比了一個手勢——那是打得好的意思。<br><br>那是你爸以前對你比的手勢。你到現在才知道，原來這個動作是會傳下去的。<br><br>六局下半，最後的半局進攻，他被夾殺在二、三壘之間，比賽結束。<br><br>跑回來，跑過去，最後被觸殺出局。他坐在紅土上，很久沒有站起來。<br><br>旁邊有的家長發出遺憾的嘆氣，有的大聲鼓勵場上的小球員。<br><br>而你只是看著那個坐在紅土上的背影，什麼也沒說。<br><br>比賽結束後，回家的路上他一直沒講話。一直到你停好車，要幫他把球具搬下車之前，孩子才小聲地問：「爸，你之前的比賽，有像這樣因為你，而輸掉比賽嗎？」<br><br>「有啊。」<br><br>「幾次？」<br><br>${memory}<br><br>「我猜應該有個一兩百次吧。」<br><br>他抬起頭看你，眼睛終於亮了一點：「那麼多？真的假的？」<br><br>「真的。」你把他頭上的棒球帽戴正：「重點不是你這次的失誤，而是你這次失誤之後，你下次還敢不敢嘗試。」<br><br>吃完了飯，你的孩子拉著你，在地上擺了兩本書，要你陪他練習觸殺的 Case。<br>你偶爾認真，偶爾放他一馬。在某次的練習中，你看著他從你的手套邊緣逃掉。明明只是在小小的客廳，你卻感覺和他的距離愈來愈遠。<br><br>——你的職業生涯結束了。<br>但棒球的未來，還在繼續跑向下一個壘包。`};
}
export function jerseyWeightEnding(pos){
  const painfulMemory=pos==='P'
    ?'你在國際賽最後一局被一發全壘打超前'
    :'你在國際賽最後一局漏接一顆平飛球';
  return {title:'球衣的重量',body:`國家隊的辦公室，冷氣吹著，但你卻滿頭大汗，看著桌上堆著三十幾份球員資料。<br><br>你接下這個位子的那天，記者問你：「壓力會不會很大？」<br><br>你說：「還好。」<br><br>其實你回家之後失眠了四個晚上。<br><br>集訓第一天，你站在球員面前。<br><br>眼前這些人，有的在美國打球，有的是聯盟的全壘打王，有的還是才剛進職棒。他們有各自的球隊、各自的教練、各自的習慣。接下來幾個星期，你要讓他們變成同一支球隊。<br><br>你沒有講什麼熱血的話。你只說了三件事：<br><br>「第一，恭喜你們要代表國家出賽。」<br><br>「第二，就算在集訓階段被淘汰，你們也是很棒很棒的球員，只要全力以赴就好。」<br><br>「第三，如果你上場的時候手在抖，那很好。要永遠記住身上這件球衣的重量。」<br><br>集訓開始，你除了帶球隊，還要觀察那些仍在海外、不能即時回國參加集訓的選手狀況。<br><br>到了熱身賽，你們打了國內季外無敵的強隊，也對上提早來台灣準備的國家隊，有勝有敗。不變的是，永遠都有記者拍著你在休息室苦惱的樣子。<br><br>你想起十九歲第一次入選青棒國家隊，那時候你站在最邊邊，緊張到國歌唱錯字。你想起有一年，${painfulMemory}，回國之後有半年不敢看網路。<br><br>你也想起那些沒被選上的人。那些跟你一樣努力，只是差一點的人。<br><br>那件球衣，其實不只是你的。<br><br>八強戰，第九局，一分落後，兩出局，二、三壘有人。<br><br>上來的是個剛旅外的孩子，臉上還充滿著稚氣。<br><br>還有你也曾經擁有過的企圖心。<br><br>「換代打嗎？這是他第一次一級國際賽，沒什麼經驗，前面打擊也沒有安打……」<br><br>「我之前很多經驗時還不是會輸球。」你搖了搖頭：「看看他的表情，讓他打，我扛。」<br><br>投手投出第一顆球，他奮力一揮。<br><br>那顆球飛得不高，但夠遠。<br><br>落地的時候，休息區的人全部衝出去。你站在原地沒有動，只是把帽子壓低了一點，怕鏡頭拍到。<br><br>因為你眼眶熱了。<br><br>不是為了這場勝利，是為了那個孩子——他剛剛完成的，是你年輕時沒能完成的事。<br><br>賽後訪問，記者問你：「教練，你覺得這支球隊最強的是什麼？」<br><br>你想了想。<br><br>「不是速度，也不是打擊。」<br><br>「是他們每一個人，身上的球衣，有台灣的重量，更有台灣的力量。」<br><br>回程的飛機上，大家都睡了。<br><br>距離台灣還很遠，但你卻睡不著。<br><br>你想到那些年，你每一次參加國家隊。你知道這會讓你那年的賽季比較辛苦，也知道可能會影響你的未來。<br><br>但你永遠義無反顧、全力以赴，就跟這些已經睡著的孩子一樣。<br><br>因為你知道，身上這件球衣代表著什麼。<br><br>而你把這件球衣傳承下去，就和前輩傳承給你一樣。`};
}
export function lateAnswerEnding(pos){
  const pitcher=pos==='P';
  const text=pitcher?`退役後，你沒有投入教職，也沒有進入球團。

你只是日以繼夜在思考，怎麼樣彌補你的遺憾。

其實你想做的事，只跟一件事有關。

二十二歲那年，你的手肘開始痛。

你去問教練，教練說：「還會痛就是還不夠強。」於是你多練了兩百顆。

你去給人推拿，推完當下很鬆，隔天更痛。

球團的隊醫看了一眼，說：「先冰敷觀察。」

然後，你動了手術，動了很多很多很多次手術。

你的球速回不去了，你的變化球再也不犀利了。

最後，你被下放，一個人在二軍球場的階梯上坐到天黑。

你不是不甘心自己輸給別人。你是不甘心——

你明明該有更好的成績，更好的生涯，你不比其他人差，但你比其他人還容易受傷。

你不知道為甚麼。

所以你決定了另外一條道路，或許可以讓其他人知道為甚麼的道路。

第一年，機構只有三個人、一台二手測力板、一個租來的鐵皮倉庫。

你去拜訪各級球隊，講了三十幾場，大部分的反應都一樣：

「以前我們也沒這些，還不是照樣打。」

「小朋友練球就好了啦，弄那麼複雜。」

有一次一個資深教練當面問你：「你成績後來那麼差，是因為沒有這個嗎？」

你的心刺痛了一下，然後笑了笑：「可能不是，但是如果是，我不想讓這些孩子跟我一樣。」

回程的高速公路上，你把車停在休息站，坐在方向盤前面很久很久。

第三年，開始有人上門。

大多不是球星。是那些手會痛、但不敢說的孩子。

因為在球場上，說痛是一件軟弱的事情、是會讓自己從此失去機會的事情。

你在牆上貼了一張紙，寫著八個字：

「說痛，不是軟弱。」

第五年，一個十七歲的投手來到實驗室。

他的球速很棒，高三就147公里，變化球犀利，是球隊的當家王牌。

你分析他的動作，發現無論球速、轉速都十分完美，但是他的肘部、髖部、力量的傳導，都透漏著滿滿的不協調感。

而那個動作模式，你感到有點熟悉。

你看著畫面上那副骨架旋轉、加速、拉扯——

那是之前的你。

你把他叫進來，跟他說：「這場比賽，你不要投。」

「我又不會痛。」

「你不會痛你就不會在我說原因之前，說你不會痛了。」

他低下了頭，表示會跟教練說明原因。

而過沒多久，你接到電話，那個教練大罵，是你毀掉了這個投手的生涯。

那天晚上你沒睡好。

因為你也不確定——你到底是在救他，還是在救當年沒有人救的自己。

又過了十年。

某天早上你在辦公室泡咖啡，電視轉播著大聯盟的比賽。

那個高中球速147公里的投手，現在是大聯盟的三號先發投手，球速已經到了154公里。

他還在投球。

主播說：「這位投手非常健康，沒有動過任何一次手術，是個標準的鐵人。」

你端著杯子站在那裡，看了很久，什麼也沒說。

你想到那天之後，那個孩子把自己泡進了訓練機構，你帶著他一步一步重建新的動作。

這件事永遠不會被寫進任何一篇報導裡——

沒有發生的傷，是不會有新聞的。

機構的門口，掛著一面很小的牌子。

不是隊徽，不是獎盃，是一張放大的舊照片：一個十九歲的投手，在紅土上舉起手，準備出手。

照片旁邊寫著一行字，很多人以為是勵志標語，只有你自己知道那是什麼意思：

「有些答案，來得太晚了。
但總比永遠不知道好。」

——你沒能成為最好的球員。
但你讓後面那些人，不必再靠運氣，才能好好打完一輩子的球。`:`你突然打不到球了。

一開始你只是覺得練習不夠，但不久後，你開始進入不間斷的傷痛，接著就是不斷打不到球。

每次受傷回歸後，你比誰都早進球場。你多加了兩百次揮棒、換過三支球棒、改過兩次站姿、看了幾百次錄影。

打擊教練說：「你重心跑掉了。」

為什麼會跑掉？

「就……感覺。多打就會回來。」

感覺。

你的職業生涯，最後就毀在這兩個字上。

因為感覺是抓不到的，感覺沒辦法練，感覺沒有人能告訴你它為什麼不見了。

最後，你好幾個球季出賽都沒有打超過一半。

曾經備受期待的強打少年，最後變成體弱中年。

離開球場那天，你自己把球具搬上車，關後車廂的時候，忽然很想問一句話——

問誰都好：

「我到底是哪裡不對？」

第一年，機構只有一個鐵皮倉庫、兩台高速攝影機、三個人。

你去各級球隊拜訪，講了三十幾場，反應大同小異：

「數據沒有用啦，多打就可以了。」

有一次一個資深教練當面問你：「你成績後來那麼差，是因為沒有這個嗎？」

你的心刺痛了一下，然後笑了笑：「可能不是，但是如果是，我不想讓這些孩子跟我一樣。」

回程的高速公路上，你把車停在休息站，坐在方向盤前面很久很久。

第三年，開始有人上門。

不是球星。是那些「莫名其妙變差了」的人。

那些每天最早到、最晚走，卻越練越差的人。那些被說「心理素質不夠」的人。那些在深夜傳訊息問你「前輩，我是不是不行了」的人。

你在牆上貼了一張紙，寫著八個字：

「不是你不夠努力。」

第五年，一個二十六歲的外野手走進實驗室。

他曾經是選秀第一輪，那年打擊率一成九。

他坐下來，第一句話是：「我什麼方法都試過了。」

你什麼也沒說，只是幫他貼上感測點，叫他揮十次。

螢幕跑出來的那一刻，你手指停在滑鼠上。

他的右腳踝，兩年前扭傷過。

傷早就好了。

至少所有人都這麼認為。

只是那隻腳踝的活動角度，比以前少了七度。

七度讓他的後腳沒辦法像以前一樣承住重量，讓他的骨盆在揮棒時早了一點打開。骨盆早了一點，肩膀就得撐久一點；肩膀撐不住，最後就只能靠手把棒子追回來。

七度。

一個沒有人量過、沒有人在乎、連他自己都忘記的七度。

你把螢幕轉向他。

「你沒有變差，你只是還在受傷。」

他愣住。

你搖了搖頭，請他過來看螢幕。

他看著螢幕，看了很久很久。

然後這個一百八十幾公分的男人，在你面前哭了出來。

不是因為找到了答案。

是因為終於有人告訴他：這不是他的錯。

你想到三十一歲的自己，在打擊籠裡一個人揮到半夜，一邊揮一邊罵自己不夠努力。

如果那時候有人幫你量過一次呢。

如果那時候有人跟你說「你的髖關節轉不過去」，而不是「你感覺跑掉了」呢。

你不知道。你永遠不會知道了。

你只能確定一件事——

從今天起，不會再有人抱著這個問題離開球場。

又過了幾年。

某個夏天的傍晚，你在辦公室整理報告，電視上轉播著一場職業賽。

三十四歲的外野手站上打擊區，賽季打擊率三成一。

主播說：「他生涯後期反而越打越好，真的很不簡單。」

球評接了一句：「他自己說過，是在二十六歲那年，重新學會怎麼用身體。」

你抬頭看了一眼，想到那之後，你們用盡了方法，才讓那個七度不再影響他的生涯。

那個七度，你們花了好久好久才把它修好。

這種事永遠不會有人知道是誰做的——

被救回來的生涯，不會有人替它辦記者會。

機構的走廊上，掛著一張很舊的照片。

一個年輕打者站在打擊區裡，重心壓得很低，眼睛盯著投手。

那是你二十四歲，那年你打了二十一支全壘打。

照片下面沒有寫成績，只寫了一行字：

「他當年不知道自己為什麼打得好，
所以後來也不知道自己為什麼打不好。」

新來的實習生問你，為什麼要掛一張這種照片。

你說：「提醒我，不要讓任何一個人，重複這句話。」

——你的生涯，結束在一個沒有答案的問題上。
而你用剩下的人生，把那個答案找了出來，交給了下一個人。`;
  return {title:'遲到的答案',body:text.trim().replace(/\r?\n\s*\r?\n/g,'<br><br>').replace(/\r?\n/g,'<br>')};
}
export const POST_CAREER_ENDINGS={
  coach:{title:'還在同一片草皮上',body:`球具掛上牆的那天，你以為告別就此完成。<br><br>隔年春訓，你卻換了一件寫著自己名字、卻沒有背號意義的球衣，重新走進熟悉的休息區。手套換成了記事本，揮棒換成了一句句在耳邊的提醒。<br><br>你會在深夜看完三十球的慢動作重播，只為了告訴某個菜鳥：「你的前腳，早了0.2秒。」<br><br>有人說教練是站在光後面的人。但當你看著那個曾經笨拙的孩子，在滿場歡聲中繞過本壘，你忽然明白——<br><br>你從來沒有離開過球場，只是換了一種方式，繼續打球。`},
  scout:{title:'在無人的看台上',body:`你的辦公室，是一張又一張空蕩蕩的鐵椅。<br><br>高中球場、乙組聯賽、鄉下的紅土球場。你帶著測速槍與一本翻爛的筆記本，跑遍那些沒有轉播、沒有掌聲的角落。<br><br>大多數時候，你什麼也沒找到。但偶爾，在某個午後的第七局，會有一顆球從陌生少年的手中飛出，讓你在筆記本上重重畫下一個圈。<br><br>沒有人會記得球探的名字。若干年後，當那個少年站上一軍投手丘，鏡頭只會拍到他。<br><br>但你會坐在電視機前，安靜地笑一下。<br><br>有些人負責發光，有些人負責——在天亮以前，先看見光。`},
  grassroots:{title:'紅土上的第一步',body:`你回到了故鄉的小學。<br><br>球隊只有十四個人，手套是別人捐的，午餐要靠家長輪流準備。你教他們的第一件事，不是揮棒，是把球具排整齊。<br><br>這裡不會有選秀，不會有合約，不會有滿場的加油聲。有的只是每天放學後那兩個小時，和一整片被夕陽曬得溫熱的紅土。<br><br>有些孩子會走得很遠，有些孩子明年就不打了。你都送到路口為止。<br><br>多年後，某個穿著職業球衣的年輕人，在採訪中被問到誰影響他最深。<br><br>他想了想，說出了一個沒有人聽過的名字。<br><br>那是你，還有那片，永遠等著下一批孩子的紅土。`},
  nextBase:()=>nextBaseEnding(S.pos),
  jerseyWeight:()=>jerseyWeightEnding(S.pos),
  lateAnswer:()=>lateAnswerEnding(S.pos),
  nextGame:()=>nextGameEnding(S.pos),
  otherAngle:{title:'另一個角度',body:`走進球場時，你還是逕直走向休息室，只是你身上穿的已經不是球衣了。<br>守衛看你一眼，什麼也沒問就讓你過去。你的證件掛在胸前，上面寫著「媒體」。<br>下午四點，打擊練習。<br>你站在護網後面，跟以前一樣看著球飛。差別只在於，現在你手上拿的是筆記本，穿的是西裝。<br>「前輩！」有人在你背後喊。是那個去年才升上一軍的內野手。<br>「手怎麼樣？」<br>「還好啦，就有點腫。」他把手舉起來給你看，指節有點變形。「教練說今天先讓我打 DH。」<br>你點點頭，在本子上寫了一行字。這是球評的工作——不是為了講出來，是為了知道「什麼時候不要講」。<br>你又晃去牛棚，跟投手教練閒聊三分鐘。你問今天誰不能用，他說了兩個名字，然後補一句：「別講喔。」<br>「我知道。」你說。你當然知道。你以前也是那個「別講喔」的人。<br>下午六點四十，播報室。<br>主播已經坐好了，看到你笑：「今天有料嗎？」<br>「有一點。但都不能講。」<br>主播笑了，他知道這句話的意思，他也不深問。<br>比賽開始。<br>一局上，第一棒打了一顆看似平凡的右外野飛球。<br>主播：「這只是個平凡的飛球，平凡的飛球，哇，出大牆！」<br>你：「這球仰角有點略高，但是球場裡面有風，把球的距離帶遠了。」<br>五局，滿壘。<br>主播：「這球呢？這球呢？」<br>你：「感覺很有機會，只是很可惜，有點切到棒頭了。」<br>你看著主播聲嘶力竭，而你只是從播報室看著那個你很熟悉的球場，只是用一個很不熟悉的角度。<br>七局，那個手指腫起來的內野手站上打擊區。<br>主播：「他今天打 DH，狀況看起來還不錯耶。」<br>你頓了半秒。<br>「嗯，不錯。」<br>球數兩好三壞，他咬中一顆外角速球，打向右外野，落地形成二壘安打。整個休息區跳起來。<br>主播：「這球！這球！漂亮！」<br>你在麥克風前笑了一下，說：「這球打得很好。」<br>你沒說的是：他今天連握棒都會痛，這支安打是他忍著打的。<br>有些事情不用說出來，才是對場上那個人最好的尊重。<br>九局結束。<br>你收好耳機，走出播報室，下樓的時候剛好遇到那個內野手，手上冰敷袋纏得像個粽子。<br>「前輩，我今天那支——」<br>「我知道。」你說，「打得很好。」<br>他愣了一下，然後笑得像個大學生。<br>隔天，有球迷剪了一段主播的播報精華，而後面有你那冷靜的評論，配字：<br>「這只是個平凡的飛球。」<br>底下最高愛心的留言寫著：<br>「主播講平凡，不一定平凡，但這個球評的每一句話，都像是預言家。」<br>——你不在場上了。<br>但你知道每一顆球，究竟平不平凡。`}
};
export const SECOND_CAREER_ENDINGS=[
  `你加入了乙組業餘棒球隊。平日上班、週末穿上球衣，去年在協會盃敲出再見安打的影片被瘋傳，底下最熱門的留言是：「這揮棒不像業餘的。」——因為本來就不是。你比誰都清楚，愛棒球不一定要靠它吃飯。`,
  `你考到了不動產營業員執照。帶看時爬六樓透天面不改色，客戶都說你氣場不一樣——十六歲就在幾千人面前投球的人，還會怕開價嗎？三年後你成了店裡的銷售王，名片頭銜下面偷偷印了一行小字：「前職業棒球選手」。`,
  `你跟著舅舅去做板模。工地的日子曬得比春訓還黑，但你的核心力量和不服輸讓老師傅都點頭。五年後你自己出來帶班，薪水不比二軍差，而且——你笑著說——這裡沒有人會把你下放。`,
  `你穿上襯衫走進辦公室，同事只知道你「以前有在打球」。直到公司壘球隊比賽那天，你一棒把球送出圍牆，全場安靜三秒。後來每年比賽，對手公司都會先問一句：「那個人今年還在嗎？」`,
  `你頂下一間早餐店，招牌取名「滿壘」。店裡掛著你高中的球衣，蛋餅煎得跟你的守備一樣扎實。附近的少棒隊員放學都來報到，因為老闆會一邊煎蘿蔔糕一邊講解怎麼看投手的放球點——加蛋不加價。`,
  `你回到母校當教練，月薪不高，但你把自己沒走完的路畫成地圖交給學弟。第七年，你帶的投手在選秀會上被第一輪指名，電視轉播帶到你的時候，你哭得比他還慘。`,
  `你創了業，做棒球訓練科技——用手機慢動作幫素人抓揮棒軌跡。第一年差點倒閉，第三年被運動中心整批採購。募資簡報的第一頁只有一句話：「我沒能站上去的舞台，我想讓更多人站上去。」`,
  `你考上了消防員。體能測驗全項第一，教官問你以前練什麼的，你說棒球。第一次出勤救人那晚，你突然明白：肩膀不能再投一百五，但還能扛著人走出火場——這雙手還是有用的。`
];
export function usesSecondCareerEnding(age){ return Number(age)<25; }
export const ADKING_FAN_COMMENT='打開電視每幾分鐘就要看到他一次，去超商也會看到他的臉，退休之後會不會更常出現呢？';
export function oldGhostLongCareerComment(pos){
  return `今年新人大物引退時，${pos==='P'?'先發投手':'第四棒'}{n}`;
}
export function postCareerEndingKeys(tiers,kids,internationalAppearances){
  const childCount=kids===undefined
    ?Math.max(0,(S.love&&S.love.kids)||0)+((S.love&&S.love.exes)||[]).reduce((n,ex)=>n+Math.max(0,ex.kids||0),0)
    :Math.max(0,Number(kids)||0);
  const internationalCount=internationalAppearances===undefined
    ?Math.max(0,Number(S.intlCount)||0)
    :Math.max(0,Number(internationalAppearances)||0);
  const proStar=!!tiers.NPB||!!tiers.MLB||!!(tiers.CPBL&&tiers.CPBL.i<=1);
  const keys=proStar?['coach','scout','nextGame','otherAngle']:['coach','scout','grassroots','nextGame','otherAngle'];
  if(childCount>0)keys.push('nextBase');
  if(internationalCount>0)keys.push('jerseyWeight');
  /* 符合傷病條件時放入兩份，讓本結局相對每個其他結局具有兩倍抽選權重。 */
  if((S.traits&&S.traits.glass)||Number(S.tjCount||0)>=3)keys.push('lateAnswer','lateAnswer');
  return keys;
}
export function postCareerEnding(tiers,roll){
  const keys=postCareerEndingKeys(tiers),r=roll===undefined?R():roll;
  const ending=POST_CAREER_ENDINGS[keys[Math.min(keys.length-1,Math.floor(Math.max(0,r)*keys.length))]];
  return typeof ending==='function'?ending():ending;
}
export function retireScene(tiers){
  /* tiers: {CPBL:{i,sc},NPB:...,MLB:...} 有出賽才有 */
  /* 生涯代表聯盟＝出賽最久的頂級聯盟;分級取生涯最佳(i 最小) */
  let lg=bucketOf(S.lv), bestI=4;
  const order=['MLB','NPB','CPBL'];
  order.forEach(b=>{ if(tiers[b]&&tiers[b].i<bestI){ bestI=tiers[b].i; } });
  /* 代表聯盟:在最佳分級的聯盟中,取出賽年資最多者 */
  let repYr=-1;
  order.forEach(b=>{ if(tiers[b]&&tiers[b].i===bestI){ const yy=S.stats[b]?S.stats[b].yr:0; if(yy>repYr){repYr=yy;lg=b;} } });
  const t=tiers[lg], i=t?t.i:4, yr=S.year;
  let txt='';
  if(lg==='CPBL'){
    if(i===0)txt=`引退戰選在<b class="hl">臺北大巨蛋</b>。四萬人把巨蛋塞得水洩不通，外野看板掛滿你生涯每一年的照片。九局下最後一個打席結束，全場燈光暗下，只剩一道追光打在你身上——隊友哭成一團，對手全員列隊脫帽，天團在二壘後方唱起你的應援曲改編的慢版。你繞場一周，把手套輕輕放在本壘板上。轉播單位說，這是中職史上收視最高的一場例行賽。`;
    else if(i===1)txt=`球團為你舉辦了引退儀式。主場滿場，大螢幕播放生涯回顧影片，從高中木棒聯賽夢碎到${S.pos==='P'?'職棒初登板':'職棒初安打'}，一幕一幕。老隊友從各地回來替你獻花，總教練在致詞時哽咽到說不下去。最後你脫下球帽向四個方向的看板深深鞠躬，應援團的鼓聲直到你走進休息室都沒有停。`;
    else if(i===2)txt=`${S.pos==='P'?'球季最後一個主場日，球團安排你先發登板。投完第一局後被換下場，全場觀眾起立鼓掌，隊友在休息室門口排成兩排跟你擊掌。沒有煙火，沒有演唱會，但看台上有人拉起手寫布條：「謝謝你投出的每一顆全力的球」。':'球季最後一個主場日，球團安排你先發打第一棒。第一個打席結束後被換下場，全場觀眾起立鼓掌，隊友在休息室門口排成兩排跟你擊掌。沒有煙火，沒有演唱會，但看台上有人拉起手寫布條：「謝謝你的每一次全力奔跑」。'}`;
    else txt=`你在球團官網的一則新聞稿裡宣布引退。發文的那個晚上，還是有幾十個老球迷湧進你的社群留言：「辛苦了」。職業棒球就是這樣——不是每個人都有儀式，但每個認真打過球的人，都有人記得。`;
  }else if(lg==='NPB'){
    if(i<=1)txt=`球團為你安排了<b class="hl">引退試合</b>。最後一個守備半局結束，你被單獨留在場上，兩軍球員沿著邊線列隊。花束贈呈、監督擁抱、隊友把你高高拋起——三次、四次、五次的<b class="hl">胴上げ</b>。你抱著花束繞場一周，看台上的日本球迷舉著用中文寫的「謝謝」毛巾。引退記者會上你說：「能在這裡打球，是我人生最驕傲的事。」隔天所有體育報頭版都是你被拋在空中的那張照片。`;
    else if(i===2)txt=`最終戰賽後，球團在場邊為你舉行了簡短的引退セレモニー：花束、紀念框裱的球衣、與監督的合影。廣播念出你的生涯成績時，客場球迷也起立鼓掌。記者會上有記者用不太標準的中文問你「還會回來嗎」，你笑著點頭。`;
    else txt=`你透過球團發表引退聲明。整理置物櫃的那天，翻譯陪你走完最後一段球員通道，警衛伯伯跟你深深鞠了一躬。異鄉打拚的日子結束了，行李箱裡裝著幾件捨不得丟的練習衫。`;
  }else if(lg==='MLB'){
    if(i<=1)txt=`主場最終戰，你最後一個打席前，全場觀眾起立鼓掌長達三分鐘，主審退到一旁靜靜等待。打席結束，你被換下場，隊友全部走出休息室與你擁抱，大螢幕播放致敬影片——<b class="hl">Curtain Call</b>，你走出休息室向全場揮帽致意兩次。賽後記者會擠滿各國媒體，台灣的轉播單位做了整夜特別節目。`;
    else if(i===2)txt=`球隊在你生涯最後一個系列賽前於場邊舉行了簡單儀式：致贈裱框球衣與紀念浮雕，隊友列隊擊掌。當地報紙寫道：「他不是超級巨星，但他是每個總教練都想要的那種球員。」`;
    else txt=`你在社群媒體上發了一張空蕩球場的照片，配文只有一句英文：「Thank you, baseball.」按讚數在台灣時間的深夜默默破了十萬。`;
  }else{
    txt=`沒有鎂光燈。你把釘鞋擦乾淨放進袋子，跟隊友一一擁抱，走出球場時回頭看了記分板最後一眼。二軍球場的夕陽跟十年前一樣好看。`;
  }
  card('gold','引退之日',txt);
  if(S.traits.mrteam){
    const mrTitle=(teamNick(S.mrTeamName||'')||'球隊')+'先生・背號退休';
    card('gold','引退兩年後・'+mrTitle,`引退兩年後，你重新穿上了球衣，踏上了熟悉的主場。當你往投手丘一步步走去，觀眾的歡呼聲幾乎讓整個球場震動。當你踏上了投手板，你接過了主持人手中的球與手套，就像你做過幾萬次的那樣，把球往昔日的隊友手套裡扔去，雖然已經沒有了球速，但你聽到球進手套的聲音，卻是無比清脆。<br><br>你的背號 <b class="hl">#${S.jersey}</b> 被掛在了牆壁上，你曾經用表現守護著這座球場，而現在你是這座球場上永遠不可或缺的榮耀。`);
  }
  /* 名人堂票選(可多聯盟並存) */
  const hofs=[], firstBallotLeagues=[];
  const HOF_CFG={CPBL:{n:'中華職棒名人堂',wait:5,total:132,lg:'中職'},NPB:{n:'日本野球殿堂',wait:5,total:326,lg:'日職'},MLB:{n:'美國棒球名人堂',wait:5,total:389,lg:'大聯盟'}};
  ['CPBL','NPB','MLB'].forEach(b=>{ const t=tiers[b]; if(!t)return;
    const cfg=HOF_CFG[b];
    if(t.i===0){
      /* 第一年當選門檻:評價分明顯超標才 first-ballot,否則需等 N 年。
         門檻必須用 tierOf() 實際判定時的那條線(t.hofTh = 7500 × posTierK × HOF_TH_K)，
         不能用 TIER_TH[b][0] 的裸值 7500——兩把尺分岔會直接壞掉：
         大聯盟指定打擊的 posTierK 是 1.221，名人堂線 9158，但裸值算出的首輪線只有
         7500×1.2＝9000，比名人堂線還低，於是「只要進得了名人堂就必定首輪入選」，
         實測大聯盟／日職指定打擊的首輪率都是 100%，而捕手、游擊只有 41～53%——
         最好混的守位反而穩拿最稀有的隱藏素質。得票率的 rawPct 同理，用裸值會讓
         門檻被上調的守位得票率整體虛高。 */
      const th=t.hofTh||TIER_TH[b][0];
      /* v1.5.9 三聯盟統一 1.527（舊值 1.12／1.12／1.2）。以完整流程模擬反解：
         「歷史級球星 = 全部名人堂成員的 25%」。聯盟間不再分別給倍率——聯盟難度差
         已經由 LEAGUE_K 折算過一次，這裡再分一次等於重複計價。 */
      const fbMult=1.527;
      const firstNow = t.sc>=th*fbMult;
      /* v1.6.2 入選年份改由實力決定，不再是 ri(2,6) 的均勻亂數。
         舊版的因果是反的：先隨機抽第幾年，再讓票數被那個隨機值每年扣 4 個百分點——
         現實是「票數高所以早入選」，舊版是「隨機抽到早入選所以票數高」。
         而且亂數的影響力壓過實力：ri(2,6) 造成 16 個百分點的擺盪，實力項
         (sc-th)/th*40 要超標 40% 才追得上，而超標 40% 以內的人佔名人堂的大多數。
         結果是超標 2% 的人可能抽到第 2 年、超標 35% 的人可能抽到第 6 年。
         現在 r = 評價分 ÷ 該生涯實際適用的名人堂線：
           r >= fbMult          → 第 1 年（首輪入選）
           r <  fbMult          → t=(r-1)/(fbMult-1)，第 round(7 − t×5) 年
         壓線者等 7 年、接近首輪線者等 2 年，苦等終於有苦等的樣子。
         ±1 年的抖動保留重玩變化，但不再主導結果。 */
      const meritT = Math.max(0, Math.min(1, (t.sc/th - 1)/(fbMult - 1)));
      const ballotYr = firstNow ? 1
        : Math.max(2, Math.min(8, Math.round(7 - meritT*5) + ri(-1,1)));
      if(firstNow)firstBallotLeagues.push(cfg.lg);
      /* 得票率是離散量：先決定「票數」，再由票數反算顯示的百分比，兩者永遠一致。
         舊版方向相反——先算連續的 pct、再四捨五入成票數，於是畫面上會出現 131 票
         卻標 99.1%（131/132 實為 99.2%）；而且 99.1% 這個上限在三個聯盟都不對應
         任何一個整數票數（中職 131 票=99.24%、132 票=100%），本身就是憑空的數字。
         下限改用無條件進位，確保票數真的跨過 75% 門檻（舊版日職 245/326=75.15%
         是靠四捨五入擦邊算過）；上限為「總票數 −1」，即差一票的傳奇，不開放滿票。 */
      /* v1.6.2 得票率同樣改由實力決定，不再倒過來被入選年份扣分。
         舊版另一個問題是 75% 保底吃掉了低段的資訊：壓線者算出來常是 70 幾趴，
         一律被拉到 75.x%，於是「差一點點入選」和「穩穩入選」顯示同一個數字。
         現在直接把 r 映射到票數區間，保底只當防呆而不再是主要成因：
           首輪（r>=fbMult）：88% 起跳，每超標 1% 再加 0.25 個百分點，上限 99%
           非首輪           ：75.5% + t×11 → 壓線 75.5%、接近首輪線 86.5% */
      const rawPct = firstNow
        ? Math.min(99, 88 + (t.sc/th - fbMult)*25 + R()*2)
        : (75.5 + meritT*11 + (R()*3 - 1.5));
      const minVotes=Math.ceil(cfg.total*0.75), maxVotes=cfg.total-1;
      const votes=Math.max(minVotes,Math.min(maxVotes,Math.round(cfg.total*rawPct/100)));
      const pctTxt=(votes/cfg.total*100).toFixed(1);
      if(!S.hofInfo)S.hofInfo=[]; S.hofInfo.push({lg:cfg.lg,yr:ballotYr,pct:pctTxt}); /* 供結算圖 */
      const cap=capTeam(b), phr=posLegendPhrase(b);
      const oneShort=votes===maxVotes?'<b class="hl">全聯盟只有一張票沒有投給你。</b>':'';
      hofs.push(`引退 <b class="hl">${cfg.wait}</b> 年後（${yr+cfg.wait} 年）進入候選，於<b class="hl">第 ${ballotYr} 年投票</b>以 <b class="hl">${votes}</b>／${cfg.total} 票（得票率 ${pctTxt}%）榮登<b class="hl">${cfg.n}</b>——你以 <b class="hl">${cap||'—'}</b> 的代表球員身分${phr}留名。${ballotYr===1?'<b class="hl">一票入魂，首輪即殿堂。</b>':''}${oneShort}名匾上的隊徽，是 ${cap||'—'}。`);
    }else if(t.i===1){
      /* 落選同樣以票數為準：門檻票數減 1 就是「最接近的一次」的上限。
         v1.6.2 最高得票率改由「差多遠」決定，不再是固定的 55~72% 亂數。
         舊版讓差一分落選的人和差三千分的人顯示同一個區間，一個明星段中緣的球員
         也可能看到「最高曾獲得 72%」，那個數字會誤導玩家以為自己差一點點。
         near = 評價分 ÷ 名人堂線（0~1）：貼著線的人逼近門檻票數 −1，
         離線很遠的人停在三四成。入圍年數也跟著差距走，越接近的人被討論越久。 */
      const gateVotes=Math.ceil(cfg.total*0.75);
      const near=Math.max(0,Math.min(1,t.sc/(t.hofTh||TIER_TH[b][0])));
      const bestPct=30+near*44+(R()*4-2);          /* 0.55 → 約 52%；0.99 → 約 73% */
      const bestVotes=Math.max(1,Math.min(gateVotes-1,Math.round(cfg.total*bestPct/100)));
      const tries=Math.max(2,Math.min(10,Math.round(2+near*7)+ri(-1,1)));
      hofs.push(`你連續 ${tries} 年入圍${cfg.n}票選，最高曾獲得 <b>${bestVotes}</b>／${cfg.total} 票（${(bestVotes/cfg.total*100).toFixed(1)}%），可惜始終未能跨過 75% 門檻（需 ${gateVotes} 票）。`);
    } });
  if(firstBallotLeagues.length){
    const old=Array.isArray(S.legendLeagues)?S.legendLeagues:[];
    S.legendLeagues=[...new Set([...old,...firstBallotLeagues])];
    S.legendLeague=S.legendLeagues[0]||''; /* 舊顯示欄位相容 */
    S.traits.legend=true;
  }
  if(hofs.length)card('gold','名人堂票選',hofs.join('<br><br>'));
  firstBallotLeagues.forEach(lg=>card('gold','隱藏屬性解鎖：'+lg+'歷史級球星',
    `第一年投票就披上名人堂金袍——你不只是進了殿堂，你<b class="hl">定義了一個時代</b>。這個名字，會被寫進${lg}的歷史課本。`));
}
export function endGame(reason){
  S.done=true; actClear();
  /* 引退前可能剛結清剩餘合約；所有款項入帳後再刷新記分板，與結算共用同一個 S.salary。 */
  board(2);
  divider('生涯終幕');
  card('info','引退',reason);
  tlNote(5,'引退'); careerTimelineCard();
  /* 各聯盟數據與評價 */
  let tables='',evals=[],best=99; const tiersByLg={};
  ['MLB','NPB','CPBL','MINOR'].forEach(b=>{ if(S.stats[b]){ tables+=statTable(b);
    if(b!=='MINOR'){ const t=tierOf(b); tiersByLg[b]=t; evals.push(`<span class="tag">${t.name}</span>（評價分 ${t.sc}）`); best=Math.min(best,t.i); } } });
  if(best===99)best=4;
  retireScene(tiersByLg);
  /* 成就門檻:中職名人堂 或 站上日職/大聯盟 */
  const reachedTop = (tiersByLg.CPBL&&tiersByLg.CPBL.i===0) || !!S.stats.NPB || !!S.stats.MLB;
  if(reachedTop){
    /* 小學校之光:T3 弱旅出身 */
    if(!S.traits.smallschool && S.hsTier===3){ S.traits.smallschool=true;
      card('gold','隱藏特性：小學校之光',`雖然不是出自名門，你還是站上了頂級舞台。曾經有個叫做魚主播的前輩，生涯幾次大傷後，回來學校成為你的教練。他說他見證過職棒的殘酷，但同時也看過夢想的璀璨。他告訴你，擁有健康的身體以及努力的態度，會是成功的重要條件。你做到了，你把你的學校帶到了世界，讓大家知道，雖然不是名門，但他們的教育，讓你成為了最好的球員。`); }
    /* 努力仔:初始潛力總和偏低(投手≤237/野手≤469) */
    const grindTh = S.pos==='P'?237:469;
    if(!S.traits.grinder && (S.potSum0||999)<=grindTh){ S.traits.grinder=true;
      card('gold','隱藏特性：努力仔',`天賦平庸的球員千千萬萬，能走到這裡的卻寥寥無幾。你突然想到，曾經有個叫做西行寺幽幽子的前輩，他扛著不高的天賦，扛著大傷，仍然成為了大聯盟的明星。他曾經鼓勵過你，而你現在也走上他的道路，比別人更努力、更幸運。你們把汗水熬成天賦，最後成為了標竿。`); }
  }
  /* 逐年成績年表 (分為業餘與職業) */
  if(S.log.length){
    const amaLogs = S.log.filter(r => !r.st);
    const proLogs = S.log.filter(r => r.st);
    if(amaLogs.length > 0){
      const amaRows = amaLogs.map(r=>`<tr><td style="white-space:nowrap">${settlementYearHTML(r.y)}</td><td style="white-space:nowrap">${r.age}</td><td style="text-align:left;white-space:nowrap">${r.tm}</td><td style="text-align:left;font-size:11px;${r.inj?'color:var(--bad);font-weight:700;':''}">${r.line}</td></tr>`).join('');
      card('','生涯年表（業餘成績）',`<table class="fin"><tr><th>年度</th><th>齡</th><th style="text-align:left">球隊</th><th style="text-align:left">成績</th></tr>${amaRows}</table>`);
    }
    if(proLogs.length > 0){
      const isP = S.pos === 'P';
      const head = isP
        ? `<tr><th>年</th><th>齡</th><th style="text-align:left">球隊</th><th>G</th><th>IP</th><th>W</th><th>L</th><th>SV</th><th>HLD</th><th>SO</th><th>BB</th><th>ERA</th><th>WHIP</th></tr>`
        : `<tr><th>年</th><th>齡</th><th style="text-align:left">球隊</th><th>G</th><th>PA</th><th>AVG</th><th>OBP</th><th>SLG</th><th>OPS</th><th>H</th><th>HR</th><th>RBI</th><th>BB</th><th>SB</th><th>DEF</th></tr>`;
      const rows = proLogs.map(r => {
        const cS = r.inj ? 'color:var(--bad);font-weight:700;' : '';
        const s = r.st || {G:0,PA:0,AB:0,H:0,HR:0,RBI:0,SB:0,BB:0,W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,avg:0,era:0,WHIP:0,DEF:0};
        if(isP){
          const era = s.IP>0 ? baseballERA(s).toFixed(2) : '-';
          const whip = s.IP>0 ? baseballWHIP(s).toFixed(2) : '-';
          return `<tr style="${cS}"><td>${settlementYearHTML(r.y,proChampionshipYear(r.y))}</td><td>${r.age}</td><td style="text-align:left;white-space:nowrap">${r.tm}</td><td>${s.G}</td><td>${fmtIP(s.IP)}</td><td>${s.W}</td><td>${s.L}</td><td>${s.SV||0}</td><td>${s.HLD||0}</td><td>${s.SO}</td><td>${s.BB||0}</td><td>${era}</td><td>${whip}</td></tr>`;
        } else {
          const obpN = s.PA>0 ? (s.H+s.BB)/s.PA : 0;
          const slgN = slgOf(s);
          const avg = s.AB>0 ? (s.H/s.AB).toFixed(3).replace(/^0/,'') : '-';
          const obp = s.PA>0 ? obpN.toFixed(3).replace(/^0/,'') : '-';
          const slg = s.AB>0 ? slgN.toFixed(3).replace(/^0/,'') : '-';
          const ops = s.AB>0 ? (obpN+slgN).toFixed(3).replace(/^0/,'') : '-';
          return `<tr style="${cS}"><td>${settlementYearHTML(r.y,proChampionshipYear(r.y))}</td><td>${r.age}</td><td style="text-align:left;white-space:nowrap">${r.tm}${r.p?"·"+r.p:""}</td><td>${s.G}</td><td>${s.PA}</td><td>${avg}</td><td>${obp}</td><td>${slg}</td><td>${ops}</td><td>${s.H}</td><td>${s.HR}</td><td>${s.RBI}</td><td>${s.BB||0}</td><td>${s.SB}</td><td>${s.DEF>0?'+':''}${s.DEF||0}</td></tr>`;
        }
      }).join('');
      card('','生涯年表（職業成績）',`<table class="fin">${head}${rows}</table>`);
    }
  }
  let intlTable='';
  if(S.intlCount>0){ const IS=S.intlStat;
    const il=S.intlLog||[];
    const walks=st=>Number.isFinite(st&&st.BB)?Math.max(0,Math.round(st.BB)):
      (Number.isFinite(st&&st.PA)&&Number.isFinite(st&&st.AB)?Math.max(0,Math.round(st.PA-st.AB)):0);
    const totalBB=Number.isFinite(IS.BB)?Math.max(0,Math.round(IS.BB)):il.reduce((n,r)=>n+walks(r.st),0);
    if(S.pos==='P'){
      const rows=il.map(r=>{ const st=r.st, era=RP_F2(baseballERA(st)); return `<tr><td>${settlementYearHTML(r.year,r.rank==='冠軍')}</td><td style="text-align:left;white-space:nowrap">${r.name}</td><td>${r.rank}</td><td>${st.G}</td><td>${fmtIP(st.IP)}</td><td>${st.W}</td><td>${st.SV}</td><td>${st.SO}</td><td>${walks(st)}</td><td>${era}</td></tr>`; }).join('');
      const era=RP_F2(baseballERA(IS));
      intlTable=`<h4 style="margin:12px 0 4px">國際賽逐屆成績（中華隊 ${S.intlCount} 屆）</h4><table class="fin"><tr><th>年度</th><th>賽事</th><th>結果</th><th>G</th><th>IP</th><th>W</th><th>SV</th><th>SO</th><th>BB</th><th>ERA</th></tr>${rows}<tr><th colspan="3">國際賽通算</th><td>${IS.G}</td><td>${fmtIP(IS.IP)}</td><td>${IS.W}</td><td>${IS.SV}</td><td>${IS.SO}</td><td>${totalBB}</td><td>${era}</td></tr></table>`;
    } else {
      const rows=il.map(r=>{ const st=r.st, avg=st.AB>0?(st.H/st.AB).toFixed(3).replace(/^0/,''):'-'; return `<tr><td>${settlementYearHTML(r.year,r.rank==='冠軍')}</td><td style="text-align:left;white-space:nowrap">${r.name}</td><td>${r.rank}</td><td>${st.G}</td><td>${st.PA}</td><td>${avg}</td><td>${st.H}</td><td>${st.HR}</td><td>${st.RBI}</td><td>${walks(st)}</td></tr>`; }).join('');
      const avg=IS.AB>0?(IS.H/IS.AB).toFixed(3).replace(/^0/,''):'-';
      intlTable=`<h4 style="margin:12px 0 4px">國際賽逐屆成績（中華隊 ${S.intlCount} 屆）</h4><table class="fin"><tr><th>年度</th><th>賽事</th><th>結果</th><th>G</th><th>PA</th><th>AVG</th><th>H</th><th>HR</th><th>RBI</th><th>BB</th></tr>${rows}<tr><th colspan="3">國際賽通算</th><td>${IS.G}</td><td>${IS.PA}</td><td>${avg}</td><td>${IS.H}</td><td>${IS.HR}</td><td>${IS.RBI}</td><td>${totalBB}</td></tr></table>`;
    }
  }
  card('','生涯累積數據',(tables||'<p>（無職業層級出賽紀錄）</p>')+intlTable);
  if(evals.length)card('gold','生涯評價',evals.join('<br>'));
  /* 結算排序：名人堂 → 通算／各聯盟里程碑 → 國家隊 → MLB → NPB → CPBL → 業餘。 */
  const settlementItems=careerMilestones().concat(honorGroups().map(honorText));
  const honorsHTML=settlementItems.length?settlementItems.map(x=>'· '+x).join('<br>'):'（生涯未獲得任何獎項或里程碑）';
  card(settlementItems.length?'gold':'','獎項、大賽與里程碑',honorsHTML);
  /* 特質與薪資 */
  const tr=[];
  [...TRAIT_KEYS.pos,...TRAIT_KEYS.neg].filter(k=>S.traits[k]).sort((a,b)=>traitColorRank(a)-traitColorRank(b))
    .forEach(k=>{ traitNames(k).forEach(name=>tr.push(`<span class="tag" style="${traitTagStyle(k)}">${name}</span>`)); });
  (S.removed||[]).forEach(lbl=>tr.push(`<span class="tag" style="text-decoration:line-through;opacity:.4;color:#8a8a8a;border-color:#4a4a4a">${lbl}</span>`));
  const lv=S.love;
  const cur=lv.st==='married'?`老婆 ${lv.partner}（${lv.kids}）`:lv.st==='dating'?`交往中 ${lv.partner}（${lv.dyrs||0} 年）`:lv.st==='divorced'?'離婚':'未婚';
  const exStr=lv.exes.length?`｜前妻 ${lv.exes.map(e=>`${e.name}（${e.kids}）`).join('、')}`:'';
  const totKids=lv.kids+lv.exes.reduce((t,e)=>t+e.kids,0);
  card('','生涯檔案',`隱藏素質：${tr.join(' ')||'（無）'}<br>家庭：${cur}${exStr}｜子女共 ${totKids} 人${lv.affairs?`｜外遇 ${lv.affairs}(${lv.caught})`:''}<br>國際賽出賽：${S.intlCount} 次｜生涯大傷：${S.bigInj} 次${S.pos==='P'?`｜手肘危機：${S.tjCrises||0} 次｜Tommy John 手術：${S.tjCount} 次`:''}<br>生涯總薪資：<b class="hl" style="font-size:18px">${fmtMoney(Math.round(S.salary))}</b> 台幣`);
  /* 球迷留言 */
  const pool=FAN[best].filter(p=>S.pos!=='P'||!p.includes('代打人生')); const picks=[];
  while(picks.length<3&&pool.length)picks.push(pool.splice(Math.floor(R()*pool.length),1)[0]);
  /* 盤子留言:低聯盟明星以上,旅外到更高聯盟卻淪替補/邊緣 */
  { const LGR={CPBL:0,NPB:1,MLB:2}, CTY={CPBL:'台灣',NPB:'日本',MLB:'美國'};
    ['CPBL','NPB','MLB'].forEach(low=>{ ['CPBL','NPB','MLB'].forEach(high=>{
      if(LGR[high]>LGR[low] && tiersByLg[low] && tiersByLg[high] && tiersByLg[low].i<=1 && tiersByLg[high].i>=3){
        picks.push(`在${CTY[low]}是${LG_N[low]}的招牌，到了${CTY[high]}的${LG_N[high]}卻完全打不出來——「這人是誰？」當地球迷一臉問號，簽他的球團真是盤子`);
      }
    }); });
  }
  if(S.traits.glass)picks.push('他甚麼都好，只是真的太痛了，沒有那些傷他會更好的，好可惜');
  if(S.traits.iron)picks.push('鐵人謝幕。我以為今年狀元退休的時候還可以看到{n}打球');
  if(S.traits.oldghost){
    const oldGhostFans=[
      '過去是他的、現在是他的、未來還是他的。',
      oldGhostLongCareerComment(S.pos),
      '老鬼已經擋了別人快20年了，還要擋這些年輕人多久？'
    ];
    picks.push(oldGhostFans[Math.floor(R()*oldGhostFans.length)]);
  }
  if(S.traits.genius&&best<=1)picks.push('學生時代就是天才，還好沒有養壞，真的打出來了');
  if(S.honors.some(h=>h.includes('經典賽冠軍')))picks.push('經典賽奪冠那一夜，全台灣都沒睡。謝謝你');
  if(S.love.caught)picks.push('球打得還可以啦，但私生活真的有夠亂的，新聞比他的嗨賴還多');
  if(S.traits.scum)picks.push('實在很不想恭喜他引退，想到他做過的事情，吼，想到就氣。');
  if(S.traits.franchise)picks.push(S.franchiseActive?'一隊一人，退休號碼準備掛上去了。謝謝你留下來':'雖然你離開了，但還是謝謝你那段時間帶給我們球隊的希望');
  if(S.traits.legend)picks.push('這種千年一遇的球員，能夠看到他的比賽，真的是最幸福的事情');
  if(S.traits.intlace)picks.push('穿上國家隊球衣的那個男人，永遠的國家英雄');
  if(S.traits.taiwan)picks.push('六度披上國家隊戰袍，從不推辭。他比劃胸口的那一幕，我手機桌布放到現在');
  if(S.traits.disc)picks.push('自律到可怕，凌晨四點的球場都認得他');
  if(S.traits.favorite)picks.push('他真的很有教練愛欸，我一度懷疑他有總A裸照');
  if(S.traits.cancer)picks.push('真的是休息室毒瘤，巨嬰就趕快退休吧');
  if(S.traits.thief)picks.push('被這個小倫倫了好幾年，打不好還是有高薪，真的有夠爽');
  if(S.traits.mrteam)picks.push('十五年只為一隊，'+(teamNick(S.mrTeamName||'')||'')+'先生這個稱號，他當之無愧');
  if(S.traits.confidante)picks.push('場上叱吒風雲，感情跟我一樣，55555');
  if(S.traits.smallschool)picks.push('從那種小學校打到職業，這故事夠拍一部電影了');
  if(S.traits.grinder)picks.push('沒什麼天分卻拼到這種成就，這種球員最讓人尊敬');
  if(S.traits.goldcloth)picks.push('我愛台中猛獁，不離不棄，( ￣□￣)/喔~~喔喔~~喔喔~~喔喔~猛瑪');
  if(S.traits.phoenix)picks.push('從手術台爬回來還能拿獎，這種心臟是鈦合金做的吧');
  if(S.traits.onetool&&S.toolRole)picks.push(`那招${S.toolRole}真的無解，關鍵時刻換他上場就對了`);
  if(S.traits.clutch)picks.push('大場面先生，越關鍵的時刻越信任他');
  if(S.traits.championmaker)picks.push('他走到哪裡就贏到哪裡，優勝請負人真的不是叫假的');
  if(S.traits.adking)picks.push(ADKING_FAN_COMMENT);
  if(S.love.st==='married'&&S.love.kids>=2)picks.push('引退後好好陪家人吧，孩子們等你很久了');
  card('info','球迷看板・引退串',picks.map(p=>'「'+p.replace(/{n}/g,S.name)+'」').join('<br>'));
  let endingForShare;
  if(usesSecondCareerEnding(S.age)){
    const second=SECOND_CAREER_ENDINGS[Math.floor(R()*SECOND_CAREER_ENDINGS.length)];
    const body=second.replace(/{n}/g,S.name)+`<br><br><span class="sub">離開球場的人生，也是人生。${S.name}，辛苦了。</span>`;
    endingForShare={title:'第二人生',body};
    card('gold','第二人生',body);
  }else{
    const ending=postCareerEnding(tiersByLg);
    endingForShare=ending;
    card('gold','退役後・〈'+ending.title+'〉',ending.body);
  }
  /* 一鍵分享 */
  const sh=document.createElement('div'); sh.className='card share-career';
  sh.innerHTML=`<div class="share-career-title">分享這段生涯</div>
    <div class="row2 share-career-actions">
      <button class="btn main" id="sh-img"><i class="ph-fill ph-image-square" aria-hidden="true"></i>產生結算圖</button>
      <button class="btn" id="sh-url"><i class="ph-bold ph-link" aria-hidden="true"></i>複製重播連結</button>
    </div>`;
  $('log').appendChild(sh);
  sh.querySelector('#sh-img').onclick=()=>shareImageSheet(evals,picks,endingForShare);
  sh.querySelector('#sh-url').onclick=e=>{
    const btn=e.currentTarget;
    const url=OFFICIAL_URL+'?seed='+SEED;
    const okmsg=()=>{btn.textContent='已複製';setTimeout(()=>btn.innerHTML='<i class="ph-bold ph-link" aria-hidden="true"></i>複製重播連結',1600);};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(url).then(okmsg,()=>prompt('手動複製連結：',url));
    else prompt('手動複製連結：',url);
  };
  choose('',[
    {t:'<i class="ph-fill ph-play" aria-hidden="true"></i>開啟新的人生（新種子）',main:true,f:()=>{location.href=location.pathname;}},
    {t:'用同一個種子重來',s:'seed: '+SEED,f:()=>{location.href=location.pathname+'?seed='+SEED;}}]);
  /* 結算定錨:蓋過預設的捲到底,把「生涯終幕」分界線置中——上半屏留給引退當下的
     年末事件,下半屏是結算第一行。block:'start' 會把分界線整個藏進 sticky 的 #board
     後面(量測:標題 top=0、頂欄 bottom=173,最後一張年末卡在 -85~-10px 畫面外)。 */
  setTimeout(()=>{ try{
    const heads=document.querySelectorAll('.yr-head');
    for(const h of heads){ if(h.textContent==='生涯終幕'){ h.scrollIntoView({behavior:'auto',block:'center'}); break; } }
  }catch(e){} }, 250);
}
