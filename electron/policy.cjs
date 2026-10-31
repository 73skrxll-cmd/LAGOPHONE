const apps = {
  discord: { page:'https://discord.com/', url: 'https://discord.com/api/download?platform=win', file: 'DiscordSetup.exe' },
  steam: { page:'https://store.steampowered.com/about/', url: 'https://cdn.akamai.steamstatic.com/client/installer/SteamSetup.exe', file: 'SteamSetup.exe' },
  nanazip: { page: 'https://github.com/M2Team/NanaZip/releases' },
  qbittorrent: { page: 'https://www.qbittorrent.org/download' },
  memreduct: { page: 'https://github.com/henrypp/memreduct/releases' },
  vscode: { page:'https://code.visualstudio.com/', url: 'https://update.code.visualstudio.com/latest/win32-x64-user/stable', file: 'VSCodeSetup.exe' },
  firefox: { page:'https://www.mozilla.org/firefox/', url: 'https://download.mozilla.org/?product=firefox-latest-ssl&os=win64&lang=ru', file: 'FirefoxSetup.exe' },
  vlc: { page: 'https://www.videolan.org/vlc/' },
};
const links = {
  scskiller:'https://github.com/BlueHeisenberg/SCSKiller/releases/latest',
  nvidia: 'https://www.nvidia.com/en-us/software/nvidia-app/',
  amd: 'https://www.amd.com/en/support/download/drivers.html',
  intel: 'https://www.intel.com/content/www/us/en/support/detect.html',
  asus: 'https://www.asus.com/support/download-center/',
  msi: 'https://www.msi.com/support/download',
  gigabyte: 'https://www.gigabyte.com/Support',
  asrock: 'https://www.asrock.com/support/index.asp',
  lenovo: 'https://pcsupport.lenovo.com/',
  dell: 'https://www.dell.com/support/home/',
  hp: 'https://support.hp.com/drivers',
  vcredist: 'https://aka.ms/vs/17/release/vc_redist.x64.exe',
  directx: 'https://www.microsoft.com/en-us/download/details.aspx?id=35',
  dotnet: 'https://dotnet.microsoft.com/en-us/download/dotnet',
};
const actions = {
  temp: { title: 'Очистить временные файлы старше 7 дней?', script: "$cut=(Get-Date).AddDays(-7); $files=Get-ChildItem -LiteralPath $env:TEMP -File -Recurse -ErrorAction SilentlyContinue | Where-Object LastWriteTime -lt $cut; $count=0; $bytes=0; foreach($f in $files){try{Remove-Item -LiteralPath $f.FullName -ErrorAction Stop; $count++; $bytes+=$f.Length}catch{}}; Write-Output ('Удалено файлов: '+$count+'. Освобождено: '+[math]::Round($bytes/1MB,1)+' МБ. Занятые файлы пропущены.')" },
  optimize: { title: 'Открыть штатную оптимизацию дисков?', script: "Start-Process dfrgui.exe; Write-Output 'Открыта оптимизация дисков. Windows подберёт TRIM для SSD или дефрагментацию для HDD.'" },
  apps: { title: 'Открыть список установленных программ?', script: "Start-Process 'ms-settings:appsfeatures'; Write-Output 'Выберите ненужные программы в настройках Windows.'" },
  startup: { title: 'Открыть управление автозагрузкой?', script: "Start-Process 'ms-settings:startupapps'; Write-Output 'Открыты настройки автозагрузки.'" },
  services: { title: 'Открыть управление службами?', script: "Start-Process services.msc; Write-Output 'Открыт диспетчер служб. Изменяйте только службы с известным назначением.'" },
  game: { title: 'Открыть настройки игрового режима?', script: "Start-Process 'ms-settings:gaming-gamemode'; Write-Output 'Открыты настройки игрового режима.'" },
  storage: { title: 'Открыть контроль памяти?', script: "Start-Process 'ms-settings:storagepolicies'; Write-Output 'Открыты настройки автоматической очистки.'" },
  restore: { title: 'Открыть защиту системы и точки восстановления?', script: "Start-Process SystemPropertiesProtection.exe; Write-Output 'Включите защиту системного диска и нажмите «Создать».'" },
  transparency: { title: 'Отключить прозрачность интерфейса?', script: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' -Name EnableTransparency -Type DWord -Value 0; Write-Output 'Прозрачность отключена. Вернуть её можно кнопкой отмены.'" },
  'transparency-undo': { title: 'Включить прозрачность интерфейса?', script: "Set-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize' -Name EnableTransparency -Type DWord -Value 1; Write-Output 'Прозрачность включена.'" },
};
function validateAction(id, selected, actual) {
  if (!Object.hasOwn(actions, id)) throw new Error('Неизвестное действие');
  if (!['10', '11'].includes(selected) || selected !== actual) throw new Error('Выбранная Windows не совпадает с установленной. Измените выбор системы.');
  return actions[id];
}
module.exports = { apps, links, actions, validateAction };
