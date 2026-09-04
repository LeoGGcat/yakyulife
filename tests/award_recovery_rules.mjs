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
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=award-recovery-rules`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const rules=await import('./src/engine/award-rules.js?v=1.5.12');
    const awards=await import('./src/engine/awards.js?v=1.5.12');
    const s=state.newState('獎項測試',1,'IF',null);
    s.year=2035; s.traits.glass=true; s.glassYear=2035;
    state.setS(s);
    const scoreAwards=['中職年度MVP','日職年度最佳打者','大聯盟守備聖經','中職游擊手金手套'];
    const zeroAwards=['中職新人王','日職明星賽','中職總冠軍','世界大賽冠軍','日本一'];
    const league={
      cpblFresh:awards.rookieLeagueEligible('CPBL',{CPBL:{},NPB:null,MLB:null,MINOR:{}}),
      cpblAfterNpb:awards.rookieLeagueEligible('CPBL',{CPBL:{},NPB:{yr:1},MLB:null,MINOR:null}),
      cpblAfterMlb:awards.rookieLeagueEligible('CPBL',{CPBL:{},NPB:null,MLB:{yr:1},MINOR:null}),
      npbAfterCpbl:awards.rookieLeagueEligible('NPB',{CPBL:{yr:1},NPB:{},MLB:null,MINOR:null}),
      npbAfterMlb:awards.rookieLeagueEligible('NPB',{CPBL:null,NPB:{},MLB:{yr:1},MINOR:null}),
    };
    const workload={
      cpblUnderG:awards.rookieWorkloadEligible('CPBL',{G:47,PA:180},'IF'),
      cpblUnderPA:awards.rookieWorkloadEligible('CPBL',{G:48,PA:179},'IF'),
      cpblOK:awards.rookieWorkloadEligible('CPBL',{G:48,PA:180},'IF'),
      npbOK:awards.rookieWorkloadEligible('NPB',{G:58,PA:215},'IF'),
      mlbOK:awards.rookieWorkloadEligible('MLB',{G:65,PA:243},'IF'),
      cpblSpOK:awards.rookieWorkloadEligible('CPBL',{G:10,IP:48},'P','SP'),
      cpblReliefOK:awards.rookieWorkloadEligible('CPBL',{G:30,IP:15},'P','MR'),
    };
    const sameYear=awards.canUnlockPhoenix(['2035 中職年度MVP'],s);
    s.glassYear=2034;
    const rookieOnly=awards.canUnlockPhoenix(['2035 中職新人王'],s);
    const scored=awards.canUnlockPhoenix(['2035 中職打擊王'],s);
    return {
      score:scoreAwards.map(rules.isCareerScoringAward),
      zero:zeroAwards.map(rules.isCareerScoringAward),league,workload,sameYear,rookieOnly,scored,
    };
  });
  assert(result.score.every(Boolean));
  assert(result.zero.every(x=>!x));
  assert.deepEqual(result.league,{cpblFresh:true,cpblAfterNpb:false,cpblAfterMlb:false,npbAfterCpbl:true,npbAfterMlb:false});
  assert.deepEqual(result.workload,{cpblUnderG:false,cpblUnderPA:false,cpblOK:true,npbOK:true,mlbOK:true,cpblSpOK:true,cpblReliefOK:true});
  assert.equal(result.sameYear,false);
  assert.equal(result.rookieOnly,false);
  assert.equal(result.scored,true);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(result,null,2));
}finally{ await browser.close(); }
