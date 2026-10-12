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

/** Wilder RSI. The first value sits on the bar that completes the seed average. */
export function rsi(values: number[], period: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  if (period < 1 || values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  const reading = () => (avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss));
  out[period] = reading();
  for (let i = period + 1; i < values.length; i += 1) {
    const diff = values[i] - values[i - 1];
    const up = diff > 0 ? diff : 0;
    const down = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + up) / period;
    avgLoss = (avgLoss * (period - 1) + down) / period;
    out[i] = reading();
  }
  return out;
}

export type DirectionalMove = {
  plus: number[];
  minus: number[];
  adx: number[];
};

/**
 * Wilder DMI/ADX. `diLength` smooths true range and directional movement.
 * `adxLength` smooths DX into ADX. Values stay NaN through the seed window.
 */
export function dmi(candles: Candle[], diLength: number, adxLength: number): DirectionalMove {
  const plus = new Array<number>(candles.length).fill(Number.NaN);
  const minus = new Array<number>(candles.length).fill(Number.NaN);
  const adx = new Array<number>(candles.length).fill(Number.NaN);
  if (diLength < 1 || adxLength < 1 || candles.length <= diLength + 1) {
    return { plus, minus, adx };
  }

  const tr = new Array<number>(candles.length).fill(0);
  const plusDm = new Array<number>(candles.length).fill(0);
  const minusDm = new Array<number>(candles.length).fill(0);
  for (let i = 1; i < candles.length; i += 1) {
    const up = candles[i].high - candles[i - 1].high;
    const down = candles[i - 1].low - candles[i].low;
    plusDm[i] = up > down && up > 0 ? up : 0;
    minusDm[i] = down > up && down > 0 ? down : 0;
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(
      candles[i].high - candles[i].low,
      Math.abs(candles[i].high - prevClose),
      Math.abs(candles[i].low - prevClose),
    );
  }

  const smoothTr = wilder(tr, diLength, 1);
  const smoothPlus = wilder(plusDm, diLength, 1);
  const smoothMinus = wilder(minusDm, diLength, 1);
  const dx = new Array<number>(candles.length).fill(Number.NaN);
  let dxStart = -1;
  for (let i = 0; i < candles.length; i += 1) {
    if (!Number.isFinite(smoothTr[i]) || smoothTr[i] === 0) continue;
    plus[i] = (100 * smoothPlus[i]) / smoothTr[i];
    minus[i] = (100 * smoothMinus[i]) / smoothTr[i];
    const sum = plus[i] + minus[i];
    dx[i] = sum === 0 ? 0 : (100 * Math.abs(plus[i] - minus[i])) / sum;
    if (dxStart < 0) dxStart = i;
  }
  if (dxStart < 0) return { plus, minus, adx };
  const smoothDx = wilder(dx, adxLength, dxStart);
  for (let i = 0; i < candles.length; i += 1) adx[i] = smoothDx[i];
  return { plus, minus, adx };
}

function wilder(values: number[], length: number, start: number): number[] {
  const out = new Array<number>(values.length).fill(Number.NaN);
  if (start < 0 || start + length > values.length) return out;
  let sum = 0;
  for (let i = start; i < start + length; i += 1) sum += values[i];
  let prev = sum / length;
  out[start + length - 1] = prev;
  for (let i = start + length; i < values.length; i += 1) {
    const sample = Number.isFinite(values[i]) ? values[i] : 0;
    prev = (prev * (length - 1) + sample) / length;
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
