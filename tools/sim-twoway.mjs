/* 二刀流的離線校準模擬：高中 → 選秀／升學 → 職業 → 引退，整段由「玩家行為原型」驅動。
   先跑 tools/build-headless.mjs 產出無畫面副本，再跑這支。

     node tools/build-headless.mjs /tmp/hl
     N=600 node tools/sim-twoway.mjs /tmp/hl /tmp/tw.json

   環境變數：N（每條路線的樣本數）、LANES、SEEDBASE、GRID（策略等權而非依母體權重抽樣）。

   輸出每段生涯在各聯盟的「評價分零件」——careerScore 的原始值、honorScore、posTierK
   與該聯盟的門檻——這樣就能離線換任意 (Kbase, Khonor, HOF_TH_K) 重算名人堂率，
   不必為了掃參數重跑模擬。 */
const ROOT=process.argv[2]||'/tmp/hl';
const OUT=process.argv[3]||'/tmp/tw.json';
await import(ROOT+'/shim.js');
const stM    =await import(ROOT+'/core/state.js');
const rng    =await import(ROOT+'/core/rng.js');
const ability=await import(ROOT+'/engine/ability.js');
const career =await import(ROOT+'/engine/career.js');
const phases =await import(ROOT+'/flow/phases.js');
const {LV}   =await import(ROOT+'/data/teams.js');
const AB     =await import(ROOT+'/data/abilities.js');
const ECON   =await import(ROOT+'/data/economy.js');
const timeline=await import(ROOT+'/ui/timeline.js');

/* ───────── 行為原型（沿用 v1.5.9 校準時的母體模型） ─────────
   期望值背景：沒有素質時「保守」最優，拿到天才＋大心臟之後「全力」才變成最優解。
   所以最佳線是「先穩到天才 → 養大心臟 → 全押」，不是從頭賭到尾。 */
const ARCH={
  '激進':  {event:()=>'bold', effort:'全力投', gamble:true,  ambition:true,  school:false},
  '普通':  {event:()=>'norm', effort:'普通投', gamble:false, ambition:true,  school:true },
  '保守':  {event:()=>'safe', effort:'養生球', gamble:false, ambition:false, school:true },
  '混合':  {event:S=>{
      if(S.traits.glass)return 'safe';
      if(S.traits.clutch)return 'bold';
      if(S.traits.genius||S.traits.late)return S.age<25?'bold':'norm';
      return 'safe';
    }, effort:'普通投', gamble:false, ambition:true, school:true},
  '混合惜身':{event:S=>{
      if(S.traits.glass||S.bigInj>=1)return 'safe';
      if(S.traits.clutch)return 'bold';
      if(S.traits.genius||S.traits.late)return S.age<25?'bold':'norm';
      return 'safe';
    }, effort:'養生球', gamble:false, ambition:true, school:true},
  '看心情':{event:()=>{const r=rng.R();return r<0.30?'bold':r<0.75?'norm':'safe';},
    effort:'普通投', gamble:null, ambition:null, school:null},
};
const EVENT_W=[['激進',0.15],['混合',0.20],['混合惜身',0.15],['看心情',0.25],['普通',0.15],['保守',0.10]];
const ALLOC_W=(process.env.FARM?[['刷天才',1]]:[['會玩',0.35],['普通玩',0.45],['亂玩',0.20]]);

let A=ARCH['普通'], ALLOC='會玩';
const has=(t,...ws)=>ws.some(w=>String(t||'').includes(w));
const txt=o=>String((o&&o.t)||'').replace(/<[^>]+>/g,'');
const findT=(opts,...ws)=>opts.find(o=>has(txt(o),...ws));
const mainOf=opts=>opts.find(o=>o.main)||opts[0];
const AF=k=>A[k]===null?rng.R()<0.5:A[k];

