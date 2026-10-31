const { windowsPowerShellEnvironment, windowsPowerShellExecutable } = require('./windows-powershell.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const worker=path.join(__dirname,'optimizer.ps1');
function ps(code){return execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; "+code,'utf16le').toString('base64')],{env:windowsPowerShellEnvironment(),encoding:'utf8',timeout:120000,windowsHide:true}).trim()}
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const skip=process.platform!=='win32';
test('Windows PowerShell loads its own security module when launched from a PowerShell 7 environment', {skip},()=>{
 const inherited={...process.env,PSModulePath:path.win32.join(process.env.ProgramFiles||'C:\\Program Files','PowerShell','7','Modules'),PSModuleAnalysisCachePath:path.join(require('node:os').tmpdir(),'pwsh7-analysis-cache-fixture')};
 // Windows PowerShell can expose built-in commands as snap-ins, so ModuleBase is
 // not a reliable identity check. Verify the command assembly and exercise its ACL API.
 const code=`
 $ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Console]::OutputEncoding=[Text.Encoding]::UTF8;
 Import-Module Microsoft.PowerShell.Security -ErrorAction Stop;
 $command=Get-Command Set-Acl -CommandType Cmdlet -ErrorAction Stop;
 $assembly=$command.ImplementingType.Assembly.GetName();
 $directory=[IO.Path]::Combine([IO.Path]::GetTempPath(),'lagophone-acl-'+[guid]::NewGuid().ToString());
 [IO.Directory]::CreateDirectory($directory) | Out-Null;
 try {
   $original=Get-Acl -LiteralPath $directory;
   $sections=[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group;
   $beforeSddl=$original.GetSecurityDescriptorSddlForm($sections);
   Set-Acl -LiteralPath $directory -AclObject $original -ErrorAction Stop;
   $roundtripSddl=(Get-Acl -LiteralPath $directory).GetSecurityDescriptorSddlForm($sections);
   # Compare intended access, not byte-for-byte SDDL flags from inherited ACLs.
   $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User;
   $desired=[Security.AccessControl.DirectorySecurity]::new();
   $desired.SetOwner($original.GetOwner([Security.Principal.SecurityIdentifier]));
   $desired.SetGroup($original.GetGroup([Security.Principal.SecurityIdentifier]));
   $desired.SetAccessRuleProtection($true,$false);
   $desired.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow'));
   Set-Acl -LiteralPath $directory -AclObject $desired -ErrorAction Stop;
   $actual=Get-Acl -LiteralPath $directory;
   $rules=@($actual.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | ForEach-Object {@{sid=$_.IdentityReference.Value;rights=[int]$_.FileSystemRights;inheritance=[int]$_.InheritanceFlags;propagation=[int]$_.PropagationFlags;inherited=$_.IsInherited;type=[string]$_.AccessControlType}});
   $probe=[IO.Path]::Combine($directory,'write-probe.txt');
   [IO.File]::WriteAllText($probe,'ACL access verified');
   $writeVerified=([IO.File]::ReadAllText($probe) -eq 'ACL access verified');
   [IO.File]::Delete($probe);
   @{version=$PSVersionTable.PSVersion.Major;source=$command.Source;assembly=$assembly.Name;assemblyMajor=$assembly.Version.Major;implementation=$command.ImplementingType.FullName;beforeSddl=$beforeSddl;roundtripSddl=$roundtripSddl;desiredSddl=$desired.GetSecurityDescriptorSddlForm($sections);actualSddl=$actual.GetSecurityDescriptorSddlForm($sections);protected=$actual.AreAccessRulesProtected;owner=$actual.GetOwner([Security.Principal.SecurityIdentifier]).Value;expectedOwner=$original.GetOwner([Security.Principal.SecurityIdentifier]).Value;userSid=$sid.Value;rules=$rules;writeVerified=$writeVerified} | ConvertTo-Json -Depth 6 -Compress;
 } finally { Remove-Item -LiteralPath $directory -Recurse -Force }
 `;
 const result=JSON.parse(execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{env:windowsPowerShellEnvironment(inherited),encoding:'utf8',timeout:30000,windowsHide:true}).trim());
 assert.equal(result.version,5,JSON.stringify(result));
 assert.equal(result.source,'Microsoft.PowerShell.Security',JSON.stringify(result));
 assert.equal(result.assembly,'Microsoft.PowerShell.Security',JSON.stringify(result));
 assert.equal(result.assemblyMajor,3,JSON.stringify(result));
 assert.equal(result.implementation,'Microsoft.PowerShell.Commands.SetAclCommand',JSON.stringify(result));
 assert.equal(result.protected,true,JSON.stringify(result));
 assert.equal(result.owner,result.expectedOwner,JSON.stringify(result));
 assert.deepEqual(result.rules,[{sid:result.userSid,rights:2032127,inheritance:3,propagation:0,inherited:false,type:'Allow'}],JSON.stringify(result));
 assert.equal(result.writeVerified,true,JSON.stringify(result));
});
test('Windows PowerShell 5.1 parses production worker', {skip},()=>{
 assert.equal(ps(`$tokens=$null;$errors=$null;[Management.Automation.Language.Parser]::ParseFile(${quote(worker)},[ref]$tokens,[ref]$errors) | Out-Null;if($errors.Count){throw ($errors | Out-String)}; 'OK'`),'OK');
});
test('PowerShell production rollback logic with in-memory providers', {skip},()=>{
 const script=path.join(__dirname,'optimizer.logic.tests.ps1');
 const result=execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{env:windowsPowerShellEnvironment(),encoding:'utf8',timeout:30000,windowsHide:true});
 assert.match(result,/PASS: production rollback logic/);
});
test('Windows journal: read settings, apply user registry profile, verify, restore exact prior state', {skip:skip||process.env.LAGOPHONE_WINDOWS_INTEGRATION!=='1'},()=>{
 // This test changes real user settings only on an explicitly opted-in disposable Windows runner.
 const sid=ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
 const version=ps("if([int](Get-CimInstance Win32_OperatingSystem).BuildNumber -ge 22000){'11'}else{'10'}");
 const run=(mode,payload={})=>{
   const encoded=Buffer.from(JSON.stringify({sid,...payload})).toString('base64');
   return JSON.parse(ps(`& ${quote(worker)} -Mode '${mode}' -PayloadBase64 '${encoded}'`));
 };
 const initial=run('inspect');
 assert.equal(initial.ok,true,JSON.stringify(initial));
 assert.equal(initial.audit.basis,'baseline-v1');
 assert.equal(initial.audit.checks.length,18);
 assert.ok(initial.audit.checks.every(check=>typeof check.available==='boolean'&&(check.enabled===null||typeof check.enabled==='boolean')));
 assert.equal(initial.active,false,'Disposable runner must not have an active profile');
 const locations=[
   {p:['Registry::HKEY_USERS',sid,'Software','Microsoft','GameBar'].join('\\'),n:'AutoGameModeEnabled'},
   {p:['Registry::HKEY_USERS',sid,'Software','Microsoft','Windows','CurrentVersion','Themes','Personalize'].join('\\'),n:'EnableTransparency'},
   {p:['Registry::HKEY_USERS',sid,'Control Panel','Desktop','WindowMetrics'].join('\\'),n:'MinAnimate'},
 ];
 for(const id of ['advertising-id','explorer-recent','explorer-frequent','edge-background']){const spec=require('./registry-specs.json')[id][0];locations.push({p:'Registry::HKEY_USERS\\'+sid+'\\'+spec.path,n:spec.name})}
 const encodedLocations=Buffer.from(JSON.stringify(locations)).toString('base64');
 const capture=()=>ps(`$paths=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedLocations}')) | ConvertFrom-Json;$out=@();foreach($item in $paths){$key=Get-Item -LiteralPath $item.p -ErrorAction SilentlyContinue;$exists=$key -and $key.GetValueNames() -contains $item.n;$out+=@{name=$item.n;exists=[bool]$exists;value=$(if($exists){$key.GetValue($item.n)}else{$null});kind=$(if($exists){[string]$key.GetValueKind($item.n)}else{$null})}};$out | ConvertTo-Json -Compress`);
 const before=capture();
 try {
   const result=run('apply',{ids:['game-mode','transparency','animations','explorer-recent','explorer-frequent','edge-background'],ratingPlan:{basis:'profiles-v2',ids:['edge-background']},version,profile:'balanced',power:'keep'});
   assert.equal(result.ok,true,JSON.stringify(result));
   const first=JSON.parse(capture());
   assert.deepEqual(first.find(v=>v.name==='Enabled'),JSON.parse(before).find(v=>v.name==='Enabled'),'First batch must not apply unselected settings');
   const appended=run('apply',{ids:['advertising-id'],version,profile:'balanced',power:'keep',ratingPlan:{basis:'profiles-v2',ids:['edge-background']}});
   assert.equal(appended.ok,true,JSON.stringify(appended));
   const changed=JSON.parse(capture());
   assert.deepEqual(changed.map(v=>({name:v.name,exists:v.exists,value:v.value,kind:v.kind})),[{name:'AutoGameModeEnabled',exists:true,value:1,kind:'DWord'},{name:'EnableTransparency',exists:true,value:0,kind:'DWord'},{name:'MinAnimate',exists:true,value:'0',kind:'String'},...['Enabled','ShowRecent','ShowFrequent','BackgroundModeEnabled'].map(name=>({name,exists:true,value:0,kind:'DWord'}))]);
   const status=run('inspect');
   assert.equal(status.ok,true,JSON.stringify(status));
   assert.equal(status.profileAudit.basis,'profiles-v2');
   assert.deepEqual(status.profileAudit.expectedIds,['edge-background']);
   assert.equal(status.profileAudit.checks[0].enabled,true);
   assert.ok(status.checks.filter(c=>['game-mode','transparency'].includes(c.id)).every(c=>c.enabled));
   if(status.active){
     const permissions=JSON.parse(ps("$file=[IO.Path]::Combine($env:ProgramData,'LAGOPHONE','optimization-state.json');$acl=Get-Acl -LiteralPath $file;$rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | ForEach-Object {@{sid=$_.IdentityReference.Value;rights=[int]$_.FileSystemRights;type=[string]$_.AccessControlType}});@{owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value;protected=$acl.AreAccessRulesProtected;rules=$rules} | ConvertTo-Json -Depth 5 -Compress"));
     assert.equal(permissions.owner,'S-1-5-32-544',JSON.stringify(permissions));
     assert.equal(permissions.protected,true,JSON.stringify(permissions));
     assert.equal(permissions.rules.length,3,JSON.stringify(permissions));
     const users=permissions.rules.find(r=>r.sid==='S-1-5-32-545');
     assert.ok(users&&users.type==='Allow',JSON.stringify(permissions));
     assert.equal(users.rights&(2|4|16|64|256|65536|262144|524288),0,'Journal must not grant ordinary users write/delete/owner/ACL control');
     const duplicate=run('apply',{ids:['game-mode'],version,profile:'basic',power:'keep'});
     assert.equal(duplicate.ok,true,'Already installed settings should be skipped without losing the existing journal');
     assert.equal(duplicate.noChanges,true);
   }
 } finally {
   const status=run('inspect');
   if(status.active){const result=run('restore');assert.equal(result.ok,true,JSON.stringify(result));}
 }
 assert.deepEqual(JSON.parse(capture()),JSON.parse(before),'Registry values, absence and types must be restored exactly');
 assert.equal(run('inspect').active,false);
});

