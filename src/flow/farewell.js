import {S} from '../core/state.js?v=2.1.6';
import {R, clamp} from '../core/rng.js?v=2.1.6';
import {LV, PATHS} from '../data/teams.js?v=2.1.6';
import {card, board} from '../ui/dom.js?v=2.1.6';
import {pitG, pitH, pitBB, ipFromOuts, outsFromIP, statLine, normalizeBatterStats, normalizePitchingStats} from '../engine/season.js?v=2.1.6';
import {ovr, ovrPit, ovrBat} from '../engine/ability.js?v=2.1.6';
import {buyoutRemaining, daibaFarewell} from '../engine/contract.js?v=2.1.6';
import {endGame} from '../ui/retire.js?v=2.1.6';
/* ================= 主動引退：引退季／一日球員約 =================
   春訓「身體大不如前」選擇引退時分兩條路，看的是能力而不是當下層級：
   ・能力還站得上所屬體系的一軍 → 宣布這是最後一年，把一半機會讓給二軍年輕球員（出賽、打席五折，
     無條件進位），打完這季後直接進引退結算。
   ・能力只剩二軍水準、但曾經在這個體系的一軍出賽過 → 球團送上一紙「一日球員約」，回一軍做最後一次出賽：
     投手投一局、野手一個打席、二刀流一整場（先發第一局＋一個打席）。告別戰照實記進該聯盟的生涯數據，
     並在生涯年表多一列；但不算一個球季（不加年資、球隊年數、守位／角色年數）。
   ・從沒站上過這個體系的一軍 → 沒有「回到一軍」可言，維持原本的引退記者會。 */
export function farewellTopLv(org=S.org){ const p=PATHS[org]; return p?p[p.length-1]:'CPBL1'; }
export function canPlayTop(){ return S.stage==='PRO'&&ovr()>=LV[farewellTopLv()].min; }
/* 一日球員約的前提：在所屬體系的一軍真的出賽過（中職一軍／日職一軍／大聯盟）。 */
export function playedTop(){
  const t=S.stats&&S.stats[LV[farewellTopLv()].top];
  return S.stage==='PRO'&&!!t&&((t.G||0)>0||(t.GP||0)>0||(t.IP||0)>0);
}

/* 引退季：春訓宣布、球季照跑但出賽與打席減半（season.js simSeason），phaseEnd 看到 farewellYr 就收尾。 */
export function startFarewellSeason(cont){
  S.farewellYr=S.year;
  card('gold','最後一季',`春訓第一天，你就跟球團、跟球迷說了：<b class="hl">這是最後一年</b>。身體還撐得住${LV[S.lv].n}的強度，所以你決定好好打完這一季，讓每一座球場、每一個曾經為你加油的人，都有機會跟你道別。<br>但你也跟總教練說好了：<b class="hl">把一半的上場機會留給二軍上來的年輕人</b>。你當年也是這樣，被一位老將讓出位置，才有了第一次站上一軍的機會——現在輪到你把這份機會交出去。<br><b class="hl">本季出賽數與打席（投手為出賽場次）打五折。</b>`);
  cont();
}
export function finishFarewellSeason(){
  S.farewellYr=null;
  buyoutRemaining(0.7,false); /* 本季薪資已在季末入帳，只結清之後的年度 */
  daibaFarewell(()=>endGame(`${S.year} 年球季打完最後一場比賽，結束引退巡禮，正式高掛球鞋。`));
}

