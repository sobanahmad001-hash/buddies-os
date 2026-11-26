import { getLabSnapshot,normalizeLabInterval } from "@/lib/trading-lab/market-data";
import { resolveConnectorSecret } from "@/lib/trading-lab/connector-secrets";
jest.mock("server-only",()=>({}),{virtual:true});
jest.mock("@/lib/trading-lab/connector-secrets",()=>({resolveConnectorSecret:jest.fn()}));
jest.mock("@/lib/supabase/admin",()=>({createAdminClient:jest.fn()}));
const originalFetch=global.fetch;
const bar=(offset:number)=>({datetime:new Date(Date.now()+offset*60000).toISOString().slice(0,19).replace('T',' '),open:'100',high:'101',low:'99',close:'100',volume:'0'});
afterEach(()=>{global.fetch=originalFetch;jest.useRealTimers();});
beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-09-10T08:00:00Z'));(resolveConnectorSecret as jest.Mock).mockImplementation(async(_u,p)=>p==='twelve_data'?'isolated-placeholder':null);});
function provider(values:any[]){global.fetch=jest.fn(async(url)=>new Response(JSON.stringify(String(url).includes('twelvedata')?{values}:[]),{status:200})) as any;}
test('chart feed requests UTC, excludes unfinished candles and preserves zero volume',async()=>{provider([bar(0),bar(-1),bar(-2)]);const s=await getLabSnapshot('test','XAU/USD',false,'1min');expect(s.candles).toHaveLength(2);expect(s.candles.every((b:any)=>b.volume===0)).toBe(true);expect(String((global.fetch as jest.Mock).mock.calls[0][0])).toContain('timezone=UTC');expect(s.asOf).toBe('2026-09-10T07:59:00.000Z');});
test('invalid or duplicate provider candles cannot become real chart evidence',async()=>{provider([bar(-2),bar(-2)]);await expect(getLabSnapshot('test','XAU/USD',false,'1min')).rejects.toThrow('invalid');});
test('entry timeframes remain distinct rather than silently falling back to hourly',()=>{expect(normalizeLabInterval('1min')).toBe('1min');expect(normalizeLabInterval('5min')).toBe('5min');expect(normalizeLabInterval('15min')).toBe('15min');});

test('an almost hour-old one-minute candle is stale', async () => {
  provider([bar(-58)]);
  const snapshot = await getLabSnapshot('test', 'XAU/USD', false, '1min');
  expect(snapshot.dataQuality.price).toBe('stale');
});

test('a just-completed 15-minute candle has independent close and retrieval times', async () => {
  provider([bar(-15), bar(0)]);
  const snapshot = await getLabSnapshot('test', 'XAU/USD', false, '15min');
  expect(snapshot.dataQuality.price).toBe('reported');
  expect(snapshot.asOf).toBe('2026-09-10T07:45:00.000Z');
  expect(snapshot.lastBarClosedAt).toBe('2026-09-10T08:00:00.000Z');
  expect(snapshot.retrievedAt).toBe('2026-09-10T08:00:00.000Z');
});

test('a missing chart feed is unavailable in provider mode and explicit in preview mode', async () => {
  (resolveConnectorSecret as jest.Mock).mockResolvedValue(null);
  provider([]);
  await expect(getLabSnapshot('test', 'XAU/USD', false, '15min')).rejects.toThrow('No historical-bar connector');
  const preview = await getLabSnapshot('test', 'XAU/USD', true, '15min');
  expect(preview.demo).toBe(true);
  expect(preview.dataQuality.price).toBe('preview');
});
