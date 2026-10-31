export function supportsWindows(item,version,build){
 if(!['10','11'].includes(version)||!(item.windows||['10','11']).includes(version))return false;
 if(build!==undefined&&build!==null){
  if(!Number.isInteger(build)||build<10240||(build>=22000?'11':'10')!==version)return false;
  if(item.minBuild&&build<item.minBuild||item.maxBuild&&build>item.maxBuild)return false;
 }
 return true;
}
export function forWindows(items,version,build){
 return items.filter(item=>supportsWindows(item,version,build)).map(item=>({...item,...item.variants?.[version]}));
}
