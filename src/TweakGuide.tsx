import {useEffect,useState,type RefObject} from 'react';
import {createPortal} from 'react-dom';
import {nextTweakGuideDelay,readTweakGuide,tweakGuideTiming} from '../shared/tweak-guide.mjs';
import './tweak-guide.css';
const storageKey='gtm-tweaks-guide-v2';
let memory=readTweakGuide(null);
function read(){try{const value=sessionStorage.getItem(storageKey);if(value)memory=readTweakGuide(value)}catch{}return memory}
function write(value:ReturnType<typeof read>){memory=value;try{sessionStorage.setItem(storageKey,JSON.stringify(value))}catch{}}
export function TweakGuide({target,running,blocked,visited}:{target:RefObject<HTMLButtonElement>;running:boolean;blocked:boolean;visited:boolean}){
 const [top,setTop]=useState<number|null>(null);
 useEffect(()=>{
  if(visited){setTop(null);return}
  if(!running||blocked){setTop(null);return}
  let timer:ReturnType<typeof setTimeout>|undefined,hide:ReturnType<typeof setTimeout>|undefined,disposed=false;
  const schedule=()=>{const delay=nextTweakGuideDelay(read(),Date.now());if(delay!==null)timer=setTimeout(show,delay)};
  const show=()=>{
   if(disposed)return;
   const rect=target.current?.getBoundingClientRect(),root=document.getElementById('root');
   if(!rect||rect.top<34||rect.bottom>innerHeight||root?.inert||document.querySelector('[role="dialog"],[role="alertdialog"]')||['INPUT','SELECT','TEXTAREA'].includes(document.activeElement?.tagName||'')){timer=setTimeout(show,tweakGuideTiming.first);return}
   const state=read();if(nextTweakGuideDelay(state,Date.now())===null)return;
   write({...state,shown:state.shown+1,last:Date.now()});setTop(rect.top+rect.height/2-18);
   hide=setTimeout(()=>{if(!disposed){setTop(null);schedule()}},tweakGuideTiming.duration);
  };
  const hideOnMove=()=>setTop(null);
  window.addEventListener('resize',hideOnMove);window.addEventListener('scroll',hideOnMove,true);
  schedule();
  return()=>{disposed=true;clearTimeout(timer);clearTimeout(hide);setTop(null);window.removeEventListener('resize',hideOnMove);window.removeEventListener('scroll',hideOnMove,true)};
 },[running,blocked,visited,target]);
 if(top===null)return null;
 return createPortal(<div className="tweak-guide-hand" style={{top}} aria-hidden="true"><svg viewBox="0 0 120 80" fill="none"><g stroke="#252525" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M-15 47C5 43 12 44 26 41L30 68C10 68 3 72-15 73Z" fill="#252525"/><path d="M22 40L35 37L41 66L28 71Z" fill="#f5f5ef"/><path d="M36 42C40 36 43 34 48 33L49 16C50 8 59 8 61 15L62 31L102 25C114 23 117 34 105 37L78 43C86 45 87 51 82 56C84 62 79 66 72 66C68 73 58 75 49 71L38 65Z" fill="#fffdf5"/><path d="M48 33C49 39 54 43 62 44M77 43L65 45M80 55L66 56M71 66L62 65"/><path d="M42 47L48 45M44 55L50 53M46 63L52 61" stroke="#a6a69e" strokeWidth="2"/></g></svg></div>,document.body);
}
