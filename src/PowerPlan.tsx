import {useEffect,useRef,useState} from 'react';
import {CheckCircle2,Info,LoaderCircle,Zap} from 'lucide-react';
import type {OptimizationStatus} from './Optimization';
import {withTimeout} from '../shared/optimization-view.mjs';
import catalog from '../shared/optimization.json';
const plans=[{id:'keep',name:'Оставить текущий',guid:''},{id:'balanced',name:'Сбалансированный',guid:'381b4222-f694-41f0-9685-ff5bb260df2e'},{id:'high',name:'Высокая производительность',guid:'8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'},{id:'ultimate',name:'Максимальная производительность',guid:'e9a42b02-d5df-448d-aa00-03f14749eb61'},{id:'lagophone',name:'GTM PC Performance — агрессивный',guid:'b9e86298-7324-4f93-9066-faf25aa1c0a3'}];
type Status=OptimizationStatus & {plans?:Record<string,boolean>};
export function PowerPlan({native,version,mismatch,value,onChange,onCompleted}:{native:boolean;version:'10'|'11';mismatch:boolean;value:string;onChange:(value:string)=>void;onCompleted:()=>void}){
 const [status,setStatus]=useState<Status|null>(null),[checking,setChecking]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[failure,setFailure]=useState(''),[message,setMessage]=useState('');
 const reading=useRef<Promise<void>|null>(null);
 function refresh(){
  if(!native)return Promise.resolve();
  if(reading.current)return reading.current;
  setChecking(true);
  const task=withTimeout(Promise.resolve().then(()=>window.lagophone!.powerOptimizationStatus()),25000,'Проверка питания не ответила за 25 секунд. Нажмите «Повторить проверку».')
   .then(state=>{setStatus(state);setError(state.ok?'':state.error||'Не удалось проверить питание.')})
   .catch(e=>setError((e as Error).message)).finally(()=>{setChecking(false);reading.current=null});
  reading.current=task;return task;
 }
 useEffect(()=>{void refresh();const check=()=>{if(!document.hidden)void refresh()};window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);return()=>{window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check)}},[native]);
 useEffect(()=>{if(error||(!busy&&!status?.running))return;const timer=setInterval(()=>void refresh(),2000);return()=>clearInterval(timer)},[busy,status?.running,error]);
 const selected=plans.find(plan=>plan.id===value)!;
 const alreadyActive=!!selected?.guid&&status?.power?.toLowerCase()===selected.guid;
 const running=busy||!!status?.running&&!error;
 const available=status?.plans?.[value]!==false;
 const disabled=!native||running||checking||!status?.ok||!!error||mismatch||value==='keep'||alreadyActive||!available||!!status?.needsRecovery;
 async function execute(restore=false){
  setBusy(true);setError('');setFailure('');setMessage('');
  try{
   const result=restore?await window.lagophone!.restorePowerOptimization():await window.lagophone!.optimize({scope:'power',profile:'basic',power:value,game:'none',sysmain:false,uses:Object.fromEntries(catalog.features.map(feature=>[feature.id,true])),selected:['power']},version);
   setMessage(result.cancelled?'Действие отменено.':result.ok?(restore?'Прерванная настройка питания восстановлена.':result.report.find(row=>row.id==='power')?.message||'План питания применён.'):'');
   if(!result.ok)setFailure(result.error||result.report.find(row=>row.status==='error')?.message||'Не удалось применить план питания.');
   // Read only power state. A failed or interrupted system-tweak audit cannot hold this card locked.
   await refresh();onCompleted();
  }catch(e){setFailure((e as Error).message)}finally{setBusy(false);setStatus(previous=>previous?{...previous,running:false,operation:null}:previous)}
 }
 const phase=status?.operation?.phase;
 const buttonLabel=running?(status?.operation?.mode&&status.operation.mode!=='power'?'Дождитесь текущей операции':phase==='confirmation'?'Подтвердите применение в окне Windows':phase==='windows'?'Windows применяет план…':'Подготовка плана питания…'):checking?'Проверка питания…':alreadyActive?'План уже активен':'Применить только питание';
 return <section className="power-first" aria-label="План питания"><div><span className="eyebrow">РЕЖИМ РАБОТЫ ПК</span><h2><Zap size={22}/>План питания</h2><p>Применяется отдельно. Ранее установленные твики сохраняются.</p></div><div><select aria-label="План питания" value={value} disabled={running} onChange={event=>{onChange(event.target.value);setMessage('')}}>{plans.map(plan=><option key={plan.id} value={plan.id} disabled={plan.id!=='keep'&&status?.plans?.[plan.id]===false}>{plan.name}{status?.plans?.[plan.id]===false?' — недоступен на этом ПК':''}</option>)}</select><button className="button primary" disabled={disabled} onClick={()=>void execute()}>{running||checking?<LoaderCircle className="spin" size={16}/>:alreadyActive?<CheckCircle2 size={16}/>:<Zap size={16}/>}<span>{buttonLabel}</span></button><small>{value==='lagophone'?'От сети: CPU 100%, агрессивный Boost, PCIe ASPM выключен. Возможны больший нагрев и расход энергии.':'Производительный план может увеличить нагрев и расход энергии.'}</small>{mismatch&&<p role="alert">Выберите установленную версию Windows.</p>}{message&&<p className="power-message" role="status">{message}</p>}{(error||failure)&&<div className="power-error" role="alert"><p><Info size={14}/>{error||failure}</p><button className="button secondary" disabled={running||checking} onClick={()=>void refresh()}>Повторить проверку</button></div>}{status?.needsRecovery&&!running&&<div className="power-error"><p>Прервана отдельная операция питания. Системные твики восстанавливать не нужно.</p><button className="button secondary" onClick={()=>void execute(true)}>Завершить прерванную настройку питания</button></div>}</div></section>;
}
