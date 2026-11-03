import {useEffect,useState} from 'react';
import type {CSSProperties} from 'react';
export function useVisualEffects(){
 const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem('lagophone-effects')!=='off'}catch{return true}}),[visible,setVisible]=useState(()=>!document.hidden&&document.hasFocus()),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{try{localStorage.setItem('lagophone-effects',enabled?'on':'off')}catch{}},[enabled]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setReduced(media.matches),visibility=()=>setVisible(!document.hidden&&document.hasFocus()),blur=()=>setVisible(false),focus=()=>setVisible(!document.hidden&&document.hasFocus());media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur);window.addEventListener('focus',focus);visibility();return()=>{media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus)}},[]);
 return {enabled,setEnabled,running:enabled&&visible,reduced};
}
const stars=Array.from({length:76},(_,i)=>({x:(i*317+83)%1600,y:(i*i*23+73)%900,r:.8+(i%4)*.42}));
const snow=Array.from({length:54},(_,i)=>({x:(i*347+61)%1600,size:.48+(i%5)*.19,duration:18+i%9*2.4,delay:-(i*7.13)%39,drift:(i%2?1:-1)*(25+i%7*11)}));
const meteors=Array.from({length:7},(_,i)=>({x:(i*239+90)%1350,y:(i*127+30)%620,duration:7.5+i*1.7,delay:-i*2.43}));
const snowCrystal='M0-8V8M-6.928-4L6.928 4M-6.928 4L6.928-4M0-5L-2-7M0-5L2-7M0 5L-2 7M0 5L2 7M-4.33-2.5L-7.06-1.77M-4.33-2.5L-5.06-5.23M4.33 2.5L7.06 1.77M4.33 2.5L5.06 5.23M-4.33 2.5L-5.06 5.23M-4.33 2.5L-7.06 1.77M4.33-2.5L5.06-5.23M4.33-2.5L7.06-1.77';
export function Atmosphere({theme,running}:{theme:string;running:boolean}){
 return <div className={'theme-atmosphere atmosphere-'+theme} data-motion={running} data-weather={theme==='white'?'snow':'shooting-stars'} aria-hidden="true"><div className="ambient-glow ambient-glow-one"/><div className="ambient-glow ambient-glow-two"/><svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
 <defs><linearGradient id="meteor-trail"><stop offset="0" stopColor="#bddbff" stopOpacity="0"/><stop offset=".75" stopColor="#d0e7ff" stopOpacity=".5"/><stop offset="1" stopColor="#fff"/></linearGradient><path id="ambient-snow-crystal" d={snowCrystal}/></defs>
 {theme==='black'&&<g className="ambient-stars">{[0,1,2].map(layer=><g key={layer} className={'star-depth star-depth-'+layer} style={{'--drift':`${60-layer*14}s`,'--dx':`${12+layer*7}px`,'--dy':`${-8-layer*4}px`,'--delay':`${-layer*13}s`} as CSSProperties}>{stars.filter((_,i)=>i%3===layer).map((s,i)=><g key={i}><circle className="star-point" cx={s.x} cy={s.y} r={s.r*(.65+layer*.18)} style={{'--delay':`${i%11*-1.3}s`,'--duration':`${5+i%6}s`} as CSSProperties}/>{i%9===0&&layer===2&&<path className="ambient-star-cross star-point" d={`M${s.x-4} ${s.y}h8m-4-4v8`}/>}</g>)}</g>)}</g>}
 {theme==='black'&&<g className="ambient-meteors">{meteors.map((m,i)=><g key={i} transform={`translate(${m.x} ${m.y})`}><g className="shooting-star" style={{'--meteor-duration':`${m.duration}s`,'--meteor-delay':`${m.delay}s`} as CSSProperties}><path d="M-130-75L0 0" stroke="url(#meteor-trail)" strokeWidth="1.8" fill="none"/><circle r="1.8" fill="#f4faff"/></g></g>)}</g>}
 {theme==='white'&&<g className="ambient-snow">{snow.map((f,i)=><g key={i} transform={`translate(${f.x} 0)`}><g className="snowfall" style={{'--fall-duration':`${f.duration}s`,'--fall-delay':`${f.delay}s`,'--snow-drift':`${f.drift}px`,'--snow-opacity':.25+i%4*.12} as CSSProperties}><g className="snowflake-turn" style={{'--snow-turn':`${i%2?-1:1}turn`,'--turn-duration':`${12+i%7*3}s`} as CSSProperties}><use href="#ambient-snow-crystal" transform={`scale(${f.size})`}/></g></g></g>)}</g>}
 </svg></div>;
}
