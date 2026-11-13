export type BlockingSettings={profile:string;gameFilter:'off'|'tcp'|'udp'|'all';ipset:boolean;fake:string;ttl:number};
export type BlockingProbe={id:string;name:string;url:string;method:string;ok:boolean;status:number;bytes:number;elapsedMs:number;reason:string};
export type BlockingState={providerCooldownMs?:number;supported:boolean;phase:string;message:string;settings:BlockingSettings;profiles:{id:string;name:string}[];versions:{zapret:string;fnport:string};zapret:{running:boolean;profile?:string;exitCode?:number};fnport:{phase:string;message?:string;adapter?:string;stats?:{GameFlows:number;Frozen:number;Remaps:number;Tested:number;Good:number};lines?:string[];result?:{portKept:string;freeze:string;fake:string;ttl:number;fakeFile:string;summary:string[];epic:{Label:string;State:string;Bytes:number}[]}};operation:{kind:string;label:string;index?:number;total?:number}|null;lastReport:{at:string;baseline:BlockingProbe[];results:{profile:string;name:string;rows:BlockingProbe[];error?:string}[];selected:string|null;message:string}|null;lastFnResult:BlockingState['fnport']|null};
export type FpsDay={date:string;average:number|null;durationMs:number;sessions:number};
export type FpsGame={id:string;gameId:string;name:string;startedAt:string;lastAt:string;endedAt:string|null;alive:boolean;partial:boolean;partialEnd:boolean;durationMs:number;recordedMs:number;average:number|null;low1:number|null;maximum:number|null;frames:number;week:FpsDay[]};
export type FpsState={enabled:boolean;supported:boolean;phase:string;message:string;version:string;games:FpsGame[];runningGames:{id:string;name:string;pid:number}[]};
export type SecurityStatus={supported:boolean;checkedAt:string|null;firmware:'uefi'|'legacy'|'unknown';secureBoot:{enabled:boolean|null;source:'firmware'|'windows-boot'|'none';issue:'legacy'|'access'|null};tpm:{present:boolean|null;version:'1.2'|'2.0'|null;enabled:boolean|null;ready:boolean|null;lockedOut:boolean|null;source:'tbs'|'cim'|'get-tpm'|'none'}};
export type RestartRequest={required:boolean;scheduled:boolean;warning:string};
export type AppDialogRequest={id:string;type:'info'|'question'|'warning'|'error';title:string;message:string;detail:string;items:{title:string;detail:string}[];buttons:string[];cancelId:number;defaultId:number};
export type RestartState={pending:boolean;offer?:boolean;scheduled?:boolean;warning?:string;celebration?:{profile:string;count:number;version:'10'|'11'}};
import type {ActivityTarget} from '../shared/activity-target.mjs';
export type ActivityEntry={target?:ActivityTarget;id:string;at:string;kind:string;status:'success'|'error'|'warning'|'cancelled';title:string;detail:string};
import type { DriverCategory } from '../shared/drivers.mjs';
import type { System } from './main';
import type { OptimizationInput, OptimizationStatus, OptimizationResult } from './Optimization';
declare global {
 interface Window {
  lagophone?: {
   windowChrome?:boolean;
   blockingStatus?:()=>Promise<BlockingState>;
   blockingAction?:(action:string)=>Promise<BlockingState>;
   blockingSettings?:(settings:BlockingSettings)=>Promise<BlockingState>;
   blockingReport?:()=>Promise<boolean>;
   fpsStatus?:()=>Promise<FpsState>;
   setFpsEnabled?:(enabled:boolean)=>Promise<FpsState>;
   addFpsGame?:()=>Promise<FpsState>;
   setWindowTheme?:(theme:string)=>Promise<void>;
   onAppDialog?:(cb:(request:AppDialogRequest|{closed:string})=>void)=>()=>void;
   respondAppDialog?:(id:string,response:number)=>Promise<boolean>;
   restartAcknowledge:()=>Promise<{ok:boolean}>;
   restartStatus:()=>Promise<RestartState>;
   restartLater:()=>Promise<{ok:boolean}>;
   restartNow:()=>Promise<{ok:boolean;cancelled?:boolean}>;
   installedApps:()=>Promise<{ok:boolean;apps:Record<string,{name:string;version:string;source:string}>;error?:string}>;
   driverCatalog:(version:'10'|'11')=>Promise<DriverCategory[]>;
   openDriver:(id:string,version:'10'|'11')=>Promise<void>;
   system:()=>Promise<System>;
   securityStatus?:()=>Promise<SecurityStatus>;
   openRecoverySettings?:()=>Promise<void>;
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
