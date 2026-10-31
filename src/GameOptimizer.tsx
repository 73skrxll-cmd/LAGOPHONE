import {useEffect,useRef,useState} from 'react';
import {Check,CheckCircle2,ChevronRight,FolderOpen,Gamepad2,Info,LoaderCircle,RotateCcw,Search,Sparkles,X} from 'lucide-react';
import {GameEmblem,GameLogo} from './GameEmblem';
import catalog from '../shared/optimization.json';
import type {OptimizationResult,OptimizationStatus} from './Optimization';

const order=['dota2','cs2','pubg','deadlock','fortnite','valorant','apex','gta5','rocket-league'];
const games=catalog.games.filter(game=>game.id!=='none').sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
const shortName:Record<string,string>={cs2:'CS2',dota2:'DOTA 2',pubg:'PUBG',deadlock:'DEADLOCK',fortnite:'FORTNITE',valorant:'VALORANT',apex:'APEX',gta5:'GTA V','rocket-league':'ROCKET LEAGUE'};
// Keep the current view through React remounts; native inspection remains the source
// of truth for configured settings and paths after a full application restart.
let lastView:{game:string;gamePath:string;result:OptimizationResult|null;activated:boolean}|null=null;
function rememberedGame(){try{const id=localStorage.getItem('lagophone-selected-game');return games.some(game=>game.id===id)?id!:''}catch{return ''}}
export function GameOptimizer({native,active,version,mismatch,motion=true,onCompleted}:{native:boolean;active:boolean;motion?:boolean;version:'10'|'11';mismatch:boolean;onCompleted:()=>void}){
 const [game,setGame]=useState(()=>lastView?.game||rememberedGame()),[gamePath,setGamePath]=useState(()=>lastView?.gamePath||''),[catalogOpen,setCatalogOpen]=useState(false),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState<OptimizationStatus|null>(null),[result,setResult]=useState<OptimizationResult|null>(()=>lastView?.result||null),[error,setError]=useState(''),[activated,setActivated]=useState(()=>lastView?.activated||false),[shaderTool,setShaderTool]=useState<{available:boolean;version:string}>({available:false,version:''}),[useShaders,setUseShaders]=useState(false),[shaderPreparing,setShaderPreparing]=useState(false),[shaderProgress,setShaderProgress]=useState('');
 const modal=useRef<HTMLDivElement>(null),opener=useRef<HTMLButtonElement>(null),reading=useRef<Promise<void>|null>(null);
 const selected=games.find(item=>item.id===game);
 useEffect(()=>{
  lastView={game,gamePath,result,activated};
  if(game){try{localStorage.setItem('lagophone-selected-game',game)}catch{}}
 },[game,gamePath,result,activated]);
 useEffect(()=>{
  if(!status?.ok)return;
  const saved=(status.savedGames||[]).filter(item=>games.some(game=>game.id===item.id));
  if(!game){const previous=saved.at(-1);if(previous){setGame(previous.id);setGamePath(previous.gamePath)}}
  else if(!gamePath){const previous=saved.find(item=>item.id===game);if(previous)setGamePath(previous.gamePath)}
 },[status,game,gamePath]);
 useEffect(()=>{if(!native)return;void window.lagophone!.gameShaderStatus().then(tool=>{setShaderTool(tool);setUseShaders(tool.available)}).catch(()=>{});return window.lagophone!.onGameShaderProgress(message=>setShaderProgress(message))},[native]);
 async function connectShaders(){try{const tool=await window.lagophone!.connectShaderTool();if(tool){setShaderTool(tool);setUseShaders(tool.available);setError('')}}catch(e){setError((e as Error).message)}}
 async function refresh(){
  if(!native)return;
  if(reading.current)return reading.current;
  const task=(async()=>{try{const state=await window.lagophone!.gameOptimizationStatus();setStatus(state);setError(state.ok?'':state.error||'Не удалось проверить игровые настройки.')}catch(e){setError((e as Error).message)}})().finally(()=>{reading.current=null});
  reading.current=task;return task;
 }
 useEffect(()=>{if(!active||!native)return;void refresh();const check=()=>{if(!document.hidden)void refresh()};const timer=setInterval(check,15000);window.addEventListener('focus',check);document.addEventListener('visibilitychange',check);return()=>{clearInterval(timer);window.removeEventListener('focus',check);document.removeEventListener('visibilitychange',check)}},[native,active]);
 useEffect(()=>{if(!busy||!active)return;const timer=setInterval(()=>void refresh(),2000);return()=>clearInterval(timer)},[busy,active]);
 useEffect(()=>{
  if(!catalogOpen)return;
  modal.current?.querySelector<HTMLInputElement>('input')?.focus();
  const key=(event:KeyboardEvent)=>{
   if(event.key==='Escape'){setCatalogOpen(false);opener.current?.focus()}
   if(event.key==='Tab'){
    const items=Array.from(modal.current?.querySelectorAll<HTMLElement>('button,input')||[]),first=items[0],last=items.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
   }
  };
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);opener.current?.focus()};
 },[catalogOpen]);
 function select(id:string){
  setActivated(false);setGame(id);setGamePath(status?.savedGames?.find(saved=>saved.id===id)?.gamePath||'');setResult(null);setError('');setCatalogOpen(false);opener.current?.focus();
 }
 async function choosePath(){
  if(!native){setError('Выбор EXE доступен в настольном приложении Windows.');return}
  try{const path=await window.lagophone!.chooseGame(game);if(path){setGamePath(path);setResult(null);setError('')}}catch(e){setError((e as Error).message)}
 }
 const targets=(status?.appliedTargets||[]).filter(target=>target.gamePath?.toLowerCase()===gamePath.toLowerCase());
 const optimized=!!gamePath&&['game-gpu','game-priority'].every(id=>{const rows=targets.filter(target=>target.id===id);return rows.length>0&&rows.every(row=>row.enabled)});
 async function optimize(){
  if(!native||!selected||!gamePath)return;
  setActivated(true);setBusy(true);setResult(null);setError('');
  try{
   const response=await window.lagophone!.optimize({scope:'game',profile:'basic',power:'keep',game,sysmain:false,uses:Object.fromEntries(catalog.features.map(feature=>[feature.id,true])),selected:['game-gpu','game-priority']},version);
   setResult(response);
   if(response.ok&&!response.cancelled&&useShaders&&shaderTool.available){
    setShaderPreparing(true);setShaderProgress('Чтение шейдеров выбранной игры');
    try{const prepared=await window.lagophone!.prepareGameShaders(game);setResult({...response,report:[...response.report,{id:'game-shaders',status:prepared.alreadyPrepared?'skipped':'applied',message:prepared.message}]})}
    catch(e){setResult({...response,ok:false,error:'Приоритет и GPU сохранены, но подготовка шейдеров не завершена.',report:[...response.report,{id:'game-shaders',status:'error',message:(e as Error).message}]});setError((e as Error).message)}
    finally{setShaderPreparing(false)}
   }
   await refresh();onCompleted();
  }catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 async function restore(){
  setBusy(true);setError('');
  try{const response=await window.lagophone!.restoreGameOptimization();setResult(response);await refresh();onCompleted()}catch(e){setError((e as Error).message)}finally{setBusy(false)}
 }
 const phase=shaderPreparing?(shaderProgress||'Подготовка шейдеров'):status?.operation?.phase==='confirmation'?'Подтвердите игровые настройки в окне Windows':status?.operation?.phase==='windows'?'Windows применяет и проверяет параметры игры':'Подготавливаем игровые настройки';
 return <div className="game-optimizer">
  <section className="game-launcher" aria-label="Оптимизация выбранной игры">
   <GameEmblem id={game} name={selected?.name||'LAGOPHONE'} phase={busy?'working':activated&&result?.ok===false?'error':optimized||activated&&result?.ok&&!result.cancelled?'ready':'idle'} motion={motion&&active}/>
   <span className="eyebrow">ИГРА НА ПЕРВОМ МЕСТЕ</span>
   <h2>{selected?selected.name:'Выберите игру'}</h2>
   <p>{selected?'Настройте приоритет и видеокарту для этой игры. Системные твики и питание не изменятся.':'Выберите игру из каталога, укажите её EXE и примените игровой профиль своей кнопкой.'}</p>
   <button ref={opener} className="button secondary game-choose" disabled={busy} onClick={()=>{setQuery('');setCatalogOpen(true)}}><Gamepad2 size={19}/>{selected?'Выбрать другую игру':'Выбрать игру'}<ChevronRight size={16}/></button>
   {selected&&<div className="game-selected">
    <div className="game-path-step"><span className="game-step-number">1</span><div><b>Путь к игре</b><small>{gamePath||'Нужен основной EXE: '+selected.executables.join(' / ')}</small></div><button className="button secondary" disabled={busy} onClick={()=>void choosePath()}><FolderOpen size={16}/>{gamePath?'Изменить путь':'Выбрать EXE игры'}</button></div>
    <div className="game-plan"><div><Check size={16}/><span><b>Высокий приоритет CPU</b><small>Для запущенной игры и следующих запусков этого имени EXE. Без приоритета реального времени.</small></span></div><div><Check size={16}/><span><b>Производительная видеокарта</b><small>Предпочтение GPU для выбранного EXE, если это поддерживают Windows и драйвер.</small></span></div></div>
    <details className="game-shader-options"><summary>Меньше фризов: подготовка шейдеров</summary><p>Прогрев кеша через официальный SCSKiller может уменьшить фризы компиляции шейдеров в поддерживаемых играх. Игра должна быть закрыта. Кеш не очищается; запись через DLL и внедрение в игру не включаются.</p>{shaderTool.available?<><label><input type="checkbox" disabled={busy} checked={useShaders} onChange={event=>setUseShaders(event.target.checked)}/>Подготовить шейдеры при оптимизации</label><small>SCSKiller {shaderTool.version} · поддержка зависит от игры, DirectX и GPU.</small></>:<div><button className="button secondary" disabled={!native||busy} onClick={()=>void window.lagophone?.open('scskiller')}>Официальный SCSKiller</button><button className="button secondary" disabled={!native||busy} onClick={()=>void connectShaders()}>Подключить установленный SCSKiller</button></div>}</details>
    <p className="game-plan-note"><Info size={15}/> Фоновые программы могут реагировать медленнее. Игра или античит могут запретить либо сбросить приоритет. Прирост FPS не гарантируется.</p>
    {busy?<div className="game-progress" role="status"><LoaderCircle className="spin" size={22}/><span><b>Оптимизация выполняется</b><small>{phase}</small></span></div>:<button className="button primary game-optimize" disabled={!native||!status?.ok||!gamePath||mismatch||!!status?.needsRecovery||!!status?.running} onClick={()=>void optimize()}>{optimized?<CheckCircle2 size={20}/>:<Sparkles size={20}/>} Оптимизировать</button>}
    {optimized&&!busy&&<p className="game-configured"><CheckCircle2 size={14}/>Настройки действуют. Можно повторно проверить или подготовить шейдеры.</p>}
    {mismatch&&<p role="alert">Выберите установленную Windows для применения настроек.</p>}
   </div>}
  </section>
  {error&&<div className="optimization-message" role="alert"><Info size={18}/>{error}</div>}
  {result&&<section className="optimization-report game-report" aria-live="polite"><h3>{result.cancelled?'Действие отменено':result.ok?'Результат игровой настройки':'Настройка завершена не полностью'}</h3>{result.error&&<p>{result.error}</p>}{result.report.map((row,index)=><div className={'report-row '+row.status} key={index}><Info size={16}/><div><b>{catalog.steps.find(step=>step.id===row.id)?.name||(row.id==='game-shaders'?'Подготовка шейдеров':row.id)}</b><p>{row.message}</p></div><small>{{applied:'Применено',skipped:'Пропущено',restored:'Восстановлено',error:'Ошибка'}[row.status]||row.status}</small></div>)}</section>}
  {!!status?.savedGames?.length&&<section className="game-library"><h3>Ваши игры</h3><div>{status.savedGames.map(saved=><button className="button secondary" disabled={busy} key={saved.id} onClick={()=>select(saved.id)}><Gamepad2 size={16}/>{games.find(item=>item.id===saved.id)?.name||saved.id}</button>)}</div></section>}
  {status?.needsRecovery&&<div className="game-restore"><p>Предыдущая операция была прервана. Завершите восстановление после ошибки перед новой настройкой.</p><button className="button secondary" disabled={busy||!!status.running} onClick={()=>void restore()}><RotateCcw size={15}/>Исправить незавершённую операцию</button></div>}
  {catalogOpen&&<div className="modal-backdrop" onClick={()=>setCatalogOpen(false)}><div ref={modal} className="modal game-catalog" role="dialog" aria-modal="true" aria-labelledby="game-catalog-title" onClick={event=>event.stopPropagation()}><button className="modal-close" aria-label="Закрыть каталог игр" onClick={()=>setCatalogOpen(false)}><X/></button><span className="eyebrow">ВАША СЛЕДУЮЩАЯ ПОБЕДА</span><h2 id="game-catalog-title">Выбрать игру</h2><div className="search"><Search size={18}/><input aria-label="Поиск игры" placeholder="Название игры…" value={query} onChange={event=>setQuery(event.target.value)}/></div><div className="game-catalog-grid">{games.filter(item=>(item.name+' '+shortName[item.id]).toLowerCase().includes(query.toLowerCase())).map(item=><button className={'game-catalog-card game-art-'+item.id} key={item.id} aria-label={'Выбрать '+item.name} onClick={()=>select(item.id)}><span className="game-wordmark"><GameLogo id={item.id} name={item.name}/></span><b>{item.name}</b><small>Выбрать <ChevronRight size={13}/></small></button>)}</div>{!games.some(item=>(item.name+' '+shortName[item.id]).toLowerCase().includes(query.toLowerCase()))&&<p>Игра не найдена. Попробуйте другое название.</p>}</div></div>}
 </div>;
}
