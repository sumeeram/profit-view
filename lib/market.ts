import { roundPx } from "./indicators";
import type { Candle } from "./types";

/** 15-minute bars. The path starts 6 Oct so the 7 Oct window has trend context. */
export const SESSION_START = Date.UTC(2026, 9, 6, 12, 0, 0) / 1000;
export const BAR_SECONDS = 15 * 60;

type Leg = {
  bars: number;
  to: number;
  wobble: number;
};

/**
 * Scripted session shaped like the screenshots: a climb, a second push,
 * a spike down (the fan low), then a recovery. Prices are synthetic.
 */
const LEGS: Leg[] = [
  { bars: 18, to: 2652, wobble: 1.1 },
  { bars: 8, to: 2636, wobble: 0.7 },
  { bars: 18, to: 2696, wobble: 1.2 },
  { bars: 8, to: 2674, wobble: 0.6 },
  { bars: 14, to: 2732, wobble: 1.0 },
  { bars: 4, to: 2716, wobble: 0.25 },
  { bars: 4, to: 2728, wobble: 0.2 },
  { bars: 5, to: 2684, wobble: 0.35 },
  { bars: 10, to: 2644, wobble: 1.1 },
  { bars: 7, to: 2668, wobble: 0.45 },
  { bars: 14, to: 2604, wobble: 1.05 },
  { bars: 8, to: 2630, wobble: 0.5 },
  { bars: 12, to: 2586, wobble: 0.9 },
  { bars: 8, to: 2612, wobble: 0.55 },
];

export function buildSession(): Candle[] {
  const candles: Candle[] = [];
  let price = 2624;
  let time = SESSION_START;

  for (const leg of LEGS) {
    const from = price;
    for (let i = 1; i <= leg.bars; i += 1) {
      const t = i / leg.bars;
      const base = from + (leg.to - from) * t;
      const wobble =
        Math.sin(Math.PI * t) * leg.wobble * Math.sin(i * 2.15 + leg.to);
      const close = roundPx(base + wobble * 0.35);
      const open = roundPx(price);
      const wick = Math.max(0.4, leg.wobble * 0.5);
      const high = roundPx(
        Math.max(open, close) + wick * (0.5 + 0.3 * Math.abs(Math.sin(i + leg.to))),
      );
      const low = roundPx(
        Math.min(open, close) - wick * (0.45 + 0.25 * Math.abs(Math.cos(i * 1.6))),
      );
      candles.push({ time, open, high, low, close });
      price = close;
      time += BAR_SECONDS;
    }
  }

  return candles;
}
