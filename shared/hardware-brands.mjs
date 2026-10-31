const rules=[
 ['amd','AMD',/\bAMD\b|\bRyzen\b|\bRadeon\b/i],
 ['intel','Intel',/\bIntel\b/i],
 ['nvidia','NVIDIA',/\bNVIDIA\b|\bGeForce\b/i],
 ['asrock','ASRock',/\bASRock\b/i],
 ['asus','ASUS',/\bASUS\b|ASUSTeK/i],
 ['msi','MSI',/\bMSI\b|Micro[- ]Star/i],
 ['gigabyte','GIGABYTE',/\bGIGABYTE\b|\bAORUS\b/i],
 ['samsung','SAMSUNG',/\bSamsung\b/i],
 ['kingstontechnology','Kingston',/\bKingston\b/i],
 ['hyperx','HyperX',/\bHyperX\b/i],
 ['corsair','CORSAIR',/\bCorsair\b/i],
 ['crucial','crucial',/\bCrucial\b/i],
 ['sandisk','SanDisk',/\bSanDisk\b/i],
 ['western-digital','WD',/Western Digital|\bWDC\b|\bWD[_ -]/i],
 ['seagate','SEAGATE',/\bSeagate\b/i],
 ['xpg','XPG',/\bXPG\b/i],
 ['adata','ADATA',/\bADATA\b/i],
 ['gskill','G.SKILL',/G[. ]?Skill/i],
 ['micron','micron',/\bMicron\b/i],
 ['skhynix','SK hynix',/\bSK ?hynix\b|\bhynix\b/i],
];
export function hardwareBrands(system={}){
 const result=[];
 const add=(category,value)=>{
  if(typeof value!=='string'||!value.trim())return;
  const rule=rules.find(([, ,pattern])=>pattern.test(value));if(!rule)return;
  const [id,name]=rule,key=id+':'+category;
  const existing=result.find(item=>item.key===key);
  if(existing){if(!existing.models.includes(value))existing.models.push(value);return}
  result.push({key,id,name,category,models:[value],series:category==='Процессор'&&id==='amd'&&/\bRyzen\b/i.test(value)?'RYZEN':category==='Видеокарта'&&id==='amd'?'RADEON':''});
 };
 add('Процессор',system.cpu);
 // A chipset name alone does not identify the board manufacturer.
 add('Материнская плата',[system.vendor,system.board].filter(v=>typeof v==='string').join(' '));
 for(const gpu of Array.isArray(system.gpu)?system.gpu:[])add('Видеокарта',gpu);
 for(const memory of Array.isArray(system.memory)?system.memory:[])add('Память',memory?.manufacturer);
 for(const disk of Array.isArray(system.disks)?system.disks:[])add('Накопитель',[disk?.manufacturer,disk?.name].filter(v=>typeof v==='string').join(' '));
 return result.slice(0,8);
}
