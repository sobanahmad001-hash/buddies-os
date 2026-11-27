type Bar = { time: string; open: number; high: number; low: number; close: number; volume: number | null };

function utcHour(time: string) {
  const iso = time.replace(" ", "T");
  return new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + "Z").getUTCHours();
}

// A test remains active for its signal candle and six later completed bars.
function trackedLevel(bars: Bar[]) {
  let pivot = 0, resistance = true, tested = -1, broken = false, held = false;
  let stage = "", evidence = "", outlook = "", invalidation = "";
  for (let i = 20; i < bars.length; i++) {
    const bar = bars[i];
    if (tested < 0 || i - tested > 6) {
      const prior = bars.slice(i - 20, i);
      const high = Math.max(...prior.map(b => b.high));
      const low = Math.min(...prior.map(b => b.low));
      const hitsHigh = bar.high >= high, hitsLow = bar.low <= low;
      tested = -1; broken = false; held = false;
      resistance = Math.abs(bar.close-high) <= Math.abs(bar.close-low);
      if (hitsHigh !== hitsLow) resistance = hitsHigh;
      pivot = resistance ? high : low;
      if (hitsHigh && hitsLow && bar.close <= high && bar.close >= low) {
        stage = "Both sides tested"; evidence = "The candle touched both boundaries and closed inside.";
        outlook = "Direction unresolved."; invalidation = "Watch for a close outside either boundary."; continue;
      }
      if (!hitsLow && !hitsHigh) {
        stage = "Awaiting test"; evidence = "The latest candle stayed inside the preceding 20-bar range.";
        outlook = "Neither direction has confirmation."; invalidation = "Reassess on a boundary test."; continue;
      }
      tested = i;
    }
    const outside = resistance ? bar.close > pivot : bar.close < pivot;
    const inside = resistance ? bar.close < pivot : bar.close > pivot;
    const touched = bar.low <= pivot && bar.high >= pivot;
    const side = resistance ? "above" : "below", back = resistance ? "below" : "above";
    evidence = `Hourly bar opened ${bar.time} · high ${bar.high.toFixed(2)}, low ${bar.low.toFixed(2)}, close ${bar.close.toFixed(2)}.`;
    if (outside) {
      held = held || (broken && touched);
      stage = held ? "Retest held" : "Breakout candidate";
      outlook = held ? `The original level held on a later test. This supports ${resistance ? "upward" : "downward"} continuation.` : `Price closed ${side} the level. A later retest is still needed.`;
      invalidation = `An hourly close ${back} the original level weakens continuation.`;
      broken = true;
    } else if (inside) {
      stage = broken ? "Breakout failed" : touched || i === tested ? "Rejected at level" : "Inside after test";
      outlook = "The close favors rotation inside the prior range.";
      invalidation = `An hourly close ${side} the original level reopens the breakout scenario.`;
      broken = false; held = false;
    } else {
      stage = "Testing level"; outlook = "The close is on the boundary. Direction is unresolved.";
      invalidation = "Watch the next completed close.";
    }
  }
  return {pivot,boundary:resistance ? "prior 20-bar high" : "prior 20-bar low",stage,evidence,outlook,invalidation,
    testedAt:tested >= 0 ? bars[tested].time : null};
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
  const tracked = trackedLevel(bars);
  const upperLevels = [...highs,ceiling].filter(value => value > Math.max(tracked.pivot,last.close));
  const lowerLevels = [...lows,floor].filter(value => value < Math.min(tracked.pivot,last.close));
  const levelMap = {...tracked, above: upperLevels.length ? Math.min(...upperLevels) : null,
    below: lowerLevels.length ? Math.max(...lowerLevels) : null};
  return {levelMap,regime,floor,ceiling,highs:highs.slice(-2),lows:lows.slice(-2),slope,atr,spread,relative,peerCount:peers.length,location:spread?(last.close-last.low)/spread:null};
}
