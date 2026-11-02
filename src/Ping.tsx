import {useEffect,useState,useRef} from 'react';
import {Activity,CheckCircle2,Download,Info,LoaderCircle,Network,Square,Unplug} from 'lucide-react';
import {PING_SERVICES,PING_TARGETS,summarizePing} from '../shared/ping.mjs';
import type {PingProgress,PingReport,PingSample,PingState,PingSummary,PingTrial} from '../shared/ping.mjs';
import './ping.css';

const ms=(value:number|null|undefined)=>value===null||value===undefined?'—':`${Math.round(value*10)/10}`;
const stages={preparing:'Проверяем подключение',baseline:'Исходное подключение',routed:'Внешний маршрут',repeat:'Повтор исходного подключения',connecting:'Подключаем и проверяем внешний маршрут',restoring:'Возвращаем исходное подключение'};
function Trace({samples}:{samples:PingSample[]}){
 const top=Math.max(20,...samples.map(s=>s.rttMs||0))*1.15;
 const x=(i:number)=>16+i*568/Math.max(49,samples.length-1),y=(n:number)=>122-n/top*100;
 const segments:string[]=[];let current='';
 samples.forEach((s,i)=>{if(s.status!=='success'){if(current)segments.push(current);current=''}else current+=`${current?'L':'M'}${x(i).toFixed(2)},${y(s.rttMs!).toFixed(2)} `});if(current)segments.push(current);
 return <svg className="ping-trace" viewBox="0 0 600 150" role="img" aria-label={samples.length?'Задержка по фактическим ответам сервера':'Измерений пока нет'}>
  {[22,72,122].map(line=><path key={line} className="ping-gridline" d={`M16 ${line}H584`}/>)}
  <text x="18" y="15">{Math.round(top)} мс</text><text x="18" y="145">0 мс</text>
  {segments.map((d,i)=><path key={i} className="ping-trace-line" d={d}/>)}
  {samples.filter(s=>s.status!=='success').map(s=><path key={s.sequence} className="ping-loss" d={`M${x(s.sequence)-2} 124l4 5m-4 0l4-5`}/>)}
  {!samples.length&&<text x="300" y="79" textAnchor="middle">График появится после реального замера</text>}
 </svg>;
}
function Measurement({title,trial,current,tcp=false}:{title:string;trial?:PingTrial;current?:PingSample[];tcp?:boolean}){
 const samples=current?.length?current:trial?.samples||[],summary:PingSummary=summarizePing(samples);
 return <article className="ping-measurement"><div className="ping-card-label"><Activity size={16}/>{title}<span>{summary.sent?`${summary.received}/${summary.sent} ответов`:'Нет замеров'}</span></div>
  <div className="ping-value">{ms(summary.medianMs)}<small>мс · {tcp?'TCP-подключение':'медиана ICMP'}</small></div><Trace samples={samples}/>
  <dl className="ping-stats"><div><dt>{tcp?'Сбои подключения':'Потери'}</dt><dd>{summary.lossPct===null?'—':`${summary.lossPct}%`}</dd></div><div><dt>95% ответов</dt><dd>{ms(summary.p95Ms)}<small> мс</small></dd></div><div><dt>Разброс</dt><dd>{ms(summary.jitterMs)}<small> мс</small></dd></div></dl>
 </article>;
}
const emptyProvider={id:'cloudflare-warp' as const,installed:false,ready:false,connected:false,managed:false};
export function PingPanel({native,active,onCompleted}:{native:boolean;active:boolean;onCompleted:()=>void}){
 const api=window.lagophone,available=native&&typeof api?.pingStatus==='function';
 const [targetId,setTargetId]=useState(PING_TARGETS[0].id),[state,setState]=useState<PingState>({supported:available,running:false,operation:null,provider:emptyProvider,last:null,recoveryRequired:false});
 const [report,setReport]=useState<PingReport|null>(null),[pending,setPending]=useState(false),[error,setError]=useState(''),[consent,setConsent]=useState(false);
 const [live,setLive]=useState<Partial<Record<PingProgress['phase'],PingSample[]>>>({}),[phase,setPhase]=useState('');const restored=useRef(false),acceptProgress=useRef(false);
 const busy=pending||state.running,target=PING_TARGETS.find(item=>item.id===targetId)!,service=PING_SERVICES.find(item=>item.id===target.service)!,tcp=target.method==='tcp';
 function chooseTarget(id:string){restored.current=true;setTargetId(id);setReport(null);setLive({});setError('')}
 async function refresh(){if(!available)return;try{const next=await api!.pingStatus(consent);setState(next);if(!restored.current&&next.last){setReport(next.last);setTargetId(next.last.targetId)}restored.current=true}catch(e){setError(old=>old||(e as Error).message)}}
 useEffect(()=>{if(!available||!active)return;void refresh();const timer=setInterval(()=>void refresh(),3000);return()=>clearInterval(timer)},[available,active,consent]);
 useEffect(()=>{if(!available)return;return api!.onPingProgress(value=>{if(!acceptProgress.current)return;setPhase(value.phase);if(value.sample)setLive(old=>({...old,[value.phase]:[...(old[value.phase]||[]),value.sample!]}))})},[available]);
 async function run(kind:'measure'|'compare'|'connect'|'manual'|'disconnect'){
  if(!available||busy)return;setError('');setPending(true);
  if(kind==='measure'||kind==='compare'){acceptProgress.current=true;setLive({});setReport(null);setPhase(kind==='compare'?'preparing':'baseline')}
  try{
   if(kind==='measure'||kind==='compare'){const result=kind==='measure'?await api!.pingMeasure(targetId):await api!.pingCompare(targetId,consent);setReport(result);acceptProgress.current=false;setLive({})}
   else if(kind==='connect')await api!.pingConnect(consent);
   else if(kind==='manual')await api!.pingConnect(consent,{intent:'manual',targetId});
   else await api!.pingDisconnect();
   onCompleted();
  }catch(e){setError((e as Error).message)}finally{acceptProgress.current=false;setPending(false);setPhase('');await refresh()}
 }
 const comparison=report?.comparison,provider=state.provider;
 const verdict=comparison?.verdict==='improved'?`${tcp?'TCP-подключение':'До тестового сервера'} быстрее на ${ms(comparison.gainMs)} мс`:comparison?.verdict==='unstable'?'Исходное подключение изменилось во время проверки':comparison?.verdict==='not-improved'?'Устойчивого улучшения не обнаружено':comparison?'Недостаточно данных для сравнения':'';
 return <div className="ping-workspace">
  <section className="ping-intro"><div className="ping-intro-icon"><Network size={25}/></div><div><span className="eyebrow">{service.eyebrow}</span><h2>Проверь пинг.</h2><p>Выбери приложение и нажми «Буст». Если пинг станет ниже — включим ускорение.</p></div><span className="ping-provider-badge"><span className={provider.connected?'is-live':''}/>{provider.connected?'Внешний маршрут включён':provider.ready?'Исходное подключение':'Маршрут не проверен'}</span></section>
  {!available&&<div className="ping-note"><Info size={17}/><p>Реальные замеры и маршрутизация доступны в Windows-приложении. В предпросмотре результаты не подставляются.</p></div>}
  <section className="ping-start-guide" aria-label="Как запустить буст"><h3>Перед запуском</h3><ol><li><b>Закрой игру.</b> Заверши звонки и загрузки.</li><li><b>Нажми «Буст».</b> Дождись окончания проверки.</li><li><b>Запускай игру.</b> Если улучшения нет — останется обычное подключение.</li></ol></section>
  <div className="ping-services" role="group" aria-label="Приложение для проверки">{PING_SERVICES.map(item=><button key={item.id} className={service.id===item.id?'is-selected':''} aria-pressed={service.id===item.id} disabled={busy} onClick={()=>chooseTarget(PING_TARGETS.find(target=>target.service===item.id)!.id)}>{item.title}<small>{item.id==='fortnite'?'Игровой датацентр':item.id==='discord'?'API и шлюз':'Лаунчер и загрузки'}</small></button>)}</div>
  <section className={'ping-consent-card'+(consent?' is-accepted':'')} aria-label="Разрешение на буст">
   <label className="ping-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/><span><strong>{consent?'Условия приняты — можно запускать буст':'Принять условия и разрешить буст'}</strong><small>Разрешаю WARP менять подключение всего ПК. Запускай вне матча, звонка или загрузки.</small></span><CheckCircle2 size={22} aria-hidden="true"/></label>
   <div className="ping-provider-links"><button disabled={!available} onClick={()=>void api!.pingSetup('terms')}>Условия Cloudflare WARP</button><button disabled={!available} onClick={()=>void api!.pingSetup('privacy')}>Обработка данных</button></div>
  </section>
  <section className="ping-controls"><label><span>Точка проверки · {tcp?'TCP 443':'ICMP'}</span><select aria-label="Точка проверки" value={targetId} onChange={e=>chooseTarget(e.target.value)} disabled={busy}>{PING_TARGETS.filter(item=>item.service===service.id).map(item=><option value={item.id} key={item.id}>{item.region}</option>)}</select><small>{target.host}{tcp?':443':''}</small></label><div className="ping-control-actions"><button className="button primary" disabled={!available||busy||!consent||provider.connected||state.recoveryRequired||provider.managed} onClick={()=>void run('compare')}><Network size={16}/>Буст</button>{provider.connected&&provider.owned&&<button className="button secondary" disabled={busy} onClick={()=>void run('disconnect')}><Unplug size={15}/>Отключить буст</button>}</div></section>
  {busy&&<div className="ping-progress" role="status"><LoaderCircle size={17} className="spin"/><span>{phase?stages[phase as keyof typeof stages]:stages[state.operation?.phase as keyof typeof stages]||'Проверяем подключение…'}{phase&&live[phase as keyof typeof live]?.length?` · ${live[phase as keyof typeof live]!.length}/50`:''}</span><button className="button secondary" onClick={()=>void api?.pingCancel()}><Square size={12}/>Остановить и вернуть подключение</button></div>}
  {error&&<div className="ping-note ping-error" role="alert"><Info size={17}/><p>{error}</p></div>}
  {state.warning&&<div className="ping-note" role="status"><Info size={17}/><p>{state.warning}</p></div>}
  {state.recoveryRequired&&<div className="ping-note ping-error" role="alert"><Info size={17}/><div><b>Нужно проверить отключение внешнего маршрута</b><p>Не удалось подтвердить возврат исходного подключения. Открой WARP или повтори отключение.</p>{provider.owned&&<button className="button secondary" disabled={busy} onClick={()=>void run('disconnect')}><Unplug size={15}/>Отключить маршрут GTM PC</button>}</div></div>}
  {verdict&&<section className={'ping-verdict '+(comparison?.verdict==='improved'?'is-better':'')}><CheckCircle2 size={20}/><div><h3>{verdict}</h3><p>{comparison?.verdict==='improved'?`Пинг стал ниже. Буст включён. ${tcp?'Качество голоса и загрузок нужно проверить отдельно.':'Осталось проверить результат в матче Fortnite.'}`:'Оставили обычное подключение.'}</p></div></section>}
  <div className="ping-measurements"><Measurement title={report?.kind==='baseline'?'Текущее подключение':'Исходное подключение'} trial={report?.baseline||report?.directBefore} current={live.baseline} tcp={tcp}/><Measurement title="Через внешний маршрут" trial={report?.routed} current={live.routed} tcp={tcp}/></div>
  {(report?.directAfter||live.repeat?.length)&&<details className="ping-repeat"><summary>Повтор исходного подключения · {ms(report?.comparison?.directAfter.medianMs)} мс</summary><Measurement title="Контрольный замер" trial={report?.directAfter} current={live.repeat} tcp={tcp}/></details>}
  {provider.error&&!provider.error.startsWith('Нажмите «Буст»')&&<div className="ping-note ping-error" role="alert"><Info size={17}/><p>{provider.error}</p></div>}
  <details className="ping-how"><summary>Как работает буст</summary><p>Всё настроим автоматически, без аккаунта. Сравним пинг до и после. Если улучшения нет — оставим обычное подключение.</p><p>При первой установке подтверди запрос Windows.</p></details>
  {provider.connected&&provider.owned&&<p className="ping-provider-error">Буст работает до отключения, даже если закрыть GTM PC.</p>}
  <div className="ping-bottom"><p><Info size={15}/>{service.notice} При ошибке теста ускорение не засчитывается.</p>{available&&<button className="button secondary" disabled={busy} onClick={()=>{setError('');void api?.pingExport().catch(e=>setError(e.message))}}><Download size={14}/>Сохранить отчёт</button>}</div>
 </div>;
}
