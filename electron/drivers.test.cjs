const {test}=require('node:test');
const assert=require('node:assert/strict');
const system={cpu:'AMD Ryzen 5 5600X',gpu:['NVIDIA RTX 3060'],board:'B550 AORUS ELITE V2',vendor:'Gigabyte Technology',network:[{name:'Realtek PCIe GbE'}],disks:[{name:'Samsung SSD 970 EVO'}]};
test('driver catalog has separate categories and the chipset link matches the board instead of the GPU',async()=>{
 const {buildDriverCatalog}=await import('../shared/drivers.mjs');
 const data=buildDriverCatalog(system,'11');
 assert.equal(data.length,7);
 const chip=data.find(c=>c.id==='chipset');assert.ok(chip.links.some(l=>l.url.includes('/am4/b550.html')));
 assert.ok(chip.links.some(l=>l.kind==='model'&&l.url.includes(encodeURIComponent(system.board))));
 assert.equal(data.find(c=>c.id==='network').links.some(l=>l.id.includes('intel-wifi')),false);
 assert.equal(data.find(c=>c.id==='bluetooth').links.some(l=>l.id.includes('intel-bluetooth')),false);
});
test('Intel network and Bluetooth links require actual matching adapters',async()=>{
 const {buildDriverCatalog}=await import('../shared/drivers.mjs');
 const unknown=buildDriverCatalog({...system,cpu:'Intel i7'},'10');
 assert.equal(unknown.find(c=>c.id==='network').links.some(l=>l.id.includes('intel')),false);
 const known=buildDriverCatalog({...system,network:[{name:'Intel Wi-Fi',hardwareId:'PCI\\VEN_8086'}],bluetooth:[{name:'Intel Bluetooth',hardwareId:'USB\\VID_8087'}]},'10');
 assert.ok(known.find(c=>c.id==='network').links.some(l=>l.id.includes('intel-wifi')));
 assert.ok(known.find(c=>c.id==='bluetooth').links.some(l=>l.id.includes('intel-bluetooth')));
});
test('unknown board does not fabricate a chipset or revision; links remain HTTPS on official hosts',async()=>{
 const {buildDriverCatalog}=await import('../shared/drivers.mjs');
 const data=buildDriverCatalog({cpu:'AMD Ryzen',board:'Unknown'},'11');
 assert.equal(data.find(c=>c.id==='chipset').links.some(l=>l.url.includes('/am4/')),false);
 assert.equal(data[0].boardRevision,null);
 for(const c of [...data,...buildDriverCatalog(system,'11')])for(const l of c.links){
  const u=new URL(l.url);assert.equal(u.protocol,'https:');assert.ok(/(nvidia\.com|amd\.com|intel\.com|gigabyte\.com|samsung\.com|aka\.ms|microsoft\.com)$/.test(u.hostname));
 }
 assert.throws(()=>buildDriverCatalog(system,'12'));
});
test('recommendations merge repeated board pages, use one GPU source and preserve distinct runtimes',async()=>{
 const {buildDriverCatalog,buildDriverRecommendations}=await import('../shared/drivers.mjs');
 const catalog=buildDriverCatalog({...system,audio:[{name:'Realtek Audio'}]},'10');
 const list=buildDriverRecommendations(catalog);
 assert.equal(new Set(list.map(r=>r.link.url)).size,list.length);
 assert.ok(list[0].link.url.includes('/am4/b550.html'),'Chipset comes first');
 const board=list.filter(r=>r.link.url.includes('gigabyte.com'));
 assert.equal(board.length,1);assert.deepEqual(board[0].categories,['LAN и Wi-Fi','Звук']);
 assert.equal(list.filter(r=>r.categories.includes('Видеокарта')).length,1);
 assert.ok(list.some(r=>r.link.id.endsWith(':vcredist-x64')));
 assert.ok(list.some(r=>r.link.id.endsWith(':vcredist-x86')));
 assert.equal(list.find(r=>r.link.id.endsWith(':directx-runtime')).optional,true);
 assert.equal(list.some(r=>r.categories.includes('Bluetooth')),false,'No Bluetooth download without an adapter');
 assert.equal(list.filter(r=>r.categories.includes('Накопители / NVMe / RAID')).length,1,'Only detected Samsung utility, not a generic RAID driver');
 for(const r of list)assert.ok(catalog.some(c=>c.links.some(l=>l.id===r.link.id&&l.url===r.link.url)),'Every recommendation retains an allowed native catalog ID');
});
test('one Intel DSA download covers both GPU and network; absent SSD does not suggest storage packages',async()=>{
 const {buildDriverCatalog,buildDriverRecommendations}=await import('../shared/drivers.mjs');
 const list=buildDriverRecommendations(buildDriverCatalog({cpu:'Intel i7',gpu:['Intel UHD'],network:[{name:'Intel Wi-Fi'}]},'11'));
 const dsa=list.filter(r=>r.link.url.includes('dsadata.intel.com'));
 assert.equal(dsa.length,1);assert.deepEqual(dsa[0].categories,['LAN и Wi-Fi','Видеокарта']);
 assert.equal(list.some(r=>r.categories.includes('Накопители / NVMe / RAID')),false);
 assert.deepEqual(buildDriverRecommendations([]),[]);
});
test('hybrid graphics retain both vendors without suggesting NVIDIA App as a second driver',async()=>{
 const {buildDriverCatalog,buildDriverRecommendations}=await import('../shared/drivers.mjs');
 const list=buildDriverRecommendations(buildDriverCatalog({gpu:['NVIDIA RTX 4060','Intel UHD'],network:[{name:'Intel Wi-Fi'}]},'11'));
 const graphics=list.filter(r=>r.categories.includes('Видеокарта'));
 assert.equal(graphics.length,2);
 assert.ok(graphics.some(r=>r.link.id.endsWith(':nvidia-driver')));
 assert.ok(graphics.some(r=>r.link.url.includes('dsadata.intel.com')));
 assert.equal(list.some(r=>r.link.id.endsWith(':nvidia-app')),false);
});
