const {test}=require('node:test'),assert=require('node:assert/strict');
const {buildSupportReport,logMarkers}=require('./ping-support.cjs');
const {epicLaunchUri,fortniteRoot,discoverGames}=require('./ping-games.cjs');
test('Epic URI comes from real manifest identity or documented installation-path activation; never Shipping.exe execution/auth arguments',()=>{
 const manifest={CatalogNamespace:'actual-namespace',CatalogItemId:'actual-item',AppName:'actual-artifact'};
 assert.equal(epicLaunchUri(manifest),'com.epicgames.launcher://apps/actual-namespace%3Aactual-item%3Aactual-artifact?action=launch&silent=true');
 const file='D:\\Fortnite\\Fortnite\\FortniteGame\\Binaries\\Win64\\FortniteClient-Win64-Shipping.exe';assert.equal(fortniteRoot(file),'D:\\Fortnite\\Fortnite');const uri=epicLaunchUri(null,fortniteRoot(file));assert.match(uri,/D%3A%5CFortnite%5CFortnite/);assert.equal(uri.includes('Shipping.exe'),false);assert.equal(uri.includes('AUTH_PASSWORD'),false);assert.throws(()=>epicLaunchUri({AppName:'Fortnite'}));
});
test('support export reconstructs allowed fields and cannot disclose raw log lines, profile keys, tokens, account IDs, names or paths',()=>{
 const secret='CANARY_PRIVATE_TOKEN_USERNAME';const state={settings:{gameId:'fortnite',manual:{fortnite:secret}},phase:'running',launchState:'process-detected',error:secret,tunnel:{profileReady:true,connected:true,country:'NL',key:secret,ip:secret},checks:[{gameId:'fortnite',mode:'tunnel',normal:'success',creative:'failure',raw:secret,country:'NL'}],latest:{at:secret,control:{address:'1.1.1.1',method:'icmp',samples:[{sequence:0,status:'timeout',rttMs:null,token:secret,at:secret}]},traffic:{rxMbps:1,txMbps:0}}};
 const report=buildSupportReport(state,{logs:[{kind:'fortnite',raw:secret,markers:{'matchmaking-error':1,[secret]:1}}],audit:{proxyServer:secret,defaultRoutes:[{gateway:secret,family:'IPv4',gtm:false}],virtualAdapters:[{name:secret,kind:'wireguard',up:true}]},epic:{token:secret,fortnite:'operational'},legacy:{secret}});
 assert.equal(JSON.stringify(report).includes(secret),false);assert.equal(report.launch.matchAutomaticallyVerified,false);assert.equal(report.checks[0].source,'user-report');assert.equal(report.measurement.control.samples[0].rttMs,null);
 const markers=logMarkers('HTTP 403 error oauth=SECRET\nMatchmaking error AccountId=SECRET\nTimed out token=SECRET');assert.deepEqual(markers,{'http-403':1,'matchmaking-error':1,'network-timeout':1});
});
test('RTT status and integer resolution survive timeout, locale strings, null and real sub-millisecond values',async()=>{
 const {formatRtt,summarizeEndpoint,normalizeTrial}=await import('../shared/ping-session.mjs');assert.equal(formatRtt(0),'<1 мс');assert.equal(formatRtt(.5),'<1 мс');assert.equal(formatRtt(13), '13 мс');assert.equal(formatRtt(null),'Нет данных');
 const trial={address:'1.1.1.1',method:'icmp',samples:[{sequence:0,status:'success',rttMs:0},{sequence:1,status:'success',rttMs:null},{sequence:2,status:'timeout',rttMs:0},{sequence:3,status:'success',rttMs:'0,5'}]};const normalized=normalizeTrial(trial);assert.deepEqual(normalized.samples.map(x=>x.rttMs),[0,null,null,null]);const summary=summarizeEndpoint(trial);assert.equal(summary.received,1);assert.equal(summary.medianMs,0);assert.equal(formatRtt(summary.medianMs),'<1 мс');
});
