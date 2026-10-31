const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {games}=require('../shared/optimization.json');
const isCustomGame=id=>typeof id==='string'&&/^custom-[a-f0-9]{32}$/.test(id);
const executable=location=>typeof location==='string'&&path.win32.isAbsolute(location)&&path.win32.extname(location).toLowerCase()==='.exe'&&!/[<>:"|?*\x00-\x1f]/.test(path.win32.basename(location));
function acceptsGame(id,location){return executable(location)&&(isCustomGame(id)||!!games.find(game=>game.id===id&&game.executables.includes(path.win32.basename(location).toLowerCase())))}
function customGame(location,id='custom-'+randomUUID().replaceAll('-','')){if(!isCustomGame(id)||!executable(location))throw Error('Выберите EXE игры.');return {id,name:path.win32.basename(location).replace(/\.exe$/i,''),gamePath:location}}
module.exports={isCustomGame,acceptsGame,customGame};
