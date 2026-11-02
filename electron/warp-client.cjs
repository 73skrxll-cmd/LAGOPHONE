const https=require('node:https'),{execFile}=require('node:child_process');
const {windowsPowerShellExecutable,windowsPowerShellEnvironment}=require('./windows-powershell.cjs');
const normalize=value=>String(value).replace(/[^a-z0-9+]/gi,'').toLowerCase();
const trafficModes=new Set(['warp','warpwithdns','warpwithdnsoverhttps','warpwithdnsovertls','warpdoh','warpdot','warp+doh','warp+dot','tunnelonly']);
function fields(value,names,depth=0,result=[]){
 if(depth>8||value===null||typeof value!=='object')return result;
 if(Array.isArray(value)){for(const item of value.slice(0,200))fields(item,names,depth+1,result);return result}
 for(const [key,item] of Object.entries(value)){
  if(names.includes(normalize(key)))result.push(item);
  if(['name','key','setting'].includes(normalize(key))&&names.includes(normalize(item))&&Object.hasOwn(value,'value'))result.push(value.value);
  fields(item,names,depth+1,result);
 }return result;
}
function strings(value,depth=0){
 if(typeof value==='string')return [value];if(depth>5||value===null||typeof value!=='object')return [];
 return Object.values(value).flatMap(item=>strings(item,depth+1));
}
function tokens(value){
 if(value&&typeof value==='object'&&!Array.isArray(value)){
  const field=Object.keys(value).find(key=>normalize(key)==='value');if(field)return tokens(value[field]);
  return [...Object.keys(value),...strings(value)];
 }return strings(value);
}
function parseWarpStatus(data){
 const candidates=typeof data==='string'?[data]:fields(data,['status','state','connectionstatus']).flatMap(value=>typeof value==='object'&&value?Object.keys(value):strings(value));
 const found=[...new Set(candidates.map(normalize).filter(value=>['connected','disconnected','connecting','disconnecting','registrationmissing'].includes(value)))];
 if(found.length!==1)throw Error('Неизвестный формат состояния Cloudflare WARP.');
 return found[0];
}
function parseWarpSettings(data){
 const known=[...trafficModes,'doh','dot','proxy','warpproxy'];
 const modes=[...new Set(fields(data,['mode','servicemode']).flatMap(value=>tokens(value)).map(normalize).filter(value=>known.includes(value)))];
 if(modes.length!==1)throw Error('Не удалось определить режим WARP. Откройте официальный клиент и проверьте его настройки.');
 const mode=modes[0];
 const organizations=fields(data,['organization','organizationname','teamsorganization']).flatMap(value=>tokens(value)).filter(value=>value.trim()&&!['none','null'].includes(normalize(value)));
 return {mode,traffic:trafficModes.has(mode),managed:organizations.length>0};
}
function parseWarpRegistration(data){
 const organizations=fields(data,['organization','organizationname','teamsorganization']).flatMap(value=>tokens(value)).filter(value=>value&&!['none','null'].includes(normalize(value)));
 const types=fields(data,['accounttype','registrationtype']).flatMap(value=>tokens(value)).map(normalize);
 const managed=organizations.length>0||types.some(value=>['team','teams','enterprise','zerotrust','organization'].includes(value));
 const consumer=types.some(value=>['free','unlimited','limited','consumer','personal','warp+','warpplus'].includes(value));
 if(!managed&&!consumer)throw Error('Не удалось подтвердить личную регистрацию WARP. Завершите настройку в официальном клиенте.');
 return {managed};
}
function requestTrace({signal}={}){
 return new Promise((resolve,reject)=>{
  const request=https.get('https://www.cloudflare.com/cdn-cgi/trace',{timeout:10000,signal,agent:false,family:4,headers:{'User-Agent':'GTM-PC-network-test'}},response=>{
   if(response.statusCode!==200){response.resume();reject(Error('Не удалось подтвердить прохождение трафика через WARP.'));return}
   let body='';response.setEncoding('utf8');response.on('data',chunk=>{body+=chunk;if(body.length>16384)request.destroy(Error('Некорректный ответ проверки маршрута.'))});
   response.on('error',reject);response.on('end',()=>{const warp=/^warp=(on|plus|off)$/m.exec(body)?.[1];resolve({active:warp==='on'||warp==='plus',confirmed:!!warp})});
  });request.on('timeout',()=>request.destroy(Error('Проверка маршрута не ответила вовремя.')));request.on('error',reject);
 });
}
function createWarpClient({launch=execFile,platform=process.platform,trace=requestTrace}={}){
 let binary=null,discovery=null;
 function execute(file,args,options={}){
  return new Promise((resolve,reject)=>launch(file,args,{windowsHide:true,timeout:15000,maxBuffer:256*1024,encoding:'utf8',...options},(error,out)=>error?reject(Error('Cloudflare WARP не выполнил запрос. Проверьте первоначальную настройку в официальном клиенте.')):resolve(String(out).trim())));
 }
 async function discover(force=false){
  if(platform!=='win32')return {installed:false,verified:false,serviceRunning:false};
  if(!force&&binary&&Date.now()-binary.checkedAt<(binary.installed?30000:2000))return binary;
  if(discovery)return discovery;
  const script=`$ErrorActionPreference='Stop';[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$path=Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'Cloudflare\\Cloudflare WARP\\warp-cli.exe';if(-not(Test-Path -LiteralPath $path -PathType Leaf)){@{installed=$false;verified=$false;serviceRunning=$false}|ConvertTo-Json -Compress;exit};$signature=Get-AuthenticodeSignature -LiteralPath $path;$publisher=$(if($signature.SignerCertificate){$signature.SignerCertificate.GetNameInfo([Security.Cryptography.X509Certificates.X509NameType]::SimpleName,$false)}else{''});$verified=$signature.Status -eq 'Valid' -and ($publisher -replace ',','').TrimEnd('.') -eq 'Cloudflare Inc';$service=Get-Service -Name CloudflareWARP -ErrorAction SilentlyContinue;@{installed=$true;verified=[bool]$verified;version=$(if($verified){[Diagnostics.FileVersionInfo]::GetVersionInfo($path).ProductVersion}else{''});serviceRunning=($null -ne $service -and $service.Status -eq 'Running');path=$(if($verified){$path}else{''})}|ConvertTo-Json -Compress`;
  discovery=execute(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:windowsPowerShellEnvironment()}).then(out=>{const info=JSON.parse(out);binary={...info,checkedAt:Date.now()};return binary}).finally(()=>{discovery=null});return discovery;
 }
 async function cli(args,consent=false){
  const info=await discover();if(!info.installed||!info.verified||!info.serviceRunning)throw Error('Установите и подготовьте официальный Cloudflare WARP. Подпись компонента и служба должны быть исправны.');
  return execute(info.path,[...(consent?['--accept-tos']:[]),'--json',...args]);
 }
 return {
  async prepare(consent,{signal}={}){
   if(consent!==true)throw Error('Примите условия Cloudflare перед подготовкой.');
   if(platform!=='win32')throw Error('Подготовка доступна только в Windows.');
   const check=()=>{if(signal?.aborted)throw Error('Подготовка отменена.');};check();
   let info=await discover(true);
   if(info.installed&&!info.verified)throw Error('Подпись установленного WARP не подтверждена. Подготовка остановлена.');
   if(!info.installed||!info.serviceRunning){
    const script=require('./warp-setup.cjs').setupCommand(!info.installed);
    await execute(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{env:windowsPowerShellEnvironment(),timeout:600000});
    info=await discover(true);
    if(!info.installed||!info.verified||!info.serviceRunning)throw Error('Служба WARP не готова. Возможно, Windows требуется перезагрузка.');
   }
   check();
   const status=parseWarpStatus(JSON.parse(await cli(['status'],true)));
   if(status==='registrationmissing'){
    await cli(['registration','new'],true);check();
   }
   const registration=parseWarpRegistration(JSON.parse(await cli(['registration','show'],true)));
   if(registration.managed)throw Error('Подключение управляется организацией.');
   const settings=parseWarpSettings(JSON.parse(await cli(['settings','list'],true)));
   if(settings.managed)throw Error('Подключение управляется организацией.');
   if(!['disconnected','registrationmissing'].includes(status))throw Error('Сначала отключите существующее подключение WARP.');
   if(!settings.traffic)await cli(['mode','warp+doh'],true);
   check();const ready=await this.inspect(true);if(!ready.ready)throw Error(ready.error||'Компонент не готов.');return ready;
  },
  async inspect(consent=false){
   const base={id:'cloudflare-warp',installed:false,ready:false,connected:false,managed:false,stateKnown:false,consumerVerified:false,connectionStatus:'unknown'};
   try{
    const info=await discover();base.installed=!!info.installed;if(typeof info.version==='string'&&/^[a-z0-9 .+_-]{1,60}$/i.test(info.version))base.version=info.version;
    if(!info.installed)return base;
    if(!info.verified)return {...base,error:'Подпись Cloudflare WARP не прошла проверку. Переустановите компонент с официального сайта.'};
    if(!info.serviceRunning)return {...base,error:'Откройте официальный Cloudflare WARP и завершите первоначальную настройку.'};
    const status=parseWarpStatus(JSON.parse(await cli(['status'],consent)));
    base.connected=status==='connected';base.stateKnown=true;base.connectionStatus=status;
    if(status==='registrationmissing')return {...base,error:'Завершите первоначальную настройку в официальном Cloudflare WARP.'};
    const settings=parseWarpSettings(JSON.parse(await cli(['settings','list'],consent)));
    const registration=parseWarpRegistration(JSON.parse(await cli(['registration','show'],consent)));
    const managed=settings.managed||registration.managed;
    if(managed)return {...base,mode:settings.mode,managed:true,error:'WARP управляется организацией. GTM PC не изменяет это подключение.'};
    if(!settings.traffic)return {...base,mode:settings.mode,error:'Выбран режим только DNS или локального прокси. В официальном клиенте выберите режим WARP с туннелем.'};
    return {...base,mode:settings.mode,consumerVerified:true,ready:['connected','disconnected'].includes(status),error:['connecting','disconnecting'].includes(status)?'Дождитесь завершения переключения WARP.':undefined};
   }catch(error){return {...base,error:error.message}}
  },
  async connect(consent,onIssued=async()=>{}){if(consent!==true)throw Error('Разрешите переключение всего трафика через Cloudflare WARP.');await discover(true);const state=await this.inspect(true);if(!state.ready||state.managed||state.connected)throw Error(state.error||'Сначала отключите ранее включённый WARP в официальном клиенте.');await onIssued();await cli(['connect'],true)},
  async disconnect(){const state=await this.inspect(true);if(state.managed)throw Error('Подключение управляется организацией.');if(!state.consumerVerified)throw Error(state.error||'Компонент WARP недоступен.');await cli(['disconnect'],true)},
  async wait(connected,{signal}={}){for(let i=0;i<20;i++){if(signal?.aborted)throw Object.assign(Error('Проверка отменена.'),{code:'ABORT_ERR'});const state=await this.inspect(true);if(state.connectionStatus===(connected?'connected':'disconnected')&&(!connected||state.ready))return state;if(!state.stateKnown||state.managed)throw Error(state.error||'Не удалось прочитать состояние WARP.');await new Promise(resolve=>setTimeout(resolve,750))}throw Error(connected?'Не удалось подтвердить подключение WARP.':'Не удалось подтвердить отключение WARP.')},
  async watchdogInfo(){const info=await discover(true);if(!info.verified)throw Error('Не удалось подтвердить подпись WARP.');return {cli:info.path}},
  async verify({signal}={}){const proof=await trace({signal});if(!proof.confirmed||!proof.active)throw Error('Трафик не проходит через туннель WARP. Изменение DNS не считается маршрутизацией.');return true},
 };
}
module.exports={createWarpClient,parseWarpStatus,parseWarpSettings,parseWarpRegistration};
