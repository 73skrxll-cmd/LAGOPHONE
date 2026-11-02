const path=require('node:path'),net=require('node:net'),{spawn}=require('node:child_process');
const {windowsPowerShellExecutable,windowsPowerShellEnvironment}=require('./windows-powershell.cjs');
function createPingProbe({worker=path.join(__dirname,'ping-probe.ps1'),launch=spawn,platform=process.platform}={}){
 return async function probe(mode,payload,{onSample=()=>{},signal}={}){
  if(platform!=='win32')throw Error('Реальные измерения доступны в приложении Windows.');
  const {pingTarget,summarizePing}=await import('../shared/ping.mjs');const target=pingTarget(payload?.targetId);
  if(!['resolve','measure','route'].includes(mode))throw Error('Неизвестный режим измерения.');
  if(mode==='route'&&net.isIP(payload.address)!==4)throw Error('Некорректный адрес маршрута.');
  if(mode==='measure'&&(!Number.isInteger(payload.count)||payload.count<1||payload.count>100||net.isIP(payload.address)!==4))throw Error('Некорректные параметры измерения.');
  if(signal?.aborted)throw Object.assign(Error('Измерение отменено.'),{code:'ABORT_ERR'});
  return new Promise((resolve,reject)=>{
   const encoded=Buffer.from(JSON.stringify(payload)).toString('base64');
   const child=launch(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',worker,'-Mode',mode,'-PayloadBase64',encoded],{windowsHide:true,env:windowsPowerShellEnvironment(),stdio:['ignore','pipe','pipe']});
   let buffer='',bytes=0,resolved=null,complete=false,failure=null,settled=false;
   const samples=[],startedAt=new Date().toISOString();
   const finish=(error,result)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result)};
   const abort=()=>{failure=Object.assign(Error('Измерение отменено.'),{code:'ABORT_ERR'});child.kill()};
   const timer=setTimeout(()=>{failure=Error('Тестовый сервер не ответил вовремя.');child.kill()},mode==='measure'?payload.count*1600+10000:20000);
   signal?.addEventListener('abort',abort,{once:true});
   if(signal?.aborted)abort();
   child.on('error',()=>finish(Error('Не удалось запустить измерение Windows.')));
   child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
    bytes+=Buffer.byteLength(chunk);if(bytes>65536){failure=Error('Некорректный размер ответа Windows.');child.kill();return}buffer+=chunk;
    let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline).trim();buffer=buffer.slice(newline+1);if(!line)continue;
     try{const item=JSON.parse(line);
      if(item.type==='resolved'&&mode==='resolve'&&net.isIP(item.address)===4&&item.targetId===target.id&&item.host===target.host&&!resolved)resolved=item;
      else if(item.type==='route'&&mode==='route'&&item.targetId===target.id&&item.address===payload.address&&typeof item.viaWarp==='boolean'&&!resolved)resolved=item;
      else if(item.type==='sample'&&mode==='measure'){
       if(item.sample?.sequence!==samples.length||samples.length>=payload.count)throw Error('sequence');
       summarizePing([item.sample]);samples.push(item.sample);if(!failure)onSample(item.sample);
      }else if(item.type==='complete'&&mode==='measure'&&item.count===payload.count)complete=true;
      else if(item.type==='error')failure=Error(String(item.message||'Ошибка измерения.').slice(0,200));
      else throw Error('event');
     }catch{failure=Error('Windows вернула некорректные данные измерения.');child.kill()}
    }
   });
   // Drain errors without exposing process details or invoking a shell parser.
   child.stderr.on('data',()=>{});
   child.on('close',code=>{
    if(failure)return finish(failure);
    if(code!==0)return finish(Error('Windows не выполнила измерение.'));
    if(mode!=='measure')return resolved?finish(null,resolved):finish(Error('Не удалось подтвердить адрес или маршрут сервера.'));
    if(!complete||samples.length!==payload.count)return finish(Error('Измерение завершилось не полностью.'));
    finish(null,{targetId:payload.targetId,host:target.host,address:payload.address,method:target.method,...(target.port?{port:target.port}:{}),samples,startedAt,finishedAt:new Date().toISOString(),summary:summarizePing(samples)});
   });
  });
 };
}
module.exports={createPingProbe};
