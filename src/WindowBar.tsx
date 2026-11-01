import {useEffect} from 'react';
export function WindowBar(){
 const desktop=!!window.lagophone?.windowChrome;
 useEffect(()=>{document.documentElement.dataset.desktop=String(desktop)},[desktop]);
 return desktop?<div className="desktop-titlebar" aria-hidden="true"/>:null;
}
