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
    const state=await import('./src/core/state.js?v=1.5.12');
    const retire=await import('./src/ui/retire.js?v=1.5.12');
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
    return {
      pitcher,hitter,pitcherCoach,hitterCoach,latePitcher,lateHitter,
      withCurrentChild,withFormerChild,selected,
      withInternational,nationalSelected,
      withoutConditions,glassKeys,glassSelected,tjTwoKeys,tjThreeKeys,
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
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(result,null,2));
}finally{
  await browser.close();
}
