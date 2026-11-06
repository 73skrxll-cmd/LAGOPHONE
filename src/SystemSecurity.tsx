import {useEffect,useState} from 'react';
import {Cpu,ExternalLink,Info,RefreshCw,ShieldCheck} from 'lucide-react';
import type {SecurityStatus} from './bridge';
import './system-security.css';
function secureBootView(status:SecurityStatus|null){
 const secure=status?.secureBoot;
 if(status?.firmware==='legacy')return {state:'warn',title:'Нужен режим UEFI',detail:'Windows загружена в Legacy / BIOS. Secure Boot в этом режиме недоступен.'};
 if(secure?.enabled===true)return {state:'ok',title:'Включён',detail:secure.source==='firmware'?'Проверено непосредственно через UEFI.':'По записи Windows при последней загрузке. Прямая проверка UEFI недоступна.'};
 if(secure?.enabled===false)return {state:'warn',title:'Выключен',detail:secure.source==='firmware'?'UEFI подтвердил, что Secure Boot выключен.':'По записи Windows при последней загрузке. Прямая проверка UEFI недоступна.'};
 return {state:'unknown',title:'Нет данных',detail:secure?.issue==='access'?'Windows не разрешила прочитать состояние. Это не означает, что Secure Boot выключен.':'Windows не сообщила состояние Secure Boot.'};
}
function tpmView(status:SecurityStatus|null){
 const tpm=status?.tpm;
 if(tpm?.present===false)return {state:'warn',title:'Не обнаружен',detail:'TPM может быть отключён в UEFI или отсутствовать. Поддержка TPM 2.0 не подтверждена.'};
 if(tpm?.present!==true)return {state:'unknown',title:'Нет данных',detail:'Windows не сообщила наличие и версию TPM.'};
 if(tpm.version==='1.2')return {state:'warn',title:'Обнаружен TPM 1.2',detail:'Это не TPM 2.0. Возможность обновления зависит от оборудования.'};
 if(tpm.version!=='2.0')return {state:'unknown',title:'Версия не определена',detail:'TPM обнаружен, но версия 2.0 не подтверждена.'};
 if(tpm.lockedOut===true)return {state:'warn',title:'TPM 2.0 заблокирован',detail:'Windows сообщает о временной блокировке TPM.'};
 if(tpm.enabled===false)return {state:'warn',title:'TPM 2.0 выключен',detail:'Устройство обнаружено, но Windows сообщает, что оно выключено.'};
 if(tpm.ready===true)return {state:'ok',title:'TPM 2.0 готов',detail:'Windows подтвердила готовность к работе.'};
 if(tpm.ready===false)return {state:'warn',title:'TPM 2.0 не готов',detail:'Версия подходит, но Windows ещё не подтвердила готовность к работе.'};
 return {state:'unknown',title:'TPM 2.0 обнаружен',detail:'Версия подтверждена. Готовность к работе проверить не удалось.'};
}
export function SystemSecurity({refreshKey}:{refreshKey:number}){
 const [status,setStatus]=useState<SecurityStatus|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 const native=typeof window.lagophone?.securityStatus==='function';
 useEffect(()=>{
  let disposed=false;
  if(!native)return;
  setLoading(true);setError('');
  window.lagophone!.securityStatus!().then(value=>{if(!disposed)setStatus(value)}).catch(()=>{if(!disposed){setStatus(null);setError('Не удалось прочитать состояние. Повторите проверку.')}}).finally(()=>{if(!disposed)setLoading(false)});
  return()=>{disposed=true};
 },[native,refreshKey,revision]);
 useEffect(()=>{
  if(!native)return;
  const refresh=()=>{if(!document.hidden)setRevision(value=>value+1)};
  const timer=setInterval(refresh,60000);window.addEventListener('focus',refresh);
  return()=>{clearInterval(timer);window.removeEventListener('focus',refresh)};
 },[native]);
 const secure=secureBootView(status),tpm=tpmView(status);
 const firmware=status?.firmware==='uefi'?'UEFI':status?.firmware==='legacy'?'Legacy / BIOS':'Режим загрузки не определён';
 const secureSource=status?.secureBoot.source==='firmware'?'Confirm-SecureBootUEFI':status?.secureBoot.source==='windows-boot'?'Windows · состояние при загрузке':'Источник недоступен';
 const tpmSource=[...new Set([status?.tpm.source==='tbs'?'Windows TBS':status?.tpm.source==='cim'?'Win32_Tpm':status?.tpm.source==='get-tpm'?'Get-Tpm':'',typeof status?.tpm.ready==='boolean'?'Get-Tpm':''].filter(Boolean))].join(' · ')||'Источник недоступен';
 async function recovery(){try{await window.lagophone?.openRecoverySettings?.()}catch{setError('Не удалось открыть параметры Windows. Откройте «Параметры → Восстановление».')}}
 return <section className="system-security" aria-labelledby="system-security-title" aria-busy={loading}>
  <div className="section-heading"><h2 id="system-security-title"><ShieldCheck size={18}/> Безопасность системы</h2><button className="button secondary" disabled={!native||loading} onClick={()=>setRevision(value=>value+1)}><RefreshCw size={14} className={loading?'spin':''}/>{loading?'Проверка…':'Проверить'}</button></div>
  <div className="security-grid">{[{id:'secure-boot',name:'Secure Boot',icon:ShieldCheck,view:secure,source:secureSource,extra:firmware},{id:'tpm',name:'TPM 2.0',icon:Cpu,view:tpm,source:tpmSource,extra:'Версия и готовность устройства'}].map(({id,name,icon:Icon,view,source,extra})=><article key={id} className="security-card" data-security={id} data-state={view.state}><div className="security-card-title"><span className="tile-icon"><Icon size={22}/></span><h3>{name}</h3><span className="security-state-dot" aria-hidden="true"/></div><strong>{view.title}</strong><p>{view.detail}</p><small>{extra}</small><small>Источник: {source}</small></article>)}</div>
  <div className="security-check-status" role="status">{!native||status?.supported===false?'Проверка доступна в Windows-версии GTM PC.':error|| (loading?'Читаем состояние Windows…':status?.checkedAt?`Проверено ${new Date(status.checkedAt).toLocaleTimeString('ru-RU')}. Обновление раз в минуту, пока открыт раздел.`:'')}</div>
  <details className="security-help"><summary><Info size={17}/> Как включить Secure Boot и TPM 2.0</summary><p>Автоматически включить их на любом ПК из Windows нельзя. Эти параметры меняются в UEFI материнской платы.</p><ol><li>Откройте параметры восстановления Windows → особые варианты загрузки → перезагрузка → поиск и устранение неисправностей → дополнительные параметры → параметры встроенного ПО UEFI.</li><li>Для TPM ищите <b>AMD fTPM</b>, <b>Intel PTT</b> или <b>Security Device Support</b>. Secure Boot обычно находится в разделе <b>Boot</b> или <b>Security</b>. Названия зависят от платы.</li><li>Сохраните настройки, загрузите Windows и нажмите «Проверить».</li></ol><p>Перед изменением UEFI сохраните ключ восстановления BitLocker, если шифрование включено. Не очищайте TPM. В режиме Legacy нельзя просто переключать CSM / UEFI: сначала нужна проверка разметки диска и загрузчика.</p><button className="button secondary" disabled={!native} onClick={()=>void recovery()}>Открыть параметры восстановления <ExternalLink size={14}/></button><small>Приложение откроет настройки Windows. Перезагрузка автоматически не запускается.</small></details>
 </section>;
}
