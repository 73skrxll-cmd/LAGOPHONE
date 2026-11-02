export const PING_SERVICES=Object.freeze([
 {id:'fortnite',title:'Fortnite',eyebrow:'FORTNITE · ЕВРОПА',notice:'ICMP до тестового датацентра Epic. Пинг игрового UDP-соединения может отличаться; результат нужно проверить в матче.'},
 {id:'discord',title:'Discord',eyebrow:'DISCORD · СОЕДИНЕНИЕ',notice:'Время TCP-подключения к API и шлюзу Discord. Это не задержка голосового канала и не проверка качества звонка: голос передаётся отдельно по UDP.'},
 {id:'epic',title:'Epic Games',eyebrow:'EPIC GAMES · LAUNCHER',notice:'Время TCP-подключения к сервису лаунчера или CDN. Оно не показывает скорость скачивания игр; загрузку и вход нужно проверить в Epic Games Launcher.'},
].map(Object.freeze));
export const PING_TARGETS=Object.freeze([
 {id:'fortnite-de',service:'fortnite',game:'Fortnite',region:'EU · Германия',host:'ping-de.ds.on.epicgames.com',method:'icmp'},
 {id:'fortnite-fr',service:'fortnite',game:'Fortnite',region:'EU · Франция',host:'ping-fr.ds.on.epicgames.com',method:'icmp'},
 {id:'fortnite-gb',service:'fortnite',game:'Fortnite',region:'EU · Великобритания',host:'ping-gb.ds.on.epicgames.com',method:'icmp'},
 {id:'discord-api',service:'discord',game:'Discord',region:'API Discord',host:'discord.com',method:'tcp',port:443},
 {id:'discord-gateway',service:'discord',game:'Discord',region:'Шлюз Discord',host:'gateway.discord.gg',method:'tcp',port:443},
 {id:'epic-launcher',service:'epic',game:'Epic Games',region:'Сервис лаунчера',host:'launcher-public-service-prod06.ol.epicgames.com',method:'tcp',port:443},
 {id:'epic-download',service:'epic',game:'Epic Games',region:'CDN загрузок',host:'download.epicgames.com',method:'tcp',port:443},
].map(Object.freeze));
export const EPIC_PING_SOURCE='https://www.epicgames.com/help/c-34254770/c-33726977/a22355516?lang=en-US';
const round=value=>Math.round(value*100)/100;
const quantile=(sorted,p)=>sorted.length?sorted[Math.max(0,Math.ceil(sorted.length*p)-1)]:null;

export function pingTarget(id){
 const target=PING_TARGETS.find(item=>item.id===id);
 if(!target)throw Error('Неизвестный тестовый сервер.');
 return target;
}

export function summarizePing(samples){
 if(!Array.isArray(samples)||samples.length>200)throw Error('Некорректный набор измерений.');
 const times=[];
 for(const sample of samples){
  if(!sample||!['success','timeout','unreachable','error'].includes(sample.status))throw Error('Некорректный ответ измерения.');
  if(sample.status==='success'){
   if(typeof sample.rttMs!=='number'||!Number.isFinite(sample.rttMs)||sample.rttMs<0||sample.rttMs>60000)throw Error('Некорректная задержка.');
   times.push(sample.rttMs);
  }
 }
 const sorted=[...times].sort((a,b)=>a-b),n=times.length;
 return {sent:samples.length,received:n,lost:samples.length-n,
  lossPct:samples.length?round((samples.length-n)*100/samples.length):null,
  minMs:n?sorted[0]:null,maxMs:n?sorted[n-1]:null,
  meanMs:n?round(times.reduce((sum,value)=>sum+value,0)/n):null,
  medianMs:n?round(n%2?sorted[(n-1)/2]:(sorted[n/2-1]+sorted[n/2])/2):null,
  p95Ms:quantile(sorted,.95),
  jitterMs:n>1?round(times.slice(1).reduce((sum,value,i)=>sum+Math.abs(value-times[i]),0)/(n-1)):null};
}

// A-B-A: compare the same pinned address with and without the real tunnel, then
// repeat the direct baseline so a naturally improving network is not a "boost".
// ICMP RTT and TCP establishment time are separate metrics. Neither is an
// invented in-game/voice RTT or a download throughput measurement.
export function comparePingTrials(before,routed,after){
 const directBefore=summarizePing(before?.samples),tunnel=summarizePing(routed?.samples),directAfter=summarizePing(after?.samples);
 const result={directBefore,tunnel,directAfter,verdict:'inconclusive',recommended:'direct',gainMs:null,gainPct:null};
 if(!before.address||before.address!==routed.address||before.address!==after.address||!['icmp','tcp'].includes(before.method)||before.method!==routed.method||before.method!==after.method)return {...result,reason:'different-target'};
 if(before.method==='tcp'&&(before.port!==443||routed.port!==443||after.port!==443))return {...result,reason:'different-target'};
 if(before.targetId&&(before.targetId!==routed.targetId||before.targetId!==after.targetId))return {...result,reason:'different-target'};
 if([directBefore,tunnel,directAfter].some(item=>item.sent<30||item.received<20))return {...result,reason:'insufficient-samples'};
 const fastestDirect=Math.min(directBefore.medianMs,directAfter.medianMs);
 const baselineDrift=Math.abs(directBefore.medianMs-directAfter.medianMs);
 if(baselineDrift>Math.max(5,fastestDirect*.12))return {...result,verdict:'unstable',reason:'baseline-changed'};
 const gain=round(fastestDirect-tunnel.medianMs),gainPct=fastestDirect?round(gain*100/fastestDirect):0;
 const measured={...result,gainMs:gain,gainPct};
 if(tunnel.lossPct>2)return {...measured,verdict:'not-improved',reason:'unreliable-tunnel'};
 if(tunnel.lossPct>Math.max(directBefore.lossPct,directAfter.lossPct))return {...measured,verdict:'not-improved',reason:'more-loss'};
 if(tunnel.p95Ms>Math.max(directBefore.p95Ms,directAfter.p95Ms)+3)return {...measured,verdict:'not-improved',reason:'worse-tail'};
 if(gain<Math.max(3,fastestDirect*.05))return {...measured,verdict:'not-improved',reason:'no-reliable-gain'};
 return {...measured,verdict:'improved',recommended:'tunnel',reason:'measured-gain'};
}