/* ---------- 告別戰模擬 ---------- */
/* 一局：逐打席擲到三個出局；九名打者還沒結束就由總教練上來接手。 */
export function farewellInning(par){
  const d=clamp(ovrPit()-par,-30,25);
  const pK=clamp(.21+.008*d,.05,.45), pBB=clamp(.085-.002*d,.03,.16), pH=clamp(.23-.005*d,.10,.38);
  const o={outs:0,bf:0,H:0,HR:0,BB:0,K:0,R:0,last:''}; let b=[0,0,0];
  const score=n=>{o.R+=n;};
  while(o.outs<3&&o.bf<9){
    o.bf++; const x=R();
    if(x<pK){ o.K++; o.outs++; o.last='K'; }
    else if(x<pK+pBB){ o.BB++; o.last='BB';
      if(b[0]){ if(b[1]){ if(b[2])score(1); b[2]=1; } b[1]=1; } b[0]=1; }
    else if(x<pK+pBB+pH){ o.H++; const y=R();
      if(y<.11){ o.HR++; o.last='HR'; score(1+b[0]+b[1]+b[2]); b=[0,0,0]; }
      else if(y<.31){ o.last='2B'; score(b[1]+b[2]); b=[0,1,b[0]]; }
      else { o.last='1B'; score(b[1]+b[2]); b=[1,b[0],0]; }
    }
    else { o.outs++; o.last='OUT'; }
  }
  return o;
}
/* 一個打席：三振、保送、安打（含長打）或擊球出局。 */
export function farewellPA(par){
  const d=clamp(ovrBat()-par,-30,25);
  const pK=clamp(.21-.006*d,.06,.40), pBB=clamp(.08+.003*d,.03,.18), pH=clamp(.24+.006*d,.12,.42);
  const hrShare=clamp(.08+.006*((S.ab.pow||0)-par),.02,.35);
  const x=R();
  if(x<pK)return 'K';
  if(x<pK+pBB)return 'BB';
  if(x<pK+pBB+pH){ const y=R(); return y<hrShare?'HR':y<hrShare+.2?'2B':'1B'; }
  return R()<.5?'GO':'FO';
}
const ipTxt=outs=>`${Math.floor(outs/3)}.${outs%3}`;
export function inningLine(o){ return `${ipTxt(o.outs)} 局 ${o.H} 安打 ${o.R} 失分 ${o.K} 三振${o.BB?` ${o.BB} 四壞`:''}`; }
const PA_LINE={HR:'1 打數 1 安打（全壘打）1 打點',
  '2B':'1 打數 1 安打（二壘安打）','1B':'1 打數 1 安打','BB':'0 打數 0 安打 1 保送',
  K:'1 打數 0 安打 1 三振',GO:'1 打數 0 安打',FO:'1 打數 0 安打'};
export function paLine(r){ return PA_LINE[r]; }

function inningStory(o){
  if(o.outs<3)return `比數早就不重要了。總教練走上投手丘，不是來換投，是來跟你握手。你把球交到他手上，脫帽向四面看台致意，掌聲一路跟著你走進休息區。`;
  if(o.R===0&&o.last==='K')return `最後一名打者揮空，捕手直接從本壘衝上來抱住你。全場起立，你站在投手丘上，第一次覺得這十八.四四公尺這麼短。`;
  if(o.R===0)return `三個出局數，一分沒丟。你低頭看了一眼投手丘上的紅土，像是在跟它說聲謝謝，然後慢慢走下場。`;
  return `被打了幾支安打，也丟了分——但當你拿到最後一個出局數，休息區的隊友全都站到了場邊，一個一個跟你擁抱。`;
}
const PA_STORY={
  HR:'你把那顆球送上了看台。繞壘的這一路你刻意跑得很慢，想把每一步都記住；跑回本壘時，整個休息區已經空了，所有人都在那裡等你。',
  '2B':'球從外野手中間穿了過去。你站上二壘，代跑的隊友已經跑出來，你把頭盔摘下，向全場揮手。',
  '1B':'一記清脆的安打。你站在一壘上，對方一壘手摘下帽子向你致意，代跑上場的隊友抱了你一下，換你回家。',
  BB:'四壞球保送。你笑著把球棒輕輕放在本壘板前，慢跑上一壘——對方投手也站在投手丘上，向你點了點頭。',
  K:'三振。你沒有懊惱，反而笑了出來，對著看台揮揮手——這一棒你等了一輩子，結果早就不重要了。',
  GO:'擊成滾地球。你還是全力跑向一壘，跑過壘包之後才慢下來，回頭看見隊友們已經在休息區前排成一列等你。',
  FO:'球高高飛向外野，被穩穩接住。你跑過一壘才停下腳步，全場的掌聲沒有因為這個出局數少一點。'};

/* 告別戰的單場成績，欄位規則跟 simSeason 一樣：單刀投手寫 G／H／BB，二刀流的投球寫 GP／pH／pBB。 */
function pitSt(o,tw){
  const ip=ipFromOuts(o.outs), base={IP:ip,SO:o.K,ER:o.R,W:0,L:0,SV:0,HLD:0,pHR:o.HR};
  return tw?{...base,GP:1,pH:o.H,pBB:o.BB}:{...base,G:1,H:o.H,BB:o.BB};
}
function batSt(r){
  const hit=r==='HR'||r==='2B'||r==='1B', bb=r==='BB';
  return {G:1,PA:1,AB:bb?0:1,H:hit?1:0,HR:r==='HR'?1:0,RBI:r==='HR'?1:0,BB:bb?1:0,SB:0,DEF:0,_dh:S.pos==='TW'||S.dpos==='DH'};
}
/* 告別戰併入生涯數據：只加計數欄位，不跑 accStat()——那裡會把它當成一整個球季
   （聯盟年數、球隊年數、守位／角色年數都 +1），一天的合約不該多出一年年資。 */
