import {BrandMark} from './Brand';
import dota from '../assets/games/dota2.svg?raw';
import cs2 from '../assets/games/cs2.svg?raw';
import pubg from '../assets/games/pubg.svg?raw';
import valorant from '../assets/games/valorant.svg?raw';
const icons:Record<string,string>={dota2:dota,cs2,pubg,valorant};
const names:Record<string,string>={fortnite:'FORTNITE',deadlock:'DEADLOCK',apex:'APEX\nLEGENDS',gta5:'GRAND THEFT\nAUTO V','rocket-league':'ROCKET\nLEAGUE'};
export function GameLogo({id,name}:{id:string;name:string}){
 return icons[id]?<span className={'game-logo game-logo-'+id} role="img" aria-label={'Логотип '+name} dangerouslySetInnerHTML={{__html:icons[id]}}/>:<span className={'game-logo game-text-logo game-logo-'+id} role="img" aria-label={name}>{names[id]||name}</span>;
}
export function GameEmblem({id,name,phase,motion}:{id:string;name:string;phase:'idle'|'working'|'ready'|'error';motion:boolean}){
 const hole=phase==='working'||phase==='ready';
 return <div className={'game-emblem phase-'+phase+(hole?' has-black-hole':'')} data-motion={motion} aria-hidden="true">
  <div className="emblem-nebula"/>
  <div className="emblem-logo">{id?<GameLogo id={id} name={name}/>:<BrandMark/>}</div>
  <div className="black-hole" role="presentation"><div className="hole-back-orbit"/><div className="hole-photon-halo"/><div className="hole-singularity"/><div className="hole-event-horizon"/><div className="hole-disk disk-back"/><div className="hole-disk disk-front"/><div className="hole-lensing"/>{Array.from({length:9},(_,i)=><i className="hole-particle" key={i} style={{'--orbit':`${i*40}deg`,'--delay':`${i*-.37}s`,'--radius':`${104+i%3*13}px`} as React.CSSProperties}/>)}<span className="hole-core-mark">{id&&<GameLogo id={id} name={name}/>}</span></div>
 </div>;
}