test('standalone game profile sets real High priority now and at next launch without changing the system journal',{skip:skip||process.env.LAGOPHONE_WINDOWS_INTEGRATION!=='1'},()=>{
 const sid=ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
 const version=ps("if([int](Get-CimInstance Win32_OperatingSystem).BuildNumber -ge 22000){'11'}else{'10'}");
 const run=(mode,payload={})=>{const encoded=Buffer.from(JSON.stringify({sid,...payload})).toString('base64');return JSON.parse(ps(`& ${quote(worker)} -Mode '${mode}' -PayloadBase64 '${encoded}'`))};
 const folder=ps("$d=Join-Path ([IO.Path]::GetTempPath()) ('lagophone-game-'+[guid]::NewGuid());New-Item -ItemType Directory -Path $d | Out-Null;Copy-Item -LiteralPath (Join-Path $env:SystemRoot 'System32\\cmd.exe') -Destination (Join-Path $d 'cs2.exe');$d");
 const exe=path.win32.join(folder,'cs2.exe');let firstPid=0,secondPid=0,customPid=0;
 const start=()=>Number(ps(`$p=Start-Process -FilePath ${quote(exe)} -ArgumentList '/d /c ping -n 300 127.0.0.1 > nul' -WindowStyle Hidden -PassThru;$p.Id`));
 const priority=pid=>ps(`(Get-Process -Id ${pid}).PriorityClass.ToString()`);
 const key='Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options\\cs2.exe\\PerfOptions';
 const capture=()=>ps(`$key=Get-Item -LiteralPath ${quote(key)} -ErrorAction SilentlyContinue;$exists=$key -and $key.GetValueNames() -contains 'CpuPriorityClass';@{exists=[bool]$exists;value=$(if($exists){$key.GetValue('CpuPriorityClass')}else{$null});kind=$(if($exists){[string]$key.GetValueKind('CpuPriorityClass')}else{$null})} | ConvertTo-Json -Compress`);
 const original=capture();
 try{
  assert.equal(run('inspect',{scope:'game'}).active,false,'Disposable runner must start without a game journal');
  assert.equal(run('apply',{ids:['transparency'],profile:'basic',version,power:'keep',ratingPlan:{basis:'profiles-v2',ids:['transparency']}}).ok,true);
  const systemHash=()=>ps("(Get-FileHash -LiteralPath (Join-Path $env:ProgramData 'LAGOPHONE\\optimization-state.json') -Algorithm SHA256).Hash");
  const beforeSystem=systemHash();firstPid=start();const beforePriority=priority(firstPid);
  const result=run('apply',{scope:'game',game:'cs2',gamePath:exe,ids:['game-gpu','game-priority'],profile:'basic',version,power:'keep',ratingPlan:{basis:'profiles-v2',ids:[]}});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(priority(firstPid),'High',JSON.stringify(result));
  assert.equal(JSON.parse(capture()).value,3);assert.equal(systemHash(),beforeSystem,'Game optimization must not alter system backup');
  secondPid=start();assert.equal(priority(secondPid),'High','Saved Windows image priority must work on the next launch');
  const customExe=path.win32.join(folder,'MyOwnGame.exe'),customId='custom-'+require('node:crypto').randomUUID().replaceAll('-','');
  ps(`Copy-Item -LiteralPath ${quote(exe)} -Destination ${quote(customExe)};'OK'`);
  customPid=Number(ps(`(Start-Process -FilePath ${quote(customExe)} -ArgumentList '/d /c ping -n 300 127.0.0.1 > nul' -WindowStyle Hidden -PassThru).Id`));
  const customBefore=priority(customPid);
  const customResult=run('apply',{scope:'game',game:'deadlock',gamePath:customExe,ids:['game-gpu','game-priority'],profile:'basic',version,power:'keep',ratingPlan:{basis:'profiles-v2',ids:[]}});
  assert.equal(customResult.ok,true,JSON.stringify(customResult));assert.equal(priority(customPid),'High','A second, manually selected game must be optimizable without restoring the first');
  assert.equal(systemHash(),beforeSystem);
  const status=run('inspect',{scope:'game'});assert.ok(Array.isArray(status.savedGames),JSON.stringify(status.savedGames));assert.equal(status.savedGames[0].id,'cs2');
  assert.equal(status.savedGames.length,2);assert.equal(status.savedGames[1].id,'deadlock','A preset must accept an explicitly selected EXE with a nonstandard filename');
  const repeat=run('apply',{scope:'game',game:'cs2',gamePath:exe,ids:['game-gpu','game-priority'],profile:'basic',version,power:'keep',ratingPlan:{basis:'profiles-v2',ids:[]}});
  assert.equal(repeat.ok,true,JSON.stringify(repeat));assert.equal(run('inspect',{scope:'game'}).savedGames.length,2,'Repeated optimization must not duplicate or lose saved games');
  const anotherExe=path.win32.join(folder,'AnotherCustomGame.exe');ps(`Copy-Item -LiteralPath ${quote(exe)} -Destination ${quote(anotherExe)};'OK'`);
  const own=run('apply',{scope:'game',game:customId,gamePath:anotherExe,ids:['game-gpu','game-priority'],profile:'basic',version,power:'keep',ratingPlan:{basis:'profiles-v2',ids:[]}});
  assert.equal(own.ok,true,JSON.stringify(own));assert.equal(run('inspect',{scope:'game'}).savedGames.length,3);assert.equal(systemHash(),beforeSystem);

  assert.ok(status.appliedTargets.filter(row=>row.id==='game-priority').every(row=>row.enabled));
  assert.equal(run('restore',{scope:'game'}).ok,true);assert.equal(priority(firstPid),beforePriority);assert.equal(priority(customPid),customBefore);
  assert.deepEqual(JSON.parse(capture()),JSON.parse(original),'Priority registry type, value and absence must remain recoverable');
  assert.equal(systemHash(),beforeSystem,'Emergency game recovery must leave system tweaks unchanged');
 }finally{
  for(const pid of [firstPid,secondPid,customPid])if(pid)ps(`& taskkill.exe /PID ${pid} /T /F 2>$null | Out-Null; 'OK'`);
  if(run('inspect',{scope:'game'}).active)assert.equal(run('restore',{scope:'game'}).ok,true);
  if(run('inspect').active)assert.equal(run('restore').ok,true);
  ps(`Remove-Item -LiteralPath ${quote(folder)} -Recurse -Force; 'OK'`);
 }
});