globalThis.__autoChoose=function(title,opts){
  if(globalThis.__sample)globalThis.__sample();
  if(!opts||!opts.length)return;
  const S=stM.S;
  let pick=null;
  if(has(title,'事件｜')){
    const mode=(typeof A.event==='function')?A.event(S):A.event;
    pick=opts[{bold:0,norm:1,safe:2}[mode]]||opts[1];
  }
  /* 觸發 B:高中解鎖天才後的二刀流邀請。TWOFFER=accept 才接受，預設婉拒。 */
  else if(has(title,'天賦覺醒')) pick=(process.env.TWOFFER==='accept')?mainOf(opts):opts[opts.length-1];
  else if(has(title,'請決定今年的事件組成')) pick=findT(opts,'訓練至上')||mainOf(opts);
  /* 開季投球規劃／投打配比：手臂已經在痛時，只有激進派還硬催 */
  else if(has(title,'開季投球規劃','開季投打配比')){
    const hurt=has(title,'手肘隱隱作痛','手臂略感疲勞');
    const reckless=(typeof A.event==='function'?A.event(S):A.event)==='bold';
    const want=(hurt&&!reckless)?'養生球':A.effort;
    const twMap={'全力投':'以投為主','普通投':'投打並重','養生球':'以打為主'};
    pick=findT(opts,want)||findT(opts,twMap[want])||mainOf(opts);
  }
  else if(has(title,'人生的第一個路口')){
    pick=AF('ambition')&&(findT(opts,'旅美')||findT(opts,'旅日'));
    if(!pick)pick=AF('school')?findT(opts,'就讀大學'):findT(opts,'投入中華職棒選秀');
  }
  else if(has(title,'升學與職棒的十字路口')){
    pick=AF('ambition')&&(findT(opts,'旅美')||findT(opts,'旅日'));
    if(!pick)pick=findT(opts,'留在大學');
  }
  else if(has(title,'大學畢業')){
    pick=AF('ambition')&&(findT(opts,'旅美')||findT(opts,'旅日'));
    if(!pick)pick=findT(opts,'投入中華職棒選秀');
  }
  else if(has(title,'落榜之後')) pick=findT(opts,'大學','業餘')||mainOf(opts);
  else if(has(title,'業餘年度結束')) pick=findT(opts,'選秀')||mainOf(opts);
  else if(has(title,'選秀會')) pick=findT(opts,'接受指名')||mainOf(opts);
  else if(has(title,'身體大不如前')) pick=findT(opts,'再戰一年')||findT(opts,'落葉歸根')||mainOf(opts);
  else if(has(title,'TJ 抉擇')) pick=AF('gamble')?(findT(opts,'打針')||opts[0]):(findT(opts,'手術')||opts[0]);
  else if(has(title,'中華隊徵召')) pick=mainOf(opts);
  else if(has(title,'收工後約你去喝一杯')) pick=AF('gamble')?opts[0]:mainOf(opts);
  else if(has(title,'找好律師','已讀不回')) pick=findT(opts,'說清楚','道歉')||mainOf(opts);
  else if(has(title,'交往第')) pick=findT(opts,'求婚')||mainOf(opts);
  else if(has(title,'否決權')) pick=findT(opts,'留下')||mainOf(opts);
  else if(has(title,'交易傳言')) pick=AF('gamble')?opts[0]:mainOf(opts);
  else if(has(title,'下放')) pick=findT(opts,'拒絕下放')||findT(opts,'接受下放')||mainOf(opts);
  else if(has(title,'報價','邀請','入札','旅外合約','自由球員','落葉歸根','沒有球隊開價','年薪')){
    if(A.ambition)pick=findT(opts,'大聯盟')||findT(opts,'日職')||findT(opts,'MLB');
    if(!pick)pick=findT(opts,'長約')||mainOf(opts);
  }
  else if(has(title,'守位會議','球團徵詢')) pick=mainOf(opts);
  if(!pick)pick=mainOf(opts);
  if(typeof pick?.f==='function')pick.f();
};

