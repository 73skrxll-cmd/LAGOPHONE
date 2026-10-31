import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDown, Check, CheckCircle2, ChevronDown, Cpu, Gamepad2, Info, LoaderCircle, RotateCcw, ShieldCheck, Sparkles, Zap, X } from 'lucide-react';
import {optimizationRating,ratingLevels,type OptimizationAudit} from '../shared/optimization-rating.mjs';
import {optimizationView} from '../shared/optimization-view.mjs';
import catalog from '../shared/optimization.json';
import type {RestartRequest} from './bridge';

export type OptimizationResult={restart?:RestartRequest|null;ok:boolean;error?:string;cancelled?:boolean;restored?:boolean;noChanges?:boolean;report:{id:string;status:string;message:string}[]};
export type OptimizationStatus={audit?:OptimizationAudit;ok:boolean;error?:string;active:boolean;needsRecovery?:boolean;profile?:string;remaining:number;availability?:Record<string,{available:boolean;reason?:string}>;created?:string;power?:string;checks:{id:string;enabled:boolean}[];last?:OptimizationResult & {date:string;mode:string};running?:boolean;operation?:{mode:string;phase:string;startedAt:number}|null};
export type OptimizationInput={profile:string;uses:Record<string,boolean>;power:string;game:string;sysmain:boolean;selected:string[]};
export function OptimizationMeter({status,native,error=''}:{status:OptimizationStatus|null;native:boolean;error?:string}){
 const rating=optimizationRating({status,native,error}),recovery=rating.mode==='recovery';
 const labels:Record<string,string>={demo:'Предпросмотр',checking:'Проверка состояния…',running:'Выполняется…',error:'Не проверено',recovery:'Нужен откат',limited:'Нужна полная проверка'};
 const label=rating.mode==='rated'?ratingLevels.find(level=>level.id===rating.level)?.short:labels[rating.mode]||'Не проверено';
 const description=rating.mode==='rated'?`${rating.matched} из ${rating.available} базовых параметров соответствуют рекомендациям LAGOPHONE. Это не оценка FPS.`:error||status?.error||(rating.mode==='demo'?'Оценка доступна в приложении Windows.':rating.mode==='recovery'?'Завершите откат незавершённого сеанса.':'Откройте мониторинг оптимизации для подробной проверки.');
 return <section className={'optimization-meter '+(recovery?'needs-recovery':'')} aria-label="Уровень оптимизации"><div className="meter-symbol"><Activity size={25}/></div><div className="meter-description"><span className="eyebrow">УРОВЕНЬ НАСТРОЙКИ СИСТЕМЫ</span><h3>{label}<span>Базовый набор Windows</span></h3><p>{description}</p></div><div className="meter-bars" aria-hidden="true">{[0,1,2,3,4,5,6,7,8,9].map(i=><i key={i} className={rating.mode==='rated'&&i<Math.round((rating.percent||0)/10)?'lit':''}/>)}</div></section>;

}
function preferences(){
 const fallback={profile:'basic',uses:Object.fromEntries(catalog.features.map(f=>[f.id,f.defaultUse])),power:'keep',game:'none'};
 try {const saved=JSON.parse(localStorage.getItem('lagophone-optimization-preferences')||'null');if(!saved)return fallback;
 return {profile:'basic',power:'keep',game:'none',uses:Object.fromEntries(catalog.features.map(f=>[f.id,typeof saved.uses?.[f.id]==='boolean'?saved.uses[f.id]:f.defaultUse]))};
 }catch{return fallback}
}
export function OptimizationPanel({native,version,mismatch,status,error,checking=false,onRefresh,onOperationFinished}:{native:boolean;version:'10'|'11';mismatch:boolean;status:OptimizationStatus|null;error:string;checking?:boolean;onRefresh:()=>Promise<void>;onOperationFinished:(result:OptimizationResult,mode:'apply'|'restore')=>void}){
 const [profile,setProfile]=useState<string>(()=>preferences().profile),[uses,setUses]=useState<Record<string,boolean>>(()=>preferences().uses),[power,setPower]=useState<string>(()=>preferences().power),[game,setGame]=useState<string>(()=>preferences().game),[gamePath,setGamePath]=useState(''),[sysmain,setSysmain]=useState(false),[overrides,setOverrides]=useState<Record<string,boolean>>({}),[category,setCategory]=useState('Все'),[busy,setBusy]=useState(''),[review,setReview]=useState(false),[message,setMessage]=useState(''),[result,setResult]=useState<OptimizationResult|null>(null),[riskAcknowledged,setRiskAcknowledged]=useState(false),[expandedGroups,setExpandedGroups]=useState([0,3]),[profileChange,setProfileChange]=useState<{added:number;removed:number}|null>(null);
 useEffect(()=>{try{localStorage.setItem('lagophone-optimization-preferences',JSON.stringify({profile,uses,power,game}))}catch{}},[profile,uses,power,game]);
 const view=optimizationView({status,error,busy,native});
 const reviewRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
   if(!review)return;
   const previous=document.activeElement as HTMLElement|null;
   const modal=reviewRef.current;
   const controls=()=>Array.from(modal?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled])')||[]);
   controls()[0]?.focus();
   const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setReview(false)}if(event.key==='Tab'){const items=controls(),first=items[0],last=items[items.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}}};
   document.addEventListener('keydown',onKey);
   return()=>{document.removeEventListener('keydown',onKey);previous?.focus()};
 },[review]);
 const applyRef=useRef<HTMLDivElement>(null),restoreRef=useRef<HTMLDivElement>(null),workspaceRef=useRef<HTMLElement>(null),profileGridRef=useRef<HTMLDivElement>(null);
 const goToApply=()=>{const target=status?.active?restoreRef.current:applyRef.current;target?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'center'});target?.querySelector<HTMLButtonElement>('button')?.focus({preventScroll:true})};
 const level=catalog.profiles.find(p=>p.id===profile)!.level;
 const profileSteps=useMemo(()=>catalog.steps.filter(s=>s.level<=level),[level]);
 const eligible=useMemo(()=>profileSteps.filter(s=>
  status?.availability?.[s.id]?.available!==false &&
  (s.special==='power'?power!=='keep':s.special==='game'?game!=='none'&&!!gamePath:s.id==='sysmain'?sysmain:!s.feature||!uses[s.feature])
 ),[profileSteps,uses,power,game,gamePath,sysmain,status]);
 const chosen=eligible.filter(s=>overrides[s.id]??s.defaultSelected!==false);
 const displaySteps=profileSteps.filter(s=>!s.special||(s.special==='power'?power!=='keep':game!=='none'));
 const visibleSteps=displaySteps.filter(s=>category==='Все'||s.category===category);
 const categories=['Все',...new Set(displaySteps.map(s=>s.category))];
 const currentProfile=catalog.profiles.find(p=>p.id===profile)!;
 const regularCount=profileSteps.filter(s=>!s.special).length,extraCount=displaySteps.filter(s=>!!s.special).length;
 const powerName:Record<string,string>={keep:'Оставить текущий',balanced:'Сбалансированный',high:'Высокая производительность',ultimate:'Максимальная производительность',lagophone:'LAGOPHONE Performance'};
 const groups=[{id:0,name:'Базовый набор',detail:'Интерфейс, игровой режим и рекомендации Windows'},{id:1,name:'Дополнительно в среднем',detail:'Фоновые функции, автозагрузка и неиспользуемые службы'},{id:2,name:'Дополнительно в глубоком',detail:'Индексация, системные службы и эксперименты'},{id:3,name:'Питание и выбранная игра',detail:'Отдельные действия по выбранным параметрам'}];
 function changeProfile(id:string){
  const next=catalog.profiles.find(p=>p.id===id)!;
  if(id!==profile){
   const oldIds=new Set(profileSteps.filter(s=>!s.special).map(s=>s.id)),newIds=new Set(catalog.steps.filter(s=>!s.special&&s.level<=next.level).map(s=>s.id));
   setProfileChange({added:[...newIds].filter(id=>!oldIds.has(id)).length,removed:[...oldIds].filter(id=>!newIds.has(id)).length});
   setProfile(id);setOverrides({});setCategory('Все');setPower(id==='deep'?'lagophone':id==='balanced'?'high':'keep');if(id!=='deep')setSysmain(false);
  }
  setExpandedGroups([next.level,3]);
  requestAnimationFrame(()=>{workspaceRef.current?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});workspaceRef.current?.querySelector<HTMLElement>('h3')?.focus({preventScroll:true})});
 }
 function showGroup(id:number){setExpandedGroups(previous=>previous.includes(id)?previous.filter(value=>value!==id):[...previous,id])}

 function blockReason(step:typeof catalog.steps[number]){
   if(status?.availability?.[step.id]?.available===false)return status.availability[step.id].reason||'Недоступно на этом ПК';
   if(step.feature&&uses[step.feature])return 'Сохранено: '+catalog.features.find(f=>f.id===step.feature)?.name;
   if(step.special==='power'&&power==='keep')return 'Выбран текущий план питания';
   if(step.special==='game'&&!gamePath)return 'Сначала выберите игру и её EXE';
   if(step.id==='sysmain'&&!sysmain)return 'Разрешите SysMain в разделе «Питание, игра и эксперименты» выше';
   return '';
 }
 const report=result||status?.last;
 const attentionSteps=chosen.filter(step=>!!step.attention);
 const reviewKey=chosen.map(s=>s.id).join('|');
 useEffect(()=>{setRiskAcknowledged(false)},[review,reviewKey]);
 async function execute(mode:'apply'|'restore'){
   if(!native){setMessage('Настройки не изменены: выполнение доступно только в Windows.');setReview(false);return}
   setBusy(mode);setMessage('');setReview(false);
   try{
     const pending=mode==='apply'?window.lagophone!.optimize({profile,uses,power,game,sysmain,selected:chosen.map(s=>s.id)},version):window.lagophone!.restoreOptimization();
     void onRefresh().catch(()=>{});
     const response=await pending;
     onOperationFinished(response,mode);
     setResult(response);
     setMessage(response.cancelled?'Действие отменено.':response.ok?(mode==='restore'?'Исходные значения восстановлены.':response.noChanges?'Все выбранные настройки уже установлены или недоступны.':'Профиль применён. Проверьте отчёт: некоторые действия могут быть пропущены.'):(response.error||'Ошибка выполнения')+(response.restored?' Изменения отменены.':' Проверьте отчёт и используйте откат.'));
   }catch(e){setMessage((e as Error).message)}finally{setBusy('');try{await onRefresh()}catch(e){setMessage('Не удалось проверить состояние после операции: '+(e as Error).message)}}
 }
 async function chooseGame(){
   if(!native){setMessage('Выбор EXE игры доступен в настольной версии Windows.');return}
   try{const value=await window.lagophone!.chooseGame(game);if(value)setGamePath(value)}catch(e){setMessage((e as Error).message)}
 }
 return <div className="optimizer">
  <OptimizationMeter status={status} native={native} error={error}/>
  {(view.hasBackup||view.mode==='error'||view.mode==='checking'||view.mode==='running')&&<section ref={restoreRef} className={'optimization-session-notice '+view.mode} aria-live="polite">
   <div><h3>{view.mode==='running'?(status?.operation?.phase==='confirmation'?'Ожидается подтверждение в окне Windows':busy==='restore'||status?.operation?.mode==='restore'?'Восстановление настроек Windows':'Windows выполняет выбранную операцию'):view.mode==='recovery'?'Найдена копия незавершённого сеанса':view.mode==='applied'?'Найдена резервная копия предыдущего применения':view.mode==='error'?'Не удалось подтвердить текущее состояние':'Проверяем состояние Windows'}</h3>
   <p>{view.mode==='running'?'Сейчас идёт реальная операция или ожидание UAC. Не закрывайте приложение; настройки проверяются перед завершением.':view.hasBackup?`Это не загрузка и не автоматический запуск оптимизации. Сохранённых параметров: ${status?.remaining||0}. Можно просматривать и менять новый черновик; перед применением сначала восстановите исходные настройки.`:view.mode==='error'?(error||status?.error||'Повторите проверку. Новые изменения заблокированы до подтверждения состояния.'):'Проверка только читает параметры. Выбор профиля доступен; применение откроется после проверки.'}</p>
   {view.hasBackup&&<small>Копия перед профилем «{catalog.profiles.find(p=>p.id===status?.profile)?.name||status?.profile||'неизвестен'}». Текущий выбор ниже — отдельный черновик.</small>}
   {view.mode==='error'&&view.hasBackup&&<p>{error||status?.error}</p>}</div>
   <div className="session-notice-actions"><button type="button" className="button secondary" disabled={checking||!!busy} onClick={()=>void onRefresh()}>{checking?'Проверка…':'Обновить состояние'}</button>{view.canRestore&&<button type="button" className="button primary" onClick={()=>void execute('restore')}>{view.hasBackup?'Восстановить исходные настройки':'Проверить и восстановить копию'}</button>}</div>
  </section>}
  <div className="automation-intro"><div><span className="eyebrow">АВТОМАТИЧЕСКАЯ ОПТИМИЗАЦИЯ</span><h2>Выберите профиль и проверьте его состав.</h2><p>Профиль меняет список твиков ниже. Отметьте нужные пункты и проверьте последствия перед применением. Настройки Windows изменятся после кнопки «Оптимизировать» и подтверждения.</p></div><ShieldCheck size={35}/></div>
  <fieldset disabled={view.controlsLocked} className="optimizer-options"><legend className="sr-only">Параметры оптимизации</legend>
  <div ref={profileGridRef} className="profile-grid">{catalog.profiles.map(p=>{
   const total=catalog.steps.filter(s=>s.level<=p.level&&!s.special).length;
   const added=catalog.steps.filter(s=>s.level===p.level&&!s.special).length;
   return <button type="button" key={p.id} className={'profile-card '+(profile===p.id?'selected':'')} onClick={()=>changeProfile(p.id)} aria-label={p.name+' профиль'} aria-pressed={profile===p.id}><span className="profile-head"><span>{p.level===0?<ShieldCheck size={23}/>:p.level===1?<Zap size={23}/>:<Cpu size={23}/>}</span><i>{profile===p.id?<Check size={15}/>:p.level+1}</i></span><h3>{p.name}<strong className="profile-number">{total}</strong></h3><p>{p.description}</p><span className="profile-caption">{p.level===0?'Без отключения рабочих функций':`+${added} настроек к предыдущему уровню`} · {profile===p.id?'ПРОФИЛЬ ВЫБРАН':'Выбрать профиль'}</span></button>
  })}</div>
  <section ref={workspaceRef} className="profile-workspace" aria-label="Состав выбранного профиля">
  <div className="profile-composition" aria-live="polite" aria-atomic="true"><div><span className="eyebrow">СОСТАВ ПРОФИЛЯ</span><h3 tabIndex={-1}>{currentProfile.name} профиль</h3><p>Настроек Windows в списке: <b>{regularCount}</b>. {extraCount>0?`Дополнительных действий по питанию / игре: ${extraCount}. `:''}Отмечено к применению: <b>{chosen.length}</b>.</p>{profileChange&&<p className="profile-delta">Добавлено настроек: {profileChange.added} · Убрано из списка: {profileChange.removed}</p>}<small>План питания в черновике: {powerName[power]}.</small></div><button type="button" className="button secondary" onClick={()=>{profileGridRef.current?.scrollIntoView({behavior:'smooth',block:'center'});profileGridRef.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus({preventScroll:true})}}>К выбору профиля</button></div>
  <div className="profile-inclusions">{groups.filter(g=>g.id<=level).map(g=><span key={g.id} className={g.id===level?'current':''}><Check size={13}/>{g.id===0?'Базовые 18':g.id===1?'Средний +13':'Глубокий +8'}</span>)}</div>
  {profile==='basic'?<p className="basic-profile-note">В этом списке — базовые твики. Изменения служб и фоновых функций появятся при выборе среднего или глубокого профиля.</p>:null}
  {profile!=='basic'&&<details className="feature-survey"><summary>Какие функции нужно сохранить? <span>{Object.values(uses).filter(Boolean).length} сохранено</span></summary><p>Кнопка «Использую» защищает функцию от отключения. В базовом профиле функции не отключаются вообще; в старших часть необязательных функций предложена к отключению. Выбор «Не использую» только разрешает соответствующие твики — их всё ещё можно снять в списке.</p>
  <button type="button" className="button secondary survey-recommend" onClick={()=>setUses(Object.fromEntries(catalog.features.map(f=>[f.id,f.defaultUse])))}>Рекомендуемые ответы · проверьте перед применением</button><div className="feature-grid">{catalog.features.map(f=><div className={'feature-option '+(uses[f.id]?'preserve':'can-disable')} key={f.id}><span><b>{f.name}</b><small>{f.detail}</small><span className="feature-choice" role="group" aria-label={f.name}><button type="button" aria-pressed={uses[f.id]} className={uses[f.id]?'chosen':''} onClick={()=>setUses({...uses,[f.id]:true})}><ShieldCheck size={13}/> Использую — сохранить</button><button type="button" aria-pressed={!uses[f.id]} className={!uses[f.id]?'chosen':''} onClick={()=>setUses({...uses,[f.id]:false})}>Не использую</button></span></span></div>)}</div></details>}
  <details className="profile-options"><summary>Питание, игра и эксперименты <span>{powerName[power]} · {game==='none'?'Без отдельной игры':catalog.games.find(g=>g.id===game)?.name}</span></summary><div className="optimizer-config"><label className="config-card"><span><Zap size={19}/> План питания</span><select value={power} onChange={e=>setPower(e.target.value)} aria-label="План питания"><option value="keep">Оставить текущий</option><option value="balanced">Сбалансированный</option><option value="high">Высокая производительность</option><option value="ultimate">Максимальная производительность (штатный)</option>{profile==='deep'&&<option value="lagophone">LAGOPHONE Performance · отдельный план</option>}</select><small>{power==='lagophone'?'Отдельный игровой режим от сети: меньше энергосбережения, больше нагрев и шум. Настройки батареи сохраняются. Откат возвращает прежний режим.':'Производительный режим может повысить нагрев и расход энергии. Если выбранного режима нет на этом ПК, приложение сообщит об этом.'}</small></label>
  <div className="config-card"><label><span><Gamepad2 size={19}/> Профиль конкретной игры</span><select value={game} onChange={e=>{setGame(e.target.value);setGamePath('')}} aria-label="Игра">{catalog.games.map(g=><option value={g.id} key={g.id}>{g.name}</option>)}</select></label><small>Выбор названия игры сам по себе не меняет Windows. Для настройки только этой игры нужен её основной EXE. Переключатели изменений находятся в категории «Игры» ниже.</small>{game!=='none'&&<><button className="button secondary" onClick={()=>void chooseGame()}>Выбрать EXE игры <ChevronDown size={14}/></button><span className="game-path">{gamePath||'Нужен: '+catalog.games.find(g=>g.id===game)?.executables.join(' / ')}</span></>}</div></div>
  {game!=='none'&&<div className="game-effects"><h3><Gamepad2 size={18}/> Что произойдёт с {catalog.games.find(g=>g.id===game)?.name}</h3><dl><div><dt>Производительная видеокарта</dt><dd>{gamePath?(chosen.some(s=>s.id==='game-gpu')?'Выбрано: Windows предпочтёт производительную видеокарту для этой игры.':'Не выбрано: графическое предпочтение не изменится.'):'Не применяется, пока не указан EXE.'}</dd></div><div><dt>Полноэкранная оптимизация</dt><dd>{chosen.some(s=>s.id==='game-fullscreen')?'Выбрано: отключается только для этого EXE. Результат может стать лучше или хуже; нужен перезапуск игры.':'Не меняется. Эксперимент можно отдельно выбрать в категории «Игры» на среднем/глубоком уровне.'}</dd></div><div><dt>Все остальные игры</dt><dd>Их EXE и параметры совместимости не меняются. Общие настройки Windows и питания действуют на весь ПК — они перечислены отдельно.</dd></div><div><dt>Античит и файлы игры</dt><dd>Не изменяются и не удаляются. Нет вмешательства в процессы, приоритеты античита, конфиги, Secure Boot или TPM. Проверка совместимости всё равно нужна.</dd></div></dl></div>}
  {profile==='deep'&&<label className="sysmain-option"><input type="checkbox" checked={sysmain} onChange={e=>setSysmain(e.target.checked)}/><span><b>Разрешить эксперимент с SysMain</b><small>После включения этот пункт станет доступен в списке. Отключение кеширования может замедлить запуск программ; по умолчанию выключено.</small></span></label>}
  </details>
  <div className="section-heading profile-list-heading"><h2>Твики профиля <span>{chosen.length}</span></h2><button type="button" className="button secondary" onClick={()=>setOverrides({})}>Рекомендованные</button><button type="button" className="button secondary" onClick={()=>setOverrides(Object.fromEntries(catalog.steps.map(s=>[s.id,false])))}>Снять все</button></div>
  <div className="tabs tweak-categories">{categories.map(c=><button type="button" key={c} onClick={()=>{setCategory(c);setExpandedGroups([0,1,2,3])}} className={category===c?'selected':''}>{c}<small>{displaySteps.filter(s=>c==='Все'||s.category===c).length}</small></button>)}</div>
  <div className="profile-step-groups">{groups.map(group=>{
    const steps=visibleSteps.filter(step=>group.id===3?!!step.special:!step.special&&step.level===group.id);
    if(!steps.length)return null;
    const count=steps.filter(step=>chosen.some(s=>s.id===step.id)).length,open=expandedGroups.includes(group.id);
    return <section key={group.id} className={'profile-step-group '+(group.id===level?'current-profile-group':'')} data-level={group.id}>
    <button type="button" className="step-group-toggle" aria-expanded={open} aria-controls={`profile-group-${group.id}`} onClick={()=>showGroup(group.id)}><span><span className="step-group-eyebrow">{group.id===3?'ДОПОЛНИТЕЛЬНО':group.id===level?'ВЫБРАННЫЙ УРОВЕНЬ':'ВХОДИТ В ПРОФИЛЬ'}</span><h3>{group.name}</h3><small>{group.detail}</small></span><span className="step-group-count">{steps.length} твиков<b>{count} выбрано</b></span><ChevronDown size={20}/></button>
    <div id={`profile-group-${group.id}`} hidden={!open}><div className="changes-list clear-choices">{steps.map(step=>{
    const blocked=blockReason(step),isChosen=chosen.some(s=>s.id===step.id);
    return <label key={step.id} className={(isChosen?'is-chosen':'not-chosen')+(blocked?' is-blocked':'')+(step.attention?' requires-attention':'')}><input type="checkbox" disabled={!!blocked} checked={isChosen} onChange={e=>setOverrides({...overrides,[step.id]:e.target.checked})}/><span className="choice-check" aria-hidden="true">{isChosen?<Check size={19}/>:null}</span><span><span className="choice-title"><b>{step.name}</b><em>{blocked?'СОХРАНЕНО / НЕДОСТУПНО':isChosen?'ВЫБРАНО':'НЕ ВЫБРАНО'}</em></span><dl className="tweak-summary"><div><dt>Даёт</dt><dd>{step.benefit}</dd></div><div><dt>Взамен</dt><dd>{step.tradeoff}</dd></div></dl>{step.restart&&<span className="restart-note">{step.restart}</span>}{step.attention&&<span className="tweak-attention"><Info size={15}/><span><b>ВАЖНО · {step.attention.label}</b></span></span>}{blocked&&<strong className="blocked-reason">{blocked}</strong>}{!step.defaultSelected&&<strong className="experimental-tag">Проверять в своей игре · по умолчанию не выбрано</strong>}</span></label>
    })}</div></div></section>;
  })}</div>
  </section>
  </fieldset>
  <div className="compatibility-note"><ShieldCheck size={22}/><div><b>Без отключения компонентов Store, Xbox и античитов</b><p>Не изменяются Defender, Secure Boot, TPM, VBS, Windows Update, Gaming Services, службы FACEIT и Vanguard. Game Bar не удаляется. Это снижает риск конфликтов, но не является гарантией совместимости с каждой игрой. Каскадное отключение зависимых служб запрещено.</p></div></div>

  <div ref={applyRef} className="apply-bar" id="apply-optimization"><div><b>{view.mode==='running'?'Windows выполняет операцию…':view.hasBackup?'Перед применением нужен откат':`${chosen.length} действий · Windows ${version}`}</b><p>{busy?'Подтвердите UAC, если он появился. Дождитесь проверки результата и не закрывайте приложение.':'Перед изменениями сохраняется резервная копия. Для служб нужен запрос прав администратора.'}</p></div><button className="button primary" disabled={!view.canApply||checking||!chosen.length||mismatch} onClick={()=>setReview(true)}>{busy?<LoaderCircle className="spin" size={17}/>:<Sparkles size={17}/>}Оптимизировать</button></div>
  {message&&<div className="optimization-message" role="status"><Info size={18}/>{message}</div>}
  {report&&<section className="optimization-report"><div className="section-heading"><h2>Результат выполнения</h2><button className="button secondary" disabled={!!busy||checking} onClick={()=>void onRefresh()}>Проверить состояние</button></div>{report.error&&<p className="report-error">{report.error}</p>}{report.cancelled&&<p>Пользователь отменил действие. Изменений нет.</p>}<div>{report.report.map((r,i)=><div className={'report-row '+r.status} key={i}><span>{r.status==='applied'||r.status==='restored'?<CheckCircle2 size={16}/>:<Info size={16}/>}</span><div><b>{catalog.steps.find(s=>s.id===r.id)?.name||(r.id==='power-throttling'?'Откат старого изменения мощности фона':r.id)}</b><p>{r.message}</p></div><small>{{applied:'Применено',restored:'Восстановлено',skipped:'Пропущено',error:'Ошибка'}[r.status]||r.status}</small></div>)}</div></section>}
  <div className="selection-float" role="region" aria-label="Выбранные изменения"><div aria-live="polite" aria-atomic="true"><strong>{chosen.length}</strong><span>твиков в черновике<small>{view.mode==='running'?'Выполняется операция Windows':view.hasBackup?'Есть резервная копия · это не загрузка':`${catalog.profiles.find(p=>p.id===profile)?.name} · ещё не применено`}</small></span></div>{view.canRestore&&view.hasBackup?<button type="button" className="button primary" onClick={()=>void execute('restore')}>Восстановить настройки <RotateCcw size={17}/></button>:chosen.length>0&&<button type="button" className="button primary apply-guide" aria-label="Перейти к кнопке Оптимизировать" onClick={goToApply}><span>К кнопке «Оптимизировать»</span><ArrowDown size={21}/></button>}</div>
  {review&&<div className="modal-backdrop"><div ref={reviewRef} className="modal optimization-review" role="dialog" aria-modal="true" aria-labelledby="optimization-title"><button className="modal-close" aria-label="Закрыть" onClick={()=>setReview(false)}><X size={20}/></button><ShieldCheck size={30} className="green-text"/><h2 id="optimization-title">Проверка перед применением</h2><p>Профиль: {catalog.profiles.find(p=>p.id===profile)?.name}. Изменений: {chosen.length}.</p>{attentionSteps.length>0&&<div className="review-attention"><h3><Info size={20}/> Системные изменения: {attentionSteps.length}</h3><p>Эти пункты затрагивают функции Windows, питание или поведение игр. Прочитайте последствия каждого.</p>{attentionSteps.map(step=><div key={step.id}><b>{step.name}</b><small>{step.attention?.consequence}</small></div>)}<label><input type="checkbox" checked={riskAcknowledged} onChange={e=>setRiskAcknowledged(e.target.checked)}/>Я прочитал последствия выделенных системных изменений</label></div>}<div className="review-list">{chosen.map(s=><div key={s.id}><b>{s.name}</b><small>{s.detail}</small></div>)}</div><p>Все исходные значения сохраняются до первого изменения. При ошибке выполняется попытка отката с отдельным отчётом. После изменений может понадобиться повторный вход в Windows. Восстановление настроек не заменяет резервную копию личных файлов.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setReview(false)}>Отмена</button><button className="button primary" disabled={attentionSteps.length>0&&!riskAcknowledged} onClick={()=>void execute('apply')}>{native?'Применить профиль':'Проверить деморежим'}<Check size={15}/></button></div></div></div>}
 </div>
}
