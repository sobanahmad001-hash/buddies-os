import { ema, atr, type LabCandle } from "./engine";
export function chartIndicators(candles: LabCandle[]) {
  const closes=candles.map(c=>c.close);
  const moving=(period:number)=>ema(closes,period).flatMap((value,i)=>i<period-1?[]:[{time:candles[i].time,value}]);
  const rsi: {time:string;value:number}[]=[];
  let gain=0,loss=0;
  for(let i=1;i<closes.length;i++) {
    const change=closes[i]-closes[i-1];
    if(i<=14){gain+=Math.max(change,0)/14;loss+=Math.max(-change,0)/14;}
    else {gain=(gain*13+Math.max(change,0))/14;loss=(loss*13+Math.max(-change,0))/14;}
    if(i>=14)rsi.push({time:candles[i].time,value:gain===0&&loss===0?50:loss===0?100:100-100/(1+gain/loss)});
  }
  return {ema20:moving(20),ema50:moving(50),rsi,atr14:atr(candles)};
}
