import {useEffect,useState} from 'react';
import {Info,LoaderCircle,Network,Play,Square,Download} from 'lucide-react';
import type {SessionState} from '../shared/ping-session.mjs';
import './ping.css';
const clean=(e:unknown)=>String((e as Error)?.message||e).replace(/^Error invoking remote method '[^']+': (?:Error: )?/,'');
export function PingPanel({native,active,onCompleted}:{native:boolean;active:boolean;onCompleted:()=>void}){
 const api=window.lagophone,available=native&&typeof api?.gamePingStatus==='function';
 const [state,setState]=useState<SessionState|null>(null),[oldWarp,setOldWarp]=useState(false),[pending,setPending]=useState(false),[error,setError]=useState('');
 const owned=!!state?.tunnel?.owned||!!state?.recoveryRequired||oldWarp;
 async function refresh(){if(!available)return;try{const [value,legacy]=await Promise.all([api!.gamePingStatus(),api!.gamePingLegacy()]);setState(value);setOldWarp(legacy.owned)}catch(e){setError(clean(e))}}
 useEffect(()=>{if(!available||!active)return;void refresh();const timer=setInterval(()=>void refresh(),5000);return()=>clearInterval(timer)},[available,active]);
 async function stop(){setError('');setPending(true);try{await api!.gamePingStop();if(oldWarp)await api!.gamePingLegacyStop();await refresh();onCompleted()}catch(e){setError(clean(e))}finally{setPending(false)}}
 async function report(){setError('');setPending(true);try{await api!.gamePingReport()}catch(e){setError(clean(e))}finally{setPending(false)}}
 const status=pending?'Выполняем запрос':owned?'Нужно отключить прошлое соединение':'Игровой маршрут недоступен';
 return <div className="ping-session-workspace">
  <section className="session-start"><div><span className="eyebrow">WINDOWS 10 / 11</span><h2>Подключить и играть</h2><p>Сначала Fortnite. Поддержка других игр — после проверки игрового маршрута.</p></div>
   <span className="session-badge"><Network size={15}/>{status}</span>
   <div className="ping-services" role="group" aria-label="Игра для подключения">
    <button className="is-selected" aria-pressed="true" disabled={pending}>Fortnite<small>{state?.games.find(g=>g.id==='fortnite')?.installed?'Найдена в Epic':'Запуск через Epic'}</small></button>
    <button disabled aria-pressed="false">PUBG<small>Проверим после Fortnite</small></button>
    <button disabled aria-pressed="false">Escape from Tarkov<small>Проверим после Fortnite</small></button>
   </div>
   <div className="session-actions">
    <button className="button primary" disabled title="Подтверждённый бесплатный маршрут пока недоступен"><Play size={17}/>Подключить и играть</button>
    <button className="button secondary" disabled={!available||!owned||pending} onClick={()=>void stop()}><Square size={15}/>Отключить</button>
   </div>
   <p className="session-route-unavailable" role="status"><Info size={17}/>Нет подтверждённого бесплатного узла без регистрации. Подключение и вход в матч не выполнены.</p>
   {owned&&<p className="session-hint">Сохранилось предыдущее соединение GTM PC. Закрой игру и нажми «Отключить» для восстановления. Новое соединение не создаётся.</p>}
  </section>
  {error&&<div className="ping-note ping-error" role="alert"><Info size={17}/><p>{error}</p></div>}
  {pending&&<div className="ping-progress" role="status"><LoaderCircle className="spin" size={17}/><span>Выполняем запрос…</span></div>}
  <details className="session-options"><summary>Почему подключение пока недоступно</summary>
   <p>Бесплатная интеграция GearUP на этих условиях не найдена. У Riseup API работает без аккаунта, но реальные UDP/TLS-подключения к двум узлам отклонены из-за просроченного CA. Calyx API не разрешается в DNS. WARP не предоставляет выбор другой страны.</p>
   <p>Минимальное условие продолжения — действительная цепочка доверия и рабочий UDP-узел разрешённого бесплатного провайдера либо официальное соглашение об интеграции GearUP без оплаты пользователем. Регистрация, ключи и поиск сервера на тебя не перекладываются.</p>
   <p>Условия Creative и обычного матча на твоём подключении ещё не проверены. Приложение не запускает игру с обычным подключением под видом бустера.</p>
   <div className="session-actions"><button className="button secondary" disabled={!available||pending} onClick={()=>void api!.gamePingSetup('research').catch(e=>setError(clean(e)))}>Проверенные источники и результаты</button><button className="button secondary" disabled={!available||pending} onClick={()=>void report()}><Download size={15}/>Собрать отчёт проверки</button></div>
  </details>
 </div>;
}
