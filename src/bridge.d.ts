export type RestartRequest={required:boolean;scheduled:boolean;warning:string};
export type RestartState={pending:boolean;offer?:boolean;scheduled?:boolean;warning?:string;celebration?:{profile:string;count:number;version:'10'|'11'}};
import type {ActivityTarget} from '../shared/activity-target.mjs';
export type ActivityEntry={target?:ActivityTarget;id:string;at:string;kind:string;status:'success'|'error'|'warning'|'cancelled';title:string;detail:string};
import type { DriverCategory } from '../shared/drivers.mjs';
import type { System } from './main';
import type { OptimizationInput, OptimizationStatus, OptimizationResult } from './Optimization';
import type {PingState,PingReport,PingProgress} from '../shared/ping.mjs';
declare global {
 interface Window {
  lagophone?: {
   pingStatus:(consent?:boolean)=>Promise<PingState>;
   pingMeasure:(targetId:string)=>Promise<PingReport>;
   pingCompare:(targetId:string,consent:boolean)=>Promise<PingReport>;
   pingConnect:(consent:boolean,options?:{intent:'manual';targetId:string})=>Promise<void>;
   pingDisconnect:()=>Promise<void>;
   pingCancel:()=>Promise<void>;
   pingSetup:(page?:'setup'|'terms'|'privacy')=>Promise<void>;
   pingExport:()=>Promise<boolean>;
   onPingProgress:(callback:(progress:PingProgress)=>void)=>()=>void;
   windowChrome?:boolean;
   setWindowTheme?:(theme:string)=>Promise<void>;
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
