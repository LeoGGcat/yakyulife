import {S} from '../core/state.js?v=2.1.4';
import {R, pick, chance, clamp} from '../core/rng.js?v=2.1.4';
import {ABL, POS_AB} from '../data/abilities.js?v=2.1.4';
import {card, choose, board} from '../ui/dom.js?v=2.1.4';
import {addAb, addAbStat, statBonusTxt, abGainTxt} from '../engine/ability.js?v=2.1.4';
import {GIRLS, GIRL, COUNTRY_N, TW_JOBS} from '../data/girls.js?v=2.1.4';

/* ================= 戀愛系統（v2.1.0 重置） =================
   流程：好感事件（三選一）→ 好感滿 100 → 告白 75% → 交往（她的三章故事，任一章後可求婚）
        → 結婚（剩下的章節在婚內走完）。跨國轉聯盟時觸發旅外事件，分成「一起走」與「遠距」兩條路線。
        分手／離婚後，前任隔兩年才會再遇到，改走「重逢」：專屬好感事件 → 復合（章節接續），復合只有一次機會。
   角色與劇情文本在 data/girls.js。

   保留給其他系統讀的欄位（不要改名）：st partner kids caught affairs exes dyrs datedTimes
   ——渣男、自律狂、外務纏身、閨中密友、更衣室毒瘤、引退家庭欄、FA 拒約引退文案都讀這些。 */

export const LOVE_ODDS={safe:80,norm:65,bold:50};   /* 好感事件與章節共用的成功率 */
export const AFF_GAIN={safe:25,norm:50,bold:100};   /* 好感度：保守四次、一般兩次、放手一搏一次就滿 */
export const AFF_BOLD_FAIL=25;                      /* 放手一搏失敗扣的好感 */
export const CONFESS_RATE=75;                       /* 告白成功率；失敗不扣好感 */
export const PRE_MARRIAGE_FIRE=80;                  /* 結婚前每年觸發率 */
const BOND_GAIN={safe:5,norm:10,bold:20};           /* 交往後的感情值 */
const BOND_FAIL={safe:0,norm:0,bold:10};
const BOND_START=70;
const MODE_TAG={safe:'保守',norm:'一般',bold:'放手一搏'};
const ORG_C={CPBL:'TW',NPB:'JP',MiLB:'US',MLB:'US'};
const TZ={TW:{JP:1,US:13},JP:{TW:1,US:14},US:{TW:13,JP:14}}; /* 只拿來寫文案的大概時差 */

export function playerCountry(s){ const st=s||S; return ORG_C[st.org]||'TW'; }
const hl=t=>`<b class="hl">${t}</b>`;

/* 每國抽三位。台灣的啦啦隊抽中時，一半機率是馮海莎、一半是林曉晴。
   第一次需要時才抽（20 歲的第一個戀愛事件），讓高中到選秀的亂數流保持原樣。 */
export function drawCast(){
  const shuffled=a=>{ const o=a.slice(); for(let i=o.length-1;i>0;i--){ const j=Math.floor(R()*(i+1)); [o[i],o[j]]=[o[j],o[i]]; } return o; };
  const twId={cheer:null,reporter:'ruotong',teacher:'peici',wbb:'yongen',pilot:'yunxi'};
  const TW=shuffled(TW_JOBS).slice(0,3).map(j=>j==='cheer'?(chance(50)?'haisha':'xiaoqing'):twId[j]);
  const of=c=>shuffled(GIRLS.filter(g=>g.c===c).map(g=>g.id)).slice(0,3);
  return {TW,JP:of('JP'),US:of('US')};
}
export function ensureLove(){
  const L=S.love;
  if(!L.cast)L.cast=drawCast();
  ['aff','scn','met','hurt','past'].forEach(k=>{ if(!L[k])L[k]={}; });
  if(!L.burned)L.burned=[];
  if(L.bond===undefined)L.bond=0;
  if(L.ch===undefined)L.ch=0;
  return L;
}
export function partnerGirl(){ const L=S.love; return L&&L.pid?GIRL[L.pid]:null; }
/* 外遇人選：先前累積過好感度的女主角（不限國家），不是伴侶、不是馮海莎、不是已經不會回頭的人 */
export function affairPool(){
  const L=ensureLove();
  return Object.keys(L.aff).filter(id=>(L.aff[id]||0)>0&&id!==L.pid&&GIRL[id]&&!GIRL[id].safe&&!L.burned.includes(id));
}
/* 交往或婚後，每年有 affairChance(感情值) 的機率，當年的事件就是外遇誘惑（有人選才會發生） */
export const RESIST_BOND=10, RESIST_PROP=25;
export function affairChance(bond){ return clamp(Math.round(10+(100-bond)*0.3),10,40); }
/* 求婚值：交往期間她的章節選項成功就累積（同好感度：保守 +25、一般 +50、放手一搏直接滿，放手一搏失敗 −25）。
   求婚值多少都能求婚，求婚值越高越容易成功；還沒走完的章節在婚後繼續。 */
export const PROP_GAIN=AFF_GAIN, PROP_BOLD_FAIL=AFF_BOLD_FAIL;
/* 交往中每年都能求婚。成功率 = 求婚值 × 0.75 + (感情值 − 70)，5%～95%（求婚值滿、感情值 70 → 75%）。
   被拒時感情值 −5、求婚值最多保留 50。只要求過一次婚，就不再有「交往太久不求婚」的分手風險。 */
export const PROP_NO_BOND=5, PROP_NO_BACK=50;
export function proposalChance(prop,bond){ return clamp(Math.round(prop*0.75+(bond-BOND_START)),5,95); }
const addProp=d=>{ const L=S.love; L.prop=clamp((L.prop||0)+d,0,100); return L.prop; };

/* 三選一的選項：好感事件、章節、旅外路線共用 */
/* opts 依 [保守, 一般, 放手一搏] 排列；可以是字串，或 {t 選項, g 成功文本, b 失敗文本}。畫面上由放手一搏排到保守。 */
function modeOpts(opts,sFor,pick){
  return ['bold','norm','safe'].map((m,i)=>{ const o=opts[2-i], t=typeof o==='string'?o:o.t;
    return {t,warn:m==='bold',main:m==='norm',center:true,s:sFor(m),f:()=>pick(m,chance(LOVE_ODDS[m]),o)}; });
}
/* 成功時的能力加成：保守體力 +1、一般隨機 +1、放手一搏隨機 +2 */
function modeGain(m){
  const k=m==='safe'?'sta':pick(POS_AB[S.pos]);
  return loveGainTxt(k,m==='bold'?2:1);
}
const addBond=d=>{ const L=S.love; L.bond=clamp((L.bond||0)+d,0,100); return L.bond; };

export function loveEvent(next){
  if(S.stage!=='PRO'||S.age<20){ next(); return; }
  const L=ensureLove(), pc=playerCountry();
  if((L.st==='dating'||L.st==='married')&&GIRL[L.pid]){
    if(L.lastC&&L.lastC!==pc){ L.lastC=pc; abroadEvent(next); return; }
    L.lastC=pc;
    coupleYear(next); return;
  }
  L.lastC=pc;
  singleYear(next);
}

/* ---------- 單身／離婚：好感事件 ---------- */
/* 前任（交往過、結過婚的人）：分開後至少隔 REUNION_GAP 年才會再遇到；
   再遇到時走「重逢」：專屬的好感事件與復合告白，她的故事從上次停下的章節繼續。
   復合只有一次機會——跟同一個人第二次分開，她就不會再回來。 */
