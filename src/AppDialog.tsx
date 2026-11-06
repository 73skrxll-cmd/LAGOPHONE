import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {CircleHelp,Info,LoaderCircle,Settings2,TriangleAlert,X} from 'lucide-react';
import {BrandMark} from './Brand';
import type {AppDialogRequest} from './bridge';
import './app-dialog.css';

function AppDialog({request,onAnswer}:{request:AppDialogRequest;onAnswer:(response:number)=>Promise<void>}){
 const ref=useRef<HTMLDivElement>(null),answering=useRef(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const titleId=useId(),descriptionId=useId();
 async function answer(response:number){
  if(answering.current)return;answering.current=true;setBusy(true);setError('');
  try{await onAnswer(response)}catch{answering.current=false;setBusy(false);setError('Не удалось передать ответ. Попробуйте ещё раз.');}
 }
 const answerRef=useRef(answer);answerRef.current=answer;
 useEffect(()=>{
  const previous=document.activeElement instanceof HTMLElement?document.activeElement:null;
  const backdrop=ref.current?.parentElement;
  const background=[...document.body.children].filter((node):node is HTMLElement=>node instanceof HTMLElement&&node!==backdrop).map(node=>({node,inert:node.inert}));
  for(const {node} of background)node.inert=true;
  const beforeOverflow=document.body.style.overflow;document.body.style.overflow='hidden';
  ref.current?.querySelector<HTMLButtonElement>(`[data-response="${request.defaultId}"]`)?.focus({preventScroll:true});
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();void answerRef.current(request.cancelId)}
   if(event.key==='Tab'){
    const buttons=[...ref.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')||[]];
    if(!buttons.length){event.preventDefault();return}
    const first=buttons[0],last=buttons.at(-1)!;
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
   }
  };
  document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('keydown',key,true);for(const {node,inert} of background)node.inert=inert;document.body.style.overflow=beforeOverflow;if(previous?.isConnected)previous.focus({preventScroll:true})};
 },[request.id,request.cancelId,request.defaultId]);
 const warning=request.type==='warning'||request.type==='error',Icon=warning?TriangleAlert:request.type==='question'?CircleHelp:Info;
 return createPortal(<div className="app-dialog-backdrop"><div ref={ref} className="app-dialog" data-kind={request.type} role={warning?'alertdialog':'dialog'} aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} aria-busy={busy}>
  <div className="app-dialog-brand"><BrandMark/><span>GTM PC</span><small>{request.type==='info'?'УВЕДОМЛЕНИЕ':'ПОДТВЕРЖДЕНИЕ'}</small></div>
  <button className="app-dialog-close" aria-label="Закрыть подтверждение" disabled={busy} onClick={()=>void answer(request.cancelId)}><X size={19}/></button>
  <div className="app-dialog-heading"><span className="app-dialog-icon"><Icon size={25}/></span><div><h2 id={titleId}>{request.title}</h2>{request.message&&<p>{request.message}</p>}</div></div>
  <div className="app-dialog-content" id={descriptionId}>
   {request.items.length>0&&<ul className="app-dialog-changes">{request.items.map((item,index)=><li key={index}>{item.detail?<TriangleAlert size={17}/>:<Settings2 size={17}/>}<div><b>{item.title}</b>{item.detail&&<p>{item.detail}</p>}</div></li>)}</ul>}
   {request.detail&&<p className="app-dialog-detail">{request.detail}</p>}
   {error&&<p className="app-dialog-error" role="alert">{error}</p>}
  </div>
  <div className="app-dialog-actions">{request.buttons.map((label,index)=><button key={index} data-response={index} className={'button '+(index===request.cancelId&&request.buttons.length>1?'secondary':'primary')} disabled={busy} onClick={()=>void answer(index)}>{busy&&<LoaderCircle size={15} className="spin"/>}{label}</button>)}</div>
 </div></div>,document.body);
}

export function AppDialogHost(){
 const [request,setRequest]=useState<AppDialogRequest|null>(null);
 useEffect(()=>window.lagophone?.onAppDialog?.(value=>{
  if('closed' in value)setRequest(current=>current?.id===value.closed?null:current);
  else setRequest(value);
 }),[]);
 if(!request)return null;
 return <AppDialog key={request.id} request={request} onAnswer={async response=>{
  const respond=window.lagophone?.respondAppDialog;if(!respond)throw Error('Dialog bridge unavailable');
  await respond(request.id,response);
  setRequest(current=>current?.id===request.id?null:current);
 }}/>;
}
