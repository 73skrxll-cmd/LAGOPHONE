import {useEffect,useState} from 'react';
import type {CSSProperties} from 'react';
export function useVisualEffects(){
 const [enabled,setEnabled]=useState(()=>{try{return localStorage.getItem('lagophone-effects')!=='off'}catch{return true}}),[visible,setVisible]=useState(!document.hidden),[reduced,setReduced]=useState(()=>matchMedia('(prefers-reduced-motion: reduce)').matches);
 useEffect(()=>{try{localStorage.setItem('lagophone-effects',enabled?'on':'off')}catch{}},[enabled]);
 useEffect(()=>{const media=matchMedia('(prefers-reduced-motion: reduce)'),motion=()=>setReduced(media.matches),visibility=()=>setVisible(!document.hidden),blur=()=>setVisible(false),focus=()=>setVisible(!document.hidden);media.addEventListener('change',motion);document.addEventListener('visibilitychange',visibility);window.addEventListener('blur',blur);window.addEventListener('focus',focus);return()=>{media.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('blur',blur);window.removeEventListener('focus',focus)}},[]);
 return {enabled,setEnabled,running:enabled&&visible,reduced};
}
const stars=Array.from({length:76},(_,i)=>({x:(i*317+83)%1600,y:(i*i*23+73)%900,r:.8+(i%4)*.42}));
export function Atmosphere({theme,running}:{theme:string;running:boolean}){
 return <div className={'theme-atmosphere atmosphere-'+theme} data-motion={running} aria-hidden="true"><div className="ambient-glow ambient-glow-one"/><div className="ambient-glow ambient-glow-two"/><svg viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
 <g className="ambient-stars">{[0,1,2].map(layer=><g key={layer} className={'star-depth star-depth-'+layer} style={{'--drift':`${60-layer*14}s`,'--dx':`${12+layer*7}px`,'--dy':`${-8-layer*4}px`,'--delay':`${-layer*13}s`} as CSSProperties}>{stars.filter((_,i)=>i%3===layer).map((s,i)=><g key={i}><circle className="star-point" cx={s.x} cy={s.y} r={s.r*(.65+layer*.18)} style={{'--delay':`${i%11*-1.3}s`,'--duration':`${5+i%6}s`} as CSSProperties}/>{i%9===0&&layer===2&&<path className="ambient-star-cross star-point" d={`M${s.x-4} ${s.y}h8m-4-4v8`}/>}</g>)}</g>)}</g>
 </svg></div>;
}
