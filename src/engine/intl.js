import {S} from '../core/state.js?v=1.5.12';
import {R, ri, chance, clamp, N0} from '../core/rng.js?v=1.5.12';
import {LV} from '../data/teams.js?v=1.5.12';
import {card, choose, board} from '../ui/dom.js?v=1.5.12';
import {tlNote} from '../ui/timeline.js?v=1.5.12';
import {isSP, fmtIP, outsFromIP, ipFromOuts, normalizeIP, baseballERA} from './season.js?v=1.5.12';
import {ovr} from './ability.js?v=1.5.12';
import {intlFinishIndex} from './championship.js?v=1.5.12';
import {checkChampionTrait} from '../flow/events.js?v=1.5.12';
export function intlWalks(st){
  if(!st)return 0;
  if(Number.isFinite(st.BB))return Math.max(0,Math.round(st.BB));
  /* v1.5.8 舊存檔沒有寫入 BB；打者可由當屆 PA−AB 還原，投手則無足夠資料可回推。 */
  if(Number.isFinite(st.PA)&&Number.isFinite(st.AB))return Math.max(0,Math.round(st.PA-st.AB));
  return 0;
}
export function intlStatLine(st){
  if(S.pos==='P'){
    const era=baseballERA(st);
    return `出賽 ${st.G}｜${fmtIP(st.IP)} 局｜${st.W} 勝｜${st.SV} 救援｜${st.SO} 三振｜${intlWalks(st)} 保送｜ERA ${era==null?'-':era.toFixed(2)}`;
  }
  const avg=st.AB>0?(st.H/st.AB).toFixed(3).replace(/^0/,''):'-';
  return `出賽 ${st.G}｜${st.PA} 打席｜打擊率 ${avg}｜${st.H} 安｜${st.HR} 轟｜${st.RBI} 打點｜${intlWalks(st)} 保送`;
}
export function addIntlStat(st){
  /* 載入舊存檔後第一次再打國際賽時，先把過往打者保送補回通算，避免只累加新賽事。 */
  if(!Number.isFinite(S.intlStat.BB))S.intlStat.BB=(S.intlLog||[]).reduce((n,r)=>n+intlWalks(r.st),0);
  const oldOuts=outsFromIP(S.intlStat.IP);
  Object.keys(st).forEach(k=>{ if(k!=='IP')S.intlStat[k]=(S.intlStat[k]||0)+st[k]; });
  if(Object.prototype.hasOwnProperty.call(st,'IP'))S.intlStat.IP=ipFromOuts(oldOuts+outsFromIP(st.IP));
}
/* MVP 先看當屆實績，再用機率代表與其他國家球員競爭；普通成績不會入圍。 */
export function intlMvpRate(st,finish){
  if(finish>1)return 0; /* 賽會 MVP 原則上只從冠亞軍球隊產生 */
  let score=0;
  if(S.pos==='P'){
    const era=baseballERA(st)??9;
    score=st.IP+st.SO*1.5+st.W*8+st.SV*6+Math.max(0,3.5-era)*5-Math.max(0,era-3.5)*4;
  }else{
    const avg=st.AB>0?st.H/st.AB:0;
    score=st.H*2+st.HR*8+st.RBI*2+Math.max(0,avg-.250)*100;
  }
  const finalistMult=finish===0?1:.2;
  return Math.round(clamp((score-28)*1.7,0,75)*finalistMult);
}
export function intlFormat(wbc){
  return wbc
    ?{minOvr:55,par:LV.MLB.par,ranks:['冠軍','亞軍','四強止步','八強止步','預賽出局'],games:[7,7,6,5,4]}
    :{minOvr:52,par:LV.NPB1.par,ranks:['冠軍','亞軍','季軍','殿軍','預賽出局'],games:[9,9,9,9,5]};
}
export function maybeIntl(done){
  const wbc=(S.year-2026)%4===0; let p12=(S.year-2028)%4===0;
  if(S.lv==='MLB')p12=false; /* 大聯盟球員只打經典賽,不打 12 強 */
  const intlFmt=intlFormat(wbc);
  if(S.stage!=='PRO'||(!wbc&&!p12)||ovr()<intlFmt.minOvr||S.seasonFactor<0.5||S.rehab>0||S.skipMid){ done(); return; } /* 經典賽 55+；12 強維持 52+；復健年/報銷年不徵召 */
  const name=wbc?'世界棒球經典賽':'世界12強賽';
  let forced=false,first=false;
  if(S.intlLock===null){ S.intlLock=S.year; forced=true; first=true; }
  else if(S.year-S.intlLock<5) forced=true;
  if(forced){
    card('info','體育部公文',first
      ?`「查 台端符合國家代表隊遴選資格，依規定<b class="hl">強制徵召</b>，並自即日起<b class="hl">列管五年</b>，列管期間各國際賽事皆須配合徵召，不得以任何理由推辭。」——你甚至還沒拆完信封，行李箱已經被球團打包好了。`
      :`列管期間（剩 ${5-(S.year-S.intlLock)} 年），依規定<b class="hl">強制徵召</b>。你沒有選擇。`);
  }
  const opts=[
    {t:forced?'⋯⋯只能報到（強制徵召）':'披上國家隊戰袍',main:true,s:'依成績獲得能力點｜下季受傷機率 +10%',f:()=>{
      /* 國家隊成敗看整體興衰,個人只佔一小部分 */
      const b=clamp(Math.round((ovr()-52)*0.35),0,8);
      const i=intlFinishIndex(R()*100,b,!!S.traits.championmaker);
      const rk=intlFmt.ranks[i], teamGames=intlFmt.games[i], pts=[6,5,4,2,1][i];
      let gpts=pts; if(S.traits.intlace)gpts=Math.max(pts,2);
      S.pool+=gpts; S.injNext=S.traits.intlace?0:10; S.intlCount++;
      /* Team Taiwan(挺台灣):國際賽出賽超過 5 次 */
      if(!S.traits.taiwan&&S.intlCount>5){ S.traits.taiwan=true;
        card('gold','隱藏稱號：Team Taiwan',`永遠把國家榮耀放在比職涯更高的位子，台灣球迷的心中永遠有一幅畫：你在球場上向全場比劃著胸口，那是你心中最榮耀的地方。`); board(1); }
      /* 先產生並保存本屆成績；事件卡與生涯結算共用同一份資料，不在結算時重骰 */
      let intlSt;
      { const a=S.ab, par=intlFmt.par, clutch=S.traits.clutch?1:0;
        if(S.pos==='P'){ const dd=(a.vel+a.ctl+a.brk)/3-par;
          /* 【修正】區分先發與後援，並將局數與出賽場次連動，符合國際賽球數限制 */
          let g, ip;
          if(isSP()){
            g = teamGames>=6?ri(1,2):1; /* 預賽／八強最多一場先發，進四強或 12 強複賽後才可能二度先發 */
            ip = normalizeIP(g * (4.5 + R() * 2.5)); /* 配合球數限制，單場大約吃 4.5~7 局；量化為完整出局數 */
          } else {
            g = clamp(Math.round(teamGames*(0.55+R()*0.25)),1,teamGames); /* 牛棚登板數隨球隊實際賽程增減 */
            ip = normalizeIP(g * (0.8 + R() * 0.8)); /* 每次上場大約拆彈或投 0.8~1.6 局；量化為完整出局數 */
          }
          
          const k9=clamp(7.5+dd*0.12+clutch*.5,4,14);
          const era=clamp(3.6-dd*0.16-clutch*.35,0.8,8);
          /* 與職業球季共用同一把 BB/9、H/9 尺；短期賽按實際局數縮放。 */
          const bb9=clamp(4.6-(a.ctl-par)*0.13+N0(0.4),1.2,7.5);
          const h9=clamp(9.2-dd*0.16+N0(0.5),5,13.5);
          intlSt={G:g,IP:ip,H:Math.round(ip/9*h9),BB:Math.round(ip/9*bb9),SO:Math.round(ip/9*k9),ER:Math.round(era*ip/9),W:i<=2&&chance(45+clutch*8)?1:0,SV:!isSP()&&chance(30+clutch*6)?1:0};
        } else { const dd=(a.con*0.5+a.pow*0.2+a.eye*0.18+a.spd*0.12)-par-0.5; /* 同步賽季 d 公式(含 pow) */
          const g=teamGames, pa=g*ri(3,4); /* 國家隊球星每場先發，出賽數不得超過該名次的實際賽程 */
          /* 與職業球季同式：選球直接決定保送率，並由 PA−BB 得到打數。 */
          const bb=Math.round(pa*clamp(0.062+(a.eye-par)*0.0034,0.045,0.17));
          const ab=pa-bb;
          const avg=clamp(0.270+dd*0.006+clutch*.015,0.15,0.5), h=Math.round(ab*avg);
          const hr=Math.round(h*clamp(0.06+Math.max(0,a.pow-par)*0.006+clutch*.01,0.03,0.28));
          intlSt={G:g,PA:pa,AB:ab,H:h,HR:hr,RBI:Math.round((hr*2.1+h*0.35)*(1+clutch*.05)),BB:bb};
        }
      }
      addIntlStat(intlSt);
      (S.intlLog||(S.intlLog=[])).push({year:S.year,name,rank:rk,teamGames,st:{...intlSt}});
      if(i<=1)S.intlTop4=(S.intlTop4||0)+1; /* 需打進冠亞軍才算 */
      if(!S.traits.intlace&&S.intlCount>=3&&(S.intlTop4||0)>=2){ S.traits.intlace=true;
        card('gold','隱藏屬性解鎖：國際賽之鬼','只要穿上 CT 球衣，你的痛覺就會消失——你是為大場面而生的男人。<b class="hl">國際賽不再增加受傷風險，且每次徵召能力點保底 +2</b>。'); }
      if(i<=2)S.honors.push(`${S.year} ${name}${rk}`);
      if(i===0){ tlNote(3,(wbc?'經典賽':'12強')+'冠軍'); checkChampionTrait(); }
      let ex=''; const mvpRate=intlMvpRate(intlSt,i); if(chance(mvpRate)){S.honors.push(`${S.year} ${name}MVP`);ex='你憑本屆表現被選為<b class="hl">賽會MVP</b>！';}
      card(i<=1?'gold':'info',name,`中華隊最終成績：<b class="hl">${rk}</b>（團隊出賽 ${teamGames} 場）。${ex}<br><b>本屆個人成績：</b>${intlStatLine(intlSt)}。${S.traits.clutch?'<span class="up">（大心臟：大賽表現加成）</span>':''}<br>獲得能力點 <b class="hl">${gpts}</b> 點。${S.traits.intlace?'國家英雄不知何謂疲憊。':'國際賽的高強度消耗，讓下季受傷風險上升。'}`);
      done(); }},
    ];
  if(!forced)opts.push({t:'以調整為由婉拒',s:'列管期已過，終於能說不',f:done});
  choose(`中華隊徵召 · ${name}`,opts);
}
