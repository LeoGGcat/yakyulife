import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--disable-gpu'],
});

try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=pitcher-contract-years-v1`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.1.7');
    const contract=await import('./src/engine/contract.js?v=2.1.7');
    const healthy={rating:10,maxYears:99,aav:1,bonus:1,drop:0,status:'healthy',proveIt:false};
    const years=(pos,role,age)=>{
      const s=state.newState('年限測試',0,pos,null);
      s.stage='PRO';s.lv='MLB';s.age=age;s.bigInj=0;s.tjCount=0;
      if(role)s.role=role;
      state.setS(s);
      const cap=pos==='P'?contract.pitcherContractCap():15;
      return {cap,yrs:contract.faYears(10,cap,healthy)};
    };
    return {
      sp27:years('P','SP',27), sp30:years('P','SP',30), sp32:years('P','SP',32),
      cl27:years('P','CL',27), mr27:years('P','MR',27),
      if27:years('IF',null,27), if30:years('IF',null,30),
    };
  });

  assert.equal(r.sp27.cap,10,'先發投手合約上限應為 10 年');
  assert.equal(r.sp27.yrs,10,'27 歲健康王牌先發應可拿到 10 年長約');
  assert.equal(r.sp30.yrs,9,'30 歲王牌先發應可拿到 9 年（Skubal 模式）');
  assert.equal(r.sp32.yrs,5,'32 歲年齡上限維持 5 年');
  assert.equal(r.cl27.yrs,5,'終結者上限維持 5 年');
  assert.equal(r.mr27.yrs,4,'中繼上限維持 4 年');
  assert.equal(r.if27.yrs,15,'野手上限維持 15 年');
  assert.equal(r.if30.yrs,9,'30 歲野手年齡上限為 9 年');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log('pitcher_contract_years ok',JSON.stringify(r));
}finally{
  await browser.close();
}
