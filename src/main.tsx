import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, Box, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Cpu, Download, ExternalLink, Fan, Gamepad2, Gauge, HardDrive, Info, Layers3, LayoutGrid, MemoryStick, Monitor, Moon, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Trash2, Undo2, X, Zap } from 'lucide-react';
import './style.css';
import {Computer} from './Computer';
import {MonitorPanel} from './Monitor';
import {Atmosphere,useVisualEffects} from './Atmosphere';
import {RestartFlow} from './RestartFlow';
import type {RestartRequest} from './bridge';
import {HardwareLogo} from './HardwareLogo';
import {hardwareBrands,type HardwareBrand} from '../shared/hardware-brands.mjs';
import {BrandMark} from './Brand';
import {ActivityMenu} from './Activity';
import { withTimeout } from '../shared/optimization-view.mjs';
import { Drivers } from './Drivers';
import { OptimizationPanel, OptimizationMeter, type OptimizationStatus } from './Optimization';
import { ThemeSelector, useTheme } from './Theme';

const GameOptimizer=React.lazy(()=>import('./GameOptimizer').then(module=>({default:module.GameOptimizer})));
type Version = '10'|'11';
export type System = { demo: boolean; version?: Version; os?:string; build?:string; cpu?:string; cores?:number; threads?:number; gpu?:string[]; board?:string; vendor?:string; manufacturer?:string; model?:string; ram?:number; memory?:{manufacturer?:string;partNumber?:string}[]; ramSpeed?:number; slots?:number; disks?:{name:string;manufacturer?:string;type:string;size:number}[]; uptime?:number };
type Progress = {id:string;percent:number|null;bytes:number};
const sample:System={demo:true,version:'11',os:'Windows 11 Pro',build:'26100',cpu:'AMD Ryzen 5 5600X',cores:6,threads:12,gpu:['NVIDIA GeForce RTX 3060'],board:'B550 AORUS ELITE V2',vendor:'Gigabyte Technology',ram:32,ramSpeed:3200,slots:2,disks:[{name:'Samsung SSD 970 EVO Plus',type:'SSD',size:1000}],uptime:3};
const navigation=[{id:'system',title:'Система',icon:LayoutGrid},{id:'monitor',title:'Мониторинг',icon:Gauge},{id:'tweaks',title:'Твики',icon:Settings2},{id:'gaming',title:'Игровая оптимизация',icon:Gamepad2},{id:'apps',title:'Полезные приложения',icon:Box},{id:'drivers',title:'Приложения и драйверы',icon:Download}];
const tweaks=[
 {id:'temp',name:'Временные файлы',desc:'Удалите временные файлы старше 7 дней. Занятые файлы будут пропущены.',icon:Trash2,tag:'Очистка',button:'Очистить',risk:'Удалённые файлы нельзя восстановить.'},
 {id:'startup',name:'Автозагрузка',desc:'Выберите, какие приложения должны запускаться вместе с Windows.',icon:Zap,tag:'Быстрый запуск',button:'Настроить'},
 {id:'optimize',name:'Оптимизация дисков',desc:'Штатный инструмент Windows: TRIM для SSD и дефрагментация для HDD.',icon:HardDrive,tag:'Обслуживание',button:'Открыть'},
 {id:'transparency',name:'Эффекты прозрачности',desc:'Отключите прозрачность окон, чтобы немного снизить нагрузку на графику.',icon:Layers3,tag:'Интерфейс',button:'Отключить',undo:true},
 {id:'apps',name:'Удаление приложений',desc:'Просмотрите установленные программы и удалите те, которыми не пользуетесь.',icon:Box,tag:'Приложения',button:'Выбрать'},
 {id:'game',name:'Игровой режим',desc:'Настройте встроенный игровой режим Windows под свои задачи.',icon:Gamepad2,tag:'Игры',button:'Настроить'},
 {id:'storage',name:'Контроль памяти',desc:'Настройте автоматическую очистку диска средствами Windows.',icon:HardDrive,tag:'Очистка',button:'Настроить'},
 {id:'services',name:'Службы Windows',desc:'Откройте список служб. Перед отключением изучите назначение и зависимости.',icon:Settings2,tag:'Для опытных',button:'Открыть',risk:'Отключение служб может нарушить работу системы.'},
];
const applications=[
 {id:'discord',name:'Discord',category:'Общение',desc:'Голосовые каналы, чаты и ваше сообщество.',letter:'◕',color:'#8e8dff',direct:true},
 {id:'nanazip',name:'NanaZip',category:'Инструменты',desc:'Современный архиватор с поддержкой 7-Zip.',letter:'N',color:'#edba61',direct:false},
 {id:'qbittorrent',name:'qBittorrent',category:'Загрузки',desc:'Открытый торрент-клиент без рекламы.',letter:'qb',color:'#70aee8',direct:false},
 {id:'steam',name:'Steam',category:'Игры',desc:'Ваша библиотека игр в одном месте.',letter:'♧',color:'#a2c6e6',direct:true},
 {id:'memreduct',name:'Mem Reduct',category:'Инструменты',desc:'Мониторинг памяти. Очистка нужна не всем ПК.',letter:'M',color:'#83d9aa',direct:false},
 {id:'vscode',name:'Visual Studio Code',category:'Разработка',desc:'Редактор кода с расширениями и терминалом.',letter:'⌘',color:'#58b3ed',direct:true},
 {id:'firefox',name:'Firefox',category:'Интернет',desc:'Браузер с акцентом на приватность.',letter:'◔',color:'#ffad76',direct:true},
 {id:'vlc',name:'VLC media player',category:'Мультимедиа',desc:'Открытый плеер для видео и музыки.',letter:'△',color:'#f6b366',direct:false},
];
function WindowsLogo({eleven=false}:{eleven?:boolean}){return <span className={'windows-logo '+(!eleven?'tilted':'')}><i/><i/><i/><i/></span>}

