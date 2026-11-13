import { useEffect, useState } from 'react';
const themes=[{id:'black',name:'Тёмная'},{id:'white',name:'Светлая'}];
export function useTheme():[string,(value:string)=>void]{
 const [theme,setTheme]=useState(()=>{try{const value=localStorage.getItem('lagophone-theme');return themes.some(t=>t.id===value)?value!:'black'}catch{return 'black'}});
 useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('lagophone-theme',theme)}catch{};if(window.lagophone?.setWindowTheme)void window.lagophone.setWindowTheme(theme).catch(()=>{})},[theme]);
 return [theme,value=>{if(themes.some(t=>t.id===value))setTheme(value)}];
}
