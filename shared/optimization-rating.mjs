import {optimizationView} from './optimization-view.mjs';
export const baselineIds=['transparency','animations','menu-delay','hover-delay','taskbar-animation','selection-effects','icon-shadows','drag-content','explorer-promos','windows-tips','welcome-promos','lockscreen-facts','start-promos','settings-promos','suggested-installs','search-highlights','startup-delay','game-mode'];
export const ratingLevels=[
 {id:'poor',short:'Плохо',title:'Ваша система плохо оптимизирована',range:'Менее 20% совпадений'},
 {id:'weak',short:'Слабо',title:'Ваша система слабо оптимизирована',range:'20–39% совпадений'},
 {id:'medium',short:'Средне',title:'Ваша система средне оптимизирована',range:'40–69% совпадений'},
 {id:'good',short:'Хорошо',title:'Ваша система хорошо оптимизирована',range:'70–99% совпадений'},
 {id:'ideal',short:'Идеально',title:'Ваша система идеально оптимизирована',range:'Все доступные параметры совпадают'},
];
export function optimizationRating({status=null,native=true,error=''}={}){
 const view=optimizationView({status,native,error});
 const audit=status?.audit;
 const byId=new Map((Array.isArray(audit?.checks)?audit.checks:[]).map(row=>[row.id,row]));
 const rows=baselineIds.map(id=>byId.get(id)||{id,available:false,enabled:null,reason:'Нет результата проверки.'});
 const available=rows.filter(row=>row.available===true&&typeof row.enabled==='boolean'),matched=available.filter(row=>row.enabled).length;
 const base={level:null,percent:null,available:available.length,matched,excluded:rows.length-available.length,rows,checkedAt:audit?.checkedAt||null};
 if(['demo','running','checking','error','recovery'].includes(view.mode))return {...base,mode:view.mode};
 // Never promote a legacy 1/1 or 2/2 read to an ideal system score.
 const complete=audit?.basis==='baseline-v1'&&baselineIds.every(id=>byId.has(id))&&new Set(audit.checks.map(r=>r.id)).size===audit.checks.length&&rows.every(row=>typeof row.available==='boolean'&&(!row.available||typeof row.enabled==='boolean'));
 if(!complete||available.length<12)return {...base,mode:'limited'};
 const ratio=matched/available.length,level=ratio===1?'ideal':ratio>=.7?'good':ratio>=.4?'medium':ratio>=.2?'weak':'poor';
 return {...base,mode:'rated',level,percent:Math.floor(ratio*100)};
}
