import assert from 'node:assert/strict';
import {chromium} from 'playwright';

/* v2.1.8 遠距的個別劇情（分開、最後的提議、好結局、重逢）與已婚才有的家庭生活結局。 */
const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--disable-gpu'],
});

try{
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=love-far-family`,{waitUntil:'domcontentloaded'});
  const r=await page.evaluate(async()=>{
    const rng=await import('./src/core/rng.js?v=2.1.8');
    const state=await import('./src/core/state.js?v=2.1.8');
    const love=await import('./src/flow/love.js?v=2.1.8');
    const girls=await import('./src/data/girls.js?v=2.1.8');
    const far=await import('./src/data/girls-far.js?v=2.1.8');
    const fam=await import('./src/data/family.js?v=2.1.8');
    const retire=await import('./src/ui/retire.js?v=2.1.8');
    const ids=girls.GIRLS.map(g=>g.id);
    rng.seedInit('far'); const S=state.newState('遠距測試',1,'IF',null); state.setS(S);
    S.stage='PRO'; S.org='MLB'; love.ensureLove();
    const log=()=>document.getElementById('log');
    const lastCard=()=>{ const c=log().querySelectorAll('.card'); return c[c.length-1].textContent; };
    const set=(id,o)=>Object.assign(S.love,{st:'dating',pid:id,partner:girls.GIRL[id].n,ch:0,kids:0,bond:20,apart:true,herC:girls.GIRL[id].c,apartYrs:3,farOffer:false},o||{});
    /* A／B：直接分開，文字是她自己的，沒有沒代換到的佔位字 */
    const ab={};
    for(const id of ids.filter(i=>far.FAR_END[i].type!=='C')){
      set(id,{st:'married',kids:2,ch:3}); let done=0;
      love.farBreak(girls.GIRL[id],()=>done++);
      ab[id]={done,txt:lastCard(),st:S.love.st,past:S.love.past[id]&&S.love.past[id].how};
    }
    /* C：先給提議（兩個選項），選「去不了」直接分開；同一段感情第二次就照 A 走 */
    const c={};
    for(const id of ids.filter(i=>far.FAR_END[i].type==='C')){
      set(id); let done=0;
      love.farBreak(girls.GIRL[id],()=>done++);
      const btns=[...document.querySelectorAll('#act .btn')];
      const offer={n:btns.length,done,st:S.love.st,offered:S.love.farOffer};
      btns[1].click();
      offer.after={done,st:S.love.st,txt:lastCard()};
      set(id,{farOffer:true}); love.farBreak(girls.GIRL[id],()=>done++);
      offer.second={done,st:S.love.st};
      c[id]=offer;
    }
    /* C 答應：成功時感情值回到 40、遠距繼續 */
    let retry=null;
    for(let i=0;i<40&&!retry;i++){
      rng.seedInit('retry'+i); set('hiyori'); love.farBreak(girls.GIRL.hiyori,()=>{});
      document.querySelectorAll('#act .btn')[0].click();
      if(S.love.st==='dating')retry={bond:S.love.bond,apart:S.love.apart,pid:S.love.pid};
    }
    /* 代換字 */
    S.pos='P'; S.org='MLB'; S.love.herC='TW';
    const rosaP=love.farFill(far.FAR_GOOD.rosa.meet); S.pos='IF';
    const rosaB=love.farFill(far.FAR_GOOD.rosa.meet);
    S.org='CPBL'; S.love.herC='JP'; const yunxiNear=love.farFill(far.FAR_END.yunxi.open);
    S.org='MLB'; const yunxiFar=love.farFill(far.FAR_END.yunxi.open);
    /* 重逢：far 改用她的開場；遠距離婚有孩子，改成寒暑假在機場交接 */
    S.love.exes=[{id:'rin',name:'桐谷凜',kids:1}];
    const meet=love.reunionMeet(girls.GIRL.rin,{how:'far',wed:true});
    const meetCold=love.reunionMeet(girls.GIRL.rin,{how:'cold',wed:true});
    /* 家庭生活結局 */
    const st2=state.newState('家庭測試',1,'IF',null); state.setS(st2); love.ensureLove();
    Object.assign(st2.love,{st:'married',pid:'xiaoqing',partner:'林曉晴',ch:3,kids:2});
    const famMet=retire.familyEnding('national');
    st2.love.ch=1; const famUnmet=retire.familyEnding('national');
    st2.love.kids=0; const famNoKid=retire.familyEnding('home');
    Object.assign(st2.love,{pid:'ellie',partner:'艾莉・朴',ch:3}); const ellieMet=retire.familyEnding('home');
    st2.love.ch=0; const ellieUnmet=retire.familyEnding('home');
    Object.assign(st2.love,{pid:'naomi',ch:3,kids:1}); const job=retire.familyEnding('job',fam.FAMILY_SECOND[4]);
    st2.love.st='dating'; const dating=retire.familyEnding('coach');
    st2.love.st='divorced'; const divorced=retire.familyEnding('coach');
    const famShape=ids.every(id=>{ const f=fam.FAMILY[id]; return f&&f.t&&f.her.ok&&f.her.no&&f.home.kids&&f.home.none&&
      ['coach','national','scout','clay','booth','lab','next','home','job'].every(k=>f.life[k]); });
    const lifeKeys=Object.keys(retire.POST_CAREER_ENDINGS).every(k=>fam.FAMILY_LIFE_OF[k]);
    st2.love.st='married'; st2.love.kids=1; st2.love.pid='rosa';
    const keyed=retire.postCareerEnding({CPBL:{i:0,sc:9000}},.999);
    const farShape=ids.every(id=>far.FAR_END[id]&&far.FAR_END[id].meet&&far.FAR_GOOD[id]&&far.FAR_GOOD[id].air&&far.FAR_GOOD[id].meet&&far.FAR_GOOD[id].yes&&far.FAR_GOOD[id].notYet)
      &&!far.FAR_GOOD.peici.call&&ids.filter(i=>i!=='peici').every(i=>far.FAR_GOOD[i].call);
    return {ab,c,retry,rosaP,rosaB,yunxiNear,yunxiFar,meet,meetCold,famMet,famUnmet,famNoKid,ellieMet,ellieUnmet,job,dating,divorced,famShape,lifeKeys,keyed,farShape};
  });
  const leak=/〔|〕|\{(you|her|yrs|ex|flight|firstHit|job|off|kid)\}|\[\[/;
  for(const [id,v] of Object.entries(r.ab)){
    assert.equal(v.done,1,`${id}：A／B 直接結束`);
    assert.equal(v.st,'divorced'); assert.equal(v.past,'far');
    assert.ok(v.txt.includes('你們和平離婚'),`${id}：婚後結尾`);
    assert.ok(v.txt.includes('孩子們跟著她留在'),`${id}：有孩子的離婚句`);
    assert.ok(!leak.test(v.txt),`${id}：沒有殘留的佔位字 ${v.txt}`);
    assert.ok(!v.txt.includes('我們都值得一個能在身邊的人'),`${id}：不再是共用句`);
  }
  assert.equal(Object.keys(r.ab).length,12);
  for(const [id,v] of Object.entries(r.c)){
    assert.equal(v.n,2,`${id}：最後的提議有兩個選項`);
    assert.equal(v.done,0,`${id}：選之前還沒結束`); assert.equal(v.st,'dating'); assert.ok(v.offered);
    assert.equal(v.after.done,1); assert.notEqual(v.after.st,'dating');
    assert.ok(!leak.test(v.after.txt),`${id}：${v.after.txt}`);
    assert.equal(v.second.done,2,`${id}：同一段感情第二次直接結束`); assert.notEqual(v.second.st,'dating');
  }
  assert.equal(Object.keys(r.c).length,4);
  assert.ok(r.c.hiyori.after.txt.includes('打勾勾'),'星野日和：去不了才有的「之後」');
  assert.deepEqual(r.retry,{bond:40,apart:true,pid:'hiyori'},'挽回成功：感情值 40、遠距繼續');
  assert.ok(r.rosaP.includes('投出第一個三振')&&r.rosaB.includes('打出第一支安打'));
  assert.ok(r.yunxiNear.includes('三個多小時')&&r.yunxiFar.includes('十幾個小時'));
  assert.ok(r.meet.includes('將棋交流活動')&&r.meet.includes('寒暑假')&&!r.meet.includes('不用算時差'));
  assert.ok(r.meetCold.includes('學校門口'),'其他原因的重逢維持原句');
  assert.equal(r.famMet.title,'下一個八拍');
  assert.ok(r.famMet.body.includes('舞團')&&r.famMet.body.includes('兩個孩子'));
  assert.ok(r.famUnmet.body.includes('舞蹈教室')&&!r.famUnmet.body.includes('舞團的年度公演')&&r.famUnmet.body.includes('還沒有成立自己的舞團'));
  assert.ok(r.famNoKid.body.includes('負責把燈留著'));
  assert.ok(r.ellieMet.body.includes('它現在在那裡')&&r.ellieMet.body.includes('發射的紀念日'));
  assert.ok(r.ellieUnmet.body.includes('總有一天，它會在那裡')&&r.ellieUnmet.body.includes('原本預定發射'));
  assert.ok(r.job.body.includes('經營早餐店「滿壘」')&&r.job.body.includes('蘿蔔糕'));
  for(const k of ['famMet','famUnmet','famNoKid','ellieMet','ellieUnmet','job'])assert.ok(!leak.test(r[k].body),`${k}：${r[k].body}`);
  assert.equal(r.dating,null,'交往中不顯示'); assert.equal(r.divorced,null,'離婚不顯示');
  assert.ok(r.famShape,'16 位都有三段、九種日子'); assert.ok(r.lifeKeys,'每個退休結局都對得到段落');
  assert.ok(r.keyed.key&&r.keyed.title,'postCareerEnding 帶回結局鍵');
  assert.ok(r.farShape,'16 位都有好結局文字；張沛慈沒有慶功電話');
  assert.deepEqual(errors,[]);
  console.log('love far + family ending ok');
}finally{ await browser.close(); }
