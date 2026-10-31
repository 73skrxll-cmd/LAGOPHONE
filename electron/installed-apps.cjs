const {execFile}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');
const {windowsPowerShellEnvironment,windowsPowerShellExecutable}=require('./windows-powershell.cjs');
const patterns={discord:/^discord(?:\s|$)/i,steam:/^steam$/i,nanazip:/nanazip/i,qbittorrent:/^qbittorrent/i,memreduct:/^mem\s*reduct/i,vscode:/^microsoft visual studio code(?:\s|$)/i,firefox:/^mozilla firefox/i,vlc:/^vlc media player/i,'nvidia-app':/^nvidia app(?:\s|$)/i,'intel-dsa':/^intel.*driver.*support assistant/i,'amd-software':/^amd software/i,'samsung-magician':/^samsung magician/i,'vcredist-x64':/^microsoft visual c\+\+ 2015.*(?:2022|2026|redistributable).*\(x64\)/i,'vcredist-x86':/^microsoft visual c\+\+ 2015.*(?:2022|2026|redistributable).*\(x86\)/i,'dotnet-desktop':/^microsoft windows desktop runtime/i};
function matchInstalled(records){const found={};for(const [id,pattern] of Object.entries(patterns)){const items=records.filter(row=>row&&typeof row.name==='string'&&pattern.test(row.name));if(items.length)found[id]={name:items[0].name,version:items.map(row=>row.version).filter(Boolean).join(', '),source:'registry'}}return found}
const query=`$ErrorActionPreference='Stop';[Console]::OutputEncoding=[Text.Encoding]::UTF8;
$roots=@('HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*','HKCU:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*');
$rows=@(foreach($root in $roots){Get-ItemProperty -Path $root -ErrorAction SilentlyContinue | Where-Object {$_.DisplayName} | ForEach-Object {@{name=[string]$_.DisplayName;version=[string]$_.DisplayVersion}}});
try{$rows+=@(Get-AppxPackage -Name '*NanaZip*' -ErrorAction Stop | ForEach-Object {@{name='NanaZip';version=[string]$_.Version}})}catch{}
ConvertTo-Json -InputObject $rows -Compress -Depth 3`;
let cached=null,pending=null;
async function inspectInstalled(){
 if(process.platform!=='win32')return {ok:false,apps:{},error:'Проверка доступна в Windows.'};
 if(cached&&Date.now()-cached.at<15000)return cached.value;
 if(pending)return pending;
 pending=(async()=>{
  const raw=await new Promise((resolve,reject)=>execFile(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(query,'utf16le').toString('base64')],{env:windowsPowerShellEnvironment(),windowsHide:true,timeout:20000,maxBuffer:4*1024*1024},(error,out)=>error?reject(Error('Не удалось проверить установленные программы.')):resolve(out)));
  const rows=JSON.parse(raw);const apps=matchInstalled(Array.isArray(rows)?rows:[]);
  const roots={local:process.env.LOCALAPPDATA,program:process.env.ProgramFiles,x86:process.env['ProgramFiles(x86)']};
  const files={steam:[['x86','Steam','steam.exe'],['program','Steam','steam.exe']],vscode:[['local','Programs','Microsoft VS Code','Code.exe'],['program','Microsoft VS Code','Code.exe']],firefox:[['program','Mozilla Firefox','firefox.exe'],['x86','Mozilla Firefox','firefox.exe']],vlc:[['program','VideoLAN','VLC','vlc.exe']],qbittorrent:[['program','qBittorrent','qbittorrent.exe']],memreduct:[['program','Mem Reduct','memreduct.exe']],'nvidia-app':[['program','NVIDIA Corporation','NVIDIA App','CEF','NVIDIA App.exe']],'intel-dsa':[['x86','Intel','Driver and Support Assistant','DSATray.exe']]};
  for(const [id,locations] of Object.entries(files)){if(apps[id])continue;for(const [root,...parts] of locations){if(!roots[root])continue;try{if((await fs.stat(path.join(roots[root],...parts))).isFile()){apps[id]={name:id,version:'',source:'file'};break}}catch{}}}
  if(!apps.discord&&roots.local){try{const base=path.join(roots.local,'Discord');for(const item of (await fs.readdir(base,{withFileTypes:true})).filter(item=>item.isDirectory()&&/^app-[0-9.]+$/.test(item.name)).slice(0,20)){try{if((await fs.stat(path.join(base,item.name,'Discord.exe'))).isFile()){apps.discord={name:'Discord',version:item.name.slice(4),source:'file'};break}}catch{}}}catch{}}
  const value={ok:true,apps};cached={at:Date.now(),value};return value;
 })().catch(error=>({ok:false,apps:{},error:error.message})).finally(()=>{pending=null});return pending;
}
module.exports={matchInstalled,inspectInstalled,query};
