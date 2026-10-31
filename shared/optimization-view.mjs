export function optimizationView({status=null,error='',busy='',native=true}={}) {
  const liveRunning=!!busy||(!error&&status?.running===true);
  let mode;
  if(liveRunning)mode='running';
  else if(!native)mode='demo';
  else if(error||status?.ok===false)mode='error';
  else if(!status)mode='checking';
  else if(status.active)mode=status.needsRecovery?'recovery':'applied';
  else mode='idle';
  return {
    mode,controlsLocked:liveRunning,
    canApply:!liveRunning&&!status?.needsRecovery&&(!native||(!error&&status?.ok===true)),
    canRestore:native&&!liveRunning&&(status?.active===true||mode==='error'),
    hasBackup:status?.active===true,
  };
}
export function withTimeout(promise,milliseconds,message){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error(message)),milliseconds);
    Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value)},error=>{clearTimeout(timer);reject(error)});
  });
}
