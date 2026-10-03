import type {PlatformService} from './domain.ts';
import type {AdminService} from './admin-service.ts';
import type {BackofficeService} from './backoffice-service.ts';
const maps=['referrals','aliases','members','requests','campaigns','coupons','partners','ledger','settlements','negatives'] as const;
export function exportSnapshot(service:PlatformService,backoffice:BackofficeService,admin?:AdminService){return{schemaVersion:1,domain:{...Object.fromEntries(maps.map(key=>[key,[...service.db[key].entries()]])),audit:service.db.audit},backoffice:backoffice.exportState(),admin:admin?.exportState()}}
export function restoreSnapshot(service:PlatformService,backoffice:BackofficeService,snapshot:any,admin?:AdminService){if(snapshot.schemaVersion!==1)throw new Error('Unsupported beta snapshot schema');for(const key of maps){if(!Array.isArray(snapshot.domain[key]))throw new Error('Invalid beta snapshot');(service.db as any)[key]=new Map(snapshot.domain[key])}service.db.audit=snapshot.domain.audit;backoffice.restoreState(snapshot.backoffice);if(snapshot.admin)admin?.restoreState(snapshot.admin)}
