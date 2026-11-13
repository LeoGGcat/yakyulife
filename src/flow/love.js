import {S} from '../core/state.js?v=2.1.0';
import {R, pick, chance, clamp} from '../core/rng.js?v=2.1.0';
import {ABL, POS_AB} from '../data/abilities.js?v=2.1.0';
import {card, choose, board} from '../ui/dom.js?v=2.1.0';
import {addAb, addAbStat, statBonusTxt, abGainTxt} from '../engine/ability.js?v=2.1.0';
import {GIRLS, GIRL, COUNTRY_N, TW_JOBS} from '../data/girls.js?v=2.1.0';

/* ================= 戀愛系統（v2.1.0 重置） =================
   流程：好感事件（三選一）→ 好感滿 100 → 告白 75% → 交往（她的三章故事，任一章後可求婚）
        → 結婚（剩下的章節在婚內走完）。跨國轉聯盟時觸發旅外事件，分成「一起走」與「遠距」兩條路線。
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
  const twId={cheer:null,reporter:'ruotong',teacher:'peici',wbb:'yongen',lawyer:'yunxi'};
  const TW=shuffled(TW_JOBS).slice(0,3).map(j=>j==='cheer'?(chance(50)?'haisha':'xiaoqing'):twId[j]);
  const of=c=>shuffled(GIRLS.filter(g=>g.c===c).map(g=>g.id)).slice(0,3);
  return {TW,JP:of('JP'),US:of('US')};
}
export function ensureLove(){
  const L=S.love;
  if(!L.cast)L.cast=drawCast();
  ['aff','scn','met','hurt'].forEach(k=>{ if(!L[k])L[k]={}; });
  if(!L.burned)L.burned=[];
  if(L.bond===undefined)L.bond=0;
  if(L.ch===undefined)L.ch=0;
  return L;
}
export function partnerGirl(){ const L=S.love; return L&&L.pid?GIRL[L.pid]:null; }
/* 外遇人選：當地入選、不是伴侶、不是馮海莎 */
export function affairPool(){
  const L=ensureLove();
  return (L.cast[playerCountry()]||[]).filter(id=>id!==L.pid&&!GIRL[id].safe);
}
export function affairChance(bond){ return clamp(Math.round(5+(100-bond)*0.3),5,35); }
export function proposalChance(ch,bond){ return clamp(40+15*ch+Math.round((bond-BOND_START)/2),20,95); }

