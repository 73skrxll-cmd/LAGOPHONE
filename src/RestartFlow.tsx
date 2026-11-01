import {useEffect,useRef,useState} from 'react';
import {Check,CheckCircle2,Info,LoaderCircle,RotateCw,X} from 'lucide-react';
import type {RestartRequest,RestartState} from './bridge';
import catalog from '../shared/optimization.json';
export function RestartFlow({native,revision,request,onVersion}:{native:boolean;revision:number;request:RestartRequest|null;onVersion:(version:'10'|'11')=>void}){
 const [offer,setOffer]=useState<RestartRequest|null>(null),[celebration,setCelebration]=useState<RestartState['celebration']>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const reading=useRef<Promise<void>|null>(null),modal=useRef<HTMLDivElement>(null);
 async function refresh(){
  if(!native||!window.lagophone?.restartStatus)return;
  if(reading.current)return reading.current;
  const task=window.lagophone.restartStatus().then(state=>{
   setError('');
   if(state.celebration){setCelebration(state.celebration);setOffer(null);onVersion(state.celebration.version)}
   else if(state.pending&&state.offer)setOffer({required:true,scheduled:!!state.scheduled,warning:state.warning||''});
   else if(!state.pending&&!request)setOffer(null);
   if(state.warning&&!state.pending)setError(state.warning);
  }).catch(()=>setError('Не удалось проверить итог перезагрузки.')).finally(()=>{reading.current=null});
  reading.current=task;return task;
 }
 useEffect(()=>{void refresh()},[native,revision]);
 useEffect(()=>{setOffer(request)},[request]);
 useEffect(()=>{
  if(!offer&&!celebration)return;
  const before=document.activeElement as HTMLElement;modal.current?.querySelector<HTMLButtonElement>('button')?.focus();
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!busy){event.preventDefault();if(celebration)void acknowledge();else void later()}if(event.key==='Tab'){const buttons=Array.from(modal.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')||[]);if(event.shiftKey&&document.activeElement===buttons[0]){event.preventDefault();buttons.at(-1)?.focus()}else if(!event.shiftKey&&document.activeElement===buttons.at(-1)){event.preventDefault();buttons[0]?.focus()}}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);before?.focus()};
 },[!!offer,!!celebration,busy]);
 async function acknowledge(){setBusy(true);try{await window.lagophone?.restartAcknowledge();setCelebration(undefined);setError('')}catch{setError('Не удалось подтвердить сообщение. Повторите попытку.')}finally{setBusy(false)}}
 async function later(){setBusy(true);try{await window.lagophone?.restartLater?.();setOffer(null);setError('')}catch{setError('Не удалось сохранить выбор. Можно перезагрузить ПК через меню Windows.')}finally{setBusy(false)}}
 async function now(){setBusy(true);setError('');try{const result=await window.lagophone!.restartNow();if(!result.cancelled)setOffer(null)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}
 if(celebration)return <div className="modal-backdrop"><div className="modal restart-modal" ref={modal} role="dialog" aria-modal="true" aria-labelledby="restart-title"><CheckCircle2 size={42} className="green-text"/><span className="eyebrow">НАСТРОЙКА ЗАВЕРШЕНА</span><h2 id="restart-title">Поздравляем!<br/>Настройка завершена.</h2><p>Windows перезагружена. Сохранённый профиль «{catalog.profiles.find(p=>p.id===celebration.profile)?.name||celebration.profile}» проверен.</p><div className="restart-result"><Check size={18}/> Применено изменений: {celebration.count}</div>{error&&<p role="alert">{error}</p>}<button className="button primary" disabled={busy} onClick={()=>void acknowledge()}>Открыть GTM PC <Check size={15}/></button></div></div>;
 if(offer)return <div className="modal-backdrop"><div className="modal restart-modal" ref={modal} role="dialog" aria-modal="true" aria-labelledby="restart-title"><RotateCw size={34} className="green-text"/><h2 id="restart-title">Перезагрузить компьютер?</h2><p>Настройки сохранены. Рекомендуем перезагрузить Windows, чтобы завершить их применение. Сначала сохраните открытые файлы.</p><div className="restart-result"><Info size={19}/><span>{offer.scheduled?'После следующей перезагрузки и входа в Windows GTM PC откроется один раз и покажет итог.':'После перезагрузки откройте GTM PC, чтобы проверить итог.'}</span></div>{offer.warning&&<p className="restart-warning">{offer.warning}</p>}{error&&<p role="alert" className="restart-warning">{error}</p>}<div className="modal-actions"><button className="button secondary" disabled={busy} onClick={()=>void later()}>Позже</button><button className="button primary" disabled={busy} onClick={()=>void now()}>{busy?<LoaderCircle size={15} className="spin"/>:<RotateCw size={15}/>}Перезагрузить сейчас</button></div></div></div>;
 return error?<div className="toast" role="status"><Info size={20}/><span>{error}</span><button onClick={()=>void refresh()}>Повторить</button><button aria-label="Закрыть сообщение о перезагрузке" onClick={()=>setError('')}><X size={16}/></button></div>:null;
}