export const REUNION_GAP=2, REUNION_MAX=1, REUNION_CONFESS_CHEAT=50;
export function exCooling(id){ const L=S.love, p=L.past&&L.past[id]; return !!p&&S.year-p.yr<REUNION_GAP; }
/* 今年可能遇到的人：所在國家的名單，排除不會回頭的人與剛分開的前任 */
export function singlePool(fresh){
  const L=ensureLove();
  let pool=(L.cast[playerCountry()]||[]).filter(id=>!L.burned.includes(id)&&!exCooling(id));
  /* 你主動結束一段感情的隔年：一定會有戀愛事件，而且先遇到別人 */
  if(fresh&&pool.some(id=>id!==fresh))pool=pool.filter(id=>id!==fresh);
  return pool;
}
function singleYear(next){
  const L=S.love, fresh=L.fresh; L.fresh=null;
  if(!fresh&&!chance(PRE_MARRIAGE_FIRE)){ next(); return; }
  const pool=singlePool(fresh);
  if(!pool.length){ next(); return; }
  const g=GIRL[pick(pool)];
  if((L.aff[g.id]||0)>=100){ confess(g,next); return; }
  affectionScene(g,next);
}
function formerOf(g){ return S.love.exes.find(e=>e.id===g.id||e.name===g.n)||null; }
/* 好感事件三選一的共用結算 */
const affSFor=m=>m==='bold'?`成功率 ${LOVE_ODDS.bold}%｜好感度直接滿｜失敗 −${AFF_BOLD_FAIL}`:`成功率 ${LOVE_ODDS[m]}%｜好感度 +${AFF_GAIN[m]}`;
function affPick(g,tag,next){
  return (m,good,o)=>{
    const L=S.love, before=L.aff[g.id]||0;
    L.aff[g.id]=good?Math.min(100,before+AFF_GAIN[m]):(m==='bold'?Math.max(0,before-AFF_BOLD_FAIL):before);
    const gt=good?modeGain(m):''; if(good)board(1);
    card(good?'good':'bad',`${tag}｜${g.n}（${MODE_TAG[m]}）`,
      `${good?o.g:o.b}<br>好感度 ${before} → <b class="${L.aff[g.id]>=before?'up':'dn'}">${L.aff[g.id]}</b>${gt?'｜'+gt:''}`);
    if(L.aff[g.id]>=100)confess(g,next); else next();
  };
}
function affectionScene(g,next){
  const L=S.love;
  if(L.past[g.id]){ reunionScene(g,next); return; }
  if(!L.met[g.id]){ L.met[g.id]=1;
    card('info',`相遇｜${g.n}（${g.job}）`,g.meet); }
  const n=L.scn[g.id]||0; L.scn[g.id]=n+1;
  const sc=g.sc[n%3], aff=L.aff[g.id]||0;
  choose(`<span class="ev-h">戀愛｜${g.n}（${g.job}）</span><small>${sc.i}<br>好感度 ${aff}／100</small>`,
    modeOpts(sc.o,affSFor,affPick(g,'戀愛',next)));
}
function confess(g,next){
  const L=S.love, p=L.past[g.id];
  const rate=p&&p.how==='cheat'?REUNION_CONFESS_CHEAT:CONFESS_RATE;
  choose(`<span class="ev-h">${p?'復合':'告白'}｜${g.n}</span><small>好感度已滿。${p?'你們曾經走散過。這一次，要不要再問她一次？':'有些話，該說出口了。'}</small>`,[
    {t:p?'請她再給一次機會':'告白',main:true,s:`成功率 ${rate}%｜失敗不扣好感，下次遇到她可以再說${p?'｜她的故事從上次停下的地方繼續；再分開，她就不會回頭':''}`,f:()=>{
      if(chance(rate)){
        L.st='dating'; L.pid=g.id; L.partner=g.n; L.dyrs=0; if(!p)L.datedTimes=(L.datedTimes||0)+1;
        L.ch=p?Math.min(3,p.ch||0):0; L.prop=0; L.proposed=false; L.bond=BOND_START; L.herC=playerCountry(); L.lastC=L.herC; L.apart=false; L.withYrs=0; L.apartYrs=0; L.knot=false; L.xrYr=null; L.relRef=0; L.dsn=0;
        const gt=loveGainTxt('sta',2); board(1);
        if(p){ card('gold','復合',`${p.how==='cheat'?REUNION_OK_CHEAT(g):REUNION_OK(g)}<br><br>你們復合了——${gt}。${L.ch>0&&L.ch<3?`<br>她的故事，從第 ${L.ch+1} 章接著走。`:''}`); next(); return; }
        card('gold','交往',`${g.conf.ok}<br><br>你們開始交往了——${gt}。`);
        const hasAnyKids=L.kids+L.exes.reduce((s,e)=>s+(e.kids||0),0)>0;
        if(L.datedTimes>=3&&!hasAnyKids&&!S.traits.married&&!S.traits.confidante){ S.traits.confidante=true;
          card('gold','隱藏稱號：閨中密友','第三段戀情了。每一個她都很好，每一段都真心過，只是走到最後，你們總是走向不同的路。'); board(1); }
      }else card('bad',p?'她的答案':'告白失敗',`${p?REUNION_NO(g):g.conf.no}<br>好感度保留，你們還是朋友。`);
      next(); }},
    {t:'再等等',s:'好感度保留，下次遇到她再說',f:()=>{
      card('info','未完待續','話到了嘴邊，你又把它吞了回去。也許，下次吧。'); next(); }}]);
}

/* ---------- 重逢：再遇到前任 ---------- */
/* 分開的原因：wait 交往太久沒給答案／left 你提的分手／far 遠距撐不下去／cheat 外遇或劈腿 */
function reunionMeet(g,p){
  const her=hl(g.n);
  const lead={
    wait:`分手之後，${her} 的${g.work}一天都沒有停下來。她說過，她的人生不會停在原地等任何人——她真的做到了。這天你們在同一個場合遇上，是她先認出你的。她朝你點了點頭，像是在打招呼，也像是在說：都過去了。`,
    left:`當年是你先開口說分開的。再見到 ${her} 時，她正和朋友聊著最近的${g.work}，笑得很開。她看見你，愣了半秒，然後自己走了過來：「好久不見。你看起來過得不錯。」`,
    far:`那通電話之後，你們就沒有再聯絡過。現在你們終於在同一個地方，卻是在這種場合不期而遇。${her} 看著你，笑了一下：「原來不用算時差，是這種感覺。」`,
    cheat:`${her} 看到你的那一刻，笑容收了回去。那件事之後，她刪掉了你所有的聯絡方式，也再沒有在任何場合提起你。她沒有轉身就走，只是禮貌地點了點頭——那種禮貌，比生氣還要遠。`
  }[p.how]||`分開之後，你和 ${her} 又在同一個場合遇到了。她的${g.work}一天都沒有停下來，看起來比從前更從容了。她對你點了點頭，像是在打招呼，也像是在說：要重新開始，就從頭來過。`;
  const ex=p.wed?formerOf(g):null, kids=ex?(ex.kids||0):0;
  const tail=p.wed?(kids>0?`<br><br>離婚之後，你們每個月還是會在孩子的學校門口碰面，交接書包、交代功課，從來不多說一句。這是你們第一次，不是因為孩子而見面。`
    :`<br><br>簽字那天之後，這是你們第一次見面。`):'';
  return lead+tail;
}
const REUNION_OK=g=>`你約她在當年常去的那家店。話還沒說完，${hl(g.n)} 就輕輕打斷你：「你知道我會怕吧？怕我們又走回同一條路。」她低頭攪著杯子裡的冰塊，過了很久才抬起頭：「那這次，我們都不要再假裝沒事了。有話就說，好不好？」你說好。`;
const REUNION_OK_CHEAT=g=>`${hl(g.n)} 聽你說完，很久都沒有開口。最後她說：「我還沒有原諒那件事。可是我想知道，現在的你，是不是真的不一樣了。」她伸出手，又停在半空：「就這一次。」`;
const REUNION_NO=g=>`${hl(g.n)} 聽完，搖了搖頭，笑得有點難過：「不是不喜歡你。是我好不容易才走到現在這裡，我還沒準備好，再走一次那條路。」`;
/* 舊情：重逢後的好感事件，三幕輪流；數值同一般好感事件 */
const REUNION_SC=[
  {i:g=>`你們在當年常去的那家店不期而遇。${g.n} 和同事坐在靠窗的位置，桌上攤著她${g.work}的資料。`,
   o:g=>[
    {t:'點個頭就好，不打擾她',
     g:`你只點了點頭，就回到自己的位子。結帳時老闆說，窗邊那位小姐已經幫你把咖啡錢付了，還留了一句話：「好久不見。」`,
     b:`你點了點頭，她也點了點頭，就這樣。走出店門你才想到，你連她現在過得好不好都沒有問。`},
    {t:`走過去，問她最近的${g.work}`,
     g:`她愣了一下，然後說了很久。說到一半她忽然停下來看著你：「你以前很少問這些。」語氣裡沒有責怪，比較像是驚訝。`,
     b:`她禮貌地回了幾句，同事在旁邊投來好奇的眼神。她笑著說：「改天再聊吧。」你知道那個改天，不一定會來。`},
    {t:'說出那句一直沒說的：「對不起。」',
     g:`她看著你很久，久到你以為她不會回答。最後她說：「這句話我等了很久。不過現在聽到，好像也沒有那麼難受了。」`,
     b:`她把杯子放下：「你是想讓我好過一點，還是想讓你自己好過一點？」那天你們沒有再說下去。`}]},
  {i:g=>`${g.n} 的${g.work}有了新的進展，消息在你的社群首頁被轉了一輪又一輪。底下的留言裡，有人提起你們當年的事。`,
   o:g=>[
    {t:'默默按一個讚',
     g:`隔天，她回了你一個貼圖。分開之後，這是你們第一次有來有往。`,
     b:`那個讚淹沒在幾百則通知裡。你看著她的照片很久，最後把手機扣在桌上。`},
    {t:'傳訊息恭喜，不提過去',
     g:`她回：「謝謝。你也是，最近打得不錯。」原來這幾年，她一直都有在看你的比賽。`,
     b:`訊息已讀，隔了三天才回了「謝謝」兩個字。你們之間，還隔著好長一段路。`},
    {t:'送一束花到她工作的地方',
     g:`她傳來一張照片，那束花被放在她桌上最顯眼的位置：「同事一直問是誰送的，我說，是一個老朋友。」`,
     b:`花被退了回來，卡片背面多了一行她的字：「心意收到了，花不用。」`}]},
  {i:g=>`你們終於坐下來好好吃了一頓飯。甜點上桌時，${g.n} 放下叉子問你：「如果重來一次，你會有什麼不一樣？」`,
   o:g=>[
    {t:'老實說：「我不知道，可是我想找到答案。」',
     g:`她笑了：「至少你沒有騙我。」那晚你們走了很長一段路，誰都沒有提要叫車。`,
     b:`她嘆了一口氣：「你以前也常說不知道。」那頓飯剩下的時間，你們都在看窗外。`},
    {t:'把這幾年你改變的事，一件一件說給她聽',
     g:`她聽得很認真，偶爾問一兩句。最後她說：「你真的變了一點。」停了一下，又補一句：「一點點。」`,
     b:`說著說著，又變成了你的球季、你的合約。她輕輕打斷你：「你看，還是在講你自己。」`},
    {t:'看著她說：「這一次，換我配合妳的人生。」',
     g:`她沒有馬上相信，可是她也沒有轉開視線：「那你證明給我看。」`,
     b:`她搖了搖頭：「我不需要誰來配合我。我需要的是，你知道我要什麼。」`}]}
];
function reunionScene(g,next){
  const L=S.love, p=L.past[g.id];
  if(!p.seen){ p.seen=1; card('info',`重逢｜${g.n}（${g.job}）`,reunionMeet(g,p)); }
  const n=p.sc||0; p.sc=n+1;
  const sc=REUNION_SC[n%REUNION_SC.length], aff=L.aff[g.id]||0;
  choose(`<span class="ev-h">舊情｜${g.n}（${g.job}）</span><small>${sc.i(g)}<br>好感度 ${aff}／100｜復合只有一次機會</small>`,
    modeOpts(sc.o(g),affSFor,affPick(g,'舊情',next)));
}

