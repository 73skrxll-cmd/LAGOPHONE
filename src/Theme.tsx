import { useEffect, useState } from 'react';
import { Palette, Sparkles } from 'lucide-react';
const themes=[{id:'green',name:'Зелёная'},{id:'red',name:'Красная'},{id:'blue',name:'Синяя'},{id:'black',name:'Чёрная'},{id:'purple',name:'Фиолетовая'}];
export function useTheme():[string,(value:string)=>void]{
 const [theme,setTheme]=useState(()=>{try{const value=localStorage.getItem('lagophone-theme');return themes.some(t=>t.id===value)?value!:'green'}catch{return 'green'}});
 useEffect(()=>{document.documentElement.dataset.theme=theme;try{localStorage.setItem('lagophone-theme',theme)}catch{}},[theme]);
 return [theme,value=>{if(themes.some(t=>t.id===value))setTheme(value)}];
}
export function ThemeSelector({value,onChange,effects=true,onEffectsChange}:{value:string;onChange:(value:string)=>void;effects?:boolean;onEffectsChange?:(value:boolean)=>void}){
 return <div className="theme-picker"><label className="theme-control"><Palette size={17}/><span>Тема</span><select aria-label="Цветовая тема" value={value} onChange={e=>onChange(e.target.value)}>{themes.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>{onEffectsChange&&<button type="button" className="effects-toggle" aria-label={effects?'Остановить эффекты оформления':'Включить эффекты оформления'} aria-pressed={effects} title={effects?'Остановить анимации оформления':'Включить анимации оформления'} onClick={()=>onEffectsChange(!effects)}><Sparkles size={15}/></button>}</div>;
}
