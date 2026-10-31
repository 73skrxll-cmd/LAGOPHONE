const {test}=require('node:test');
const assert=require('node:assert/strict');
const system={cpu:'AMD Ryzen 5 5600X',gpu:['NVIDIA RTX 3060'],board:'B550 AORUS ELITE V2',vendor:'Gigabyte Technology',network:[{name:'Realtek PCIe GbE'}],disks:[{name:'Samsung SSD 970 EVO'}]};
test('driver dialog has separate categories and the chipset link matches the board instead of the GPU',async()=>{
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
