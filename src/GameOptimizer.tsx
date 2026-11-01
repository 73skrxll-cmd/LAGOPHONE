import {useEffect,useRef,useState} from 'react';
import {Check,CheckCircle2,ChevronRight,FolderOpen,Gamepad2,Info,LoaderCircle,RotateCcw,Search,Sparkles,X} from 'lucide-react';
import {GameEmblem,GameLogo} from './GameEmblem';
import catalog from '../shared/optimization.json';
import {withTimeout} from '../shared/optimization-view.mjs';
import type {OptimizationResult,OptimizationStatus} from './Optimization';

const order=['dota2','cs2','pubg','deadlock','fortnite','valorant','apex','gta5','rocket-league'];
const games=catalog.games.filter(game=>game.id!=='none').sort((a,b)=>(order.indexOf(a.id)<0?999:order.indexOf(a.id))-(order.indexOf(b.id)<0?999:order.indexOf(b.id)));
const shortName:Record<string,string>={cs2:'CS2',dota2:'DOTA 2',pubg:'PUBG',deadlock:'DEADLOCK',fortnite:'FORTNITE',valorant:'VALORANT',apex:'APEX',gta5:'GTA V','rocket-league':'ROCKET LEAGUE'};
// Keep the current view through React remounts; native inspection remains the source
// of truth for configured settings and paths after a full application restart.
let lastView:{game:string;gamePath:string;result:OptimizationResult|null;activated:boolean;custom?:GameChoice|null}|null=null;
const isCustom=(id:string)=>/^custom-[a-f0-9]{32}$/.test(id);
const friendlyError=(error:unknown)=>String((error as Error)?.message||error).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
const fileName=(location:string)=>location.split(/[\\/]/).at(-1)||'Игра';
type GameChoice={id:string;name:string;executables:string[]};
function rememberedGame(){try{const id=localStorage.getItem('lagophone-selected-game');return (games.some(game=>game.id===id)||isCustom(id||''))?id!:''}catch{return ''}}
export function GameOptimizer({native,active,version,mismatch,motion=true,onCompleted}:{native:boolean;active:boolean;motion?:boolean;version:'10'|'11';mismatch:boolean;onCompleted:()=>void}){
 const [game,setGame]=useState(()=>lastView?.game||rememberedGame()),[gamePath,setGamePath]=useState(()=>lastView?.gamePath||''),[catalogOpen,setCatalogOpen]=useState(false),[query,setQuery]=useState(''),[busy,setBusy]=useState(false),[status,setStatus]=useState<OptimizationStatus|null>(null),[result,setResult]=useState<OptimizationResult|null>(()=>lastView?.result||null),[error,setError]=useState(''),[activated,setActivated]=useState(()=>lastView?.activated||false),[shaderTool,setShaderTool]=useState<{available:boolean;version:string}>({available:false,version:''}),[useShaders,setUseShaders]=useState(false),[shaderPreparing,setShaderPreparing]=useState(false),[shaderProgress,setShaderProgress]=useState('');
 const [choosing,setChoosing]=useState(false);
 const [custom,setCustom]=useState<GameChoice|null>(()=>lastView?.custom||null);
 const requestVersion=useRef(0);
 const modal=useRef<HTMLDivElement>(null),opener=useRef<HTMLButtonElement>(null),reading=useRef<Promise<void>|null>(null);
 const customGames=(status?.savedGames||[]).filter(saved=>isCustom(saved.id)).map(saved=>({id:saved.id,name:fileName(saved.gamePath).replace(/\.exe$/i,''),executables:[fileName(saved.gamePath)]}));
 const allGames=[...games,...customGames,...(custom&&!customGames.some(item=>item.id===custom.id)?[custom]:[])];
 const selected=allGames.find(item=>item.id===game);
 useEffect(()=>{
  lastView={game,gamePath,result,activated,custom};
  if(game){try{localStorage.setItem('lagophone-selected-game',game)}catch{}}
 },[game,gamePath,result,activated,custom]);
 useEffect(()=>{
  if(!status?.ok)return;
  const saved=(status.savedGames||[]).filter(item=>games.some(game=>game.id===item.id)||isCustom(item.id));
  if(!game){const previous=saved.at(-1);if(previous){setGame(previous.id);setGamePath(previous.gamePath)}}
  else if(!gamePath){const previous=saved.find(item=>item.id===game);if(previous)setGamePath(previous.gamePath)}
 },[status,game,gamePath]);
 useEffect(()=>{if(!native)return;void window.lagophone!.gameShaderStatus().then(tool=>{setShaderTool(tool);setUseShaders(tool.available)}).catch(()=>{});return window.lagophone!.onGameShaderProgress(message=>setShaderProgress(message))},[native]);
 async function connectShaders(){try{const tool=await window.lagophone!.connectShaderTool();if(tool){setShaderTool(tool);setUseShaders(tool.available);setError('')}}catch(e){setError(friendlyError(e))}}
 async function refresh(force=false){
  if(!native)return;
  if(reading.current&&!force)return reading.current;
  const token=++requestVersion.current;
  const task=withTimeout(Promise.resolve().then(()=>window.lagophone!.gameOptimizationStatus()),25000,'Не удалось проверить игры. Попробуйте ещё раз.')
   .then(state=>{if(token===requestVersion.current){setStatus(state);setError(state.ok?'':state.error||'Не удалось проверить игры.')}})
   .catch(e=>{if(token===requestVersion.current){setError(friendlyError(e));setStatus(previous=>previous?{...previous,running:false,operation:null}:previous)}})
   .finally(()=>{if(reading.current===task)reading.current=null});
  reading.current=task;return task;
 }
 async function chooseOther(){
  if(!native)return;
  try{const choice=await window.lagophone!.chooseOtherGame();if(choice){setCustom({id:choice.id,name:choice.name,executables:[fileName(choice.gamePath)]});setGame(choice.id);setGamePath(choice.gamePath);setResult(null);setActivated(false);setError('');setCatalogOpen(false);await refresh(true)}}catch(e){setError(friendlyError(e))}
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
  if(choosing)return;
  setChoosing(true);
  try{const path=await window.lagophone!.chooseGame(game);if(path){setGamePath(path);if(isCustom(game))setCustom({id:game,name:fileName(path).replace(/\.exe$/i,''),executables:[fileName(path)]});setResult(null);setError('');void refresh(true)}}catch(e){setError(friendlyError(e))}finally{setChoosing(false)}
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
    catch(e){setResult({...response,error:'Настройки игры применены. Подготовка шейдеров не завершена.',report:[...response.report,{id:'game-shaders',status:'error',message:(e as Error).message}]});setError(friendlyError(e))}
    finally{setShaderPreparing(false)}
   }
   await refresh(true);onCompleted();
  }catch(e){setError(friendlyError(e))}finally{setBusy(false);setStatus(previous=>previous?{...previous,running:false,operation:null}:previous)}
 }
 async function restore(){
  setBusy(true);setError('');
  try{const response=await window.lagophone!.restoreGameOptimization();setResult(response);await refresh();onCompleted()}catch(e){setError(friendlyError(e))}finally{setBusy(false);setStatus(previous=>previous?{...previous,running:false,operation:null}:previous)}
 }
 const phase=shaderPreparing?(shaderProgress||'Подготовка шейдеров'):status?.operation?.phase==='confirmation'?'Подтвердите игровые настройки в окне Windows':status?.operation?.phase==='windows'?'Windows применяет и проверяет параметры игры':'Подготавливаем игровые настройки';
 return <div className="game-optimizer">
  <section className="game-launcher" aria-label="Оптимизация выбранной игры">
   <GameEmblem id={game} name={selected?.name||'GTM PC'} phase={busy?'working':optimized||activated&&result?.ok&&!result.cancelled?'ready':activated&&result?.ok===false?'error':'idle'} motion={motion} paused={!active}/>
   <h2>{selected?selected.name:'Выберите игру'}</h2>
   {!selected&&<p>Выберите игру или добавьте свою.</p>}
   <button ref={opener} className="button secondary game-choose" disabled={busy} onClick={()=>{setQuery('');setCatalogOpen(true)}}><Gamepad2 size={19}/>{selected?'Выбрать другую игру':'Выбрать игру'}<ChevronRight size={16}/></button>
   {selected&&<div className="game-selected">
    <div className="game-path-step"><span className="game-step-number">1</span><div><b>Путь к игре</b><small>{gamePath||'Выберите файл игры (.exe)'}</small></div><button className="button secondary" disabled={busy||choosing} onClick={()=>void choosePath()}><FolderOpen size={16}/>{gamePath?'Изменить путь':'Выбрать EXE игры'}</button></div>
    {error&&<div className="optimization-message" role="alert"><Info size={18}/>{error}</div>}
    <div className="game-plan"><div><Check size={16}/><span><b>Высокий приоритет CPU</b></span></div><div><Check size={16}/><span><b>Производительная видеокарта</b></span></div></div>
    <details className="game-shader-options"><summary>Подготовка шейдеров</summary><p>Подготовка шейдеров через SCSKiller для поддерживаемых игр. Игра должна быть закрыта.</p>{shaderTool.available?<><label><input type="checkbox" disabled={busy} checked={useShaders} onChange={event=>setUseShaders(event.target.checked)}/>Подготовить шейдеры при оптимизации</label><small>SCSKiller {shaderTool.version} · поддержка зависит от игры, DirectX и GPU.</small></>:<div><button className="button secondary" disabled={!native||busy} onClick={()=>void window.lagophone?.open('scskiller')}>Сайт SCSKiller</button><button className="button secondary" disabled={!native||busy} onClick={()=>void connectShaders()}>Подключить SCSKiller</button></div>}</details>

    {busy?<div className="game-progress" role="status"><LoaderCircle className="spin" size={22}/><span><b>Оптимизация выполняется</b><small>{phase}</small></span></div>:<button className="button primary game-optimize" disabled={!native||choosing||mismatch||!!status?.needsRecovery||!!status?.running} title={optimized?'Повторно проверить и применить настройки':undefined} onClick={()=>void (gamePath?optimize():choosePath())}>{choosing?<LoaderCircle className="spin" size={20}/>:!gamePath?<FolderOpen size={20}/>:optimized?<CheckCircle2 size={20}/>:<Sparkles size={20}/>} {choosing?'Выбор файла…':status?.running?'Дождитесь текущей операции':!gamePath?'Выбрать файл игры':optimized?'Игра оптимизирована':'Оптимизировать'}</button>}
    {optimized&&!busy&&<p className="game-configured"><CheckCircle2 size={14}/>Настройки применены</p>}
    {mismatch&&<p role="alert">Выберите установленную Windows для применения настроек.</p>}
   </div>}
  </section>
  {!selected&&error&&<div className="optimization-message" role="alert"><Info size={18}/>{error}</div>}
  {result&&<section className="optimization-report game-report" aria-live="polite"><h3>{result.cancelled?'Действие отменено':result.ok?'Результат игровой настройки':'Настройка завершена не полностью'}</h3>{result.error&&<p>{result.error}</p>}{result.report.map((row,index)=><div className={'report-row '+row.status} key={index}><Info size={16}/><div><b>{catalog.steps.find(step=>step.id===row.id)?.name||(row.id==='game-shaders'?'Подготовка шейдеров':row.id)}</b><p>{row.message}</p></div><small>{{applied:'Применено',skipped:'Пропущено',restored:'Восстановлено',error:'Ошибка'}[row.status]||row.status}</small></div>)}</section>}
  {!!status?.savedGames?.length&&<section className="game-library"><h3>Ваши игры</h3><div>{status.savedGames.map(saved=><button className="button secondary" disabled={busy} key={saved.id} onClick={()=>select(saved.id)}><Gamepad2 size={16}/>{allGames.find(item=>item.id===saved.id)?.name||fileName(saved.gamePath)}</button>)}</div></section>}
  {status?.needsRecovery&&<div className="game-restore"><p>Предыдущая операция была прервана. Завершите восстановление после ошибки перед новой настройкой.</p><button className="button secondary" disabled={busy||!!status.running} onClick={()=>void restore()}><RotateCcw size={15}/>Исправить незавершённую операцию</button></div>}
  {catalogOpen&&<div className="modal-backdrop" onClick={()=>setCatalogOpen(false)}><div ref={modal} className="modal game-catalog" role="dialog" aria-modal="true" aria-labelledby="game-catalog-title" onClick={event=>event.stopPropagation()}><button className="modal-close" aria-label="Закрыть каталог игр" onClick={()=>setCatalogOpen(false)}><X/></button><h2 id="game-catalog-title">Выбрать игру</h2><div className="search"><Search size={18}/><input aria-label="Поиск игры" placeholder="Название игры…" value={query} onChange={event=>setQuery(event.target.value)}/></div><button className="button secondary game-add-custom" disabled={busy||!native} onClick={()=>void chooseOther()}><FolderOpen size={18}/>Другая игра</button><div className="game-catalog-grid">{games.filter(item=>(item.name+' '+(shortName[item.id]||'')).toLowerCase().includes(query.toLowerCase())).map(item=><button className={'game-catalog-card game-art-'+item.id} key={item.id} aria-label={'Выбрать '+item.name} onClick={()=>select(item.id)}><span className="game-wordmark"><GameLogo id={item.id} name={item.name}/></span><b>{item.name}</b><small>Выбрать <ChevronRight size={13}/></small></button>)}</div>{!games.some(item=>(item.name+' '+(shortName[item.id]||'')).toLowerCase().includes(query.toLowerCase()))&&<p>Игра не найдена. Попробуйте другое название.</p>}</div></div>}
 </div>;
}
