type Bar = { time: string; open: number; high: number; low: number; close: number; volume: number | null };

function utcHour(time: string) {
  const iso = time.replace(" ", "T");
  return new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z").getUTCHours();
}

export function hourlyRead(bars: Bar[]) {
  if (bars.length < 30) return null;
  const last = bars[bars.length - 1];
  const prior = bars.slice(-21, -1);
  const floor = Math.min(...prior.map(b => b.low));
  const ceiling = Math.max(...prior.map(b => b.high));
  const highs: number[] = [], lows: number[] = [];
  for (let i = 2; i < bars.length - 2; i++) {
    const nearby = [bars[i-2], bars[i-1], bars[i+1], bars[i+2]];
    if (nearby.every(b => b.high < bars[i].high)) highs.push(bars[i].high);
    if (nearby.every(b => b.low > bars[i].low)) lows.push(bars[i].low);
  }
  const change = (xs: number[]) => xs[xs.length-1] - xs[xs.length-2];
  const h = change(highs), l = change(lows);
  const range = highs.length >= 2 && lows.length >= 2 && last.close >= floor && last.close <= ceiling && h <= 0 && l >= 0;
  const regime = h > 0 && l > 0 && last.close >= lows[lows.length-1] ? "Uptrend" :
    h < 0 && l < 0 && last.close <= highs[highs.length-1] ? "Downtrend" : range ? "Range candidate" : "Transition / unclear";
  let ema = bars.slice(0,20).reduce((sum,b)=>sum+b.close,0)/20;
  let slope = 0;
  for (const bar of bars.slice(20)) { slope = (bar.close-ema)*2/21; ema += slope; }
  const tr = bars.slice(1).map((b,i)=>Math.max(b.high-b.low,Math.abs(b.high-bars[i].close),Math.abs(b.low-bars[i].close)));
  let atr=tr.slice(0,14).reduce((a,b)=>a+b,0)/14;
  for(const value of tr.slice(14)) atr=(13*atr+value)/14;
  const peers=bars.slice(0,-1).filter(b=>utcHour(b.time)===utcHour(last.time)).slice(-10);
  const mean=peers.length>=3 && peers.every(b=>b.volume!==null&&b.volume>0) ? peers.reduce((sum,b)=>sum+Number(b.volume),0)/peers.length : 0;
  const relative=mean && last.volume!==null && last.volume>0 ? last.volume/mean : null;
  const spread=last.high-last.low;
  return {regime,floor,ceiling,highs:highs.slice(-2),lows:lows.slice(-2),slope,atr,spread,relative,peerCount:peers.length,location:spread?(last.close-last.low)/spread:null};
}
