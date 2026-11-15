/* ================= 戀愛角色資料（v2.1.0 戀愛系統重置） =================
   每個國家五個職業，每局每國抽三位（台灣抽中啦啦隊時，一半機率是馮海莎）。
   設計原則：每條線的主軸是她自己想完成的事。你的選項只決定「怎麼陪她」，
   她的成就（每章的 end）不論你成功或失敗都會發生——那是她自己贏來的。

   欄位：
     id／n 名字／c 國家（TW JP US）／job 職業／goal 她的目標（結算與提示用）
     meet  第一次相遇（第一次抽到她時顯示）
     work  她的工作用在共用句子裡的名詞（「她最近的〔work〕」）
     sc    好感事件三幕：i 情境、o [保守, 一般, 放手一搏]，每個選項 {t 選項, g 成功, b 失敗}
     conf  告白：ok 成功、no 失敗（失敗不扣好感）
     propNo 求婚被拒時她說的話
     ch    交往三章：t 標題、i 情境、o 同上（g／b 是你的陪伴成不成功）、end 她自己的結果
     go／stay 旅外時她決定一起走／留下的說法；goP 她一起走的基本機率
     safe  true＝永遠不會出現在外遇人選 */
import {GIRLS_TW} from './girls-tw.js?v=2.1.0';
import {GIRLS_JP} from './girls-jp.js?v=2.1.0';
import {GIRLS_US} from './girls-us.js?v=2.1.0';
export const COUNTRY_N={TW:'台灣',JP:'日本',US:'美國'};
export const TW_JOBS=['cheer','reporter','teacher','wbb','pilot'];
const WORK={xiaoqing:'舞蹈',haisha:'主持工作',ruotong:'新聞',peici:'學校',yongen:'投球',yunxi:'飛行',
  misaki:'播報',hiyori:'音樂',sae:'戲',rin:'棋',chinatsu:'連載',
  maya:'診所',sophia:'電影',naomi:'品牌',ellie:'專案',rosa:'公司'};
export const GIRLS=[...GIRLS_TW,...GIRLS_JP,...GIRLS_US].map(g=>({work:WORK[g.id],...g}));
export const GIRL=Object.fromEntries(GIRLS.map(g=>[g.id,g]));
