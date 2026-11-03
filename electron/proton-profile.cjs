const net=require('node:net');
function publicIPv4(value){if(net.isIP(value)!==4)return false;const b=value.split('.').map(Number);return !(b[0]===0||b[0]===10||b[0]===127||b[0]>=224||(b[0]===169&&b[1]===254)||(b[0]===172&&b[1]>=16&&b[1]<=31)||(b[0]===192&&b[1]===168)||(b[0]===100&&b[1]>=64&&b[1]<=127)||(b[0]===198&&[18,19].includes(b[1])))}
function validateProfile(input){
 if(typeof input!=='string'||Buffer.byteLength(input)>32768)throw Error('Профиль WireGuard слишком большой или повреждён.');
 const sections={Interface:{},Peer:{}};let section=null,interfaces=0,peers=0;
 for(const raw of input.replace(/^\uFEFF/,'').split(/\r?\n/)){
  const line=raw.trim();if(!line||line.startsWith('#')||line.startsWith(';'))continue;
  if(line==='[Interface]'){section='Interface';interfaces++;continue}if(line==='[Peer]'){section='Peer';peers++;continue}
  const match=/^([A-Za-z]+)\s*=\s*([^\r\n#;]+)$/.exec(line);if(!section||!match)throw Error('Неподдерживаемый формат профиля WireGuard.');
  const allowed=section==='Interface'?['PrivateKey','Address','DNS','MTU']:['PublicKey','PresharedKey','AllowedIPs','Endpoint','PersistentKeepalive'];
  if(!allowed.includes(match[1])||Object.hasOwn(sections[section],match[1]))throw Error('В профиле есть неподдерживаемые или повторяющиеся команды. Скрипты не допускаются.');
  sections[section][match[1]]=match[2].trim();
 }
 if(interfaces!==1||peers!==1)throw Error('Нужен профиль с одним интерфейсом и одним сервером.');
 const a=sections.Interface,b=sections.Peer,key=s=>typeof s==='string'&&/^[A-Za-z0-9+/]{43}=$/.test(s)&&Buffer.from(s,'base64').length===32;
 if(!key(a.PrivateKey)||!key(b.PublicKey)||(b.PresharedKey&&!key(b.PresharedKey)))throw Error('Ключи профиля повреждены. Скачай новый профиль в своём кабинете Proton.');
 const addresses=String(a.Address||'').split(',').map(s=>s.trim());
 if(!addresses.length||!addresses.every(s=>{const [ip,prefix,...rest]=s.split('/');return !rest.length&&net.isIP(ip)&&/^\d+$/.test(prefix)&&Number(prefix)<=(net.isIP(ip)===4?32:128)}))throw Error('Некорректный адрес интерфейса.');
 const dns=String(a.DNS||'').split(',').map(s=>s.trim());if(!dns.length||!dns.every(s=>net.isIP(s)))throw Error('Нужны DNS-серверы из профиля Proton.');
 const allowed=String(b.AllowedIPs||'').split(',').map(s=>s.trim());if(!allowed.includes('0.0.0.0/0')||!allowed.every(s=>['0.0.0.0/0','::/0'].includes(s)))throw Error('Нужен полный туннель с AllowedIPs = 0.0.0.0/0. Раздельные маршруты не принимаются.');
 const endpoint=/^(\d+\.\d+\.\d+\.\d+):(\d+)$/.exec(b.Endpoint||'');if(!endpoint||!publicIPv4(endpoint[1])||+endpoint[2]<1||+endpoint[2]>65535)throw Error('Нужен официальный профиль Proton с публичным IPv4-адресом сервера.');
 if(a.MTU&&(!/^\d+$/.test(a.MTU)||+a.MTU<1280||+a.MTU>1500))throw Error('MTU профиля не поддерживается.');
 if(b.PersistentKeepalive&&(!/^\d+$/.test(b.PersistentKeepalive)||+b.PersistentKeepalive>65535))throw Error('Некорректный Keepalive.');
 b.PersistentKeepalive=b.PersistentKeepalive||'25';
 const config=['[Interface]',...Object.entries(a).map(([k,v])=>`${k} = ${v}`),'','[Peer]',...Object.entries(b).map(([k,v])=>`${k} = ${v}`),''].join('\n');
 return {config,metadata:{provider:'proton-user-profile',fullTunnel:true,dns,ipv6:addresses.some(s=>s.includes(':'))&&allowed.includes('::/0')}};
}
module.exports={validateProfile,publicIPv4};
