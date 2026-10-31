const finite=value=>value===null||value===undefined||value===''||!Number.isFinite(Number(value))||Number(value)<0?null:Number(value);
const percent=value=>finite(value)===null?null:Math.min(100,Number(value));
const mib=value=>finite(value)===null?null:Number(value)*1024*1024;
function csv(line){const fields=[];let text='',quoted=false;for(let i=0;i<line.length;i++){const c=line[i];if(c==='"'){if(quoted&&line[i+1]==='"'){text+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){fields.push(text.trim());text=''}else text+=c}fields.push(text.trim());return fields}
function parseNvidia(output=''){
 return output.split(/\r?\n/).filter(Boolean).map(csv).filter(row=>row.length===9&&/^\d+$/.test(row[0])).map(row=>({id:'nvidia-'+row[0],name:row[1],clockMHz:finite(row[2]),memoryClockMHz:finite(row[3]),memoryTotalBytes:mib(row[4]),memoryUsedBytes:mib(row[5]),usagePercent:percent(row[6]),temperatureC:finite(row[7]),powerWatts:finite(row[8]),source:'nvidia'}));
}
function normalizeSample(raw={},nvidia='',at=Date.now()){
 const total=finite(raw.memory?.totalBytes),reportedFree=finite(raw.memory?.freeBytes),free=total!==null&&reportedFree!==null?Math.min(total,reportedFree):reportedFree;
 const native=parseNvidia(nvidia),adapters=[...native];
 for(const row of Array.isArray(raw.adapters)?raw.adapters:[]){if(typeof row.name!=='string'||native.some(g=>g.name.toLowerCase().replace(/^nvidia\s+/,'')===row.name.toLowerCase().replace(/^nvidia\s+/,'')))continue;adapters.push({id:'windows-'+adapters.length,name:row.name,clockMHz:null,memoryClockMHz:null,memoryTotalBytes:finite(row.memoryTotalBytes),memoryUsedBytes:null,usagePercent:null,temperatureC:null,powerWatts:null,source:'windows'})}
 if(adapters.length===1&&adapters[0].source==='windows'&&raw.gpuWindows?.adapterCount===1){adapters[0].memoryUsedBytes=finite(raw.gpuWindows.dedicatedUsedBytes);adapters[0].usagePercent=percent(raw.gpuWindows.usagePercent)}
 for(const gpu of adapters){gpu.memoryFreeBytes=gpu.memoryTotalBytes!==null&&gpu.memoryUsedBytes!==null?Math.max(0,gpu.memoryTotalBytes-gpu.memoryUsedBytes):null}
 return {available:true,at,cpu:{usagePercent:percent(raw.cpu?.usagePercent),clockMHz:finite(raw.cpu?.clockMHz),clockSource:raw.cpu?.clockSource||null},memory:{totalBytes:total,freeBytes:free,usedBytes:total!==null&&free!==null?total-free:null},disk:{readBytesPerSecond:finite(raw.disk?.readBytesPerSecond),writeBytesPerSecond:finite(raw.disk?.writeBytesPerSecond)},network:(Array.isArray(raw.network)?raw.network:[]).filter(n=>typeof n.name==='string').map(n=>({name:n.name,receiveBytesPerSecond:finite(n.receiveBytesPerSecond),sendBytesPerSecond:finite(n.sendBytesPerSecond)})),gpu:{adapters,usagePercent:percent(raw.gpuWindows?.usagePercent),dedicatedUsedBytes:finite(raw.gpuWindows?.dedicatedUsedBytes),sharedUsedBytes:finite(raw.gpuWindows?.sharedUsedBytes)}};
}
function createMonitor({load,now=Date.now,minInterval=5000}){
 let pending=null,last=null;
 return {sample(){if(pending)return pending;if(last&&now()-last.at<minInterval)return Promise.resolve(last);const request=Promise.resolve().then(load).then(value=>{last={...value,at:now()};return last}).finally(()=>{if(pending===request)pending=null});pending=request;return request}};
}
module.exports={normalizeSample,parseNvidia,createMonitor};
