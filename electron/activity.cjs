const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const powerNames={balanced:'Сбалансированный',high:'Высокая производительность',ultimate:'Максимальная производительность',lagophone:'LAGOPHONE Performance',keep:'Текущий'};
function optimizationEvents(mode,payload,result){
 const report=Array.isArray(result.report)?result.report:[];
 const count=status=>new Set(report.filter(r=>r.status===status).map(r=>r.id)).size;
 if(result.cancelled)return [{kind:'cancel',status:'cancelled',title:mode==='apply'?'Применение отменено':'Восстановление отменено',detail:'Настройки этой операцией не изменялись.'}];
 const success=result.ok===true;
 const title=mode==='restore'?(success?'Исходные настройки восстановлены':'Восстановление завершилось не полностью'):(success?(result.noChanges?'Новых изменений нет':'Выбранные твики применены'):(result.restored?'Применение не завершено — изменения отменены':'Применение завершилось с ошибкой'));
 const visibleTitle=payload?.scope==='game'?(mode==='restore'?'Игровые настройки восстановлены':success?(result.noChanges?'Игровые настройки уже действуют':'Игровые настройки применены'):'Игровая настройка завершилась не полностью'):title;
 const events=[{kind:mode,status:success?'success':'error',title:visibleTitle,detail:result.error||`Применено: ${count('applied')}. Восстановлено: ${count('restored')}. Пропущено: ${count('skipped')}.`}];
 if(mode==='apply'&&success&&report.some(r=>r.id==='power'&&r.status==='applied'))events.push({kind:'power',status:'success',title:'Изменён план питания',detail:powerNames[payload?.power]||'Выбранный план'});
 if(mode==='restore'&&report.some(r=>r.id==='power'&&r.status==='restored'))events.push({kind:'power',status:'success',title:'Восстановлен прежний план питания',detail:'Возвращён план, сохранённый перед оптимизацией.'});
 return events;
}
function createActivityStore(fileOrResolver,{limit=80}={}){
 let queue=Promise.resolve(),warning='';
 const file=()=>typeof fileOrResolver==='function'?fileOrResolver():fileOrResolver;
 async function read(){
   try{
     const stat=await fs.stat(file());if(stat.size>1024*1024)throw new Error('Activity log is too large');
     const rows=JSON.parse(await fs.readFile(file(),'utf8'));if(!Array.isArray(rows))throw new Error('Invalid activity log');
     return rows.filter(r=>r&&typeof r.id==='string'&&typeof r.at==='string'&&Number.isFinite(Date.parse(r.at))&&typeof r.title==='string'&&typeof r.detail==='string'&&['success','error','warning','cancelled'].includes(r.status)).slice(0,limit);
   }catch(e){if(e.code==='ENOENT')return [];throw e}
 }
 async function write(rows){
   await fs.mkdir(path.dirname(file()),{recursive:true});
   const temporary=file()+'.'+randomUUID()+'.tmp';
   try{await fs.writeFile(temporary,JSON.stringify(rows,null,2),'utf8');await fs.rename(temporary,file())}
   finally{await fs.unlink(temporary).catch(()=>{})}
 }
 function enqueue(task){const result=queue.then(task);queue=result.catch(()=>{});return result;}
 return {
   async add(events){
     try{return await enqueue(async()=>{
       const current=await read();
       const next=events.map(e=>({id:randomUUID(),at:new Date().toISOString(),kind:String(e.kind||'action').slice(0,40),status:['success','error','warning','cancelled'].includes(e.status)?e.status:'warning',title:String(e.title||'Действие').slice(0,200),detail:String(e.detail||'').slice(0,1000)})).reverse();
       await write([...next,...current].slice(0,limit));warning='';return true;
     })}catch{warning='Не удалось сохранить журнал действий.';return false}
   },
   async list(){await queue;try{return {items:await read(),warning}}catch{return {items:[],warning:'Не удалось прочитать журнал действий.'}}},
   async clear(){try{await enqueue(()=>write([]));warning='';return true}catch{warning='Не удалось очистить журнал действий.';return false}}
 };
}
module.exports={createActivityStore,optimizationEvents};
