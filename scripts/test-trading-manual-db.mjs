// Isolated database acceptance test. No production project or credentials used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { PGlite } = await import(process.env.BUDDIES_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const root = fileURLToPath(new URL('../', import.meta.url));
const source = async path => readFile(root + path, 'utf8');
if (process.env.BUDDIES_TEST_SCHEMA !== 'repository') {
  await db.exec(await source('scripts/fixtures/trading-live-schema.sql'));
} else {
const shared = await source('supabase/migrations/20250112_missing_tables.sql');
const core = await source('supabase/migrations/20260325_trading_core_tables.sql');
const lab = await source('supabase/migrations/20260826090904_trading_lab_mvp.sql');
const memory = await source('supabase/migrations/20260317_core_memory_expansion.sql');
const table = (sql, name) => { const match = sql.match(new RegExp(`create table if not exists (?:public\\.)?${name} \\([\\s\\S]*?\\n\\);`, 'i')); assert.ok(match, name); return match[0]; };
await db.exec(`create role authenticated; create role anon; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
 create table projects(id uuid primary key);
 ${['decisions','rules','decision_lessons','behavior_logs','rule_violations'].map(n=>table(shared,n)).join('\n')}
 ${table(memory,'ai_memory_items')}
 ${['trading_strategies','trading_strategy_versions','trading_ladder_campaigns','trading_decisions','trading_import_batches'].map(n=>table(lab,n)).join('\n')}
 ${table(core,'trading_entries')}
 ${lab.match(/alter table public\.trading_entries[\s\S]*?;/i)[0]}`);
const baseTables=['decisions','rules','decision_lessons','behavior_logs','rule_violations','ai_memory_items','trading_strategies','trading_strategy_versions','trading_ladder_campaigns','trading_decisions','trading_import_batches','trading_entries'];
for (const name of baseTables) await db.exec(`alter table ${name} enable row level security; create policy owner on ${name} for all to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id); grant select,insert,update,delete on ${name} to authenticated;`);
}
await db.exec(await source('docs/sql/trading_lab_pretrade.sql'));
await db.exec(await source('docs/sql/trading_lab_manual_workflow.sql'));
await db.exec(await source('docs/sql/trading_lab_manual_workflow.sql'));
const owner=crypto.randomUUID(),other=crypto.randomUUID(),strategyId=crypto.randomUUID(),versionId=crypto.randomUUID(),ruleId=crypto.randomUUID();
await db.query('insert into auth.users values($1),($2)',[owner,other]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);
await db.exec('set role authenticated');
await db.query("insert into trading_strategies(id,user_id,name) values($1,$2,'Test')",[strategyId,owner]);
const definition={schemaVersion:1,name:'Gold',symbols:['XAUUSD'],direction:'long'};
await db.query('insert into trading_strategy_versions(id,user_id,strategy_id,version,definition) values($1,$2,$3,1,$4)',[versionId,owner,strategyId,definition]);
await db.query("insert into rules(id,user_id,rule_text) values($1,$2,'Do not move stop')",[ruleId,owner]);
const protocol={requestId:crypto.randomUUID(),strategyVersionId:versionId,parentExperimentId:null,name:'Sample',hypothesis:'Confirmation improves net R',session:'London',timezone:'Europe/London',targetSample:2,eligibility:'All qualifying setups',invalidation:'Missing confirmation',stopConditions:'Daily stop',reviewCriteria:'Review after sample',accountType:'live',riskCurrency:'USD',riskAmount:10,entryTolerance:1,protectionTolerance:0,quantityTolerancePct:0,approved:true};
const experiment=(await db.query('insert into trading_experiments(user_id,request_id,strategy_version_id,protocol,strategy_snapshot) values($1,$2,$3,$4,$5) returning *',[owner,protocol.requestId,versionId,protocol,definition])).rows[0];
await assert.rejects(db.query("update trading_strategy_versions set definition='{}' where id=$1",[versionId]),/frozen/);
await assert.rejects(db.query("update trading_experiments set protocol='{}' where id=$1",[experiment.id]),/immutable/);
const now=async()=>new Date((await db.query('select clock_timestamp() as t')).rows[0].t).toISOString();
const plan={requestId:crypto.randomUUID(),strategyVersionId:versionId,experimentId:experiment.id,instrument:'XAUUSD',direction:'long',entry:100,stopLoss:95,takeProfit:120,quantity:2,quantityUnit:'units',riskAmount:10,riskCurrency:'USD',session:'London',context:'Before execution',notExecutedYet:true,predictedProbability:60,observedAt:await now(),validUntil:new Date(Date.now()+3600_000).toISOString()};
const capture=async p=>(await db.query('select capture_trading_plan($1,$2,$3,$4,$5) as r',[p.requestId,p.strategyVersionId,p,{mode:'manual_assessment',verdict:'REVIEW'},definition])).rows[0].r;
await assert.rejects(capture({...plan,requestId:crypto.randomUUID(),riskAmount:20}),/risk must match/);
const saved=await capture(plan);
assert.deepEqual((await db.query('select verdict,chosen_option,predicted_probability from decisions where id=$1',[saved.buddies_decision_id])).rows[0],{verdict:'wait',chosen_option:'REVIEW',predicted_probability:60});
const tradeId=crypto.randomUUID();
const append=async(kind,payload,revision,requestId=crypto.randomUUID(),id=tradeId)=>(await db.query('select append_trading_event($1,$2,$3,$4,$5) as r',[requestId,id,revision,kind,payload])).rows[0].r;
const open={planId:saved.id,occurredAt:await now(),price:101,quantity:2,stopLoss:95,takeProfit:120,actualRiskAmount:12,accountType:'live',brokerReference:'Ticket 1',reason:'Manual fill'};
const demoPlan=await capture({...plan,requestId:crypto.randomUUID()});
const demo=await append('open',{...open,planId:demoPlan.id,accountType:'demo',occurredAt:await now()},0,crypto.randomUUID(),crypto.randomUUID());
assert.equal(demo.sample_member,false,'Demo evidence stays outside a declared live sample');
assert.equal(demo.account_type,'demo'); assert.equal(demo.ladder_step,0,'Manual samples do not participate in a ladder step');
const openRequest=crypto.randomUUID();
let t=await append('open',open,0,openRequest);
assert.equal(t.sample_member,true); assert.equal(t.planned_risk_amount,10); assert.equal(t.lot_size,0,'Units are not mislabelled as lots');
assert.equal((await append('open',open,0,openRequest)).id,t.id);
await assert.rejects(append('open',{...open,price:102},0,openRequest),/another event/);
await assert.rejects(db.query('update trading_entries set entry_price=90 where id=$1',[t.id]),/append-only/);
await assert.rejects(db.query('delete from trading_entries where id=$1',[t.id]),/cannot be deleted/);
await assert.rejects(append('partial_exit',{occurredAt:await now(),price:110,quantity:2,reason:'Final'},1),/use Close/);
await assert.rejects(append('add_fill',{occurredAt:await now(),price:102,quantity:1,reason:'Additional fill'},0),/Trade changed/);
t=await append('add_fill',{occurredAt:await now(),price:102,quantity:1,reason:'Additional fill'},1);
assert.equal(t.filled_quantity,3);
t=await append('change_protection',{occurredAt:await now(),stopLoss:100,takeProfit:120,reason:'Moved stop to entry'},2);
t=await append('partial_exit',{occurredAt:await now(),price:110,quantity:1,reason:'Partial manual exit'},3);
assert.equal(t.remaining_quantity,2);
await assert.rejects(append('change_protection',{occurredAt:plan.observedAt,stopLoss:99,takeProfit:120,reason:'Backdated'},4),/chronological/);
await assert.rejects(append('close',{occurredAt:await now(),price:115,quantity:1,pnlAmount:30,pnlBasis:'broker_net',fees:2,financing:-1,pnlEvidence:'Broker net',reason:'Final'},4),/remaining quantity/);
const close={occurredAt:await now(),price:115,quantity:2,pnlAmount:30,pnlBasis:'broker_net',fees:2,financing:-1,pnlEvidence:'Broker statement total for all exits, includes costs',reason:'Manual final exit'};
t=await append('close',close,4);
assert.equal(t.net_pnl,30,'Net broker P&L costs are not deducted twice'); assert.equal(t.r_multiple,3); assert.equal(t.remaining_quantity,0);
assert.ok(Math.abs(t.exit_price-113.33333)<.00001);
const review={findings:Object.fromEntries(['thesis','direction','entryTiming','confirmation','stopPlacement','targetRealistic','strategyFollowed','managementFollowed'].map(k=>[k,{status:'pass',evidence:'Checked broker and chart'}])),strategyReference:{r:4,evidence:'Manual reconstruction, same risk and net costs'},frozenPlanReference:{r:4,evidence:'Chart path and cost assumptions'},probabilityOutcome:'target_first',probabilityObservedAt:await now(),probabilityEvidence:'Chart shows target before stop within expiry',behaviors:[{type:'moved_stop',evidence:'Moved protection',ruleId}],lesson:'Keep approved protection',nextAction:'Hold protection constant in next sample'};
const reviewRequest=crypto.randomUUID();
t=await append('review',review,5,reviewRequest); await append('review',review,5,reviewRequest);
assert.equal((await db.query('select count(*)::int n from decision_lessons')).rows[0].n,1,'Review retry has one lesson');
assert.equal((await db.query('select count(*)::int n from rule_violations')).rows[0].n,1);
assert.deepEqual((await db.query('select mood_tag,trigger_tag from behavior_logs')).rows[0],{mood_tag:null,trigger_tag:'moved_stop'},'A trading behavior is not a mood');
assert.equal((await db.query('select count(*)::int n from ai_memory_items')).rows[0].n,1);
assert.equal((await db.query('select actual_outcome_bool from decisions where id=$1',[saved.buddies_decision_id])).rows[0].actual_outcome_bool,true);
await assert.rejects(append('review',{...review,probabilityOutcome:'neither'},6),/horizon/);
// Atomic rollback: a failed shared-memory write cannot leave a partial review.
await db.exec("reset role; create function test_memory_failure() returns trigger language plpgsql as $$begin raise exception 'forced memory failure'; end$$; create trigger zz_fail before insert on ai_memory_items for each row execute function test_memory_failure(); set role authenticated;");
await assert.rejects(append('review',{...review,lesson:'Amendment'},6),/forced memory failure/);
assert.equal((await db.query('select lifecycle_revision from trading_entries where id=$1',[t.id])).rows[0].lifecycle_revision,6);
assert.equal((await db.query('select count(*)::int n from decision_lessons')).rows[0].n,1);
await db.exec('reset role; drop trigger zz_fail on ai_memory_items; set role authenticated;');
t=await append('review',{...review,lesson:'Amended human lesson',probabilityOutcome:'unresolved',probabilityObservedAt:null,probabilityEvidence:''},6);
assert.deepEqual((await db.query('select actual_outcome_bool,outcome_rating from decisions where id=$1',[saved.buddies_decision_id])).rows[0],{actual_outcome_bool:null,outcome_rating:null},'Unresolved evidence must not become a failure');
assert.equal((await db.query("select count(*)::int n from ai_memory_items where status='active'")).rows[0].n,1);
// Coverage includes zero-setup sessions; overlapping periods cannot inflate frequency.
const end=await now();
await db.query('insert into trading_observation_sessions(user_id,request_id,experiment_id,started_at,ended_at,qualifying_setups,taken_setups,notes) values($1,$2,$3,$4,$5,0,0,$6)',[owner,crypto.randomUUID(),experiment.id,experiment.approved_at,end,'Zero setups observed']);
await assert.rejects(db.query('insert into trading_observation_sessions(user_id,request_id,experiment_id,started_at,ended_at,qualifying_setups,taken_setups,notes) values($1,$2,$3,$4,$5,1,0,$6)',[owner,crypto.randomUUID(),experiment.id,experiment.approved_at,end,'Overlap']),/overlaps/);
const outcome={requestId:crypto.randomUUID(),experimentId:experiment.id,action:'RETEST',rationale:'Insufficient sample',nextHypothesis:'Continue in a fresh sample',stopReason:'Manual early stop',approved:true};
const final=(await db.query('select review_trading_experiment($1,$2) r',[experiment.id,outcome])).rows[0].r;
assert.ok(final.review_decision_id);
assert.deepEqual((await db.query('select verdict,chosen_option from decisions where id=$1',[final.review_decision_id])).rows[0],{verdict:'wait',chosen_option:'RETEST'});
assert.equal((await db.query('select review_trading_experiment($1,$2) r',[experiment.id,outcome])).rows[0].r.id,experiment.id);
await assert.rejects(append('review',review,7),/frozen/);
await assert.rejects(capture({...plan,requestId:crypto.randomUUID()}),/active experiment/);
await assert.rejects(db.query("update trading_trade_events set payload='{}' where trade_id=$1",[tradeId]),/immutable/);
// Version revisions are atomic and retry-safe even when an old version is frozen.
const versionRequest=crypto.randomUUID();
const revise=async(id=versionRequest)=>(await db.query('select save_trading_strategy($1,$2,$3,$4) r',[id,strategyId,definition,'Next hypothesis'])).rows[0].r;
const revised=await revise();assert.equal(revised.version.version,2);assert.equal((await revise()).version.id,revised.version.id);
await assert.rejects(db.query('select save_trading_strategy($1,$2,$3,$4)',[versionRequest,strategyId,definition,'Different request']),/another version/);
const protocol2={...protocol,requestId:crypto.randomUUID(),strategyVersionId:revised.version.id,parentExperimentId:experiment.id};
const ex2=(await db.query('insert into trading_experiments(user_id,request_id,strategy_version_id,parent_experiment_id,protocol,strategy_snapshot) values($1,$2,$3,$4,$5,$6) returning *',[owner,protocol2.requestId,revised.version.id,experiment.id,protocol2,definition])).rows[0];
const members=[];
for(let i=0;i<3;i++){
 const p=await capture({...plan,requestId:crypto.randomUUID(),strategyVersionId:revised.version.id,experimentId:ex2.id});
 const id=crypto.randomUUID();const entry=await append('open',{...open,planId:p.id,occurredAt:await now()},0,crypto.randomUUID(),id);
 assert.equal(entry.sample_member,i<2,'The first two admissions form the sample; overflow is recorded outside it');members.push(id);
}
await assert.rejects(db.query('select review_trading_experiment($1,$2)',[ex2.id,{...outcome,experimentId:ex2.id}]),/Close the remaining/);
const gross=await append('close',{...close,occurredAt:await now(),pnlAmount:20,pnlBasis:'gross'},1,crypto.randomUUID(),members[0]);
assert.equal(gross.net_pnl,17,'Gross minus fees plus signed financing');
await append('close',{...close,occurredAt:await now(),pnlAmount:-10,pnlBasis:'broker_net'},1,crypto.randomUUID(),members[1]);
const review2=(await db.query('select review_trading_experiment($1,$2) r',[ex2.id,{...outcome,requestId:crypto.randomUUID(),experimentId:ex2.id,stopReason:''}])).rows[0].r;
assert.equal(review2.review_snapshot.closedSample,2);
await assert.rejects(db.query("update decisions set verdict='KEEP' where id=$1",[review2.review_decision_id]),/immutable/);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[other]);
assert.equal((await db.query('select count(*)::int n from trading_entries')).rows[0].n,0);
assert.equal((await db.query('select count(*)::int n from trading_trade_events')).rows[0].n,0);
assert.equal((await db.query('select count(*)::int n from ai_memory_items')).rows[0].n,0);
await assert.rejects(append('review',review,7),/Owned/);
await db.query("select set_config('request.jwt.claim.sub','',false)");
await assert.rejects(append('review',review,7),/Authentication/);
console.log('PASS: complete manual sample lifecycle, immutable protocols/evidence, fills/protection/partial exits, fixed-risk net accounting, retries/concurrency, coverage overlap, exact probability horizon, shared lessons/rules/memory, atomic rollback and ownership.');
await db.close();
