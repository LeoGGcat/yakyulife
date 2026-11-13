/* 年度MVP／新人王改看實際成績的回歸測試。

   玩家回報（v2.0.12）：同一種能力很高、但整季打不出來的打者——
     .228／OPS .795／28 轟（OPS+ 113），低潮年 → 中職明星賽＋年度MVP＋新人王
     .212／OPS .679／21 轟（OPS+ 96），低潮年 → 中職年度MVP＋新人王
   根因：打者 MVP 資格的旁門（全壘打摸到全壘打王下限）不看整體產出，
   有資格之後機率又看 st.d（能力），能力高就 100%；新人王的機率同樣看 st.d。 */
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
  await page.goto(`${url}?seed=mvp-rookie`,{waitUntil:'domcontentloaded'});

  const r=await page.evaluate(async()=>{
    const state=await import('./src/core/state.js?v=2.0.12');
    const aw=await import('./src/engine/awards.js?v=2.0.12');
    const N=400;
    const rate=(stat,{pos='IF',dpos='DH',role=null,yr=1}={})=>{
      let mvp=0,rookie=0;
      for(let i=0;i<N;i++){
        const s=state.newState('Ray',0,pos,role); state.setS(s);
        const S=state.S;
        Object.assign(S,{stage:'PRO',lv:'CPBL1',org:'CPBL',orgTeam:'台北恐龍',pos,role,dpos,
          age:22,year:2032,seasonFactor:1});
        S.stats.CPBL={yr,AS:0};
        S.honors=[];
        aw.awards('CPBL',{...stat});
        if(S.honors.includes('2032 中職年度MVP'))mvp++;
        if(S.honors.includes('2032 中職新人王'))rookie++;
      }
      return {mvp:mvp/N,rookie:rookie/N};
    };
    return {
      /* 截圖一：DH，.228／.318／.477，28 轟，能力值很高（d=20）的低潮年 */
      ray2032:rate({G:110,PA:468,AB:413,H:94,HR:28,RBI:77,SB:16,BB:55,avg:.228,DEF:0,d:20,form:-1,_dh:true}),
      /* 截圖二：CF，.212／.282／.397，21 轟，同樣是低潮年 */
      ray2034:rate({G:117,PA:497,AB:453,H:96,HR:21,RBI:65,SB:0,BB:44,avg:.212,DEF:4,d:20,form:-1},{dpos:'CF'}),
      /* 真正的 MVP 級球季：.326、30 轟，能力 d 只有 10 也要有機會 */
      bigYear:rate({G:120,PA:520,AB:460,H:150,HR:30,RBI:100,SB:5,BB:60,avg:.326,DEF:0,d:10,_dh:true},{yr:3}),
      /* 低於聯盟平均的新人（OPS+ 約 80），能力再高也不該拿新人王 */
      weakRookie:rate({G:110,PA:460,AB:420,H:92,HR:8,RBI:40,SB:3,BB:40,avg:.219,DEF:0,d:18,_dh:true}),
    };
  });

  assert.deepEqual(errors,[]);
  assert.equal(r.ray2032.mvp,0,`OPS+ 113 的球季不該拿年度MVP：${JSON.stringify(r.ray2032)}`);
  assert.equal(r.ray2034.mvp,0,`OPS+ 96 的球季不該拿年度MVP：${JSON.stringify(r.ray2034)}`);
  assert.equal(r.ray2034.rookie,0,`OPS+ 96 的新人不該拿新人王：${JSON.stringify(r.ray2034)}`);
  assert.ok(r.ray2032.rookie<0.9,`OPS+ 113 的新人不該近乎必得新人王：${JSON.stringify(r.ray2032)}`);
  assert.ok(r.bigYear.mvp>0.2,`真正的 MVP 級球季機率太低：${JSON.stringify(r.bigYear)}`);
  assert.equal(r.weakRookie.rookie,0,`低於聯盟平均的新人拿到新人王：${JSON.stringify(r.weakRookie)}`);
  console.log('award_mvp_rookie_performance OK',JSON.stringify(r));
}finally{
  await browser.close();
}
