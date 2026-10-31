export type DriverLink={id:string;title:string;url:string;kind:string;note:string};
export type DriverCategory={id:string;name:string;device:string;description:string;links:DriverLink[];windows:string;boardRevision:string|null};
export function buildDriverCatalog(system:{cpu?:string;gpu?:string[];board?:string;boardVersion?:string;model?:string;manufacturer?:string;vendor?:string;network?:{name:string;vendor?:string;hardwareId?:string}[];audio?:{name:string}[];bluetooth?:{name:string;hardwareId?:string}[];disks?:{name:string}[]},version:'10'|'11'):DriverCategory[];
