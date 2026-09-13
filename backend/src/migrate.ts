import {createHash} from 'node:crypto';
import {readdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import pg from 'pg';

const {Client}=pg;
const connectionString=process.env.DATABASE_URL;
if(!connectionString)throw new Error('migrate requires DATABASE_URL');

const migrationsDirectory=resolve(process.cwd(),'migrations');
const files=(await readdir(migrationsDirectory)).filter(file=>/^\d+_.+\.sql$/.test(file)).sort();
const client=new Client({connectionString,application_name:'earthplayground-migrate'});

await client.connect();
try{
 await client.query('select pg_advisory_lock($1)',[17092026]);
 await client.query(`create table if not exists schema_migrations (
  version text primary key,
  checksum text not null,
  applied_at timestamptz not null default now()
 )`);
 for(const file of files){
  const sql=await readFile(resolve(migrationsDirectory,file),'utf8');
  const checksum=createHash('sha256').update(sql).digest('hex');
  const existing=(await client.query('select checksum from schema_migrations where version=$1',[file])).rows[0];
  if(existing){
   if(existing.checksum!==checksum)throw new Error(`applied migration changed: ${file}`);
   console.log(`skip ${file}`);
   continue;
  }
  await client.query('begin');
  try{
   await client.query(sql);
   await client.query('insert into schema_migrations(version,checksum) values($1,$2)',[file,checksum]);
   await client.query('commit');
   console.log(`apply ${file}`);
  }catch(error){
   await client.query('rollback');
   throw error;
  }
 }
}finally{
 await client.query('select pg_advisory_unlock($1)',[17092026]).catch(()=>undefined);
 await client.end();
}