/* 三選一的選項：好感事件、章節、旅外路線共用 */
function modeOpts(labels,sFor,pick){
  return ['bold','norm','safe'].map((m,i)=>({t:labels[2-i],warn:m==='bold',main:m==='norm',center:true,
    s:sFor(m),f:()=>pick(m,chance(LOVE_ODDS[m]))}));
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
function singleYear(next){
  const L=S.love, pc=playerCountry();
  if(!chance(PRE_MARRIAGE_FIRE)){ next(); return; }
  const pool=(L.cast[pc]||[]).filter(id=>!L.burned.includes(id));
  if(!pool.length){ next(); return; }
  const g=GIRL[pick(pool)];
  if((L.aff[g.id]||0)>=100){ confess(g,next); return; }
  affectionScene(g,next);
}
function formerOf(g){ return S.love.exes.find(e=>e.id===g.id||e.name===g.n)||null; }
function affectionScene(g,next){
  const L=S.love;
  if(!L.met[g.id]){ L.met[g.id]=1;
    card('info',`相遇｜${g.n}（${g.job}）`,g.meet); }
  else if(L.exHint!==g.id&&(formerOf(g)||L.hurt[g.id])){ L.exHint=g.id;
    card('info','再次相遇',`你和 ${hl(g.n)} 又在同一個場合遇到了。上次走散之後，她的${g.job}之路一直沒有停下來。這一次，要從頭開始。`); }
  const n=L.scn[g.id]||0; L.scn[g.id]=n+1;
  const sc=g.sc[n%3], aff=L.aff[g.id]||0;
  choose(`<span class="ev-h">戀愛｜${g.n}（${g.job}）</span><small>${sc.i}<br>好感度 ${aff}／100</small>`,
    modeOpts(sc.o,m=>m==='bold'?`成功率 ${LOVE_ODDS.bold}%｜好感度直接滿｜失敗 −${AFF_BOLD_FAIL}`
      :`成功率 ${LOVE_ODDS[m]}%｜好感度 +${AFF_GAIN[m]}`,(m,good)=>{
      const before=L.aff[g.id]||0;
      L.aff[g.id]=good?Math.min(100,before+AFF_GAIN[m]):(m==='bold'?Math.max(0,before-AFF_BOLD_FAIL):before);
      const gt=good?modeGain(m):''; if(good)board(1);
      card(good?'good':'bad',`戀愛｜${g.n}（${MODE_TAG[m]}）`,
        `${good?sc.g:sc.b}<br>好感度 ${before} → <b class="${L.aff[g.id]>=before?'up':'dn'}">${L.aff[g.id]}</b>${gt?'｜'+gt:''}`);
      if(L.aff[g.id]>=100)confess(g,next); else next();
    }));
}
function confess(g,next){
  const L=S.love, former=formerOf(g);
  choose(`<span class="ev-h">告白｜${g.n}</span><small>好感度已滿。${former?'你們曾經走散過，這次她會怎麼想？':'有些話，該說出口了。'}</small>`,[
    {t:'告白',main:true,s:`成功率 ${CONFESS_RATE}%｜失敗不扣好感，下次遇到她可以再說`,f:()=>{
      if(chance(CONFESS_RATE)){
        L.st='dating'; L.pid=g.id; L.partner=g.n; L.dyrs=0; L.datedTimes=(L.datedTimes||0)+1;
        L.ch=0; L.bond=BOND_START; L.herC=playerCountry(); L.lastC=L.herC; L.apart=false; L.withYrs=0; L.apartYrs=0;
        const gt=loveGainTxt('sta',2); board(1);
        card('gold',former?'重新開始':'交往',`${g.conf.ok}<br>你們開始交往了——${gt}。`);
        const hasAnyKids=L.kids+L.exes.reduce((s,e)=>s+(e.kids||0),0)>0;
        if(L.datedTimes>=3&&!hasAnyKids&&!S.traits.married&&!S.traits.confidante){ S.traits.confidante=true;
          card('gold','隱藏稱號：閨中密友','第三段戀情了。每一段都是很好的人，只是每一次，你們都走向了不同的路。'); board(1); }
      }else card('bad','告白失敗',`${g.conf.no}<br>好感度保留，你們還是朋友。`);
      next(); }},
    {t:'再等等',s:'好感度保留，下次遇到她再說',f:()=>{
      card('info','未完待續','你把那句話又吞了回去。'); next(); }}]);
}

/* ---------- 交往中／已婚 ---------- */
function coupleYear(next){
  const L=S.love, g=GIRL[L.pid];
  if(L.st==='dating'){
    L.dyrs=(L.dyrs||0)+1;
    const y=L.dyrs;
    /* 交往太久不結婚 → 分手風險逐年升高；劈腿被抓的那年 +30% */
    const cheatPen=(L.cheatYr===S.year-1||L.cheatYr===S.year)?30:0;
    const bkP=(y>=4?20+(y-4)*15:0)+cheatPen;
    if(bkP>0&&chance(bkP)){
      const k1=pick(POS_AB[S.pos]),k2=pick(POS_AB[S.pos]);
      const g1=addAb(k1,-3),g2=addAb(k2,-3); board(1);
      endRelation();
      card('bad','分手',`${cheatPen?'那晚的事她其實都知道。':''}交往 ${y} 年，你一直沒有給答案。${hl(g.n)} 說：「我的人生不會停在原地等。」她搬走那天，把鑰匙放在玄關。整個休賽季你魂不守舍——${abGainTxt(k1,-1,g1)}、${abGainTxt(k2,-1,g2)}。`);
      next(); return; }
  }
  if(L.apart){ longDistance(g,next); return; }
  const ask=()=>L.st==='dating'?proposalAsk(next):next();
  if(L.withYrs===1||L.withYrs===2){ withRoute(g,ask); return; }
  if(L.st==='dating'){
    if(L.ch<3&&chance(PRE_MARRIAGE_FIRE)){ chapter(g,ask); return; }
    if(chance(affairChance(L.bond))&&temptation(g,ask))return;
    if(chance(30)){ const gt=loveGainTxt('sta',1); addBond(5); board(1);
      if(chance(50))card('good','明星賽放閃',`明星賽轉播鏡頭掃到看台上的 ${hl(g.n)}，她正低頭回工作訊息，被拍到時笑著對鏡頭揮了揮手機。隔天甜上熱搜——${gt}。`);
      else card('good','日常',`沒有大新聞。只是客場回來那晚，你們各自說了這一週的事：你的比賽，她的${g.job}工作。——${gt}。`); }
    ask(); return;
  }
  /* 已婚：剩下的章節在婚內走完 */
  if(L.ch<3&&chance(60)){ chapter(g,next); return; }
  if(chance(affairChance(L.bond))&&temptation(g,next))return;
  const fire=L.kids===0?40:30;
  if(!chance(fire)){ next(); return; }
  if(L.kids<4&&chance([65,45,30,20][L.kids])){ /* 生子：第一胎最優先，越生越少 */
    L.kids++; const kk=pick(POS_AB[S.pos]); const gt=loveGainTxt(kk,2); board(1);
    card('gold','新生命',`${hl(g.n)} 平安生下你們的第 ${hl(L.kids)} 個孩子。你們排好了輪流顧孩子的表，她的${g.job}工作和你的球季一樣重要。當了${L.kids>1?'幾次':''}爸爸的男人，眼神都不一樣了——${gt}。`);
    next(); return; }
  if(chance(50)&&L.kids>0){ const gt=loveGainTxt('sta',1); addBond(5); board(1);
    card('good','球場邊的父親',`你被拍到賽前隔著護網教孩子怎麼戴手套，影片配文「最強棒球教室」瘋傳。那天 ${hl(g.n)} 在工作，接孩子的是你——${gt}。`); next(); return; }
  const gt=loveGainTxt('sta',1); addBond(5); board(1);
  card('good','結婚紀念日',`結婚紀念日，你們各自排開了工作，回到當年辦婚禮的地方。${hl(g.n)} 說：「明年換我挑地方。」——${gt}。`); next();
}

/* 她的故事：三章，交往或婚後都會走。你的選項只影響感情值；她的結果（end）一定會發生。 */
function chapter(g,done){
  const L=S.love, i=L.ch, c=g.ch[i];
  choose(`<span class="ev-h">${g.n}的故事｜第 ${i+1} 章　${c.t}</span><small>${c.i}<br>感情值 ${L.bond}／100</small>`,
    modeOpts(c.o,m=>`成功率 ${LOVE_ODDS[m]}%｜感情值 +${BOND_GAIN[m]}${BOND_FAIL[m]?`｜失敗 −${BOND_FAIL[m]}`:''}`,(m,good)=>{
      const b0=L.bond; addBond(good?BOND_GAIN[m]:-BOND_FAIL[m]);
      const gt=good?modeGain(m):''; if(good)board(1);
      L.ch=i+1;
      card(good?'good':'bad',`${g.n}的故事｜第 ${i+1} 章　${c.t}`,
        `${good?c.g:c.b}<br>${hl(g.n)}：${c.end}<br>感情值 ${b0} → <b class="${L.bond>=b0?'up':'dn'}">${L.bond}</b>${gt?'｜'+gt:''}`);
      if(L.ch===3)card('gold',`${g.n}的目標`,`${hl(g.n)} 做到了：${g.goal}。那是她一步一步走出來的路，你只是一直在旁邊。`);
      done();
    }));
}
export function proposalAsk(next){
  const L=S.love, g=GIRL[L.pid];
  if(L.st!=='dating'||!g||L.apart||L.ch<1){ next(); return; }
  const rate=proposalChance(L.ch,L.bond);
  choose(`交往第 ${L.dyrs} 年——要向 ${g.n} 求婚嗎？`,[
    {t:'求婚',warn:true,s:`成功率 ${rate}%｜成功：體力提升、本季受傷機率 −5%｜失敗：感情值 −5`,f:()=>{
      if(!chance(rate)){ addBond(-5);
        card('info','她的答案',`${hl(g.n)} 握著你的手想了很久：${g.propNo}<br>感情值 −5。${L.ch<3?'她的故事還在往下走。':''}`); next(); return; }
      /* 與前妻復合後再婚：共同孩子回到目前家庭，前妻紀錄不再重複顯示。 */
      const fi=L.exes.findIndex(e=>e.id===g.id||e.name===g.n);
      const reunitedKids=fi>=0?(L.exes[fi].kids||0):0;
      if(fi>=0)L.exes.splice(fi,1);
      L.st='married'; L.kids=reunitedKids; L.dyrs=0;
      const gTxt=loveGainTxt('sta',2)+'、'; S.tmpInj-=5; board(1);
      card('gold','婚禮',`你沒有用大螢幕，也沒有找鏡頭。你在你們常去的那家店問她。${hl(g.n)} 笑了：「好。不過婚禮在哪裡辦，我來決定。」休賽季完婚——${gTxt}本季受傷機率 <b class="up">−5%</b>。${L.ch<3?'<br>婚後，她的故事還會繼續。':''}`); next(); }},
    {t:'再等等',main:true,s:'交往越久，分手風險越高',f:()=>{
      card('info','再等等',`${hl(g.n)} 沒有問。她明天一早還有${g.job}的工作。`); next(); }}]);
}

/* ---------- 旅外：跨國轉聯盟時觸發 ---------- */
function abroadEvent(next){
  const L=S.love, g=GIRL[L.pid], pc=playerCountry();
  if(L.apart&&pc===L.herC){ /* 回到她所在的國家：團聚 */
    L.apart=false; L.apartYrs=0; addBond(10); const gt=loveGainTxt('sta',1); board(1);
    card('gold','團聚',`你回到 ${COUNTRY_N[pc]}。${hl(g.n)} 來機場接你，第一句話是她最近的${g.job}工作。分開的這幾年，你們都長大了——${gt}，感情值 +10。`);
    next(); return; }
  if(L.apart){ addBond(-5);
    card('info','更遠了',`你轉往 ${COUNTRY_N[pc]}，${hl(g.n)} 還在 ${COUNTRY_N[L.herC]}。你們重新算了一次時差。感情值 −5。`);
    next(); return; }
  const home=pc===g.c; /* 這次是回她的家鄉 */
  const p=clamp(Math.round(g.goP+(L.bond-60)/2+(home?30:0)),5,90);
  const rel=L.st==='married'?'你的妻子':'女友';
  choose(`<span class="ev-h">旅外｜${g.n}</span><small>你要去 ${COUNTRY_N[pc]} 打球了。${rel} ${g.n} 在 ${COUNTRY_N[L.herC]} 有她自己的${g.job}工作。</small>`,[
    {t:'問她願不願意一起走',s:`由她決定（約 ${p}%）｜一起走＝同行路線，不走＝遠距路線`,f:()=>{
      if(chance(p))goWith(g,home); else stayApart(g,home,true);
      next(); }},
    {t:'告訴她：你的人生在這裡，留下來沒關係',main:true,s:'直接走遠距路線｜感情值 +5',f:()=>{
      addBond(5); stayApart(g,home,false); next(); }}]);
}
function goWith(g,home){
  const L=S.love; L.herC=playerCountry(); L.withYrs=1; L.apart=false;
  const gt=loveGainTxt('sta',1); board(1);
  card('gold','一起出發',`${home?`${hl(g.n)} 說：「回${COUNTRY_N[g.c]}？那是我家耶。」她比你還早開始打包。`:g.go}——${gt}。`);
}
function stayApart(g,home,asked){
  const L=S.love; L.apart=true; L.apartYrs=0;
  card('info','各自的戰場',`${asked?'她想了一個晚上。':''}${home?`${hl(g.n)} 在 ${COUNTRY_N[L.herC]} 已經有了自己的事業，她選擇留下。`:g.stay}你們決定試試遠距離。`);
}
/* 同行路線：第一年在異鄉重新開始，第二年她站穩腳步 */
function withRoute(g,done){
  const L=S.love, C=COUNTRY_N[L.herC];
  if(L.withYrs===2){ L.withYrs=3; addBond(10); const gt=loveGainTxt('sta',1); board(1);
    card('gold','站穩腳步',`${hl(g.n)} 在 ${C} 接到了第一份正式的${g.job}工作。她傳了一張照片給你：她的新名片，印著當地的文字。——${gt}，感情值 +10。`);
    done(); return; }
  L.withYrs=2;
  choose(`<span class="ev-h">同行｜在${C}重新開始</span><small>${g.n} 跟著你來到 ${C}。語言不通、朋友不在，她的${g.job}工作要從零開始。<br>感情值 ${L.bond}／100</small>`,
    modeOpts(['每天下班陪她吃晚餐','陪她上語言課、跑面試','把休賽季空出來，陪她認識這座城市'],
      m=>`成功率 ${LOVE_ODDS[m]}%｜感情值 +${BOND_GAIN[m]}${BOND_FAIL[m]?`｜失敗 −${BOND_FAIL[m]}`:''}`,(m,good)=>{
      addBond(good?BOND_GAIN[m]:-BOND_FAIL[m]); const gt=good?modeGain(m):''; if(good)board(1);
      card(good?'good':'bad','異鄉',good
        ?`${hl(g.n)} 交到了第一個當地的朋友，是在面試場合認識的同行。她說：「我開始喜歡這裡了。」${gt?'——'+gt:''}`
        :`她說你不用一直顧著她，她得學會自己在這裡生活。你這才發現，她比你想的還堅強。`);
      done(); }));
}
/* 遠距路線：每年一次，感情值自然流失；太低時她可能提出結束 */
function longDistance(g,next){
  const L=S.love, pc=playerCountry(), tz=(TZ[pc]||{})[L.herC]||0;
  L.apartYrs=(L.apartYrs||0)+1; addBond(-10);
  choose(`<span class="ev-h">遠距｜第 ${L.apartYrs} 年</span><small>你在 ${COUNTRY_N[pc]}，${g.n} 在 ${COUNTRY_N[L.herC]}${tz?`，時差 ${tz} 小時`:''}。距離本身每年都在消耗感情（−10）。<br>感情值 ${L.bond}／100</small>`,
    modeOpts(['每天固定時間視訊','休兵日飛回去看她','休賽季全部留給她，住進她的生活'],
      m=>`成功率 ${LOVE_ODDS[m]}%｜感情值 +${BOND_GAIN[m]}${BOND_FAIL[m]?`｜失敗 −${BOND_FAIL[m]}`:''}`,(m,good)=>{
      addBond(good?BOND_GAIN[m]:-BOND_FAIL[m]); const gt=good?modeGain(m):''; if(good)board(1);
      card(good?'good':'bad','遠距',good
        ?`${hl(g.n)} 跟你說她這陣子的${g.job}工作，你們隔著螢幕笑了很久。${gt?'——'+gt:''}`
        :`視訊那頭的她累得睜不開眼。你們都很努力，但距離就是距離。`);
      if(L.bond<30&&chance(50)){
        const k=pick(POS_AB[S.pos]),gk=addAb(k,-2); board(1);
        const wasMarried=L.st==='married'; endRelation();
        card('bad',wasMarried?'離婚':'分手',`${hl(g.n)} 打來，語氣很平靜：「我們都值得一個在身邊的人。」${wasMarried?'你們和平離婚。':'你們分手了。'}——${abGainTxt(k,-1,gk)}。`);
      }
      next(); }));
}

/* ---------- 外遇誘惑：機率隨感情值下降而升高 ---------- */
function temptation(g,done){
  const L=S.love, cands=affairPool();
  if(!cands.length)return false;
  const t=GIRL[pick(cands)], dating=L.st==='dating';
  choose(`${t.n} 收工後約你去喝一杯。你知道你想去的不只是那杯酒。`,[
    {t:'赴約（賭一把）',warn:true,s:`沒被抓到＝體力提升｜被抓到＝能力下跌、${dating?'感情':'婚姻'}危機`,f:()=>{
      L.affairs++; addBond(-10);
      if(chance(55)){ const gt=loveGainTxt('sta',2); board(1);
        card('bad','深夜',`沒有人拍到。回家時 ${hl(g.n)} 已經睡了，桌上留著她明天的工作行程。——${gt}。（這是你自己的選擇，這條路不會有好結局）`); done(); }
      else if(dating)loveCaughtDating(done); else loveCaught(done); }},
    {t:`回訊息：「我要回家了。」`,main:true,s:'感情值 +5，絕對不虧',f:()=>{
      addBond(5); const gt=loveGainTxt('sta',1); board(1);
      card('good','回家',`你把手機扣在桌上，傳訊息問 ${hl(g.n)} 今天的工作順不順利。——${gt}。`); done(); }}]);
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
/* 分手／離婚的共用收尾。被同一個人抓到兩次，她就不會再回來。 */
export function endRelation(){
  const L=S.love, id=L.pid;
  if(L.st==='married'){ L.exes.push({id,name:L.partner,kids:L.kids}); L.st='divorced'; L.kids=0; }
  else L.st=L.exes.length?'divorced':'single';
  if(id){ L.aff[id]=0; if((L.hurt[id]||0)>=2&&!L.burned.includes(id))L.burned.push(id); }
  L.partner=null; L.pid=null; L.dyrs=0; L.ch=0; L.bond=0; L.apart=false; L.withYrs=0; L.apartYrs=0;
}
export function divorceRec(){ endRelation(); }
export function loveCaught(next){
  const L=S.love, g=GIRL[L.pid]; L.caught++; L.hurt[L.pid]=(L.hurt[L.pid]||0)+1;
  const kk=pick(POS_AB[S.pos]); const gk=addAb(kk,-3);
  const extra=scumCheck(); board(1);
  card('bad','頭版醜聞',`狗仔的照片鋪滿版面。贊助商緊急撤圖，你在鏡頭前鞠躬 90 度。${abGainTxt(kk,-1,gk)}。${extra}`);
  choose(`${g.n} 已經找好律師了。她說，要不要結束，由她決定`,[
    {t:'把一切說清楚，請她給一次機會',s:'由她決定（40%）｜失敗＝再扣能力並離婚',f:()=>{
      if(chance(40)){ L.bond=Math.min(L.bond,30);
        card('info','她的決定',`${hl(g.n)} 聽完了，說：「我留下來，不是因為原諒你，是因為我還沒決定。」婚姻還在，但有些東西回不去了。感情值 ${L.bond}。`); next(); }
      else{ const k2=pick(POS_AB[S.pos]); const g2=addAb(k2,-2); endRelation(); board(1);
        card('bad','她的決定',`她聽完只是搖頭。隔天律師的文件就到了。${hl(g.n)} 的聲明只有一句：「我要繼續過我的人生。」——${abGainTxt(k2,-1,g2)}。`); next(); } }},
    {t:'簽字離婚',f:()=>{ endRelation();
      card('bad','離婚',`你在文件上簽了名。${hl(g.n)} 的聲明只有一句：「祝彼此安好。」`); next(); }}]);
}
export function loveCaughtDating(next){
  const L=S.love, g=GIRL[L.pid]; L.caught++; L.cheatYr=S.year; L.hurt[L.pid]=(L.hurt[L.pid]||0)+1;
  const kk=pick(POS_AB[S.pos]); const gk=addAb(kk,-3);
  const extra=scumCheck(); board(1);
  card('bad','劈腿曝光',`照片流出，時間軸對得整整齊齊。${abGainTxt(kk,-1,gk)}。${extra}`);
  choose(`${g.n} 已讀不回三天後，答應見一面`,[
    {t:'道歉，請她再給一次機會',s:'由她決定（40%）｜失敗＝再扣能力並分手',f:()=>{
      if(chance(40)){ L.bond=Math.min(L.bond,30);
        card('info','她的決定',`她把話說完，最後說：「最後一次。」感情保住了，但信任的裂痕補不回來。感情值 ${L.bond}。`); next(); }
      else{ const k2=pick(POS_AB[S.pos]); const g2=addAb(k2,-2); endRelation(); board(1);
        card('bad','她的決定',`她把你送的東西整箱寄回，封鎖了所有聯絡方式。${hl(g.n)} 的生活照常往前走——${abGainTxt(k2,-1,g2)}。`); next(); } }},
    {t:'坦然分手',f:()=>{ endRelation();
      card('bad','分手',`${hl(g.n)} 的限時動態只有一張她工作的照片，配文：「繼續。」`); next(); }}]);
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
