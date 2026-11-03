import {summarizePing} from './ping.mjs';
export const SESSION_GAMES=Object.freeze([{id:'pubg',name:'PUBG'},{id:'fortnite',name:'Fortnite'},{id:'tarkov',name:'Escape from Tarkov'}]);
export function formatRtt(value,resolutionMs=1){
 if(typeof value!=='number'||!Number.isFinite(value)||value<0)return 'Нет данных';
 if(resolutionMs>=1)return value<1?'<1 мс':`${Math.round(value)} мс`;
 return `${value} мс`;
}
export function normalizeTrial(trial){
 if(!trial||trial.method!=='icmp'||typeof trial.address!=='string'||!Array.isArray(trial.samples)||trial.samples.length>200)return null;
 const samples=trial.samples.map((s,i)=>{
  const success=s?.status==='success'&&s.sequence===i&&typeof s.rttMs==='number'&&Number.isFinite(s.rttMs)&&s.rttMs>=0&&s.rttMs<=60000;
  return {...s,sequence:i,status:success?'success':['timeout','unreachable','error'].includes(s?.status)?s.status:'error',rttMs:success?s.rttMs:null};
 });return {...trial,resolutionMs:1,samples};
}
export function summarizeEndpoint(trial){
 const normalized=normalizeTrial(trial);if(!normalized)return null;
 const summary=summarizePing(normalized.samples);
 return {...summary,resolutionMs:1,unansweredPct:summary.lossPct,method:'icmp',address:normalized.address};
}
export function compareEndpoints(before,after){
 if(!before?.address||before.address!==after?.address||before.method!=='icmp'||after.method!=='icmp'||before.interfaceIndex!==after.interfaceIndex)return {verdict:'inconclusive',deltaMs:null,reason:'different-target-or-interface'};
 const a=summarizeEndpoint(before),b=summarizeEndpoint(after);
 if(!a||!b||a.sent<20||b.sent<20||a.received<15||b.received<15)return {verdict:'inconclusive',deltaMs:null,reason:'insufficient-icmp-responses'};
 const deltaMs=Math.round((b.medianMs-a.medianMs)*100)/100;
 return {verdict:Math.abs(deltaMs)<Math.max(3,a.medianMs*.05)?'unchanged':deltaMs<0?'lower':'higher',deltaMs,reason:'observed-change-not-proof-of-causation'};
}
export function findings(report,settings={}){
 const list=[],gateway=summarizeEndpoint(report?.gateway),control=summarizeEndpoint(report?.control),network=report?.network;
 if(gateway?.received)list.push({kind:'fact',text:`Роутер ${gateway.address}: ${formatRtt(gateway.medianMs)}, колебания ${formatRtt(gateway.jitterMs)}.`});
 if(gateway&&gateway.received===0)list.push({kind:'fact',text:'Роутер не ответил на ICMP. Это не доказывает потерю игровых пакетов.'});
 if(control?.received)list.push({kind:'fact',text:`Контрольный узел ${control.address}: ${formatRtt(control.medianMs)}. Это не пинг в игре.`});
 if(network?.wifi&&gateway?.jitterMs>5)list.push({kind:'hypothesis',text:'Колебания до роутера могут быть связаны с Wi-Fi. Проверь Ethernet или сигнал рядом с роутером.'});
 if(network?.wifi&&network.signalPct!==null&&network.signalPct<45)list.push({kind:'fact',text:`Уровень сигнала Wi-Fi: ${network.signalPct}%. Причина задержки по одному значению не установлена.`});
 const rx=report?.traffic?.rxMbps,tx=report?.traffic?.txMbps;
 if((settings.downMbps>0&&rx>settings.downMbps*.7)||(settings.upMbps>0&&tx>settings.upMbps*.7))list.push({kind:'hypothesis',text:'Обмен адаптера близок к указанной скорости тарифа. Загрузки могут занимать канал; сравни после их паузы.'});
 if(gateway?.received>=15&&gateway.jitterMs<3&&control?.jitterMs>12)list.push({kind:'hypothesis',text:'До роутера стабильнее, чем до контрольного узла. Возможны нагрузка канала или проблемы дальше по маршруту.'});
 const samples=report?.control?.samples||[];
 if(settings.downMbps>0||settings.upMbps>0){
  const load=s=>Math.max(settings.downMbps>0?(s.rxMbps||0)/settings.downMbps:0,settings.upMbps>0?(s.txMbps||0)/settings.upMbps:0);
  const idle=samples.filter(s=>s.status==='success'&&load(s)<.15),busy=samples.filter(s=>s.status==='success'&&load(s)>.7);
  if(idle.length>=5&&busy.length>=5){const a=summarizePing(idle).medianMs,b=summarizePing(busy).medianMs;if(b-a>10)list.push({kind:'fact',text:`В этой серии при высокой нагрузке RTT был выше на ${Math.round((b-a)*10)/10} мс. Причинная связь требует отдельной проверки.`})}
 }
 if(!list.length)list.push({kind:'fact',text:'Недостаточно ответов для вывода о качестве подключения.'});
 return list;
}
