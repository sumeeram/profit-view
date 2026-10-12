import { atr, dmi, ema, pivots, rsi } from "./indicators";
import { signalRules } from "./signal-rules";
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
 * A trade is a confirmed swing that pulled back to the fast EMA while the
 * slow EMA is still trending, ADX says the market is actually moving, and
 * RSI has turned back with the trend without being extended.
 * The stop sits beyond that swing. The target is a multiple of the risk.
 * Markers on every candle are paint. This function is the actual entry.
 *
 * The Pine script also requires the 4-hour EMA stack to agree. This series
 * has one timeframe, so the slow EMA is the trend gate here.
 */
export function signalAt(candles: Candle[], index: number, settings: Settings): Signal | null {
  const readyAt =
    signalRules.slowEmaPeriod + settings.swing + signalRules.adxPeriod + settings.emaSlope;
  if (index < readyAt || index >= candles.length) return null;

  const bar = candles[index];
  const hour = new Date(bar.time * 1000).getUTCHours();
  if (hour < signalRules.sessionStartHour || hour >= signalRules.sessionEndHour) return null;

  const closes = candles.map((candle) => candle.close);
  const fast = ema(closes, settings.emaPeriod);
  const slow = ema(closes, signalRules.slowEmaPeriod);
  const momentum = rsi(closes, signalRules.rsiPeriod);
  const atrValues = atr(candles, settings.atrPeriod);
  const direction = dmi(candles, signalRules.adxPeriod, signalRules.adxPeriod);
  const average = atrValues[index];
  const trendNow = fast[index];
  const slowNow = slow[index];
  const slowThen = slow[index - settings.emaSlope];
  const rsiNow = momentum[index];
  const rsiThen = momentum[index - 1];
  const adxNow = direction.adx[index];
  if (!Number.isFinite(average) || average <= 0) return null;
  if (![trendNow, slowNow, slowThen, rsiNow, rsiThen, adxNow].every(Number.isFinite)) {
    return null;
  }
  if (adxNow < signalRules.adxMin) return null;

  const confirmed = pivots(candles, settings.swing, index).filter(
    (pivot) => pivot.index + settings.swing === index,
  );
  const pivot = confirmed[0];
  if (!pivot) return null;

  const entry = roundEntry(bar.close);
  const fastAtSwing = fast[pivot.index];
  const atrAtSwing = atrValues[pivot.index];
  if (!Number.isFinite(fastAtSwing) || !Number.isFinite(atrAtSwing) || atrAtSwing <= 0) return null;

  // The slow EMA is the trend. The fast EMA is allowed to curl during the pullback;
  // requiring it to already be rising again is what made entries late.
  const rising = slowNow > slowThen && trendNow > slowNow && entry > slowNow;
  const falling = slowNow < slowThen && trendNow < slowNow && entry < slowNow;
  const span = bar.high - bar.low;
  if (span <= 0) return null;
  const body = Math.abs(bar.close - bar.open) / span;

  if (pivot.kind === "low" && rising && bar.close > bar.open && body >= signalRules.minBodyRatio) {
    const reachedValue = pivot.price <= fastAtSwing + atrAtSwing * signalRules.pullbackSlackAtr;
    const heldTrend = pivot.price >= fastAtSwing - atrAtSwing * signalRules.pullbackAtr;
    const reclaimed = entry > trendNow && entry - trendNow <= average * signalRules.maxChaseAtr;
    const rsiOk =
      rsiNow >= signalRules.rsiLongMin &&
      rsiNow <= signalRules.rsiLongMax &&
      rsiNow > rsiThen;
    if (reachedValue && heldTrend && reclaimed && rsiOk && entry > pivot.price) {
      return buildSignal("long", index, entry, pivot.price - average * signalRules.stopBufferAtr, average, settings);
    }
  }

  if (pivot.kind === "high" && falling && bar.close < bar.open && body >= signalRules.minBodyRatio) {
    const reachedValue = pivot.price >= fastAtSwing - atrAtSwing * signalRules.pullbackSlackAtr;
    const heldTrend = pivot.price <= fastAtSwing + atrAtSwing * signalRules.pullbackAtr;
    const reclaimed = entry < trendNow && trendNow - entry <= average * signalRules.maxChaseAtr;
    const rsiOk =
      rsiNow <= signalRules.rsiShortMax &&
      rsiNow >= signalRules.rsiShortMin &&
      rsiNow < rsiThen;
    if (reachedValue && heldTrend && reclaimed && rsiOk && entry < pivot.price) {
      return buildSignal("short", index, entry, pivot.price + average * signalRules.stopBufferAtr, average, settings);
    }
  }
  return null;
}

function roundEntry(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildSignal(
  side: Side,
  barIndex: number,
  entry: number,
  rawStop: number,
  average: number,
  settings: Settings,
): Signal | null {
  const stop = roundEntry(rawStop);
  const risk = side === "long" ? entry - stop : stop - entry;
  if (!(risk > average * signalRules.minRiskAtr) || !(risk < average * signalRules.maxRiskAtr)) return null;
  const takeProfit = roundEntry(
    side === "long" ? entry + risk * settings.rewardRisk : entry - risk * settings.rewardRisk,
  );
  if (side === "long" && takeProfit <= entry) return null;
  if (side === "short" && takeProfit >= entry) return null;
  return { side, barIndex, entry, stop, takeProfit, atr: average };
}
