import {optimizationView} from './optimization-view.mjs';
export const baselineIds=['transparency','animations','menu-delay','hover-delay','taskbar-animation','selection-effects','icon-shadows','drag-content','explorer-promos','windows-tips','welcome-promos','lockscreen-facts','start-promos','settings-promos','suggested-installs','search-highlights','startup-delay','game-mode'];
export const ratingLevels=[
 {id:'poor',short:'Плохо',title:'Ваша система плохо оптимизирована',range:'Базовые настройки не завершены'},
 {id:'weak',short:'Слабо',title:'Ваша система слабо оптимизирована',range:'Базовый профиль · максимум 30%'},
 {id:'medium',short:'Средне',title:'Ваша система средне оптимизирована',range:'Средний профиль · до 60%'},
 {id:'good',short:'Хорошо',title:'Ваша система хорошо оптимизирована',range:'Глубокий профиль · до 90%'},
 {id:'ideal',short:'Идеально',title:'Ваша система идеально оптимизирована',range:'Глубокий + проверенный профиль игры'},
];
export function optimizationRating({status=null,native=true,error=''}={}){
 const view=optimizationView({status,native,error});
 const audit=status?.audit;
 const byId=new Map((Array.isArray(audit?.checks)?audit.checks:[]).map(row=>[row.id,row]));
 const rows=baselineIds.map(id=>byId.get(id)||{id,available:false,enabled:null,reason:'Нет результата проверки.'});
 const available=rows.filter(row=>row.available===true&&typeof row.enabled==='boolean'),matched=available.filter(row=>row.enabled).length;
 const base={summary:'Базовые настройки · максимум «Слабо»',level:null,percent:null,available:available.length,matched,excluded:rows.length-available.length,rows,checkedAt:audit?.checkedAt||null};
 if(['demo','running','checking','error','recovery'].includes(view.mode))return {...base,mode:view.mode};
 // Never promote a legacy 1/1 or 2/2 read to an ideal system score.
 const complete=audit?.basis==='baseline-v1'&&baselineIds.every(id=>byId.has(id))&&new Set(audit.checks.map(r=>r.id)).size===audit.checks.length&&rows.every(row=>typeof row.available==='boolean'&&(!row.available||typeof row.enabled==='boolean'));
 if(!complete||available.length<12)return {...base,mode:'limited'};
 // Profile selection in the renderer is never evidence. Advanced points come only
 // from a fresh native read of the persisted applied plan, with per-target results.
 const advanced=status?.profileAudit;
 const advancedRows=Array.isArray(advanced?.checks)?advanced.checks:[];
 const valid=status.active===true&&status.profile===advanced?.profile&&advanced?.basis==='profiles-v2'&&['basic','balanced','deep'].includes(advanced.profile)&&
  Array.isArray(advanced.expectedIds)&&advanced.expectedIds.length===advancedRows.length&&new Set(advanced.expectedIds).size===advanced.expectedIds.length&&advanced.expectedIds.every(id=>advancedRows.some(r=>r.id===id))&&new Set(advancedRows.map(r=>r.id)).size===advancedRows.length&&advancedRows.every(r=>
   typeof r.id==='string'&&[1,2,3].includes(r.tier)&&typeof r.available==='boolean'&&(!r.available||typeof r.enabled==='boolean'));
 const groups=[1,2,3].map(tier=>{
  const rows=valid?advancedRows.filter(r=>r.tier===tier&&r.available):[];
  return {tier,rows,ratio:rows.length?rows.filter(r=>r.enabled).length/rows.length:0};
 });
 // Empty/unavailable advanced groups never count as completed.
 const medium=valid&&['balanced','deep'].includes(advanced.profile)?groups[0].ratio:0;
 const deep=valid&&advanced.profile==='deep'?groups[1].ratio:0;
 const game=valid&&advanced.profile==='deep'&&groups[2].rows.length===1&&groups[2].rows[0].id==='game-gpu'?groups[2].ratio:0;
 const score=30*matched/available.length+30*medium+30*deep+10*game;
 const ideal=matched===available.length&&medium===1&&deep===1&&game===1;
 const percent=ideal?100:Math.min(99,Math.floor(score));
 const level=ideal?'ideal':percent>=70?'good':percent>=40?'medium':percent>=20?'weak':'poor';
 const allRows=[...base.rows,...(valid?advancedRows:[])];
 const summary=ideal?'Глубокий и игровой профили проверены':valid?`Проверено: базовый ${Math.floor(30*matched/available.length)}/30 · средний ${Math.floor(30*medium)}/30 · глубокий ${Math.floor(30*deep)}/30 · игра ${10*game}/10`:base.summary;
 return {...base,rows:allRows,mode:'rated',level,percent,summary};
}
