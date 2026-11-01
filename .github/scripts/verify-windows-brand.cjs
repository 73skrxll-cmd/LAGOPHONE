const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const metadata=require('../../package.json');
const executable=process.argv[2]||path.join('release','win-unpacked',metadata.build.productName+'.exe');
const iconFile=process.argv[3]||'assets/brand.ico',expectedName=process.argv[4]||metadata.build.productName;
const pe=fs.readFileSync(executable),ico=fs.readFileSync(iconFile),header=pe.readUInt32LE(0x3c);
assert.equal(pe.toString('ascii',header,header+4),'PE\0\0','Windows PE signature');
const optional=header+24,sectionTable=optional+pe.readUInt16LE(header+20),directory=optional+(pe.readUInt16LE(optional)===0x20b?112:96);
const sections=Array.from({length:pe.readUInt16LE(header+6)},(_,i)=>{const start=sectionTable+i*40;return {rva:pe.readUInt32LE(start+12),size:Math.max(pe.readUInt32LE(start+8),pe.readUInt32LE(start+16)),file:pe.readUInt32LE(start+20)}});
function offset(rva){const section=sections.find(section=>rva>=section.rva&&rva<section.rva+section.size);assert.ok(section,'Mapped PE resource address');return section.file+rva-section.rva}
const resources=offset(pe.readUInt32LE(directory+16));
const leaves=[];
function walk(relative,ids=[]){const start=resources+relative,count=pe.readUInt16LE(start+12)+pe.readUInt16LE(start+14);for(let i=0;i<count;i++){const entry=start+16+i*8,id=pe.readUInt32LE(entry),target=pe.readUInt32LE(entry+4);if(target&0x80000000)walk(target&0x7fffffff,[...ids,id]);else{const data=resources+target,begin=offset(pe.readUInt32LE(data)),length=pe.readUInt32LE(data+4);leaves.push({ids:[...ids,id],data:pe.subarray(begin,begin+length)})}}}
walk(0);
const images=leaves.filter(leaf=>leaf.ids[0]===3).map(leaf=>leaf.data);
assert.ok(images.length,'Embedded Windows icon resources');
for(let i=0;i<ico.readUInt16LE(4);i++){const entry=6+i*16,size=ico.readUInt32LE(entry+8),begin=ico.readUInt32LE(entry+12),frame=ico.subarray(begin,begin+size);assert.ok(images.some(image=>image.subarray(0,frame.length).equals(frame)),'Embedded app icon matches provided ICO frame '+i)}
const align=value=>(value+3)&~3,values={};
function versionBlock(buffer,start=0,limit=buffer.length){if(start+6>limit)return;const length=buffer.readUInt16LE(start);if(!length||start+length>limit)return;const end=start+length,valueLength=buffer.readUInt16LE(start+2),type=buffer.readUInt16LE(start+4);let cursor=start+6;while(cursor+1<end&&buffer.readUInt16LE(cursor)!==0)cursor+=2;const key=buffer.toString('utf16le',start+6,cursor);cursor=align(cursor+2);const bytes=type===1?valueLength*2:valueLength;if(type===1&&bytes)values[key]=buffer.toString('utf16le',cursor,cursor+bytes).replace(/\0+$/,'');cursor=align(cursor+bytes);while(cursor+6<=end){const childLength=buffer.readUInt16LE(cursor);if(!childLength)break;versionBlock(buffer,cursor,end);cursor=align(cursor+childLength)}}
for(const leaf of leaves.filter(leaf=>leaf.ids[0]===16))versionBlock(leaf.data);
assert.equal(values.ProductName,expectedName,'Product name embedded in the executable');
console.log('Verified Windows product name and all app-icon resolutions:',expectedName);
