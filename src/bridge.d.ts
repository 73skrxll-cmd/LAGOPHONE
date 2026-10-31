import type { DriverCategory } from '../shared/drivers.mjs';
import type { System } from './main';
import type { OptimizationInput, OptimizationStatus, OptimizationResult } from './Optimization';
declare global {
 interface Window {
  lagophone?: {
   driverCatalog:(version:'10'|'11')=>Promise<DriverCategory[]>;
   openDriver:(id:string,version:'10'|'11')=>Promise<void>;
   system:()=>Promise<System>;
   action:(id:string,version:'10'|'11')=>Promise<string>;
   download:(id:string)=>Promise<string>;
   open:(id:string)=>Promise<void>;
   onProgress:(cb:(p:{id:string;percent:number|null;bytes:number})=>void)=>()=>void;
   optimizationStatus:()=>Promise<OptimizationStatus>;
   optimize:(input:OptimizationInput,version:'10'|'11')=>Promise<OptimizationResult>;
   restoreOptimization:()=>Promise<OptimizationResult>;
   chooseGame:(game:string)=>Promise<string|null>;
  }
 }
}
