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
const deadline=setTimeout(()=>{console.error('UI validation timed out; output: '+output);browser.kill('SIGKILL');server.kill();process.exit(1)},150000);
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
 const waitFor=async(expression,label)=>{
  for(let i=0;i<100;i++){
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
 const hardware={demo:false,version:'11',build:'26100',cpu:'AMD Ryzen 5 5600X',gpu:['NVIDIA GeForce RTX 3060'],gpuDrivers:[{name:'NVIDIA GeForce RTX 3060',version:'580.0'}],board:'B550',ram:32,disks:[]};
 const {buildDriverCatalog}=await import(pathToFileURL(path.join(root,'shared/drivers.mjs')).href);
 const categories=buildDriverCatalog(hardware,'11');
 const empty={ok:true,active:false,remaining:0,checks:[],savedGames:[],appliedTargets:[],windows:{version:'11',build:26100}};
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`
 window.__game=JSON.parse(sessionStorage.getItem('game-test')||'null')||${JSON.stringify(empty)};window.__paths={cs2:'C:/Games/cs2.exe',dota2:'D:/Dota/dota2.exe',deadlock:'D:/Deadlock/DeadlockClient.exe',fortnite:'C:/Games/FortniteClient.exe'};window.__requests=[];
 if(!sessionStorage.getItem('theme-migration-checked')){localStorage.setItem('lagophone-theme','purple');sessionStorage.setItem('theme-migration-checked','1')}
 window.lagophone={windowChrome:sessionStorage.getItem('test-window-chrome')==='true',setWindowTheme:async theme=>{window.__windowTheme=theme},system:async()=>(${JSON.stringify(hardware)}),onProgress:()=>()=>{},activities:async()=>({items:window.__activityItems||[],warning:''}),restartStatus:async()=>({pending:false}),optimizationStatus:async()=>({ok:true,active:true,needsRecovery:true,remaining:1,checks:[],windows:{version:'11',build:26100}}),powerOptimizationStatus:async()=>({...${JSON.stringify(empty)},power:'381b4222-f694-41f0-9685-ff5bb260df2e',plans:{balanced:true,lagophone:true}}),gameOptimizationStatus:async()=>window.__game,
 chooseGame:async id=>window.__paths[id],chooseOtherGame:async()=>{const id='custom-'+(window.__game.savedGames.some(g=>g.id.startsWith('custom-'))?'b':'a').repeat(32),gamePath='E:/My Games/'+(id.includes('aaaa')?'FirstGame.exe':'SecondGame.exe');window.__paths[id]=gamePath;return{id,name:gamePath.split('/').at(-1).replace('.exe',''),gamePath}},
 optimize:async input=>{window.__requests.push(input);window.__game={...window.__game,running:true,operation:{mode:'apply',phase:'windows'}};return new Promise((resolve,reject)=>window.__finish=()=>{if(window.__outcome){window.__game={...window.__game,running:false,operation:null};if(window.__outcome==='throw'){reject(Error('native test failure'));return}resolve({ok:window.__outcome==='cancelled',cancelled:window.__outcome==='cancelled',report:[],error:window.__outcome==='error'?'Native operation failed':undefined});return}const gamePath=window.__paths[input.game];window.__game={...window.__game,active:true,running:false,operation:null,savedGames:[...window.__game.savedGames.filter(g=>g.id!==input.game),{id:input.game,gamePath}],appliedTargets:[...window.__game.appliedTargets.filter(t=>t.gamePath!==gamePath),...['game-gpu','game-priority'].map(id=>({id,gamePath,enabled:true}))]};sessionStorage.setItem('game-test',JSON.stringify(window.__game));resolve({ok:true,report:[{id:'game-priority',status:'applied',message:'High verified'}]})})},
 installedApps:async()=>({ok:true,apps:{discord:{name:'Discord',version:'1.0',source:'registry'},'nvidia-app':{name:'NVIDIA App',version:'11.0',source:'registry'}}}),driverCatalog:async()=>(${JSON.stringify(categories)}),open:async id=>{window.__opened=id},openDriver:async()=>{}};
 `});
 await send('Storage.clearDataForOrigin',{origin,storageTypes:'local_storage'});
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:origin+'/'});
 await waitFor(`!!document.querySelector('.welcome-emblem')`,'Welcome screen');
 await evaluate(`document.body.offsetHeight;document.fonts.ready.then(()=>true)`);
 assert.equal(await evaluate(`document.body.textContent.includes('PC UTILITY')`),false);
 assert.ok(await evaluate(`!!document.querySelector('.welcome-emblem')`),await evaluate(`document.body.innerText.slice(0,2500)`));
 assert.equal(await evaluate(`document.documentElement.dataset.theme`),'black','Legacy colour themes migrate to black');
 assert.deepEqual(await evaluate(`[...document.querySelector('[aria-label="Цветовая тема"]').options].map(option=>option.value)`),['black','white']);
 assert.ok((await evaluate(`document.body.textContent`)).includes('GTM PC'));
 assert.ok((await evaluate(`document.body.textContent`)).includes('Get The Most of PC'));
 const mark=await evaluate(`(()=>{const a=document.querySelector('.welcome-emblem .brand-mark').getBoundingClientRect();return{x:a.x+a.width/2,width:a.width}})()`);
 assert.ok(mark.width>=140);assert.ok(Math.abs(mark.x-(await evaluate(`document.documentElement.clientWidth`))/2)<3,'Large emblem is centered in the content area: '+JSON.stringify(mark));
 fs.writeFileSync(path.join(output,'welcome.png'),Buffer.from((await send('Page.captureScreenshot',{format:'png'})).data,'base64'));
 await send('Emulation.setDeviceMetricsOverride',{width:960,height:680,deviceScaleFactor:1,mobile:false});
 assert.ok(await evaluate(`(()=>{const b=document.querySelectorAll('.os-card')[1].getBoundingClientRect();return b.bottom<680})()`),'OS cards remain visible in the minimum window');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:1,mobile:false});
 await evaluate(`document.querySelectorAll('.os-card')[1].click()`);await delay(400);await click('Игровая оптимизация');
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
 const firstDisk=await diskDepth();let diskYaw=firstDisk.yaw,depthChecks=firstDisk.back.length?1:0;
 for(let i=0;i<3;i++){
  await delay(800);const next=await diskDepth();
  assert.ok(next.yaw-diskYaw>.3,'Only the outer disk must rotate in 3D');diskYaw=next.yaw;
  assert.equal(next.coreSignature,firstDisk.coreSignature,'The central horizon must remain pixel-for-pixel stationary');
  if(next.back.length)depthChecks++;
  await shot('disk-depth-'+i);
 }
 assert.ok(depthChecks>=2,'Check front/back occlusion at multiple non-edge-on orientations');

 await evaluate(`document.querySelector('.effects-toggle').click();document.querySelector('[aria-label="Цветовая тема"]').value='black';document.querySelector('[aria-label="Цветовая тема"]').dispatchEvent(new Event('change',{bubbles:true}))`);await delay(200);
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
 await evaluate(`document.querySelector('[aria-label="Цветовая тема"]').value='white';document.querySelector('[aria-label="Цветовая тема"]').dispatchEvent(new Event('change',{bubbles:true}));sessionStorage.setItem('test-window-chrome','true')`);await delay(150);
 const beforeWhiteReload=await evaluate(`performance.timeOrigin`);await send('Page.reload');await waitFor(`performance.timeOrigin!==${beforeWhiteReload}&&!!document.querySelector('.app-shell')&&document.documentElement.dataset.theme==='white'&&document.documentElement.dataset.desktop==='true'&&window.__windowTheme==='white'`,'White desktop view');
 assert.equal(await evaluate(`document.documentElement.dataset.theme`),'white','White theme survives restart');
 assert.equal(await evaluate(`document.documentElement.dataset.desktop`),'true');
 assert.equal(await evaluate(`document.querySelector('.desktop-titlebar').getBoundingClientRect().height`),34);
 assert.equal(await evaluate(`document.querySelector('.desktop-titlebar').textContent`),'');assert.equal(await evaluate(`document.querySelector('.desktop-titlebar').children.length`),0);
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('.desktop-titlebar')).getPropertyValue('-webkit-app-region')`),'drag');
 assert.equal(await evaluate(`window.__windowTheme`),'white','Native controls receive the selected theme');
 await click('Система');await evaluate(`window.scrollTo(0,document.body.scrollHeight)`);await delay(100);
 const footer=await evaluate(`(()=>{const end=document.querySelector('.workspace-end').getBoundingClientRect(),cards=document.querySelector('.bottom-cards').getBoundingClientRect();return{space:end.bottom-cards.bottom,text:document.querySelector('.workspace-end').textContent}})()`);
 assert.ok(footer.space>=60&&footer.space<=90,JSON.stringify(footer));assert.equal(footer.text,'');
 const contrasts=await evaluate(`(()=>{const linear=c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4,lum=rgb=>rgb.slice(0,3).map(x=>linear(x/255)).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0),rgb=s=>s.match(/[0-9.]+/g).map(Number);return ['.hardware-card h3','.hardware-detail>span','.safe-card p'].map(selector=>{const e=document.querySelector(selector),c=getComputedStyle(e).color,bg=getComputedStyle(e.closest('.hardware-card,.safe-card')).backgroundColor,a=lum(rgb(c)),b=lum(rgb(bg));return{selector,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)}})})()`);
 for(const value of contrasts)assert.ok(value.ratio>=4.5,'White theme text contrast: '+JSON.stringify(value));
 assert.equal(await evaluate(`getComputedStyle(document.documentElement,'::-webkit-scrollbar-button').display`),'none');
 await shot('white-system-footer');
 await click('Мониторинг');await delay(150);
 const core=await evaluate(`(()=>{const e=document.querySelector('.core-symbol .brand-mark').getBoundingClientRect(),parent=document.querySelector('.optimization-core>svg').getBoundingClientRect();return{size:e.width,cx:e.x+e.width/2-parent.x-parent.width/2,cy:e.y+e.height/2-parent.y-parent.height/2}})()`);
 assert.ok(core.size>=30&&core.size<=65&&Math.abs(core.cx)<2&&Math.abs(core.cy)<2,'Monitor mark remains bounded and centered: '+JSON.stringify(core));await shot('white-monitor');
 await click('Полезные приложения');await shot('white-apps');await click('Приложения и драйверы');await evaluate(`document.querySelector('.driver-category').click()`);await delay(100);await shot('white-drivers');await evaluate(`document.querySelector('[aria-label="Закрыть драйверы"]').click()`);
 await click('Игровая оптимизация');await waitStage(['orbit']);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.emblem-logo')).color`),'rgb(245, 247, 250)','White game logo remains readable on its dark core');await shot('white-gaming');
 if(await evaluate(`document.querySelector('.effects-toggle').getAttribute('aria-pressed')==='false'`))await evaluate(`document.querySelector('.effects-toggle').click()`);await delay(120);
 assert.equal(await evaluate(`matchMedia('(prefers-reduced-motion: reduce)').matches`),true);
 const drift=await evaluate(`getComputedStyle(document.querySelector('.white-ribbon')).transform`);await delay(250);assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.white-ribbon')).transform`),drift,'Living wallpaper moves independently of Windows motion');
 await evaluate(`window.dispatchEvent(new Event('blur'))`);await delay(100);const still=await evaluate(`getComputedStyle(document.querySelector('.white-ribbon')).transform`);await delay(150);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.white-ribbon')).transform`),still,'Wallpaper pauses when unfocused');await evaluate(`window.dispatchEvent(new Event('focus'))`);
 await evaluate(`document.querySelector('.effects-toggle').click()`);await delay(100);assert.equal(await evaluate(`getComputedStyle(document.querySelector('.white-ribbon')).animationPlayState`),'paused');
 assert.equal(await evaluate(`document.querySelectorAll('.ambient-stars').length`),0,'White theme has its own ribbon wallpaper');
 await evaluate(`document.querySelector('[aria-label="Цветовая тема"]').value='black';document.querySelector('[aria-label="Цветовая тема"]').dispatchEvent(new Event('change',{bubbles:true}));document.querySelector('.effects-toggle').click()`);await delay(150);
 assert.ok(await evaluate(`!!document.querySelector('.star-depth')&&!document.querySelector('.white-ribbon')`));
 const stars=await evaluate(`getComputedStyle(document.querySelector('.star-depth')).transform`);await delay(200);assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.star-depth')).transform`),stars,'Black stars move with Windows motion disabled');
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
 await visit('Игровые настройки применены');assert.equal(await evaluate(`document.querySelector('main').dataset.page`),'gaming');
 await visit('Изменён план питания');assert.equal(await evaluate(`document.querySelector('main').dataset.page`),'tweaks');assert.ok(await evaluate(`(()=>{const e=document.querySelector('.power-first').getBoundingClientRect();return e.top>34&&e.bottom<innerHeight})()`),'Power notification scrolls to its section');
 await visit('Выполнено действие Windows');assert.equal(await evaluate(`document.querySelector('.manual-tools').open`),true);
 await evaluate(`document.querySelector('[data-action-id="apps"] button').click()`);await waitFor(`!!document.querySelector('#action-title')`,'Styled action confirmation');assert.equal(await evaluate(`window.__actions.length`),0);await evaluate(`document.querySelector('[aria-labelledby="action-title"] .primary').click()`);await waitFor(`window.__actions.length===1&&!document.querySelector('#action-title')`,'Single confirmed action');assert.equal(await evaluate(`window.__actions[0].id`),'apps');
 await visit('Скачан установщик');assert.equal(await evaluate(`document.querySelector('main').dataset.page`),'apps');assert.equal(await evaluate(`window.__requests.length`),requests,'History navigation never reapplies settings');assert.equal(await evaluate(`window.__actions.length`),1,'History navigation does not repeat system actions');
 await evaluate(`window.scrollTo(0,0);document.querySelector('[aria-label^="Недавние действия"]').click()`);await waitFor(`!!document.querySelector('.activity-go')`,'History screenshot');await shot('notifications-with-navigation');
 console.log('PASS: matte white ribbons and black stars under disabled Windows motion; blank draggable titlebar; activity links including legacy records, selected game, power and manual tools; single styled confirmation; all earlier UI and layer regressions');
})().catch(e=>{console.error(e);if(process.env.GITHUB_ACTIONS)console.log('::error title=Browser assertion details::'+String(e.stack||e).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A'));process.exitCode=1}).finally(()=>{clearTimeout(deadline);ws?.close();browser.kill('SIGKILL');server.kill();console.log('Browser snapshots: '+output)});