/* ---------- 交往中／已婚 ---------- */
function coupleYear(next){
  const L=S.love, g=GIRL[L.pid];
  if(L.st==='dating'){
    L.dyrs=(L.dyrs||0)+1;
    const y=L.dyrs;
    /* 交往太久不結婚 → 分手風險逐年升高；劈腿被抓的那年 +30% */
    const cheatPen=(L.cheatYr===S.year-1||L.cheatYr===S.year)?30:0;
    const bkP=(!L.proposed&&y>=4?20+(y-4)*15:0)+cheatPen;
    if(bkP>0&&chance(bkP)){
      const k1=pick(POS_AB[S.pos]),k2=pick(POS_AB[S.pos]);
      const g1=addAb(k1,-3),g2=addAb(k2,-3); board(1);
      endRelation(cheatPen?'cheat':'wait');
      if(L.proposed)card('bad','分手',`那晚的事她其實都知道。${hl(g.n)} 沒有哭，也沒有吵，只是把你送過的那個戒指盒放回你手裡：「我可以等你，但我沒辦法跟一個我不能相信的人過一輩子。」她搬走那天，把你家的鑰匙放在玄關的鞋櫃上。整個休賽季你魂不守舍——${abGainTxt(k1,-1,g1)}、${abGainTxt(k2,-1,g2)}。`);
      else card('bad','分手',`${cheatPen?'那晚的事她其實都知道。':''}交往第 ${y} 年，你始終沒有給她一個答案。${hl(g.n)} 沒有哭，也沒有吵，只是平靜地說：「我的人生不會停在原地等任何人。」她搬走那天，把你家的鑰匙放在玄關的鞋櫃上。整個休賽季你魂不守舍——${abGainTxt(k1,-1,g1)}、${abGainTxt(k2,-1,g2)}。`);
      next(); return; }
  }
  const ask=()=>L.st==='dating'?proposalAsk(next):next();
  if(chance(affairChance(L.bond))&&temptation(g,ask))return;
  /* 遠距也能求婚；被拒後的心結、十字路口接在遠距事件後面 */
  /* 遠距期間她的故事照樣往下走：夢想是她自己在原本的國家追的，不需要你在身邊 */
  if(L.apart){ longDistance(g,()=>{
    if(datingTurn(g,ask))return;
    if(L.pid===g.id&&L.apart&&L.ch<3&&chance(L.st==='dating'?PRE_MARRIAGE_FIRE:60)){ chapter(g,ask); return; }
    ask(); }); return; }
  if(L.withYrs===1||L.withYrs===2){ withRoute(g,ask); return; }
  if(L.st==='dating'){
    if(datingTurn(g,ask))return;
    if(L.ch<3&&chance(PRE_MARRIAGE_FIRE)){ chapter(g,ask); return; }
    /* 日常相處：三章都走完後每年出現，章節還在進行時偶發；一半是三選一的交往事件，一半是日常（求婚值 +25） */
    if((L.ch>=3||chance(30))&&chance(50)){ datingScene(g,ask); return; }
    if(L.ch>=3||chance(30)){ const gt=loveGainTxt('sta',1); addBond(5); const pv=addProp(25); board(1);
      if(chance(50))card('good','明星賽放閃',`明星賽的轉播鏡頭掃過看台，拍到了 ${hl(g.n)}。她正低頭回著工作訊息，發現自己上了大螢幕，愣了一下，笑著對鏡頭揮了揮手機。那個畫面隔天甜上熱搜——${gt}，求婚值 ${pv}／100。`);
      else card('good','日常',`這一年沒有什麼大新聞。只是每次客場回來的那個晚上，你們會窩在沙發上，各自說這一週發生的事——你的比賽，她的${g.work}。說著說著，常常就聊到天亮——${gt}，求婚值 ${pv}／100。`); }
    ask(); return;
  }
  /* 已婚：剩下的章節在婚內走完 */
  if(L.ch<3&&chance(60)){ chapter(g,next); return; }
  const fire=L.kids===0?40:30;
  if(!chance(fire)){ next(); return; }
  if(L.kids<4&&chance([65,45,30,20][L.kids])){ /* 生子：第一胎最優先，越生越少 */
    L.kids++; const kk=pick(POS_AB[S.pos]); const gt=loveGainTxt(kk,2); board(1);
    card('gold','新生命',`${hl(g.n)} 平安生下你們的第 ${hl(L.kids)} 個孩子。你們在冰箱上貼了一張輪班表，誰顧孩子、誰去工作，寫得清清楚楚——她的${g.work}跟你的球季一樣重要。當了${L.kids>1?'幾次':''}爸爸的男人，眼神都不一樣了——${gt}。`);
    next(); return; }
  if(chance(50)&&L.kids>0){ const gt=loveGainTxt('sta',1); addBond(5); board(1);
    card('good','球場邊的父親',`你被拍到賽前隔著護網，蹲著教孩子怎麼戴手套，影片配文「最強棒球教室」瘋傳。那天 ${hl(g.n)} 忙著她的${g.work}，去幼兒園接孩子的是你——${gt}。`); next(); return; }
  const gt=loveGainTxt('sta',1); addBond(5); board(1);
  card('good','結婚紀念日',`結婚紀念日，你們各自推掉了工作，回到當年辦婚禮的那個地方。${hl(g.n)} 牽著你的手走了一圈，說：「明年換我挑地方，你不准偷看行程。」——${gt}。`); next();
}

/* 她的故事：三章，交往或婚後都會走。交往中的選項累積求婚值與感情值，婚後只影響感情值；
   她的結果（end）一定會發生。 */
