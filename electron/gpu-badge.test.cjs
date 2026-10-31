const {test}=require('node:test');const assert=require('node:assert/strict');
test('PC GPU label follows the detected family, preferring discrete NVIDIA over integrated graphics',async()=>{
 const {gpuBadge}=await import('../shared/gpu-badge.mjs');
 assert.equal(gpuBadge(['Intel UHD Graphics','NVIDIA GeForce RTX 3060']).badge,'RTX');
 assert.equal(gpuBadge(['NVIDIA GeForce GTX 1660 SUPER']).badge,'GTX');
 assert.equal(gpuBadge(['AMD Radeon RX 6700 XT']).badge,'RX');
 assert.equal(gpuBadge(['Intel Arc A770']).badge,'ARC');
 assert.equal(gpuBadge(['AMD Radeon Graphics']).badge,'RADEON');
 assert.equal(gpuBadge(['NVIDIA TITAN']).badge,'NVIDIA');
 assert.equal(gpuBadge(['Microsoft Basic Display Adapter']).badge,'GPU');assert.equal(gpuBadge([]).badge,'GPU');
});
test('component logos use detected manufacturers and never guess from a chipset or generic memory name',async()=>{
 const {hardwareBrands}=await import('../shared/hardware-brands.mjs');
 const result=hardwareBrands({cpu:'AMD Ryzen 7 7800X3D',vendor:'ASRock',board:'B650M Pro RS',gpu:['NVIDIA GeForce GTX 1660 SUPER'],memory:[{manufacturer:'Kingston'},{manufacturer:'Kingston'}],disks:[{name:'Samsung SSD 970 EVO Plus'}]});
 assert.deepEqual(result.map(b=>b.id),['amd','asrock','nvidia','kingstontechnology','samsung']);
 assert.equal(result[0].series,'RYZEN');assert.equal(result[1].category,'Материнская плата');
 assert.deepEqual(hardwareBrands({cpu:'Unknown processor',board:'B550',memory:[{manufacturer:'Unknown'}],disks:[{name:'NVMe SSD'}]}),[]);
 assert.deepEqual(hardwareBrands({gpu:['Intel UHD Graphics','NVIDIA GeForce RTX 3060']}).map(b=>b.id),['intel','nvidia']);
 assert.equal(hardwareBrands({vendor:'Micro-Star International Co., Ltd.'})[0].id,'msi');
 assert.equal(hardwareBrands({cpu:'AMD FX-8350'})[0].series,'');
 assert.equal(hardwareBrands({disks:[{manufacturer:'Seagate',name:'ST1000DM010'}]})[0].id,'seagate');
 assert.equal(hardwareBrands({disks:[{name:'SanDisk SSD'}]})[0].name,'SanDisk');
});
