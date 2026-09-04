import {S} from '../core/state.js?v=1.5.12';
import {R, pick, chance, clamp} from '../core/rng.js?v=1.5.12';
import {ABL, POS_AB} from '../data/abilities.js?v=1.5.12';
import {card, choose, board} from '../ui/dom.js?v=1.5.12';
import {addAb, addAbStat, statBonusTxt, abGainTxt} from '../engine/ability.js?v=1.5.12';
/* 出廠預設為全虛構人名;玩家可透過隱藏編輯器自訂名單(僅存於玩家本機) */
export let CHEER=['林曉晴','陳若彤','張沛慈','王詠恩','許昀熙','蘇采蓁','周依潔','郭芷萱'];
export const CHEER_DEFAULT=CHEER.slice();
export let CHEER_SAFE=['馮海莎']; /* 不會變成小三的名單:可交往/結婚,永不出現在外遇人選 */
export function datePool(){ /* 交往/結婚名單 */
  if(CHEER_SAFE.length>=CHEER.length) return CHEER_SAFE.slice();      /* 安全名單較長:直接整組替換 */
  return CHEER_SAFE.concat(CHEER.slice(CHEER_SAFE.length));           /* 較短:同數量替換進名單 */
}
export function affairPool(){ return CHEER.slice(); } /* 外遇名單=原啦啦隊名單 */
export function loveEvent(next){
  const L=S.love;
  if(S.stage!=='PRO'||S.age<20){ next(); return; }
  /* ---------- 交往中:每年必定走一輪(不吃機率門檻) ---------- */
  if(L.st==='dating'){
    L.dyrs=(L.dyrs||0)+1;
    const y=L.dyrs;
    /* 交往太久不結婚 → 分手風險逐年升高 */
    const cheatPen=(L.cheatYr===S.year-1||L.cheatYr===S.year)?30:0; /* 劈腿當年分手率+30% */
    const bkP=(y>=4?20+(y-4)*15:0)+cheatPen;
    if(bkP>0&&chance(bkP)){
      const k1=pick(POS_AB[S.pos]),k2=pick(POS_AB[S.pos]);
      const g1=addAb(k1,-3),g2=addAb(k2,-3); board(1);
      const ex=L.partner; L.st=L.exes.length?'divorced':'single'; L.partner=null; L.dyrs=0;
      card('bad','分手',`${cheatPen?'那晚的事她其實都知道。':''}交往 ${y} 年，婚期一延再延。<b class="hl">${ex}</b> 最後留下一句：「我等不到了。」轉身離開。整個休賽季你魂不守舍——${abGainTxt(k1,-1,g1)}、${abGainTxt(k2,-1,g2)}。`);
      next(); return; }
    const ask=()=>proposalAsk(next);
    if(chance(30)){ /* 三成機率先來一段插曲,結束後照樣問婚 */
      const r=R()*100;
      if(r<40){ const t=pick(affairPool().filter(n=>n!==L.partner));
        choose(`聚餐散場，${t} 說順路想搭你的車`,[
          {t:'讓她上車（賭一把）',warn:true,s:'沒被抓到＝體力提升｜被抓到＝能力下跌、當年分手率+30%',f:()=>{
            L.affairs++;
            if(chance(55)){ const gt=loveGainTxt('sta',2); board(1);
              card('bad','深夜兜風',`沒有人拍到。你把方向盤握得很緊——${gt}。（這條路不會有好結局）`); ask(); }
            else loveCaughtDating(next); }},
          {t:`「不順路。」直接載 ${L.partner} 回家`,main:true,s:'感情穩固，絕對不虧',f:()=>{
            const gt=loveGainTxt('sta',1); board(1);
            card('good','正確答案',`你傳訊息給 ${L.partner}：「馬上到。」——${gt}。`); ask(); }}]); return; }
      if(r<70){ const gt=loveGainTxt('sta',1); board(1);
        card('good','明星賽放閃',`明星賽表演賽，鏡頭掃到看台上的 <b class="hl">${L.partner}</b>，你隔著全場比了一個手勢，轉播單位立刻切出愛心特效，隔天甜上熱搜——${gt}。`); ask(); return; }
      const gt=loveGainTxt('sta',1); board(1);
      card('good','愛情長跑',`交往邁入第 ${y} 年。沒有大新聞，只有每個客場系列賽結束後，機場出口那杯她替你買好的熱美式——${gt}。`); ask(); return; }
    ask(); return;
  }
  const fire=(L.st==='married'&&L.kids===0)?40:(L.st==='single'||L.st==='divorced')?40:30;
  if(!chance(fire)){ next(); return; }
  /* ---------- 未婚/離婚:緋聞 → 雙重關卡 → 交往 ---------- */
  if(L.st==='single'||L.st==='divorced'){
    const p=pick(datePool());
    const former=L.exes.find(e=>e.name===p);
    const twiceCaught=!!former&&(L.caught||0)>=2;
    const confessionChance=former?(twiceCaught?0:30):65;
    card('info',former?'舊情重燃':'場外話題',former
      ?`你和前妻 <b class="hl">${p}</b> 再次被拍到一起出現。記者立刻追了上來，想知道這次見面究竟代表什麼。`
      :`你和啦啦隊女神 <b class="hl">${p}</b> 被拍到球場外同框，緋聞登上娛樂版頭條。${L.exes.length?'（評論區：「離過婚還這麼搶手」）':''}`);
    choose('記者把麥克風遞到你面前：「兩位是在交往嗎？」',[
      {t:former?'再次告白：「我想重新開始」':'大方承認：「請大家祝福我們」',
       s:former?`她是否願意重新相信你（成功率 ${confessionChance}%）`:'還要看她那邊敢不敢承認（球團有禁愛令傳聞）',f:()=>{
        if(chance(confessionChance)){ L.st='dating'; L.partner=p; L.dyrs=0; L.datedTimes=(L.datedTimes||0)+1;
          const gt=loveGainTxt('sta',1); board(1);
          card('gold',former?'重新開始':'戀情公開',former
            ?`${former.kids>0?'孩子的教養問題':'沒有刪除乾淨的聯絡方式'}，又讓你們搭上了線。你知道你犯過錯，所以你用盡了所有方式，去重建破碎的信任。你在第一次見面的地方重新告白，她懷疑了一下，然後哭了。她點了點頭，勉強嘗試去相信你。<br>${gt}。你們重新交往了。`
            :`<b class="hl">${p}</b> 在社群發出十指緊扣的照片：「謝謝大家的祝福。」戀愛使人容光煥發——${gt}。你們正式交往了。`);
          const hasAnyKids=L.kids+L.exes.reduce((n,e)=>n+(e.kids||0),0)>0;
          if(L.datedTimes>=3&&!hasAnyKids&&!S.traits.married&&!S.traits.confidante){ S.traits.confidante=true;
            card('gold','隱藏稱號：閨中密友',`第三段戀情，還是走到了同樣的結局。「我愛上了你，你卻只把我當好姊妹。」——有些人註定是別人生命裡的過客。`); board(1); }
        }
        else{ card('bad',former?'回不到從前':'單方面承認',former
          ?(twiceCaught
            ?`她深吸了一口氣：「你當我是白癡？」只差沒有甩一巴掌在你臉上。`
            :`破碎的信任完全無法恢復，她的姊妹要她吃點好的，何必眷戀你這個爛男人？`)
          :`她隔天透過經紀公司否認：「只是普通朋友。」據傳啦啦隊<b class="dn">禁愛令</b>壓力不小。你一個人站在風裡，超級尷尬。`); }
        next(); }},
      {t:'笑而不答，快步走過',main:true,s:'不承認就沒有下文',f:()=>{
        card('info','未完待續','緋聞燒了三天就退燒。也許時機還沒到。'); next(); }}]); return;
  }
  /* ---------- 已婚 ---------- */
  if(L.kids<4&&chance([65,45,30,20][L.kids])){ /* 生子:第一胎最優先,越生越少 */
    L.kids++; const kk=pick(POS_AB[S.pos]); const gt=loveGainTxt(kk,2); board(1);
    card('gold','新生命',`${L.partner} 平安生下你們的第 <b class="hl">${L.kids}</b> 個孩子。當了${L.kids>1?'幾次':''}爸爸的男人，眼神都不一樣了——${gt}。`);
    next(); return;
  }
  const r=R()*100;
  if(r<40){ /* 外遇誘惑:唯一可以賭的婚內事件 */
    const t=pick(affairPool().filter(n=>n!==L.partner));
    const kidWord=L.kids===1?'孩子':'孩子們';
    const rejectAffairText=L.kids===0
      ?'回訊息：「準備和家人視訊了，晚安」'
      :`回訊息：「陪${kidWord}讀完故事書了，晚安」`;
    const homeVideoText=L.kids===0
      ?`${L.partner} 在鏡頭那頭笑著向你揮手。`
      :`${L.partner} 和${kidWord}在鏡頭那頭揮手。`;
    choose(`客場飯店酒吧，${t} 傳來訊息：「睡了嗎？」`,[
      {t:'赴約（賭一把）',warn:true,s:'沒被抓到＝體力提升｜被抓到＝能力下跌、婚姻危機',f:()=>{
        L.affairs++;
        if(chance(55)){ const gt=loveGainTxt('sta',2); board(1);
          card('bad','深夜行程',`你僥倖沒被拍到。不知為何，罪惡感反而讓你精神亢奮——${gt}。（你知道這不會有好下場）`);
          next(); }
        else loveCaught(next); }},
      {t:rejectAffairText,main:true,s:'家庭和睦，絕對不虧',f:()=>{
        const gt=loveGainTxt('sta',1); board(1);
        card('good','家的方向',`你把手機扣在桌上，撥了視訊回家。${homeVideoText}心定了，身體就穩了——${gt}。`); next(); }}]); return; }
  if(r<70&&L.kids>0){ /* 愛小孩新聞 */
    const gt=loveGainTxt('sta',1); board(1);
    card('good','球場邊的父親',`你被拍到賽前隔著護網教孩子怎麼戴手套，影片配文「最強棒球教室」瘋傳。網友：「這才是人生勝利組。」——${gt}。`); next(); return; }
  /* 結婚紀念日 */
  const gt=loveGainTxt('sta',1); board(1);
  card('good','結婚紀念日',`結婚紀念日，你推掉了自主訓練，陪 <b class="hl">${L.partner}</b> 回到當年辦婚禮的場地。她說：「明年也要來喔。」——${gt}。`); next();
}
export function divorceRec(){ const L=S.love;
  L.exes.push({name:L.partner,kids:L.kids});
  L.st='divorced'; L.partner=null; L.kids=0; /* 再婚後小孩重新計算 */ }