function chapter(g,done){
  const L=S.love, i=L.ch, c=g.ch[i], dating=L.st==='dating';
  const sFor=m=>dating
    ?`成功率 ${LOVE_ODDS[m]}%｜求婚值 ${m==='bold'?'直接滿':'+'+PROP_GAIN[m]}、感情值 +${BOND_GAIN[m]}${m==='bold'?`｜失敗 求婚值 −${PROP_BOLD_FAIL}、感情值 −${BOND_FAIL.bold}`:''}`
    :`成功率 ${LOVE_ODDS[m]}%｜感情值 +${BOND_GAIN[m]}${BOND_FAIL[m]?`｜失敗 −${BOND_FAIL[m]}`:''}`;
  choose(`<span class="ev-h">${g.n}的故事｜第 ${i+1} 章　${c.t}</span><small>${c.i}<br>${dating?`求婚值 ${L.prop||0}／100｜`:''}感情值 ${L.bond}／100</small>`,
    modeOpts(c.o,sFor,(m,good,o)=>{
      const b0=L.bond, p0=L.prop||0; addBond(good?BOND_GAIN[m]:-BOND_FAIL[m]);
      if(dating)addProp(good?PROP_GAIN[m]:(m==='bold'?-PROP_BOLD_FAIL:0));
      const gt=good?modeGain(m):''; if(good)board(1);
      L.ch=i+1;
      const propTxt=dating?`求婚值 ${p0} → <b class="${L.prop>=p0?'up':'dn'}">${L.prop}</b>｜`:'';
      card(good?'good':'bad',`${g.n}的故事｜第 ${i+1} 章　${c.t}`,
        `${good?o.g:o.b}<br><br>${c.end}<br>${propTxt}感情值 ${b0} → <b class="${L.bond>=b0?'up':'dn'}">${L.bond}</b>${gt?'｜'+gt:''}`);
      if(L.ch===3)card('gold',`${g.n}的目標`,`${hl(g.n)} 做到了——${g.goal}。<br><br>${g.fin||'這條路是她一步一步走出來的。你很慶幸，這一路上，自己一直都在。'}`);
      if(L.ch===3)comeToYou(g);
      done();
    }));
}
export function proposalAsk(next){
  const L=S.love, g=GIRL[L.pid];
  if(L.st!=='dating'||!g){ next(); return; }
  const p=L.prop||0, rate=proposalChance(p,L.bond), far=L.apart;
  const lead=p>=100?'求婚值已滿。':`求婚值 ${p}／100，感情值 ${L.bond}／100。`;
  choose(`<span class="ev-h">求婚｜${g.n}</span><small>${lead}交往第 ${L.dyrs} 年，你口袋裡的那個小盒子，已經放了好一陣子。${far?`她在 ${COUNTRY_N[L.herC]}，要求婚，得先飛過去。`:''}</small>`,[
    {t:'求婚',main:p>=100,s:`成功率 ${rate}%（看求婚值與感情值）｜成功：體力提升、本季受傷機率 −5%｜失敗：感情值 −${PROP_NO_BOND}${p>PROP_NO_BACK?`、求婚值退回 ${PROP_NO_BACK}`:''}`,f:()=>{
      L.proposed=true;
      if(!chance(rate)){ addBond(-PROP_NO_BOND); L.prop=Math.min(p,PROP_NO_BACK); L.refused=(L.refused||0)+1; L.relRef=(L.relRef||0)+1; L.knot=true; board(1);
        card('info','她的答案',`${hl(g.n)} 看著那枚戒指，握著你的手想了很久，才輕輕地開口：${g.propNo}<br>感情值 −${PROP_NO_BOND}，求婚值 ${L.prop}／100。${L.ch<3?'她的故事還在往下走。':''}${far?'<br>回程的飛機上，你把那個小盒子放在胸前的口袋，一路都沒有拿出來。':''}`);
        if(L.refused>=2&&!S.traits.jiejiri){ S.traits.jiejiri=true;
          card('gold','隱藏稱號：街尻','職業球員求婚都會成功。對吧？'); board(1); }
        next(); return; }
      /* 與前妻復合後再婚：共同孩子回到目前家庭，前妻紀錄不再重複顯示。 */
      const fi=L.exes.findIndex(e=>e.id===g.id||e.name===g.n);
      const reunitedKids=fi>=0?(L.exes[fi].kids||0):0;
      if(fi>=0)L.exes.splice(fi,1);
      L.st='married'; L.kids=reunitedKids; L.dyrs=0;
      const gTxt=loveGainTxt('sta',2)+'、'; S.tmpInj-=5; board(1);
      card('gold','婚禮',`${far?`你趁休兵日飛回 ${COUNTRY_N[L.herC]}，沒有先說，直接出現在她下班的路口。`:'你沒有用球場的大螢幕，也沒有找任何鏡頭。'}你在你們第一次約會的那家店，把戒指放在她面前。${hl(g.n)} 看著戒指，又看著你，眼淚掉下來之前先笑了：「好。不過婚禮要在哪裡辦，要由我來決定。」休賽季完婚——${gTxt}本季受傷機率 <b class="up">−5%</b>。${L.ch<3?'<br>婚後，她的故事還會繼續。':''}${far?'<br>婚後，你們暫時還是各自在兩個國家打拚。':''}`); next(); }},
    {t:'再等等',main:p<100,s:L.proposed?'求婚值保留':'求婚值保留｜交往第 4 年起，一直沒求過婚會有分手風險',f:()=>{
      card('info','再等等',`你把戒指放回抽屜。${hl(g.n)} 什麼都沒有問，只是說她明天一早還有${g.work}要忙，先去睡了。`); next(); }}]);
}

/* ---------- 交往中的轉折 ----------
   十字路口：交往滿 2 年，且「這段感情被拒過婚／遠距中／感情值 < 50」時，每年 40%（不連續兩年）。
   心結：求婚被婉拒的隔年，沒有遇上十字路口就一定出現，三選一，跟章節一樣累積求婚值與感情值。
   玩家可以把話說開、主動提分手，或先不想。主動分手不扣能力，隔年一定會遇到新的人。 */
