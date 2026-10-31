const INTEL_DSA='https://dsadata.intel.com/installer/Intel-Driver-and-Support-Assistant-Installer.exe';
const link=(id,title,url,kind='category',note='')=>({id,title,url,kind,note});
function oemLink(system){
 const vendor=((system.manufacturer||'')+' '+(system.vendor||'')).toLowerCase();
 const pc=(system.manufacturer||'').toLowerCase();
 if(/lenovo/.test(pc))return link('oem-model','Драйверы OEM Lenovo','https://pcsupport.lenovo.com/products','selector','Выберите точную модель компьютера; OEM-пакеты приоритетнее производителя самой платы.');
 if(/dell/.test(pc))return link('oem-model','Драйверы OEM Dell по Service Tag','https://www.dell.com/support/home/en-us?app=drivers','selector','Выберите точную модель компьютера или Service Tag.');
 if(/\bhp\b|hewlett/.test(pc))return link('oem-model','Драйверы OEM HP','https://support.hp.com/drivers','selector','Выберите модель компьютера, а не похожую розничную плату.');
 const model=system.model&& !/system product|to be filled|default string/i.test(system.model)?system.model:system.board||'';
 const encoded=encodeURIComponent(model);
 if(/gigabyte/.test(vendor))return link('oem-model','Найти точную модель GIGABYTE',`https://www.gigabyte.com/Search?kw=${encoded}`,'model','Сверьте ревизию платы. Во вкладке Support → Downloads выберите нужную категорию и Windows.');
 if(/asus|asustek/.test(vendor))return link('oem-model','Драйверы модели ASUS',`https://www.asus.com/support/download-center/?model=${encoded}`,'model','Проверьте выбранную модель в Download Center; параметры URL сайт может не заполнить автоматически.');
 if(/micro-star|msi/.test(vendor))return link('oem-model','Драйверы и поиск модели MSI',`https://www.msi.com/search/${encoded}`,'model','Откройте страницу именно своей модели → Support → Drivers.');
 if(/asrock/.test(vendor))return link('oem-model','Драйверы ASRock по модели','https://www.asrock.com/support/index.asp?cat=Drivers','selector','Выберите точную модель платы. Ревизию и список поддерживаемых ОС нужно проверить.');
 if(/lenovo/.test(vendor))return link('oem-model','Автоопределение модели Lenovo','https://pcsupport.lenovo.com/products','selector','Используйте Detect Product или выберите модель; предпочтительнее драйверы OEM.');
 if(/dell/.test(vendor))return link('oem-model','Драйверы Dell по Service Tag','https://www.dell.com/support/home/en-us?app=drivers','selector','Серийный номер автоматически не отправляется. Укажите его на сайте Dell.');
 if(/\bhp\b|hewlett/.test(vendor))return link('oem-model','Драйверы HP по модели','https://support.hp.com/drivers','selector','Модель и аппаратную ревизию выберите на сайте HP.');
 return null;
}
export function buildDriverCatalog(system,version){
 if(!['10','11'].includes(version))throw new Error('Unsupported Windows version');
 const gpu=(system.gpu||[]).join(', '),network=system.network||[],audio=system.audio||[];
 const oem=oemLink(system);
 const oemLinks=()=>oem?[{...oem,id:'category-oem'}]:[];
 const categories=[];
 const graphics=[];
 if(/nvidia/i.test(gpu))graphics.push(link('nvidia-driver','Драйвер NVIDIA по модели видеокарты','https://www.nvidia.com/en-us/drivers/','selector','Выберите серию, модель '+gpu+' и Windows '+version+'. Случайный пакет драйвера не подставляется.'),link('nvidia-app','NVIDIA App — обновление совместимых драйверов','https://www.nvidia.com/en-us/software/nvidia-app/','autodetect','Программа NVIDIA определяет поддерживаемую видеокарту. Это не файл драйвера от LAGOPHONE.'));
 if(/amd|radeon/i.test(gpu))graphics.push(link('amd-gpu','AMD Radeon — выбор GPU и автоопределение','https://www.amd.com/en/support/download/drivers.html','autodetect','Выберите именно графический адаптер, а не чипсет материнской платы.'));
 if(/intel/i.test(gpu))graphics.push(link('intel-gpu-dsa','Intel DSA — официальный установщик автоподбора',INTEL_DSA,'installer','Поддержка зависит от поколения GPU. Для ноутбуков сначала проверьте драйвер OEM.'));
 categories.push({id:'gpu',name:'Видеокарта',device:gpu||'Не определена',description:'Графический драйвер. HDMI/DisplayPort-аудио обычно входит в его пакет.',links:graphics.length?graphics:oemLinks()});
 const board=system.board||'',chipset=board.match(/\b(X870E|X870|X670E|X670|B850|B650E|B650|A620|X570|B550|A520|X470|B450|X370|B350|A320|TRX40)\b/i)?.[1]?.toLowerCase();
 let chipsetLinks=oemLinks();
 if(chipset){const platform=/^(x870|x670|b850|b650|a620)/.test(chipset)?'am5':chipset==='trx40'?'strx4':'am4';chipsetLinks=[link('amd-chipset-'+chipset,'AMD '+chipset.toUpperCase()+' — драйверы чипсета',`https://www.amd.com/en/support/downloads/drivers.html/chipsets/${platform}/${chipset}.html`,'category','Найдено по обозначению платы. На странице сверьте платформу и Windows '+version+'. Не устанавливайте RAID-драйвер без RAID-конфигурации.'),...chipsetLinks];}
 else if(/intel/i.test(system.cpu||''))chipsetLinks=[...chipsetLinks,link('intel-chipset','Intel Chipset Device Software (INF)','https://www.intel.com/content/www/us/en/download/19347/chipset-inf-utility.html','category','INF-пакет идентификации устройств чипсета. Для OEM-модели предпочтителен пакет с её страницы поддержки.')];
 else if(/amd/i.test(system.cpu||''))chipsetLinks.push(link('amd-chipset-selector','AMD — выбрать чипсет материнской платы','https://www.amd.com/en/support/download/drivers.html','selector','По одному названию процессора нельзя надёжно определить чипсет. Выберите раздел Chipsets и платформу платы.'));
 categories.push({id:'chipset',name:'Чипсет',device:chipset?.toUpperCase()||board||'Чипсет не определён',description:'USB, PCIe, управление питанием и другие компоненты платформы. Отдельный универсальный «драйвер процессора» обычно не требуется.',links:chipsetLinks});
 const intelNet=network.some(n=>/intel|VEN_8086/i.test(n.name+' '+n.vendor+' '+(n.hardwareId||'')));
 const networkLinks=oemLinks();
 if(intelNet)networkLinks.push(link('intel-network-dsa','Intel DSA — определить драйвер сетевого адаптера',INTEL_DSA,'installer','Официальная утилита проверит поддерживаемые устройства.'));
 const intelWireless=network.some(n=>/intel|VEN_8086/i.test(n.name+' '+n.vendor+' '+(n.hardwareId||''))&&/wi.?fi|wireless|802\.11/i.test(n.name));
 const intelWired=network.some(n=>/intel|VEN_8086/i.test(n.name+' '+n.vendor+' '+(n.hardwareId||''))&&/ethernet|gigabit|i21[0-9]|i22[0-9]|pro\/1000/i.test(n.name));
 if(intelWireless)networkLinks.push(link('intel-wifi','Intel Wi-Fi — Windows 10/11','https://www.intel.com/content/www/us/en/download/19351/windows-10-and-windows-11-wi-fi-drivers-for-intel-wireless-adapters.html','category','Только для адаптеров из списка поддерживаемых моделей на странице. Не устанавливайте на Realtek/MediaTek.'));
 if(intelWired)networkLinks.push(link('intel-ethernet','Intel Ethernet — полный пакет адаптеров','https://www.intel.com/content/www/us/en/download/15084/intel-ethernet-adapter-complete-driver-pack.html','category','Проверьте точную модель LAN-адаптера и поддерживаемую ОС.'));
 categories.push({id:'network',name:'LAN и Wi-Fi',device:network.map(n=>n.name).join(', ')||'Сетевые адаптеры не определены',description:'Проводная сеть и беспроводной адаптер могут быть разных производителей. Пакеты Intel предлагаются только при обнаружении Intel-сетевого адаптера.',links:networkLinks});
 categories.push({id:'audio',name:'Звук',device:audio.map(n=>n.name).join(', ')||'Аудиоустройства не определены',description:'Realtek/Intel SST и аудиоэффекты зависят от модели платы или ноутбука. Используйте раздел Audio её страницы поддержки; универсальный пакет может убрать OEM-функции.',links:oemLinks()});
 const bluetooth=system.bluetooth||[];
 const btLinks=oemLinks();
 if(bluetooth.some(n=>/intel|VID_8087/i.test(n.name+' '+(n.hardwareId||''))))btLinks.push(link('intel-bluetooth','Intel Bluetooth — Windows 10/11','https://www.intel.com/content/www/us/en/download/18649/intel-wireless-bluetooth-for-windows-10-and-windows-11.html','category','Только для поддерживаемых Intel Bluetooth-адаптеров.'));
 categories.push({id:'bluetooth',name:'Bluetooth',device:bluetooth.map(n=>n.name).join(', ')||'Физический Bluetooth-адаптер не определён',description:'Наличие Bluetooth нельзя вывести из названия процессора. Модуль может использовать отдельный от Wi-Fi драйвер.',links:btLinks});
 const disks=(system.disks||[]).map(d=>d.name).join(', '),storage=oemLinks();
 if(/samsung/i.test(disks))storage.push(link('samsung-storage','Samsung SSD — инструменты и поддерживаемые драйверы','https://semiconductor.samsung.com/consumer-storage/support/tools/','category','Проверьте модель SSD. Современные NVMe часто используют штатный драйвер Windows; отдельный пакет нужен не всем.'));
 categories.push({id:'storage',name:'Накопители / NVMe / RAID',device:disks||'Не определены',description:'Штатный NVMe-драйвер Windows обычно достаточен. Не переключайте AHCI/RAID и не устанавливайте RAID-пакет без проверки конфигурации.',links:storage});
 categories.push({id:'components',name:'Visual C++, DirectX и .NET',device:'Системные библиотеки',description:'Устанавливаются по требованиям конкретных игр и программ, а не вместо драйверов оборудования.',links:[link('vcredist-x64','Visual C++ 2015–2022 x64 — официальный EXE','https://aka.ms/vs/17/release/vc_redist.x64.exe','installer'),link('vcredist-x86','Visual C++ 2015–2022 x86 — официальный EXE','https://aka.ms/vs/17/release/vc_redist.x86.exe','installer','32-битным играм может понадобиться и x86 на 64-битной Windows.'),link('directx-runtime','DirectX End-User Runtime — страница пакета','https://www.microsoft.com/en-us/download/details.aspx?id=35','category','Дополнительные старые библиотеки, не замена текущему DirectX Windows.'),link('dotnet-desktop','.NET Desktop Runtime — выбрать версию','https://dotnet.microsoft.com/en-us/download/dotnet','selector','Выберите версию, требуемую приложением, и Desktop Runtime x64/x86.') ]});
 return categories.map(c=>({...c,links:c.links.map(l=>({...l,id:c.id+':'+l.id})),windows:version,boardRevision:system.boardVersion||null}));
}
