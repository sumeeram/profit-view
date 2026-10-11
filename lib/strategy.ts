import { atr, ema, pivots, roundPx } from "./indicators";
import type { Candle, Settings, Side } from "./types";

export type Signal = {
  side: Side;
  barIndex: number;
  entry: number;
  stop: number;
  takeProfit: number;
  atr: number;
};

/**
 * Trade rule read off the screenshots:
 * blue marks the up swings, red marks the down swings, and a position exists
 * only when that swing agrees with the short-term trend and both a stop
 * and a take-profit can be priced from it.
 * Markers on every candle are paint. This function is the actual entry.
 */
export function signalAt(candles: Candle[], index: number, settings: Settings): Signal | null {
  const readyAt = settings.emaPeriod + settings.swing + settings.emaSlope;
  if (index < readyAt || index >= candles.length) return null;

  const closes = candles.map((candle) => candle.close);
  const emaValues = ema(closes, settings.emaPeriod);
  const atrValues = atr(candles, settings.atrPeriod);
  const average = atrValues[index];
  const trendNow = emaValues[index];
  const trendThen = emaValues[index - settings.emaSlope];
  if (!Number.isFinite(average) || average <= 0) return null;
  if (!Number.isFinite(trendNow) || !Number.isFinite(trendThen)) return null;

  const confirmed = pivots(candles, settings.swing, index).filter(
    (pivot) => pivot.index + settings.swing === index,
  );
  const pivot = confirmed[0];
  if (!pivot) return null;

  const bar = candles[index];
  const entry = roundPx(bar.close);
  const rising = trendNow > trendThen;
  const falling = trendNow < trendThen;

  if (pivot.kind === "low" && rising && bar.close > bar.open && entry > pivot.price) {
    return buildSignal("long", index, entry, pivot.price - average * 0.25, average, settings);
  }
  if (pivot.kind === "high" && falling && bar.close < bar.open && entry < pivot.price) {
    return buildSignal("short", index, entry, pivot.price + average * 0.25, average, settings);
  }
  return null;
}

function buildSignal(
  side: Side,
  barIndex: number,
  entry: number,
  rawStop: number,
  average: number,
  settings: Settings,
): Signal | null {
  const stop = roundPx(rawStop);
  const risk = side === "long" ? entry - stop : stop - entry;
  if (risk < average * 0.4 || risk > average * 4.5) return null;
  const takeProfit = roundPx(
    side === "long" ? entry + risk * settings.rewardRisk : entry - risk * settings.rewardRisk,
  );
  if (side === "long" && takeProfit <= entry) return null;
  if (side === "short" && takeProfit >= entry) return null;
  return { side, barIndex, entry, stop, takeProfit, atr: average };
}
