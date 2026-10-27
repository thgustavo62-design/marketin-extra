// Explicit release command only; never runs automatically during ordinary builds.
import pg from 'pg'; import {readFileSync} from 'node:fs';
const u=new URL(process.env.DATABASE_URL||'');
if(!u.hostname.includes('ylumiasccwgdoesxuind')&&!u.username.includes('ylumiasccwgdoesxuind'))throw Error('Unexpected database project');
const db=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000,statement_timeout:30000});
try{
await db.connect();
const target=(await db.query("select current_schema() as schema,to_regclass('public.promo_campaigns') as campaigns,to_regclass('public.users') as users,to_regclass('public.schema_migrations') as migrations")).rows[0];
if(target.schema!=='public'||!target.campaigns||!target.users||!target.migrations)throw Error('Database schema does not match marketing application');
const prior=await db.query("select name from schema_migrations where name='033_historico_e_versoes.sql'");
if(prior.rowCount!==1)throw Error('Expected migration 033 is missing');
await db.query('begin');
await db.query("select pg_advisory_xact_lock(hashtext('nova7-studio-release-034'))");
const done=await db.query("select name from schema_migrations where name='034_nova7_studio.sql'");
if(!done.rowCount){
if((await db.query("select to_regclass('public.studio_pages') as existing")).rows[0].existing)throw Error('Untracked studio_pages table; manual review required');
await db.query(readFileSync('db/migrations/034_nova7_studio.sql','utf8'));
await db.query("insert into schema_migrations(name) values('034_nova7_studio.sql')");
}
const cols=await db.query("select column_name from information_schema.columns where table_schema='public' and table_name='studio_pages'");
const names=new Set(cols.rows.map(r=>r.column_name));if(!['campaign_id','format','page','scene','revision','source_hash','updated_by','updated_at'].every(c=>names.has(c)))throw Error('Studio table validation failed');
const security=(await db.query("select relrowsecurity from pg_class where oid='public.studio_pages'::regclass")).rows[0];if(!security.relrowsecurity)throw Error('Studio RLS validation failed');
await db.query('commit');console.log('NOVA7_RELEASE: migration 034 verified on configured marketing database; RLS enabled.');
}catch(e){await db.query('rollback').catch(()=>{});console.error('NOVA7_RELEASE_FAILED:',e.code||'validation',e.message.includes('password')?'Database authentication failed':e.message);process.exitCode=1}finally{await db.end()}