export function loveCaught(next){
  const L=S.love; L.caught++;
  const kk=pick(POS_AB[S.pos]); const g=addAb(kk,-3);
  let extra='';
  if(L.caught>=2){
    if(!S.traits.scum){ S.traits.scum=true;
      card('bad','隱藏屬性解鎖：渣男','第二次被逮個正著。從今以後你在球迷心中的形象定型了——<b class="dn">每次外遇被抓到，全能力 −5</b>。'); }
    POS_AB[S.pos].forEach(k=>{ S.ab[k]=clamp(S.ab[k]-5,1,80); });
    extra='<b class="dn">全能力 −5</b>（渣男的代價）。'; }
  board(1);
  card('bad','頭版醜聞',`狗仔的鏡頭比你想的更快，照片鋪滿版面。贊助商緊急撤圖，你在鏡頭前鞠躬 90 度。${abGainTxt(kk,-1,g)}。${extra}`);
  choose(`${L.partner} 把離婚協議書放在餐桌上`,[
    {t:'跪著道歉，求她再給一次機會',s:'成功保住婚姻｜失敗＝再扣能力並離婚',f:()=>{
      if(chance(40)){
        card('info','低谷之後',`長談了一整夜。<b class="hl">${L.partner}</b> 最後說：「為了孩子，也為了那個我認識的你——最後一次。」婚姻保住了，但有些東西回不去了。`); next(); }
      else{ const k2=pick(POS_AB[S.pos]); const g2=addAb(k2,-2);
        const ex=L.partner; divorceRec(); board(1);
        card('bad','道歉無效',`她聽完只是搖頭，隔天律師的存證信函就到了。<b class="hl">${ex}</b> 正式與你離婚，輿論二次發酵——${abGainTxt(k2,-1,g2)}。`); next(); } }},
    {t:'簽字離婚',f:()=>{ const ex=L.partner; divorceRec();
      card('bad','離婚',`你在協議書上簽了名。<b class="hl">${ex}</b> 的聲明只有一句：「祝彼此安好。」`); next(); }}]);
}
export function proposalAsk(next){
  const L=S.love; if(L.st!=='dating'){ next(); return; }
  choose(`交往第 ${L.dyrs} 年——${L.partner} 看著別人的婚禮影片看了很久`,[
    {t:'就是現在——求婚',s:'固定加成：全體力提升、本季更不容易受傷',f:()=>{
      /* 與前妻復合後再婚：共同孩子回到目前家庭，前妻紀錄不再重複顯示。 */
      const formerIndex=L.exes.findIndex(e=>e.name===L.partner);
      const reunitedKids=formerIndex>=0?(L.exes[formerIndex].kids||0):0;
      if(formerIndex>=0)L.exes.splice(formerIndex,1);
      L.st='married'; L.kids=reunitedKids; L.dyrs=0;
      const gTxt=loveGainTxt('sta',2)+'、'; S.tmpInj-=5; board(1);
      card('gold','婚禮',`你在主場本壘板後方單膝跪地，大螢幕打出「Marry Me」。<b class="hl">${L.partner}</b> 哭著點頭。休賽季完婚，紅毯用壘包排成——${gTxt}本季受傷機率 <b class="up">−5%</b>。`); next(); }},
    {t:'再存一點錢吧',main:true,s:'她沒說什麼,但交往越久分手風險越高',f:()=>{
      card('info','再等等','她關掉影片，笑著說沒事。你假裝沒看到她眼裡的東西。'); next(); }}]);
}
export function loveCaughtDating(next){
  const L=S.love; L.caught++; L.cheatYr=S.year; /* 被抓到才觸發當年分手率+30% */
  const kk=pick(POS_AB[S.pos]); const g=addAb(kk,-3);
  let extra='';
  if(L.caught>=2){
    if(!S.traits.scum){ S.traits.scum=true;
      card('bad','隱藏屬性解鎖：渣男','第二次被逮個正著。從今以後你在球迷心中的形象定型了——<b class="dn">每次劈腿/外遇被抓到，全能力 −5</b>。'); }
    POS_AB[S.pos].forEach(k=>{ S.ab[k]=clamp(S.ab[k]-5,1,80); });
    extra='<b class="dn">全能力 −5</b>（渣男的代價）。'; }
  board(1);
  card('bad','劈腿曝光',`行車紀錄器畫面流出，時間軸對得整整齊齊。${abGainTxt(kk,-1,g)}。${extra}`);
  choose(`${L.partner} 已讀不回三天後，終於答應見面`,[
    {t:'道歉，求她再給一次機會',s:'成功保住感情｜失敗＝再扣能力並分手',f:()=>{
      if(chance(40)){
        card('info','低谷之後',`她哭著罵完，最後說：「最後一次。」感情保住了，但信任的裂痕補不回來。`); next(); }
      else{ const k2=pick(POS_AB[S.pos]); const g2=addAb(k2,-2);
        const ex=L.partner; L.st=L.exes.length?'divorced':'single'; L.partner=null; L.dyrs=0; board(1);
        card('bad','道歉無效',`她把你送的東西整箱寄回。<b class="hl">${ex}</b> 封鎖了所有聯絡方式——${abGainTxt(k2,-1,g2)}。`); next(); } }},
    {t:'坦然分手',f:()=>{ const ex=L.partner;
      L.st=L.exes.length?'divorced':'single'; L.partner=null; L.dyrs=0;
      card('bad','分手',`<b class="hl">${ex}</b> 的限時動態只有一片黑。粉絲全都知道是誰的錯。`); next(); }}]);
}
export function loveGainTxt(k,amt){ /* 戀愛事件加點:機制同事件卡(addAbStat);回傳誠實的顯示文字 */
  const before=S.pendStat||0;
  const g=addAbStat(k,amt);
  const over=(S.pendStat||0)-before;
  const used=Math.max(0,Math.round(amt)-over); /* 真正吃進能力的點數,其餘為溢出 */
  if(g>0&&over>0)return `${abGainTxt(k,used,g)}，溢出 ${over} 點轉為${statBonusTxt(over)}`;
  if(g>0)return abGainTxt(k,used,g);
  if(over>0)return `${ABL[k]} 已達潛力上限，${Math.round(amt)} 點全數轉為${statBonusTxt(over)}`;
  return abGainTxt(k,amt,0);
}
