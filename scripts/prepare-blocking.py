"""Build GTM's headless wrapper around the pinned, MIT-licensed fnport engine.
Never execute the uploaded BAT menus. Convert only their fixed winws argument lists.
"""
from pathlib import Path, PurePosixPath
import json,zipfile,hashlib,shutil,subprocess,os,re
ROOT=Path(__file__).resolve().parents[1];CACHE=ROOT/'assets/blocking-cache';OUT=ROOT/'assets/blocking';BUILD=ROOT/'work/blocking-build'
spec=json.loads((ROOT/'shared/blocking-components.json').read_text())
def unpack(name,destination,sha):
 data=(CACHE/name).read_bytes();assert hashlib.sha256(data).hexdigest()==sha,name+' SHA-256 mismatch'
 destination.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(CACHE/name) as z:
  assert sum(i.file_size for i in z.infolist())<120_000_000
  for f in z.infolist():
   p=PurePosixPath(f.filename);assert not p.is_absolute() and '..' not in p.parts
   if f.is_dir():continue
   target=destination.joinpath(*p.parts[1:]);target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(z.read(f))
unpack('zapret.zip',OUT/'zapret',spec['zapret']['sha256'])
unpack('fnport-release.zip',BUILD/'release',spec['fnport']['sha256'])
unpack('fnport-source.zip',BUILD/'source',spec['fnport']['sourceSha256'])
SRC=BUILD/'source';MOD=BUILD/'module';MOD.mkdir(parents=True,exist_ok=True)
for f in ['go.mod','go.sum']:shutil.copyfile(SRC/'windows'/f,MOD/f)
shutil.copytree(SRC/'windows/internal',MOD/'internal',dirs_exist_ok=True)
for f in (SRC/'fnport/files').glob('quic_initial_*.bin'):shutil.copyfile(f,MOD/'internal/fakes'/f.name)
CORE=MOD/'gtm';CORE.mkdir(exist_ok=True)
files=['beacons.go','check.go','core.go','engine.go','epic.go','prober.go','report.go','settings.go','tcp.go','warp.go','engine_test.go','finish_test.go','report_test.go']
for f in files:shutil.copyfile(SRC/'windows/fnport'/f,CORE/f)
(CORE/'gtm_countries.go').write_text('package main\nvar coloCity ='+(SRC/'windows/fnport/flags.go').read_text().split('var coloCity =',1)[1])
# Unique app-owned adapter; do not open, rename, or remove an independently installed fnport adapter.
p=CORE/'core.go';p.write_text(p.read_text().replace('wnet.OpenTun("fnport", cfg.routes)','wnet.OpenTun(gtmAdapterName, cfg.routes)'))
# Do not relay third-party instructions about disabling antivirus/exclusions to GTM users.
p=MOD/'internal/wnet/wintun.go';s=p.read_text();start=s.index('const wintunUnpack =');end=s.index('// WintunProblem',start);s=s[:start]+'const wintunUnpack = "Переустановите GTM PC из проверенной сборки. Если Windows блокирует компонент, работа fnport недоступна."\n\n'+s[end:];p.write_text(s)
p=MOD/'internal/wnet/wintun_test.go';p.write_text(p.read_text().replace('не из архива','Переустановите GTM PC').replace('антивирус','Переустановите GTM PC'))
for f in (ROOT/'native/blocking').glob('*.go'):shutil.copyfile(f,CORE/f.name)
for f in (ROOT/'native/blocking/wnet').glob('*.go'):shutil.copyfile(f,MOD/'internal/wnet'/f.name)
FN=OUT/'fnport';FN.mkdir(parents=True,exist_ok=True)
shutil.copytree(BUILD/'release/fakes',FN/'fakes',dirs_exist_ok=True)
shutil.copyfile(BUILD/'release/wintun.dll',FN/'wintun.dll')
assert hashlib.sha256((FN/'wintun.dll').read_bytes()).hexdigest()=='e5da8447dc2c320edc0fc52fa01885c103de8c118481f683643cacc3220dafce'
go=os.environ.get('GTM_GO','go');env={**os.environ,'GOTOOLCHAIN':'local','CGO_ENABLED':'0','GOOS':'windows','GOARCH':'amd64'}
subprocess.run([go,'build','-trimpath','-ldflags','-s -w','-o',str(FN/'gtm-fnport.exe'),'./gtm'],cwd=MOD,env=env,check=True)
# Package all applicable license texts, source references, and the original source archive.
licenses=OUT/'licenses';licenses.mkdir(exist_ok=True)
for source,name in [(SRC/'LICENSE','fnport-MIT.txt'),(SRC/'THIRD_PARTY_NOTICES.md','fnport-NOTICES.md'),(SRC/'windows/third_party/wintun-LICENSE.txt','wintun.txt'),(SRC/'windows/third_party/wgcf-LICENSE.txt','wgcf.txt'),(SRC/'fnport/files/quic_initial_vk_com.bin.LICENSE','zapret-fakes-MIT.txt')]:shutil.copyfile(source,licenses/name)
deps=subprocess.check_output([go,'list','-deps','-f','{{with .Module}}{{if not .Main}}{{.Path}}|{{.Version}}|{{.Dir}}{{end}}{{end}}','./gtm'],cwd=MOD,env=env,text=True)
texts=[]
goroot=Path(subprocess.check_output([go,'env','GOROOT'],cwd=MOD,env=env,text=True).strip());texts.append(('Go runtime',(goroot/'LICENSE').read_text()))
for line in sorted(set(deps.splitlines())):
 if not line:continue
 name,version,directory=line.split('|');folder=Path(directory);matches=[f for f in folder.iterdir() if f.is_file() and re.match(r'^(license|licence|copying|unlicense)',f.name,re.I)]
 assert matches,'Missing dependency license '+name
 texts.extend((name+' '+version,f.read_text(errors='replace')) for f in matches)
