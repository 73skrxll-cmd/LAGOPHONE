import type {HardwareBrand} from '../shared/hardware-brands.mjs';
const marks=import.meta.glob<string>('../assets/brands/*.svg',{eager:true,query:'?url',import:'default'});
export function HardwareLogo({brand,compact=false}:{brand:HardwareBrand;compact?:boolean}){
 const source=marks[`../assets/brands/${brand.id}.svg`];
 return <div className={'hardware-logo logo-'+brand.id+(compact?' hardware-logo-compact':'')} role="img" aria-label={`${brand.category}: ${brand.name}${brand.series?' '+brand.series:''}`} title={`${brand.category} · ${brand.models.join(' / ')}`}>
  {source?<img src={source} alt=""/>:<span className="hardware-wordmark">{brand.name}</span>}{!compact&&brand.series&&<span className="hardware-series">{brand.series}</span>}
 </div>;
}
