import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const url=process.env.YAKYOLIFE_URL||'http://127.0.0.1:8124/';
const samplesPerBand=Number(process.env.SALARY_SAMPLES||100);
const browser=await chromium.launch({
  headless:true,
  executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args:['--disable-gpu'],
});

try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${url}?seed=salary-distribution-v1`,{waitUntil:'domcontentloaded'});

  const report=await page.evaluate(async samplesPerBand=>{
    const state=await import('./src/core/state.js?v=1.5.12');
    const season=await import('./src/engine/season.js?v=1.5.12');
    const contract=await import('./src/engine/contract.js?v=1.5.12');
    const {LV}=await import('./src/data/teams.js?v=1.5.12');

    const percentile=(values,q)=>{
      const sorted=values.slice().sort((a,b)=>a-b);
      if(!sorted.length)return 0;
      const index=(sorted.length-1)*q,lo=Math.floor(index),hi=Math.ceil(index);
      return +(sorted[lo]+(sorted[hi]-sorted[lo])*(index-lo)).toFixed(2);
    };
    const summarize=rows=>({
      n:rows.length,
      payD:{p10:percentile(rows.map(r=>r.payD),.10),median:percentile(rows.map(r=>r.payD),.50),p90:percentile(rows.map(r=>r.payD),.90)},
      annual:{p10:percentile(rows.map(r=>r.annual),.10),median:percentile(rows.map(r=>r.annual),.50),p90:percentile(rows.map(r=>r.annual),.90)},
      grades:Object.fromEntries([-1,0,1,2,3].map(grade=>[grade,rows.filter(r=>r.grade===grade).length])),
      forms:Object.fromEntries([-1,0,1].map(form=>[form,rows.filter(r=>r.form===form).length])),
    });
    const makeSample=(lv,kind,baseD)=>{
      const pitcher=kind==='SP',s=state.newState('薪資測試',0,pitcher?'P':'IF',null),par=LV[lv].par;
      s.stage='PRO';s.lv=lv;s.lastLv=lv;s.age=29;s.seasonFactor=1;s.marketInjury='healthy';s.svc=4;
      if(pitcher){
        s.role='SP';s.ab.vel=par+baseD;s.ab.ctl=par+baseD;s.ab.brk=par+baseD;s.ab.sta=60;
      }else{
        s.dpos=kind;
        const offense=par+baseD+.5;
        s.ab.con=offense;s.ab.pow=offense;s.ab.eye=offense;s.ab.spd=offense;s.ab.sta=60;
        s.ab.fld=par;s.ab.rng=par;s.ab.arm=par;
      }
      state.setS(s);
      const st=season.simSeason(lv);
      if(pitcher){ season.normalizePitchingStats(st,lv);st.role='SP'; }
      else{ season.normalizeBatterStats(st,lv);st.DEF=season.defRuns(lv,kind,st.G); }
      const grade=season.seasonGrade(st,lv,kind),payD=season.seasonSalaryRating(st,lv,kind);
      return {grade,payD,form:st.form||0};
    };
    const makeMarketSample=(lv,kind,baseD)=>{
      const years=Array.from({length:3},()=>makeSample(lv,kind,baseD));
      const marketD=+(years[2].payD*.65+years[1].payD*.25+years[0].payD*.10).toFixed(2);
      return {...years[2],payD:marketD,annual:contract.salaryFor(lv,marketD)};
    };

    const bands={},baseRatings=[0,2,4,7,10,12,15];
    for(const lv of ['NPB1','MLB']){
      bands[lv]={};
      for(const kind of ['SP','3B','DH']){
        bands[lv][kind]={};
        for(const baseD of baseRatings){
          const rows=Array.from({length:samplesPerBand},()=>makeMarketSample(lv,kind,baseD));
          bands[lv][kind][baseD]=summarize(rows);
        }
      }
    }
    const curves={};
    for(const lv of ['NPB1','MLB'])curves[lv]=Object.fromEntries([-3,0,1,2,4,7,10,11,12,15,20].map(d=>[d,contract.salaryFor(lv,d)]));
    return {samplesPerBand,curves,bands,cpbl10:contract.salaryFor('CPBL1',10),cpbl20:contract.salaryFor('CPBL1',20)};
  },samplesPerBand);

  assert.equal(report.cpbl10,1070,'中職薪資曲線不可被這次調整改動');
  assert.equal(report.cpbl20,2620,'中職高端薪資曲線也不可吃到日美的軟性遞減');
  assert.equal(report.curves.MLB[0],2400,'大聯盟市場底薪錨點維持 2,400 萬台幣');
  /* 真實市場錨點（固定匯率：1 美元=30 台幣、1 台幣=4.7 日圓）：
     NPB 2026 中位 2,000 萬／平均 5,216 萬日圓；MLB 2026 中位 140 萬美元、底薪 78 萬美元。 */
  assert(report.curves.NPB1[0]*4.7>=1600&&report.curves.NPB1[0]*4.7<=2200,'日職評價 0 應貼近 2,000 萬日圓中位數');
  assert(report.curves.NPB1[2]*4.7>=4500&&report.curves.NPB1[2]*4.7<=5600,'日職評價 2 應貼近 5,216 萬日圓平均數');
  assert(report.curves.MLB[1]/3000>=1.3&&report.curves.MLB[1]/3000<=1.6,'大聯盟評價 1 應貼近 140 萬美元中位數');
  assert(report.curves.MLB[11]>=90000&&report.curves.MLB[11]<=91000,'大聯盟評價 11 應約為 3,000 萬美元');
  assert(report.curves.NPB1[15]>=12000&&report.curves.NPB1[15]<=13000,'日職評價 15 應約為 6 億日圓');
  assert(report.curves.MLB[20]<=200000,'歷史級大聯盟頂薪應以軟性遞減控制在約 6,500 萬美元');
  assert(report.curves.NPB1[20]<=16000,'歷史級日職頂薪應以軟性遞減控制在約 7 億日圓');
  for(const lv of ['NPB1','MLB']){
    const values=[-3,0,1,2,4,7,10,11,12,15,20].map(d=>report.curves[lv][d]);
    assert(values.every((value,index)=>index===0||value>=values[index-1]),`${lv} 薪資曲線必須單調遞增`);
  }
  assert.equal(errors.length,0,errors.join('\n'));
  const compact={samplesPerBand:report.samplesPerBand,curves:report.curves,bands:{}};
  for(const lv of ['NPB1','MLB']){
    compact.bands[lv]={};
    for(const kind of ['SP','3B','DH']){
      compact.bands[lv][kind]={};
      for(const d of [0,2,4,7,10,12,15]){
        const row=report.bands[lv][kind][d];
        compact.bands[lv][kind][d]={marketD:row.payD,annual:row.annual};
        if(lv==='NPB1')compact.bands[lv][kind][d].annual億日圓={
          p10:+(row.annual.p10*4.7/10000).toFixed(2),
          median:+(row.annual.median*4.7/10000).toFixed(2),
          p90:+(row.annual.p90*4.7/10000).toFixed(2),
        };
        else compact.bands[lv][kind][d].annual百萬美元={
          p10:+(row.annual.p10/3000).toFixed(2),
          median:+(row.annual.median/3000).toFixed(2),
          p90:+(row.annual.p90/3000).toFixed(2),
        };
      }
    }
  }
  console.log(JSON.stringify(compact,null,2));
}finally{
  await browser.close();
}