/* ───────── 配點政策 ───────── */
/* 直接用遊戲本身的成本函式，不要在這裡抄一份——抄的那份一定會跟本體漂開。 */
function gain(k,v){
  const S=stM.S, cur=S.ab[k]; if(cur==null||cur>=80)return -1;
  const pk=(S.pot&&S.pot[k])||62;
  let bud=v+((S.carry&&S.carry[k])||0), c=cur, got=0, guard=0;
  while(bud>0&&c<80&&guard++<300){
    let cost=ability.abStepCost(k,c);
    if(c>=pk)cost*=ability.abOverCapMult(k);
    if(bud>=cost){bud-=cost;c++;got++;} else break;
  }
  return got+bud/100;
}
const underPot=(S,k)=>S.ab[k]<((S.pot&&S.pot[k])||62);
function cheapestOver(S,pool){
  let best=null,bv=-1;
  for(const k of pool){ const g=gain(k,1000); if(g>bv){bv=g;best=k;} }
  return best||pool[0];
}
function pitcherPlan(S){
  const pot=S.pot||{};
  const main=(pot.vel||0)>=(pot.brk||0)?'vel':'brk', second=main==='vel'?'brk':'vel';
  const staLine=S.__want==='RP'?0:(ALLOC==='亂玩'?52:50);
  if(S.__want!=='RP'&&S.ab.sta<staLine)return 'sta';
  if(underPot(S,main))return main;
  if(ALLOC==='普通玩'&&S.ab[main]<Math.min(80,((pot[main]||62)+6)))return main;
  if(S.__want!=='RP'&&S.ab.sta<56)return 'sta';
  if(underPot(S,'ctl'))return 'ctl';
  if(underPot(S,second))return second;
  if(S.__want!=='RP'&&underPot(S,'sta'))return 'sta';
  return cheapestOver(S,['vel','ctl','brk','sta']);
}
function hitterPlan(S){
  const dp=S.__want||S.dpos||(S.pos==='C'?'C':(S.pos==='OF'?'CF':'SS'));
  const th=(AB.DP_TH[dp]||{})[S.lv];
  if(th!=null&&ability.dpScore(dp)<th){
    const dk=dp==='C'?['fld','cat','arm']:(dp==='1B'?['fld','rng','arm']:['rng','fld','arm']);
    const u=dk.filter(k=>underPot(S,k));
    return (u.length?u:dk).slice().sort((a,b)=>S.ab[a]-S.ab[b])[0];
  }
  if(S.ab.sta<50)return 'sta';
  if(underPot(S,'con'))return 'con';
  if(underPot(S,'pow'))return 'pow';
  if(ALLOC==='普通玩'&&S.ab.con<Math.min(80,(((S.pot||{}).con||62)+6)))return 'con';
  if(S.ab.sta<56)return 'sta';
  if(underPot(S,'eye'))return 'eye';
  if(underPot(S,'spd'))return 'spd';
  return cheapestOver(S,['con','pow','eye','spd','sta']);
}
/* 二刀流：先把體力墊到「先發線 52 ＋ 滿勤打擊線 55」，之後永遠補比較弱的那一側——
   這正是這條路線的主題。潛力剩最多的先點，才不會撞到 ×4 的天花板成本。 */
function twoWayPlan(S){
  const line=ALLOC==='亂玩'?52:55;
  if(S.ab.sta<line)return 'sta';
  const pit=['vel','ctl','brk'], bat=['con','pow','eye','spd'];
  const weakFirst=ability.ovrPit()<=ability.ovrBat()?[pit,bat]:[bat,pit];
  const room=k=>((S.pot&&S.pot[k])||62)-S.ab[k];
  for(const pool of weakFirst){
    const u=pool.filter(k=>underPot(S,k));
    if(u.length)return u.sort((a,b)=>room(b)-room(a))[0];
  }
  if(ALLOC==='普通玩'){
    const over=weakFirst[0].filter(k=>S.ab[k]<Math.min(80,((S.pot[k]||62)+5)));
    if(over.length)return over.sort((a,b)=>S.ab[a]-S.ab[b])[0];
  }
  if(S.ab.sta<62)return 'sta';
  return cheapestOver(S,['vel','ctl','brk','con','pow','eye','spd','sta']);
}
globalThis.__autoAlloc=function(){
  const S=stM.S;
  /* 「刷天才」對照組:點七下拿到二刀流與天才之後，故意只練投球側，
     等系統把他強制轉回純投手。用來驗證天才連坐真的攔得住這種玩法。 */
  if(ALLOC==='刷天才'&&S.pos==='TW'){
    const pool=['vel','ctl','brk','sta'];
    return pool.sort((a,b)=>((S.pot[b]||62)-S.ab[b])-((S.pot[a]||62)-S.ab[a]))[0];
  }
  if(S.__want==='RP'&&S.ab.sta>50)S.ab.sta=50;
  if(ALLOC==='亂玩'){
    const pool=S.pos==='P'?['vel','ctl','brk','sta']
      :S.pos==='TW'?['vel','ctl','brk','con','pow','eye','spd','sta']
      :['con','pow','eye','spd','sta'];
    return pool.filter(k=>k in S.ab).sort((a,b)=>S.ab[a]-S.ab[b])[0];
  }
  return S.pos==='P'?pitcherPlan(S):S.pos==='TW'?twoWayPlan(S):hitterPlan(S);
};

