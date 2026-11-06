const {execFile}=require('node:child_process');
const path=require('node:path');
const {windowsPowerShellEnvironment,windowsPowerShellExecutable}=require('./windows-powershell.cjs');
const bool=value=>typeof value==='boolean'?value:null;
function normalizeSecurity(raw){
 const secure=raw?.secureBoot||{},tpm=raw?.tpm||{};
 const firmware=['uefi','legacy'].includes(raw?.firmware)?raw.firmware:'unknown';
 const secureSource=firmware!=='legacy'&&['firmware','windows-boot'].includes(secure.source)?secure.source:'none';
 return {firmware,secureBoot:{enabled:secureSource==='none'?null:bool(secure.enabled),source:secureSource,issue:firmware==='legacy'?'legacy':secure.issue==='access'?'access':null},tpm:{present:bool(tpm.present),version:['1.2','2.0'].includes(tpm.version)?tpm.version:null,enabled:bool(tpm.enabled),ready:bool(tpm.ready),lockedOut:bool(tpm.lockedOut),source:['tbs','cim','get-tpm'].includes(tpm.source)?tpm.source:'none'}};
}
function createSecurityService({app,shell,platform=process.platform,execute=execFile}){
 let pending=null;
 function inspect(){
  if(platform!=='win32')return Promise.resolve({...normalizeSecurity(null),supported:false,checkedAt:null});
  if(pending)return pending;
  const script=app.isPackaged?path.join(process.resourcesPath,'app.asar.unpacked','electron','security.ps1'):path.join(__dirname,'security.ps1');
  pending=new Promise((resolve,reject)=>execute(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{env:windowsPowerShellEnvironment(),windowsHide:true,timeout:30000,maxBuffer:1024*1024,encoding:'utf8'},(error,output)=>{
   if(error){reject(Error('Не удалось проверить Secure Boot и TPM. Повторите проверку.'));return}
   try{resolve({...normalizeSecurity(JSON.parse(output.replace(/^\uFEFF/,''))),supported:true,checkedAt:new Date().toISOString()})}catch{reject(Error('Windows вернула неполные данные проверки. Повторите проверку.'))}
  })).finally(()=>{pending=null});
  return pending;
 }
 function openRecovery(){if(platform!=='win32')throw Error('Параметры восстановления доступны в Windows.');return shell.openExternal('ms-settings:recovery')}
 return {inspect,openRecovery};
}
module.exports={createSecurityService,normalizeSecurity};
