const {validateAction}=require('./policy.cjs');
function createWindowsActions({isRunning,system,run,activities}){
 return async(id,version)=>{
  if(isRunning())throw Error('Дождитесь завершения оптимизации или отката.');
  const info=await system(),action=validateAction(id,version,info.version);
  const message=await run(action.script);
  await activities.add([{target:{page:'tweaks',section:'tools'},kind:'windows',status:'success',title:id==='temp'?'Очистка временных файлов завершена':'Выполнено действие Windows',detail:message}]);
  return message;
 };
}
module.exports={createWindowsActions};