(licenses/'go-dependencies.txt').write_text('\n\n'.join('== '+name+'\n'+text for name,text in texts))
# Preserve all upstream lists and strategies, using a data manifest, never a shell/BAT interpreter.
profiles=[]
for bat in sorted((OUT/'zapret').glob('general*.bat')):
 s=bat.read_text(encoding='utf-8-sig');start=s.index('"%BIN%winws.exe"')+len('"%BIN%winws.exe"');raw=s[start:].replace('^\n',' ').replace('^\r\n',' ').strip()
 tokens=re.findall(r'(?:[^\s"\^]|"[^"]*"|\^.)+',raw)
 args=[t.replace('"','').replace('^!','!') for t in tokens]
 assert args and all(a.startswith('--') for a in args),bat.name
 key='general' if bat.stem=='general' else re.sub('[^a-z0-9]+','-',bat.stem.lower()).strip('-')
 profiles.append({'id':key,'name':'Основная' if key=='general' else bat.stem.replace('general (','').rstrip(')'),'args':args})
(OUT/'profiles.json').write_text(json.dumps(profiles,ensure_ascii=False,indent=2))
# The original menu can remove other services: it is not shipped or invoked by GTM.
for f in (OUT/'zapret').glob('*.bat'):f.unlink()
shutil.rmtree(OUT/'zapret/utils',ignore_errors=True)
shutil.copyfile(CACHE/'fnport-source.zip',OUT/'licenses/fnport-source.zip')
for dep in spec['sourceDependencies']:
 source=CACHE/dep['name'];assert hashlib.sha256(source.read_bytes()).hexdigest()==dep['sha256'];shutil.copyfile(source,licenses/dep['name'])
 with zipfile.ZipFile(source) as z:
  names=['winsup/CYGWIN_LICENSE','winsup/COPYING','winsup/COPYING.LIB','COPYING.NEWLIB'] if dep['name'].startswith('cygwin') else ['LICENSE']
  prefix=z.namelist()[0].split('/')[0]
  for name in names:(licenses/(dep['name'].replace('-source.zip','')+'-'+name.replace('/','-')+'.txt')).write_bytes(z.read(prefix+'/'+name))
shutil.copyfile(ROOT/'native/blocking/zapret-LICENSE.txt',licenses/'zapret-MIT.txt')
(licenses/'SOURCES.txt').write_text('Sources and licenses supplied with GTM PC. fnport engine source v0.6.3 is in fnport-source.zip; GTM adaptations are in the GTM PC repository native/blocking and scripts/prepare-blocking.py.\nWinDivert 2.2.2 source and Cygwin 3.4.10 source are provided in the adjacent ZIP files; these libraries are distributed unmodified.\nZapret winws v72.9 MIT source: https://github.com/bol-van/zapret/tree/v72.9 (copyright and license in zapret-MIT.txt).\nFlowseal profiles 1.10.4: https://github.com/Flowseal/zapret-discord-youtube/tree/1.10.4\n')
manifest={str(p.relative_to(OUT)).replace('\\','/'):hashlib.sha256(p.read_bytes()).hexdigest() for p in OUT.rglob('*') if p.is_file() and p.name!='manifest.json'}
(OUT/'manifest.json').write_text(json.dumps({'versions':{'zapret':'1.10.4','fnport':'0.6.3'},'files':manifest},indent=2))
print('Prepared pinned Zapret profiles:',len(profiles),'and headless fnport; integrity and licenses verified')
