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
  await page.goto(`${url}?seed=career-pa-display`,{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const career=await import('./src/engine/career.js?v=1.5.12');
    const retire=await import('./src/ui/retire.js?v=1.5.12');
    const share=await import('./src/ui/share-image.js?v=1.5.12');
    const s=state.newState('萬打席測試',1,'IF',null);
    s.stage='PRO';
    s.dpos='3B';
    s.stats.CPBL={
      yr:20,G:2400,PA:10000,AB:9000,H:2700,HR:320,RBI:1500,SB:180,BB:1000,
      W:0,L:0,SV:0,HLD:0,IP:0,SO:0,ER:0,AS:10,DEF:80,DPG:{},
    };
    state.setS(s);
    const html=career.statTable('CPBL');
    const cumulative=retire.rpCumData();
    /* Google Fonts 載入失敗時會回退系統等寬字；舊 PA 欄只在 IBM Plex Mono 下
       勉強剛好，回退字型稍寬就會把五位數截成四位數。 */
    document.body.style.setProperty('--mono',"'Courier New',monospace");
    const drawn=[];
    const original=CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText=function(value,x,y,...args){
      drawn.push({text:String(value),x,y,font:this.font,width:this.measureText(String(value)).width});
      return original.call(this,value,x,y,...args);
    };
    try{
      share.renderShareImage([],[],{fans:false});
    }finally{
      CanvasRenderingContext2D.prototype.fillText=original;
    }
    return {html,cumulative,drawn};
  });

  assert(result.html.includes('<th>PA</th>'));
  assert(result.html.includes('<td>10000</td>'));
  assert.equal(result.cumulative.rows[0].txt[2],10000);
  const cumulativePA=result.drawn.find(item=>item.text==='10000'&&item.y<500);
  assert(cumulativePA,'分享圖把 10000 PA 截成了四位數');
  assert.equal(errors.length,0,errors.join('\n'));
  console.log(JSON.stringify({
    webPA:/<td>10000<\/td>/.test(result.html),
    dataPA:result.cumulative.rows[0].txt[2],
    canvasPA:cumulativePA||null,
  },null,2));
}finally{
  await browser.close();
}
