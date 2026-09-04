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
  await page.goto(`${url}?seed=rainbow-leagues`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const phases=await import('./src/flow/phases.js?v=1.5.12');
    const traits=await import('./src/ui/traits.js?v=1.5.12');
    const dom=await import('./src/ui/dom.js?v=1.5.12');
    const teams=n=>Object.fromEntries(Array.from({length:n},(_,i)=>[`球隊${i+1}`,1]));

    const s=state.newState('七彩測試',7,'IF',null);
    s.teamTally={CPBL:teams(4),NPB:teams(6),MLB:teams(5)};
    state.setS(s);
    const first=phases.unlockRainbowLeagues(s);
    const namesAfterFirst=traits.traitNames('rainbow');
    s.teamTally.MLB=teams(6);
    const second=phases.unlockRainbowLeagues(s);
    const third=phases.unlockRainbowLeagues(s);
    const namesAfterAll=traits.traitNames('rainbow');
    document.getElementById('board').classList.add('detail-open');
    dom.detailSync();
    traits.renderTraits();
    const detailNames=[...document.querySelectorAll('#bd-detail .bd-tc .n')].map(el=>el.textContent);
    const sideNames=[...document.querySelectorAll('#trait-tags .tag')].map(el=>el.textContent);

    const old=state.newState('舊存檔測試',8,'IF',null);
    delete old.rainbowLeagues;
    old.traits.rainbow=true;
    old.rainbowLg='日職';
    old.teamTally={CPBL:teams(4),NPB:teams(1),MLB:teams(1)};
    state.setS(old);
    const migrated=phases.unlockRainbowLeagues(old);
    const oldNames=traits.traitNames('rainbow');

    return {first,namesAfterFirst,second,third,namesAfterAll,detailNames,sideNames,
      allLeagues:s.rainbowLeagues,legacyFirst:s.rainbowLg,migrated,oldLeagues:old.rainbowLeagues,oldNames};
  });

  assert.deepEqual(result.first.map(x=>x.label),['中職','日職']);
  assert.deepEqual(result.namesAfterFirst,['中職七彩球衣','日職七彩球衣']);
  assert.deepEqual(result.second.map(x=>x.label),['大聯盟']);
  assert.deepEqual(result.third,[]);
  assert.deepEqual(result.allLeagues,['中職','日職','大聯盟']);
  assert.deepEqual(result.namesAfterAll,['中職七彩球衣','日職七彩球衣','大聯盟七彩球衣']);
  assert(result.namesAfterAll.every(name=>result.detailNames.includes(name)),'詳情面板未顯示全部七彩球衣');
  assert(result.namesAfterAll.every(name=>result.sideNames.includes(name)),'屬性側欄未顯示全部七彩球衣');
  assert.equal(result.legacyFirst,'中職');
  assert.deepEqual(result.migrated.map(x=>x.label),['中職']);
  assert.deepEqual(result.oldLeagues,['日職','中職']);
  assert.deepEqual(result.oldNames,['日職七彩球衣','中職七彩球衣']);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(result,null,2));
}finally{
  await browser.close();
}
