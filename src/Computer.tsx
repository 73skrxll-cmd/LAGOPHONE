import {useEffect,useId,useState} from 'react';
import {ArrowUpRight,Pause,Play,Settings2} from 'lucide-react';
import {gpuBadge} from '../shared/gpu-badge.mjs';
import {hardwareBrands} from '../shared/hardware-brands.mjs';
import {HardwareLogo} from './HardwareLogo';
import type {System} from './main';
function Rotor({cx,cy}:{cx:number;cy:number}){
 return <g transform={`translate(${cx} ${cy})`} className="case-fan">
  <rect x="-37" y="-37" width="74" height="74" rx="7" className="case-fan-frame"/>
  <circle r="29" className="case-fan-ring studio-led"/>
  <g className="studio-fan-blades"><circle r="25" fill="transparent"/>{[0,60,120,180,240,300].map(angle=><path key={angle} transform={`rotate(${angle})`} d="M-4-7C-3-25 13-27 20-17C24-12 24-5 21 0C16-8 7-5 4 1Z" className="case-fan-blade"/>)}</g>
  <circle r="7" className="case-fan-hub"/>
 </g>;
}
export function Computer({system,onTweaks}:{system:System;onTweaks:()=>void}){
 const {gpu,demo}=system,detected=gpuBadge(gpu),brands=hardwareBrands(system).slice(0,8),id=useId().replace(/:/g,'');
 const [paused,setPaused]=useState(()=>{try{return localStorage.getItem('lagophone-pc-animation')==='off'}catch{return false}}),[visible,setVisible]=useState(!document.hidden),[reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{const media=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches),show=()=>setVisible(!document.hidden),blur=()=>setVisible(false),focus=()=>setVisible(!document.hidden);media.addEventListener('change',change);document.addEventListener('visibilitychange',show);window.addEventListener('blur',blur);window.addEventListener('focus',focus);return()=>{media.removeEventListener('change',change);document.removeEventListener('visibilitychange',show);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus)}},[]);
 useEffect(()=>{try{localStorage.setItem('lagophone-pc-animation',paused?'off':'on')}catch{}},[paused]);
 return <section className="pc-studio" data-animate={!paused&&visible&&!reduced} aria-label="Визуализация компьютера">
 <div className="studio-heading"><div><span className="eyebrow">{demo?'ПРИМЕР КОНФИГУРАЦИИ':'ВАША КОНФИГУРАЦИЯ'}</span><h2>Ваша сборка</h2></div><button type="button" className="button secondary" disabled={reduced} aria-label={paused?'Включить анимацию компьютера':'Остановить анимацию компьютера'} onClick={()=>setPaused(!paused)}>{paused||reduced?<Play size={13}/>:<Pause size={13}/>}<span>{reduced?'Без анимации':paused?'Анимация выключена':'Остановить анимацию'}</span></button></div>
 <div className="studio-layout">
 <div className="hardware-logos hardware-logos-left" aria-label="Производители комплектующих">{brands.filter((_,i)=>i%2===0).map(brand=><HardwareLogo key={brand.key} brand={brand}/>)}</div>
 <div className="studio-scene"><svg viewBox="0 0 392 360" role="img" aria-label={`Корпус ПК, вид сбоку. Надпись на видеокарте: ${detected.badge}`}><defs>
 <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="var(--page)"/><stop offset="1" stopColor="var(--accent-panel)"/></linearGradient>
 </defs>
 <rect x="58" y="329" width="25" height="10" rx="3" className="case-feet"/><rect x="309" y="329" width="25" height="10" rx="3" className="case-feet"/>
 <rect x="35" y="20" width="322" height="310" rx="10" className="case-frame"/>
 <path d="M49 39H343" className="case-seam"/><circle cx="328" cy="30" r="2" className="case-indicator studio-led"/>
 <rect x="50" y="48" width="292" height="232" rx="6" fill={`url(#${id}-glass)`} className="case-window"/>
 <rect x="69" y="67" width="186" height="185" rx="5" className="case-board"/>
 <g className="case-circuits"><path d="M85 84H115V101H131M85 91H108V111H130M85 176H120V164H137M85 184H128V173H143M182 161V183H228M190 153V176H239M87 201H111M87 206H120"/><path d="M87 114V153M93 114V146M99 114V153"/></g>
 <rect x="118" y="59" width="126" height="10" rx="3" className="case-radiator"/><path d="M156 130V103Q156 87 172 87H197Q215 87 215 69M170 130V110Q170 101 180 101H207Q229 101 229 69" className="case-tubes"/>
 <rect x="130" y="112" width="57" height="57" rx="8" className="case-cpu-socket"/>
 <circle cx="158.5" cy="140.5" r="22" className="case-cooler"/><circle cx="158.5" cy="140.5" r="17" className="case-cooler-ring studio-led"/>
 <path d="M153 136H164M153 141H164M153 146H160" className="case-cooler-mark"/>
 <rect x="207" y="116" width="10" height="67" rx="3" className="case-memory"/><rect x="224" y="116" width="10" height="67" rx="3" className="case-memory"/>
 <path d="M212 121V177M229 121V177" className="case-memory-light studio-led"/>
 <Rotor cx={297} cy={105}/><Rotor cx={297} cy={190}/>
 <path d="M243 235H254Q268 235 268 251V267" className="case-power-cable"/>
 <rect x="80" y="215" width="181" height="38" rx="5" className="case-gpu"/>
 <path d="M91 218H250" className="case-gpu-light studio-led"/>
 <g className="case-gpu-vents">{[0,1,2,3,4,5].map(i=><path key={i} d={`M${94+i*5} 231v12`}/>)}</g>
 <text x="192" y="241" textAnchor="middle" className="studio-gpu-label">{detected.badge}</text>
 <path d="M51 282H341" className="case-seam"/>
 <g className="case-psu-vents">{[0,1,2,3,4,5,6,7].map(i=><path key={i} d={`M${71+i*11} 298v10`}/>)}</g>
 <path d="M291 300H321" className="case-psu-mark"/>
 <g className="case-screws">{[[59,57],[333,57],[59,270],[333,270]].map(([cx,cy])=><circle key={cx+'-'+cy} cx={cx} cy={cy} r="2"/>)}</g>
 </svg></div>
 <div className="hardware-logos hardware-logos-right" aria-label="Производители комплектующих">{brands.filter((_,i)=>i%2===1).map(brand=><HardwareLogo key={brand.key} brand={brand}/>)}</div>
 </div>
 <div className="studio-actions"><button className="button secondary" onClick={onTweaks}><Settings2 size={15}/> Настроить для игр <ArrowUpRight size={15}/></button></div>
 </section>;
}
