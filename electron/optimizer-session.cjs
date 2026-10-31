function createOptimizerSession(now=Date.now) {
  let operation=null,inspection=null;
  return {
    isRunning:()=>operation!==null,
    current:()=>operation?{...operation}:null,
    async exclusive(mode,task){
      if(operation)throw new Error('Уже выполняется операция.');
      const token={mode,phase:'checking',startedAt:now()};operation=token;
      // The same token remains the lock owner for every phase.
      try{return await task(phase=>{token.phase=phase;});}
      finally{if(operation===token)operation=null;}
    },
    inspect(load){
      if(inspection)return inspection;
      const request=Promise.resolve().then(load).finally(()=>{if(inspection===request)inspection=null;});
      inspection=request;return request;
    }
  };
}
module.exports={createOptimizerSession};
