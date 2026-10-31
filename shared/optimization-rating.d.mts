export type AuditCheck={id:string;available:boolean;enabled:boolean|null;reason?:string|null};
export type OptimizationAudit={basis:string;checks:AuditCheck[];checkedAt:string};
export type RatingLevel='poor'|'weak'|'medium'|'good'|'ideal';
export const baselineIds:string[];
export const ratingLevels:{id:string;short:string;title:string;range:string}[];
export function optimizationRating(options?:{status?:{ok:boolean;active:boolean;running?:boolean;needsRecovery?:boolean;audit?:OptimizationAudit}|null;native?:boolean;error?:string}):{mode:string;level:RatingLevel|null;percent:number|null;available:number;matched:number;excluded:number;rows:AuditCheck[];checkedAt:string|null};
