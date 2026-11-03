import type {CSSProperties} from 'react';
export function WindowsLogo({eleven=false}:{eleven?:boolean}){return <span className={'windows-logo '+(!eleven?'tilted':'')} aria-hidden="true"><i/><i/><i/><i/></span>}
export type WindowsChoice={version:'10'|'11';stage:'travel'|'title'|'hold'|'reveal'|'dismiss';origin:{x:number;y:number;width:number;height:number;color:string}};
// The app effects control owns this requested sequence; OS motion preferences do not shorten it.
export const windowsChoiceTiming=()=>({travel:1000,title:450,hold:850,reveal:900,dismiss:700});
export function WindowsSelection({choice,onArrived,onTitleShown,onDismissed}:{choice:WindowsChoice;onArrived:()=>void;onTitleShown:()=>void;onDismissed:()=>void}){
 const time=windowsChoiceTiming(),style={'--source-x':`${choice.origin.x}px`,'--source-y':`${choice.origin.y}px`,'--source-scale-x':choice.origin.width/120,'--source-scale-y':choice.origin.height/112.5,'--source-ink':choice.origin.color,'--travel-duration':`${time.travel}ms`,'--title-duration':`${time.title}ms`,'--dismiss-duration':`${time.dismiss}ms`} as CSSProperties;
 return <div className="os-selection-overlay" data-version={choice.version} data-stage={choice.stage} style={style} role="status" aria-label={`Выбрана Windows ${choice.version}`} onAnimationEnd={e=>{if(e.target===e.currentTarget&&choice.stage==='dismiss')onDismissed()}}><div className="os-choice-mark" onAnimationEnd={e=>{if(e.target===e.currentTarget&&choice.stage==='travel')onArrived()}}><WindowsLogo eleven={choice.version==='11'}/></div><div className="os-choice-caption" onAnimationEnd={e=>{if(e.target===e.currentTarget&&choice.stage==='title')onTitleShown()}}><b>Windows {choice.version}</b></div></div>;
}
