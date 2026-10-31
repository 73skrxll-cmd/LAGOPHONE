const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createShaderPreparation,gameId,stateOf}=require('./shader-preparation.cjs');
async function fixture(t,{state='Ready',final='Warmed',done=true}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'lagophone-shader-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const calls=[];let statusReads=0;
 const run=async(exe,args)=>{calls.push(args);if(args[0]==='--version')return '1.0.0';if(args[0]==='--help')return 'add <exe> compile <game|--all-ready> --idle';if(args[0]==='add')return 'added: manual:123456abcdef  Game  C:\\Games\\cs2.exe';if(args[0]==='status')return `Game (manual:123456abcdef, Manual)\n  install    C:\\Games\n  exe        C:\\Games\\cs2.exe\n  status     ${statusReads++?final:state}: engine description\n  shaders    12345`;if(args[0]==='compile')return done?'manual:123456abcdef Done':'nothing to compile';throw Error('Unexpected command')};
 const tool=createShaderPreparation({file:path.join(directory,'tool.json'),run,isFile:async()=>true});await tool.connect('C:\\SCSKiller\\cli\\scskiller.exe');return {tool,calls};
}
test('shader preparation uses a selected game and only add/status/compile with background priority',async t=>{const f=await fixture(t);const result=await f.tool.prepare('C:\\Games\\cs2.exe');assert.equal(result.ok,true);assert.equal(result.alreadyPrepared,false);assert.deepEqual(f.calls.slice(2),[['add','C:\\Games\\cs2.exe'],['status','manual:123456abcdef'],['compile','manual:123456abcdef','--threads','2','--idle'],['status','manual:123456abcdef']]);assert.ok(!f.calls.flat().some(a=>['record','cache','before-after','--all-ready'].includes(a)))});
test('unsupported or recording-dependent games are never compiled or marked ready',async t=>{for(const state of ['Unsupported','NeedsRecording','NeedsOfflineSession']){const f=await fixture(t,{state});await assert.rejects(f.tool.prepare('C:\\Games\\cs2.exe'),/SCSKiller:/);assert.ok(!f.calls.some(a=>a[0]==='compile'))}});
test('zero exit alone cannot claim shader success; verified warmed cache is reused',async t=>{for(const options of [{final:'Ready'},{done:false}]){const f=await fixture(t,options);await assert.rejects(f.tool.prepare('C:\\Games\\cs2.exe'),/не подтвердил/)}const f=await fixture(t,{state:'Warmed'});assert.equal((await f.tool.prepare('C:\\Games\\cs2.exe')).alreadyPrepared,true);assert.ok(!f.calls.some(a=>a[0]==='compile'))});
test('CLI result parsing rejects ambiguous output and non-EXE paths',async t=>{assert.equal(gameId('already listed: steam:570 Dota 2'),'steam:570');assert.throws(()=>gameId('nothing to compile'));assert.equal(stateOf('Ready steam:570 Dota 2','steam:570'),'Ready');const f=await fixture(t);await assert.rejects(f.tool.prepare('--all-ready'),/абсолютный/)});

test('SCSKiller detailed status is parsed from the status field, never the game title',()=>{
 assert.equal(stateOf('PUBG: BATTLEGROUNDS (steam:578080, Steam)\n  exe D:\\Steam\\TslGame.exe\n  status Ready: 120 pipelines','steam:578080'),'Ready');
 assert.equal(stateOf('PUBG: BATTLEGROUNDS (steam:578080, Steam)\n  status Warmed: current driver','steam:578080'),'Warmed');
 assert.equal(stateOf('Ready steam:5780800 Wrong Game','steam:578080'),'Unknown');
 assert.equal(stateOf('Other (steam:570, Steam)\n  status Warmed: ready','steam:578080'),'Unknown');
});

test('CLI refusal on stderr is not lost when SCSKiller returns exit code zero',async()=>{
 const {runCli}=require('./shader-preparation.cjs');
 await assert.rejects(runCli(process.execPath,['-e',"process.stderr.write('an update is being installed, try again in a minute')"]),/обновляется/);
 assert.equal(await runCli(process.execPath,['-e',"process.stderr.write('diagnostic');process.stdout.write('Ready steam:570 Dota 2')"]),'Ready steam:570 Dota 2');
});
