const fs=require('node:fs/promises'),path=require('node:path'),https=require('node:https'),net=require('node:net');
const {randomUUID}=require('node:crypto'),{execFile,spawn}=require('node:child_process');
const {windowsPowerShellExecutable,windowsPowerShellEnvironment}=require('./windows-powershell.cjs');
const {validateProfile}=require('./proton-profile.cjs');
const id=()=>randomUUID().replaceAll('-','');
function trace(family=4){return new Promise((resolve,reject)=>{
 const request=https.get('https://www.cloudflare.com/cdn-cgi/trace',{family,agent:false,timeout:9000,headers:{'User-Agent':'GTM-PC-route-check'}},response=>{
  if(response.statusCode!==200){response.resume();reject(Error('Контрольный узел проверки выхода недоступен.'));return}
  let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk;if(body.length>8192)request.destroy()});response.on('error',reject);response.on('end',()=>{const ip=/^ip=([^\r\n]+)$/m.exec(body)?.[1],country=/^loc=([A-Z]{2})$/m.exec(body)?.[1];if(!net.isIP(ip||'')||!country)return reject(Error('Не удалось проверить страну выходного IP.'));resolve({ip,country})});
 });request.on('timeout',()=>request.destroy(Error('Проверка выхода не ответила.')));request.on('error',()=>reject(Error('Не удалось проверить выходной адрес через защищённое HTTPS-соединение.')));
})}
function createProtonTunnel({directory,worker,networkCheck,nativeHelper=null,adminAction=null,readState=null,platform=process.platform,getTrace=trace,now=Date.now,delay=ms=>new Promise(r=>setTimeout(r,ms))}){
 const profile=path.join(directory,'gtm-proton-profile.bin'),journalFile=path.join(directory,'gtm-tunnel-journal.json');
 let info=null,owned=null,proof=null,lastError='',operation=null,cancelled=false,initialized=null,lastGeoCheck=0,geoCheck=null;
 async function write(value){await fs.mkdir(directory,{recursive:true});const temp=journalFile+'.'+id()+'.tmp';try{await fs.writeFile(temp,JSON.stringify(value),{mode:0o600});await fs.rename(temp,journalFile)}finally{await fs.unlink(temp).catch(()=>{})}owned=value.owned?value:null}
 async function helper(mode,payload){
  if(nativeHelper)return nativeHelper(mode,payload);
  if(platform!=='win32')throw Error('Подключение доступно только в Windows 10/11.');
  return new Promise((resolve,reject)=>{const child=spawn(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',worker,'-Mode',mode],{env:windowsPowerShellEnvironment(),windowsHide:true,stdio:['pipe','pipe','pipe']});let out='';const timer=setTimeout(()=>{child.kill();reject(Error('Компонент WireGuard не ответил.'))},20000);child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{out+=chunk;if(out.length>100000)child.kill()});child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(Error('Не удалось запустить компонент Windows.'))});child.on('close',code=>{clearTimeout(timer);try{const result=JSON.parse(out.trim());if(code||result.ok===false)throw Error(result.error||'Windows не выполнила операцию WireGuard.');resolve(result)}catch(e){reject(e instanceof SyntaxError?Error('Некорректный ответ компонента WireGuard.'):e)}});child.stdin.on('error',()=>{});child.stdin.end(payload?JSON.stringify(payload):'');});
 }
 async function inspect(){info=await helper('info');return info}
 const quote=s=>"'"+String(s).replaceAll("'","''")+"'";
 async function elevate(mode,leaseId){
  if(adminAction)return adminAction(mode,leaseId);
  const base=await inspect();if(!base.verified)throw Error('Установи официальный WireGuard. Подписи wireguard.exe и wg.exe должны быть действительны.');
  const responseId=id(),responseFile=path.join(base.stateRoot,responseId+'.json');
  const args=['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',`"${worker}"`,'-Mode',mode,'-LeaseId',leaseId,'-ResponseId',responseId,'-ExpectedSid',base.sid];
  if(mode==='connect')args.push('-ProfilePathBase64',Buffer.from(profile).toString('base64'),'-ParentId',String(process.pid));
  const script=`$ErrorActionPreference='Stop';try{$p=Start-Process -FilePath ${quote(windowsPowerShellExecutable())} -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList @(${args.map(quote).join(',')});[Console]::WriteLine('issued')}catch{[Console]::WriteLine('not-issued');exit 1}`;
  try{await new Promise((resolve,reject)=>execFile(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:windowsPowerShellEnvironment(),windowsHide:true,timeout:120000,maxBuffer:8192},(error,out)=>{if(error){const e=Error(String(out).includes('not-issued')?'Запрос Windows отменён. Подключение не менялось.':'Не удалось завершить запрос прав Windows.');e.notIssued=String(out).includes('not-issued');e.code='WG_UAC_CANCELLED';reject(e)}else resolve()}));}
  catch(error){if(error.notIssued)throw error;throw error}
  let result;try{result=JSON.parse(await fs.readFile(responseFile,'utf8'))}catch{throw Error('Нет подтверждения от службы WireGuard. Нажми «Отключить» для восстановления.');}
  if(!result.ok){const error=Error(result.error||'WireGuard не выполнил операцию.');error.code=['initialization','identity','signature','directories','profile','ownership','watchdog','service','cleanup'].includes(result.code)?'WG_'+result.code:'WG_COMPONENT';throw error;}return result;
 }
 async function state(){if(readState&&owned)return readState(owned);if(!owned||!info?.stateRoot)return null;try{const result=JSON.parse(await fs.readFile(path.join(info.stateRoot,owned.name+'.json'),'utf8'));const age=now()-Date.parse(result.at);return Number.isFinite(age)&&age>=-2000&&age<15000?result:null}catch{return null}}
 async function disconnect(){
  if(operation==='connecting')cancelled=true;
  if(!owned){proof=null;return}
  const current=await state();if(current?.removed===true&&!current.serviceRunning){await write({owned:false});proof=null;return}
  const stop=path.join(directory,'gtm-proton-stop-'+owned.leaseId+'.json');await fs.writeFile(stop,JSON.stringify({stop:true}),{mode:0o600});
  let removed=false;for(let i=0;i<20;i++){const s=await state();if(s?.removed&&!s.serviceRunning){removed=true;break}await delay(500)}
  if(!removed)await elevate('disconnect',owned.leaseId);await write({owned:false});await fs.unlink(stop).catch(()=>{});proof=null;
 }
 async function init(){return initialized||(initialized=(async()=>{
  if(platform!=='win32')return;await inspect();
  try{const value=JSON.parse(await fs.readFile(journalFile,'utf8'));if(value.owned){if(!/^[a-f0-9]{32}$/.test(value.leaseId)||value.name!=='GTMPC'+value.leaseId.slice(0,20))throw Error('Журнал VPN повреждён.');owned=value;try{await disconnect()}catch{lastError='Не удалось восстановить прошлое подключение GTM PC. Нажми «Отключить» перед новым запуском.'};}}
  catch(e){if(e.code!=='ENOENT')throw e}
 })())}
 return {
  init,
  async status(){await init();if(platform==='win32'&&!info?.verified)await inspect();const current=await state();if(proof&&(!current?.serviceRunning||!current.routeOk||!current.dnsOk||current.handshakeAgeSec==null||current.handshakeAgeSec>180)){proof=null;lastError='Соединение потеряно или маршрут больше не подтверждён. Регион автоматически не переключается. Отключи подключение GTM PC.'}
   if(proof&&now()-lastGeoCheck>60000){if(!geoCheck){lastGeoCheck=now();geoCheck=getTrace(4).then(exit=>{if(proof&&exit.country!==proof.country){proof=null;lastError='Страна выходного IP изменилась. Маршрут больше не подтверждён; автоматического выбора другого региона нет.'}}).catch(()=>{proof=null;lastError='Повторная проверка выходного маршрута не ответила. Соединение больше не подтверждено.'}).finally(()=>{geoCheck=null})}await geoCheck}
   let profileReady=false;try{profileReady=(await fs.stat(profile)).isFile()}catch{}
   return {provider:'Proton VPN Free + WireGuard',profileReady,installed:!!info?.installed,verified:!!info?.verified,owned:!!owned,connecting:operation==='connecting',connected:!!proof,country:proof?.country||null,ipChanged:proof?.ipChanged===true,ipv6Policy:proof?.ipv6Policy||null,error:lastError,matchStatus:'not-verified'};
  },
  async importProfile(text){await init();if(owned||operation)throw Error('Сначала отключи подключение GTM PC.');const {config}=validateProfile(text);const result=await helper('protect',{config});await fs.mkdir(directory,{recursive:true});const temp=profile+'.'+id();await fs.writeFile(temp,Buffer.from(result.cipher,'base64'),{mode:0o600});await fs.rename(temp,profile);lastError='';},
  async connect(consent,{gameId='fortnite'}={}){
   await init();if(consent!==true)throw Error('Разреши подключение всего ПК через свой профиль Proton VPN.');if(owned||operation)throw Error('Сначала отключи предыдущее подключение GTM PC.');
   operation='connecting';cancelled=false;lastError='';const check=()=>{if(cancelled)throw Error('Подключение отменено.')};
   try{
    const preflight=await networkCheck('preflight');if(preflight.games.length)throw Error('Закрой игру перед подключением.');if(gameId==='fortnite'&&preflight.epicRunning)throw Error('Закрой Epic Games Launcher, включая значок в трее: Epic и игра должны открыть соединения уже через VPN.');if(preflight.proxyEnabled)throw Error('Обнаружен системный прокси. Отключи его самостоятельно для согласованного маршрута Epic и игры.');if(preflight.otherVpn)throw Error('Сначала отключи GearUP и другие VPN. Их настройки GTM PC не меняет.');
    try{if(!(await fs.stat(profile)).isFile())throw Error('missing')}catch{throw Error('Сначала импортируй свой профиль Proton VPN Free.')}
    const original=await getTrace(4);check();const leaseId=id();await write({owned:true,leaseId,name:'GTMPC'+leaseId.slice(0,20),createdAt:new Date(now()).toISOString()});
    try{await elevate('connect',leaseId)}catch(e){if(e.notIssued)await write({owned:false});throw e}
    const deadline=now()+90000;let ready=null;
    while(now()<deadline){check();const s=await state();if(s?.serviceRunning&&s.routeOk&&s.dnsOk&&s.handshakeAgeSec!=null&&s.handshakeAgeSec<180&&s.rxBytes>0&&s.txBytes>0){ready=s;break}await delay(1000)}
    if(!ready)throw Error('Сервер WireGuard не ответил или полный маршрут не подтверждён. Попробуй другой бесплатный профиль из своего кабинета Proton.');
    check();const exit=await getTrace(4);if(exit.ip===original.ip)throw Error('Выходной IP не изменился. Туннель не засчитан.');if(exit.country===original.country)throw Error('Выходной IP остался в той же стране. Для этого сценария выбери другой бесплатный регион в кабинете Proton.');
    const route=await networkCheck('vpn-check',{tunnelName:owned.name});if(!route.routeOk||!route.dnsOk||route.ipv6Bypass)throw Error('Проверка маршрутов Epic, DNS или IPv6 не пройдена. Игра не запускается.');
    check();lastGeoCheck=now();proof={country:exit.country,ipChanged:true,ipv6Policy:ready.ipv6Policy,verifiedAt:new Date(now()).toISOString()};return {...proof};
   }catch(error){lastError=error.message;proof=null;if(owned){try{await disconnect()}catch{lastError+=' Не удалось подтвердить отключение. Повтори восстановление.'}}throw Object.assign(Error(lastError),{code:error.code||'WG_CONNECTION'})}finally{operation=null}
  },
  async disconnect(){cancelled=true;await disconnect();lastError=''},
  cancel:()=>{cancelled=true},
 };
}
module.exports={createProtonTunnel,trace};
