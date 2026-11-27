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
  await page.goto(`${url}?seed=no-age-cap`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.7');
    const phases=await import('./src/flow/phases.js?v=2.1.7');
    const teamName=function(){ return this.orgTeam; };
    /* 48 歲以上、能力仍在一軍水準：季初只吃衰退，不再被年齡直接結束生涯。 */
    const run=(age)=>{
      const s=state.newState('高齡測試',9,'IF',null);
      s.stage='PRO'; s.org='CPBL'; s.lv='CPBL1'; s.orgTeam='新北騎士'; s.teamName=teamName;
      s.age=age; s.year=2026+age-18; s.rehab=0;
      Object.keys(s.ab).forEach(k=>s.ab[k]=80);
      state.setS(s);
      document.getElementById('log').innerHTML='';
      phases.phasePre();
      const text=document.getElementById('log').textContent;
      return {age,done:!!s.done,capText:text.includes('身體已到極限'),decline:text.includes('歲月不饒人'),ab:s.ab[Object.keys(s.ab)[0]]};
    };
    return [run(48),run(52)];
  });

  for(const r of result){
    assert.equal(r.done,false,`${r.age} 歲季初不應直接引退`);
    assert.equal(r.capText,false,`${r.age} 歲不應出現年齡上限引退文案`);
    assert.equal(r.decline,true,`${r.age} 歲仍要照常衰退`);
  }
  /* 衰退照舊逐年加劇：48 歲 −18、52 歲 −22 */
  assert.equal(result[0].ab,80-18);
  assert.equal(result[1].ab,80-22);
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(result,null,2));
}finally{
  await browser.close();
}
