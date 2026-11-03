const pages=new Set(['gaming','tweaks','apps','drivers','system','monitor']);
export function cleanTarget(value){
 if(!value||!pages.has(value.page))return null;
 const target={page:value.page};
 if(value.page==='tweaks'&&['power','tools'].includes(value.section))target.section=value.section;
 if(value.page==='gaming'&&typeof value.game==='string'&&/^[a-z0-9-]{1,64}$/.test(value.game)&&value.game!=='none')target.game=value.game;
 return target;
}
export function activityTarget(entry){
 const saved=cleanTarget(entry?.target);if(saved)return saved;
 const title=String(entry?.title||'');
 if(/игров|настройк[аи] EXE/i.test(title))return {page:'gaming'};
 if(entry?.kind==='power'||/питан/i.test(title))return {page:'tweaks',section:'power'};
 if(entry?.kind==='download')return {page:'apps'};
 if(entry?.kind==='windows')return {page:'tweaks',section:'tools'};
 if(['apply','restore','cancel'].includes(entry?.kind))return {page:'tweaks'};
 return {page:'system'};
}