/* ───────── 跑一整段生涯 ───────── */
function onePlaythrough(pos,arch,seed,alloc,want){
  /* STAY=1：一律拒絕旅外，留在中職打完整段生涯。用來驗「留在弱聯盟刷數據」
     會不會反而比旅外好——那是聯盟折算(LEAGUE_K)該擋住的事。 */
  A=Object.assign({},ARCH[arch],{ambition:!process.env.STAY}); ALLOC=alloc;
  rng.seedInit(seed);
  timeline.resetTL();   /* TL 是模組層陣列，不重置會跨生涯累積 */
  const S=stM.newState('測',1,pos,null); stM.setS(S);
  S.__want=want||null;
  /* NOQUOTA=1:把 twOrigin 清掉，等於「七下不保送天才」——高中三年的 6 點配額不發動，
     天才回到自然機率。用來量「二刀流本身」與「保送天才」各自貢獻了多少優勢。 */
  if(pos==='TW')S.twOrigin=process.env.NOQUOTA?null:'tap';
  const corePot=pos==='P'?((S.pot.vel+S.pot.ctl+S.pot.brk)/3)
    :pos==='TW'?((S.pot.vel+S.pot.brk+S.pot.con+S.pot.pow)/4)
    :((S.pot.con+S.pot.pow+S.pot.eye)/3);
  if(want&&want!=='RP'&&AB.DPN[want]&&pos!=='TW')S.dpos=want;
  S.teamName=function(){
    if(!this.orgTeam)return '';
    if(this.lv==='MLB')return this.orgTeam;
    if(LV[this.lv]&&LV[this.lv].org==='MiLB')return this.orgTeam+({R:'新人聯盟',A1:'1A',A2:'2A',A3:'3A'}[this.lv]);
    if(this.lv==='CPBL1'||this.lv==='NPB1')return this.orgTeam;
    return this.orgTeam+'二軍';
  };
  let peakOvr=0,peakCore=0,topLv=null;
  /* SIDES=1：記下每一次取樣的 (ovrPit, ovrBat, lv)，用來校準二刀流的綜評公式——
     不知道玩家實際落在哪一區，再漂亮的式子也只是紙上談兵。 */
  const sides=process.env.SIDES?[]:null;
  globalThis.__sample=()=>{
    const o=ability.ovr(); if(o>peakOvr)peakOvr=o;
    if(sides&&S.pos==='TW'&&S.stage==='PRO')
      sides.push([+ability.ovrPit().toFixed(1),+ability.ovrBat().toFixed(1),S.lv,S.age]);
    const c=S.pos==='P'?(S.ab.vel+S.ab.ctl+S.ab.brk)/3
      :S.pos==='TW'?(S.ab.vel+S.ab.brk+S.ab.con+S.ab.pow)/4
      :(S.ab.con+S.ab.pow+S.ab.eye)/3;
    if(c>peakCore)peakCore=c;
    if(S.stage==='PRO'&&S.lv){
      const rank={CPBL2:1,R:1,A1:2,A2:3,NPB2:3,A3:4,CPBL1:5,NPB1:6,MLB:7}[S.lv]||0;
      if(!topLv||rank>topLv.rank)topLv={lv:S.lv,rank};
    }
  };
  try{ phases.startYear(); }
  catch(e){ globalThis.__sample=null; return {err:e.message}; }
  globalThis.__sample=null;

  /* 評價分的零件：sc = careerScore*Kbase + honorScore*Khonor，門檻 = TIER_TH[0]*pk*hk。
     全部記原始值，離線就能換任意常數重算，不必重跑。 */
  const REC=[];
  for(const b of ['CPBL','NPB','MLB']){
    const st=S.stats[b]; if(!st)continue;
    /* 必須跟 career.js 的 tierOf 用同一個判斷:二刀流看的是「這段履歷實際打出來的東西」，
       不是退休當下的 S.pos——89.5% 的二刀流在 39 歲被收斂成單刀，用 S.pos 會全部誤判成打者。 */
    const posKey=career.isTwoWayCareer(st)?'TW':(S.pos!=='P'?'H':((st.SV||0)>=(st.IP||0)/1.05*0.4?'CL':'P'));
    REC.push({lg:b,posKey,yr:st.yr||0,
      cs:career.careerScore(st,b), hs:career.honorScore(b).sc,
      pk:career.posTierK(st,b), th:ECON.TIER_TH[b].slice(),
      W:st.W||0,SO:st.SO||0,IP:st.IP||0,SV:st.SV||0,H:st.H||0,HR:st.HR||0,RBI:st.RBI||0,
      era:(st.IP>0?+(st.ER*9/st.IP).toFixed(2):null)});
  }
  /* SEASONS=1：把每一個職業球季的成績單也吐出來，供門檻的百分位對齊使用。
     只留計算門檻要用到的欄位，不然檔案會大到沒必要。 */
  const seasons=process.env.SEASONS?(S.log||[]).filter(r=>r.st&&r.lv).map(r=>{
    const t=r.st, ip=t.IP||0, pg=Number.isFinite(t.GP)?t.GP:(t.G||0);
    const pH=Number.isFinite(t.pH)?t.pH:(t.H||0), pBB=Number.isFinite(t.pBB)?t.pBB:(t.BB||0);
    const obp=t.PA>0?(t.H+(t.BB||0))/t.PA:null, ab=t.AB||0;
    return {lv:r.lv,role:r.role||null,two:Number.isFinite(t.GP)&&(t.PA||0)>0&&ip>0,
      GP:pg,IP:ip,SO:t.SO||0,W:t.W||0,L:t.L||0,SV:t.SV||0,HLD:t.HLD||0,
      era:ip>0?+( (t.ER||0)*9/ip).toFixed(3):null, whip:ip>0?+((pH+pBB)/ip).toFixed(3):null,
      G:t.G||0,PA:t.PA||0,AB:ab,H:t.H||0,HR:t.HR||0,RBI:t.RBI||0,SB:t.SB||0,BB:t.BB||0,
      avg:ab>0?+(t.H/ab).toFixed(4):null, obp:obp!=null?+obp.toFixed(4):null};
  }):undefined;
  return {seasons,pos:S.pos,endPos:S.pos,fell:S.twFell||null,
    fellAge:S.twFellAge||null,fellLv:S.twFellLv||null,twSeasons:S.twSeasons||0,corePot:+corePot.toFixed(1),
    peakOvr,peakCore:+peakCore.toFixed(1),top:topLv?topLv.lv:null,sides:sides||undefined,
    intl:S.intlCount||0,
    bigInj:S.bigInj||0,tj:S.tjCount||0,retireAge:S.age,salary:S.salary||0,
    proYears:['CPBL','NPB','MLB','MINOR'].reduce((a,b)=>a+((S.stats[b]&&S.stats[b].yr)||0),0),
    traits:Object.keys(S.traits||{}).filter(k=>S.traits[k]),geniusEver:!!S.geniusEver,
    twOrigin:S.twOrigin||null,twDeclined:!!S.twDeclined,REC};
}

