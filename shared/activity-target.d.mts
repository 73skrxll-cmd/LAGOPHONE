export type ActivityTarget={page:'gaming'|'tweaks'|'apps'|'drivers'|'system'|'monitor';section?:'power'|'tools';game?:string};
export function cleanTarget(value:unknown):ActivityTarget|null;
export function activityTarget(entry:unknown):ActivityTarget;
