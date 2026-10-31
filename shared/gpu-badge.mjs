export function gpuBadge(names=[]){
 const adapters=Array.isArray(names)?names.filter(n=>typeof n==='string'&&n.trim()):[];
 const rtx=adapters.find(n=>/\bRTX\b/i.test(n));if(rtx)return {badge:'RTX',family:'GEFORCE / NVIDIA',name:rtx,kind:'rtx'};
 const gtx=adapters.find(n=>/\bGTX\b/i.test(n));if(gtx)return {badge:'GTX',family:'GEFORCE / NVIDIA',name:gtx,kind:'gtx'};
 const amd=adapters.find(n=>/radeon/i.test(n));if(amd)return {badge:/\bRX\b/i.test(amd)?'RX':'RADEON',family:'AMD RADEON',name:amd,kind:'radeon'};
 const arc=adapters.find(n=>/intel.*\barc\b/i.test(n));if(arc)return {badge:'ARC',family:'INTEL',name:arc,kind:'arc'};
 const intel=adapters.find(n=>/intel/i.test(n));if(intel)return {badge:'INTEL',family:'GRAPHICS',name:intel,kind:'intel'};
 const nv=adapters.find(n=>/nvidia|geforce/i.test(n));if(nv)return {badge:'NVIDIA',family:'GRAPHICS',name:nv,kind:'nvidia'};
 return {badge:'GPU',family:'GRAPHICS',name:adapters[0]||'Видеокарта не определена',kind:'unknown'};
}
