import {useEffect,useRef} from 'react';
import {Info} from 'lucide-react';
import type {System} from './main';
const descriptions:Record<string,{title:string;text:string}>={
 cpu:{title:'Процессор',text:'Частота кадров зависит от конкретной игры, сцены и загрузки процессора. Название модели и число ядер сами по себе не определяют узкое место.'},
 gpu:{title:'Видеокарта',text:'Разрешение, качество графики и объём видеопамяти влияют на нагрузку. Статистика FPS ниже показывает измерения запущенных игр; по одному FPS нельзя достоверно определить узкое место.'},
 ram:{title:'Оперативная память',text:'При нехватке памяти Windows обращается к файлу подкачки, что может сопровождаться задержками. Для вывода о проблеме нужны измерения во время игры.'},
 board:{title:'Материнская плата',text:'Драйверы чипсета доступны в разделе «Приложения и драйверы». Совместимость BIOS, процессора и памяти проверяйте на странице производителя платы.'},
 storage:{title:'Накопители',text:'SSD обычно сокращает загрузку игр. Заполнение диска и подкачка могут вызывать задержки; тип накопителя не позволяет вычислить игровой FPS.'},
 os:{title:'Windows',text:'Версия и сборка определены средствами Windows. Secure Boot и TPM проверяются отдельно в блоке безопасности системы.'}
};
export function HardwareDetails({system,selection}:{system:System;selection:{component:string;request:number}|null}){
 const ref=useRef<HTMLDivElement>(null);
 useEffect(()=>{if(selection){ref.current?.scrollIntoView({block:'center',behavior:'auto'});ref.current?.focus({preventScroll:true})}},[selection]);
 const item=selection&&descriptions[selection.component];
 return <div id="hardware-details" ref={ref} tabIndex={-1} className={item?'hardware-details':''}>{item&&<><h3><Info size={18}/>{item.title}</h3><p>{selection?.component==='cpu'?system.cpu:selection?.component==='gpu'?system.gpu?.join(', '):selection?.component==='ram'?`${system.ram||'—'} ГБ · ${system.ramSpeed||'—'} МГц`:selection?.component==='board'?system.board:selection?.component==='storage'?system.disks?.map(d=>d.name).join(', '):system.os}</p><p>{item.text}</p></>}</div>;
}
