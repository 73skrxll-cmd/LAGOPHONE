import {useEffect} from 'react';
import {BrandMark} from './Brand';
export function WindowBar(){
 const desktop=!!window.lagophone?.windowChrome;
 useEffect(()=>{document.documentElement.dataset.desktop=String(desktop)},[desktop]);
 return desktop?<div className="desktop-titlebar"><BrandMark/><span>GTM PC</span></div>:null;
}
