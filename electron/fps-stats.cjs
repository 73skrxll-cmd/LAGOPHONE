const fs=require('node:fs/promises'),path=require('node:path');
function metrics(value){
 const count=Number(value.count),sum=Number(value.sumMs),minimum=Number(value.minMs);
 if(!Number.isSafeInteger(count)||count<1||!Number.isFinite(sum)||sum<=0||!Number.isFinite(minimum)||minimum<=0)return null;
 const bins=Object.entries(value.histogram||{}).map(([key,n])=>[Number(key)/10,Number(n)]).filter(([ms,n])=>Number.isFinite(ms)&&ms>0&&Number.isSafeInteger(n)&&n>0).sort((a,b)=>b[0]-a[0]);
 const wanted=Math.ceil(count*.01);let remaining=wanted,slow=0;for(const [ms,n] of bins){const take=Math.min(n,remaining);slow+=ms*take;remaining-=take;if(!remaining)break}
 return {average:1000*count/sum,low1:count>=100&&remaining===0?1000*wanted/slow:null,maximum:1000/minimum,frames:count};
}
function cleanSession(raw,now=new Date()){
 if(!raw||!/^[-a-z0-9]{1,70}$/i.test(raw.id||'')||!/^[-a-z0-9]{1,70}$/i.test(raw.gameId||'')||!metrics(raw))return null;
 const start=Date.parse(raw.startedAt),last=Date.parse(raw.lastAt),gameStart=Date.parse(raw.gameStartedAt),ended=Date.parse(raw.endedAt);
 if(!Number.isFinite(start)||!Number.isFinite(last)||last<start||last>now.getTime()+60000)return null;
 const captureStart=Date.parse(raw.captureStartedAt);
 const partialStart=raw.partialStart===true||!Number.isFinite(gameStart)||Number.isFinite(captureStart)&&captureStart-gameStart>10000;
 return {id:raw.id,gameId:raw.gameId,name:String(raw.name||raw.gameId).slice(0,100),startedAt:new Date(start).toISOString(),captureStartedAt:Number.isFinite(captureStart)?new Date(captureStart).toISOString():null,gameStartedAt:Number.isFinite(gameStart)?new Date(gameStart).toISOString():null,lastAt:new Date(last).toISOString(),endedAt:Number.isFinite(ended)?new Date(ended).toISOString():null,alive:raw.alive===true,partialEnd:raw.partialEnd===true,partialStart,count:raw.count,sumMs:raw.sumMs,minMs:raw.minMs,histogram:Object.fromEntries(Object.entries(raw.histogram||{}).slice(0,40000))};
}
function publicSession(value,now=Date.now()){
 const end=value.alive?now:Date.parse(value.endedAt||value.lastAt),partial=value.partialStart||value.partialEnd;
 const start=Date.parse(value.gameStartedAt||value.startedAt);
 return {...metrics(value),id:value.id,gameId:value.gameId,name:value.name,startedAt:value.startedAt,lastAt:value.lastAt,endedAt:value.endedAt,alive:value.alive,partial,partialEnd:value.partialEnd,durationMs:Math.max(0,end-start),recordedMs:Math.max(0,Date.parse(value.lastAt)-Date.parse(value.startedAt))};
}
function weekFor(sessions,gameId,now=new Date()){
 const days=Array.from({length:7},(_,i)=>{const day=new Date(now);day.setHours(0,0,0,0);day.setDate(day.getDate()-6+i);return {date:day.getFullYear()+'-'+String(day.getMonth()+1).padStart(2,'0')+'-'+String(day.getDate()).padStart(2,'0'),start:day.getTime(),count:0,sumMs:0,minMs:Infinity,histogram:{},durationMs:0,sessions:0}});
 for(const session of sessions.filter(s=>s.gameId===gameId)){
  const stamp=Date.parse(session.startedAt),day=days.find((d,i)=>stamp>=d.start&&(i===6||stamp<days[i+1].start));if(!day)continue;
  day.count+=session.count;day.sumMs+=session.sumMs;day.minMs=Math.min(day.minMs,session.minMs);day.sessions++;day.durationMs+=publicSession(session,now.getTime()).durationMs;
  for(const [key,count] of Object.entries(session.histogram))day.histogram[key]=(day.histogram[key]||0)+count;
 }
 return days.map(d=>({date:d.date,average:d.count?metrics(d).average:null,durationMs:d.durationMs,sessions:d.sessions}));
}
function createFpsStore(file){
 let sessions=new Map(),loaded=false,saveTask=Promise.resolve();
 async function load(){if(loaded)return;loaded=true;try{const data=JSON.parse(await fs.readFile(file(),'utf8'));for(const raw of data.sessions||[]){const value=cleanSession(raw);if(value){value.alive=false;value.partialEnd=value.partialEnd||!value.endedAt;sessions.set(value.id,value)}}}catch{}}
 function ingest(rows){let changed=false;for(const raw of rows||[]){const value=cleanSession(raw);if(value){sessions.set(value.id,value);changed=true}}return changed}
 function finish(){for(const value of sessions.values())if(value.alive){value.alive=false;value.partialEnd=true;value.endedAt=value.lastAt}}
 async function save(){const latest=new Map();for(const value of sessions.values())if(!latest.has(value.gameId)||value.startedAt>latest.get(value.gameId).startedAt)latest.set(value.gameId,value);const cutoff=Date.now()-8*86400000;for(const [id,value] of sessions)if(Date.parse(value.lastAt)<cutoff&&latest.get(value.gameId)!==value)sessions.delete(id);const data=JSON.stringify({version:1,sessions:[...sessions.values()].slice(-500)});saveTask=saveTask.catch(()=>{}).then(async()=>{const target=file();await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target+'.tmp',data);await fs.rename(target+'.tmp',target)});await saveTask}
 function snapshot(){const all=[...sessions.values()],latest=new Map();for(const s of all)if(!latest.has(s.gameId)||s.startedAt>latest.get(s.gameId).startedAt)latest.set(s.gameId,s);return {games:[...latest.values()].sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).map(s=>({...publicSession(s),week:weekFor(all,s.gameId)}))}}
 return {load,ingest,finish,save,snapshot};
}
module.exports={metrics,cleanSession,publicSession,weekFor,createFpsStore};
