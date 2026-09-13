import pg from 'pg';
const {Pool}=pg;

export interface Database{mode:'memory'|'postgres';health():Promise<boolean>;withTransaction<T>(work:(query:(text:string,params?:unknown[])=>Promise<{rows:any[]}>)=>Promise<T>):Promise<T>;close():Promise<void>}

export class MemoryDatabase implements Database{
 mode='memory' as const;async health(){return true}async withTransaction<T>(work:(query:(text:string,params?:unknown[])=>Promise<{rows:any[]}>)=>Promise<T>){return work(async()=>({rows:[]}))}async close(){}
}

export class PostgresDatabase implements Database{
 mode='postgres' as const;private pool:InstanceType<typeof Pool>;
 constructor(connectionString:string){this.pool=new Pool({connectionString,max:10,idleTimeoutMillis:30000,connectionTimeoutMillis:5000,application_name:'earthplayground-api'})}
 async health(){const r=await this.pool.query('select 1 as ok');return r.rows[0]?.ok===1}
 async withTransaction<T>(work:(query:(text:string,params?:unknown[])=>Promise<{rows:any[]}>)=>Promise<T>){const client=await this.pool.connect();try{await client.query('begin');const result=await work((text,params)=>client.query(text,params));await client.query('commit');return result}catch(error){await client.query('rollback');throw error}finally{client.release()}}
 async close(){await this.pool.end()}
}

export const createDatabase=():Database=>process.env.DATABASE_URL?new PostgresDatabase(process.env.DATABASE_URL):new MemoryDatabase();
