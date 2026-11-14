const https=require('node:https');
const {targets}=require('./blocking-policy.cjs');
function probe(target,{signal,timeout=5000,request=https.request}={}){return new Promise(resolve=>{const start=Date.now();let deadline,done=false,bytes=0,status=0;const finish=(ok,reason)=>{if(done)return;done=true;clearTimeout(deadline);resolve({id:target.id,name:target.name,url:target.url,method:'HTTPS IPv4 GET · '+(target.tlsVersion||'TLS')+' · проверка сертификата',ok,status,bytes,elapsedMs:Date.now()-start,reason})};
 const req=request(target.url,{method:'GET',family:4,agent:false,rejectUnauthorized:true,...(target.tlsVersion?{minVersion:target.tlsVersion,maxVersion:target.tlsVersion}:{}),signal,headers:{'User-Agent':'GTM-PC-Network-Check/1','Accept-Encoding':'identity'}},res=>{status=res.statusCode||0;res.on('data',chunk=>{bytes+=chunk.length;if(bytes>=Math.max(32768,target.minimum)){finish(status>=200&&status<400,status>=200&&status<400?'Ответ HTTPS получен':'HTTP '+status);res.destroy()}});res.on('end',()=>finish(status>=200&&status<400&&bytes>=target.minimum,'HTTP '+status));res.on('error',()=>finish(false,'Передача прервана'))});deadline=setTimeout(()=>{finish(false,'Тайм-аут HTTPS');req.destroy()},timeout);req.setTimeout(timeout,()=>{finish(false,'Тайм-аут HTTPS');req.destroy()});req.on('error',err=>finish(false,err.name==='AbortError'?'Отменено':'Ошибка DNS, TLS или подключения'));req.end();
})}
async function series(options={}){const rows=[];for(let round=0;round<2;round++){if(options.signal?.aborted)throw Error('Проверка отменена.');rows.push(...await Promise.all(targets.map(target=>probe(target,options))))}return rows}
// The archive's test zapret.ps1 checks separate TLS 1.2/1.3 connections.
// Use the same protocol distinction with certificate validation and real response bytes,
// without running BAT menus that can stop independently installed services.
async function strategySeries(options={}){
 const rows=[];
 for(let round=0;round<2;round++){
  if(options.signal?.aborted)throw Error('Поиск отменён.');
  const batch=await Promise.all(targets.flatMap(target=>['TLSv1.2','TLSv1.3'].map(tlsVersion=>probe({...target,id:target.id+'-'+tlsVersion,tlsVersion},options))));
  if(options.signal?.aborted)throw Error('Поиск отменён.');
  rows.push(...batch.map(row=>({...row,round:round+1})));
 }
 return rows;
}
module.exports={probe,series,strategySeries};
