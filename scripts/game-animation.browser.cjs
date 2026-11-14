// Real Chromium checks with a controlled native bridge. Native Windows application
// and rollback tests run separately in electron/optimization.windows.test.cjs.
const {spawn}=require('node:child_process');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os'),path=require('node:path'),{pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
const output=process.env.GTM_TEST_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'gtm-animation-'));
fs.mkdirSync(output,{recursive:true});
const port=Number(process.env.GTM_TEST_PORT||5179),debugPort=9300+Math.floor(Math.random()*300);
const origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,[path.join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:root,stdio:['ignore',fs.openSync(path.join(output,'vite.log'),'w'),'inherit']});
const browser=spawn(process.env.CHROMIUM_BIN||'chromium',['--headless','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-first-run','--disable-background-networking','--remote-debugging-port='+debugPort,'--user-data-dir='+path.join(output,'profile'),'about:blank'],{stdio:['ignore','ignore',fs.openSync(path.join(output,'chromium.log'),'w')]});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
let ws,launchError;browser.on('error',error=>{launchError=error});
const deadline=setTimeout(()=>{console.error('UI validation timed out; output: '+output);browser.kill('SIGKILL');server.kill();process.exit(1)},300000);
(async()=>{
 for(let i=0;i<100;i++){if(launchError)throw launchError;try{if((await fetch(origin)).ok)break}catch{}await delay(100)}
 let pages;
 for(let i=0;i<75;i++){
  if(launchError)throw launchError;
  if(browser.exitCode!==null)break;
  try{pages=await (await fetch('http://127.0.0.1:'+debugPort+'/json')).json();if(pages.some(page=>page.type==='page'))break}catch{}
  await delay(200);
 }
 assert.ok(pages?.some(page=>page.type==='page'),'Chromium debugging page; exit='+browser.exitCode+'; '+fs.readFileSync(path.join(output,'chromium.log'),'utf8').slice(-6000));
 ws=new WebSocket(pages.find(p=>p.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});
 let seq=0;const pending=new Map();
 ws.onmessage=e=>{const msg=JSON.parse(e.data);if(msg.method==='Runtime.exceptionThrown')console.error('Browser exception:',JSON.stringify(msg.params.exceptionDetails));if(msg.id){const [resolve,reject]=pending.get(msg.id);pending.delete(msg.id);msg.error?reject(new Error(JSON.stringify(msg.error))):resolve(msg.result)}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,[resolve,reject]);ws.send(JSON.stringify({id,method,params}))});
 const evaluate=async expression=>{const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value};
 const waitFor=async(expression,label,attempts=100)=>{
  for(let i=0;i<attempts;i++){
   try{if(await evaluate(expression))return}catch(error){if(!/context|navigat/i.test(String(error)))throw error}
   await delay(100);
  }
  throw Error(label+' did not become ready: '+await evaluate(`document.body.innerText.slice(0,2500)`));
 };
 const click=async text=>{
  const operation=`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)return false;b.click();return true})()`;
  await waitFor(operation,'Button '+text);await delay(400);
 };
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setFocusEmulationEnabled',{enabled:true});
 const hardware={demo:false,version:'11',build:'26100',cpu:'AMD Ryzen 5 5600X',gpu:['NVIDIA GeForce RTX 3060'],gpuDrivers:[{name:'NVIDIA GeForce RTX 3060',version:'580.0'}],board:'B550',vendor:'ASRock',network:[{name:'Realtek PCIe GbE'}],audio:[{name:'Realtek Audio'}],ram:32,disks:[]};
 const {buildDriverCatalog}=await import(pathToFileURL(path.join(root,'shared/drivers.mjs')).href);
 const categories=buildDriverCatalog(hardware,'11');
 const securityFixture={supported:true,checkedAt:'2026-11-06T10:30:00Z',firmware:'uefi',secureBoot:{enabled:true,source:'firmware',issue:null},tpm:{present:true,version:'2.0',enabled:true,ready:true,lockedOut:false,source:'tbs'}};
 const empty={ok:true,active:false,remaining:0,checks:[],savedGames:[],appliedTargets:[],windows:{version:'11',build:26100}};
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.__blocking={supported:true,phase:'idle',message:'',settings:{profile:'general',gameFilter:'off',ipset:false,fake:'quic_initial_vk_com.bin',ttl:5},profiles:[{id:'general',name:'Основная'},{id:'general-alt',name:'ALT'}],versions:{zapret:'1.10.4',fnport:'0.6.3'},zapret:{running:false},fnport:{phase:'idle'},operation:null,lastReport:null,lastFnResult:null};window.__blockingActions=[];window.__fps={enabled:true,supported:true,phase:'waiting-game',message:'',version:'2.6.0',games:[],runningGames:[]};window.__fpsToggles=[];window.__game=JSON.parse(sessionStorage.getItem('game-test')||'null')||${JSON.stringify(empty)};window.__paths={cs2:'C:/Games/cs2.exe',dota2:'D:/Dota/dota2.exe',deadlock:'D:/Deadlock/DeadlockClient.exe',fortnite:'C:/Games/FortniteClient.exe'};window.__requests=[];window.__dialogReplies=[];window.__security=${JSON.stringify(securityFixture)};window.__securityCalls=0;window.__recoveryOpened=0;window.__testHardware=${JSON.stringify(hardware)};
 if(!sessionStorage.getItem('theme-migration-checked')){localStorage.setItem('lagophone-theme','purple');sessionStorage.setItem('theme-migration-checked','1')}
 window.__testSettings=async()=>{document.querySelector('[aria-label="Общие настройки"]').click();await new Promise(r=>setTimeout(r,70))};window.__testCloseSettings=async()=>{document.querySelector('[aria-label="Закрыть общие настройки"]').click();await new Promise(r=>setTimeout(r,70))};window.__testTheme=async theme=>{await window.__testSettings();const select=document.querySelector('[aria-label="Цветовая тема"]');select.value=theme;select.dispatchEvent(new Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,70));await window.__testCloseSettings()};window.__testToggleEffects=async()=>{await window.__testSettings();document.querySelector('[aria-label="Анимации приложения"]').click();await new Promise(r=>setTimeout(r,70));await window.__testCloseSettings()}
 window.lagophone={blockingStatus:async()=>JSON.parse(JSON.stringify(window.__blocking)),blockingAction:async action=>{window.__blockingActions.push(action);const clone=()=>JSON.parse(JSON.stringify(window.__blocking));
 if(action==='select'){window.__blocking.operation={kind:'selecting',index:1,total:4,label:'Основная'};window.__blocking.lastReport={at:new Date().toISOString(),phase:'running',baseline:[{ok:true},{ok:false}],results:[],selected:null,verified:false,message:'Проверяем стратегии'};return new Promise(resolve=>{window.__scanResolve=resolve;window.__scanTimer=setTimeout(()=>{window.__blocking.lastReport={at:new Date().toISOString(),phase:'completed',baseline:[{ok:true,url:'https://discord.com',name:'Discord'},{ok:false,url:'https://www.youtube.com',name:'YouTube'}],results:[{profile:'general',name:'Основная',rows:[{ok:true},{ok:false}]},{profile:'general-alt',name:'ALT',rows:[{ok:true},{ok:true}],verification:[{ok:true},{ok:true}]}],selected:'general-alt',verified:true,message:'Найден вариант с лучшей доступностью в повторных тестах.'};window.__blocking.operation=null;window.__blocking.settings.profile='general-alt';window.__scanResolve=null;resolve(clone())},2400)})}
 if(action==='cancel'){clearTimeout(window.__scanTimer);window.__blocking.operation=null;window.__blocking.lastReport.phase='cancelled';window.__blocking.lastReport.message='Поиск остановлен. Предыдущий режим восстановлен.';window.__scanResolve?.(clone());window.__scanResolve=null;return clone()}
 if(action.startsWith('activate-profile:')){const profile=action.slice('activate-profile:'.length);window.__blocking.settings.profile=profile;window.__blocking.zapret={running:true,profile}}
 if(action==='zapret-start')window.__blocking.zapret={running:true,profile:'general'};if(action==='zapret-stop')window.__blocking.zapret={running:false};if(action==='fnport-start')window.__blocking.fnport={phase:'running',adapter:'fnport-GTMPC-123',stats:{GameFlows:3,Tested:4,Good:2,Remaps:1}};if(action==='fnport-stop')window.__blocking.fnport={phase:'stopped'};if(action==='fnport-check')window.__blocking.fnport={phase:'checking',lines:['Проверка UDP маяков Epic']};return clone()},blockingSettings:async value=>{window.__blocking.settings=value;return JSON.parse(JSON.stringify(window.__blocking))},blockingReport:async()=>{window.__blockingReport=true;return true},fpsStatus:async()=>JSON.parse(JSON.stringify(window.__fps)),setFpsEnabled:async enabled=>{window.__fpsToggles.push(enabled);window.__fps.enabled=enabled;return JSON.parse(JSON.stringify(window.__fps))},addFpsGame:async()=>{window.__fpsAdded=true;return JSON.parse(JSON.stringify(window.__fps))},windowChrome:sessionStorage.getItem('test-window-chrome')==='true',setWindowTheme:async theme=>{window.__windowTheme=theme},onAppDialog:callback=>{window.__dialogListener=callback;return()=>{window.__dialogListener=null}},respondAppDialog:async(id,response)=>{if(window.__dialogReplyError){window.__dialogReplyError=false;throw Error('IPC unavailable')}window.__dialogReplies.push({id,response});window.__dialogListener({closed:id});return true},system:async()=>JSON.parse(JSON.stringify(window.__testHardware)),securityStatus:async()=>{window.__securityCalls++;if(window.__securityError)throw Error('Access denied');return JSON.parse(JSON.stringify(window.__security))},openRecoverySettings:async()=>{window.__recoveryOpened++},onProgress:()=>()=>{},activities:async()=>({items:window.__activityItems||[],warning:''}),restartStatus:async()=>({pending:false}),optimizationStatus:async()=>({ok:true,active:true,needsRecovery:true,remaining:1,checks:[],windows:{version:'11',build:26100}}),powerOptimizationStatus:async()=>({...${JSON.stringify(empty)},power:'381b4222-f694-41f0-9685-ff5bb260df2e',plans:{balanced:true,lagophone:true}}),gameOptimizationStatus:async()=>window.__game,
 chooseGame:async id=>window.__paths[id],chooseOtherGame:async()=>{const id='custom-'+(window.__game.savedGames.some(g=>g.id.startsWith('custom-'))?'b':'a').repeat(32),gamePath='E:/My Games/'+(id.includes('aaaa')?'FirstGame.exe':'SecondGame.exe');window.__paths[id]=gamePath;return{id,name:gamePath.split('/').at(-1).replace('.exe',''),gamePath}},
 optimize:async input=>{window.__requests.push(input);window.__game={...window.__game,running:true,operation:{mode:'apply',phase:'windows'}};return new Promise((resolve,reject)=>window.__finish=()=>{if(window.__outcome){window.__game={...window.__game,running:false,operation:null};if(window.__outcome==='throw'){reject(Error('native test failure'));return}resolve({ok:window.__outcome==='cancelled',cancelled:window.__outcome==='cancelled',report:[],error:window.__outcome==='error'?'Native operation failed':undefined});return}const gamePath=window.__paths[input.game];window.__game={...window.__game,active:true,running:false,operation:null,savedGames:[...window.__game.savedGames.filter(g=>g.id!==input.game),{id:input.game,gamePath}],appliedTargets:[...window.__game.appliedTargets.filter(t=>t.gamePath!==gamePath),...['game-gpu','game-priority'].map(id=>({id,gamePath,enabled:true}))]};sessionStorage.setItem('game-test',JSON.stringify(window.__game));resolve({ok:true,report:[{id:'game-priority',status:'applied',message:'High verified'}]})})},
 installedApps:async()=>({ok:true,apps:{discord:{name:'Discord',version:'1.0',source:'registry'},'nvidia-app':{name:'NVIDIA App',version:'11.0',source:'registry'}}}),driverCatalog:async()=>(${JSON.stringify(categories)}),open:async id=>{window.__opened=id},openDriver:async id=>{window.__openedDriver=id}};
 `});
 await send('Storage.clearDataForOrigin',{origin,storageTypes:'local_storage'});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/'});
 await waitFor(`!!document.querySelector('.welcome-emblem')`,'Welcome screen');
 await evaluate(`document.body.offsetHeight;document.fonts.ready.then(()=>true)`);
 assert.equal(await evaluate(`document.body.textContent.includes('PC UTILITY')`),false);
 assert.ok(await evaluate(`!!document.querySelector('.welcome-emblem')`),await evaluate(`document.body.innerText.slice(0,2500)`));
 assert.equal(await evaluate(`document.documentElement.dataset.theme`),'black','Legacy colour themes migrate to black');
 await evaluate(`document.querySelector('[aria-label="Общие настройки"]').click()`);await waitFor(`!!document.querySelector('.general-settings')`,'General settings on welcome');
 assert.deepEqual(await evaluate(`[...document.querySelector('[aria-label="Цветовая тема"]').options].map(option=>option.value)`),['black','white']);
 assert.equal(await evaluate(`document.querySelectorAll('.theme-control,.effects-toggle').length`),0,'One general settings button replaces the old icons');
 await evaluate(`document.querySelector('[aria-label="Закрыть общие настройки"]').click()`);

 assert.ok((await evaluate(`document.body.textContent`)).includes('GTM PC'));
 assert.ok((await evaluate(`document.body.textContent`)).includes('Get The Most of PC'));
 const mark=await evaluate(`(()=>{const a=document.querySelector('.welcome-emblem .brand-mark').getBoundingClientRect();return{x:a.x+a.width/2,width:a.width}})()`);
 assert.ok(mark.width>=140);assert.ok(Math.abs(mark.x-(await evaluate(`document.documentElement.clientWidth`))/2)<3,'Large emblem is centered in the content area: '+JSON.stringify(mark));
 assert.equal(await evaluate(`document.querySelector('.theme-atmosphere').dataset.weather`),'shooting-stars');
 assert.equal(await evaluate(`document.querySelectorAll('.shooting-star').length`),7);
 await send('Page.bringToFront');await send('Emulation.setFocusEmulationEnabled',{enabled:true});await evaluate(`window.dispatchEvent(new Event('focus'))`);
 await waitFor(`document.querySelector('.theme-atmosphere').dataset.motion==='true'`,'Active foreground before measuring background motion');
 await evaluate(`(async()=>{const animation=document.querySelector('.shooting-star').getAnimations()[0];await animation.ready;animation.currentTime=160;await new Promise(requestAnimationFrame)})()`);
 const meteor=await evaluate(`getComputedStyle(document.querySelector('.shooting-star')).transform`);await delay(150);
 const meteorAfter=await evaluate(`getComputedStyle(document.querySelector('.shooting-star')).transform`);if(meteorAfter===meteor)console.log('Meteor diagnostics',await evaluate(`(()=>{const element=document.querySelector('.shooting-star'),a=element.getAnimations()[0];return {style:getComputedStyle(element).animationPlayState,animation:a.playState,pending:a.pending,time:a.currentTime,start:a.startTime,motion:document.querySelector('.theme-atmosphere').dataset.motion,hidden:document.hidden,focus:document.hasFocus(),timeline:document.timeline.currentTime}})()`));
 assert.notEqual(meteorAfter,meteor,'Shooting stars travel across the background');
 assert.ok(await evaluate(`Number(getComputedStyle(document.querySelector('.shooting-star')).opacity)>0`));
 fs.writeFileSync(path.join(output,'welcome.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:960,height:680,deviceScaleFactor:1,mobile:false});
 assert.ok(await evaluate(`(()=>{const b=document.querySelectorAll('.os-card')[1].getBoundingClientRect();return b.bottom<680})()`),'OS cards remain visible in the minimum window');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 // Verify the requested order using actual positions, opacity and rendered screens.
 const choiceShot=async name=>fs.writeFileSync(path.join(output,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const key=async(name,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:name,code:name,windowsVirtualKeyCode:code,modifiers,...(name==='Enter'?{text:'\r',unmodifiedText:'\r'}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key:name,code:name,windowsVirtualKeyCode:code,modifiers})};
 const checkFpsStatistics=async prefix=>{
  await waitFor(`!!document.querySelector('.fps-statistics')`,'Real FPS statistics');
  assert.equal(await evaluate(`!!document.querySelector('[aria-label="Режим оценки FPS"]')`),false,'No calculator modes');
  for(const component of ['cpu','gpu','ram','board','storage','os']){await evaluate(`document.querySelector('[data-component="${component}"]').click()`);await waitFor(`document.activeElement.id==='hardware-details'`,'Hardware details');}
  await evaluate(`document.querySelector('.fps-statistics').scrollIntoView({block:'center'})`);await choiceShot(prefix);
  if(!await evaluate(`window.__fps.games.length`)){
   assert.ok(await evaluate(`document.querySelector('.fps-empty').textContent.includes('Пока не запущено ни одной игры')`));
   assert.equal(await evaluate(`document.querySelectorAll('.fps-session-card').length`),0,'No fabricated sessions before a game');
   await evaluate(`window.__fps.runningGames=[{id:'fortnite',name:'Fortnite',pid:123}];window.__fps.phase='watching';window.dispatchEvent(new Event('focus'))`);await waitFor(`document.querySelector('.fps-empty').textContent.includes('Игра обнаружена')`,'Recognized game waits for real frames');
   const today=new Date(),week=Array.from({length:7},(_,i)=>{const date=new Date(today);date.setDate(date.getDate()-6+i);return{date:date.toISOString().slice(0,10),average:[null,80,90,null,null,110,100][i],sessions:[0,1,1,0,0,1,1][i],durationMs:3600000}});
   await evaluate(`window.__fps.games=[{id:'fixture-session',gameId:'fortnite',name:'Fortnite',startedAt:new Date().toISOString(),lastAt:new Date().toISOString(),endedAt:null,alive:true,partial:false,partialEnd:false,durationMs:3900000,recordedMs:3890000,average:100,low1:65,maximum:180,frames:10000,week:${JSON.stringify(week)}}];window.dispatchEvent(new Event('focus'))`);
   await waitFor(`document.querySelectorAll('.fps-session-card').length===1`,'Actual measured fixture session');
  }
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.fps-session-card dd')].map(x=>x.textContent)`),['100','65','180']);
  assert.ok(await evaluate(`document.querySelector('.fps-duration').textContent.includes('1 ч 5 мин')`));
  if(!await evaluate(`document.querySelector('.fps-week')`))await evaluate(`document.querySelector('.fps-session-card>.button').click()`);
  assert.equal(await evaluate(`document.querySelectorAll('.fps-week circle').length`),4);assert.equal(await evaluate(`document.querySelectorAll('.fps-week polyline').length`),2,'Missing days break the line');await choiceShot(prefix+'-weekly');
  await evaluate(`window.__testSettings()`);await choiceShot(prefix+'-settings');
  await evaluate(`document.querySelector('[aria-label="Собирать статистику FPS"]').click()`);await waitFor(`!document.querySelector('.fps-statistics')`,'Disabling fully hides statistics');assert.equal(await evaluate(`window.__fps.enabled`),false);
  await evaluate(`document.querySelector('[aria-label="Собирать статистику FPS"]').click()`);await waitFor(`!!document.querySelector('.fps-statistics')`,'History restored after enabling');await evaluate(`window.__testCloseSettings()`);
  await evaluate(`document.querySelector('.fps-stats-tools button').click()`);await waitFor(`window.__fpsAdded===true`,'Unknown game EXE picker bridge');
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`),'FPS statistics fits');
 };
 const checkTweakGuide=async()=>{
  const style=()=>evaluate(`(()=>{const b=document.querySelector('.tweaks-featured');return{fill:getComputedStyle(b,'::before').backgroundPosition,opacity:getComputedStyle(b,'::before').opacity,halo:getComputedStyle(b).boxShadow,name:getComputedStyle(b).animationName}})()`);
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
  const before=await style();assert.ok(before.name.includes('tweaks-halo'));assert.ok(Number(before.opacity)>.8);await delay(450);const after=await style();assert.notEqual(after.fill,before.fill,'The entire gradient filling moves, including with Windows reduced motion');assert.notEqual(after.halo,before.halo,'Glow changes over time');await choiceShot('tweaks-glow-frame-a');await delay(500);await choiceShot('tweaks-glow-frame-b');
  // A fresh guidance schedule is tested independently of time spent in preceding checks.
  await evaluate(`sessionStorage.setItem('gtm-tweaks-guide-v2',JSON.stringify({shown:0,last:0,visited:false}))`);await click('Твики');await click('Система');
  await waitFor(`!!document.querySelector('.tweak-guide-hand')&&Number(getComputedStyle(document.querySelector('.tweak-guide-hand')).opacity)>.95`,'Rare pointing glove appears',130);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.tweak-guide-hand')).pointerEvents`),'none');await choiceShot('tweaks-cartoon-hand');await waitFor(`!document.querySelector('.tweak-guide-hand')`,'Hand retreats');
  await evaluate(`window.__testToggleEffects()`);await waitFor(`document.querySelector('.tweaks-featured').dataset.glow==='false'`,'Animations off stops glow');assert.equal(await evaluate(`!!document.querySelector('.tweak-guide-hand')`),false);await evaluate(`window.__testToggleEffects()`);await waitFor(`document.querySelector('.tweaks-featured').dataset.glow==='true'`,'Animations on restores glow');
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});
 };
 const checkSystemSecurity=async prefix=>{
  const refresh=async value=>{await evaluate(`window.__security=${JSON.stringify(value)};document.querySelector('.system-security .section-heading button').click()`);await waitFor(`document.querySelector('.system-security').getAttribute('aria-busy')==='false'`,'Security read completes')};
  await waitFor(`document.querySelector('[data-security="tpm"]>strong')?.textContent==='TPM 2.0 готов'`,'Security status after mounting');
  assert.equal(await evaluate(`document.querySelector('[data-security="secure-boot"]>strong').textContent`),'Включён');
  await evaluate(`document.querySelector('.system-security').scrollIntoView({block:'center'})`);await choiceShot(prefix);
  await refresh({...securityFixture,secureBoot:{enabled:false,source:'firmware'},tpm:{present:true,version:'1.2',ready:true,source:'cim'}});
  assert.equal(await evaluate(`document.querySelector('[data-security="secure-boot"]>strong').textContent`),'Выключен');assert.equal(await evaluate(`document.querySelector('[data-security="tpm"]>strong').textContent`),'Обнаружен TPM 1.2');
  await refresh({...securityFixture,firmware:'legacy'});assert.equal(await evaluate(`document.querySelector('[data-security="secure-boot"]>strong').textContent`),'Нужен режим UEFI');
  await refresh({...securityFixture,secureBoot:{enabled:true,source:'windows-boot',issue:'access'},tpm:{present:true,version:'2.0',ready:null,source:'tbs'}});
  assert.ok(await evaluate(`document.querySelector('[data-security="secure-boot"]').textContent.includes('при последней загрузке')`));assert.equal(await evaluate(`document.querySelector('[data-security="tpm"]').dataset.state`),'unknown','Detection alone does not confirm readiness');
  await refresh({...securityFixture,tpm:{...securityFixture.tpm,lockedOut:true}});assert.equal(await evaluate(`document.querySelector('[data-security="tpm"]>strong').textContent`),'TPM 2.0 заблокирован');
  await refresh({...securityFixture,tpm:{present:false,version:null,ready:null,source:'tbs'}});assert.equal(await evaluate(`document.querySelector('[data-security="tpm"]>strong').textContent`),'Не обнаружен');assert.ok(await evaluate(`document.querySelector('[data-security="tpm"]').textContent.includes('отключён в UEFI или отсутствовать')`));
  await evaluate(`window.__securityError=true;document.querySelector('.system-security .section-heading button').click()`);await waitFor(`document.querySelector('.security-check-status').textContent.includes('Не удалось')`,'Unreadable security state');
  assert.equal(await evaluate(`document.querySelector('[data-security="secure-boot"]>strong').textContent`),'Нет данных');assert.equal(await evaluate(`document.querySelector('[data-security="tpm"]>strong').textContent`),'Нет данных','Access failures never report disabled or absent TPM');
  await evaluate(`window.__securityError=false`);await refresh(securityFixture);
  const before=await evaluate(`window.__securityCalls`);await evaluate(`window.dispatchEvent(new Event('focus'))`);await waitFor(`window.__securityCalls>${before}`,'Security refresh after focus');
  await evaluate(`document.querySelector('.security-help').open=true;document.querySelector('.security-help button').click()`);assert.ok(await evaluate(`window.__recoveryOpened>0`));assert.ok(await evaluate(`document.querySelector('.security-help').textContent.includes('Перезагрузка автоматически не запускается')`));
  await evaluate(`document.querySelector('.security-help').open=false`);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`),'Security section fits the window');
 };
 const checkThemedDialogs=async(prefix,long=false)=>{
  await waitFor(`typeof window.__dialogListener==='function'`,'Dialog subscription');
  const request={id:prefix,type:'warning',title:'Применить профиль?',message:'Изменений: 2',detail:'Исходные значения будут сохранены до изменений. Windows запросит права администратора. При ошибке программа попытается выполнить откат; результат будет показан в отчёте.',items:[{title:'Высокая производительность GPU для игры',detail:''},{title:'Высокий приоритет CPU для игры',detail:'Фоновые программы могут реагировать медленнее. Игра или античит могут изменить приоритет обратно.'}],buttons:['Отмена','Применить'],cancelId:0,defaultId:0};
  if(long)request.items=Array.from({length:40},(_,i)=>({title:'Изменение '+(i+1),detail:request.items[1].detail}));
  const show=async extra=>{await evaluate(`document.querySelector('.os-selector').focus();window.__dialogListener(${JSON.stringify({...request,...extra})})`);await waitFor(`!!document.querySelector('.app-dialog')&&Number(getComputedStyle(document.querySelector('.app-dialog')).opacity)>.99`,'Themed app confirmation')};
  await show();
  assert.equal(await evaluate(`document.activeElement.dataset.response`),'0','Cancel is initially focused');
  assert.equal(await evaluate(`document.getElementById('root').inert`),true,'Underlying app cannot receive input');
  assert.equal(await evaluate(`document.querySelector('.app-dialog').getAttribute('role')`),'alertdialog');
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.app-dialog')).backgroundColor===getComputedStyle(document.querySelector('.hardware-card')).backgroundColor`),true,'Dialog follows the app surface colour');
  const fit=await evaluate(`(()=>{const m=document.querySelector('.app-dialog').getBoundingClientRect(),footer=document.querySelector('.app-dialog-actions').getBoundingClientRect(),body=document.querySelector('.app-dialog-content');return{top:m.top,bottom:m.bottom,right:m.right,height:innerHeight,width:innerWidth,footer:footer.bottom,scrolls:body.scrollHeight>body.clientHeight}})()`);
  assert.ok(fit.top>=34&&fit.bottom<=fit.height&&fit.right<=fit.width&&fit.footer<=fit.height,'Dialog and actions fit: '+JSON.stringify(fit));if(long)assert.equal(fit.scrolls,true,'Long change list scrolls above the visible actions');
  await choiceShot(prefix);
  await key('Tab',9,8);await key('Tab',9,8);await key('Tab',9);assert.equal(await evaluate(`document.activeElement.closest('.app-dialog')!==null`),true,'Tab and Shift+Tab remain in the modal');
  await evaluate(`document.querySelector('.app-dialog [data-response="0"]').focus()`);await key('Enter',13);await waitFor(`!document.querySelector('.app-dialog')`,'Enter cancels by default');
  assert.equal(await evaluate(`window.__dialogReplies.at(-1).response`),0);
  assert.equal(await evaluate(`document.getElementById('root').inert`),false);assert.equal(await evaluate(`document.activeElement.classList.contains('os-selector')`),true,'Focus returns to its opener');
  const before=await evaluate(`window.__dialogReplies.length`);
  await show({id:prefix+'-apply'});await evaluate(`(()=>{window.__dialogListener({closed:'old-request'});const button=document.querySelector('.app-dialog [data-response="1"]');button.click();button.click()})()`);await waitFor(`!document.querySelector('.app-dialog')`,'Confirmed dialog closes');
  assert.equal(await evaluate(`window.__dialogReplies.length`),before+1,'Repeated clicks submit exactly one answer');assert.equal(await evaluate(`window.__dialogReplies.at(-1).response`),1);
  await show({id:prefix+'-escape'});await key('Escape',27);await waitFor(`!document.querySelector('.app-dialog')`,'Escape cancels');assert.equal(await evaluate(`window.__dialogReplies.at(-1).response`),0);
  await show({id:prefix+'-restore',type:'question',title:'Восстановить исходные настройки?',message:'',items:[],buttons:['Отмена','Восстановить']});await evaluate(`document.querySelector('.app-dialog-close').click()`);await waitFor(`!document.querySelector('.app-dialog')`,'Close cancels recovery');assert.equal(await evaluate(`window.__dialogReplies.at(-1).response`),0);
  await show({id:prefix+'-info',type:'info',title:'Дождитесь завершения оптимизации или отката.',items:[],message:'',buttons:['Понятно']});assert.equal(await evaluate(`document.querySelectorAll('.app-dialog-actions button').length`),1);await evaluate(`document.querySelector('.app-dialog-actions button').click()`);await waitFor(`!document.querySelector('.app-dialog')`,'Information closes');
  await show({id:prefix+'-retry'});await evaluate(`window.__dialogReplyError=true;document.querySelector('.app-dialog [data-response="1"]').click()`);await waitFor(`!!document.querySelector('.app-dialog-error')&&!document.querySelector('.app-dialog [data-response="0"]').disabled`,'Reply failure permits a safe retry');await evaluate(`document.querySelector('.app-dialog [data-response="0"]').click()`);await waitFor(`!document.querySelector('.app-dialog')`,'Retry cancel');
 };
 const selectWindows=async(index,prefix)=>{
  await waitFor(`!!document.querySelector('.welcome')&&Number(getComputedStyle(document.querySelector('.welcome')).opacity)>.95`,'Visible OS cards');
  const started=Date.now();
  const initial=await evaluate(`(async()=>{const card=document.querySelectorAll('.os-card')[${index}],logo=card.querySelector('.windows-logo'),source=logo.getBoundingClientRect();card.click();${index===0?"document.querySelectorAll('.os-card')[1].click();":''}await new Promise(requestAnimationFrame);const moving=document.querySelector('.os-choice-mark').getBoundingClientRect();return{source:{x:source.x+source.width/2,y:source.y+source.height/2,width:source.width},moving:{x:moving.x+moving.width/2,y:moving.y+moving.height/2,width:moving.width},center:{x:innerWidth/2,y:innerHeight/2}}})()`);
  const distance=p=>Math.hypot(p.x-initial.center.x,p.y-initial.center.y);
  assert.ok(Math.hypot(initial.moving.x-initial.source.x,initial.moving.y-initial.source.y)<22,'Logo starts in the chosen card: '+JSON.stringify(initial));
  assert.ok(Math.abs(initial.moving.width-initial.source.width)<12,'Logo initially retains the card size');
  assert.equal(await evaluate(`document.querySelector('.os-selection-overlay').dataset.version`),index===0?'10':'11','Repeated clicks cannot replace the selected system');
  assert.equal(await evaluate(`Number(getComputedStyle(document.querySelector('.os-choice-caption')).opacity)`),0,'Name is hidden during travel');assert.equal(await evaluate(`document.querySelector('.welcome').inert`),true,'Keyboard input cannot change a pending selection');
  await waitFor(`(()=>{const b=document.querySelector('.os-choice-mark').getBoundingClientRect();return Math.hypot(b.x+b.width/2-${initial.center.x},b.y+b.height/2-${initial.center.y})<${distance(initial.moving)-20}})()`,'Visible travel toward centre',30);const moving=await evaluate(`(()=>{const b=document.querySelector('.os-choice-mark').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2}})()`);
  assert.ok(distance(moving)<distance(initial.moving)-20,'The chosen logo actually travels toward the centre');await choiceShot(prefix+'-travel');
  await waitFor(`['title','hold'].includes(document.querySelector('.os-selection-overlay')?.dataset.stage)&&Number(getComputedStyle(document.querySelector('.os-choice-caption')).opacity)>.95`,'Readable system name after arrival');
  const centered=await evaluate(`(()=>{const b=document.querySelector('.os-choice-mark .windows-logo').getBoundingClientRect(),label=document.querySelector('.os-choice-caption b').getBoundingClientRect();return{x:b.x+b.width/2-innerWidth/2,y:b.y+b.height/2-innerHeight/2,caption:label.x+label.width/2-(b.x+b.width/2)}})()`);
  assert.ok(Math.abs(centered.x)<2&&Math.abs(centered.y)<2,'Visible logo finishes at the screen centre: '+JSON.stringify(centered));assert.ok(Math.abs(centered.caption)<1,'Visible logo and label share the same axis: '+JSON.stringify(centered));
  assert.equal(await evaluate(`document.querySelector('.os-choice-caption b').textContent`),index===0?'Windows 10':'Windows 11');
  assert.equal(await evaluate(`!!document.querySelector('.app-shell')`),false,'The name is shown before the workspace');await choiceShot(prefix+'-title');
  await waitFor(`document.querySelector('.os-selection-overlay')?.dataset.stage==='reveal'&&!!document.querySelector('.app-shell')`,'Workspace crossfade begins');
  const revealing=await evaluate(`(async()=>{const app=document.querySelector('.app-shell'),page=document.querySelector('main').dataset.page,inert=app.inert;let opacity=Number(getComputedStyle(app).opacity);for(let i=0;i<60&&opacity===0;i++){await new Promise(requestAnimationFrame);opacity=Number(getComputedStyle(app).opacity)}return{page,inert,opacity}})()`);
  assert.equal(revealing.page,'system','Every explicit OS selection opens System');assert.equal(revealing.inert,true,'Workspace input stays blocked until the logo disappears');
  assert.ok(revealing.opacity>0&&revealing.opacity<.99,'Workspace fades in gradually; opacity='+revealing.opacity);assert.equal(await evaluate(`Number(getComputedStyle(document.querySelector('.os-selection-overlay')).opacity)`),1,'Windows logo remains visible during the workspace fade');await choiceShot(prefix+'-workspace');
  await waitFor(`document.querySelector('.os-selection-overlay')?.dataset.stage==='dismiss'`,'Logo dismissal after workspace reveal');
  assert.ok(await evaluate(`Number(getComputedStyle(document.querySelector('.app-shell')).opacity)>.99`),'Workspace is visible before logo dismissal');
  const disappearing=await evaluate(`(async()=>{for(let i=0;i<60;i++){const overlay=document.querySelector('.os-selection-overlay');if(!overlay)return null;const opacity=Number(getComputedStyle(overlay).opacity);if(opacity>0&&opacity<1)return opacity;await new Promise(requestAnimationFrame)}return null})()`);assert.ok(disappearing>0&&disappearing<1,'Logo fades out separately');await choiceShot(prefix+'-dismiss');
  await waitFor(`!document.querySelector('.os-selection-overlay')`,'Selection animation completes');assert.ok(Date.now()-started>=3700,'The sequence must remain readable, not flash past');
  assert.equal(await evaluate(`localStorage.getItem('lagophone-windows-version')`),index===0?'10':'11');await delay(120);
  assert.ok(await evaluate(`Number(getComputedStyle(document.querySelector('.app-shell')).opacity)>.99`),'Completing the overlay does not restart the workspace fade');
  assert.equal(await evaluate(`document.querySelector('.os-selector').disabled`),false);assert.equal(await evaluate(`document.querySelector('.app-shell').inert`),false);
 };
 const checkDriverRecommendations=async prefix=>{
  await click('Приложения и драйверы');
  await waitFor(`!!document.querySelector('.driver-download-list>li')`,'Driver recommendations');
  const rows=await evaluate(`[...document.querySelectorAll('.driver-download-list>li')].map(e=>({url:e.dataset.url,step:Number(e.querySelector('.driver-step').textContent),title:e.querySelector('h3').textContent,scope:e.querySelector('.driver-scope').textContent}))`);
  assert.equal(new Set(rows.map(r=>r.url)).size,rows.length,'No repeated download destinations');
  assert.deepEqual(rows.map(r=>r.step),rows.map((_,i)=>i+1),'Sequential installation order');
  const oem=rows.filter(r=>r.url.includes('asrock.com'));assert.equal(oem.length,1);assert.ok(oem[0].scope.includes('LAN')&&oem[0].scope.includes('Звук'),'One board page covers related components');
  assert.equal(rows.filter(r=>r.scope.includes('Видеокарта')).length,1,'One recommended GPU source');
  assert.ok(rows[0].url.includes('/am4/b550.html'),'Chipset recommended first');
  assert.ok(await evaluate(`!document.querySelector('.driver-category,.driver-modal')`),'No duplicate category download dialogs');
  await evaluate(`document.querySelector('.driver-download-list button').click()`);await delay(60);
  assert.equal(await evaluate(`window.__openedDriver`),'chipset:amd-chipset-b550','Download resolves through the native allowlist');
  await evaluate(`document.querySelector('.driver-recommendations').scrollIntoView({block:'start'})`);await choiceShot(prefix);
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`),'Recommendations fit the window');
 };
 await selectWindows(0,'windows-10');
 const checkBlocking=async prefix=>{
  await evaluate(`window.__blocking.lastReport=null;window.__blocking.operation=null;window.__blocking.settings.profile='general';window.__blocking.zapret={running:false};window.__blocking.fnport={phase:'idle'}`);
  await click('Блокировки');await waitFor(`document.querySelectorAll('.fix-card').length===2`,'Fix section');
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('.fix-card h2')].map(x=>x.textContent)`),['DiscordFix','FortniteFix']);
  assert.equal(await evaluate(`document.querySelector('.tweaks-featured').nextElementSibling===document.querySelector('.blocking-featured')`),true,'Tweaks and Blocking are adjacent');
  const navFill=await evaluate(`(()=>{const t=getComputedStyle(document.querySelector('.tweaks-featured'),'::before'),b=getComputedStyle(document.querySelector('.blocking-featured'),'::before');return{t:t.backgroundImage,b:b.backgroundImage,animation:b.animationName,position:b.backgroundPosition}})()`);assert.notEqual(navFill.t,navFill.b,'Separate sidebar palettes');assert.equal(navFill.animation,'tweaks-fill');await delay(220);assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.blocking-featured'),'::before').backgroundPosition`),navFill.position,'Blocking filling animates');
  assert.equal(await evaluate(`!!document.querySelector('.fix-help')`),false,'No hidden if-it-did-not-help workflow');
  assert.equal(await evaluate(`document.querySelectorAll('.fix-pill.is-off').length`),2);
  assert.ok(await evaluate(`document.querySelector('.strategy-search').getClientRects().length>0`),'Strategy finder is immediately visible');await choiceShot(prefix);
  assert.equal(await evaluate(`getComputedStyle(document.querySelector('.fix-pill'),'::before').animationName`),'fix-seal-sheen');
  await evaluate(`document.querySelector('[data-fix="discord"] .fix-toggle').click()`);await waitFor(`document.querySelector('[data-fix="discord"] .fix-pill').textContent==='ВКЛЮЧЕНО'`,'Discord actual enable');assert.equal(await evaluate(`window.__blockingActions.at(-1)`),'activate-profile:general');
  await choiceShot(prefix+'-running');await evaluate(`document.querySelector('[data-fix="discord"] .fix-toggle').click()`);await waitFor(`document.querySelector('[data-fix="discord"] .fix-pill').textContent==='ВЫКЛЮЧЕНО'`,'Discord stop');
  await click('Найти стратегию');await waitFor(`!!document.querySelector('.strategy-progress')`,'Real search progress');assert.equal(await evaluate(`document.querySelector('[data-fix="discord"] .fix-toggle').disabled`),true);await choiceShot(prefix+'-searching');
  await waitFor(`document.querySelectorAll('.strategy-result').length===2&&!document.querySelector('.strategy-progress')`,'Candidate results');
  assert.equal(await evaluate(`document.querySelector('select[aria-label="Стратегия DiscordFix"]').value`),'general-alt');assert.ok(await evaluate(`document.querySelector('.strategy-result.is-recommended').textContent.includes('ALT')`));await choiceShot(prefix+'-results');
  await click('Включить выбранную');assert.equal(await evaluate(`window.__blockingActions.at(-1)`),'activate-profile:general-alt');assert.equal(await evaluate(`document.querySelector('[data-fix="discord"] .fix-selected b').textContent`),'ALT');
  await evaluate(`document.querySelector('[data-fix="discord"] .fix-toggle').click()`);await waitFor(`!document.querySelector('[data-fix="discord"] .fix-pill.is-on')`,'Stop chosen strategy');
  await click('Повторить поиск');await click('Остановить поиск');await waitFor(`document.querySelector('.strategy-result-heading h3').textContent==='Поиск остановлен'`,'Cancellation result');
  await evaluate(`document.querySelector('[data-fix="fortnite"] .fix-toggle').click()`);await waitFor(`document.querySelector('[data-fix="fortnite"] .fix-pill').textContent==='ВКЛЮЧЕНО'`,'Fortnite enabled');assert.ok(await evaluate(`document.querySelector('[data-fix="fortnite"] .fix-status').textContent.includes('Epic')`));assert.equal(await evaluate(`document.querySelector('.strategy-search').disabled`),true,'Search cannot disturb active FortniteFix');
  await evaluate(`document.querySelector('[data-fix="fortnite"] .fix-toggle').click()`);await waitFor(`document.querySelector('[data-fix="fortnite"] .fix-pill').textContent==='ВЫКЛЮЧЕНО'`,'Fortnite stop');
  await evaluate(`window.__testToggleEffects()`);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.fix-pill'),'::before').animationName`),'none','General animation setting also controls status seals');assert.equal(await evaluate(`getComputedStyle(document.querySelector('.blocking-featured'),'::before').animationName`),'none','General setting disables Blocking glow');await evaluate(`window.__testToggleEffects()`);
  await evaluate(`document.querySelector('.strategy-details').open=true`);await click('Сохранить отчёт');assert.equal(await evaluate(`window.__blockingReport`),true);assert.ok(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`));await choiceShot(prefix+'-details');await click('Система');
 };
 if(process.env.GTM_TEST_BLOCKING_ONLY){await checkBlocking('blocking-dark');await evaluate(`window.__testTheme('white')`);await send('Emulation.setDeviceMetricsOverride',{width:960,height:680,deviceScaleFactor:1,mobile:false});await checkBlocking('blocking-light-minimum');console.log('PASS: visible strategy finder, real action/progress wiring, candidate choice and activation, cancellation, session guards, animated readable status seals, effects setting, report and both themes');return;}
 await checkBlocking('blocking-dark');
 await checkFpsStatistics('black-performance');await checkTweakGuide();
 if(process.env.GTM_TEST_FPS_ONLY){await evaluate(`(async()=>{await window.__testTheme('white')})()`);await send('Emulation.setDeviceMetricsOverride',{width:960,height:680,deviceScaleFactor:1,mobile:false});await checkFpsStatistics('white-minimum-performance');console.log('PASS: actual FPS session statistics, empty first launch, game detection status, average/1% low/max, duration, seven-day graph gaps, general settings, collection disable, iridescent filling/glow and rare glove');return;}

 await checkDriverRecommendations('black-driver-recommendations');await click('Система');
 await checkSystemSecurity('black-system-security');
 if(process.env.GTM_TEST_SECURITY_ONLY){await evaluate(`(async()=>{await window.__testTheme('white')})()`);await send('Emulation.setDeviceMetricsOverride',{width:960,height:680,deviceScaleFactor:1,mobile:false});await checkSystemSecurity('white-minimum-system-security');console.log('PASS: functional hardware cards, sourced FPS ranges and cautious limitation hints; rare cartoon pointing glove and animated key tab; Secure Boot and TPM 2.0, legacy and cached sources, TPM 1.2, lockout, readiness unknown, read errors, refresh, recovery settings and both themes');return;}

 await checkThemedDialogs('black-app-dialog');
 if(process.env.GTM_TEST_DIALOGS_ONLY){
  await evaluate(`(async()=>{await window.__testTheme('white')})()`);await delay(250);
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:680,deviceScaleFactor:1,mobile:false});
  await checkThemedDialogs('white-minimum-app-dialog',true);
  console.log('PASS: themed native confirmations, both themes, safe default, Enter/Escape/close, focus trap and restore, one answer per click, stale close, reply failure and long-list minimum window');return;
 }

 // Changing an incompatible choice directly from System must not stall the sequence.
 await evaluate(`document.querySelector('.warning button').click()`);
 await waitFor(`document.querySelector('.os-selection-overlay')?.dataset.stage==='hold'`,'Compatibility choice title');
 assert.ok(await evaluate(`Number(getComputedStyle(document.querySelector('.app-shell')).opacity)<.01`),'Old workspace fades out before the new choice');
 await waitFor(`document.querySelector('.os-selection-overlay')?.dataset.stage==='reveal'`,'Compatibility workspace reveal');
 await waitFor(`!document.querySelector('.os-selection-overlay')`,'Compatibility sequence finishes');
 assert.equal(await evaluate(`localStorage.getItem('lagophone-windows-version')`),'11');
 assert.ok(await evaluate(`Number(getComputedStyle(document.querySelector('.app-shell')).opacity)>.99`));
 await evaluate(`document.querySelector('.os-selector').click()`);await waitFor(`!!document.querySelector('.welcome')`,'Return to OS choice');
 await selectWindows(1,'windows-11');
 // Disabled Windows motion must not compress the explicit in-app sequence.
 await evaluate(`document.querySelector('.os-selector').click()`);await waitFor(`!!document.querySelector('.welcome')`,'Motion preference choice');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});await delay(80);
 await selectWindows(1,'windows-11-system-motion-off');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await delay(80);
 if(process.env.GTM_TEST_OS_ONLY){
  await evaluate(`(async()=>{await window.__testTheme('white');document.querySelector('.os-selector').click()})()`);
  await waitFor(`!!document.querySelector('.welcome')`,'Light choice');
  await send('Emulation.setDeviceMetricsOverride',{width:960,height:680,deviceScaleFactor:1,mobile:false});
  await selectWindows(0,'windows-10-light-minimum');
  await checkDriverRecommendations('white-minimum-driver-recommendations');
  assert.ok(await evaluate(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`),'Choice fits the minimum window');
  console.log('PASS: four-stage OS choice, real logo travel, title hold, System crossfade, final dismissal; Windows motion off; light/minimum window; repeated-click protection');return;
 }
 await click('Игровая оптимизация');
 assert.equal(await evaluate(`!!document.querySelector('.main-footer')`),false);
 await click('Выбрать игру');assert.ok(await evaluate(`document.querySelectorAll('.game-catalog-card').length>=17`));
 assert.equal(await evaluate(`!![...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='Другая игра')`),true);
 await evaluate(`document.querySelector('[aria-label="Выбрать Counter-Strike 2"]').click()`);await delay(200);
 assert.equal(await evaluate(`document.querySelector('.game-optimize').disabled`),false,'Primary action must remain clickable before choosing the EXE');
 await click('Выбрать файл игры');assert.equal(await evaluate(`document.querySelector('.game-optimize').textContent.trim()`),'Оптимизировать');
 const shot=async name=>fs.writeFileSync(path.join(output,name+'.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 const animation=()=>evaluate(`({...document.querySelector('.game-animation')?.dataset})`);
 const diskDepth=async()=>{
  const samples=await evaluate(`(()=>{
   const canvas=document.querySelector('.game-animation'),ctx=canvas.getContext('2d'),front=document.querySelector('.game-animation-front').getContext('2d'),d=canvas.dataset;
   const [cx,cy]=d.target.split(',').map(Number),r=Number(d.horizonRadius),yaw=Number(d.diskYaw),inclination=Number(d.diskInclination),scale=canvas.width/canvas.clientWidth;
   const peak=(x,y)=>{let value=0;for(const layer of [ctx,front]){const pixels=layer.getImageData(Math.round(x*scale)-3,Math.round(y*scale)-3,7,7).data;for(let i=0;i<pixels.length;i+=4)if(pixels[i+3]>50)value=Math.max(value,pixels[i],pixels[i+1],pixels[i+2])}return value};
   const at=t=>peak(cx+r*1.76*(Math.cos(yaw)*Math.cos(t)+Math.cos(inclination)*Math.sin(yaw)*Math.sin(t)),cy+r*1.76*Math.sin(inclination)*Math.sin(t));
   const near=Math.atan2(Math.sin(yaw),Math.cos(inclination)*Math.cos(yaw));
   const host=document.querySelector('.game-launcher').getBoundingClientRect(),heading=document.querySelector('.game-launcher h2').getBoundingClientRect();
   // This band contains the circular horizon, above every projected outer-ring position.
   const core=ctx.getImageData(Math.round((cx-r*.4)*scale),Math.round((cy-r*1.18)*scale),Math.round(r*.8*scale),Math.round(r*.4*scale)).data;
   let coreSignature=2166136261;for(const byte of core)coreSignature=Math.imul(coreSignature^byte,16777619)>>>0;
   const extent=Math.max(r*1.13,r*1.83*Math.sin(inclination))+6;
   return{yaw,coreSignature,back:Math.abs(Math.cos(yaw))>.45?[.4,.5,.6].map(t=>at(near+Math.PI+t*Math.PI)):[],front:[.4,.5,.6].map(t=>at(near+t*Math.PI)),top:cy-extent,bottom:cy+extent,heading:heading.top-host.top};
  })()`);
  assert.ok(samples.back.every(value=>value<25),'Far side must be hidden inside the central shadow: '+JSON.stringify(samples));
  assert.ok(samples.front.every(value=>value>50),'Near side must remain visible in front: '+JSON.stringify(samples));
  assert.ok(samples.top>0&&samples.bottom<samples.heading,'The 3D outer ring must fit above the game title: '+JSON.stringify(samples));
  return samples;
 };
 const waitStage=async stages=>{for(let i=0;i<100;i++){if(stages.includes((await animation()).stage))return;await delay(50)}throw Error('Missing animation stage '+stages+': '+JSON.stringify(await animation()))};
 const originMatches=async()=>{const values=await evaluate(`(()=>{const c=document.querySelector('.game-animation'),host=document.querySelector('.game-launcher'),b=document.querySelector('.game-optimize').getBoundingClientRect(),e=document.querySelector('.emblem-logo').getBoundingClientRect(),h=host.getBoundingClientRect();return{actual:c.dataset.origin.split(',').map(Number),target:c.dataset.target.split(',').map(Number),expected:[b.x+b.width/2-h.x-host.clientLeft,b.y+4-h.y-host.clientTop],center:[e.x+e.width/2-h.x-host.clientLeft,e.y+e.height/2-h.y-host.clientTop]}})()`);for(let i=0;i<2;i++){assert.ok(Math.abs(values.actual[i]-values.expected[i])<.6,JSON.stringify(values));assert.ok(Math.abs(values.target[i]-values.center[i])<.6,JSON.stringify(values))}};
 const coloredPixels=()=>evaluate(`(()=>{let white=0,gold=0,total=0;for(const c of document.querySelectorAll('.game-animation,.game-animation-front')){const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=0;i<p.length;i+=4){if(p[i+3]<30)continue;total++;if(p[i+2]>225)white++;if(p[i]>200&&p[i+1]>125&&p[i+1]<230&&p[i+2]<200)gold++}}return{white,gold,total}})()`);
 const frontOverLogo=async label=>{
  let crossing=false;
  for(let i=0;i<180;i++){if(Math.abs(Math.cos(Number((await animation()).diskYaw)))<.13){crossing=true;break}await delay(50)}
  assert.ok(crossing,'Ring passes across '+label);
  await evaluate(`window.dispatchEvent(new Event('blur'))`);
  const angle=(await animation()).angle;
  let views;
  try{
   await shot('front-over-'+label);
   const clip=await evaluate(`(()=>{const e=document.querySelector('.emblem-logo').getBoundingClientRect();return{x:Math.floor(e.left+scrollX),y:Math.floor(e.top+scrollY),width:Math.ceil(e.width)+2,height:Math.ceil(e.height)+2,scale:1}})()`);
   const capture=async()=> (await send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true})).data;
   const normal=await capture();
   await evaluate(`document.querySelector('.game-animation-front').style.visibility='hidden'`);
   const withoutFront=await capture();
   await evaluate(`document.querySelector('.emblem-logo').style.visibility='hidden'`);
   views=[normal,withoutFront,await capture()];
  }finally{
   await evaluate(`document.querySelector('.emblem-logo').style.visibility='';document.querySelector('.game-animation-front').style.visibility=''`);
  }
  assert.equal((await animation()).angle,angle,'Freeze the exact same frame for compositing comparison');
  const pixels=await evaluate(`(async()=>{
   const decode=async value=>{const image=await createImageBitmap(await(await fetch('data:image/png;base64,'+value)).blob()),c=document.createElement('canvas');c.width=image.width;c.height=image.height;const p=c.getContext('2d');p.drawImage(image,0,0);return p.getImageData(0,0,c.width,c.height).data};
   const [normal,withoutFront,background]=await Promise.all(${JSON.stringify(views)}.map(decode));let glyph=0,covered=0;
   for(let i=0;i<normal.length;i+=4){
    if(Math.max(...[0,1,2].map(c=>Math.abs(withoutFront[i+c]-background[i+c])))<80)continue;
    glyph++;
    if(Math.max(...[0,1,2].map(c=>Math.abs(normal[i+c]-withoutFront[i+c])))>10)covered++;
   }
   return{glyph,covered};
  })()`);
  assert.ok(pixels.glyph>50,'Visible logo pixels for '+label+': '+JSON.stringify(pixels));
  assert.ok(pixels.covered>3,'The front arc must paint over actual '+label+' glyph pixels: '+JSON.stringify(pixels));
  await evaluate(`window.dispatchEvent(new Event('focus'))`);
 };

 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 assert.equal(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`),true);
 assert.equal(await evaluate(`/SCSKiller|Подготовка шейдеров/i.test(document.querySelector('.game-optimizer').textContent)`),false);
 assert.equal(await evaluate(`'gameShaderStatus' in window.lagophone`),false);
 await evaluate(`window.__button=document.querySelector('.game-optimize');window.__buttonY=window.__button.getBoundingClientRect().y;window.__button.click()`);await delay(300);
 assert.equal(await evaluate(`document.querySelector('.game-optimize')===window.__button`),true,'Same button remains mounted');
 assert.equal((await animation()).stage,'particles');await originMatches();
 const initial=await coloredPixels();assert.ok(initial.white>10,JSON.stringify({initial,state:await animation(),focus:await evaluate('document.hasFocus()')}));await shot('particles');
 await waitStage(['halo']);const halo=await coloredPixels();assert.ok(halo.gold>20,JSON.stringify(halo));await shot('halo');
 await waitStage(['horizon']);const working=await animation();assert.equal(working.speed,'0.28');
 assert.ok(await evaluate(`(()=>{const e=document.querySelector('.emblem-logo'),s=getComputedStyle(e);return s.opacity==='1'&&s.visibility==='visible'&&s.transform==='none'&&e.getBoundingClientRect().width>100})()`),'Game logo remains visible');
 await shot('horizon');
 await evaluate(`window.dispatchEvent(new Event('blur'))`);const paused=await animation();await delay(180);assert.equal((await animation()).angle,paused.angle);assert.equal((await animation()).paused,'true');
 await evaluate(`window.dispatchEvent(new Event('focus'))`);await delay(500);assert.notEqual((await animation()).angle,paused.angle,JSON.stringify({paused,state:await animation(),visible:await evaluate('({hidden:document.hidden,focus:document.hasFocus()})')}));
 await delay(900);await evaluate(`window.__finish()`);await delay(350);
 assert.equal(await evaluate(`document.querySelector('.game-optimize').textContent.trim()`),'Игра оптимизирована');
 let boost;for(let i=0;i<60;i++){boost=await animation();if(Number(boost.speed)>4)break;await delay(50)}assert.equal(boost.stage,'boost');assert.ok(Number(boost.speed)>4,JSON.stringify(boost));
 assert.ok(Math.abs(await evaluate(`document.querySelector('.game-optimize').getBoundingClientRect().y-window.__buttonY`))<1,'Button does not jump at completion');await shot('boost');
 await waitStage(['orbit']);const turn=await animation();await delay(220);assert.notEqual((await animation()).angle,turn.angle,'Orbit keeps rotating with Windows reduced motion');
 await send('Emulation.setDeviceMetricsOverride',{width:960,height:680,deviceScaleFactor:1,mobile:false});await delay(180);await originMatches();
 await evaluate(`window.scrollTo(0,document.body.scrollHeight)`);await originMatches();await shot('small-orbit');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});await delay(150);await originMatches();
 await click('Твики');const hidden=await animation();await delay(180);assert.equal((await animation()).angle,hidden.angle,'No animation while game view hidden');
 await click('Игровая оптимизация');await delay(180);assert.notEqual((await animation()).angle,hidden.angle,'Animation resumes on return');
 await evaluate(`document.querySelector('.game-optimize').click()`);await delay(100);assert.equal((await animation()).stage,'particles','Repeat operation resets the intro');
 await evaluate(`window.__finish()`);await delay(100);assert.equal(await evaluate(`document.querySelector('.game-optimize').textContent.trim()`),'Игра оптимизирована','Instant success has no fake work delay');
 await waitStage(['boost']);await waitStage(['orbit']);
 // Native failure and cancellation must never run the successful outro.
 await click('Выбрать другую игру');await evaluate(`document.querySelector('[aria-label="Выбрать Dota 2"]').click()`);await delay(150);await click('Выбрать файл игры');
 await evaluate(`window.__outcome='error';document.querySelector('.game-optimize').click()`);await delay(350);await evaluate(`window.__finish()`);await delay(200);assert.equal((await animation()).stage,'error');await delay(700);assert.equal((await coloredPixels()).total,0,'Failure fades the effect entirely');
 assert.equal(await evaluate(`document.querySelector('.game-optimize').textContent.trim()`),'Оптимизировать');
 await evaluate(`window.__outcome='cancelled';document.querySelector('.game-optimize').click()`);await delay(200);await evaluate(`window.__finish()`);await delay(100);assert.equal((await animation()).stage,'idle');assert.equal((await coloredPixels()).total,0);
 await evaluate(`window.__outcome='throw';document.querySelector('.game-optimize').click()`);await delay(200);await evaluate(`window.__finish()`);await delay(150);assert.equal((await animation()).stage,'error');assert.ok(await evaluate(`document.querySelector('.optimization-message').textContent.includes('native test failure')`));
 await evaluate(`window.__outcome=null;document.querySelector('.game-optimize').click()`);await delay(3100);await evaluate(`window.__finish()`);await waitStage(['boost']);
 const previousDocument=await evaluate(`performance.timeOrigin`);await send('Page.reload');await waitFor(`performance.timeOrigin!==${previousDocument}&&!!document.querySelector('.app-shell')`,'Reloaded application');await click('Игровая оптимизация');await waitStage(['orbit']);assert.equal((await animation()).stage,'orbit','Saved optimized game opens with a formed orbit, without emission');
 // ResizeObserver can clear the canvas after React restores the saved orbit.
 // Wait for the next animated frame before sampling actual rendered pixels.
 await waitFor(`Number(document.querySelector('.game-animation')?.dataset.angle)>0`,'Reloaded orbit renders a moving frame');
 const firstDisk=await diskDepth();let diskYaw=firstDisk.yaw,depthChecks=firstDisk.back.length?1:0;
 for(let i=0;i<3;i++){
  await delay(800);const next=await diskDepth();
  assert.ok(next.yaw-diskYaw>.3,'Only the outer disk must rotate in 3D');diskYaw=next.yaw;
  assert.equal(next.coreSignature,firstDisk.coreSignature,'The central horizon must remain pixel-for-pixel stationary');
  if(next.back.length)depthChecks++;
  await shot('disk-depth-'+i);
 }
 assert.ok(depthChecks>=2,'Check front/back occlusion at multiple non-edge-on orientations');

 await evaluate(`(async()=>{await window.__testToggleEffects();await window.__testTheme('black')})()`);await delay(200);
 const effectsOff=await animation();await delay(250);assert.notEqual((await animation()).angle,effectsOff.angle,'Operation animation continues with ambient effects switched off');
 await frontOverLogo('dota2');
 await click('Выбрать другую игру');await evaluate(`document.querySelector('[aria-label="Выбрать Fortnite"]').click()`);await delay(150);await click('Выбрать файл игры');await click('Оптимизировать');await evaluate(`window.__finish()`);await waitStage(['orbit']);
 await frontOverLogo('fortnite');
 await shot('ready');
 if(process.env.GTM_CAPTURE_ORBIT){
  const frames=process.env.GTM_CAPTURE_ORBIT;fs.mkdirSync(frames,{recursive:true});
  const clip=await evaluate(`(()=>{const h=document.querySelector('.game-launcher').getBoundingClientRect(),t=document.querySelector('.game-launcher h2').getBoundingClientRect();return{x:h.left+scrollX,y:h.top+scrollY,width:h.width,height:t.bottom-h.top+20,scale:1}})()`);
  const count=96,period=2*Math.PI/(1.33*.55)*1000,start=Date.now();
  for(let i=0;i<count;i++){
   await delay(Math.max(0,start+i*period/count-Date.now()));
   const data=(await send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true})).data;
   fs.writeFileSync(path.join(frames,'frame-'+String(i).padStart(3,'0')+'.png'),Buffer.from(data,'base64'));
  }
 }

 await evaluate(`window.lagophone.optimizationStatus=async()=>({ok:true,active:false,needsRecovery:false,remaining:0,checks:[],windows:{version:'11',build:26100}})`);await click('Твики');await evaluate(`window.scrollTo(0,0)`);await delay(180);assert.ok(await evaluate(`!!document.querySelector('.selection-float')`));
 await evaluate(`document.querySelector('.apply-guide').click()`);await delay(250);assert.equal(await evaluate(`!!document.querySelector('.selection-float')`),false);
 await evaluate(`window.scrollTo(0,0)`);await delay(180);assert.ok(await evaluate(`!!document.querySelector('.selection-float')`));
 // White theme, desktop chrome and empty end-of-page spacing.
 await evaluate(`(async()=>{await window.__testTheme('white');sessionStorage.setItem('test-window-chrome','true')})()`);await delay(150);
 const beforeWhiteReload=await evaluate(`performance.timeOrigin`);await send('Page.reload');await waitFor(`performance.timeOrigin!==${beforeWhiteReload}&&!!document.querySelector('.app-shell')&&document.documentElement.dataset.theme==='white'&&document.documentElement.dataset.desktop==='true'&&window.__windowTheme==='white'`,'White desktop view');
 assert.equal(await evaluate(`document.documentElement.dataset.theme`),'white','White theme survives restart');
 assert.equal(await evaluate(`document.documentElement.dataset.desktop`),'true');
 assert.equal(await evaluate(`document.querySelector('.desktop-titlebar').getBoundingClientRect().height`),34);
 assert.equal(await evaluate(`document.querySelector('.desktop-titlebar').textContent`),'');assert.equal(await evaluate(`document.querySelector('.desktop-titlebar').children.length`),0);
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.desktop-titlebar')).getPropertyValue('-webkit-app-region')`),'drag');
 assert.equal(await evaluate(`window.__windowTheme`),'white','Native controls receive the selected theme');
 assert.ok(await evaluate(`getComputedStyle(document.querySelector('.atmosphere-white')).backgroundImage==='none'`),'Plain light workspace without textile wallpaper');
 const arrow=await evaluate(`(()=>{const b=document.querySelector('.os-selector').getBoundingClientRect();return{x:b.x+b.width/2,y:b.y+b.height/2,width:b.width}})()`);
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:40});await waitFor(`getComputedStyle(document.querySelector('.os-chevron')).opacity==='0'`,'OS arrow hidden');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:arrow.x,y:arrow.y});await waitFor(`getComputedStyle(document.querySelector('.os-chevron')).opacity==='1'`,'OS arrow on hover');assert.equal(await evaluate(`document.querySelector('.os-selector').getBoundingClientRect().width`),arrow.width,'Hover does not resize the OS button');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:20,y:40});await waitFor(`getComputedStyle(document.querySelector('.os-chevron')).opacity==='0'`,'OS arrow hides again');

 await click('Система');await evaluate(`window.scrollTo(0,document.body.scrollHeight)`);await delay(100);
 const footer=await evaluate(`(()=>{const end=document.querySelector('.workspace-end').getBoundingClientRect(),cards=document.querySelector('.bottom-cards').getBoundingClientRect();return{space:end.bottom-cards.bottom,text:document.querySelector('.workspace-end').textContent}})()`);
 assert.ok(footer.space>=60&&footer.space<=90,JSON.stringify(footer));assert.equal(footer.text,'');
 const contrasts=await evaluate(`(()=>{const linear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4,lum=rgb=>rgb.slice(0,3).map(x=>linear(x/255)).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0),rgb=s=>s.match(/[0-9.]+/g).map(Number);return ['.hardware-card h3','.hardware-detail>span','.safe-card p'].map(selector=>{const e=document.querySelector(selector),c=getComputedStyle(e).color,bg=getComputedStyle(e.closest('.hardware-card,.safe-card')).backgroundColor,a=lum(rgb(c)),b=lum(rgb(bg));return{selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}})})()`);
 for(const value of contrasts)assert.ok(value.ratio>=4.5,'White theme text contrast: '+JSON.stringify(value));
 assert.equal(await evaluate(`getComputedStyle(document.documentElement,'::-webkit-scrollbar-button').display`),'none');
 assert.ok(await evaluate(`['.pc-studio','.hardware-card','aside'].every(selector=>getComputedStyle(document.querySelector(selector)).backgroundImage==='none')`),'Plain system panels and sidebar');await shot('white-system-footer');await checkFpsStatistics('white-performance');await checkSystemSecurity('white-system-security');await checkThemedDialogs('white-app-dialog');await send('Emulation.setDeviceMetricsOverride',{width:960,height:680,deviceScaleFactor:1,mobile:false});await checkThemedDialogs('white-minimum-app-dialog',true);await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await click('Мониторинг');await delay(150);
 const core=await evaluate(`(()=>{const e=document.querySelector('.core-symbol .brand-mark').getBoundingClientRect(),parent=document.querySelector('.optimization-core>svg').getBoundingClientRect();return{size:e.width,cx:e.x+e.width/2-parent.x-parent.width/2,cy:e.y+e.height/2-parent.y-parent.height/2}})()`);
 assert.ok(core.size>=30&&core.size<=65&&Math.abs(core.cx)<2&&Math.abs(core.cy)<2,'Monitor mark remains bounded and centered: '+JSON.stringify(core));assert.ok(await evaluate(`getComputedStyle(document.querySelector('.rating-hero')).backgroundImage==='none'`));await shot('white-monitor');
 await click('Полезные приложения');assert.ok(await evaluate(`getComputedStyle(document.querySelector('.application-card')).backgroundImage==='none'`));await shot('white-apps');await checkDriverRecommendations('white-driver-recommendations');assert.ok(await evaluate(`getComputedStyle(document.querySelector('.driver-download-list>li')).backgroundImage==='none'`));await shot('white-drivers');
 await click('Твики');assert.ok(await evaluate(`['.power-first','.profile-card'].every(selector=>getComputedStyle(document.querySelector(selector)).backgroundImage==='none')`));await shot('ivory-tweaks');
 await click('Игровая оптимизация');await waitStage(['snow-orbit']);assert.equal((await animation()).variant,'snowflake');assert.equal((await animation()).snowflakeArms,'6');assert.equal((await animation()).coreDark,'true');assert.equal((await animation()).needleCount,undefined,'The helmet and needle renderer is removed');assert.equal(await evaluate(`getComputedStyle(document.querySelector('.emblem-logo')).color`),'rgb(242, 251, 255)','Logo stays readable inside the snowflake centre');await shot('white-gaming');
 if(process.env.GTM_CAPTURE_SNOW){
  const frames=process.env.GTM_CAPTURE_SNOW;fs.mkdirSync(frames,{recursive:true});
  const clip=await evaluate(`(()=>{const c=document.querySelector('.emblem-logo').getBoundingClientRect();return{x:c.x+c.width/2-190+scrollX,y:c.y+c.height/2-190+scrollY,width:380,height:380,scale:1}})()`);
  const start=Date.now();for(let i=0;i<48;i++){await delay(Math.max(0,start+i*125-Date.now()));const shot=await send('Page.captureScreenshot',{format:'png',clip,captureBeyondViewport:true});fs.writeFileSync(path.join(frames,'frame-'+String(i).padStart(3,'0')+'.png'),Buffer.from(shot.data,'base64'))}
 }
 const spin=await animation();await delay(250);assert.notEqual((await animation()).angle,spin.angle,'Snowflake light rotates with Windows motion disabled');
 await evaluate(`window.__outcome='error';document.querySelector('.game-optimize').click()`);await delay(350);assert.ok(['particles','snow-gather'].includes((await animation()).stage));await waitFor(`[...document.querySelectorAll('.game-animation,.game-animation-front')].some(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=0;i<p.length;i+=4)if(p[i+3]>30&&p[i+2]>225)return true;return false})`,'Visible white button particles in the light theme');await shot('snow-particles');await delay(2800);assert.equal((await animation()).stage,'snow-gather','Success bloom waits for the actual native result');await evaluate(`window.__finish()`);await waitStage(['error']);await waitFor(`[...document.querySelectorAll('.game-animation,.game-animation-front')].every(c=>{const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;for(let i=3;i<p.length;i+=4)if(p[i])return false;return true})`,'Failure fades snowflake light');
 await evaluate(`window.__outcome='cancelled';document.querySelector('.game-optimize').click()`);await delay(150);await evaluate(`window.__finish()`);await waitStage(['idle']);assert.equal((await animation()).coreDark,'false');
 await evaluate(`window.__outcome=null;document.querySelector('.game-optimize').click()`);await delay(300);await originMatches();await evaluate(`window.__finish()`);await waitStage(['snow-bloom','snow-orbit']);assert.equal(await evaluate(`document.querySelector('.game-optimize').textContent.trim()`),'Игра оптимизирована');await waitStage(['snow-orbit']);await shot('snow-success');
 await delay(2400);
 const snowPixels=()=>evaluate(`(()=>{const c=document.querySelector('.game-animation'),p=c.getContext('2d'),[x,y]=c.dataset.target.split(',').map(Number),scale=c.width/c.getBoundingClientRect().width,hash=bytes=>{let h=2166136261;for(const b of bytes)h=Math.imul(h^b,16777619)>>>0;return h};return{core:hash(p.getImageData(Math.round((x-28)*scale),Math.round((y-28)*scale),Math.round(56*scale),Math.round(56*scale)).data),scene:hash(p.getImageData(0,0,c.width,c.height).data)}})()`);
 const beforeSnow=await snowPixels();await delay(600);const afterSnow=await snowPixels();assert.equal(afterSnow.core,beforeSnow.core,'The optical centre stays still');assert.notEqual(afterSnow.scene,beforeSnow.scene,'The snowflake branches actually move');
 await evaluate(`window.dispatchEvent(new Event('blur'))`);const frozenSnow=await animation();await delay(150);assert.equal((await animation()).angle,frozenSnow.angle,'Snowflake effect pauses outside the app');await evaluate(`window.dispatchEvent(new Event('focus'))`);
 await click('Полезные приложения');const hiddenSnow=await animation();await delay(150);assert.equal((await animation()).angle,hiddenSnow.angle,'Hidden snowflake animation stops');await click('Игровая оптимизация');await delay(200);assert.notEqual((await animation()).angle,hiddenSnow.angle,'Snowflake effect resumes on return');

 if(await evaluate(`localStorage.getItem('lagophone-effects')==='off'`))await evaluate(`(async()=>{await window.__testToggleEffects()})()`);await delay(120);
 assert.equal(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`),true);
 await waitFor(`document.querySelector('.theme-atmosphere').dataset.motion==='true'&&getComputedStyle(document.querySelector('.snowfall')).animationPlayState==='running'`,'White wallpaper running');await evaluate(`Promise.all(document.querySelector('.snowfall').getAnimations().map(animation=>animation.ready)).then(()=>true)`);
 assert.equal(await evaluate(`document.querySelectorAll('.snowfall').length`),54);assert.equal(await evaluate(`document.querySelector('.theme-atmosphere').dataset.weather`),'snow');
 const drift=await evaluate(`getComputedStyle(document.querySelector('.snowfall')).transform`);await waitFor(`getComputedStyle(document.querySelector('.snowfall')).transform!==${JSON.stringify(drift)}`,'Living wallpaper moves independently of Windows motion');
 await evaluate(`window.dispatchEvent(new Event('blur'))`);await waitFor(`document.querySelector('.theme-atmosphere').dataset.motion==='false'&&getComputedStyle(document.querySelector('.snowfall')).animationPlayState==='paused'`,'Wallpaper paused state');await evaluate(`Promise.all(document.querySelector('.snowfall').getAnimations().map(animation=>animation.ready)).then(()=>true)`);const still=await evaluate(`document.querySelector('.snowfall').getAnimations()[0].currentTime`);await delay(150);assert.equal(await evaluate(`document.querySelector('.snowfall').getAnimations()[0].currentTime`),still,'Wallpaper timeline stops when unfocused');await evaluate(`window.dispatchEvent(new Event('focus'))`);
 await evaluate(`(async()=>{await window.__testToggleEffects()})()`);await delay(100);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.snowfall')).animationPlayState`),'paused');
 assert.equal(await evaluate(`document.querySelectorAll('.ambient-stars').length`),0,'White theme has its own snowfall wallpaper');
 await evaluate(`(async()=>{await window.__testTheme('black');await window.__testToggleEffects()})()`);await delay(150);
 assert.ok(await evaluate(`!!document.querySelector('.star-depth')&&!document.querySelector('.snowfall')`));await waitStage(['orbit']);assert.equal((await animation()).variant,'singularity','Dark theme keeps the black hole');
 await waitFor(`document.querySelector('.theme-atmosphere').dataset.motion==='true'&&getComputedStyle(document.querySelector('.star-depth')).animationPlayState==='running'`,'Black wallpaper running');const stars=await evaluate(`getComputedStyle(document.querySelector('.star-depth')).transform`);await waitFor(`getComputedStyle(document.querySelector('.star-depth')).transform!==${JSON.stringify(stars)}`,'Black stars move with Windows motion disabled');assert.equal(await evaluate(`document.querySelectorAll('.shooting-star').length`),7);
 await evaluate(`window.dispatchEvent(new Event('blur'))`);await waitFor(`getComputedStyle(document.querySelector('.shooting-star')).animationPlayState==='paused'`,'Meteors pause when unfocused');await evaluate(`window.dispatchEvent(new Event('focus'))`);
 await evaluate(`window.__activityItems=[
 {id:'game',kind:'apply',title:'Настройка Dota 2',detail:'Done',status:'success',at:'2026-11-01T10:00:00Z',target:{page:'gaming',game:'dota2'}},
 {id:'legacy',kind:'apply',title:'Игровые настройки применены',detail:'Legacy entry',status:'success',at:'2026-11-01T09:00:00Z'},
 {id:'power',kind:'power',title:'Изменён план питания',detail:'Done',status:'success',at:'2026-11-01T08:00:00Z',target:{page:'tweaks',section:'power'}},
 {id:'tools',kind:'windows',title:'Выполнено действие Windows',detail:'Done',status:'success',at:'2026-11-01T07:00:00Z'},
 {id:'download',kind:'download',title:'Скачан установщик',detail:'Done',status:'success',at:'2026-11-01T06:00:00Z'}];window.__actions=[];window.lagophone.action=async(id,version)=>{window.__actions.push({id,version});return 'Opened once'}`);
 const requests=await evaluate(`window.__requests.length`);
 const visit=async title=>{
  await evaluate(`window.scrollTo(0,0);document.querySelector('[aria-label^="Недавние действия"]').click()`);await waitFor(`document.querySelectorAll('.activity-go').length===5`,'History destinations');
  await evaluate(`(()=>{const row=[...document.querySelectorAll('.activity-list article')].find(e=>e.querySelector('h4').textContent===${JSON.stringify(title)});row.querySelector('.activity-go').click()})()`);await delay(250);assert.equal(await evaluate(`!!document.querySelector('.activity-panel')`),false);
 };
 await visit('Настройка Dota 2');await waitFor(`document.querySelector('.game-launcher h2').textContent==='Dota 2'`,'Activity game selection');assert.equal(await evaluate(`document.querySelector('main').dataset.page`),'gaming');
 await evaluate(`document.querySelector('.game-optimize').click();window.__activityItems[0].title='Настройка Fortnite';window.__activityItems[0].target.game='fortnite'`);await delay(100);await visit('Настройка Fortnite');assert.equal(await evaluate(`document.querySelector('.game-launcher h2').textContent`),'Dota 2','History must not switch the operation context while it is running');await evaluate(`window.__finish()`);await waitFor(`document.querySelector('.game-launcher h2').textContent==='Fortnite'`,'Queued history game after completion');
 await visit('Игровые настройки применены');assert.equal(await evaluate(`document.querySelector('main').dataset.page`),'gaming');
 await visit('Изменён план питания');assert.equal(await evaluate(`document.querySelector('main').dataset.page`),'tweaks');assert.ok(await evaluate(`(()=>{const e=document.querySelector('.power-first').getBoundingClientRect();return e.top>34&&e.bottom<innerHeight})()`),'Power notification scrolls to its section');
 await visit('Выполнено действие Windows');assert.equal(await evaluate(`document.querySelector('.manual-tools').open`),true);
 await evaluate(`document.querySelector('[data-action-id="apps"] button').click()`);await waitFor(`!!document.querySelector('#action-title')`,'Styled action confirmation');assert.equal(await evaluate(`window.__actions.length`),0);await evaluate(`document.querySelector('[aria-labelledby="action-title"] .primary').click()`);await waitFor(`window.__actions.length===1&&!document.querySelector('#action-title')`,'Single confirmed action');assert.equal(await evaluate(`window.__actions[0].id`),'apps');
 await visit('Скачан установщик');assert.equal(await evaluate(`document.querySelector('main').dataset.page`),'apps');assert.equal(await evaluate(`window.__requests.length`),requests+1,'History navigation never reapplies settings');assert.equal(await evaluate(`window.__actions.length`),1,'History navigation does not repeat system actions');
 await evaluate(`window.scrollTo(0,0);document.querySelector('[aria-label^="Недавние действия"]').click()`);await waitFor(`!!document.querySelector('.activity-go')`,'History screenshot');await shot('notifications-with-navigation');
 await evaluate(`(async()=>{await window.__testTheme('white');document.querySelector('.os-selector').click()})()`);await waitFor(`!!document.querySelector('.welcome')`,'Light welcome');assert.ok(await evaluate(`getComputedStyle(document.querySelector('.os-card')).backgroundImage==='none'`));await shot('ivory-welcome');
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'no-preference'}]});await delay(80);await selectWindows(1,'windows-11-light');await click('Система');await evaluate(`window.scrollTo(0,0)`);await shot('ivory-system');
 await click('Игровая оптимизация');await click('Выбрать другую игру');await evaluate(`document.querySelector('[aria-label="Выбрать Dota 2"]').click()`);await waitStage(['snow-orbit']);await shot('snow-dota');

 // Navigation and bridge contain only the remaining sections.
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('aside nav button')].map(b=>b.textContent.trim())`),['Система','Мониторинг','Твики','Игровая оптимизация','Блокировки','Полезные приложения','Приложения и драйверы']);
 assert.equal(await evaluate(`Object.keys(window.lagophone).some(key=>key.startsWith('gamePing'))`),false);
 console.log('PASS: real FPS session UI, empty startup, detected game, average/1% low/max, duration, weekly graph gaps, full disable and general settings; iridescent Tweaks filling, glow and rare glove; Secure Boot/TPM and existing Windows selection, themes, game animations, dialogs, drivers and activity regressions');
})().catch(e=>{console.error(e);if(process.env.GITHUB_ACTIONS)console.log('::error title=Browser assertion details::'+String(e.stack||e).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));process.exitCode=1}).finally(()=>{clearTimeout(deadline);ws?.close();browser.kill('SIGKILL');server.kill();console.log('Browser snapshots: '+output)});