export const CROSS_FIRE=40, CROSS_TALK=65, CROSS_TALK_BOND=15, CROSS_TALK_PROP=25, CROSS_TALK_FAIL=5, CROSS_KEEP=60, CROSS_KEEP_BOND=10;
const datingSFor=m=>`成功率 ${LOVE_ODDS[m]}%｜求婚值 ${m==='bold'?'直接滿':'+'+PROP_GAIN[m]}、感情值 +${BOND_GAIN[m]}${m==='bold'?`｜失敗 求婚值 −${PROP_BOLD_FAIL}、感情值 −${BOND_FAIL.bold}`:''}`;
/* 交往中三選一的共用結算 */
function datingPick(title,done){
  return (m,good,o)=>{
    const L=S.love, b0=L.bond, p0=L.prop||0;
    addBond(good?BOND_GAIN[m]:-BOND_FAIL[m]); addProp(good?PROP_GAIN[m]:(m==='bold'?-PROP_BOLD_FAIL:0));
    const gt=good?modeGain(m):''; if(good)board(1);
    card(good?'good':'bad',title,`${good?o.g:o.b}<br>求婚值 ${p0} → <b class="${L.prop>=p0?'up':'dn'}">${L.prop}</b>｜感情值 ${b0} → <b class="${L.bond>=b0?'up':'dn'}">${L.bond}</b>${gt?'｜'+gt:''}`);
    done();
  };
}
/* 回傳 true 表示這一年已經有事件接手 */
function datingTurn(g,ask){
  const L=S.love;
  if(L.st!=='dating')return false;
  const knot=L.knot; L.knot=false;
  const why=(L.relRef||0)>0||L.apart||L.bond<50;
  if(L.dyrs>=2&&why&&L.xrYr!==S.year-1&&chance(CROSS_FIRE)){ crossroads(g,ask); return true; }
  if(knot){ knotScene(g,ask); return true; }
  return false;
}
function knotScene(g,done){
  const L=S.love, again=(L.relRef||0)>=2;
  const opts=again?[
    {t:'這次不急著要答案',
     g:`你把戒指收進抽屜最深處，跟 ${hl(g.n)} 說：「我不會再把它當成考卷了。」她愣了一下，然後很久很久都沒有放開你的手。`,
     b:`你說你不急，可是每次經過那個抽屜，你的眼神都會停一下。她看在眼裡，什麼也沒說。`},
    {t:'問她：「我們是不是想要不一樣的東西？」',
     g:`那一晚你們把十年後的樣子各自說了一遍。說到最後才發現，兩個版本裡都有對方，只是她的那一個，${g.work}的位置比你想的還要大。你說：「那就照妳的版本。」`,
     b:`問題問出口，空氣就冷了下來。她說：「你是在問我，還是在找一個離開的理由？」那晚你們誰都沒睡好。`},
    {t:'把她在意的事，一件一件做給她看',
     g:`你沒有再多說什麼。只是她加班的晚上你一定在，她的${g.work}有重要場合你一定到。半年後她在你耳邊說：「好啦，我知道了。」`,
     b:`你做得很用力，用力到她覺得像是在被追債：「你這樣，我會覺得我欠你一個答案。」`}
  ]:[
    {t:'不追問，給她時間',
     g:`你沒有再提那天的事。某個休兵日的早上，${hl(g.n)} 一邊煮咖啡一邊自己開口：「那天我不是不想，是我還沒準備好。謝謝你沒有逼我。」`,
     b:`你們很有默契地不提那天的事。可是有些話不說，就一直卡在那裡，連一起吃飯都變得有點安靜。`},
    {t:'找一個晚上，聽她把理由說完',
     g:`你沒有辯解，只是聽。她說著說著就哭了，又笑了：「原來說出來，沒有我想的那麼可怕。」那晚你們說好，下一次，由她決定什麼時候。`,
     b:`你說好要聽，可是她才說到一半，你就忍不住開始解釋。她嘆了一口氣：「你看，你根本沒有在聽。」`},
    {t:'把她擔心的事，一件一件做給她看',
     g:`她擔心的是婚後自己的${g.work}會被擺到後面。你把下一季的行程攤在桌上，把她每一個重要的日子都先圈起來。她看著那張紙，看了很久。`,
     b:`你排了滿滿的計畫，每一項都寫著她的名字。她看完只說：「這是你想給的，不是我要的。」`}
  ];
  choose(`<span class="ev-h">心結｜${g.n}</span><small>${again?'又一次，她沒有答應。這一次你們都知道，問題不在戒指。':'被婉拒之後，你們很有默契地不再提那件事。可是那個小盒子，一直都在抽屜裡。'}<br>求婚值 ${L.prop||0}／100｜感情值 ${L.bond}／100</small>`,
    modeOpts(opts,datingSFor,datingPick(`心結｜${g.n}`,done)));
}
function crossroads(g,done){
  const L=S.love; L.xrYr=S.year;
  const lead=L.apart?`遠距第 ${L.apartYrs||1} 年。你們的對話，越來越常停在「晚安」。`
    :(L.relRef||0)>0?`求婚被婉拒之後，日子照樣過，只是你們都變得小心翼翼。`
    :`最近你們說話越來越少。她忙她的${g.work}，你忙你的球季，家裡安靜得只剩下冰箱的聲音。`;
  choose(`<span class="ev-h">十字路口｜${g.n}</span><small>${lead}某天夜裡你忽然想：這段感情，還要不要走下去？<br>求婚值 ${L.prop||0}／100｜感情值 ${L.bond}／100</small>`,[
    {t:'提分手',warn:true,s:`由你結束這段感情｜不扣能力，隔年一定會遇到新的人${L.bond>=CROSS_KEEP?'｜感情值還有 '+L.bond+'，她可能會想挽回':''}`,f:()=>leaveHer(g,done)},
    {t:'把話說開，重新開始',main:true,s:`成功率 ${CROSS_TALK}%｜成功：感情值 +${CROSS_TALK_BOND}、求婚值 +${CROSS_TALK_PROP}｜失敗：感情值 −${CROSS_TALK_FAIL}`,f:()=>{
      const b0=L.bond, p0=L.prop||0;
      if(chance(CROSS_TALK)){ addBond(CROSS_TALK_BOND); addProp(CROSS_TALK_PROP); const gt=loveGainTxt('sta',1); board(1);
        card('good','把話說開',`你們從晚餐一路聊到天亮，把這幾年沒說出口的話都攤在桌上。${hl(g.n)} 最後說：「我還想跟你走下去，可是我要的是一起走，不是我等你，也不是你等我。」你說好。<br>求婚值 ${p0} → <b class="up">${L.prop}</b>｜感情值 ${b0} → <b class="up">${L.bond}</b>｜${gt}`); }
      else{ addBond(-CROSS_TALK_FAIL);
        card('bad','把話說開',`話說到一半就變成了吵架。你們吵的不是同一件事，可是誰都停不下來。最後她說：「我們今天先到這裡。」<br>感情值 ${b0} → <b class="dn">${L.bond}</b>`); }
      done(); }},
    {t:'先不想這些',s:'維持現狀',f:()=>{
      card('info','十字路口',`你把那個念頭收了起來。隔天早上，${hl(g.n)} 照常傳來一句「今天也加油」，你照常回了一個貼圖。`); done(); }}]);
}
function leaveHer(g,done){
  const L=S.love, far=L.apart;
  const end=()=>{ const id=L.pid; endRelation('left'); L.fresh=id; board(1);
    card('info','分手',`${far?'你們約好了一個兩邊都還醒著的時間打電話。':'你們坐在第一次約會的那家店，點了跟當年一樣的東西。'}你說完之後，${hl(g.n)} 安靜了很久，最後點點頭：「謝謝你沒有拖到我們都恨對方。」她的${g.work}還在往前走，你的球季也是。這一次，是你們一起決定，各自往前。`);
    done(); };
  if(L.bond<CROSS_KEEP){ end(); return; }
  choose(`<span class="ev-h">她的回應｜${g.n}</span><small>${hl(g.n)} 沒有馬上回答。她低著頭，手指在杯緣繞了一圈又一圈：「我知道我們最近不好。可是……可以再試一次嗎？」</small>`,[
    {t:'再試一次',main:true,s:`感情值 +${CROSS_KEEP_BOND}`,f:()=>{
      const b0=L.bond; addBond(CROSS_KEEP_BOND);
      card('good','再試一次',`你握住她的手，說好。她笑了，眼眶卻紅了：「這次換我多走一步。」<br>感情值 ${b0} → <b class="up">${L.bond}</b>`);
      done(); }},
    {t:'還是分開吧',s:'分手｜不扣能力',f:end}]);
}
/* 交往中的三選一事件：三章走完後與日常輪流出現，章節進行中偶發 */
const DATING_SC=[
  {t:'見家長',i:g=>`${g.n} 說，這個週末她爸媽想請你吃頓飯。她特別交代：「我爸不看棒球，你不要一直聊棒球。」`,
   o:g=>[
    {t:'穿得整整齊齊，準時到',
     g:`你提早半小時到，在門口站了二十分鐘才按電鈴。她爸爸整頓飯都沒說幾句話，送你出門時才說：「下次來，不用帶這麼多東西。」`,
     b:`你一緊張就開始聊棒球，從開胃菜聊到甜點。她在桌子底下踢了你三次。`},
    {t:'先做功課，聊她爸媽有興趣的事',
     g:`你把她爸爸最愛的那位老歌手的專輯聽了一整個禮拜。飯桌上他越聊越開心，最後拍著你的肩膀說：「這小子不錯。」`,
     b:`你準備得太認真，連她爸爸年輕時的事都說得出來。她媽媽笑著問：「這些是誰告訴你的？」整桌忽然安靜。`},
    {t:'飯後主動說：「我想照顧她一輩子。」',
     g:`她爸爸放下筷子看了你很久，轉頭問她：「妳呢？」她說：「我自己會照顧自己，不過，我也想照顧他。」她媽媽先笑了出來。`,
     b:`她爸爸只淡淡地說：「她不需要誰照顧。」回家的路上，${g.n} 說：「我爸說得沒錯啊。」`}]},
  {t:'第一次旅行',i:g=>`休賽季，你們終於排出一個禮拜的空檔。${g.n} 把手機遞給你：「行程我排了一半，另一半交給你。」`,
   o:g=>[
    {t:'照她的步調，慢慢走',
     g:`你們在一個不知名的小鎮多待了兩天，因為她喜歡那裡的早餐。回程的飛機上她靠著你睡著，手裡還握著那家店的名片。`,
     b:`她的步調太慢，你一直偷看手機上的訓練菜單。她發現了，說：「你人在這裡，心在重訓室。」`},
    {t:'把後半段排成她一直想去的地方',
     g:`那是她大學時就存在手機裡的一張照片。你們站在照片裡的那個位置，她說：「我以為我會一個人來。」`,
     b:`你訂錯了日期，抵達時那個地方剛好在整修。她安慰你說沒關係，可是你看得出來她有點失望。`},
    {t:'偷偷安排一個驚喜',
     g:`最後一晚，你請當地的樂團在海邊為她唱了一首她最愛的歌。她一邊笑一邊罵你浪費錢，眼淚卻一直掉。`,
     b:`驚喜被路人認出來，變成了球迷見面會。她站在人群外面，替你拿著那束花。`}]},
  {t:'第一次大吵',i:g=>`你錯過了她${g.work}上最重要的那一天——因為臨時加了一場友誼賽。她沒有生氣，只是那天晚上，她沒有回家。`,
   o:g=>[
    {t:'傳一則很長的訊息道歉',
     g:`你寫了又刪、刪了又寫，最後只留下最真心的那幾句。隔天早上她回來了，手上提著你愛吃的早餐：「下次，你要先告訴我。」`,
     b:`訊息已讀了一整天都沒有回。你後來才知道，她要的不是道歉，是你人在那裡。`},
    {t:'去她朋友家門口等她',
     g:`你在樓下等到凌晨兩點。她下樓時穿著拖鞋，什麼話都沒說，只是把她的圍巾繞在你脖子上。`,
     b:`她的朋友下樓來跟你說：「她現在不想見你。」你在車上坐了一整晚，天亮才開走。`},
    {t:'跟球隊請假，補她一個屬於她的一天',
     g:`你請了球季中唯一的一天假，陪她去那個你錯過的場合的慶功宴。她在台上致詞時，看著台下的你說：「謝謝那個遲到的人。」`,
     b:`請假的消息上了新聞，標題是「為愛請假」。她看到報導，嘆了口氣：「我不想變成你的新聞。」`}]}
];
function datingScene(g,done){
  const L=S.love, n=L.dsn||0; L.dsn=n+1;
  const sc=DATING_SC[n%DATING_SC.length];
  choose(`<span class="ev-h">交往｜${sc.t}</span><small>${sc.i(g)}<br>求婚值 ${L.prop||0}／100｜感情值 ${L.bond}／100</small>`,
    modeOpts(sc.o(g),datingSFor,datingPick(`交往｜${sc.t}`,done)));
}

