import assert from 'node:assert/strict';
import {chromium} from 'playwright';

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
  await page.goto(`${url}?seed=retirement-ending`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.0');
    const retire=await import('./src/ui/retire.js?v=2.1.0');
    const pitcher=retire.nextBaseEnding('P');
    const hitter=retire.nextBaseEnding('SS');
    const pitcherCoach=retire.jerseyWeightEnding('P');
    const hitterCoach=retire.jerseyWeightEnding('CF');
    const latePitcher=retire.lateAnswerEnding('P');
    const lateHitter=retire.lateAnswerEnding('IF');
    const tiers={CPBL:{i:0,sc:9000}};
    const currentFamily=state.newState('親子測試',0,'P',null);
    currentFamily.love.kids=1;
    state.setS(currentFamily);
    const withCurrentChild=retire.postCareerEndingKeys(tiers);
    const selected=retire.postCareerEnding(tiers,.999);
    const formerFamily=state.newState('前段婚姻測試',0,'IF',null);
    formerFamily.love.exes=[{name:'測試前妻',kids:2}];
    state.setS(formerFamily);
    const withFormerChild=retire.postCareerEndingKeys(tiers);
    const nationalPlayer=state.newState('國家隊測試',0,'P',null);
    nationalPlayer.intlCount=1;
    state.setS(nationalPlayer);
    const withInternational=retire.postCareerEndingKeys(tiers);
    const nationalSelected=retire.postCareerEnding(tiers,.999);
    const healthy=state.newState('一般球員',0,'IF',null);
    state.setS(healthy);
    const withoutConditions=retire.postCareerEndingKeys(tiers,0,0);
    const glass=state.newState('玻璃球員',0,'IF',null);
    glass.traits.glass=true;
    state.setS(glass);
    const glassKeys=retire.postCareerEndingKeys(tiers,0,0);
    const glassSelected=retire.postCareerEnding(tiers,.7);
    const tjPitcher=state.newState('手術投手',0,'P',null);
    tjPitcher.tjCount=2;
    state.setS(tjPitcher);
    const tjTwoKeys=retire.postCareerEndingKeys(tiers,0,0);
    tjPitcher.tjCount=3;
    const tjThreeKeys=retire.postCareerEndingKeys(tiers,0,0);
    /* 二刀流結局：key 由狀態決定不擲骰，而且在卡池裡佔一半 */
    const tw=(patch)=>{ const s=state.newState('二刀流',0,patch.pos==='TW'?'TW':(patch.pos==='P'?'P':'IF'),null);
      Object.assign(s,patch); if(patch._disc)s.traits.disc=true; state.setS(s);
      const key=retire.twoWayEndingKey(), keys=retire.postCareerEndingKeys(tiers,0,0);
      return {key,total:keys.length,mine:keys.filter(k=>k===key).length}; };
    const twCases={
      kept:      tw({pos:'TW',twSeasons:19,age:41}),
      lateFall:  tw({pos:'P', twSeasons:16,twFell:'pit',twFellAge:38,age:41}),
      gavePit:   tw({pos:'P', twSeasons:4, twFell:'pit',twFellAge:24,age:38}),
      gaveBat:   tw({pos:'OF',twSeasons:4, twFell:'bat',twFellAge:24,age:38}),
      atDecline: tw({pos:'P', twSeasons:12,twFell:'pit',twFellAge:33,age:39}),
      discLine:  tw({pos:'P', twSeasons:12,twFell:'pit',twFellAge:33,age:39,_disc:1}),
      never:     tw({pos:'P', twSeasons:0, age:38}),
    };
    const twTitles={
      all:retire.twoWayAllEnding().title,
      bat:retire.twoWayHalfBatEnding().title,
      pit:retire.twoWayHalfPitEnding().title,
      allBody:retire.twoWayAllEnding().body,
      batBody:retire.twoWayHalfBatEnding().body,
      pitBody:retire.twoWayHalfPitEnding().body,
    };
    return {
      pitcher,hitter,pitcherCoach,hitterCoach,latePitcher,lateHitter,
      withCurrentChild,withFormerChild,selected,
      withInternational,nationalSelected,
      withoutConditions,glassKeys,glassSelected,tjTwoKeys,tjThreeKeys,
      twCases,twTitles,
      oldGhostPitcher:retire.oldGhostLongCareerComment('P'),
      oldGhostHitter:retire.oldGhostLongCareerComment('IF'),
      adkingComment:retire.ADKING_FAN_COMMENT,
      age24:retire.usesSecondCareerEnding(24),
      age25:retire.usesSecondCareerEnding(25),
    };
  });

  assert.equal(result.pitcher.title,'下一個壘包');
  assert(result.pitcher.body.includes('蹲在投手丘上'));
  assert(!result.pitcher.body.includes('最後一個打席'));
  assert(result.hitter.body.includes('最後一個打席'));
  assert(!result.hitter.body.includes('蹲在投手丘上'));
  assert(result.pitcherCoach.body.includes('被一發全壘打超前'));
  assert(!result.pitcherCoach.body.includes('漏接一顆平飛球'));
  assert(result.hitterCoach.body.includes('漏接一顆平飛球'));
  assert(!result.hitterCoach.body.includes('被一發全壘打超前'));
  assert.equal(result.latePitcher.title,'遲到的答案');
  assert(result.latePitcher.body.includes('二十二歲那年，你的手肘開始痛'));
  assert(result.latePitcher.body.includes('大聯盟的三號先發投手'));
  assert(!result.latePitcher.body.includes('右腳踝'));
  assert.equal(result.lateHitter.title,'遲到的答案');
  assert(result.lateHitter.body.includes('右腳踝'));
  assert(result.lateHitter.body.includes('你沒有變差，你只是還在受傷'));
  assert(!result.lateHitter.body.includes('二十二歲那年，你的手肘開始痛'));
  assert(result.latePitcher.body.includes('<br><br>'));
  assert(result.withCurrentChild.includes('nextBase'));
  assert(result.withFormerChild.includes('nextBase'));
  assert(result.withCurrentChild.includes('coach'));
  assert(result.withCurrentChild.includes('scout'));
  assert.equal(result.withCurrentChild.length,result.withoutConditions.length+1);
  assert.equal(result.withFormerChild.length,result.withoutConditions.length+1);
  assert.equal(result.selected.title,'下一個壘包');
  assert(result.withInternational.includes('jerseyWeight'));
  assert(!result.withInternational.includes('nextBase'));
  assert.equal(result.withInternational.length,result.withoutConditions.length+1);
  assert.equal(result.nationalSelected.title,'球衣的重量');
  assert(!result.withoutConditions.includes('nextBase'));
  assert(!result.withoutConditions.includes('jerseyWeight'));
  assert.equal(result.withoutConditions.filter(k=>k==='lateAnswer').length,0);
  assert.equal(result.glassKeys.filter(k=>k==='lateAnswer').length,2);
  assert.equal(result.glassKeys.length,result.withoutConditions.length+2);
  assert.equal(result.glassSelected.title,'遲到的答案');
  assert.equal(result.tjTwoKeys.filter(k=>k==='lateAnswer').length,0);
  assert.equal(result.tjThreeKeys.filter(k=>k==='lateAnswer').length,2);
  assert.equal(result.oldGhostPitcher,'今年新人大物引退時，先發投手{n}');
  assert.equal(result.oldGhostHitter,'今年新人大物引退時，第四棒{n}');
  assert.equal(result.adkingComment,'打開電視每幾分鐘就要看到他一次，去超商也會看到他的臉，退休之後會不會更常出現呢？');
  assert.equal(result.age24,true);
  assert.equal(result.age25,false);

  /* ── 二刀流結局 ──
     key 由狀態決定，不擲骰；三種狀況各對一個結局，而且在卡池裡正好佔一半。
     「衰退之前」那條線跟 phases.js 同源：一般人 32 歲、自律狂 34 歲。 */
  const T=result.twCases;
  assert.equal(T.kept.key,'twAll','一路二刀流到引退應該是〈全部的棒球〉');
  assert.equal(T.lateFall.key,'twAll','38 歲才停止投打兼修，算走完全程');
  assert.equal(T.atDecline.key,'twAll','33 歲已經在衰退期，不算半途放棄');
  assert.equal(T.discLine.key,'twHalfPit','自律狂的衰退從 34 歲起，33 歲停止就是半途放棄');
  assert.equal(T.gavePit.key,'twHalfPit','留下投球');
  assert.equal(T.gaveBat.key,'twHalfBat','留下打擊');
  assert.equal(T.never.key,null,'從來不是二刀流就沒有這個結局');
  for(const k of ['kept','lateFall','gavePit','gaveBat','atDecline','discLine']){
    assert.equal(T[k].mine*2,T[k].total,`${k} 的二刀流結局沒有佔一半：${T[k].mine}/${T[k].total}`);
  }
  assert.equal(T.never.total,T.gavePit.total/2,'沒有二刀流結局時卡池應該只有一半大');
  assert.equal(result.twTitles.all,'全部的棒球');
  assert.equal(result.twTitles.bat,'我留下的那一半');
  assert.equal(result.twTitles.pit,'另外那一半');
  /* 三篇都要真的被轉成 HTML 段落，而且不能互相抄錯 */
  for(const b of ['allBody','batBody','pitBody']){
    assert(result.twTitles[b].includes('<br><br>'),b+' 沒有段落');
    assert(!/\n/.test(result.twTitles[b]),b+' 還留著原始換行');
  }
  assert(result.twTitles.allBody.includes('我只是不想把自己切成一半'));
  assert(result.twTitles.batBody.includes('那一半，也會比別人的一半厚'));
  assert(result.twTitles.pitBody.includes('你也會知道另外一半在想什麼'));
  assert(!result.twTitles.batBody.includes('我當過他'),'留打的結局不該有留投的句子');
  assert(!result.twTitles.pitBody.includes('比別人的一半厚'),'留投的結局不該有留打的句子');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(result,null,2));
}finally{
  await browser.close();
}