function App(){
 const [theme,setTheme]=useTheme();
 const effects=useVisualEffects();
 const [activityRevision,setActivityRevision]=useState(0);
 const [restartRequest,setRestartRequest]=useState<RestartRequest|null>(null);
 const optimizationRequest=useRef<Promise<void>|null>(null);
 const [checkingOptimization,setCheckingOptimization]=useState(false);
 const [optState,setOptState]=useState<OptimizationStatus|null>(null),[optError,setOptError]=useState('');
 const [version,setVersion]=useState<Version|null>(()=>{try{const saved=localStorage.getItem('lagophone-windows-version');return saved==='10'||saved==='11'?saved:null}catch{return null}}),[page,setPage]=useState('system'),[system,setSystem]=useState<System>(sample),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[category,setCategory]=useState('Все приложения'),[toast,setToast]=useState(''),[busy,setBusy]=useState(''),[progress,setProgress]=useState<Progress|null>(null),[help,setHelp]=useState(false),[confirm,setConfirm]=useState<string|null>(null);
 const screenTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const [leavingScreen,setLeavingScreen]=useState(false);
 useEffect(()=>()=>{if(screenTimer.current!==null)clearTimeout(screenTimer.current)},[]);
 function showVersion(next:Version|null){
  if(screenTimer.current!==null){clearTimeout(screenTimer.current);screenTimer.current=null}
  setLeavingScreen(false);setVersion(next);if(next){try{localStorage.setItem('lagophone-windows-version',next)}catch{}}
 }
 function chooseVersion(next:Version|null){
  if(screenTimer.current!==null||next===version)return;
  if(!effects.enabled){showVersion(next);return}
  setLeavingScreen(true);
  // One short timeout changes screens; all intermediate frames are CSS opacity.
  screenTimer.current=setTimeout(()=>showVersion(next),effects.reduced?80:140);
 }
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape'){setHelp(false);setConfirm(null)}};document.addEventListener('keydown',onKey);return()=>document.removeEventListener('keydown',onKey)},[]);
 const native=!!window.lagophone&&!system.demo;
 const refreshOptimization=()=>{
   if(!native)return Promise.resolve();
   if(optimizationRequest.current)return optimizationRequest.current;
   setCheckingOptimization(true);
   const request:Promise<void>=withTimeout(Promise.resolve().then(()=>window.lagophone!.optimizationStatus()),40000,'Проверка состояния не ответила за 40 секунд. Повторите проверку; новые настройки этой проверкой не применялись.')
     .then(state=>{setOptState(state);setOptError('')})
     .catch(e=>{setOptError((e as Error).message)})
     .finally(()=>{setCheckingOptimization(false);if(optimizationRequest.current===request)optimizationRequest.current=null;});
   optimizationRequest.current=request;return request;
 };
 useEffect(()=>{void refreshOptimization()},[native,page]);
 useEffect(()=>{if(optState?.running&&!optError){const timer=setTimeout(()=>void refreshOptimization(),2000);return()=>clearTimeout(timer)}},[optState,optError]);
 const refresh=async()=>{setLoading(true);try {const s=await window.lagophone?.system();setSystem(s&&!s.demo?s:sample);}catch{setToast('Не удалось прочитать оборудование. Показаны демонстрационные данные.');setSystem(sample);}finally{setLoading(false)}};
 useEffect(()=>{void refresh();return window.lagophone?.onProgress(p=>setProgress(p));},[]);
 useEffect(()=>{if(toast){const t=setTimeout(()=>setToast(''),8000);return()=>clearTimeout(t)}},[toast]);
 async function act(id:string){
   if(!native){setConfirm(null);setToast('Демонстрационный режим. Для выполнения действий запустите настольное приложение в Windows.');return;}
   if(!version)return;
   setBusy(id);try{setToast(await window.lagophone!.action(id,version));}catch(e){setToast((e as Error).message)}finally{setBusy('');setConfirm(null);setActivityRevision(value=>value+1)}
 }
 async function open(id:string){if(!window.lagophone){setToast('Официальные ссылки и загрузки доступны в настольной версии.');return;}try{await window.lagophone.open(id)}catch(e){setToast((e as Error).message)}}
 async function download(id:string){if(!native){setToast('Загрузка установщиков доступна в настольном приложении Windows.');return;}setBusy(id);setProgress(null);try{setToast(await window.lagophone!.download(id))}catch(e){setToast((e as Error).message)}finally{setBusy('');setProgress(null);setActivityRevision(value=>value+1)}}
 const gpu=system.gpu?.join(', ')||'Не определена',disk=system.disks?.[0],componentBrands=hardwareBrands(system);
 const brandsFor=(category:string)=>componentBrands.filter(brand=>brand.category===category);
 const mismatch=native&&version!==system.version;
 const visibleApps=applications.filter(a=>(category==='Все приложения'||a.category===category)&&(a.name+' '+a.desc).toLowerCase().includes(query.toLowerCase()));
 const atmosphere=<Atmosphere theme={theme} running={effects.running}/>;
 const restartFlow=<RestartFlow native={native} revision={activityRevision} request={restartRequest} onVersion={showVersion}/>;
 if(!version)return <>{atmosphere}{restartFlow}<div className="welcome screen-stage" data-screen-phase={leavingScreen?'leaving':'idle'} data-transitions={effects.enabled} data-reduced-motion={effects.reduced} aria-busy={leavingScreen}><div className="welcome-theme"><ThemeSelector value={theme} onChange={setTheme} effects={effects.enabled} onEffectsChange={effects.setEnabled}/></div><div className="welcome-brand"><BrandMark/> LAGOPHONE<span>PC UTILITY</span></div><div className="welcome-content"><span className="eyebrow">ВАШ ПК. ВАШИ ПРАВИЛА.</span><h1>Больше возможностей.<br/><span>Меньше лишнего.</span></h1><p>Выберите вашу операционную систему.<br/>Мы подберём совместимые инструменты и настройки.</p><div className="os-options">{(['10','11'] as Version[]).map(v=><button key={v} onClick={()=>chooseVersion(v)} disabled={leavingScreen} className="os-card"><WindowsLogo eleven={v==='11'}/><h2>Windows {v}</h2><span>{v==='10'?'Настройки Windows 10 и ленты «Новости и интересы».':'Настройки Windows 11 и панели виджетов.'}</span><b>Выбрать систему <ArrowRight size={18}/></b>{system.version===v&&native&&<small><Check size={12}/> Обнаружена на этом ПК</small>}</button>)}</div><div className="welcome-safe"><ShieldCheck size={16}/> Прозрачные действия. Полный контроль за изменениями.</div>{system.demo&&<div className="demo-welcome">Предпросмотр интерфейса · характеристики демонстрационные</div>}</div><footer>СОЗДАНО ДЛЯ ВАШЕГО ПК <span>v0.6.0 · Windows 10 / 11 x64</span></footer></div></>;
 return <>{atmosphere}{restartFlow}<div className="app-shell screen-stage" data-screen-phase={leavingScreen?'leaving':'idle'} data-transitions={effects.enabled} data-reduced-motion={effects.reduced} aria-busy={leavingScreen}><aside><a className="brand" href="#" onClick={e=>{e.preventDefault();setPage('system')}}><BrandMark/><span>LAGOPHONE<small>ОТ ИГРОКОВ — ДЛЯ ИГРОКОВ</small></span></a><div className="side-label">РАБОЧЕЕ ПРОСТРАНСТВО</div><nav>{navigation.map(n=><button key={n.id} onClick={()=>{setPage(n.id);setQuery('')}} className={page===n.id?'active':''} aria-current={page===n.id?'page':undefined}><n.icon size={19}/>{n.title}{page===n.id&&<span className="active-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="safe-card"><div><ShieldCheck size={19}/><b>Всё под контролем</b></div><p>Ваши настройки меняются<br/>только с вашего разрешения.</p><button onClick={()=>setHelp(true)}>Как это работает <CircleHelp size={15}/></button></div><div className="side-version"><small>Версия 0.6.0</small></div></div></aside>
 <div className="workspace"><header><div className="breadcrumb">Рабочее пространство <ChevronRight size={14}/><span>{navigation.find(n=>n.id===page)?.title}</span></div><div className="header-actions"><ThemeSelector value={theme} onChange={setTheme} effects={effects.enabled} onEffectsChange={effects.setEnabled}/><button className="os-selector" onClick={()=>chooseVersion(null)} disabled={leavingScreen}><WindowsLogo eleven={version==='11'}/> Windows {version}<ChevronDown size={13}/></button><i/><ActivityMenu revision={activityRevision} native={native}/></div></header>
 <main className="section-stage" data-page={page} data-transitions={effects.enabled} data-reduced-motion={effects.reduced}><div className="page-title"><div><div className="eyebrow">{page==='system'?'ОБЗОР ВАШЕГО УСТРОЙСТВА':page==='monitor'?'ПРОВЕРКА НАСТРОЕК WINDOWS':page==='tweaks'?'ПРОСТЫЕ ДЕЙСТВИЯ. ПОЛНЫЙ КОНТРОЛЬ.':page==='apps'?'ВСЁ НУЖНОЕ ПОД РУКОЙ':'ПРОВЕРЕННЫЕ ИСТОЧНИКИ'}</div><h1>{page==='system'?'Ваш компьютер':page==='monitor'?'Мониторинг оптимизации':page==='tweaks'?'Твики системы':page==='gaming'?'Игровая оптимизация':page==='apps'?'Полезные приложения':'Приложения и драйверы'}<span className="title-dot">.</span></h1><p>{page==='system'?'Всё, что нужно знать о вашей системе, в одном месте.':page==='monitor'?'Уровень настройки системы и конкретные шаги к следующему результату.':page==='tweaks'?'Настройте Windows под себя. Каждое изменение — ваш выбор.':page==='gaming'?'Выберите игру. Настройте её приоритет. Возвращайтесь за следующей победой.':page==='apps'?'Знакомые инструменты для работы, общения и отдыха.':'Поддерживайте оборудование и системные компоненты в актуальном состоянии.'}</p></div>{page==='system'?<button className="button secondary" onClick={()=>{void refresh();void refreshOptimization()}} disabled={loading}><RefreshCw size={15} className={loading?'spin':''}/>{loading?'Обновление…':'Обновить данные'}</button>:<span className="compat"><CheckCircle2 size={14}/> Windows {version}</span>}</div>
 {system.demo&&<div className="demo-bar"><Info size={15}/><span>Предпросмотр интерфейса. Характеристики ниже — пример, а не данные вашего ПК.</span><span>DEMO</span></div>}
 {mismatch&&<div className="warning"><Info size={17}/> Обнаружена Windows {system.version}. Для выполнения твиков выберите установленную систему.<button onClick={()=>chooseVersion(system.version!)}>Выбрать Windows {system.version}</button></div>}
 {page==='system'&&<>
 <OptimizationMeter status={optState} native={native} error={optError}/>
  <Computer system={system} onTweaks={()=>setPage('tweaks')}/>
  <div className="section-heading"><h2><Cpu size={18}/> Комплектующие <span>06</span></h2><span className="muted">{system.demo?'Демонстрационные данные':'Данные оборудования Windows'}</span></div>
  <div className="hardware-grid">
   <Hardware icon={Cpu} label="ПРОЦЕССОР" name={system.cpu||'Не определён'} detail={`${system.cores||'—'} ядер / ${system.threads||'—'} потоков`} brands={brandsFor('Процессор')}/>
   <Hardware icon={Monitor} label="ВИДЕОКАРТА" name={gpu} detail="Графический адаптер" brands={brandsFor('Видеокарта')}/>
   <Hardware icon={MemoryStick} label="ОПЕРАТИВНАЯ ПАМЯТЬ" name={`${system.ram||'—'} ГБ RAM`} detail={`${system.ramSpeed||'—'} МГц · установлено модулей: ${system.slots||'—'}`} brands={brandsFor('Память')}/>
   <Hardware icon={Layers3} label="МАТЕРИНСКАЯ ПЛАТА" name={system.board||'Не определена'} detail={system.vendor||'Производитель не определён'} brands={brandsFor('Материнская плата')}/>
   <Hardware icon={HardDrive} label="НАКОПИТЕЛИ" name={disk?.name||'Не определены'} detail={system.disks?.map(d=>`${d.size} ГБ · ${d.type}`).join(' / ')||'Нет данных'} brands={brandsFor('Накопитель')}/>
   <Hardware icon={Monitor} label="ОПЕРАЦИОННАЯ СИСТЕМА" name={system.os||'Windows'} detail={`Сборка ${system.build||'—'} · x64`} platform={system.version}/>
  </div>
  <div className="bottom-cards"><div className="quick-card"><span className="quick-icon"><Sparkles size={21}/></span><div><h3>Меньше лишнего. Больше вашего.</h3><p>Очистка, автозагрузка и настройки Windows.</p></div><button className="round-button" aria-label="Открыть твики" onClick={()=>setPage('tweaks')}><ArrowUpRight size={20}/></button></div><div className="uptime-card"><Clock3 size={21}/><div><span>ВРЕМЯ РАБОТЫ</span><b>{system.uptime??'—'} ч <small>с последнего запуска</small></b></div><Activity size={38} className="uptime-graph"/></div></div>
 </>}
 {page==='monitor'&&<MonitorPanel native={native} status={optState} error={optError} checking={checkingOptimization} onRefresh={refreshOptimization} onTweaks={()=>setPage('tweaks')} effectsRunning={effects.running}/>}
 {<div hidden={page!=='tweaks'}><OptimizationPanel native={native} version={version} actualVersion={system.version} build={system.build} mismatch={mismatch} status={optState} error={optError} checking={checkingOptimization} onRefresh={refreshOptimization} onOperationFinished={(response,mode)=>{setRestartRequest(mode==='apply'?response.restart||null:null);setOptState(previous=>previous?{...previous,running:false,operation:null}:previous);setActivityRevision(value=>value+1)}}/><details hidden={page!=='tweaks'} className="manual-tools"><summary>Дополнительные инструменты Windows и очистка</summary><p>Эти действия выполняются отдельно от обратимого профиля. Очистка файлов необратима.</p><div className="tool-grid">{tweaks.filter(t=>['temp','apps','optimize','startup'].includes(t.id)).map(t=><article className="tool-card" key={t.id}><div className="tool-top"><span className="tile-icon"><t.icon size={22}/></span><span className="tag">{t.tag}</span></div><h3>{t.name}</h3><p>{t.desc}</p><button disabled={!!busy||mismatch} className="button secondary" onClick={()=>setConfirm(t.id)}>{busy===t.id?'Выполнение…':t.button}<ArrowUpRight size={14}/></button></article>)}</div></details></div>}
 {page==='apps'&&<><div className="catalog-toolbar"><div className="search"><Search size={18}/><input aria-label="Поиск приложений" placeholder="Найти приложение…" value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button aria-label="Очистить поиск" onClick={()=>setQuery('')}><X size={15}/></button>}</div><span className="muted">Только официальные источники <ShieldCheck size={15}/></span></div><div className="tabs">{['Все приложения','Инструменты','Игры','Общение','Интернет'].map(c=><button key={c} className={c===category?'selected':''} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="apps-grid">{visibleApps.map(a=><article className="application-card" key={a.id}><div className="app-card-head"><span className="app-logo" style={{color:a.color,background:a.color+'14'}}>{a.letter}</span><span className="tag">{a.category}</span></div><h3>{a.name}</h3><p>{a.desc}</p><div className="app-meta"><CheckCircle2 size={12}/> Windows 10 / 11 <span>Бесплатно</span></div><button className={'button '+(a.direct?'primary-subtle':'secondary')} disabled={!!busy} onClick={()=>a.direct?void download(a.id):void open(a.id)}>{busy===a.id?(progress?.id===a.id?`Загрузка ${progress.percent===null?Math.round(progress.bytes/1024/1024)+' МБ':progress.percent+'%'}`:'Подготовка…'):a.direct?'Скачать установщик':'Официальная страница'}{a.direct?<ArrowDownToLine size={15}/>:<ExternalLink size={14}/>}</button></article>)}</div>{!visibleApps.length&&<div className="empty"><Search size={30}/><h3>Ничего не найдено</h3><p>Попробуйте другое название или категорию.</p><button className="button secondary" onClick={()=>{setQuery('');setCategory('Все приложения')}}>Сбросить фильтры</button></div>}<div className="footnote"><Info size={15}/> Установщики сохраняются на ваш ПК. Установка запускается вами отдельно. Для приложений без стабильной прямой ссылки открывается сайт разработчика.</div></>}
 <div hidden={page!=='gaming'}><React.Suspense fallback={<p>Загрузка каталога игр…</p>}><GameOptimizer native={native} active={page==='gaming'} motion={effects.running} version={version} mismatch={mismatch} onCompleted={()=>{void refreshOptimization();setActivityRevision(value=>value+1)}}/></React.Suspense></div>
 {page==='drivers'&&<Drivers system={system} version={version}/>}
 <footer className="main-footer"><span><span className="status-dot"/>{native?'Локальное подключение к Windows':'Предпросмотр · без доступа к системе'}</span><span>От игроков — для игроков</span></footer>
 </main></div>
 {toast&&<div className="toast" role="status"><Info size={21}/><span>{toast}</span><button aria-label="Закрыть сообщение" onClick={()=>setToast('')}><X size={17}/></button></div>}
 {help&&<div className="modal-backdrop" onClick={()=>setHelp(false)}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="help-title" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Закрыть" onClick={()=>setHelp(false)}><X/></button><ShieldCheck size={32} className="green-text"/><h2 id="help-title">Ваш ПК — под вашим контролем</h2><p>LAGOPHONE показывает характеристики, применяет выбранные профили оптимизации и помогает скачивать приложения из официальных источников.</p><p>Профиль применяется после просмотра списка изменений и подтверждения Windows. Исходные параметры сохраняются для отката, а выполненные действия проверяются. Очистка временных файлов вне профиля необратима.</p><p>Приложение не обещает прирост FPS и не отключает защиту Windows. В браузере доступен только демонстрационный интерфейс.</p><button className="button primary" onClick={()=>setHelp(false)}>Понятно <Check size={16}/></button></div></div>}
 {confirm&&<div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="action-title"><Settings2 size={30} className="green-text"/><h2 id="action-title">{tweaks.find(t=>t.id===confirm)?.name}</h2><p>{tweaks.find(t=>t.id===confirm)?.desc}</p><p>{tweaks.find(t=>t.id===confirm)?.risk||'Откроется инструмент Windows или будет применена выбранная настройка.'} Рекомендуем предварительно создать точку восстановления.</p><div className="modal-actions"><button className="button secondary" onClick={()=>setConfirm(null)}>Отмена</button><button className="button primary" disabled={!!busy} onClick={()=>void act(confirm)}>Продолжить <ArrowRight size={15}/></button></div></div></div>}
 </div></>;
}
function Hardware({icon:Icon,label,name,detail,brands=[],platform}:{icon:typeof Cpu;label:string;name:string;detail:string;brands?:HardwareBrand[];platform?:Version}){return <article className="hardware-card"><div className="hardware-top"><span className="tile-icon"><Icon size={23}/></span><span className="hardware-label">{label}</span><span className="hardware-status"/></div><h3>{name}</h3><div className="hardware-detail"><span>{detail}</span><div className="hardware-brand-marks">{brands.map(brand=><HardwareLogo key={brand.key} brand={brand} compact/>)}{platform&&<span className="hardware-windows-mark" role="img" aria-label={'Windows '+platform} title={'Windows '+platform}><WindowsLogo eleven={platform==='11'}/></span>}</div></div></article>}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
