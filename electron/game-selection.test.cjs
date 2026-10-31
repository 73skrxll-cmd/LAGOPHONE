const {test}=require('node:test'),assert=require('node:assert/strict');
const {acceptsGame,customGame,isCustomGame}=require('./game-selection.cjs');
const {matchInstalled}=require('./installed-apps.cjs');
test('manual games accept only absolute EXE selections and keep independent identities',()=>{
 const first=customGame('D:\\Games\\My Game\\MyGame.exe'),second=customGame('D:\\Games\\Another\\Other.exe');
 assert.ok(isCustomGame(first.id));assert.notEqual(first.id,second.id);assert.equal(first.name,'MyGame');
 assert.ok(acceptsGame(first.id,first.gamePath));assert.ok(acceptsGame('cs2','C:\\Games\\CS2.EXE'));
 assert.equal(acceptsGame('cs2','C:\\Games\\unknown.exe'),false);
 for(const invalid of ['game.exe','C:\\Games\\game.dll','C:\\Games\\bad?.exe'])assert.throws(()=>customGame(invalid));
 assert.equal(acceptsGame('custom-fake','C:\\Games\\test.exe'),false);
});
test('installed program matching distinguishes vendor apps, drivers and runtime architectures',()=>{
 const found=matchInstalled([{name:'Discord',version:'1.0'},{name:'NVIDIA Graphics Driver 580.0',version:'580.0'},{name:'NVIDIA App 11.0',version:'11.0'},{name:'Microsoft Visual C++ 2015-2022 Redistributable (x64) - 14.44',version:'14.44'},{name:'NanaZip',version:'5.0'},{name:'Mozilla Firefox (x64 en-US)',version:'144.0'}]);
 assert.equal(found.discord.version,'1.0');assert.equal(found['nvidia-app'].version,'11.0');assert.ok(found['vcredist-x64']);assert.equal(found['vcredist-x86'],undefined);assert.ok(found.nanazip);assert.ok(found.firefox);
 assert.equal(matchInstalled([{name:'NVIDIA Graphics Driver 580.0'}])['nvidia-app'],undefined);
 assert.deepEqual(matchInstalled([{name:'Unrelated application',version:'1.0'}]),{});
});
