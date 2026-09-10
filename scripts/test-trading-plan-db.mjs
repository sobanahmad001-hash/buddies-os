// Optional isolated SQL verification. Supply the installed @electric-sql/pglite
// entrypoint via BUDDIES_PGLITE_MODULE, or install it in your development environment.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const { PGlite } = await import(process.env.BUDDIES_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const root = fileURLToPath(new URL('../', import.meta.url));
if (process.env.BUDDIES_TEST_SCHEMA !== 'repository') {
  await db.exec(await readFile(`${root}scripts/fixtures/trading-live-schema.sql`, 'utf8'));
} else {
const labMigration = await readFile(`${root}supabase/migrations/20260826090904_trading_lab_mvp.sql`, 'utf8');
const sharedMigration = await readFile(`${root}supabase/migrations/20250112_missing_tables.sql`, 'utf8');
const table = (sql, name) => {
  const found = sql.match(new RegExp(`create table if not exists (?:public\\.)?${name} \\([\\s\\S]*?\\n\\);`, 'i'));
  assert.ok(found, `Existing ${name} schema found`); return found[0];
};
await db.exec(`
  create role authenticated; create role anon;
  create schema auth;
  create table auth.users(id uuid primary key);
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  create table public.projects(id uuid primary key);
  ${table(sharedMigration, 'decisions')}
  ${table(labMigration, 'trading_strategies')}
  ${table(labMigration, 'trading_strategy_versions')}
  create table public.trading_ladder_campaigns(id uuid primary key);
  ${table(labMigration, 'trading_decisions')}
`);
for (const name of ['decisions', 'trading_strategies', 'trading_strategy_versions', 'trading_decisions']) {
  await db.exec(`alter table public.${name} enable row level security;
    create policy owner on public.${name} for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
    grant select, insert, update, delete on public.${name} to authenticated;`);
}
}
const draft = await readFile(`${root}docs/sql/trading_lab_pretrade.sql`, 'utf8');
await db.exec(draft);
// Repeat application to catch unsafe CREATE/ALTER assumptions in the draft.
await db.exec(draft);
const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const strategyId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const versionId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const otherVersion = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const definition = { name: 'SQL fixture', symbols: ['XAUUSD'], direction: 'long' };
await db.query('insert into auth.users values ($1), ($2)', [owner, other]);
await db.query('insert into trading_strategies(id,user_id,name) values ($1,$2,$3)', [strategyId, owner, 'Fixture']);
await db.query('insert into trading_strategy_versions(id,user_id,strategy_id,version,definition) values ($1,$2,$3,1,$4), ($5,$6,$3,2,$4)', [versionId, owner, strategyId, definition, otherVersion, other]);
await db.query("select set_config('request.jwt.claim.sub', $1, false)", [owner]);
await db.exec('set role authenticated');
const plan = {
  requestId: '11111111-1111-4111-8111-111111111111', strategyVersionId: versionId,
  instrument: 'XAUUSD', direction: 'long', entry: 3450, stopLoss: 3445, takeProfit: 3470,
  quantity: .01, quantityUnit: 'lots', riskAmount: 10, riskCurrency: 'USD', session: 'Test',
  context: 'Manual evidence', notExecutedYet: true, predictedProbability: 0,
  observedAt: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 3600_000).toISOString(),
};
const assessment = { mode: 'manual_assessment', verdict: 'WAIT' };
const capture = async (value = plan, snapshot = definition) => (await db.query(
  'select public.capture_trading_plan($1,$2,$3,$4,$5) as result',
  [value.requestId, value.strategyVersionId, value, assessment, snapshot])).rows[0].result;
