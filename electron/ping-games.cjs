const fs=require('node:fs/promises'),path=require('node:path');
const GAMES=Object.freeze([
 {id:'pubg',name:'PUBG',process:'TslGame.exe',relative:'TslGame/Binaries/Win64/TslGame.exe',uri:'steam://rungameid/578080'},
 {id:'fortnite',name:'Fortnite',process:'FortniteClient-Win64-Shipping.exe',relative:'FortniteGame/Binaries/Win64/FortniteClient-Win64-Shipping.exe',uri:'com.epicgames.launcher://apps/Fortnite?action=launch&silent=true'},
 {id:'tarkov',name:'Escape from Tarkov',process:'EscapeFromTarkov.exe'},
]);
function gameSpec(id){const game=GAMES.find(g=>g.id===id);if(!game)throw Error('Неизвестная игра.');return game}
function validExecutable(file){return typeof file==='string'&&/^[a-z]:\\/i.test(file)&&!/[\x00-\x1f]/.test(file)&&file.length<260&&path.win32.extname(file).toLowerCase()==='.exe'}
function acceptsManual(id,file){const g=gameSpec(id);return validExecutable(file)&&[g.process,...(id==='tarkov'?['BsgLauncher.exe']:[])].some(n=>path.win32.basename(file).toLowerCase()===n.toLowerCase())}
function steamLibraries(text){return [...text.matchAll(/"path"\s*"((?:\\.|[^"\\])*)"/g)].map(m=>m[1].replace(/\\\\/g,'\\'))}
async function discoverGames(roots,saved={},io=fs){
 const exists=async file=>{try{return validExecutable(file)&&(await io.stat(file)).isFile()}catch{return false}};
 const result=GAMES.map(g=>({...g,installed:false,path:null,launcher:null,source:null}));
 const libraries=new Set(roots.steam||[]);
 for(const base of [...libraries]){try{for(const root of steamLibraries(await io.readFile(path.win32.join(base,'steamapps','libraryfolders.vdf'),'utf8')))libraries.add(root)}catch{}}
 for(const base of libraries){
  try{const manifest=await io.readFile(path.win32.join(base,'steamapps','appmanifest_578080.acf'),'utf8');const dir=/"installdir"\s*"([^"\\/:]+)"/.exec(manifest)?.[1];if(dir){const file=path.win32.join(base,'steamapps','common',dir,GAMES[0].relative);if(await exists(file))Object.assign(result[0],{installed:true,path:file,source:'Steam'})}}catch{}
 }
 for(const dir of roots.epic||[]){
  try{for(const item of (await io.readdir(dir)).filter(n=>n.endsWith('.item')).slice(0,150)){
   try{const manifest=JSON.parse(await io.readFile(path.win32.join(dir,item),'utf8'));if(manifest.AppName!=='Fortnite'&&manifest.DisplayName!=='Fortnite')continue;const file=path.win32.join(manifest.InstallLocation,GAMES[1].relative);if(await exists(file))Object.assign(result[1],{installed:true,path:file,source:'Epic Games'})}catch{}
  }}catch{}
 }
 for(const base of roots.tarkov||[]){
  const file=path.win32.join(base,'EscapeFromTarkov.exe');if(await exists(file))Object.assign(result[2],{installed:true,path:file,source:'Battlestate Games'});
  const launcher=path.win32.join(base,'BsgLauncher.exe');if(await exists(launcher))result[2].launcher=launcher;
 }
 for(const game of result){const file=saved[game.id];if(acceptsManual(game.id,file)&&await exists(file)){game.installed=true;game.source='Указано вручную';if(game.id==='tarkov'&&path.win32.basename(file).toLowerCase()==='bsglauncher.exe')game.launcher=file;else game.path=file}}
 result[2].installed=!!(result[2].path||result[2].launcher);return result;
}
module.exports={GAMES,gameSpec,validExecutable,acceptsManual,steamLibraries,discoverGames};
