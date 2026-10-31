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