export function recordFarewell(lv,st){
  if(st.IP!=null||st.GP!=null)normalizePitchingStats(st,lv);
  if(st.PA!=null)normalizeBatterStats(st,lv);
  const bucket=LV[lv].top, t=S.stats[bucket]; if(!t)return;
  st.oneDay=true; st.role=S.role||null;
  if(S.pos==='P'||S.pos==='TW'){
    t.GP=(t.GP||0)+pitG(st); t.pH=(t.pH||0)+pitH(st); t.pBB=(t.pBB||0)+pitBB(st); t.pHR=(t.pHR||0)+(st.pHR||0);
    ['W','L','SV','HLD','SO','ER'].forEach(k=>t[k]=(t[k]||0)+(st[k]||0));
    t.IP=ipFromOuts(outsFromIP(t.IP)+outsFromIP(st.IP));
  }
  if(S.pos!=='P'){
    ['G','PA','AB','H','HR','RBI','SB','BB'].forEach(k=>t[k]=(t[k]||0)+(st[k]||0));
    const dp=st._dh?'DH':(S.dpos||'—'); if(!t.DPG)t.DPG={}; t.DPG[dp]=(t.DPG[dp]||0)+st.G;
  }
  const tm=S.teamName?S.teamName():S.orgTeam;
  S.log.push({y:S.year,age:S.age,tm:tm+'（一日球員約）',lv,p:S.pos==='P'?null:(st._dh?'DH':(S.dpos||'')),
    role:(S.pos==='P'||S.pos==='TW')?S.role:null,line:statLine(st),inj:false,st});
}
/* 一日球員約：簽約→告別戰→寫進生涯數據→引退結算。 */
export function oneDayContract(){
  const topLv=farewellTopLv(), top=LV[topLv], topN=top.n, team=S.orgTeam||'母隊';
  buyoutRemaining(0.7,true);
  S.lv=topLv; board(1); /* 這一天登錄在一軍：隊名、年表層級都以一軍顯示 */
  card('gold','一日球員約',`球團沒有讓你就這樣安靜地離開。${S.year} 年開季前，<b class="hl">${team}</b> 和你簽下一紙 <b class="hl">一日${topN}球員約</b>——合約只有一天，薪水只是象徵性的一塊錢。這一天，你的名字會再一次寫進${topN}的先發名單。`);
  let line, title; const st={};
  if(S.pos==='TW'){
    const o=farewellInning(top.par), r=farewellPA(top.par);
    Object.assign(st,pitSt(o,true),batSt(r));
    title='最後一場';
    line=`投球 ${inningLine(o)}；打擊 ${paLine(r)}`;
    card('gold',title,`你先發站上投手丘，投完這場比賽的第一局；下半局，你換上打擊頭盔，以第三棒站進打擊區——兩件事你做了一輩子，最後一天也要一起做完。<br>${inningStory(o)}<br>${PA_STORY[r]}<br>告別戰：<b class="hl">${line}</b>`);
  }else if(S.pos==='P'){
    const o=farewellInning(top.par);
    Object.assign(st,pitSt(o,false));
    title='最後一局';
    const open=S.role==='SP'?'比賽開始前，你最後一次以先發投手的身分走上投手丘，負責第一局。'
      :S.role==='CL'?'九局上，牛棚的門打開，熟悉的出場曲響起——全場都知道是誰要上來了。'
      :'比賽中段，你最後一次從牛棚跑向投手丘，接下這一局。';
    line=inningLine(o);
    card('gold',title,`${open}<br>${inningStory(o)}<br>告別戰：<b class="hl">${line}</b>`);
  }else{
    const r=farewellPA(top.par);
    Object.assign(st,batSt(r));
    title='最後一個打席';
    line=paLine(r);
    card('gold',title,`第一局，你以開路先鋒的身分站上打擊區。打擊音樂還沒放完，全場已經站起來了——投手退下投手板，讓掌聲先響一會兒。<br>${PA_STORY[r]}<br>告別戰：<b class="hl">${line}</b>`);
  }
  S.farewellLine=line;
  recordFarewell(topLv,st);
  endGame(`${S.year} 年簽下一日${topN}球員約，完成最後一次出賽後正式引退。告別戰：${line}。`);
}
