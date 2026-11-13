export type PerformanceSystem={cpu?:string;gpu?:string[];ram?:number;disks?:{type?:string}[]};
export type PerformanceRow={id:string;name:string;version:string;settings:string;reference:number|null;source:string|null;low:number|null;high:number|null;limitation:string;reason:string|null};
export const performanceProfiles:{id:string;label:string}[];
export const performanceSources:Record<string,string>;
export function matchPerformanceGpu(name:string):string|null;
export function cpuEnvelope(name:string):{kind:string;low:number;high:number}|null;
export function estimatePerformance(system:PerformanceSystem,profile?:string,gpuName?:string):{gpu:string;matchedGpu:string|null;cpuKnown:boolean;profile:string;rows:PerformanceRow[]};
export function componentImpact(system:PerformanceSystem,component:string):{title:string;text:string};