const N=+process.env.N||400;
const LANES=(process.env.LANES||'TW/TW,P/SP,IF/SS,OF/CF,IF/1B,IF/DH,C/C').split(',')
  .map(x=>{const [p,w]=x.split('/');return {pos:p,want:w};});
const SB=process.env.SEEDBASE||'tw1';
const hash=x=>{let n=0;for(let j=0;j<x.length;j++)n=(n*31+x.charCodeAt(j))>>>0;return n;};
const draw=(table,r)=>{ let a=0; for(const [k,w] of table){ a+=w; if(r<a)return k; } return table[table.length-1][0]; };

const rows=[];
const T0=Date.now();
for(const lane of LANES){
  let errs=0;
  for(let i=0;i<N;i++){
    const h=hash(SB+lane.pos+lane.want+i);
    const arch=process.env.GRID?EVENT_W[i%EVENT_W.length][0]:draw(EVENT_W,((h*9301+49297)%233280)/233280);
    const alloc=process.env.GRID?ALLOC_W[(i/EVENT_W.length|0)%ALLOC_W.length][0]:draw(ALLOC_W,((h*4096+150889)%714025)/714025);
    const r=onePlaythrough(lane.pos,arch,`${SB}-${lane.pos}-${lane.want}-${i}`,alloc,lane.want);
    if(r.err){ errs++; if(errs<=3)console.error('  ✗ '+lane.want+' #'+i+': '+r.err); continue; }
    rows.push(Object.assign({lane:lane.want,startPos:lane.pos,arch,alloc},r));
    if((i+1)%50===0)console.error(`   ${lane.want} ${i+1}/${N}　${((Date.now()-T0)/1000).toFixed(0)}s`);
  }
  console.error(`lane ${lane.want} 完成　累計 ${rows.length} 筆　錯誤 ${errs}`);
}
const fs=await import('node:fs');
fs.writeFileSync(OUT,JSON.stringify(rows));
console.log(`已寫出 ${rows.length} 筆到 ${OUT}`);
