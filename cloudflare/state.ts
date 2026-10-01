import {R2AssetStorage} from './storage.ts';
import {createApplication} from '../backend/src/application.ts';
export async function loadApplication(db:any,env:any){
 const row=await db.prepare('SELECT version,payload FROM beta_state WHERE id=1').first();
 const app=await createApplication({snapshot:row?JSON.parse(row.payload):null,storage:env.UPLOADS?new R2AssetStorage(env.UPLOADS):undefined,uploads:!!env.UPLOADS,payments:false,devTokens:false,adminLogin:env.ADMIN_LOGIN,adminPassword:env.ADMIN_PASSWORD});
 return{app,version:row?Number(row.version):null};
}
export async function saveApplication(db:any,app:any,version:number|null){
 const payload=JSON.stringify(app.snapshot());if(new TextEncoder().encode(payload).byteLength>900000)throw Error('BETA_STORAGE_CAPACITY');
 const statement=version===null?db.prepare('INSERT OR IGNORE INTO beta_state(id,version,payload,updated_at) VALUES(1,1,?,?)').bind(payload,new Date().toISOString()):db.prepare('UPDATE beta_state SET payload=?,version=version+1,updated_at=? WHERE id=1 AND version=?').bind(payload,new Date().toISOString(),version);
 const result=await statement.run();return result.meta.changes===1;
}
