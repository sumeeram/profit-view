"use client";

import { useEffect, useRef, useState } from "react";
import { formatPx, formatTime } from "@/lib/format";
import type { Candle, OverlayLine, OverlayMarker, Position } from "@/lib/types";

const WINDOW = 96;
const BLUE = "#2f62d6";
const RED = "#d23b3b";
const PAPER = "#e7eef6";
const INK = "#1a1a1a";

type Props = {
  candles: Candle[];
  markers: OverlayMarker[];
  lines: OverlayLine[];
  position: Position | null;
  symbol: string;
};

export function PriceChart({ candles, markers, lines, position, symbol }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const measure = () => setSize({ width: wrap.clientWidth, height: wrap.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || size.width < 10 || size.height < 10) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    draw(context, canvas, size.width, size.height, candles, markers, lines, position, hover);
  }, [candles, markers, lines, position, hover, size]);

  return (
    <div ref={wrapRef} className="relative h-[420px] w-full sm:h-[520px]">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none"
        role="img"
        aria-label={`${symbol} 15 minute paper chart with swing markers, stop, and take profit`}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setHover({ x: event.clientX - rect.left, y: event.clientY - rect.top });
        }}
        onMouseLeave={() => setHover(null)}
      />
    </div>
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  candles: Candle[],
  markers: OverlayMarker[],
  lines: OverlayLine[],
  position: Position | null,
  hover: { x: number; y: number } | null,
) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);

  const pad = { left: 12, right: 74, top: 16, bottom: 28 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  if (plotW < 20 || plotH < 20 || candles.length === 0) return;

  const start = Math.max(0, candles.length - WINDOW);
  const visible = candles.slice(start);
  const indexByTime = new Map(visible.map((candle, index) => [candle.time, index]));
  let min = Infinity;
  let max = -Infinity;
  for (const candle of visible) {
    min = Math.min(min, candle.low);
    max = Math.max(max, candle.high);
  }
  if (position) {
    min = Math.min(min, position.stop, position.takeProfit, position.entry);
    max = Math.max(max, position.stop, position.takeProfit, position.entry);
  }
  const span = max - min || 1;
  const gutter = span * 0.12;
  min -= gutter;
  max += gutter;

  const xAt = (index: number) => pad.left + ((index + 0.5) * plotW) / visible.length;
  const yAt = (price: number) => pad.top + ((max - price) / (max - min)) * plotH;

  ctx.save();
  ctx.beginPath();
  ctx.rect(pad.left, pad.top, plotW, plotH);
  ctx.clip();

  ctx.strokeStyle = "#d0dae4";
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);
  for (let tick = 0; tick < 5; tick += 1) {
    const y = pad.top + (plotH * tick) / 4;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(pad.left + plotW, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const line of lines) {
    const points = line.points.filter((point) => indexByTime.has(point.time));
    if (points.length < 2) continue;
    ctx.beginPath();
    ctx.strokeStyle = line.color;
    ctx.lineWidth = line.width;
    ctx.setLineDash(line.dash ?? []);
    points.forEach((point, index) => {
      const x = xAt(indexByTime.get(point.time) ?? 0);
      const y = yAt(point.price);
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (position) {
    const entryIndex = indexByTime.get(position.openedAt);
    const x1 = entryIndex == null ? pad.left : xAt(entryIndex);
    drawLevel(ctx, x1, pad.left + plotW, yAt(position.entry), "#5d6b7a", [4, 3]);
    drawLevel(ctx, x1, pad.left + plotW, yAt(position.stop), "#a33b32", []);
    drawLevel(ctx, x1, pad.left + plotW, yAt(position.takeProfit), "#1f7a4d", []);
  }

  const slot = plotW / visible.length;
  const bodyW = Math.max(2.5, Math.min(11, slot * 0.62));
  for (let index = 0; index < visible.length; index += 1) {
    const candle = visible[index];
    const x = xAt(index);
    const bullish = candle.close >= candle.open;
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yAt(candle.high));
    ctx.lineTo(x, yAt(candle.low));
    ctx.stroke();
    const top = yAt(Math.max(candle.open, candle.close));
    const bottom = yAt(Math.min(candle.open, candle.close));
    const bodyH = Math.max(1, bottom - top);
    ctx.fillStyle = bullish ? "#f7fbff" : INK;
    ctx.fillRect(x - bodyW / 2, top, bodyW, bodyH);
    ctx.strokeRect(x - bodyW / 2, top, bodyW, bodyH);
  }

  for (const marker of markers) {
    const index = indexByTime.get(marker.time);
    if (index == null) continue;
    paintMarker(ctx, xAt(index), yAt(marker.price), marker);
  }

  ctx.restore();

  ctx.fillStyle = "#5c6b7a";
  ctx.font = "11px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  for (let tick = 0; tick < 5; tick += 1) {
    const price = max - ((max - min) * tick) / 4;
    const y = pad.top + (plotH * tick) / 4;
    ctx.fillText(formatPx(price), width - 8, y);
  }

  if (position) {
    paintTag(ctx, width - 8, yAt(position.takeProfit), "T/P", "#1f7a4d", "#e7f6ee");
    paintTag(ctx, width - 8, yAt(position.stop), "S/L", "#a33b32", "#fdeceb");
  }

  ctx.textBaseline = "top";
  ctx.fillStyle = "#5c6b7a";
  const labelAt = [0, Math.floor(visible.length / 3), Math.floor((visible.length * 2) / 3), visible.length - 1];
  const seen = new Set<number>();
  let lastLabelRight = -Infinity;
  for (const index of labelAt) {
    if (seen.has(index) || !visible[index]) continue;
    seen.add(index);
    const label = formatTime(visible[index].time);
    const labelWidth = ctx.measureText(label).width;
    let x = xAt(index);
    ctx.textAlign = "center";
    if (x - labelWidth / 2 < pad.left) {
      ctx.textAlign = "left";
      x = pad.left;
    } else if (x + labelWidth / 2 > pad.left + plotW) {
      ctx.textAlign = "right";
      x = pad.left + plotW;
    }
    const left = ctx.textAlign === "left" ? x : ctx.textAlign === "right" ? x - labelWidth : x - labelWidth / 2;
    const right = left + labelWidth;
    if (left < lastLabelRight + 10) continue;
    ctx.fillText(label, x, height - 18);
    lastLabelRight = right;
  }

  if (hover && hover.x >= pad.left && hover.x <= pad.left + plotW && hover.y >= pad.top && hover.y <= pad.top + plotH) {
    const price = max - ((hover.y - pad.top) / plotH) * (max - min);
    ctx.strokeStyle = "rgba(28, 25, 21, 0.35)";
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(hover.x, pad.top);
    ctx.lineTo(hover.x, pad.top + plotH);
    ctx.moveTo(pad.left, hover.y);
    ctx.lineTo(pad.left + plotW, hover.y);
    ctx.stroke();
    ctx.setLineDash([]);
    paintTag(ctx, width - 8, hover.y, formatPx(price), "#1c1915", "#ffffff");
  }
}

function drawLevel(
  ctx: CanvasRenderingContext2D,
  x1: number,
  x2: number,
  y: number,
  color: string,
  dash: number[],
) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.25;
  ctx.setLineDash(dash);
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function paintMarker(ctx: CanvasRenderingContext2D, x: number, y: number, marker: OverlayMarker) {
  const radius = marker.size === "md" ? 6.5 : 3.4;
  ctx.beginPath();
  if (marker.kind === "diamond") {
    ctx.moveTo(x, y - radius);
    ctx.lineTo(x + radius * 0.72, y);
    ctx.lineTo(x, y + radius);
    ctx.lineTo(x - radius * 0.72, y);
  } else {
    ctx.moveTo(x, y + radius * 0.85);
    ctx.lineTo(x + radius * 0.86, y - radius * 0.65);
    ctx.lineTo(x - radius * 0.86, y - radius * 0.65);
  }
  ctx.closePath();
  ctx.fillStyle = marker.tone === "blue" ? BLUE : RED;
  ctx.fill();
  if (marker.size === "md") {
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = "#ffffff";
    ctx.stroke();
  }
}

function paintTag(
  ctx: CanvasRenderingContext2D,
  right: number,
  y: number,
  text: string,
  color: string,
  background: string,
) {
  ctx.font = "11px ui-monospace, monospace";
  const width = ctx.measureText(text).width + 10;
  const height = 16;
  ctx.fillStyle = background;
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.fillRect(right - width, y - height / 2, width, height);
  ctx.strokeRect(right - width, y - height / 2, width, height);
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, right - width / 2, y + 0.5);
}
