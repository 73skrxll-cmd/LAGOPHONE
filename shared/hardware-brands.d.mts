export type HardwareBrand={key:string;id:string;name:string;category:string;models:string[];series:string};
export function hardwareBrands(system?:{cpu?:string;vendor?:string;board?:string;gpu?:string[];memory?:{manufacturer?:string}[];disks?:{name:string;manufacturer?:string}[]}):HardwareBrand[];
