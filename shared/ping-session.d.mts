import type {PingTrial} from './ping.mjs';
export type SessionGame={id:string;name:string;installed:boolean;path:string|null;launcher:string|null;source:string|null};
export type SessionSettings={gameId:string;pauseBits:boolean;bitsPromptDismissed:boolean;controlAddress:string;downMbps:number|null;upMbps:number|null;manual:Record<string,string>};
export type SessionReport={gateway:PingTrial|null;control:PingTrial|null;network:{interfaceIndex:number;name:string;description:string;gateway:string|null;wifi:boolean;signalPct:number|null;linkMbps:number|null};traffic:{rxMbps:number|null;txMbps:number|null};at:string};
export type SessionState={supported:boolean;phase:string;active:boolean;gameId:string|null;settings:SessionSettings;games:SessionGame[];before:SessionReport|null;after:SessionReport|null;latest:SessionReport|null;findings:{kind:string;text:string}[];comparison:{verdict:string;deltaMs:number|null;reason:string}|null;message:string;error:string;bitsAvailable:number;bitsSupported:boolean;pausedCount:number;appliedCount:number;recoveryRequired:boolean;launchKind?:string};
export const SESSION_GAMES:ReadonlyArray<{id:string;name:string}>;
export function summarizeEndpoint(trial:PingTrial|null|undefined):({medianMs:number|null;jitterMs:number|null;received:number;sent:number;unansweredPct:number|null;address:string;method:string})|null;
export function compareEndpoints(before:PingTrial|null|undefined,after:PingTrial|null|undefined):{verdict:string;deltaMs:number|null;reason:string};
export function findings(report:SessionReport|null,settings?:Partial<SessionSettings>):{kind:string;text:string}[];
