import type { Candle } from "./types";

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function roundPx(value: number): number {
  return Math.round(value * 100) / 100;
}

export function ema(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  if (period < 1 || values.length < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i += 1) sum += values[i];
  let prev = sum / period;
  out[period - 1] = prev;
  const k = 2 / (period + 1);
  for (let i = period; i < values.length; i += 1) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export function atr(candles: Candle[], period: number): number[] {
  const out = new Array<number>(candles.length).fill(Number.NaN);
  if (period < 1 || candles.length < period) return out;
  const trs: number[] = [];
  for (let i = 0; i < candles.length; i += 1) {
    const candle = candles[i];
    const prevClose = i === 0 ? candle.close : candles[i - 1].close;
    trs.push(
      Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevClose),
        Math.abs(candle.low - prevClose),
      ),
    );
  }
  let prev = 0;
  for (let i = 0; i < period; i += 1) prev += trs[i];
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < candles.length; i += 1) {
    prev = (prev * (period - 1) + trs[i]) / period;
    out[i] = prev;
  }
  return out;
}

export type Pivot = {
  index: number;
  price: number;
  kind: "high" | "low";
};

/** Pivots confirmed by `upto` (inclusive). A pivot needs `swing` bars on both sides. */
export function pivots(candles: Candle[], swing: number, upto: number): Pivot[] {
  const found: Pivot[] = [];
  const last = Math.min(upto, candles.length - 1);
  if (swing < 1 || last < swing * 2) return found;
  for (let i = swing; i <= last - swing; i += 1) {
    let isHigh = true;
    let isLow = true;
    for (let j = i - swing; j <= i + swing; j += 1) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isHigh = false;
      if (candles[j].low <= candles[i].low) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) found.push({ index: i, price: candles[i].high, kind: "high" });
    else if (isLow) found.push({ index: i, price: candles[i].low, kind: "low" });
  }
  return found;
}
