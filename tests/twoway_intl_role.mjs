/* 二刀流國際賽的投手定位：國家隊沿用他在球隊的 S.role。
   舊版 intl.js 的判斷是 isSP()||TW，讓中繼／終結的二刀流一到經典賽、12 強就被改成先發，
   單場吃 4.5~7 局、也拿不到救援。這裡同時守住單刀投手與先發二刀流的原本行為。 */
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
  await page.goto(`${url}?seed=twoway-intl-role`,{waitUntil:'domcontentloaded'});
  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.0.12');
    const intl=await import('./src/engine/intl.js?v=2.0.12');
    const run=(pos,role,n=40)=>{
      const out=[];
      for(let k=0;k<n;k++){
        const s=state.newState('國際賽定位',1,pos,null);
        Object.assign(s,{stage:'PRO',lv:'NPB1',role,seasonFactor:1,rehab:0,skipMid:false,year:2030,age:26});
        Object.keys(s.ab).forEach(key=>{ s.ab[key]=75; });
        state.setS(s);
        let done=false;
        intl.maybeIntl(()=>{done=true;});
        document.querySelector('#act button').click();
        const st=s.intlLog[s.intlLog.length-1].st;
        out.push({done,g:pos==='TW'?st.GP:st.G,ip:st.IP,sv:st.SV||0,line:intl.intlStatLine(st)});
      }
      return {
        maxG:Math.max(...out.map(o=>o.g)),
        maxIpPerG:Math.max(...out.map(o=>o.ip/o.g)),
        minIpPerG:Math.min(...out.map(o=>o.ip/o.g)),
        anySV:out.some(o=>o.sv>0),
        svShown:out.filter(o=>o.sv>0).every(o=>o.line.includes('救援')),
        allDone:out.every(o=>o.done),
      };
    };
    return {twMR:run('TW','MR'),twCL:run('TW','CL'),twSP:run('TW','SP'),pMR:run('P','MR'),pSP:run('P','SP')};
  });
  /* 牛棚：單場最多 1.6 局、場次可以超過兩場、拿得到救援 */
  for(const k of ['twMR','twCL','pMR']){
    assert.ok(r[k].maxIpPerG<=1.7,`${k} 每場局數應是牛棚的量：${r[k].maxIpPerG}`);
    assert.ok(r[k].maxG>2,`${k} 牛棚登板應可超過兩場：${r[k].maxG}`);
    assert.ok(r[k].anySV,`${k} 應有機會拿到救援`);
    assert.ok(r[k].svShown,`${k} 有救援時成績列要顯示`);
  }
  /* 先發：最多兩場、單場至少 4.5 局 */
  for(const k of ['twSP','pSP']){
    assert.ok(r[k].maxG<=2,`${k} 先發最多兩場：${r[k].maxG}`);
    assert.ok(r[k].minIpPerG>=4.4,`${k} 先發每場局數：${r[k].minIpPerG}`);
    assert.equal(r[k].anySV,false,`${k} 先發不該有救援`);
  }
  Object.values(r).forEach(v=>assert.ok(v.allDone));
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify(r,null,2));
}finally{ await browser.close(); }
