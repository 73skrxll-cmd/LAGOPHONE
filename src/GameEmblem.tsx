import type {RefObject} from 'react';
import {Gamepad2} from 'lucide-react';
import {BrandMark} from './Brand';
import dota from '../assets/games/dota2.svg?raw';
import cs2 from '../assets/games/cs2.svg?raw';
import pubg from '../assets/games/pubg.svg?raw';
import valorant from '../assets/games/valorant.svg?raw';
const icons:Record<string,string>={dota2:dota,cs2,pubg,valorant};
const names:Record<string,string>={rust:'RUST',overwatch2:'OVERWATCH\n2',cyberpunk2077:'CYBERPUNK\n2077',rdr2:'RED DEAD\nREDEMPTION 2',genshin:'GENSHIN\nIMPACT',tarkov:'ESCAPE FROM\nTARKOV','war-thunder':'WAR THUNDER',lol:'LEAGUE OF\nLEGENDS',fortnite:'FORTNITE',deadlock:'DEADLOCK',apex:'APEX\nLEGENDS',gta5:'GRAND THEFT\nAUTO V','rocket-league':'ROCKET\nLEAGUE'};
export function GameLogo({id,name}:{id:string;name:string}){
 if(id.startsWith('custom-'))return <span className="game-logo game-custom-logo" role="img" aria-label={name}><Gamepad2 size={86}/></span>;
 return icons[id]?<span className={'game-logo game-logo-'+id} role="img" aria-label={'Логотип '+name} dangerouslySetInnerHTML={{__html:icons[id]}}/>:<span className={'game-logo game-text-logo game-logo-'+id} role="img" aria-label={name}>{names[id]||name}</span>;
}
export function GameEmblem({id,name,target}:{id:string;name:string;target:RefObject<HTMLDivElement>}){
 return <div className="game-emblem" aria-hidden="true"><div ref={target} className="emblem-logo">{id?<GameLogo id={id} name={name}/>:<BrandMark/>}</div></div>;
}
