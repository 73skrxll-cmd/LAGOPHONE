import references from './data/game-references.json' with {type:'json'};
export const performanceProfiles=[{id:'fast1080',label:'1080p · Больше FPS'},{id:'quality1080',label:'1080p · Качество'},{id:'quality1440',label:'1440p · Качество'}];
export const performanceSources={
 'fps-fortnite':'https://www.computerbase.de/artikel/gaming/fortnite-benchmark-test.87822/',
 'fps-pubg':'https://www.computerbase.de/artikel/gaming/pubg-battlegrounds-benchmark-test.87841/',
 'fps-cs2':'https://www.computerbase.de/artikel/gaming/counter-strike-2-benchmark-test.87904/',
 'fps-1660s':'https://www.notebookcheck.net/NVIDIA-GeForce-GTX-1660-Super-Desktop-GPU-Benchmarks-and-Specs.448675.0.html',
 'fps-3060':'https://www.notebookcheck.net/NVIDIA-GeForce-RTX-3060-Desktop-GPU-Benchmarks-and-Specs.579000.0.html'
};
const normalize=name=>String(name||'').toLowerCase().replace(/nvidia|geforce|amd|radeon|\(desktop\)|\(r\)|\(tm\)/g,'').replace(/[^a-z0-9]/g,'');
const names=[...new Set(Object.values(references).flatMap(game=>Object.values(game).flatMap(mode=>Object.keys(mode))))];
export function matchPerformanceGpu(name){if(/laptop|mobile|max.?q|\b[hm]x?\b/i.test(name||''))return null;return names.find(model=>normalize(model)===normalize(name))||null}
// Deliberately broad, uncalibrated CPU envelopes. These are model assumptions,
// not measured CPU FPS or a statistical confidence interval. See docs/performance.md.
export function cpuEnvelope(name){
 const value=String(name||'');if(/\d{4,5}(?:U|H|HS|HX)\b/i.test(value))return null;
 const amd=value.match(/Ryzen\s+[3579]\s+(\d{4,5})(X3D|XT|X|G|GT|F)?\b/i);
 if(amd){const model=Number(amd[1]),gen=Math.floor(model/1000);if(gen<1||gen>9||model>=10000)return null;return {kind:gen<=4||model===5500?'older':'modern',low:gen<=4||model===5500?.55:.7,high:gen<=4||model===5500?1.05:1.15}}
 const intel=value.match(/Core\s*(?:\(TM\))?\s*i[3579]-(\d{4,5})(?:K|KF|F|KS|T)?\b/i);
 if(intel){const model=Number(intel[1]),gen=Math.floor(model/1000);if(gen<2||gen>14)return null;return {kind:gen<=9?'older':'modern',low:gen<=9?.5:.7,high:gen<=9?1:1.15}}
 if(/Core.*Ultra\s+[579]\s+\d{3}(?:K|KF|F)?\b/i.test(value))return {kind:'modern',low:.7,high:1.15};
 return null;
}
const extra={
 cyberpunk:{name:'Cyberpunk 2077',version:'Тесты 2.0 / 2.2–2.21',settings:['Medium, RT/FSR выкл.','High, RT/FSR выкл.','Ultra, RT/FSR выкл.'],values:{'GTX 1660 Super':[61.9,52.4,28.8],'RTX 3060':[97.5,83,42.45]}},
 dota2:{name:'Dota 2',version:'Старая тест-сцена Reborn; не текущий патч',settings:['Высокие, 100% рендер','Максимальные, 100% рендер','Нет теста этого режима'],values:{'GTX 1660 Super':[205,188,null],'RTX 3060':[181,168,null]}},
 gta5:{name:'GTA V Legacy',version:'Тест-сцена Legacy; не Enhanced / GTA Online',settings:['High, FXAA','Ultra','Ultra'],values:{'GTX 1660 Super':[171,86,62],'RTX 3060':[165,97,81]}}
};
const games=[{id:'fortnite',name:'Fortnite',version:'Тест 19.04.2024; патчи меняют FPS',settings:['Medium, без Nanite/Lumen, DLSS/TSR Quality','High, Lumen, HW RT выкл., DLSS/TSR Quality','High, Lumen, HW RT выкл., DLSS/TSR Balanced']},{id:'pubg',name:'PUBG: Battlegrounds',version:'Тест 2024; патчи меняют FPS',settings:['Medium, DX11 Enhanced, 100% рендер','Ultra, DX11 Enhanced, 100% рендер','Ultra, DX11 Enhanced, 100% рендер']},{id:'cs2',name:'Counter-Strike 2',version:'Тест 2024; патчи меняют FPS',settings:['Medium, штатный пресет','Very High, MSAA 8×','Very High, MSAA 8×']},...Object.entries(extra).map(([id,game])=>({id,...game}))];
export function estimatePerformance(system,profile='fast1080',gpuName){
 if(!performanceProfiles.some(p=>p.id===profile))profile='fast1080';
 const detected=Array.isArray(system?.gpu)?system.gpu:[];
 const requested=gpuName&&detected.includes(gpuName)?gpuName:detected.find(name=>matchPerformanceGpu(name))||detected[0]||'';
 const gpu=matchPerformanceGpu(requested),cpu=cpuEnvelope(system?.cpu),ram=Number(system?.ram),index=performanceProfiles.findIndex(p=>p.id===profile);
 const reason=!gpu?'Для этой видеокарты нет проверенного профиля.':!cpu?'Для процессора нет расчётного профиля.':!Number.isFinite(ram)||ram<=0?'Объём RAM не определён.':ram<8?'Мало RAM для устойчивой оценки.':null;
 const rows=games.map(game=>{
  const reference=references[game.id]?.[profile]?.[gpu]??extra[game.id]?.values[gpu]?.[index]??null;
  const source=references[game.id]?'fps-'+game.id:gpu==='GTX 1660 Super'?'fps-1660s':gpu==='RTX 3060'?'fps-3060':null;
  const available=!reason&&Number.isFinite(reference)&&reference>0;
  // Round outward: avoid a precise-looking promise. RAM <16 broadens only
  // the lower end; storage, motherboard and Windows edition never multiply FPS.
  const low=available?Math.max(5,Math.floor(reference*cpu.low*(ram<16?.75:1)/5)*5):null;
  const high=available?Math.max(low+5,Math.ceil(reference*cpu.high/5)*5):null;
  const cpuSensitive=['cs2','dota2','gta5','fortnite'].includes(game.id);
  const limitation=!available?'Не определено':ram<16?'Возможен недостаток RAM':cpu.kind==='older'&&(reference>180||(cpuSensitive&&profile==='fast1080'&&reference>=140))?'Возможен упор в CPU':profile!=='fast1080'||reference<120?'Возможен упор в GPU':'CPU / GPU — нужен замер';
  return {id:game.id,name:game.name,version:game.version,settings:game.settings[index],reference,source:reference?source:null,low,high,limitation,reason:reason||(!available?'Нет теста этой GPU в выбранном режиме.':null)};
 });
 return {gpu:requested,matchedGpu:gpu,cpuKnown:!!cpu,profile,rows};
}
export function componentImpact(system,component){
 const cpu=cpuEnvelope(system?.cpu),ram=Number(system?.ram);
 return ({cpu:{title:'Процессор',text:!cpu?'Модель CPU не распознана: расчёт FPS скрыт.':cpu.kind==='older'?'На низких настройках и при высоком FPS возможен упор в CPU. Проверьте загрузку отдельных потоков и время кадра в самой игре.':'Модель CPU учтена в широком расчётном диапазоне. Нагрузка на отдельные потоки и сцена игры могут ограничить FPS даже при неполной общей загрузке.'},gpu:{title:'Видеокарта',text:'При высоких настройках и 1440p чаще ограничивает GPU. Сравните профили ниже. VRAM и активную видеокарту игры приложение не измеряет; выберите GPU для оценки, если их несколько.'},ram:{title:'Оперативная память',text:ram>0?(ram<16?'Объём RAM может вызывать подкачку и рывки. Закройте лишние приложения и проверьте фактическое потребление памяти.':`${ram} ГБ учтены в оценке. Свободную память и двухканальный режим этот расчёт не подтверждает.`):'Объём RAM не определён: расчёт FPS скрыт.'},board:{title:'Материнская плата',text:'По названию платы FPS не определяется. Совместимость CPU, BIOS, режим памяти и линии PCIe проверяются отдельно; плата не даёт универсальный процент ускорения.'},storage:{title:'Накопители',text:!(system?.disks||[]).length?'Тип накопителей не определён. Время загрузки и подкачку нужно проверять отдельно; по модели диска нельзя вывести средний FPS.':(system?.disks||[]).some(d=>/hdd/i.test(d.type||''))?'Обнаружен HDD. Проверьте, где установлена игра: медленный диск может задерживать загрузку данных. Расположение игр и подкачка не определены.':'SSD помогает загрузке игры и данных, но не даёт фиксированный прирост среднего FPS. Место установки игры и заполнение диска не проверены.'},os:{title:'Windows',text:'Версия Windows не используется как множитель FPS. Драйверы, фоновые приложения, температура и питание могут менять результат; калькулятор их не измеряет.'}})[component]||{title:'Влияние комплектующих',text:'Выберите комплектующую выше, чтобы увидеть её роль и возможные ограничения.'};
}
