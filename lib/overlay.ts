import { atr, pivots } from "./indicators";
import type { Candle, ClosedTrade, OverlayLine, OverlayMarker, Position, Settings } from "./types";

const STRUCTURE = "rgba(110, 128, 150, 0.95)";
const FAN = "rgba(126, 144, 166, 0.8)";

export function buildOverlay(
  candles: Candle[],
  cursor: number,
  settings: Settings,
  position: Position | null,
  trades: ClosedTrade[],
): { markers: OverlayMarker[]; lines: OverlayLine[] } {
  const last = Math.max(0, Math.min(cursor, candles.length - 1));
  const view = candles.slice(0, last + 1);
  const markers: OverlayMarker[] = [];
  const lines: OverlayLine[] = [];
  if (view.length === 0) return { markers, lines };

  const averages = atr(view, settings.atrPeriod);

  for (let i = 0; i < view.length; i += 1) {
    const candle = view[i];
    const bullish = candle.close >= candle.open;
    markers.push({
      time: candle.time,
      price: bullish ? candle.low : candle.high,
      kind: bullish ? "diamond" : "triangle",
      tone: bullish ? "blue" : "red",
      size: "sm",
    });
    const average = averages[i];
    const range = candle.high - candle.low;
    if (Number.isFinite(average) && range > average * 1.35) {
      markers.push({
        time: candle.time,
        price: (candle.high + candle.low) / 2,
        kind: bullish ? "diamond" : "triangle",
        tone: bullish ? "blue" : "red",
        size: "sm",
      });
    }
  }

  const points = pivots(view, settings.swing, view.length - 1);
  if (points.length >= 2) {
    lines.push({
      points: points.map((point) => ({
        time: view[point.index].time,
        price: point.price,
      })),
      color: STRUCTURE,
      width: 1.25,
    });

    for (let i = 1; i < points.length; i += 1) {
      const from = points[i - 1];
      const to = points[i];
      const rising = to.price >= from.price;
      const span = Math.max(1, to.index - from.index);
      const steps = Math.min(8, Math.max(2, Math.round(span / 2)));
      for (let step = 1; step < steps; step += 1) {
        const t = step / steps;
        const index = Math.round(from.index + (to.index - from.index) * t);
        const candle = view[index];
        if (!candle) continue;
        markers.push({
          time: candle.time,
          price: from.price + (to.price - from.price) * t,
          kind: rising ? "diamond" : "triangle",
          tone: rising ? "blue" : "red",
          size: "sm",
        });
      }
    }
  }

  for (let i = 0; i < points.length; i += 1) {
    const point = points[i];
    if (point.kind !== "low") continue;
    const average = averages[point.index];
    const previousHigh = [...points.slice(0, i)].reverse().find((item) => item.kind === "high");
    if (!previousHigh || !Number.isFinite(average)) continue;
    const drop = previousHigh.price - point.price;
    if (drop < average * 2.2) continue;
    const endIndex = Math.min(view.length - 1, point.index + 16);
    const start = { time: view[point.index].time, price: point.price };
    const endTime = view[endIndex].time;
    for (let fan = 1; fan <= 5; fan += 1) {
      lines.push({
        points: [start, { time: endTime, price: point.price + drop * (fan / 5) }],
        color: FAN,
        width: 1,
        dash: [3, 3],
      });
    }
  }

  const entries: Array<{ side: Position["side"]; openedAt: number; entry: number }> = [
    ...trades,
  ];
  if (position) entries.push(position);
  for (const entry of entries) {
    markers.push({
      time: entry.openedAt,
      price: entry.entry,
      kind: entry.side === "long" ? "diamond" : "triangle",
      tone: entry.side === "long" ? "blue" : "red",
      size: "md",
    });
  }

  return { markers, lines };
}
