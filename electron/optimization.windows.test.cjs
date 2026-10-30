const { windowsPowerShellEnvironment, windowsPowerShellExecutable } = require('./windows-powershell.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const path=require('node:path');
const worker=path.join(__dirname,'optimizer.ps1');
function ps(code){return execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand',Buffer.from("$ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8; "+code,'utf16le').toString('base64')],{env:windowsPowerShellEnvironment(),encoding:'utf8',timeout:120000,windowsHide:true}).trim()}
const quote=x=>"'"+String(x).replaceAll("'","''")+"'";
const skip=process.platform!=='win32';
test('Windows PowerShell loads its own security module when launched from a PowerShell 7 environment', {skip},()=>{
 const inherited={...process.env,PSModulePath:path.win32.join(process.env.ProgramFiles||'C:\\Program Files','PowerShell','7','Modules'),PSModuleAnalysisCachePath:path.join(require('node:os').tmpdir(),'pwsh7-analysis-cache-fixture')};
 // Windows PowerShell can expose built-in commands as snap-ins, so ModuleBase is
 // not a reliable identity check. Verify the command assembly and exercise its ACL API.
 const code=`
 $ErrorActionPreference='Stop'; [Console]::OutputEncoding=[Text.Encoding]::UTF8;
 Import-Module Microsoft.PowerShell.Security -ErrorAction Stop;
 $command=Get-Command Set-Acl -CommandType Cmdlet -ErrorAction Stop;
 $assembly=$command.ImplementingType.Assembly.GetName();
 $directory=[IO.Path]::Combine([IO.Path]::GetTempPath(),'lagophone-acl-'+[guid]::NewGuid().ToString());
 [IO.Directory]::CreateDirectory($directory) | Out-Null;
 try {
   $sections=[Security.AccessControl.AccessControlSections]::Access -bor [Security.AccessControl.AccessControlSections]::Owner -bor [Security.AccessControl.AccessControlSections]::Group;
   $acl=Get-Acl -LiteralPath $directory;
   $before=$acl.GetSecurityDescriptorSddlForm($sections);
   Set-Acl -LiteralPath $directory -AclObject $acl -ErrorAction Stop;
   $after=(Get-Acl -LiteralPath $directory).GetSecurityDescriptorSddlForm($sections);
   @{version=$PSVersionTable.PSVersion.Major;source=$command.Source;assembly=$assembly.Name;assemblyMajor=$assembly.Version.Major;implementation=$command.ImplementingType.FullName;aclRoundtrip=($before -eq $after)} | ConvertTo-Json -Compress;
 } finally { Remove-Item -LiteralPath $directory -Recurse -Force }
 `;
 const result=JSON.parse(execFileSync(windowsPowerShellExecutable(),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(code,'utf16le').toString('base64')],{env:windowsPowerShellEnvironment(inherited),encoding:'utf8',timeout:30000,windowsHide:true}).trim());
 assert.equal(result.version,5,JSON.stringify(result));
 assert.equal(result.source,'Microsoft.PowerShell.Security',JSON.stringify(result));
 assert.equal(result.assembly,'Microsoft.PowerShell.Security',JSON.stringify(result));
 assert.equal(result.assemblyMajor,3,JSON.stringify(result));
 assert.equal(result.implementation,'Microsoft.PowerShell.Commands.SetAclCommand',JSON.stringify(result));
 assert.equal(result.aclRoundtrip,true,JSON.stringify(result));
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
 assert.equal(initial.active,false,'Disposable runner must not have an active profile');
 const locations=[
   {p:['Registry::HKEY_USERS',sid,'Software','Microsoft','GameBar'].join('\\'),n:'AutoGameModeEnabled'},
   {p:['Registry::HKEY_USERS',sid,'Software','Microsoft','Windows','CurrentVersion','Themes','Personalize'].join('\\'),n:'EnableTransparency'},
   {p:['Registry::HKEY_USERS',sid,'Control Panel','Desktop','WindowMetrics'].join('\\'),n:'MinAnimate'},
 ];
 const encodedLocations=Buffer.from(JSON.stringify(locations)).toString('base64');
 const capture=()=>ps(`$paths=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encodedLocations}')) | ConvertFrom-Json;$out=@();foreach($item in $paths){$key=Get-Item -LiteralPath $item.p -ErrorAction SilentlyContinue;$exists=$key -and $key.GetValueNames() -contains $item.n;$out+=@{name=$item.n;exists=[bool]$exists;value=$(if($exists){$key.GetValue($item.n)}else{$null});kind=$(if($exists){[string]$key.GetValueKind($item.n)}else{$null})}};$out | ConvertTo-Json -Compress`);
 const before=capture();
 try {
   const result=run('apply',{ids:['game-mode','transparency','animations'],version,profile:'balanced',power:'keep'});
   assert.equal(result.ok,true,JSON.stringify(result));
   const changed=JSON.parse(capture());
   assert.deepEqual(changed.map(v=>({name:v.name,exists:v.exists,value:v.value,kind:v.kind})),[{name:'AutoGameModeEnabled',exists:true,value:1,kind:'DWord'},{name:'EnableTransparency',exists:true,value:0,kind:'DWord'},{name:'MinAnimate',exists:true,value:'0',kind:'String'}]);
   const status=run('inspect');
   assert.equal(status.ok,true,JSON.stringify(status));
   assert.ok(status.checks.filter(c=>['game-mode','transparency'].includes(c.id)).every(c=>c.enabled));
   if(status.active){
     const duplicate=run('apply',{ids:['game-mode'],version,profile:'basic',power:'keep'});
     assert.equal(duplicate.ok,false,'Do not overwrite an active journal');
   }
 } finally {
   const status=run('inspect');
   if(status.active){const result=run('restore');assert.equal(result.ok,true,JSON.stringify(result));}
 }
 assert.deepEqual(JSON.parse(capture()),JSON.parse(before),'Registry values, absence and types must be restored exactly');
 assert.equal(run('inspect').active,false);
});