/* ---------- 旅外：跨國轉聯盟時觸發 ---------- */
function abroadEvent(next){
  const L=S.love, g=GIRL[L.pid], pc=playerCountry();
  if(L.apart&&pc===L.herC){ /* 回到她所在的國家：團聚 */
    L.apart=false; L.apartYrs=0; addBond(10); const gt=loveGainTxt('sta',1); board(1);
    card('gold','團聚',`你回到 ${COUNTRY_N[pc]}。${hl(g.n)} 來機場接你。她第一句話不是「我好想你」，而是興奮地說起她最近的${g.work}。你聽著聽著就笑了——分開的這幾年，你們都長大了——${gt}，感情值 +10。`);
    next(); return; }
  if(L.apart){ addBond(-5);
    card('info','更遠了',`你轉往 ${COUNTRY_N[pc]}，${hl(g.n)} 還在 ${COUNTRY_N[L.herC]}。你們打開手機的世界時鐘，重新加了一個時區。感情值 −5。`);
    next(); return; }
  const home=pc===g.c; /* 這次是回她的家鄉 */
  if(!mayFollow(g,L.herC,pc)){ /* 夢想還沒達成：她不會離開原本的國家 */
    L.apart=true; L.apartYrs=0;
    card('info','各自的戰場',`你要去 ${COUNTRY_N[pc]} 打球了。${hl(g.n)} 聽完，沉默了很久，最後握住你的手：「我還沒做到。」她說過，她要${g.goal}——那條路在 ${COUNTRY_N[L.herC]}，現在還不能放下。「你去吧。我在這裡，把我的事做完。」你們決定，試試看遠距離。`);
    next(); return; }
  const p=followChance(g,home);
  const rel=L.st==='married'?'你的妻子':'女友';
  choose(`<span class="ev-h">旅外｜${g.n}</span><small>你要去 ${COUNTRY_N[pc]} 打球了。可是${rel} ${g.n} 的${g.work}在 ${COUNTRY_N[L.herC]}，那是她一點一滴打下來的。</small>`,[
    {t:'問她願不願意一起走',s:`由她決定（約 ${p}%）｜一起走＝同行路線，不走＝遠距路線`,f:()=>{
      if(chance(p))goWith(g,home); else stayApart(g,home,true);
      next(); }},
    {t:'告訴她：你的人生在這裡，留下來沒關係',main:true,s:'直接走遠距路線｜感情值 +5',f:()=>{
      addBond(5); stayApart(g,home,false); next(); }}]);
}
/* 她願不願意跟著出國：夢想（三章）達成前不離開原本的國家。
   唯一例外是早瀨美咲（體育主播，目標是派駐大聯盟），她只會從日本跟到美國。 */
export function mayFollow(g,from,to){
  if(S.love.ch>=3)return true;
  return g.id==='misaki'&&from==='JP'&&to==='US';
}
/* 她願意跟著你到另一個國家的機率：基本機率 + 感情值修正，回她的家鄉 +30 */
function followChance(g,home){ return clamp(Math.round(g.goP+(S.love.bond-60)/2+(home?30:0)),5,90); }
/* 圓夢後她來找你：遠距中走完三章時，依同行機率決定她要不要搬到你所在的國家，接著走同行路線。
   張沛慈例外（孩子們在山上）；早瀨美咲的目標就是派駐美國，只有你在美國時才會過來。 */
function comeToYou(g){
  const L=S.love, pc=playerCountry();
  if(!L.apart||pc===L.herC||g.id==='peici'||(g.id==='misaki'&&pc!=='US'))return;
  if(!chance(followChance(g,pc===g.c)))return;
  joinYou(g,`慶功的那天晚上，${hl(g.n)} 打電話給你。那頭很吵，有人在唱歌、有人在開香檳，她躲到走廊上，聲音有點喘：「我做到了。」停了一下，她又說：「所以，現在換我去找你。」`);
}
/* 她搬到你所在的國家，結束遠距 */
function joinYou(g,lead){
  const L=S.love, pc=playerCountry(), yrs=L.apartYrs||1, home=pc===g.c;
  L.herC=pc; L.apart=false; L.apartYrs=0; L.withYrs=1; addBond(10);
  const gt=loveGainTxt('sta',1); board(1);
  card('gold','她來找你了',`${lead}<br><br>一個月後，你在 ${COUNTRY_N[pc]} 的機場等她。她拖著兩個行李箱走出入境大廳，頭髮比你上次見到時長了一些，看到你的時候，先是笑，然後才哭。${home?'「回家了。」她說，「這次是跟你一起。」':`「我查好了，這裡也有${g.work}可以做。」她說，「不過那是下個月的事。這個月，我只想待在你旁邊。」`}<br><br>遠距 ${yrs} 年，你們終於又在同一個時區了——${gt}，感情值 +10。`);
}
/* 遠距中「休賽季全部留給她」成功、而且她已經圓夢：問她要不要搬過來一起生活（每個人都會問，答應與否看同行機率） */
function askJoin(g,done){
  const L=S.love, pc=playerCountry(), p=followChance(g,pc===g.c);
  choose(`<span class="ev-h">遠距｜一起生活</span><small>那三個月過得太快。離開前一晚，你看著她桌上攤開的工作行程，忽然很想問一件事：她已經做到了她想做的事，那接下來，要不要到 ${COUNTRY_N[pc]}，跟你一起生活？</small>`,[
    {t:'問她願不願意一起走',main:true,s:`由她決定（約 ${p}%）｜願意＝結束遠距、接同行路線`,f:()=>{
      if(chance(p))joinYou(g,`${hl(g.n)} 沒有馬上回答。她把手上的行程表放下，走到窗邊看了很久，才轉過身來：「好。我在這裡想做的事，已經做完了。」`);
      else card('info','還不是時候',`${hl(g.n)} 握著你的手，想了很久：「這裡還有我放不下的人和事。再給我一點時間，好嗎？」你點點頭，把機票收進口袋。`);
      done(); }},
    {t:'把話吞回去，不勉強她',s:'維持遠距',f:()=>{
      card('info','下次再說',`你最後什麼都沒有問。上飛機前，${hl(g.n)} 抱了你很久，在你耳邊說：「下次換我飛過去。」`); done(); }}]);
}
function goWith(g,home){
  const L=S.love; L.herC=playerCountry(); L.withYrs=1; L.apart=false;
  const gt=loveGainTxt('sta',1); board(1);
  card('gold','一起出發',`${home?`${hl(g.n)} 聽到消息時眼睛一亮：「回${COUNTRY_N[g.c]}？那是我家耶！」她比你還早開始打包。`:g.go}——${gt}。`);
}
function stayApart(g,home,asked){
  const L=S.love; L.apart=true; L.apartYrs=0;
  card('info','各自的戰場',`${asked?'她想了整整一個晚上，隔天早上才給你答案。':''}${home?`${hl(g.n)} 在 ${COUNTRY_N[L.herC]} 已經有了自己的事業，她選擇留下。`:g.stay}你們決定，試試看遠距離。`);
}
/* 同行路線：第一年在異鄉重新開始，第二年她站穩腳步。
   目的地是她自己的家鄉（例如跟你出國後又一起回來）時，改用「回到故鄉」的文案：沒有語言問題，而是重新接回原本的生活。 */
