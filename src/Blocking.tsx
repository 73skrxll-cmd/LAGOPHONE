import {useEffect,useState} from 'react';
import {ArrowRight,Check,ChevronDown,Download,Gamepad2,LoaderCircle,Play,Power,Search,ShieldOff,Square,Wifi} from 'lucide-react';
import type {BlockingState} from './bridge';
import './blocking.css';

type PillMode='on'|'off'|'busy'|'error';
function FixPill({mode,label}:{mode:PillMode;label?:string}){
 return <span className={'fix-pill is-'+mode} role="status"><span className="fix-pill-icon">{mode==='busy'?<LoaderCircle size={14}/>:<Power size={14}/>}</span><span className="fix-pill-label" key={label||mode}>{label||(mode==='on'?'ВКЛЮЧЕНО':mode==='off'?'ВЫКЛЮЧЕНО':mode==='error'?'ОШИБКА':'ПРОВЕРКА')}</span></span>;
}
const count=(rows:{ok:boolean}[])=>rows.filter(r=>r.ok).length;
export function Blocking(){
 const [state,setState]=useState<BlockingState|null>(null),[pending,setPending]=useState(''),[error,setError]=useState(''),[selected,setSelected]=useState('');
 useEffect(()=>{let disposed=false,reading=false;const refresh=async()=>{if(reading||document.hidden)return;reading=true;try{const value=await window.lagophone?.blockingStatus?.();if(!disposed&&value)setState(value)}catch{if(!disposed)setError('Не удалось получить состояние. Повторите попытку.')}finally{reading=false}};void refresh();const timer=setInterval(()=>void refresh(),700);return()=>{disposed=true;clearInterval(timer)}},[]);
 useEffect(()=>{if(state?.settings.profile)setSelected(state.settings.profile)},[state?.settings.profile,state?.lastReport?.at]);
 const label=(text?:string)=>text?.replace(/Zapret/g,'DiscordFix').replace(/\bfnport\b/gi,'FortniteFix')||'';
 async function action(name:string){setPending(name);setError('');try{if(!window.lagophone?.blockingAction)throw Error('Запустите Windows-версию GTM PC.');setState(await window.lagophone.blockingAction(name))}catch(e){setError((e as Error).message)}finally{setPending('')}}
 const fn=state?.fnport,discordOn=!!state?.zapret.running,fortniteOn=fn?.phase==='running',fortniteStarting=fn?.phase==='starting',fortniteChecking=fn?.phase==='checking',fortniteActive=fortniteOn||fortniteStarting||fortniteChecking;
 const searching=state?.operation?.kind==='selecting'||pending==='select',busy=!!pending||!!state?.operation,enabled=!!state?.supported,problem=label(error||state?.message),fnError=fn?.phase==='error'?label(fn.message):'';
 const report=state?.lastReport,profile=selected||state?.settings.profile||'general',chosen=state?.profiles.find(p=>p.id===profile),activeName=state?.profiles.find(p=>p.id===state.zapret.profile)?.name;
 const progress=state?.operation?.kind==='selecting'?Math.min(100,100*(state.operation.index||0)/(state.operation.total||1)):0;
 const discordBusy=searching||pending==='zapret-start'||pending==='zapret-stop'||pending.startsWith('activate-profile:');
 const fortniteBusy=fortniteStarting||fortniteChecking||pending.startsWith('fnport');
 const recommended=report?.verified&&report.phase==='completed'?report.selected:null;
 const recommendedRow=report?.results.find(r=>r.profile===recommended),complete=!!recommendedRow&&count(recommendedRow.rows)===recommendedRow.rows.length;
 return <section className="blocking-simple">
  <div className="fix-grid">
   <article className="fix-card" data-fix="discord">
    <div className="fix-heading"><span className="tile-icon"><ShieldOff size={24}/></span><FixPill mode={discordBusy?'busy':discordOn?'on':'off'} label={!state?'ЗАГРУЗКА':searching?'ПОДБОР':undefined}/></div>
    <h2>DiscordFix</h2><p className="fix-description">Discord и YouTube. Стратегия под ваше подключение.</p>
    <div className="fix-selected"><span>Стратегия</span><b>{discordOn?activeName:chosen?.name||'Основная'}</b></div>
    <button className="button primary fix-toggle" disabled={!enabled||busy} onClick={()=>void action(discordOn?'zapret-stop':'activate-profile:'+profile)}>{discordBusy?<LoaderCircle size={17} className="spin"/>:discordOn?<Square size={16}/>:<Play size={17}/>} {discordOn?'Отключить':'Включить'}</button>
    <p className="fix-status">{searching?'Временно проверяем варианты. После поиска вернём прежний режим.':discordOn?'Фикс работает. Проверьте голос или видео в Discord.':'Сначала найдите подходящую стратегию в блоке ниже.'}</p>
   </article>
   <article className="fix-card" data-fix="fortnite">
    <div className="fix-heading"><span className="tile-icon"><Gamepad2 size={25}/></span><FixPill mode={fortniteBusy?'busy':fortniteOn?'on':fnError?'error':'off'} label={!state?'ЗАГРУЗКА':undefined}/></div>
    <h2>FortniteFix</h2><p className="fix-description">Помощь при подключении Fortnite к матчу.</p>
    <div className="fix-selected"><span>Подбор портов</span><b>Автоматически</b></div>
    <button className="button primary fix-toggle" disabled={!enabled||busy} onClick={()=>void action(fortniteActive?'fnport-stop':'fnport-start')}>{fortniteBusy?<LoaderCircle size={17} className="spin"/>:fortniteActive?<Square size={16}/>:<Play size={17}/>} {fortniteActive?'Отключить':'Включить'}</button>
    <p className="fix-status">{fortniteOn?'Запустите игру через Epic. Не включайте VPN во время матча.':fortniteStarting?'Создаётся игровое подключение…':fortniteChecking?'Идёт проверка соединения.':'Отключите VPN и закройте Fortnite. Включите фикс, затем запустите игру через Epic.'}</p>{fnError&&<p className="fix-error" role="alert">{fnError}</p>}
   </article>
  </div>
  {problem&&<p className="fix-error fix-common-error" role="alert">{problem}</p>}
  <section className="strategy-finder" aria-labelledby="strategy-title" aria-busy={searching}>
   <div className="strategy-intro"><div><span className="strategy-eyebrow"><Wifi size={13}/> ПОД ВАШЕ ПОДКЛЮЧЕНИЕ</span><h2 id="strategy-title">Найдём вашу стратегию.</h2><p>Переберём {state?.profiles.length||22} варианта DiscordFix, сравним доступность сервисов и повторно проверим подходящий.</p></div><button className={'button '+(searching?'secondary':'primary')+' strategy-search'} disabled={!enabled||(searching?pending==='cancel':busy||fortniteActive)} onClick={()=>void action(searching?'cancel':'select')}>{searching?<Square size={16}/>:<Search size={17}/>} {pending==='cancel'?'Останавливаем…':searching?'Остановить поиск':report?'Повторить поиск':'Найти стратегию'}</button></div>
   <div className="strategy-preparation">{fortniteActive?'Отключите FortniteFix перед поиском.':'Перед поиском закройте игры и отключите VPN. Проверка может занять несколько минут.'}</div>
   {searching?<div className="strategy-progress" role="status"><div><span><LoaderCircle size={15} className="spin"/> {label(state?.operation?.label)||'Подготовка проверки'}</span><b>{state?.operation?.index||0} / {state?.operation?.total||(state?.profiles.length||22)+2}</b></div><progress aria-label="Ход поиска стратегии" value={progress} max={100}/><p>Показываем только выполненные проверки. Предыдущий режим вернётся после остановки.</p></div>:!report?<ol className="strategy-steps"><li><span>01</span><div><b>Проверим подключение</b><small>Измерим доступность без фикса.</small></div></li><li><span>02</span><div><b>Переберём стратегии</b><small>По методике утилиты из архива.</small></div></li><li><span>03</span><div><b>Вы включите подходящую</b><small>Результат и выбор останутся здесь.</small></div></li></ol>:null}
   {report&&<div className="strategy-results"><div className="strategy-result-heading"><div><h3>{searching?'Проверяем стратегии':report.phase==='cancelled'?'Поиск остановлен':report.phase==='error'||report.phase==='interrupted'?'Поиск не завершён':recommended?(complete?'Подходящая стратегия найдена':'Лучший результат проверки'):'Результаты проверки'}</h3><p role="status">{searching?'Результаты появляются по мере проверки.':label(report.message)}</p></div>{report.baseline.length>0&&<span className="strategy-baseline">Без фикса <b>{count(report.baseline)} / {report.baseline.length}</b></span>}</div>
    {report.results.length>0&&<div className="strategy-result-list" aria-label="Результаты стратегий">{report.results.map(row=><button key={row.profile} className={'strategy-result'+(profile===row.profile?' is-chosen':'')+(recommended===row.profile?' is-recommended':'')} disabled={!enabled||busy} onClick={()=>setSelected(row.profile)} aria-pressed={profile===row.profile}><span className="strategy-radio">{profile===row.profile&&<Check size={13}/>}</span><span className="strategy-result-name"><b>{row.name}</b><small>{row.error?label(row.error):recommended===row.profile?'Повторная проверка пройдена':row.verification?'Не подтверждена повторно':'Проверено'}</small></span><span className="strategy-result-score">{row.error?'Ошибка':count(row.rows)+' / '+row.rows.length}<small>успешных тестов</small></span>{recommended===row.profile&&<span className="strategy-recommendation">{complete?'Подходит по тестам':'Частичный доступ'}</span>}</button>)}</div>}
   </div>}
   <div className="strategy-apply"><label>Стратегия DiscordFix<select aria-label="Стратегия DiscordFix" disabled={!enabled||busy} value={profile} onChange={e=>setSelected(e.target.value)}>{state?.profiles.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label><button className="button primary" disabled={!enabled||busy||(discordOn&&state?.zapret.profile===profile)} onClick={()=>void action('activate-profile:'+profile)}>{pending.startsWith('activate-profile:')?<LoaderCircle size={16} className="spin"/>:<ArrowRight size={17}/>} {discordOn&&state?.zapret.profile===profile?'Выбранная включена':'Включить выбранную'}</button></div>
   <p className="strategy-scope">Поиск проверяет HTTPS с TLS 1.2 / 1.3 и получение данных. Голос Discord и вход в Fortnite проверяйте в самих приложениях.</p>
   <details className="strategy-details"><summary>Что проверялось <ChevronDown size={14}/></summary><div><p>Адаптирована методика «test zapret.ps1» из вашего архива: запуск каждой исходной стратегии, отдельные TLS-соединения и сравнение результатов. Сертификаты проверяются, лучшие варианты проходят повторную серию. Если обычное подключение даёт тот же результат, улучшение не заявляется.</p><p>FortniteFix использует отдельное ядро подбора портов. Эти стратегии относятся к DiscordFix.</p>{report?.baseline.length? <ul>{[...new Map(report.baseline.map(r=>[r.url,r])).values()].map(r=><li key={r.url}>{r.name} · <span>{r.url}</span></li>)}</ul>:null}<button className="button secondary" disabled={!enabled||busy} onClick={()=>void window.lagophone?.blockingReport?.().catch(()=>setError('Не удалось сохранить отчёт.'))}><Download size={15}/>Сохранить отчёт</button></div></details>
  </section>
 </section>;
}