plan.analysisEvidence = {schemaVersion:1,method:'manual_pretrade',...Object.fromEntries(['technical','volume','fundamental'].map(k=>[k,{stance:'supports',evidence:'Pre-trade fixture evidence',source:'Isolated fixture',asOf:plan.observedAt}]))};
const saved = await capture();
assert.deepEqual(saved.plan_snapshot.analysisEvidence, plan.analysisEvidence, "Analysis evidence persists in the immutable plan");
assert.ok(saved.id && saved.buddies_decision_id && saved.locked_at);
assert.equal(saved.strategy_version_id, versionId);
assert.equal((await db.query('select probability from decisions where id = $1', [saved.buddies_decision_id])).rows[0].probability, 0);
assert.deepEqual((await db.query('select verdict,chosen_option,predicted_probability from decisions where id=$1',[saved.buddies_decision_id])).rows[0],{verdict:'wait',chosen_option:'WAIT',predicted_probability:0});
assert.equal((await capture()).id, saved.id, 'Same request returns same record');
assert.equal((await db.query('select count(*)::int as n from decisions')).rows[0].n, 1);
await assert.rejects(capture({ ...plan, entry: 3451 }), /Request ID already/);
await assert.rejects(capture({ ...plan, requestId: crypto.randomUUID(), strategyVersionId: otherVersion }), /Strategy version not found/);
await assert.rejects(capture({ ...plan, requestId: crypto.randomUUID() }, { changed: true }), /Strategy version changed/);
await assert.rejects(capture({ ...plan, requestId: crypto.randomUUID(), stopLoss: 3455 }), /Invalid prices/);
await assert.rejects(capture({ ...plan, requestId: crypto.randomUUID(), validUntil: new Date(Date.now() - 1000).toISOString() }), /Expired/);
await assert.rejects(db.query("update trading_decisions set plan_snapshot = '{}' where id = $1", [saved.id]), /immutable/);
await assert.rejects(db.query('update trading_decisions set locked_at = null where id = $1', [saved.id]), /immutable/);
await assert.rejects(db.query('delete from trading_decisions where id = $1', [saved.id]), /immutable/);
await assert.rejects(db.query('update decisions set probability = 99 where id = $1', [saved.buddies_decision_id]), /locked/);
await assert.rejects(db.query('update decisions set predicted_probability = 99 where id = $1', [saved.buddies_decision_id]), /locked/);
await assert.rejects(db.query("update decisions set chosen_option = 'REVIEW' where id = $1", [saved.buddies_decision_id]), /locked/);
await assert.rejects(db.query('delete from decisions where id = $1', [saved.buddies_decision_id]), /locked/);
await assert.rejects(db.query("update trading_strategy_versions set definition = '{}' where id = $1", [versionId]), /locked plans/);
await db.query("update decisions set outcome_rating = 'success' where id = $1", [saved.buddies_decision_id]);
assert.equal((await db.query('select outcome_rating from decisions where id = $1', [saved.buddies_decision_id])).rows[0].outcome_rating, 'success');
// A forced failure in the second insert must roll back the first generic decision.
await db.exec(`reset role;
  create function public.test_reject_plan() returns trigger language plpgsql as $$ begin raise exception 'forced second insert failure'; end $$;
  create trigger zz_test_reject_plan before insert on trading_decisions for each row execute function public.test_reject_plan();
  set role authenticated;`);
await assert.rejects(capture({ ...plan, requestId: crypto.randomUUID() }), /forced second insert failure/);
assert.equal((await db.query('select count(*)::int as n from decisions')).rows[0].n, 1, 'Both writes rolled back together');
await db.exec('reset role; drop trigger zz_test_reject_plan on trading_decisions; set role authenticated;');
// RLS hides another owner's rows and prevents capture under their identity.
await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
assert.equal((await db.query('select count(*)::int as n from trading_decisions')).rows[0].n, 0);
await assert.rejects(capture({ ...plan, requestId: crypto.randomUUID() }), /Strategy version not found/);
await db.query("select set_config('request.jwt.claim.sub', '', false)");
await assert.rejects(capture({ ...plan, requestId: crypto.randomUUID() }), /Authentication required/);
console.log('PASS: SQL draft applies twice; atomic linkage, retry identity, zero probability, ownership/RLS, stale version, geometry, expiry, immutable plan/version/prediction, allowed outcome update, forced rollback, unauthenticated denial.');
await db.close();