const WITH_AWAY=[
  {t:'每天下班都回家陪她吃晚餐',
   g:g=>`不管比賽打到多晚，你都會回家吃她煮的、或是你笨手笨腳煮的晚餐。${hl(g.n)} 說：「一天裡只要有這一個小時是熟悉的，其他時間再陌生我都撐得住。」`,
   b:()=>`客場一場接一場，你答應的晚餐一次又一次落空。她在訊息裡說沒關係，可是冰箱裡的菜，一直放到壞掉。`},
  {t:'陪她上語言課、一起跑面試',
   g:()=>`你們坐在語言學校最後一排，你的發音被老師糾正了十幾次，她笑到趴在桌上。一個月後，她用剛學會的句子，談下了第一個工作機會。`,
   b:()=>`面試官一認出你，整場都在聊棒球。走出大樓時，她說：「下次你在外面等我就好。」`},
  {t:'把休賽季整個空出來，陪她認識這座城市',
   g:()=>`你們騎著腳踏車跑遍了城市的每個角落，找到一家她說「味道很像家」的小店。她在那裡認識了第一個當地的朋友，她說：「我開始喜歡這裡了。」`,
   b:()=>`你排得太滿，每天都在趕行程。第五天她累倒了，說：「我想自己慢慢來。」你這才發現，她比你想的還要堅強，也比你想的還要需要空間。`}];
const WITH_HOME=[
  {t:'每天下班都回家陪她吃晚餐',
   g:g=>`不管比賽打到多晚，你都會回家陪她吃晚餐。有幾次她媽媽拎著一鍋湯出現在門口：「你們剛搬回來，一定沒空煮。」${hl(g.n)} 喝了一口就紅了眼眶：「在國外那幾年，我最想念的就是這個味道。」`,
   b:()=>`客場一場接一場，你答應的晚餐一次又一次落空。她說沒關係，反正回娘家吃也很方便——你這才發現，她回家吃飯的次數，比在你們家還多。`},
  {t:'陪她拜訪老朋友、重新接回工作',
   g:g=>`你陪她一個一個去找出國前的老同事和老朋友。大家都還記得她，有人拍著她的肩膀說：「妳終於回來了。」一個月後，她的${g.work}重新接上了線，還多了在國外累積的經驗。`,
   b:()=>`每到一個地方，大家的話題都繞回你身上：「國外打球好玩嗎？那邊薪水多少？」走出門時，她說：「下次我自己去就好。」`},
  {t:'把休賽季整個空出來，陪她找回這座城市',
   g:()=>`你們騎著腳踏車回到她從小長大的街區。那家她念了好幾年的小吃店還開著，老闆一眼就認出她，多送了一盤小菜。她說：「出去繞了一大圈，才發現這裡一直都在等我。」`,
   b:()=>`你排得太滿，每天都在趕：拜訪親戚、同學聚餐、舊地重遊。第五天她累倒了，說：「這裡是我家，我們可以慢慢來。」`}];
function withRoute(g,done){
  const L=S.love, C=COUNTRY_N[L.herC], home=L.herC===g.c;
  if(L.withYrs===2){ L.withYrs=3; addBond(10); const gt=loveGainTxt('sta',1); board(1);
    card('gold','站穩腳步',home
      ?`${hl(g.n)} 在 ${C} 找回了自己的節奏——她的${g.work}接回了出國前的軌道，還帶著在國外磨出來的本事。她傳了一張照片給你：老朋友們替她辦的「歡迎回家」聚餐。——${gt}，感情值 +10。`
      :`${hl(g.n)} 在 ${C} 站穩了腳步——她的${g.work}在這裡重新起步了。她傳了一張照片給你：一張全新的名片，上面印著當地的文字。——${gt}，感情值 +10。`);
    done(); return; }
  L.withYrs=2;
  const head=home
    ?`<span class="ev-h">同行｜回到${C}</span><small>${g.n} 跟著你回到 ${C}——回到她的家鄉。家人、朋友、熟悉的街道都還在，只是離開了這幾年，她的${g.work}要重新接上線，生活也得重新找回節奏。<br>感情值 ${L.bond}／100</small>`
    :`<span class="ev-h">同行｜在${C}重新開始</span><small>${g.n} 跟著你來到 ${C}。語言不通、朋友不在，她的${g.work}一切都要從零開始。<br>感情值 ${L.bond}／100</small>`;
  choose(head,
    modeOpts((home?WITH_HOME:WITH_AWAY).map(o=>({t:o.t,g:o.g(g),b:o.b(g)})),
      m=>`成功率 ${LOVE_ODDS[m]}%｜感情值 +${BOND_GAIN[m]}${BOND_FAIL[m]?`｜失敗 −${BOND_FAIL[m]}`:''}`,(m,good,o)=>{
      addBond(good?BOND_GAIN[m]:-BOND_FAIL[m]); const gt=good?modeGain(m):''; if(good)board(1);
      card(good?'good':'bad',home?'故鄉':'異鄉',`${good?o.g:o.b}${gt?'——'+gt:''}`);
      done(); }));
}
/* 遠距路線：每年一次，感情值自然流失；太低時她可能提出結束 */
function longDistance(g,done){
  const L=S.love, pc=playerCountry(), tz=(TZ[pc]||{})[L.herC]||0;
  L.apartYrs=(L.apartYrs||0)+1; addBond(-10);
  choose(`<span class="ev-h">遠距｜第 ${L.apartYrs} 年</span><small>你在 ${COUNTRY_N[pc]}，${g.n} 在 ${COUNTRY_N[L.herC]}${tz?`，時差 ${tz} 小時`:''}。距離本身每年都在消耗感情（−10）。<br>感情值 ${L.bond}／100</small>`,
    modeOpts([
      {t:'每天約好固定的時間視訊',
       g:`每天的那三十分鐘，成了你們最珍惜的時間。${hl(g.n)} 跟你說她這陣子的${g.work}，你跟她說球隊的趣事，你們隔著螢幕笑了很久。`,
       b:`時差讓那三十分鐘越來越難湊。有時是你剛比完賽累到睡著，有時是視訊那頭的她累得睜不開眼。你們都很努力，但距離就是距離。`},
      {t:'利用休兵日飛回去看她',
       g:`你搭了十幾個小時的飛機，只為了陪她吃一頓早餐。她在機場看到你時，手上的咖啡差點打翻。`,
       b:`班機延誤了六個小時，你到的時候只剩下兩個小時。你們在機場的咖啡店坐了一下，又得各自回去。`},
      {t:'休賽季全部留給她，住進她的生活',
       g:`整整三個月，你住進她的生活：陪她通勤、認識她的同事、在她加班時等她下班。離開那天，她說：「現在，我想像你的時候，終於有畫面了。」`,
       b:`你闖進她忙碌的生活，她每天都要分心照顧你。第三週她說：「我好想你，可是我現在真的沒有時間陪你。」`}],
      m=>`成功率 ${LOVE_ODDS[m]}%｜感情值 +${BOND_GAIN[m]}${BOND_FAIL[m]?`｜失敗 −${BOND_FAIL[m]}`:''}`,(m,good,o)=>{
      addBond(good?BOND_GAIN[m]:-BOND_FAIL[m]); const gt=good?modeGain(m):''; if(good)board(1);
      card(good?'good':'bad','遠距',`${good?o.g:o.b}${gt?'——'+gt:''}`);
      if(L.bond<30&&chance(50)){
        const k=pick(POS_AB[S.pos]),gk=addAb(k,-2); board(1);
        const wasMarried=L.st==='married'; endRelation('far');
        card('bad',wasMarried?'離婚':'分手',`${hl(g.n)} 打電話來，語氣很平靜，聽得出來她已經想了很久：「我們都值得一個能在身邊的人。」${wasMarried?'你們和平離婚。':'你們分手了。'}——${abGainTxt(k,-1,gk)}。`);
      }
      if(good&&m==='bold'&&L.pid===g.id&&L.apart&&L.ch>=3){ askJoin(g,done); return; }
      done(); }));
}

