export type RestartRequest={required:boolean;scheduled:boolean;warning:string};
export type RestartState={pending:boolean;offer?:boolean;scheduled?:boolean;warning?:string;celebration?:{profile:string;count:number;version:'10'|'11'}};
export type ActivityEntry={id:string;at:string;kind:string;status:'success'|'error'|'warning'|'cancelled';title:string;detail:string};
import type { DriverCategory } from '../shared/drivers.mjs';
import type { System } from './main';
import type { OptimizationInput, OptimizationStatus, OptimizationResult } from './Optimization';
declare global {
 interface Window {
  lagophone?: {
   restartAcknowledge:()=>Promise<{ok:boolean}>;
   restartStatus:()=>Promise<RestartState>;
   restartLater:()=>Promise<{ok:boolean}>;
   restartNow:()=>Promise<{ok:boolean;cancelled?:boolean}>;
   installedApps:()=>Promise<{ok:boolean;apps:Record<string,{name:string;version:string;source:string}>;error?:string}>;
   driverCatalog:(version:'10'|'11')=>Promise<DriverCategory[]>;
   openDriver:(id:string,version:'10'|'11')=>Promise<void>;
   system:()=>Promise<System>;
   action:(id:string,version:'10'|'11')=>Promise<string>;
   download:(id:string)=>Promise<string>;
   open:(id:string)=>Promise<void>;
   onProgress:(cb:(p:{id:string;percent:number|null;bytes:number})=>void)=>()=>void;
   activities:()=>Promise<{items:ActivityEntry[];warning:string}>;
   clearActivities:()=>Promise<boolean>;
   gameShaderStatus:()=>Promise<{available:boolean;version:string}>;
   connectShaderTool:()=>Promise<{available:boolean;version:string}|null>;
   prepareGameShaders:(game:string)=>Promise<{ok:boolean;alreadyPrepared:boolean;message:string}>;
   onGameShaderProgress:(cb:(message:string)=>void)=>()=>void;
   gameOptimizationStatus:()=>Promise<OptimizationStatus>;
   restoreGameOptimization:()=>Promise<OptimizationResult>;
   powerOptimizationStatus:()=>Promise<OptimizationStatus & {plans?:Record<string,boolean>}>;
   restorePowerOptimization:()=>Promise<OptimizationResult>;
   optimizationStatus:()=>Promise<OptimizationStatus>;
   optimize:(input:OptimizationInput,version:'10'|'11')=>Promise<OptimizationResult>;
   restoreOptimization:()=>Promise<OptimizationResult>;
   chooseOtherGame:()=>Promise<{id:string;name:string;gamePath:string}|null>;
   chooseGame:(game:string)=>Promise<string|null>;
  }
 }
}
