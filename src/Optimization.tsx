import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDown, Check, CheckCircle2, ChevronDown, Cpu, Gamepad2, Info, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Zap, X } from 'lucide-react';
import catalog from '../shared/optimization.json';

export type OptimizationResult={ok:boolean;error?:string;cancelled?:boolean;restored?:boolean;noChanges?:boolean;report:{id:string;status:string;message:string}[]};
export type OptimizationStatus={ok:boolean;error?:string;active:boolean;needsRecovery?:boolean;profile?:string;remaining:number;availability?:Record<string,{available:boolean;reason?:string}>;created?:string;power?:string;checks:{id:string;enabled:boolean}[];last?:OptimizationResult & {date:string;mode:string};running?:boolean};
export type OptimizationInput={profile:string;uses:Record<string,boolean>;power:string;game:string;sysmain:boolean;selected:string[]};
export function OptimizationMeter({status,native,error=''}:{status:OptimizationStatus|null;native:boolean;error?:string}){
 const checks=status?.checks||[],count=checks.filter(c=>c.enabled).length;
 const recovery=status?.active&&(status.needsRecovery||status.last?.ok===false);
 const ratio=checks.length?count/checks.length:0;
 const level=!native?'Предпросмотр':status?.running?'Выполняется…':error||!status?.ok?'Не проверено':recovery?'Нужен откат':ratio>=1?'Хорошо':ratio>=.5?'Средне':'Требует настройки';
 return <section className={'optimization-meter '+(recovery?'needs-recovery':'')} aria-label="Уровень оптимизации"><div className="meter-symbol"><Activity size={25}/></div><div className="meter-description"><span className="eyebrow">УРОВЕНЬ НАСТРОЙКИ СИСТЕМЫ</span><h3>{level}<span>{status?.active?catalog.profiles.find(p=>p.id===status.profile)?.name+' профиль':'Проверка параметров Windows'}</span></h3><p>{!native?'Данные Windows недоступны в деморежиме.':error||status?.error||(!status?'Чтение состояния…':`${count} из ${checks.length} проверяемых настроек соответствуют профилю. Это не оценка FPS или скорости компьютера.`)}</p></div><div className="meter-bars" aria-hidden="true">{[0,1,2,3,4,5,6,7,8,9].map(i=><i key={i} className={native&&status?.ok&&i<Math.round(ratio*10)?'lit':''}/>)}</div></section>
}
function preferences(){
 const fallback={profile:'basic',uses:Object.fromEntries(catalog.features.map(f=>[f.id,f.defaultUse])),power:'keep',game:'none'};
 try {const saved=JSON.parse(localStorage.getItem('lagophone-optimization-preferences')||'null');if(!saved)return fallback;
 return {profile:catalog.profiles.some(p=>p.id===saved.profile)?saved.profile:'basic',power:['keep','balanced','high','ultimate','lagophone'].includes(saved.power)&&(saved.power!=='lagophone'||saved.profile==='deep')?saved.power:'keep',game:catalog.games.some(g=>g.id===saved.game)?saved.game:'none',uses:Object.fromEntries(catalog.features.map(f=>[f.id,typeof saved.uses?.[f.id]==='boolean'?saved.uses[f.id]:f.defaultUse]))};
 }catch{return fallback}
}
export function OptimizationPanel({native,version,mismatch,status,error,onRefresh}:{native:boolean;version:'10'|'11';mismatch:boolean;status:OptimizationStatus|null;error:string;onRefresh:()=>Promise<void>}){
 const [profile,setProfile]=useState<string>(()=>preferences().profile),[uses,setUses]=useState<Record<string,boolean>>(()=>preferences().uses),[power,setPower]=useState<string>(()=>preferences().power),[game,setGame]=useState<string>(()=>preferences().game),[gamePath,setGamePath]=useState(''),[sysmain,setSysmain]=useState(false),[overrides,setOverrides]=useState<Record<string,boolean>>({}),[category,setCategory]=useState('Все'),[busy,setBusy]=useState(''),[review,setReview]=useState(false),[message,setMessage]=useState(''),[result,setResult]=useState<OptimizationResult|null>(null);
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
 const applyRef=useRef<HTMLDivElement>(null),restoreRef=useRef<HTMLDivElement>(null);
 const goToApply=()=>{const target=status?.active?restoreRef.current:applyRef.current;target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});target?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true})};
 const level=catalog.profiles.find(p=>p.id===profile)!.level;
 const profileSteps=useMemo(()=>catalog.steps.filter(s=>s.level<=level),[level]);
 const eligible=useMemo(()=>profileSteps.filter(s=>
  status?.availability?.[s.id]?.available!==false &&
  (s.special==='power'?power!=='keep':s.special==='game'?game!=='none'&&!!gamePath:s.id==='sysmain'?sysmain:!s.feature||!uses[s.feature])
 ),[profileSteps,uses,power,game,gamePath,sysmain,status]);
 const chosen=eligible.filter(s=>overrides[s.id]??s.defaultSelected!==false);
 const visibleSteps=profileSteps.filter(s=>category==='Все'||s.category===category);
 const categories=['Все',...new Set(profileSteps.map(s=>s.category))];
 function changeProfile(id:string){setProfile(id);setOverrides({});setCategory('Все');setPower(id==='deep'?'lagophone':id==='balanced'?'high':'keep');if(id!=='deep')setSysmain(false)}
 function blockReason(step:typeof catalog.steps[number]){
   if(status?.availability?.[step.id]?.available===false)return status.availability[step.id].reason||'Недоступно на этом ПК';
   if(step.feature&&uses[step.feature])return 'Сохранено: '+catalog.features.find(f=>f.id===step.feature)?.name;
   if(step.special==='power'&&power==='keep')return 'Выбран текущий план питания';
   if(step.special==='game'&&!gamePath)return 'Сначала выберите игру и её EXE';
   if(step.id==='sysmain'&&!sysmain)return 'Включите экспериментальный пункт SysMain ниже';
   return '';
 }
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
  <div className="profile-grid">{catalog.profiles.map(p=>{
   const total=catalog.steps.filter(s=>s.level<=p.level&&!s.special).length;
   const added=catalog.steps.filter(s=>s.level===p.level&&!s.special).length;
   return <button type="button" key={p.id} className={'profile-card '+(profile===p.id?'selected':'')} onClick={()=>changeProfile(p.id)} aria-label={p.name+' профиль'} aria-pressed={profile===p.id}><span className="profile-head"><span>{p.level===0?<ShieldCheck size={23}/>:p.level===1?<Zap size={23}/>:<Cpu size={23}/>}</span><i>{profile===p.id?<Check size={15}/>:p.level+1}</i></span><h3>{p.name}<strong className="profile-number">{total}</strong></h3><p>{p.description}</p><span className="profile-caption">{p.level===0?'Без отключения рабочих функций':`+${added} настроек к предыдущему уровню`} · {profile===p.id?'ПРОФИЛЬ ВЫБРАН':'Выбрать профиль'}</span></button>
  })}</div>
  <div className="catalog-explanation"><Info size={18}/><p>Число на профиле — размер каталога. Вы выбираете конкретные действия ниже. Уже установленные, отсутствующие и неподдерживаемые настройки будут отмечены в отчёте; число записей реестра не означает прирост FPS.</p></div>
  <details className="feature-survey" open><summary>1. Какие функции нужно сохранить? <span>{Object.values(uses).filter(Boolean).length} сохранено</span></summary><p>Кнопка «Использую» защищает функцию от отключения. В базовом профиле функции не отключаются вообще; в старших часть необязательных функций предложена к отключению. Выбор «Не использую» только разрешает соответствующие твики — их всё ещё можно снять в списке.</p>
  <button type="button" className="button secondary survey-recommend" onClick={()=>setUses(Object.fromEntries(catalog.features.map(f=>[f.id,f.defaultUse])))}>Рекомендуемые ответы · проверьте перед применением</button><div className="feature-grid">{catalog.features.map(f=><div className={'feature-option '+(uses[f.id]?'preserve':'can-disable')} key={f.id}><span><b>{f.name}</b><small>{f.detail}</small><span className="feature-choice" role="group" aria-label={f.name}><button type="button" aria-pressed={uses[f.id]} className={uses[f.id]?'chosen':''} onClick={()=>setUses({...uses,[f.id]:true})}><ShieldCheck size={13}/> Использую — сохранить</button><button type="button" aria-pressed={!uses[f.id]} className={!uses[f.id]?'chosen':''} onClick={()=>setUses({...uses,[f.id]:false})}>Не использую</button></span></span></div>)}</div></details>
  <div className="optimizer-config"><label className="config-card"><span><Zap size={19}/> План питания</span><select value={power} onChange={e=>setPower(e.target.value)} aria-label="План питания"><option value="keep">Оставить текущий</option><option value="balanced">Сбалансированный</option><option value="high">Высокая производительность</option><option value="ultimate">Максимальная производительность (штатный)</option>{profile==='deep'&&<option value="lagophone">LAGOPHONE Performance · отдельный план</option>}</select><small>{power==='lagophone'?'Создаётся отдельная копия текущего плана: от сети CPU min/max 100%, boost Aggressive, PCIe ASPM выключено. Это запрос частоты, а не загрузка CPU на 100%. Режим батареи не меняется; возможен больший нагрев и шум. При откате возвращается прежний план, собственная копия удаляется.':'Переключается только существующий штатный план. Наличие зависит от ПК: на Modern Standby высокий план может отсутствовать. Не создаём штатные схемы принудительно.'}</small></label>
  <div className="config-card"><label><span><Gamepad2 size={19}/> Профиль конкретной игры</span><select value={game} onChange={e=>{setGame(e.target.value);setGamePath('')}} aria-label="Игра">{catalog.games.map(g=><option value={g.id} key={g.id}>{g.name}</option>)}</select></label><small>Выбор названия игры сам по себе не меняет Windows. Для настройки только этой игры нужен её основной EXE. Переключатели изменений находятся в категории «Игры» ниже.</small>{game!=='none'&&<><button className="button secondary" onClick={()=>void chooseGame()}>Выбрать EXE игры <ChevronDown size={14}/></button><span className="game-path">{gamePath||'Нужен: '+catalog.games.find(g=>g.id===game)?.executables.join(' / ')}</span></>}</div></div>
  {game!=='none'&&<div className="game-effects"><h3><Gamepad2 size={18}/> Что произойдёт с {catalog.games.find(g=>g.id===game)?.name}</h3><dl><div><dt>Производительная видеокарта</dt><dd>{gamePath?(chosen.some(s=>s.id==='game-gpu')?'Выбрано: Windows получит GpuPreference=2 только для этого EXE.':'Не выбрано: графическое предпочтение не изменится.'):'Не применяется, пока не указан EXE.'}</dd></div><div><dt>Полноэкранная оптимизация</dt><dd>{chosen.some(s=>s.id==='game-fullscreen')?'Выбрано: отключается только для этого EXE. Результат может стать лучше или хуже; нужен перезапуск игры.':'Не меняется. Эксперимент можно отдельно выбрать в категории «Игры» на среднем/глубоком уровне.'}</dd></div><div><dt>Все остальные игры</dt><dd>Их EXE и параметры совместимости не меняются. Общие настройки Windows и питания действуют на весь ПК — они перечислены отдельно.</dd></div><div><dt>Античит и файлы игры</dt><dd>Не изменяются и не удаляются. Нет вмешательства в процессы, приоритеты античита, конфиги, Secure Boot или TPM. Проверка совместимости всё равно нужна.</dd></div></dl></div>}
  {profile==='deep'&&<label className="sysmain-option"><input type="checkbox" checked={sysmain} onChange={e=>setSysmain(e.target.checked)}/><span><b>Разрешить эксперимент с SysMain</b><small>После включения этот пункт станет доступен в списке. Отключение кеширования может замедлить запуск программ; по умолчанию выключено.</small></span></label>}
  <div className="section-heading"><h2>2. Выберите конкретные изменения <span>{chosen.length}</span></h2><button type="button" className="button secondary" onClick={()=>setOverrides({})}>Рекомендованные</button><button type="button" className="button secondary" onClick={()=>setOverrides(Object.fromEntries(catalog.steps.map(s=>[s.id,false])))}>Снять все</button></div>
  <div className="tabs tweak-categories">{categories.map(c=><button type="button" key={c} onClick={()=>setCategory(c)} className={category===c?'selected':''}>{c}<small>{profileSteps.filter(s=>c==='Все'||s.category===c).length}</small></button>)}</div>
  <div className="changes-list clear-choices">{visibleSteps.map(step=>{
    const blocked=blockReason(step),isChosen=chosen.some(s=>s.id===step.id);
    return <label key={step.id} className={(isChosen?'is-chosen':'not-chosen')+(blocked?' is-blocked':'')}><input type="checkbox" disabled={!!blocked} checked={isChosen} onChange={e=>setOverrides({...overrides,[step.id]:e.target.checked})}/><span className="choice-check" aria-hidden="true">{isChosen?<Check size={19}/>:null}</span><span><span className="choice-title"><b>{step.name}</b><em>{blocked?'СОХРАНЕНО / НЕДОСТУПНО':isChosen?'ВЫБРАНО':'НЕ ВЫБРАНО'}</em></span><small>{step.detail}</small>{blocked&&<strong className="blocked-reason">{blocked}</strong>}{!step.defaultSelected&&<strong className="experimental-tag">Отдельный эксперимент · автоматически не включается</strong>}</span>{step.service&&<code>{step.service}</code>}</label>
  })}</div>
  </fieldset>
  <div className="compatibility-note"><ShieldCheck size={22}/><div><b>Без отключения компонентов Store, Xbox и античитов</b><p>Не изменяются Defender, Secure Boot, TPM, VBS, Windows Update, Gaming Services, службы FACEIT и Vanguard. Game Bar не удаляется. Это снижает риск конфликтов, но не является гарантией совместимости с каждой игрой. Каскадное отключение зависимых служб запрещено.</p></div></div>
  {status?.active&&<div ref={restoreRef} className="active-optimization"><RotateCcw size={22}/><div><h3>Есть сохранённое состояние до оптимизации</h3><p>Сначала выполните откат, чтобы новый профиль не затёр исходные значения. В резервной копии: {status.remaining} параметров. При изменениях сторонними программами конфликтующие пункты остаются для повторного отката.</p></div><button className="button secondary" disabled={!!busy||!!status?.running} onClick={()=>void execute('restore')}>{busy==='restore'?'Восстановление…':'Вернуть как было'}</button></div>}
  <div ref={applyRef} className="apply-bar" id="apply-optimization"><div><b>{busy?'Windows выполняет операцию…':`${chosen.length} действий · Windows ${version}`}</b><p>{busy?'Подтвердите UAC, если он появился. Дождитесь проверки результата и не закрывайте приложение.':'Перед изменениями сохраняется резервная копия. Для служб нужен запрос прав администратора.'}</p></div><button className="button primary" disabled={!!busy||!!status?.running||!chosen.length||!!status?.active||mismatch||(native&&!status?.ok)} onClick={()=>setReview(true)}>{busy?<LoaderCircle className="spin" size={17}/>:<Sparkles size={17}/>}Оптимизировать</button></div>
  {message&&<div className="optimization-message" role="status"><Info size={18}/>{message}</div>}
  {report&&<section className="optimization-report"><div className="section-heading"><h2>Результат выполнения</h2><button className="button secondary" disabled={!!busy} onClick={()=>void onRefresh()}>Проверить состояние</button></div>{report.error&&<p className="report-error">{report.error}</p>}{report.cancelled&&<p>Пользователь отменил действие. Изменений нет.</p>}<div>{report.report.map((r,i)=><div className={'report-row '+r.status} key={i}><span>{r.status==='applied'||r.status==='restored'?<CheckCircle2 size={16}/>:<Info size={16}/>}</span><div><b>{catalog.steps.find(s=>s.id===r.id)?.name||r.id}</b><p>{r.message}</p></div><small>{{applied:'Применено',restored:'Восстановлено',skipped:'Пропущено',error:'Ошибка'}[r.status]||r.status}</small></div>)}</div></section>}
  <div className="selection-float" role="region" aria-label="Выбранные изменения"><div aria-live="polite" aria-atomic="true"><strong>{chosen.length}</strong><span>твиков выбрано<small>{status?.active?'Есть применённый профиль · доступен откат':`${catalog.profiles.find(p=>p.id===profile)?.name} · ещё не применено`}</small></span></div>{chosen.length>0&&<button type="button" className="button primary apply-guide" aria-label={status?.active?'Перейти к восстановлению настроек':'Перейти к кнопке Оптимизировать'} onClick={goToApply}><span>{status?.active?'К восстановлению':'К кнопке «Оптимизировать»'}</span><ArrowDown size={21}/></button>}</div>
  {review&&<div className="modal-backdrop"><div ref={reviewRef} className="modal optimization-review" role="dialog" aria-modal="true" aria-labelledby="optimization-title"><button className="modal-close" aria-label="Закрыть" onClick={()=>setReview(false)}><X size={20}/></button><ShieldCheck size={30} className="green-text"/><h2 id="optimization-title">Проверка перед применением</h2><p>Профиль: {catalog.profiles.find(p=>p.id===profile)?.name}. Изменений: {chosen.length}.</p><div className="review-list">{chosen.map(s=><div key={s.id}><b>{s.name}</b><small>{s.detail}</small></div>)}</div><p>Все исходные значения сохраняются до первого изменения. При ошибке выполняется попытка отката с отдельным отчётом. После изменений может понадобиться повторный вход в Windows. Восстановление настроек не заменяет резервную копию личных файлов.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setReview(false)}>Отмена</button><button className="button primary" onClick={()=>void execute('apply')}>{native?'Применить профиль':'Проверить деморежим'}<Check size={15}/></button></div></div></div>}
 </div>
}