/* ---------- 外遇誘惑：機率隨感情值下降而升高；對象是你曾經心動過的人 ---------- */
function temptation(g,done){
  const L=S.love, cands=affairPool();
  if(!cands.length)return false;
  /* 好感度越高，越可能是她 */
  const tot=cands.reduce((a,id)=>a+L.aff[id],0); let r=R()*tot, tid=cands[0];
  for(const id of cands){ r-=L.aff[id]; if(r<0){ tid=id; break; } }
  const t=GIRL[tid], dating=L.st==='dating', pc=playerCountry();
  const where=t.c===pc?`${t.n} 收工後傳訊息約你去喝一杯。`:`${t.n} 傳訊息說，她這週剛好到 ${COUNTRY_N[pc]} 出差，問你要不要出來喝一杯。`;
  choose(`<span class="ev-h">誘惑｜${t.n}（${t.job}）</span><small>${where}你們之前差一點就走到一起了，你一直都記得她笑起來的樣子。你看著那則訊息很久——你很清楚，你想去的不只是那杯酒。<br>${dating?`求婚值 ${L.prop||0}／100｜`:''}感情值 ${L.bond}／100</small>`,[
    {t:'赴約（賭一把）',warn:true,s:`感情值 −10｜沒被抓到＝體力提升｜被抓到＝能力下跌、${dating?'感情':'婚姻'}危機`,f:()=>{
      L.affairs++; addBond(-10);
      if(chance(55)){ const gt=loveGainTxt('sta',2); board(1);
        card('bad','深夜',`沒有人拍到。你回到家時，${hl(g.n)} 已經睡了，桌上攤著她明天的工作行程，旁邊留了一盞小燈給你。——${gt}。（這是你自己的選擇，這條路不會有好結局）`); done(); }
      else if(dating)loveCaughtDating(done); else loveCaught(done); }},
    {t:`回訊息：「我要回家了。」`,main:true,s:`感情值 +${RESIST_BOND}${dating?`、求婚值 +${RESIST_PROP}`:''}，絕對不虧`,f:()=>{
      const b0=L.bond, p0=L.prop||0; addBond(RESIST_BOND); if(dating)addProp(RESIST_PROP);
      const gt=loveGainTxt('sta',1); board(1);
      card('good','回家',`你把手機扣在桌上，只回了一句「我要回家了」，結了帳就走。回家的路上，你傳訊息問 ${hl(g.n)}：今天的${g.work}順不順利？她回了一長串，最後一句是：「你今天怎麼這麼乖？」你看著那行字，笑了很久。<br>${dating?`求婚值 ${p0} → <b class="up">${L.prop}</b>｜`:''}感情值 ${b0} → <b class="up">${L.bond}</b>——${gt}。`); done(); }}]);
  return true;
}
function scumCheck(){
  const L=S.love; let extra='';
  if(L.caught>=2){
    if(!S.traits.scum){ S.traits.scum=true;
      card('bad','隱藏屬性解鎖：渣男','第二次被逮個正著。從今以後你在球迷心中的形象定型了——<b class="dn">每次劈腿/外遇被抓到，全能力 −5</b>。'); }
    POS_AB[S.pos].forEach(k=>{ S.ab[k]=clamp(S.ab[k]-5,1,80); });
    extra='<b class="dn">全能力 −5</b>（渣男的代價）。'; }
  return extra;
}
/* 分手／離婚的共用收尾。被同一個人抓到兩次，或跟同一個人第二次分開（復合只有一次機會），她就不會再回來。
   how：分開的原因，重逢時用來選文案（wait／left／far／cheat）。 */
export function endRelation(how){
  const L=ensureLove(), id=L.pid;
  if(id){ const was=L.past[id], n=(was?was.n:0)+1;
    L.past[id]={yr:S.year,ch:L.ch||0,n,how:how||'',wed:L.st==='married'||!!(was&&was.wed)};
    if(n>REUNION_MAX&&!L.burned.includes(id))L.burned.push(id); }
  if(L.st==='married'){ L.exes.push({id,name:L.partner,kids:L.kids}); L.st='divorced'; L.kids=0; }
  else L.st=L.exes.length?'divorced':'single';
  if(id){ L.aff[id]=0; if((L.hurt[id]||0)>=2&&!L.burned.includes(id))L.burned.push(id); }
  L.partner=null; L.pid=null; L.dyrs=0; L.ch=0; L.prop=0; L.proposed=false; L.bond=0; L.apart=false; L.withYrs=0; L.apartYrs=0;
  L.knot=false; L.xrYr=null; L.relRef=0;
}
export function divorceRec(){ endRelation(); }
export function loveCaught(next){
  const L=S.love, g=GIRL[L.pid]; L.caught++; L.hurt[L.pid]=(L.hurt[L.pid]||0)+1;
  const kk=pick(POS_AB[S.pos]); const gk=addAb(kk,-3);
  const extra=scumCheck(); board(1);
  card('bad','頭版醜聞',`狗仔的照片鋪滿了整個版面。贊助商連夜撤下你的廣告，你在記者會上鞠躬九十度，閃光燈亮成一片。${abGainTxt(kk,-1,gk)}。${extra}`);
  choose(`${g.n} 已經找好了律師。她說，這段婚姻要不要結束，由她來決定`,[
    {t:'把一切說清楚，請她給一次機會',s:'由她決定（40%）｜失敗＝再扣能力並離婚',f:()=>{
      if(chance(40)){ L.bond=Math.min(L.bond,30);
        card('info','她的決定',`${hl(g.n)} 聽你說完，沉默了很久：「我留下來，不是因為原諒你，是因為我還沒想好要不要原諒你。」婚姻還在，但有些東西，再也回不去了。感情值 ${L.bond}。`); next(); }
      else{ const k2=pick(POS_AB[S.pos]); const g2=addAb(k2,-2); endRelation('cheat'); board(1);
        card('bad','她的決定',`她聽完只是搖了搖頭。隔天，律師的文件就寄到了。${hl(g.n)} 對外的聲明只有一句：「我要繼續過我自己的人生。」——${abGainTxt(k2,-1,g2)}。`); next(); } }},
    {t:'簽字離婚',f:()=>{ endRelation('cheat');
      card('bad','離婚',`你在文件上簽下名字。${hl(g.n)} 對外的聲明只有一句：「祝彼此安好。」`); next(); }}]);
}
export function loveCaughtDating(next){
  const L=S.love, g=GIRL[L.pid]; L.caught++; L.cheatYr=S.year; L.hurt[L.pid]=(L.hurt[L.pid]||0)+1;
  const kk=pick(POS_AB[S.pos]); const gk=addAb(kk,-3);
  const extra=scumCheck(); board(1);
  card('bad','劈腿曝光',`照片流出，時間、地點，對得整整齊齊。${abGainTxt(kk,-1,gk)}。${extra}`);
  choose(`${g.n} 已讀不回三天後，答應見一面`,[
    {t:'道歉，請她再給一次機會',s:'由她決定（40%）｜失敗＝再扣能力並分手',f:()=>{
      if(chance(40)){ L.bond=Math.min(L.bond,30);
        card('info','她的決定',`她把想說的話都說完了，最後只留下一句：「這是最後一次。」感情保住了，可是信任上的那道裂痕，怎麼樣都補不回來。感情值 ${L.bond}。`); next(); }
      else{ const k2=pick(POS_AB[S.pos]); const g2=addAb(k2,-2); endRelation('cheat'); board(1);
        card('bad','她的決定',`她把你送的東西整理成一箱寄了回來，封鎖了所有的聯絡方式。${hl(g.n)} 的生活照常往前走，沒有你——${abGainTxt(k2,-1,g2)}。`); next(); } }},
    {t:'坦然分手',f:()=>{ endRelation('cheat');
      card('bad','分手',`${hl(g.n)} 的限時動態只有一張她工作時的照片，配了兩個字：「繼續。」`); next(); }}]);
}
export function loveGainTxt(k,amt){ /* 戀愛事件加點:機制同事件卡(addAbStat);回傳誠實的顯示文字 */
  if(!POS_AB[S.pos].includes(k))k=POS_AB[S.pos][0];
  const before=S.pendStat||0;
  const g=addAbStat(k,amt);
  const over=(S.pendStat||0)-before;
  const used=Math.max(0,Math.round(amt)-over); /* 真正吃進能力的點數,其餘為溢出 */
  if(g>0&&over>0)return `${abGainTxt(k,used,g)}，溢出 ${over} 點轉為${statBonusTxt(over)}`;
  if(g>0)return abGainTxt(k,used,g);
  if(over>0)return `${ABL[k]} 已達潛力上限，${Math.round(amt)} 點全數轉為${statBonusTxt(over)}`;
  return abGainTxt(k,amt,0);
}
