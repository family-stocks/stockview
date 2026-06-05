export interface OHLCV {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorPoint {
  time: string;
  value: number;
}

export interface BollingerPoint {
  time: string;
  upper: number;
  mid: number;
  lower: number;
}

export interface MACDPoint {
  time: string;
  macd: number;
  signal: number;
  hist: number;
}

export interface AllIndicators {
  sma50: IndicatorPoint[];
  sma200: IndicatorPoint[];
  ema10: IndicatorPoint[];
  boll: BollingerPoint[];
  macd: MACDPoint[];
  rsi: IndicatorPoint[];
  atr: IndicatorPoint[];
  vwma: IndicatorPoint[];
}

function emaValues(prices: number[], period: number): number[] {
  const alpha = 2 / (period + 1);
  const result: number[] = [];
  prices.forEach((p, i) => {
    if (i === 0) { result.push(p); return; }
    result.push(alpha * p + (1 - alpha) * result[i - 1]);
  });
  return result;
}

export function computeSMA(data: OHLCV[], period: number): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    result.push({ time: data[i].time, value: sum / period });
  }
  return result;
}

export function computeEMA(data: OHLCV[], period: number): IndicatorPoint[] {
  const prices = data.map(d => d.close);
  const ema = emaValues(prices, period);
  return data.map((d, i) => ({ time: d.time, value: ema[i] }));
}

export function computeBollinger(data: OHLCV[], period = 20, nbdev = 2): BollingerPoint[] {
  const result: BollingerPoint[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = 0; j < period; j++) sum += data[i - j].close;
    const mean = sum / period;
    let variance = 0;
    for (let j = 0; j < period; j++) variance += (data[i - j].close - mean) ** 2;
    const std = Math.sqrt(variance / period);
    result.push({ time: data[i].time, upper: mean + nbdev * std, mid: mean, lower: mean - nbdev * std });
  }
  return result;
}

export function computeMACD(data: OHLCV[], fast = 12, slow = 26, signal = 9): MACDPoint[] {
  const prices = data.map(d => d.close);
  const fastEMA = emaValues(prices, fast);
  const slowEMA = emaValues(prices, slow);
  const macdLine = prices.map((_, i) => fastEMA[i] - slowEMA[i]);
  const signalLine = emaValues(macdLine, signal);
  return data.map((d, i) => ({
    time: d.time,
    macd: macdLine[i],
    signal: signalLine[i],
    hist: macdLine[i] - signalLine[i],
  }));
}

export function computeRSI(data: OHLCV[], period = 14): IndicatorPoint[] {
  const prices = data.map(d => d.close);
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < prices.length; i++) {
    const delta = prices[i] - prices[i - 1];
    gains.push(Math.max(0, delta));
    losses.push(Math.max(0, -delta));
  }
  const alpha = 1 / period;
  const avgGains: number[] = [gains[0]];
  const avgLosses: number[] = [losses[0]];
  for (let i = 1; i < gains.length; i++) {
    avgGains.push(alpha * gains[i] + (1 - alpha) * avgGains[i - 1]);
    avgLosses.push(alpha * losses[i] + (1 - alpha) * avgLosses[i - 1]);
  }
  return data.map((d, i) => {
    const rs = avgLosses[i] === 0 ? Infinity : avgGains[i] / avgLosses[i];
    return { time: d.time, value: rs === Infinity ? 100 : 100 - (100 / (1 + rs)) };
  });
}

export function computeATR(data: OHLCV[], period = 14): IndicatorPoint[] {
  const tr: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i === 0) { tr.push(data[i].high - data[i].low); continue; }
    const prev = data[i - 1].close;
    tr.push(Math.max(data[i].high - data[i].low, Math.abs(data[i].high - prev), Math.abs(data[i].low - prev)));
  }
  const alpha = 1 / period;
  const atr: number[] = [tr[0]];
  for (let i = 1; i < tr.length; i++) atr.push(alpha * tr[i] + (1 - alpha) * atr[i - 1]);
  return data.map((d, i) => ({ time: d.time, value: atr[i] }));
}

export function computeVWMA(data: OHLCV[], period = 20): IndicatorPoint[] {
  const result: IndicatorPoint[] = [];
  for (let i = period - 1; i < data.length; i++) {
    let pv = 0, vol = 0;
    for (let j = 0; j < period; j++) {
      pv += data[i - j].close * data[i - j].volume;
      vol += data[i - j].volume;
    }
    result.push({ time: data[i].time, value: vol > 0 ? pv / vol : data[i].close });
  }
  return result;
}

export function computeAllIndicators(data: OHLCV[], windowStart: string): AllIndicators {
  // Compute over full (warmup) data, then filter to window
  const filter = (pts: { time: string }[]) => pts.filter(p => p.time >= windowStart);

  return {
    sma50:  filter(computeSMA(data, 50))  as IndicatorPoint[],
    sma200: filter(computeSMA(data, 200)) as IndicatorPoint[],
    ema10:  filter(computeEMA(data, 10))  as IndicatorPoint[],
    boll:   filter(computeBollinger(data)) as BollingerPoint[],
    macd:   filter(computeMACD(data))     as MACDPoint[],
    rsi:    filter(computeRSI(data))      as IndicatorPoint[],
    atr:    filter(computeATR(data))      as IndicatorPoint[],
    vwma:   filter(computeVWMA(data))     as IndicatorPoint[],
  };
}