test('standalone LAGOPHONE power plan applies while system journal needs recovery and leaves it unchanged',{skip:skip||process.env.LAGOPHONE_WINDOWS_INTEGRATION!=='1'},()=>{
 const sid=ps('[Security.Principal.WindowsIdentity]::GetCurrent().User.Value');
 const version=ps("if([int](Get-ItemPropertyValue -LiteralPath 'Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion' -Name CurrentBuildNumber) -ge 22000){'11'}else{'10'}");
 const run=(mode,payload={})=>JSON.parse(ps(`& ${quote(worker)} -Mode '${mode}' -PayloadBase64 '${Buffer.from(JSON.stringify({sid,...payload})).toString('base64')}'`));
 const guid='b9e86298-7324-4f93-9066-faf25aa1c0a3';
 const systemFile="(Join-Path $env:ProgramData 'LAGOPHONE\\optimization-state.json')";
 const systemHash=()=>ps(`(Get-FileHash -LiteralPath ${systemFile} -Algorithm SHA256).Hash`);
 const power=()=>run('inspect',{scope:'power'});
 const apply=plan=>run('apply',{scope:'power',power:plan,ids:['power'],profile:'basic',version,ratingPlan:{basis:'profiles-v2',ids:[]}});
 const before=power();assert.equal(before.active,false,'Disposable runner starts without a separate power journal');
 try{
  assert.equal(run('apply',{ids:['transparency'],profile:'basic',version,power:'keep',ratingPlan:{basis:'profiles-v2',ids:['transparency']}}).ok,true);
  ps(`$file=${systemFile};$state=Get-Content -LiteralPath $file -Raw | ConvertFrom-Json;$state.phase='pending';[IO.File]::WriteAllText($file,($state | ConvertTo-Json -Depth 20));'OK'`);
  assert.equal(run('inspect').needsRecovery,true);
  const hash=systemHash();const result=apply('lagophone');assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(power().power,guid,'Own plan must actually become active');assert.equal(systemHash(),hash,'Do not touch the pending system journal');
  const alternate=Object.entries(power().plans).find(([id,available])=>available&&id!=='lagophone')[0];
  assert.equal(apply(alternate).ok,true);assert.notEqual(power().power,guid);
  assert.equal(apply('lagophone').ok,true,'Return to an already created owned scheme without restoring anything first');
  assert.equal(power().power,guid);assert.equal(systemHash(),hash);
  assert.equal(run('restore',{scope:'power'}).ok,true);assert.equal(power().power,before.power);
  assert.equal(systemHash(),hash,'Power recovery must leave system recovery history untouched');
 }finally{
  if(power().active)assert.equal(run('restore',{scope:'power'}).ok,true);
  if(run('inspect').active)assert.equal(run('restore').ok,true);
 }
});

test('installed application inspection reads Windows registries without requiring elevation',{skip},()=>{const rows=JSON.parse(ps(require('./installed-apps.cjs').query));assert.ok(Array.isArray(rows));for(const row of rows)assert.equal(typeof row.name,'string')});
