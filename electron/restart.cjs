const fs=require('node:fs/promises');
const path=require('node:path');
function createRestartManager({file,getBootId,arm,disarm,inspect,enabled=true}){
 let queue=Promise.resolve();
 const location=()=>typeof file==='function'?file():file;
 const exclusive=task=>{const next=queue.then(task);queue=next.catch(()=>{});return next};
 async function read(){try{const row=JSON.parse(await fs.readFile(location(),'utf8'));return row.schema===1&&typeof row.bootId==='string'&&['10','11'].includes(row.version)?row:null}catch(e){if(e.code==='ENOENT')return null;throw e}}
 async function write(row){await fs.mkdir(path.dirname(location()),{recursive:true});const temporary=location()+'.tmp';try{await fs.writeFile(temporary,JSON.stringify(row),'utf8');await fs.rename(temporary,location())}finally{await fs.unlink(temporary).catch(()=>{})}}
 async function remove(){await disarm().catch(()=>{});await fs.unlink(location()).catch(e=>{if(e.code!=='ENOENT')throw e})}
 return {
  afterApply(plan,result,version){return exclusive(async()=>{
   const applied=new Set((result.report||[]).filter(r=>r.status==='applied').map(r=>r.id)).size;
   if(!enabled||!result.ok||result.cancelled||result.noChanges||!applied)return null;
   try{
    const bootId=await getBootId();if(!bootId)throw Error('Не удалось определить запуск Windows.');
    const state={schema:1,bootId,version,profile:plan.profile,ids:[...new Set(result.report.filter(r=>r.status==='applied').map(r=>r.id))],count:applied,notified:false,scheduled:false};await write(state);
    try{await arm();state.scheduled=true;await write(state)}catch{state.warning='Не удалось настроить разовый запуск. После перезагрузки откройте LAGOPHONE вручную.';await write(state)}
    return {required:true,scheduled:state.scheduled,warning:state.warning||''};
   }catch{return {required:true,scheduled:false,warning:'Не удалось сохранить напоминание. Перезагрузите ПК и откройте LAGOPHONE вручную.'}}
  })},
  clear(){return exclusive(async()=>{if(!enabled)return;await remove()})},
  status(){return exclusive(async()=>{
   if(!enabled)return {pending:false};
   const state=await read();if(!state)return {pending:false};
   const bootId=await getBootId();if(!bootId)throw Error('Не удалось проверить перезагрузку Windows.');
   if(bootId===state.bootId)return {pending:true,offer:!state.notified,scheduled:state.scheduled,warning:state.warning||''};
   const audit=await inspect();
   if(!audit.ok)throw Error('Не удалось проверить настройки после перезагрузки. Повторите проверку.');
   await remove();
   if(!audit.active||audit.needsRecovery)return {pending:false};
   if(audit.profile!==state.profile||!Array.isArray(state.ids)||!state.ids.length||!state.ids.every(id=>(audit.checks||[]).some(check=>check.id===id&&check.enabled)))return {pending:false,warning:'После перезагрузки часть настроек отличается от сохранённого профиля. Проверьте раздел «Твики».'};
   return {pending:false,celebration:{profile:state.profile,count:state.count,version:state.version}};
  })},
  defer(){return exclusive(async()=>{const state=await read();if(state){state.notified=true;await write(state)}return {ok:true}})},
  async startup(){
   // RunOnce also fires after sign-out. Keep the one-time launch for the next real reboot.
   if(!enabled)return false;
   return exclusive(async()=>{const state=await read();if(!state)return true;const bootId=await getBootId();if(bootId===state.bootId){await arm();return true}return false});
  },
 };
}
module.exports={createRestartManager};
