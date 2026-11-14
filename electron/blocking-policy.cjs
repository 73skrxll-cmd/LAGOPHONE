const profiles=require('../shared/blocking-profiles.json');
const FAKE=['','quic_initial_vk_com.bin','quic_initial_gosuslugi_ru.bin','quic_initial_ozon_ru.bin'];
const defaults={profile:'general',gameFilter:'off',ipset:false,ttl:5,fake:FAKE[1]};
function settings(value){if(!value||typeof value!=='object')throw Error('Недопустимые настройки.');const out={...defaults,...value};if(!profiles.some(p=>p.id===out.profile)||!['off','tcp','udp','all'].includes(out.gameFilter)||typeof out.ipset!=='boolean'||!Number.isInteger(out.ttl)||out.ttl<1||out.ttl>9||!FAKE.includes(out.fake))throw Error('Недопустимые настройки обхода.');return Object.fromEntries(Object.keys(defaults).map(k=>[k,out[k]]))}
const targets=[{id:'discord-gateway',name:'Discord · API',url:'https://discord.com/api/v10/gateway',minimum:10},{id:'discord-cdn',name:'Discord · CDN',url:'https://cdn.discordapp.com/embed/avatars/0.png',minimum:100},{id:'youtube-web',name:'YouTube · страница',url:'https://www.youtube.com/',minimum:32768},{id:'youtube-image',name:'YouTube · изображения',url:'https://i.ytimg.com/vi/jNQXAC9IVRw/hqdefault.jpg',minimum:100}];
function score(rows){return rows.filter(r=>r.ok===true).length}
function choose(baseline,results){const best=[...results].sort((a,b)=>score(b.rows)-score(a.rows))[0];return best&&score(best.rows)>score(baseline)?best:null}
// A repeat must preserve each successful endpoint/protocol/round, not just its count.
function covers(rows,reference){const key=(row,index)=>row.id?JSON.stringify([row.id,row.method,row.round]):String(index);const passed=new Set(rows.flatMap((row,i)=>row.ok?[key(row,i)]:[]));return reference.every((row,i)=>!row.ok||passed.has(key(row,i)))}
// Equal results remain usable candidates; they are never labelled an improvement.
function rank(baseline,results){return results.filter(r=>!r.error&&score(r.rows)>0&&covers(r.rows,baseline)).sort((a,b)=>score(b.rows)-score(a.rows))}
module.exports={covers,rank,settings,defaults,profiles,targets,score,choose,FAKE};
