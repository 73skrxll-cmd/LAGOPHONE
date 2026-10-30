import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, Check, CheckCircle2, ChevronDown, Cpu, Gamepad2, Info, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Zap, X } from 'lucide-react';
import catalog from '../shared/optimization.json';

export type OptimizationResult={ok:boolean;error?:string;cancelled?:boolean;restored?:boolean;noChanges?:boolean;report:{id:string;status:string;message:string}[]};
export type OptimizationStatus={ok:boolean;error?:string;active:boolean;needsRecovery?:boolean;profile?:string;remaining:number;created?:string;power?:string;checks:{id:string;enabled:boolean}[];last?:OptimizationResult & {date:string;mode:string};running?:boolean};
export type OptimizationInput={profile:string;uses:Record<string,boolean>;power:string;game:string;sysmain:boolean;selected:string[]};
export function OptimizationMeter({status,native,error=''}:{status:OptimizationStatus|null;native:boolean;error?:string}){
 const checks=status?.checks||[],count=checks.filter(c=>c.enabled).length;
 const recovery=status?.active&&(status.needsRecovery||status.last?.ok===false);
 const ratio=checks.length?count/checks.length:0;
 const level=!native?'Предпросмотр':status?.running?'Выполняется…':error||!status?.ok?'Не проверено':recovery?'Нужен откат':ratio>=1?'Хорошо':ratio>=.5?'Средне':'Требует настройки';
 return <section className={'optimization-meter '+(recovery?'needs-recovery':'')} aria-label="Уровень оптимизации"><div className="meter-symbol"><Activity size={25}/></div><div className="meter-description"><span className="eyebrow">УРОВЕНЬ НАСТРОЙКИ СИСТЕМЫ</span><h3>{level}<span>{status?.active?catalog.profiles.find(p=>p.id===status.profile)?.name+' профиль':'Проверка параметров Windows'}</span></h3><p>{!native?'Данные Windows недоступны в деморежиме.':error||status?.error||(!status?'Чтение состояния…':`${count} из ${checks.length} проверяемых настроек соответствуют профилю. Это не оценка FPS или скорости компьютера.`)}</p></div><div className="meter-bars" aria-hidden="true">{[0,1,2,3,4,5,6,7,8,9].map(i=><i key={i} className={native&&status?.ok&&i<Math.round(ratio*10)?'lit':''}/>)}</div></section>
}
function preferences(){
 const fallback={profile:'basic',uses:Object.fromEntries(catalog.features.map(f=>[f.id,true])),power:'keep',game:'none'};
 try {const saved=JSON.parse(localStorage.getItem('lagophone-optimization-preferences')||'null');if(!saved)return fallback;
 return {profile:catalog.profiles.some(p=>p.id===saved.profile)?saved.profile:'basic',power:['keep','balanced','high','ultimate'].includes(saved.power)?saved.power:'keep',game:catalog.games.some(g=>g.id===saved.game)?saved.game:'none',uses:Object.fromEntries(catalog.features.map(f=>[f.id,typeof saved.uses?.[f.id]==='boolean'?saved.uses[f.id]:true]))};
 }catch{return fallback}
}
export function OptimizationPanel({native,version,mismatch,status,error,onRefresh}:{native:boolean;version:'10'|'11';mismatch:boolean;status:OptimizationStatus|null;error:string;onRefresh:()=>Promise<void>}){
 const [profile,setProfile]=useState<string>(()=>preferences().profile),[uses,setUses]=useState<Record<string,boolean>>(()=>preferences().uses),[power,setPower]=useState<string>(()=>preferences().power),[game,setGame]=useState<string>(()=>preferences().game),[gamePath,setGamePath]=useState(''),[sysmain,setSysmain]=useState(false),[selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(''),[review,setReview]=useState(false),[message,setMessage]=useState(''),[result,setResult]=useState<OptimizationResult|null>(null);
 useEffect(()=>{try{localStorage.setItem('lagophone-optimization-preferences',JSON.stringify({profile,uses,power,game}))}catch{}},[profile,uses,power,game]);
 const reviewRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
   if(!review)return;
   const previous=document.activeElement as HTMLElement|null;
   const modal=reviewRef.current;
   const controls=()=>Array.from(modal?.querySelectorAll<HTMLButtonElement>('button:not([disabled])')||[]);
   controls()[0]?.focus();
   const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setReview(false)}if(event.key==='Tab'){const items=controls(),first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};
   document.addEventListener('keydown',onKey);
   return()=>{document.removeEventListener('keydown',onKey);previous?.focus()};
 },[review]);
 const level=catalog.profiles.find(p=>p.id===profile)!.level;
 const eligible=useMemo(()=>catalog.steps.filter(s=>s.level<=level&&('special' in s?(s.special==='power'?power!=='keep':game!=='none'&&!!gamePath):'experimental' in s?sysmain:!s.feature||!uses[s.feature])),[level,uses,power,game,gamePath,sysmain]);
 useEffect(()=>{setSelected(eligible.map(s=>s.id))},[eligible]);
 const chosen=eligible.filter(s=>selected.includes(s.id));
 const report=result||status?.last;
 async function execute(mode:'apply'|'restore'){
   if(!native){setMessage('Настройки не изменены: выполнение доступно только в Windows.');setReview(false);return}
   setBusy(mode);setMessage('');setReview(false);
   try{
     const response=mode==='apply'?await window.lagophone!.optimize({profile,uses,power,game,sysmain,selected:chosen.map(s=>s.id)},version):await window.lagophone!.restoreOptimization();
     setResult(response);
     setMessage(response.cancelled?'Действие отменено.':response.ok?(mode==='restore'?'Исходные значения восстановлены.':response.noChanges?'Все выбранные настройки уже установлены или недоступны.':'Профиль применён. Проверьте отчёт: некоторые действия могут быть пропущены.'):(response.error||'Ошибка выполнения')+(response.restored?' Изменения отменены.':' Проверьте отчёт и используйте откат.'));
   }catch(e){setMessage((e as Error).message)}finally{await onRefresh();setBusy('')}
 }
 async function chooseGame(){
   if(!native){setMessage('Выбор EXE игры доступен в настольной версии Windows.');return}
   try{const value=await window.lagophone!.chooseGame(game);if(value)setGamePath(value)}catch(e){setMessage((e as Error).message)}
 }
 return <div className="optimizer">
  <OptimizationMeter status={status} native={native} error={error}/>
  <div className="automation-intro"><div><span className="eyebrow">АВТОМАТИЧЕСКАЯ ОПТИМИЗАЦИЯ</span><h2>Выберите профиль. Остальное — за нами.</h2><p>Сначала отметьте нужные функции. Программа сохранит исходные значения, применит выбранное и проверит результат.</p></div><ShieldCheck size={35}/></div>
  <fieldset disabled={!!busy||!!status?.active||!!status?.running} className="optimizer-options"><legend className="sr-only">Параметры оптимизации</legend>
  <div className="profile-grid">{catalog.profiles.map(p=><button type="button" key={p.id} className={'profile-card '+(profile===p.id?'selected':'')} onClick={()=>setProfile(p.id)} aria-pressed={profile===p.id}><span className="profile-head"><span>{p.level===0?<ShieldCheck size={23}/>:p.level===1?<Zap size={23}/>:<Cpu size={23}/>}</span><i>{profile===p.id?<Check size={15}/>:p.level+1}</i></span><h3>{p.name}</h3><p>{p.description}</p><span className="profile-caption">{p.level===0?'Без отключения служб':p.level===1?'Только неиспользуемые функции':'Больше ограничений · изучите последствия'}</span></button>)}</div>
  <div className="section-heading"><h2>Чем вы пользуетесь?</h2><span className="muted">Галочка = сохранить функцию</span></div>
  <div className="feature-grid">{catalog.features.map(f=><label className={'feature-option '+(uses[f.id]?'preserve':'')} key={f.id}><input type="checkbox" checked={uses[f.id]} onChange={e=>setUses({...uses,[f.id]:e.target.checked})}/><span><b>{f.name}</b><small>{f.detail}</small></span><span className="feature-label">{uses[f.id]?'Сохранить':'Не пользуюсь'}</span></label>)}</div>
  <div className="optimizer-config"><label className="config-card"><span><Zap size={19}/> План питания</span><select value={power} onChange={e=>setPower(e.target.value)} aria-label="План питания"><option value="keep">Оставить текущий</option><option value="balanced">Сбалансированный</option><option value="high">Высокая производительность</option><option value="ultimate">Максимальная производительность</option></select><small>Более высокий расход энергии, нагрев и шум. Доступность зависит от ПК: на Modern Standby нужного плана может не быть. Программа не меняет BIOS и не создаёт скрытые планы.</small></label>
  <div className="config-card"><label><span><Gamepad2 size={19}/> Профиль игры</span><select value={game} onChange={e=>{setGame(e.target.value);setGamePath('')}} aria-label="Игра">{catalog.games.map(g=><option value={g.id} key={g.id}>{g.name}</option>)}</select></label><small>Для конкретного EXE задаётся предпочтение производительной видеокарты. Другие игры, файлы игры, античит, сетевой стек и параметры загрузки не меняются.</small>{game!=='none'&&<><button className="button secondary" onClick={()=>void chooseGame()}>Выбрать EXE игры <ChevronDown size={14}/></button><span className="game-path">{gamePath||'Без EXE будут применены только общие настройки.'}</span></>}</div></div>
  {profile==='deep'&&<label className="sysmain-option"><input type="checkbox" checked={sysmain} onChange={e=>setSysmain(e.target.checked)}/><span><b>Отключить SysMain — экспериментально</b><small>Это не универсальное ускорение. Может ухудшить запуск игр и программ; по умолчанию выключено. Предварительное кеширование памяти перестанет работать.</small></span></label>}
  <div className="section-heading"><h2>Будет изменено <span>{chosen.length}</span></h2><span className="muted">Любой пункт можно исключить</span></div>
  <div className="changes-list">{eligible.map(s=><label key={s.id}><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(e.target.checked?[...selected,s.id]:selected.filter(id=>id!==s.id))}/><span><b>{s.name}</b><small>{s.detail}</small></span>{'service'in s&&<code>{s.service}</code>}</label>)}{!eligible.length&&<p>Нет подходящих изменений. Измените профиль или ответы.</p>}</div>
  </fieldset>
  <div className="compatibility-note"><ShieldCheck size={22}/><div><b>Без отключения компонентов Store, Xbox и античитов</b><p>Не изменяются Defender, Secure Boot, TPM, VBS, Windows Update, Gaming Services, службы FACEIT и Vanguard. Game Bar не удаляется. Это снижает риск конфликтов, но не является гарантией совместимости с каждой игрой. Каскадное отключение зависимых служб запрещено.</p></div></div>
  {status?.active&&<div className="active-optimization"><RotateCcw size={22}/><div><h3>Есть сохранённое состояние до оптимизации</h3><p>Сначала выполните откат, чтобы новый профиль не затёр исходные значения. В резервной копии: {status.remaining} параметров. При изменениях сторонними программами конфликтующие пункты остаются для повторного отката.</p></div><button className="button secondary" disabled={!!busy||!!status?.running} onClick={()=>void execute('restore')}>{busy==='restore'?'Восстановление…':'Вернуть как было'}</button></div>}
  <div className="apply-bar"><div><b>{busy?'Windows выполняет операцию…':`${chosen.length} действий · Windows ${version}`}</b><p>{busy?'Подтвердите UAC, если он появился. Дождитесь проверки результата и не закрывайте приложение.':'Перед изменениями сохраняется резервная копия. Для служб нужен запрос прав администратора.'}</p></div><button className="button primary" disabled={!!busy||!!status?.running||!chosen.length||!!status?.active||mismatch||(native&&!status?.ok)} onClick={()=>setReview(true)}>{busy?<LoaderCircle className="spin" size={17}/>:<Sparkles size={17}/>}Оптимизировать</button></div>
  {message&&<div className="optimization-message" role="status"><Info size={18}/>{message}</div>}
  {report&&<section className="optimization-report"><div className="section-heading"><h2>Результат выполнения</h2><button className="button secondary" disabled={!!busy} onClick={()=>void onRefresh()}>Проверить состояние</button></div>{report.error&&<p className="report-error">{report.error}</p>}{report.cancelled&&<p>Пользователь отменил действие. Изменений нет.</p>}<div>{report.report.map((r,i)=><div className={'report-row '+r.status} key={i}><span>{r.status==='applied'||r.status==='restored'?<CheckCircle2 size={16}/>:<Info size={16}/>}</span><div><b>{catalog.steps.find(s=>s.id===r.id)?.name||r.id}</b><p>{r.message}</p></div><small>{{applied:'Применено',restored:'Восстановлено',skipped:'Пропущено',error:'Ошибка'}[r.status]||r.status}</small></div>)}</div></section>}
  {review&&<div className="modal-backdrop"><div ref={reviewRef} className="modal optimization-review" role="dialog" aria-modal="true" aria-labelledby="optimization-title"><button className="modal-close" aria-label="Закрыть" onClick={()=>setReview(false)}><X size={20}/></button><ShieldCheck size={30} className="green-text"/><h2 id="optimization-title">Проверка перед применением</h2><p>Профиль: {catalog.profiles.find(p=>p.id===profile)?.name}. Изменений: {chosen.length}.</p><div className="review-list">{chosen.map(s=><div key={s.id}><b>{s.name}</b><small>{s.detail}</small></div>)}</div><p>Все исходные значения сохраняются до первого изменения. При ошибке выполняется попытка отката с отдельным отчётом. После изменений может понадобиться повторный вход в Windows. Восстановление настроек не заменяет резервную копию личных файлов.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setReview(false)}>Отмена</button><button className="button primary" onClick={()=>void execute('apply')}>{native?'Применить профиль':'Проверить деморежим'}<Check size={15}/></button></div></div></div>}
 </div>
}
