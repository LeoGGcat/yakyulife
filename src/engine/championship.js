import {clamp} from '../core/rng.js?v=1.5.12';

/* 只計國家隊與三個職業頂級聯盟冠軍；高中、大學與業餘冠軍不列入。 */
const MAJOR_CHAMPIONSHIP=/(世界棒球經典賽冠軍|世界12強賽冠軍|中職總冠軍|日本一|世界大賽冠軍)$/;
export function majorChampionshipCount(honors){
  return (honors||[]).filter(h=>MAJOR_CHAMPIONSHIP.test(h)).length;
}
const PRO_CHAMPIONSHIP=/(中職總冠軍|日本一|世界大賽冠軍)$/;
/* 結算年表的皇冠顯示所有層級的冠軍（含學生、業餘、國家隊與職業）。
   生涯評價是否計分是另一件事，不應影響履歷上的冠軍標記。 */
export function isChampionshipYear(honors,year){
  const prefix=String(year)+' ';
  return (honors||[]).some(h=>String(h).startsWith(prefix)&&/冠軍$|日本一$/.test(h));
}
export function isProChampionshipYear(honors,year){
  const prefix=String(year)+' ';
  return (honors||[]).some(h=>String(h).startsWith(prefix)&&PRO_CHAMPIONSHIP.test(h));
}
export function championshipChance(base,active){
  return clamp((Number(base)||0)+(active?5:0),0,100);
}
export function intlFinishIndex(roll,strength,active){
  const r=(Number(roll)||0)+(Number(strength)||0);
  if(r>=96-(active?5:0))return 0;
  return r>=88?1:r>=79?2:r>=46?3:4;
}
