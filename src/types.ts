export type Nav = 'overview' | 'sites' | 'ads' | 'leads' | 'connections';
export interface Day {date:string;clicks:number;impressions:number;ctr:number;position:number}
export interface Gsc {clicks:number;impressions:number;ctr:number;position:number|null;previous:Omit<Gsc,'previous'|'daily'|'checkedAt'>;daily:Day[];checkedAt:string}
export interface Ga4 {property:string;sessions:number;activeUsers:number;engagedSessions:number;daily:{date:string;sessions:number;activeUsers:number;engagedSessions:number}[]}
export interface Site {name:string;domain:string;url:string;group:string;gsc:Gsc|null;gscProperty:string|null;gscError?:string;ga4:Ga4|null;ads:{accountId:string;currency:string;costMicros:number;clicks:number;conversions:number}|null;topPages?:{url:string;clicks:number;impressions:number;position:number}[]}
export interface AdDay {date:string;campaignId:string;campaign:string;channel:string;status:string;clicks:number;impressions:number;costMicros:number;conversions:number;domain:string|null}
export interface Account {id:string;name:string;currency:string;timeZone:string;daily:AdDay[];actions:{date:string;name:string;conversions:number;allConversions:number}[];unmappedCampaigns:string[];costMicros:number;clicks:number;impressions:number;conversions:number}
export interface Lead {id:string;date:string;domain:string;channel:string;status:string;country:string;company:string;contact:string;notes:string}
export interface LeadStore {connected:boolean;updatedAt?:string;rows:Lead[]}
export interface Dashboard {checkedAt:string;period:{start:string;end:string;previousStart:string;days:number;timeZone:string};sheet:{title:string;id:string};sites:Site[];accounts:Account[];errors:{source:string;message:string;accountId?:string}[];ga4AccessibleCount:number;leads:LeadStore}
export interface Period {start:string;end:string}
