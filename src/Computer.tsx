import {useEffect,useId,useState} from 'react';
import {ArrowUpRight,Pause,Play,Settings2} from 'lucide-react';
import {gpuBadge} from '../shared/gpu-badge.mjs';
import {hardwareBrands,type HardwareBrand} from '../shared/hardware-brands.mjs';
import type {System} from './main';
import sideCase from '../assets/computer-side.webp';
const marks=import.meta.glob<string>('../assets/brands/*.svg',{eager:true,query:'?url',import:'default'});
function HardwareLogo({brand}:{brand:HardwareBrand}){
 const source=marks[`../assets/brands/${brand.id}.svg`];
 return <div className={'hardware-logo logo-'+brand.id} role="img" aria-label={`${brand.category}: ${brand.name}${brand.series?' '+brand.series:''}`} title={`${brand.category} · ${brand.models.join(' / ')}`}>
  {source?<img src={source} alt=""/>:<span className="hardware-wordmark">{brand.name}</span>}{brand.series&&<span className="hardware-series">{brand.series}</span>}
 </div>;
}
function Rotor({cy,id}:{cy:number;id:string}){
 return <g><defs><clipPath id={`${id}-fan-${cy}`}><ellipse cx="1061" cy={cy} rx="112" ry="114"/></clipPath><mask id={`${id}-foreground-${cy}`} maskUnits="userSpaceOnUse" x="0" y="0" width="1374" height="1145"><rect width="1374" height="1145" fill="white"/>{cy>315&&<path d="M0 575H997L1013 732H0Z" fill="black"/>}</mask></defs>
  <g mask={`url(#${id}-foreground-${cy})`}><g clipPath={`url(#${id}-fan-${cy})`}><g className="studio-fan-blades" style={{transformOrigin:'1061px 315px'}}><image href={sideCase} y={cy-315} width="1374" height="1145"/></g></g></g>
 </g>;
}
export function Computer({system,onTweaks}:{system:System;onTweaks:()=>void}){
 const {gpu,demo}=system,detected=gpuBadge(gpu),brands=hardwareBrands(system),id=useId().replace(/:/g,'');
 const [paused,setPaused]=useState(()=>{try{return localStorage.getItem('lagophone-pc-animation')==='off'}catch{return false}}),[visible,setVisible]=useState(!document.hidden),[reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches),show=()=>setVisible(!document.hidden),blur=()=>setVisible(false),focus=()=>setVisible(!document.hidden);media.addEventListener('change',change);document.addEventListener('visibilitychange',show);window.addEventListener('blur',blur);window.addEventListener('focus',focus);return()=>{media.removeEventListener('change',change);document.removeEventListener('visibilitychange',show);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus)}},[]);
 useEffect(()=>{try{localStorage.setItem('lagophone-pc-animation',paused?'off':'on')}catch{}},[paused]);
 return <section className="pc-studio" data-animate={!paused&&visible&&!reduced} aria-label="Визуализация компьютера">
 <div className="studio-heading"><div><span className="eyebrow">{demo?'ПРИМЕР КОНФИГУРАЦИИ':'ВАША КОНФИГУРАЦИЯ'}</span><h2>Ваша сборка</h2></div><button type="button" className="button secondary" disabled={reduced} aria-label={paused?'Включить анимацию компьютера':'Остановить анимацию компьютера'} onClick={()=>setPaused(!paused)}>{paused||reduced?<Play size={13}/>:<Pause size={13}/>}<span>{reduced?'Без анимации':paused?'Анимация выключена':'Остановить анимацию'}</span></button></div>
 <div className="studio-layout">
 <div className="hardware-logos hardware-logos-left" aria-label="Производители комплектующих">{brands.filter((_,i)=>i%2===0).map(brand=><HardwareLogo key={brand.key} brand={brand}/>)}</div>
 <div className="studio-scene"><svg viewBox="80 30 1230 1080" role="img" aria-label={`Корпус ПК, вид сбоку. Надпись на видеокарте: ${detected.badge}`}><defs>
 <linearGradient id={`${id}-nameplate`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#25282c"/><stop offset="1" stopColor="#15191d"/></linearGradient>
 </defs><image href={sideCase} x="0" y="0" width="1374" height="1145"/>
 <Rotor cy={315} id={id}/><Rotor cy={594} id={id}/>
 <g className="studio-led" fill="none" stroke="#a6e9ff" strokeWidth="3" opacity=".65"><ellipse cx="1061" cy="315" rx="125" ry="128"/><ellipse cx="1061" cy="594" rx="125" ry="128"/><ellipse cx="517" cy="379" rx="76" ry="83"/></g>
 <rect x="607" y="620" width="258" height="52" rx="2" fill={`url(#${id}-nameplate)`}/>
 <text x="735" y="654" textAnchor="middle" className="studio-gpu-label">{detected.badge}</text>
 </svg></div>
 <div className="hardware-logos hardware-logos-right" aria-label="Производители комплектующих">{brands.filter((_,i)=>i%2===1).map(brand=><HardwareLogo key={brand.key} brand={brand}/>)}</div>
 </div>
 <div className="studio-actions"><button className="button secondary" onClick={onTweaks}><Settings2 size={15}/> Настроить для игр <ArrowUpRight size={15}/></button></div>
 </section>;
}
