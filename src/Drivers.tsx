import {useEffect,useState} from 'react';
import {CheckCircle2, Cpu, Download, ExternalLink, HardDrive, Info, Layers3, Monitor, Radio, ShieldCheck, Volume2, Wifi} from 'lucide-react';
import {buildDriverCatalog,buildDriverRecommendations,type DriverCategory,type DriverLink} from '../shared/drivers.mjs';
import type {System} from './main';
import './drivers.css';
const icons={gpu:Monitor,chipset:Cpu,network:Wifi,audio:Volume2,bluetooth:Radio,storage:HardDrive,components:Layers3};
export function Drivers({system,version,installed={}}:{system:System;version:'10'|'11';installed?:Record<string,{name:string;version:string;source:string}>}){
 const [categories,setCategories]=useState<DriverCategory[]>(()=>buildDriverCatalog(system,version)),[message,setMessage]=useState('');
 useEffect(()=>{
  let active=true;setMessage('');setCategories(buildDriverCatalog(system,version));
  if(window.lagophone&&!system.demo)window.lagophone.driverCatalog(version).then(data=>{if(active)setCategories(data)}).catch(e=>{if(active)setMessage((e as Error).message)});
  return()=>{active=false};
 },[system,version]);
 const recommendations=buildDriverRecommendations(categories),boardRevision=categories.find(c=>c.boardRevision)?.boardRevision;
 function installedFor(link:DriverLink){const id=link.id.split(':').at(-1)||'';const key=id==='nvidia-app'?'nvidia-app':id.includes('dsa')?'intel-dsa':id==='amd-gpu'?'amd-software':id==='samsung-storage'?'samsung-magician':id;return installed[key]}
 async function open(link:DriverLink){try{setMessage('');if(window.lagophone&&!system.demo)await window.lagophone.openDriver(link.id,version);else window.open(link.url,'_blank','noopener,noreferrer')}catch(e){setMessage((e as Error).message)}}
 return <div className="driver-browser">
  <div className="restore-banner"><ShieldCheck size={29}/><div><h3>Драйверы для вашего ПК</h3><p>Windows {version} · {system.board||'Модель платы не определена'}</p></div></div>
  <div className="driver-hardware" aria-label="Обнаруженное оборудование">{categories.filter(c=>c.id!=='components').map(c=>{const Icon=icons[c.id as keyof typeof icons]||Cpu;return <div key={c.id}><Icon size={19}/><div><h3>{c.name}</h3><p>{c.device}</p>{c.installedDrivers?.map(driver=><small key={driver.name}>Установлен драйвер {driver.version}</small>)}</div></div>})}</div>
  <section className="driver-recommendations" aria-labelledby="driver-recommendations-title">
   <h2 id="driver-recommendations-title">Рекомендуем</h2>
   <p className="driver-guide">Если драйверы нужны, устанавливайте в этом порядке. Одна ссылка на каждый источник.</p>
   <ol className="driver-download-list">{recommendations.map(({link,categories:covered,optional},index)=><li key={link.url} data-url={link.url}>
    <span className="driver-step" aria-hidden="true">{index+1}</span><div className="driver-download-body"><span className="driver-scope">{covered.join(' · ')}{optional?' · По необходимости':''}</span><h3>{link.title}</h3>{installedFor(link)&&<p className="installed-badge"><CheckCircle2 size={13}/>Установлено{installedFor(link).version?` · ${installedFor(link).version}`:''}</p>}{link.note&&<p>{link.note}</p>}<span className="driver-domain">{new URL(link.url).hostname}</span></div>
    <button className="button primary-subtle" onClick={()=>void open(link)} aria-label={`${link.kind==='installer'?'Скачать':'Открыть'}: ${link.title}`}>{link.kind==='installer'?'Скачать':'Открыть сайт'}{link.kind==='installer'?<Download size={15}/>:<ExternalLink size={15}/>}</button>
   </li>)}</ol>
   {!recommendations.length&&<p className="footnote">Надёжные ссылки не найдены. Уточните модель платы или ноутбука.</p>}
  </section>
  {message&&<div className="optimization-message" role="status"><Info size={18}/>{message}</div>}
  <div className="footnote"><Info size={17}/>На сайте выберите свою модель и Windows {version}. DirectX и .NET нужны только по требованиям игры. Исправно работающий драйвер переустанавливать не нужно.</div>
  {boardRevision&&<p className="driver-revision">Версия платы по данным Windows: {boardRevision}. Перед скачиванием сверьте ревизию на самой плате.</p>}
 </div>
}
