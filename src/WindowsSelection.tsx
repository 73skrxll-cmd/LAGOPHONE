export function WindowsLogo({eleven=false}:{eleven?:boolean}){return <span className={'windows-logo '+(!eleven?'tilted':'')} aria-hidden="true"><i/><i/><i/><i/></span>}
export function WindowsSelection({version,reduced}:{version:'10'|'11';reduced:boolean}){
 return <div className="os-selection-overlay" data-version={version} data-reduced={reduced} role="status" aria-label={`Выбрана Windows ${version}`}><div className="os-choice-halo"/><div className="os-choice-mark"><WindowsLogo eleven={version==='11'}/></div><span>ВЫБРАНА СИСТЕМА</span><b>Windows {version}</b><div className="os-choice-shine"/></div>;
}
