const fs=require('node:fs/promises');
const path=require('node:path');
const {spawn}=require('node:child_process');
function runCli(executable,args,onProgress=()=>{}){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{windowsHide:true,shell:false,stdio:['pipe','pipe','pipe'],timeout:60*60*1000});
  let output='',error='',line='';
  child.stdin.end();
  child.stdout.on('data',chunk=>{
   const text=chunk.toString('utf8');output=(output+text).slice(-131072);line+=text;
   const parts=line.split(/\r?\n/);line=parts.pop();for(const part of parts)if(part.trim()){const message=progressText(part);if(message)onProgress(message)};
  });
  child.stderr.on('data',chunk=>{error=(error+chunk.toString('utf8')).slice(-8192)});
  child.on('error',reject);
  child.on('close',code=>{if(code===0&&(output.trim()||!error.trim()))return resolve(output);const reason=error.trim()||output.trim()||'операция не завершена';reject(new Error(/an update is being installed/i.test(reason)?'SCSKiller обновляется. Дождитесь завершения обновления и повторите подготовку.':('SCSKiller: '+reason).slice(-700))) });
 });
}
const stages={Indexing:'Чтение шейдеров игры',Planning:'Подбор совместимых графических конвейеров',Materializing:'Подготовка данных для компиляции',Warming:'Компиляция в кеш драйвера',Merging:'Объединение данных шейдеров',Saving:'Сохранение кеша',Finishing:'Завершение компиляции',Done:'Проверка готовности кеша',Paused:'Компиляция приостановлена движком'};
function progressText(line){const stage=Object.keys(stages).find(key=>new RegExp('\\b'+key+'\\b').test(line));return stage?stages[stage]:line.startsWith('SCSKiller:')?line:null}
function gameId(output){
 const match=output.match(/^\s*(?:added|already listed):\s+([a-z][a-z0-9_-]*:[a-z0-9._-]+)/im);
 if(!match)throw Error('SCSKiller не подтвердил добавление выбранного EXE.');
 return match[1];
}
function stateOf(output,id){
 const escaped=id.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const lines=output.replace(/\x1b\[[0-9;]*m/g,'').split(/\r?\n/);
 // `status <id>` prints a detail block, not the tabular `status` listing.
 // The first line contains the game's NAME; the actual state is on `status ...:`.
 const header=lines.some(line=>new RegExp('\\('+escaped+'\\s*,').test(line));
 const detailed=lines.map(line=>line.match(/^\s*status\s+([A-Za-z][A-Za-z0-9]*)\s*:/)).filter(Boolean);
 if(header&&detailed.length===1)return detailed[0][1];
 const rows=lines.map(line=>line.match(new RegExp('^\\s*([A-Za-z][A-Za-z0-9]*)\\s+'+escaped+'(?:\\s|$)'))).filter(Boolean);
 return rows.length===1?rows[0][1]:'Unknown';
}

function createShaderPreparation({file,run=runCli,isFile=async executable=>(await fs.stat(executable)).isFile()}){
 const location=()=>typeof file==='function'?file():file;
 async function status(){try{const saved=JSON.parse(await fs.readFile(location(),'utf8'));return {...saved,available:await isFile(saved.executable)}}catch{return {available:false,version:''}}}
 return {
  status,
  async connect(executable){
   if(!path.win32.isAbsolute(executable)||path.win32.basename(executable).toLowerCase()!=='scskiller.exe')throw Error('Нужен scskiller.exe из папки cli официального SCSKiller.');
   const version=(await run(executable,['--version'])).trim();
   const help=await run(executable,['--help']);
   if(!version||!help.includes('compile <game')||!help.includes('add <exe>')||!help.includes('--idle'))throw Error('Эта версия SCSKiller CLI не поддерживает подготовку из GTM PC.');
   const saved={executable,version:version.slice(0,100)};
   await fs.mkdir(path.dirname(location()),{recursive:true});await fs.writeFile(location(),JSON.stringify(saved),'utf8');
   return {available:true,version:saved.version};
  },
  async prepare(executable,onProgress=()=>{}){
   const tool=await status();if(!tool.available)throw Error('Сначала подключите официальный SCSKiller.');
   if(!path.win32.isAbsolute(executable)||path.win32.extname(executable).toLowerCase()!=='.exe')throw Error('Нужен абсолютный путь к EXE игры.');
   onProgress('SCSKiller: чтение файлов выбранной игры');
   const added=await run(tool.executable,['add',executable],onProgress),id=gameId(added);
   const row=added.split(/\r?\n/).find(line=>/^(added|already listed):/i.test(line.trim()));
   const normalized=text=>text.replace(/\\/g,'/').replace(/\/+/g,'/').toLowerCase().trim();
   if(!row||!normalized(row).endsWith(normalized(executable)))throw Error('SCSKiller выбрал другой EXE. Уточните путь игры в SCSKiller перед подготовкой.');
   const state=stateOf(await run(tool.executable,['status',id]),id);
   if(state==='Warmed')return {ok:true,alreadyPrepared:true,message:'SCSKiller подтверждает, что кеш выбранной игры уже подготовлен.'};
   if(!['Ready','Stale'].includes(state)){const reasons={NeedsRecording:'Для этой игры нужны данные шейдеров. Подготовьте их в SCSKiller и повторите прогрев.',NeedsOfflineSession:'Прогрев этой игры доступен только для поддерживаемого офлайн-сеанса.',NeedsSteamStart:'Сначала запустите игру через Steam, затем закройте её и повторите подготовку.',Unsupported:'Эта игра, графический API или видеокарта не поддерживает автоматический прогрев.',Unknown:'Движок вернул неизвестный формат состояния; готовность кеша не подтверждена.'};throw Error('SCSKiller: '+(reasons[state]||state+'. Автоматический прогрев пока недоступен.'))}
   onProgress('SCSKiller: подготовка шейдеров в кеше драйвера');
   const output=await run(tool.executable,['compile',id,'--threads','2','--idle'],onProgress);
   const final=stateOf(await run(tool.executable,['status',id]),id);
   if(final!=='Warmed'||!output.match(/\bDone\b/))throw Error('SCSKiller не подтвердил завершённый прогрев. Кеш не отмечен как готовый.');
   return {ok:true,alreadyPrepared:false,message:'SCSKiller подтвердил завершение подготовки шейдеров. Эффект на фризы проверяется в игре.'};
  },
 };
}
module.exports={createShaderPreparation,gameId,stateOf,runCli};
