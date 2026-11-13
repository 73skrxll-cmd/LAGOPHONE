export type TweakGuideState={shown:number;last:number;visited:boolean};
export const tweakGuideTiming:{first:number;cooldown:number;duration:number;maximum:number};
export function readTweakGuide(value:string|null):TweakGuideState;
export function nextTweakGuideDelay(state:TweakGuideState,now:number):number|null;
