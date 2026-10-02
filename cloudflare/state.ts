import {neon} from '@neondatabase/serverless';
import {R2AssetStorage} from './storage.ts';
import {createApplication} from '../backend/src/application.ts';
import {MemoryDatabase} from '../backend/src/infrastructure/database.ts';
export type SqlDatabase={query:(text:string,params?:any[])=>Promise<any[]>};
export function database(env:any):SqlDatabase{
 if(env.TEST_DATABASE)return env.TEST_DATABASE;
 if(!env.DATABASE_URL)throw Error('DATABASE_NOT_CONFIGURED');
 const sql=neon(env.DATABASE_URL);
 return{query:async(text,params=[])=>await sql.query(text,params) as any[]};
}
export async function loadApplication(db:SqlDatabase,env:any){
 const [row]=await db.query('SELECT version,payload FROM beta_state WHERE id=1');
 const app=await createApplication({database:new MemoryDatabase(),snapshot:row?row.payload:null,storage:env.UPLOADS?new R2AssetStorage(env.UPLOADS):undefined,uploads:!!env.UPLOADS,payments:false,devTokens:false,adminLogin:env.ADMIN_LOGIN,adminPassword:env.ADMIN_PASSWORD});
 const adminAccounts=row?.payload?.adminAccounts||[];const snapshot=app.snapshot;Object.assign(app,{adminAccounts,snapshot:()=>({...snapshot(),adminAccounts})});
 return{app,version:row?Number(row.version):null};
}
export async function saveApplication(db:SqlDatabase,app:any,version:number|null){
 const payload=JSON.stringify(app.snapshot());
 const rows=version===null?await db.query('INSERT INTO beta_state(id,version,payload,updated_at) VALUES(1,1,$1::jsonb,now()) ON CONFLICT(id) DO NOTHING RETURNING version',[payload]):await db.query('UPDATE beta_state SET payload=$1::jsonb,version=version+1,updated_at=now() WHERE id=1 AND version=$2 RETURNING version',[payload,version]);
 return rows.length===1;
}
